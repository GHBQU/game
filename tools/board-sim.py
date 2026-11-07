#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
游戏厅 · 板子模拟器（在 PC 上模拟 ESP32 的整站服务）

和 esp32/main.py 走同一套路由：静态文件 + /api/*，并且同样会在返回 index.html
时把 <meta name="arcade-api"> 改写成 same-origin。所以在 PC 上测通了，
烧到板子上行为一致（差别只在传输层：这里是 http.server，板子上是裸 socket）。

用法：
    python3 tools/board-sim.py          # http://127.0.0.1:8080
    python3 tools/board-sim.py 9000
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(SITE, 'esp32'))

import arcade_core  # noqa: E402

STORE = arcade_core.Store(os.path.join(HERE, '.board-data'))
AUTH = arcade_core.Auth(STORE)

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
}


class Handler(BaseHTTPRequestHandler):
    server_version = 'arcade-board-sim/1.0'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        sys.stderr.write('[%s] %s\n' % (self.address_string(), fmt % args))

    def _json(self, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = 0
        if n <= 0:
            return {}
        try:
            obj = json.loads(self.rfile.read(n).decode('utf-8'))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path.startswith('/api/'):
            if path == '/api/health':
                return self._json(AUTH.health())
            if path == '/api/me':
                token = ''
                if '?' in self.path:
                    for pair in self.path.split('?', 1)[1].split('&'):
                        if pair.startswith('token='):
                            token = pair[6:]
                return self._json(AUTH.me(token))
            return self._json({'ok': False, 'msg': 'not found'})
        return self._static(path)

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        data = self._body()
        if path == '/api/register':
            return self._json(AUTH.register(data.get('name'), data.get('password'), data.get('invite', '')))
        if path == '/api/login':
            return self._json(AUTH.login(data.get('name'), data.get('password')))
        if path == '/api/invite':
            return self._json(AUTH.activate(data.get('token'), data.get('invite')))
        if path == '/api/logout':
            return self._json(AUTH.logout(data.get('token')))
        return self._json({'ok': False, 'msg': 'not found'})

    def _static(self, path):
        if '..' in path:
            return self.send_error(404)
        fs = os.path.join(SITE, path.lstrip('/'))
        if path.endswith('/') or os.path.isdir(fs):
            fs = os.path.join(fs, 'index.html')
        if not os.path.isfile(fs):
            return self.send_error(404)

        ext = os.path.splitext(fs)[1].lower()
        ctype = MIME.get(ext, 'application/octet-stream')

        if path in ('/', '') and fs.endswith('index.html'):
            # 与板子一致：把后端标记改写成同源
            with open(fs, 'r', encoding='utf-8') as f:
                html = f.read().replace('content="local"', 'content="same-origin"')
            body = html.encode('utf-8')
        else:
            with open(fs, 'rb') as f:
                body = f.read()

        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    httpd = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print('board sim on http://127.0.0.1:%d/  (site: %s)' % (port, SITE))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nbye')


if __name__ == '__main__':
    main()
