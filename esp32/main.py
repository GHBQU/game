# -*- coding: utf-8 -*-
"""
游戏厅 · ESP32 / MicroPython 整站服务
==================================================================
板子自己把主页 + 两个游戏 + 账号接口一起发出来，局域网内访问：

    http://<板子IP>/

账号存在板子的 flash 里（/data/accounts.json），不依赖任何电脑。
账号逻辑在 arcade_core.py，和 PC 上的模拟器用的是同一份代码。

------------------------------------------------------------------
烧录步骤（电脑上执行，一次性）：

    # 1. 装工具
    pip install esptool mpremote

    # 2. 刷 MicroPython 固件（4MB flash 的板子用这个）
    esptool.py --chip esp32 --port /dev/cu.usbserial-XXXX erase_flash
    esptool.py --chip esp32 --port /dev/cu.usbserial-XXXX \
        write_flash -z 0x1000 ESP32_GENERIC-20240602-v1.23.0.bin

    # 3. 传文件（在 game-site 目录下）
    mpremote connect /dev/cu.usbserial-XXXX fs mkdir :esp32
    mpremote connect /dev/cu.usbserial-XXXX fs cp esp32/main.py :main.py
    mpremote connect /dev/cu.usbserial-XXXX fs cp esp32/arcade_core.py :arcade_core.py
    mpremote connect /dev/cu.usbserial-XXXX fs cp index.html :index.html
    mpremote connect /dev/cu.usbserial-XXXX fs cp arcade.js :arcade.js
    mpremote connect /dev/cu.usbserial-XXXX fs cp holidays.js :holidays.js
    mpremote connect /dev/cu.usbserial-XXXX fs cp -r games :games

    # 4. 看串口打印的 IP
    mpremote connect /dev/cu.usbserial-XXXX repl

------------------------------------------------------------------
注意：/data 目录会在首次运行时自动创建。账号文件别手动改，格式坏了板子会
退回去读 accounts.json.tmp。
"""

import socket
import network
import time
import os

import arcade_core

# ---------------------------------------------------------------- 配置
WIFI_SSID = '你的WiFi名'
WIFI_PASS = '你的WiFi密码'
PORT = 80

# 静态文件根目录（板子 flash 根就是 '/'）
ROOT = '/'

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
}

store = arcade_core.Store('/data')
auth = arcade_core.Auth(store)


# ---------------------------------------------------------------- 工具
def send_all(conn, data):
    """MicroPython 的 send 可能只发一部分，循环发完。"""
    if isinstance(data, str):
        data = data.encode('utf-8')
    total = 0
    while total < len(data):
        total += conn.send(data[total:])


def mime_of(path):
    dot = path.rfind('.')
    if dot < 0:
        return 'application/octet-stream'
    return MIME.get(path[dot:].lower(), 'application/octet-stream')


def header(status, ctype, length=None, cors=False):
    text = 'HTTP/1.1 %s\r\n' % status
    text += 'Content-Type: %s\r\n' % ctype
    if length is not None:
        text += 'Content-Length: %d\r\n' % length
    text += 'Cache-Control: no-store\r\n'
    if cors:
        text += 'Access-Control-Allow-Origin: *\r\n'
        text += 'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n'
        text += 'Access-Control-Allow-Headers: Content-Type\r\n'
    text += 'Connection: close\r\n\r\n'
    return text


def send_json(conn, payload):
    body = arcade_core.json.dumps(payload)
    send_all(conn, header('200 OK', 'application/json; charset=utf-8', len(body.encode('utf-8')), True))
    send_all(conn, body)


def send_error(conn, code, text):
    body = text.encode('utf-8')
    send_all(conn, header('%d %s' % (code, 'Not Found' if code == 404 else 'Bad Request'),
                          'text/plain; charset=utf-8', len(body)))
    send_all(conn, body)


# ---------------------------------------------------------------- 请求解析
def read_request(conn):
    conn.settimeout(4)
    data = b''
    while b'\r\n\r\n' not in data:
        chunk = conn.recv(256)
        if not chunk:
            return None
        data += chunk
        if len(data) > 4096:
            return None

    head, _, rest = data.partition(b'\r\n\r\n')
    lines = head.split(b'\r\n')
    try:
        method, target, _ = lines[0].decode('utf-8').split(' ')
    except ValueError:
        return None

    headers = {}
    for line in lines[1:]:
        key, _, value = line.decode('utf-8').partition(':')
        headers[key.strip().lower()] = value.strip()

    try:
        length = int(headers.get('content-length') or 0)
    except ValueError:
        length = 0

    body = rest
    while len(body) < length:
        chunk = conn.recv(256)
        if not chunk:
            break
        body += chunk

    return {
        'method': method,
        'target': target,
        'path': target.split('?', 1)[0],
        'query': target.split('?', 1)[1] if '?' in target else '',
        'body': body[:length],
    }


def parse_json(raw):
    try:
        obj = arcade_core.json.loads(raw.decode('utf-8'))
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


def query_value(query, key):
    for pair in query.split('&'):
        if pair.startswith(key + '='):
            return pair[len(key) + 1:]
    return ''


# ---------------------------------------------------------------- 路由
def handle_api(conn, req):
    path = req['path']
    if req['method'] == 'OPTIONS':
        send_all(conn, header('204 No Content', 'text/plain', 0, True))
        return True

    if path == '/api/health':
        send_json(conn, auth.health())
        return True

    if path == '/api/me' and req['method'] == 'GET':
        send_json(conn, auth.me(query_value(req['query'], 'token')))
        return True

    if req['method'] != 'POST':
        send_json(conn, {'ok': False, 'msg': 'method not allowed'})
        return True

    data = parse_json(req['body'])

    if path == '/api/register':
        send_json(conn, auth.register(data.get('name'), data.get('password'), data.get('invite', '')))
    elif path == '/api/login':
        send_json(conn, auth.login(data.get('name'), data.get('password')))
    elif path == '/api/invite':
        send_json(conn, auth.activate(data.get('token'), data.get('invite')))
    elif path == '/api/logout':
        send_json(conn, auth.logout(data.get('token')))
    else:
        send_json(conn, {'ok': False, 'msg': 'not found'})
    return True


def resolve(path):
    if path in ('', '/'):
        return ROOT + 'index.html'
    if '..' in path:
        return None
    fs = ROOT + path.lstrip('/')
    if path.endswith('/'):
        fs += 'index.html'
    elif not os.path.exists(fs) and os.path.exists(fs + '/index.html'):
        fs = fs + '/index.html'
    return fs


def serve_static(conn, req):
    fs = resolve(req['path'])
    if not fs:
        send_error(conn, 404, 'not found')
        return
    try:
        size = os.stat(fs)[6]
    except OSError:
        send_error(conn, 404, 'not found')
        return

    # 主页需要把后端标记改写成同源，边读边改，不占内存
    if fs.endswith('index.html') and req['path'] in ('', '/'):
        send_all(conn, header('200 OK', MIME['.html']))
        with open(fs, 'r') as f:
            for line in f:
                if 'name="arcade-api"' in line:
                    line = line.replace('content="local"', 'content="same-origin"')
                send_all(conn, line)
        return

    send_all(conn, header('200 OK', mime_of(fs), size))
    with open(fs, 'rb') as f:
        while True:
            chunk = f.read(1024)
            if not chunk:
                break
            send_all(conn, chunk)


def handle(conn):
    try:
        req = read_request(conn)
        if not req:
            return
        if req['path'].startswith('/api/'):
            handle_api(conn, req)
        else:
            serve_static(conn, req)
    except Exception as exc:
        try:
            send_error(conn, 400, 'error: %s' % exc)
        except Exception:
            pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ---------------------------------------------------------------- 启动
def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        print('连接 WiFi:', WIFI_SSID)
        wlan.connect(WIFI_SSID, WIFI_PASS)
        waited = 0
        while not wlan.isconnected() and waited < 20:
            time.sleep(1)
            waited += 1
    if wlan.isconnected():
        ip = wlan.ifconfig()[0]
        print('=' * 40)
        print('游戏厅已启动： http://%s/' % ip)
        print('账号文件： /data/accounts.json')
        print('=' * 40)
    else:
        print('WiFi 连接失败，检查 SSID / 密码')
    return wlan.isconnected()


def main():
    connect_wifi()
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(('0.0.0.0', PORT))
    srv.listen(2)
    print('监听 %d 端口' % PORT)
    while True:
        try:
            conn, addr = srv.accept()
            handle(conn)
        except Exception as exc:
            print('accept 出错:', exc)
            time.sleep(0.5)


if __name__ == '__main__':
    main()
