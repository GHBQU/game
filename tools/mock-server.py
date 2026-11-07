#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
游戏厅 · 本地模拟后端（PC 上跑，用来在 ESP32 到手前测通协议）

它加载的是 esp32/arcade_core.py —— 和板子上跑的是同一份业务逻辑，
只有外面的 HTTP 壳不同。所以这里测通了，板子上只需换 WiFi + socket 那层。

用法：
    python3 tools/mock-server.py            # 默认 0.0.0.0:8787
    python3 tools/mock-server.py 9000       # 换端口

接口：
    GET  /api/health
    POST /api/register   {name, password, invite}
    POST /api/login      {name, password}
    POST /api/invite     {token, invite}
    POST /api/logout     {token}
    GET  /api/me?token=...
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'esp32'))

import arcade_core  # noqa: E402

DATA_DIR = os.path.join(HERE, '.data')
STORE = arcade_core.Store(DATA_DIR)
AUTH = arcade_core.Auth(STORE)


class Handler(BaseHTTPRequestHandler):
    server_version = 'arcade-mock/1.0'
    protocol_version = 'HTTP/1.1'

    # ---- 工具 ----
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode('utf-8'))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _path(self):
        return self.path.split('?', 1)[0].rstrip('/') or '/'

    def _query(self):
        if '?' not in self.path:
            return {}
        out = {}
        for pair in self.path.split('?', 1)[1].split('&'):
            if '=' in pair:
                k, v = pair.split('=', 1)
                out[k] = v
        return out

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.address_string(), fmt % args))

    # ---- 路由 ----
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        path = self._path()
        if path == '/api/health':
            return self._send(200, AUTH.health())
        if path == '/api/me':
            token = self._query().get('token', '')
            return self._send(200, AUTH.me(token))
        return self._send(404, {'ok': False, 'msg': 'not found'})

    def do_POST(self):
        path = self._path()
        data = self._body()
        if path == '/api/register':
            return self._send(200, AUTH.register(
                data.get('name'), data.get('password'), data.get('invite', '')))
        if path == '/api/login':
            return self._send(200, AUTH.login(data.get('name'), data.get('password')))
        if path == '/api/invite':
            return self._send(200, AUTH.activate(data.get('token'), data.get('invite')))
        if path == '/api/logout':
            return self._send(200, AUTH.logout(data.get('token')))
        return self._send(404, {'ok': False, 'msg': 'not found'})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    httpd = HTTPServer(('0.0.0.0', port), Handler)
    print('mock backend on http://127.0.0.1:%d  (data: %s)' % (port, DATA_DIR))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nbye')


if __name__ == '__main__':
    main()
