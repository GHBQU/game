# -*- coding: utf-8 -*-
"""
游戏厅 · 板子主动出站的内网穿透
------------------------------------------------------------------
家里没有公网 IP，也不能让电脑常开，那就让板子自己往外连：

    板子 ──wss 出站──> 中继（Cloudflare Durable Object / 自建）
                       ↑
    手机 ──https/wss──┘

一条 TLS 长连接上跑多路复用，把外面的 HTTP 和 WebSocket 请求送到本地 8080。
握手只做一次（板上一次 ECDHE 要 0.3~1 秒），之后每个请求只多几毫秒。

帧格式（JSON 文本帧，body 一律 base64）：

    中继 → 板子   {t:'req',   id, method, path, headers, body}
                  {t:'wsopen',id, path, headers}
                  {t:'wsdata',id, b64}
                  {t:'wsclose',id}
                  {t:'ping'}
    板子 → 中继   {t:'hello', device, ver}
                  {t:'res',   id, status, headers, body}
                  {t:'wsok',  id}  /  {t:'wserr', id, msg}
                  {t:'wsdata',id, b64}
                  {t:'wsclose',id}
                  {t:'pong'}

PC 与板子共用同一份代码，所以能先在电脑上把链路跑通再刷板子。
"""

import binascii
import json
import os
import struct
import sys

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

import ssl

MICRO = False
try:
    MICRO = sys.implementation.name == 'micropython'
except Exception:
    pass

MAX_BODY = 512 * 1024      # 单帧上限；存档接口自己限 256KB，这里留一倍余量
PING_EVERY = 25            # 中继侧大约 100 秒空闲会断，25 秒心跳足够
PONG_TIMEOUT = 60

OP_TEXT = 0x1
OP_BIN = 0x2
OP_CLOSE = 0x8
OP_PING = 0x9
OP_PONG = 0xA


# ------------------------------------------------------------------ 编解码
def b64e(raw):
    out = binascii.b2a_base64(raw)
    if out.endswith(b'\n'):
        out = out[:-1]
    return out


def b64d(text):
    if isinstance(text, str):
        text = text.encode()
    return binascii.a2b_base64(text)


def _frame(op, payload):
    """客户端发出去的帧必须加掩码（RFC 6455 §5.3）。"""
    n = len(payload)
    if n < 126:
        head = struct.pack('>BB', 0x80 | op, 0x80 | n)
    elif n < 65536:
        head = struct.pack('>BBH', 0x80 | op, 0x80 | 126, n)
    else:
        head = struct.pack('>BBQ', 0x80 | op, 0x80 | 127, n)
    mask = os.urandom(4)
    masked = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
    return head + mask + masked


# ------------------------------------------------------------------ WS 客户端
class WSClient:
    def __init__(self, reader, writer, buf=b''):
        self.reader = reader
        self.writer = writer
        self.buf = buf
        self.closed = False

    async def _read(self, n):
        while len(self.buf) < n:
            chunk = await self.reader.read(n - len(self.buf))
            if not chunk:
                raise OSError('eof')
            self.buf += chunk
        out = self.buf[:n]
        self.buf = self.buf[n:]
        return out

    async def _write(self, op, payload):
        if self.closed:
            return False
        try:
            self.writer.write(_frame(op, payload))
            await self.writer.drain()
            return True
        except Exception:
            self.closed = True
            return False

    async def send(self, text):
        if isinstance(text, str):
            text = text.encode()
        return await self._write(OP_TEXT, text)

    async def recv(self):
        """返回一条文本消息；断开返回 None。"""
        if self.closed:
            return None
        try:
            while True:
                head = await self._read(2)
                op = head[0] & 0x0F
                masked = head[1] & 0x80
                length = head[1] & 0x7F
                if length == 126:
                    length = struct.unpack('>H', await self._read(2))[0]
                elif length == 127:
                    length = struct.unpack('>Q', await self._read(8))[0]
                if length > MAX_BODY:
                    await self.close()
                    return None
                mask = await self._read(4) if masked else b''
                payload = await self._read(length)
                if mask:
                    payload = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
                if op == OP_CLOSE:
                    self.closed = True
                    return None
                if op == OP_PING:
                    await self._write(OP_PONG, payload)
                    continue
                if op == OP_PONG:
                    continue
                return payload.decode('utf-8', 'replace')
        except Exception:
            self.closed = True
            return None

    async def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            self.writer.write(_frame(OP_CLOSE, struct.pack('>H', 1000)))
            await self.writer.drain()
        except Exception:
            pass
        try:
            self.writer.close()
        except Exception:
            pass


# ------------------------------------------------------------------ 连接
def _ssl_arg(host):
    if not MICRO:
        if hasattr(ssl, 'create_default_context'):
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            return ctx
        return False
    return True


async def _open(host, port, use_tls):
    if not use_tls:
        return await asyncio.open_connection(host, port)
    try:
        return await asyncio.open_connection(host, port, ssl=_ssl_arg(host),
                                            server_hostname=host)
    except TypeError:
        # 极老的固件不认这些关键字参数
        return await asyncio.open_connection(host, port)


async def _handshake(reader, writer, host, path):
    key = b64e(os.urandom(16)).decode()
    req = (
        'GET %s HTTP/1.1\r\n'
        'Host: %s\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        'Sec-WebSocket-Key: %s\r\n'
        'Sec-WebSocket-Version: 13\r\n\r\n' % (path, host, key)
    )
    writer.write(req.encode())
    await writer.drain()
    head = b''
    while b'\r\n\r\n' not in head:
        chunk = await reader.read(256)
        if not chunk:
            raise OSError('no handshake reply')
        head += chunk
        if len(head) > 4096:
            raise OSError('handshake too long')
    line = head.split(b'\r\n', 1)[0]
    if b' 101' not in line:
        raise OSError('relay refused: %s' % line.decode('utf-8', 'replace'))
    rest = head.split(b'\r\n\r\n', 1)[1]
    # 握手包里多读到的字节必须还给上层，否则第一条帧（比如 ready）会丢
    return WSClient(reader, writer, rest)


# ------------------------------------------------------------------ 本地请求
def _parse(resp):
    """把一条完整 HTTP 响应拆成 状态码/头/体。"""
    idx = resp.find(b'\r\n\r\n')
    if idx < 0:
        return 502, {}, resp
    head = resp[:idx].decode('utf-8', 'replace').split('\r\n')
    parts = head[0].split(' ')
    try:
        status = int(parts[1])
    except Exception:
        status = 502
    headers = {}
    for line in head[1:]:
        if ':' in line:
            k, v = line.split(':', 1)
            headers[k.strip().lower()] = v.strip()
    return status, headers, resp[idx + 4:]


async def _local_http(port, method, path, headers, body):
    reader, writer = await asyncio.open_connection('127.0.0.1', port)
    try:
        lines = ['%s %s HTTP/1.1' % (method, path),
                 'Host: 127.0.0.1:%d' % port,
                 'Connection: close']
        for k in headers:
            lk = k.lower()
            if lk in ('host', 'connection', 'content-length', 'transfer-encoding'):
                continue
            lines.append('%s: %s' % (k, headers[k]))
        lines.append('Content-Length: %d' % len(body))
        writer.write(('\r\n'.join(lines) + '\r\n\r\n').encode() + body)
        await writer.drain()

        chunks = b''
        while True:
            piece = await reader.read(2048)
            if not piece:
                break
            chunks += piece
            if len(chunks) > MAX_BODY:
                break
        return _parse(chunks)
    finally:
        try:
            writer.close()
        except Exception:
            pass


# ------------------------------------------------------------------ 转发
async def _serve_http(ws, mid, msg, port):
    try:
        body = b64d(msg.get('body') or '')
        status, headers, resp = await _local_http(
            port, msg.get('method', 'GET'), msg.get('path', '/'),
            msg.get('headers') or {}, body)
        out = {'t': 'res', 'id': mid, 'status': status,
               'headers': headers, 'body': b64e(resp[:MAX_BODY]).decode()}
    except Exception as e:
        out = {'t': 'res', 'id': mid, 'status': 502, 'headers': {},
               'body': '', 'err': str(e)[:120]}
    await ws.send(json.dumps(out))


async def _serve_ws(ws, mid, msg, port):
    path = msg.get('path', '/ws')
    lws = None
    try:
        reader, writer = await asyncio.open_connection('127.0.0.1', port)
        lws = await _handshake(reader, writer, '127.0.0.1:%d' % port, path)
        await ws.send(json.dumps({'t': 'wsok', 'id': mid}))
    except Exception as e:
        await ws.send(json.dumps({'t': 'wserr', 'id': mid, 'msg': str(e)[:120]}))
        return
    STREAMS[mid] = lws
    try:
        while True:
            text = await lws.recv()
            if text is None:
                break
            await ws.send(json.dumps({'t': 'wsdata', 'id': mid,
                                      'b64': b64e(text.encode()).decode()}))
    except Exception:
        pass
    finally:
        STREAMS.pop(mid, None)
        await ws.send(json.dumps({'t': 'wsclose', 'id': mid}))
        try:
            await lws.close()
        except Exception:
            pass


STREAMS = {}


# ------------------------------------------------------------------ 主循环
async def _session(cfg, port):
    host = cfg.get('relay_host') or ''
    rport = int(cfg.get('relay_port') or 443)
    use_tls = bool(cfg.get('relay_tls', True))
    path = cfg.get('relay_path') or '/__relay'
    token = cfg.get('relay_token') or ''
    device = cfg.get('relay_device') or 'arcade-board'
    if token:
        path += '?token=' + token + '&device=' + device

    reader, writer = await _open(host, rport, use_tls)
    ws = await _handshake(reader, writer, host, path)
    await ws.send(json.dumps({'t': 'hello', 'device': device, 'ver': 1}))
    print('[tunnel] 已连上中继 %s' % host)

    pong_at = [0]
    alive = [True]

    async def beat():
        while alive[0] and not ws.closed:
            await asyncio.sleep(PING_EVERY)
            if not alive[0]:
                break
            if pong_at[0] and _now() - pong_at[0] > PONG_TIMEOUT:
                print('[tunnel] 心跳超时，重连')
                try:
                    await ws.close()
                except Exception:
                    pass
                break
            await ws.send(json.dumps({'t': 'ping', 'ts': _now()}))

    task = asyncio.create_task(beat())
    try:
        while True:
            text = await ws.recv()
            if text is None:
                break
            try:
                msg = json.loads(text)
            except Exception:
                continue
            t = msg.get('t')
            if t == 'req':
                asyncio.create_task(_serve_http(ws, msg.get('id'), msg, port))
            elif t == 'wsopen':
                asyncio.create_task(_serve_ws(ws, msg.get('id'), msg, port))
            elif t == 'wsdata':
                lws = STREAMS.get(msg.get('id'))
                if lws is not None:
                    try:
                        await lws._write(OP_TEXT, b64d(msg.get('b64') or ''))
                    except Exception:
                        pass
            elif t == 'wsclose':
                lws = STREAMS.pop(msg.get('id'), None)
                if lws is not None:
                    try:
                        await lws.close()
                    except Exception:
                        pass
            elif t == 'ping':
                await ws.send(json.dumps({'t': 'pong'}))
            elif t == 'pong' or t == 'ready':
                pong_at[0] = _now()
    finally:
        alive[0] = False
        try:
            task.cancel()
        except Exception:
            pass
        for mid in list(STREAMS.keys()):
            lws = STREAMS.pop(mid, None)
            if lws is not None:
                try:
                    await lws.close()
                except Exception:
                    pass
        try:
            await ws.close()
        except Exception:
            pass


def _now():
    try:
        import time
        return int(time.time())
    except Exception:
        return 0


async def run(cfg, port):
    """断线重连：1→2→4→8→15→30 秒退避，永不放弃。"""
    if not cfg.get('relay_host'):
        return
    delay = 1
    while True:
        try:
            await _session(cfg, port)
            delay = 1
        except Exception as e:
            print('[tunnel] 断开: %s' % str(e)[:100])
        await asyncio.sleep(delay)
        delay = min(30, delay * 2)
