# -*- coding: utf-8 -*-
"""
游戏厅 · ESP32 / MicroPython 整站服务（单进程异步版）
==================================================================
一块板子把整站包圆：静态页面 + 账号 + 云存档 + 联机房间，同一个端口。

    http://<板子IP>/          游戏厅
    http://<板子IP>/ws        联机房间（WebSocket）
    http://<板子IP>/api/...   账号与存档

为什么用 asyncio 重写：
  · 原来的 accept → handle 是阻塞的，一个慢请求会把所有联机玩家卡住；
    联机要的是「谁发消息立刻转给谁」，不能被静态文件读取拖住。
  · 一条连接上复用多个请求（keep-alive），页面加载几十个 js 时少开几十次 TCP。
  · WebSocket 和 HTTP 跑在同一个事件循环里，转发一次只有一次 write + drain。

跑在 PC 上（和板子同一份代码）：
    python3 tools/board-sim.py            # 见 tools/board-sim.py

烧到板子：
    python3 tools/deploy.py --port /dev/cu.usbmodem14201
"""

import os
import re
import time

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

try:
    import network
except ImportError:
    network = None

import arcade_core
import wsproto
import rooms as roommod
import tunnel

try:
    import config as cfgmod
except ImportError:
    cfgmod = None

# ---------------------------------------------------------------- 基础配置
def _exists(path):
    """MicroPython 没有 os.path.exists，统一走 stat。"""
    try:
        os.stat(path)
        return True
    except OSError:
        return False


def _join(base, name):
    if not name:
        return base
    if name.startswith('/'):
        name = name[1:]
    if base.endswith('/'):
        return base + name
    return base + '/' + name


def _detect_root():
    # 板子上整个文件系统根目录就是站点根；PC 上是仓库根目录
    if _exists('/games') and _exists('/index.html'):
        return '/'
    here = os.path.dirname(os.path.abspath(__file__))
    return here + '/..'


ROOT = _detect_root()

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
}

CFG = cfgmod.load() if cfgmod else {}
PORT = int(CFG.get('port', 80))
MAX_BODY = 512 * 1024
HEAD_LIMIT = 8192

store = arcade_core.Store('/data' if network is not None else (
    (os.environ.get('ARCADE_DATA') if hasattr(os, 'environ') else '') or _join(ROOT, 'tools/.board-data')
))
auth = arcade_core.Auth(store)
progress = arcade_core.Progress(store, auth)
rooms = roommod.Rooms(
    max_players=int(CFG.get('max_players', 8)),
    max_rooms=int(CFG.get('max_rooms', 16)),
    idle=int(CFG.get('idle_timeout', 45)),
)


# ---------------------------------------------------------------- HTTP 小工具
def mime_of(path):
    dot = path.rfind('.')
    if dot < 0:
        return 'application/octet-stream'
    return MIME.get(path[dot:].lower(), 'application/octet-stream')


def header(status, ctype, length=None, cors=False, extra=''):
    text = 'HTTP/1.1 %s\r\n' % status
    text += 'Content-Type: %s\r\n' % ctype
    if length is not None:
        text += 'Content-Length: %d\r\n' % length
    text += extra
    if cors:
        text += 'Access-Control-Allow-Origin: *\r\n'
        text += 'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n'
        text += 'Access-Control-Allow-Headers: Content-Type, Authorization\r\n'
        text += 'Access-Control-Max-Age: 86400\r\n'
    return text.encode('utf-8')


async def send(writer, data):
    writer.write(data)
    await writer.drain()


async def send_json(writer, payload, cors=True):
    body = arcade_core.json.dumps(payload).encode('utf-8')
    await send(writer, header('200 OK', 'application/json; charset=utf-8', len(body), cors)
               + b'Cache-Control: no-store\r\nConnection: keep-alive\r\n\r\n' + body)


async def send_text(writer, code, text):
    body = text.encode('utf-8')
    await send(writer,
               header('%d %s' % (code, 'Not Found' if code == 404 else 'Bad Request'),
                      'text/plain; charset=utf-8', len(body),
                      extra='Connection: close\r\n\r\n') + body)


async def read_request(reader, timeout=10):
    """读一条完整的 HTTP 请求；对端关闭返回 None。"""
    try:
        line = await asyncio.wait_for(reader.readline(), timeout)
    except Exception:
        return None
    if not line:
        return None
    try:
        method, target, _ver = line.decode('utf-8').strip().split(' ')
    except Exception:
        return None

    headers = {}
    total = 0
    while True:
        hl = await asyncio.wait_for(reader.readline(), timeout)
        if not hl:
            return None
        total += len(hl)
        if total > HEAD_LIMIT:
            return None
        if hl in (b'\r\n', b'\n'):
            break
        text = hl.decode('utf-8', 'replace')
        key, _, value = text.partition(':')
        headers[key.strip().lower()] = value.strip()

    try:
        length = int(headers.get('content-length') or 0)
    except ValueError:
        length = 0
    if length > MAX_BODY:
        return None

    body = b''
    while len(body) < length:
        chunk = await asyncio.wait_for(reader.read(min(2048, length - len(body))), timeout)
        if not chunk:
            break
        body += chunk

    path, _, query = target.partition('?')
    return {
        'method': method.upper(),
        'path': path,
        'query': query,
        'headers': headers,
        'body': body,
        'keep': (headers.get('connection', 'keep-alive').lower() != 'close'),
    }


def query_value(query, key):
    for pair in query.split('&'):
        if pair.startswith(key + '='):
            raw = pair[len(key) + 1:]
            out = []
            i = 0
            while i < len(raw):
                if raw[i] == '%' and i + 2 < len(raw):
                    try:
                        out.append(chr(int(raw[i + 1:i + 3], 16)))
                        i += 3
                        continue
                    except ValueError:
                        pass
                out.append('+' if raw[i] == '+' else raw[i])
                i += 1
            return ''.join(out)
    return ''


def parse_json(raw):
    try:
        obj = arcade_core.json.loads(raw.decode('utf-8'))
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


# ---------------------------------------------------------------- API
async def handle_api(writer, req):
    path = req['path']
    if req['method'] == 'OPTIONS':
        await send(writer, header('204 No Content', 'text/plain', 0, True)
                   + b'Connection: keep-alive\r\n\r\n')
        return
    if path == '/api/health':
        payload = auth.health()
        payload['net'] = rooms.stats()
        payload['save'] = 'on-board'
        await send_json(writer, payload)
        return
    if path == '/api/net/stats':
        payload = {'ok': True}
        payload.update(rooms.stats())
        await send_json(writer, payload)
        return
    if path == '/api/me' and req['method'] == 'GET':
        await send_json(writer, auth.me(query_value(req['query'], 'token')))
        return

    data = parse_json(req['body'])
    token = data.get('token') or query_value(req['query'], 'token')

    if path == '/api/progress' and req['method'] == 'GET':
        await send_json(writer, progress.get(token, query_value(req['query'], 'game')))
        return
    if path == '/api/progress/list' and req['method'] == 'GET':
        await send_json(writer, progress.list_games(token))
        return
    if path == '/api/progress/all' and req['method'] == 'GET':
        await send_json(writer, progress.all(token))
        return
    if req['method'] != 'POST':
        await send_json(writer, {'ok': False, 'msg': 'method not allowed'})
        return

    if path == '/api/register':
        await send_json(writer, auth.register(data.get('name'), data.get('password'), data.get('invite', '')))
    elif path == '/api/login':
        await send_json(writer, auth.login(data.get('name'), data.get('password')))
    elif path == '/api/invite':
        await send_json(writer, auth.activate(data.get('token'), data.get('invite')))
    elif path == '/api/logout':
        await send_json(writer, auth.logout(data.get('token')))
    elif path == '/api/progress':
        await send_json(writer, progress.save(data, token))
    elif path == '/api/progress/delete':
        await send_json(writer, progress.delete(data, token))
    elif path == '/api/progress/bulk':
        await send_json(writer, progress.bulk(data, token))
    else:
        await send_json(writer, {'ok': False, 'code': '404', 'msg': 'not found'})


# ---------------------------------------------------------------- 静态文件
def resolve(path):
    if path in ('', '/'):
        return _join(ROOT, 'index.html')
    if '..' in path:
        return None
    fs = _join(ROOT, path)
    if path.endswith('/'):
        return _join(fs, 'index.html')
    if not _exists(fs) and _exists(_join(fs, 'index.html')):
        return _join(fs, 'index.html')
    return fs


async def stream_file(writer, fs):
    with open(fs, 'rb') as f:
        while True:
            chunk = f.read(2048)
            if not chunk:
                break
            writer.write(chunk)
            await writer.drain()


async def serve_static(writer, req):
    fs = resolve(req['path'])
    if not fs:
        await send_text(writer, 404, 'not found')
        return False
    try:
        st = os.stat(fs)
        size = st[6]
        mtime = int(st[8]) if len(st) > 8 else 0
    except OSError:
        await send_text(writer, 404, 'not found')
        return False

    is_index = req['path'] in ('', '/')
    etag = '"%x-%x"' % (size, mtime)
    ctype = mime_of(fs)
    if is_index:
        cache = 'Cache-Control: no-store\r\n'
    else:
        cache = 'Cache-Control: public, max-age=300\r\nETag: %s\r\n' % etag

    if not is_index and req['headers'].get('if-none-match') == etag:
        await send(writer, header('304 Not Modified', ctype, None,
                                 extra=cache + 'Connection: keep-alive\r\n\r\n'))
        return True

    if is_index:
        # 主页里 <meta name="arcade-api"> 的内容要改写成同源，边读边改不占内存。
        # 这一条没有 Content-Length，所以只能整条连接关掉（HTTP/1.1 下没长度就必须关）。
        await send(writer, header('200 OK', ctype,
                                 extra='Cache-Control: no-store\r\nConnection: close\r\n\r\n'))
        with open(fs, 'r') as f:
            for line in f:
                if 'name="arcade-api"' in line:
                    line = re.sub(r'content="[^"]*"', 'content="same-origin"', line)
                writer.write(line.encode('utf-8'))
                await writer.drain()
        return False

    await send(writer, header('200 OK', ctype, size,
                             extra=cache + 'Connection: keep-alive\r\n\r\n'))
    if req['method'] != 'HEAD':
        await stream_file(writer, fs)
    return True


# ---------------------------------------------------------------- 连接主流程
async def serve_conn(reader, writer):
    try:
        keepalive = int(CFG.get('keepalive', 12))
    except Exception:
        keepalive = 12
    served = 0
    try:
        while served < keepalive:
            req = await read_request(reader)
            if not req:
                break
            served += 1

            upgrade = req['headers'].get('upgrade', '').lower()
            if req['path'] == '/ws' and upgrade == 'websocket':
                ws = await wsproto.handshake(reader, writer, req['headers'])
                if ws:
                    await rooms.handle(ws)
                return

            if req['path'].startswith('/api/'):
                await handle_api(writer, req)
                if not req['keep']:
                    break
                continue

            if req['method'] not in ('GET', 'HEAD'):
                await send_text(writer, 400, 'method not allowed')
                return

            ok = await serve_static(writer, req)
            if not ok or not req['keep']:
                break
    except Exception:
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass
        try:
            await writer.wait_closed()
        except Exception:
            pass


# ---------------------------------------------------------------- 联网
def connect_wifi(cfg):
    if network is None:
        return True
    ssid = cfg.get('wifi_ssid', '')
    password = cfg.get('wifi_pass', '')
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        print('连接 WiFi:', ssid)
        try:
            wlan.connect(ssid, password)
        except Exception as exc:
            print('连接失败:', exc)
        waited = 0
        while not wlan.isconnected() and waited < 25:
            time.sleep(1)
            waited += 1

    if wlan.isconnected():
        ip = wlan.ifconfig()[0]
        print('=' * 46)
        print('游戏厅已启动   http://%s/' % ip)
        print('联机地址       ws://%s/ws' % ip)
        print('存档目录       /data/progress')
        print('=' * 46)
        try:
            import ntptime
            ntptime.settime()
            print('时间已校准')
        except Exception:
            print('时间没对上（存档版本号仍然单调递增，不影响用）')
        return True

    print('WiFi 没连上')
    if cfg.get('ap_fallback'):
        ap_ssid = cfg.get('ap_ssid', 'Arcade-Board')
        ap_pass = cfg.get('ap_pass', 'arcade1234')
        ap = network.WLAN(network.AP_IF)
        ap.active(True)
        try:
            ap.config(essid=ap_ssid, password=ap_pass)
        except Exception:
            pass
        print('已开热点 %s / %s' % (ap_ssid, ap_pass))
        print('连上后打开 http://%s/' % ap.ifconfig()[0])
    return False


async def main():
    if network is not None:
        connect_wifi(CFG)
    asyncio.create_task(rooms.janitor())
    if CFG.get('relay_enabled') and CFG.get('relay_host'):
        asyncio.create_task(tunnel.run(CFG, PORT))
        print('内网穿透已启用: %s' % CFG.get('relay_host'))
    await asyncio.start_server(serve_conn, '0.0.0.0', PORT, backlog=8)
    print('监听 %d 端口（静态 + /api + /ws）' % PORT)
    while True:
        await asyncio.sleep(3600)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print('停止')
