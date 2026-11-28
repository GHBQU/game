# -*- coding: utf-8 -*-
"""
游戏厅 · WebSocket 最小实现（服务端）
------------------------------------------------------------------
MicroPython 没有现成的 websocket 库，这里手写握手与帧编解码，
只覆盖浏览器会用到的部分：文本帧、ping/pong、close，不做扩展协商。

同一份代码在 CPython 上也能跑（asyncio 的 StreamReader/StreamWriter 两边一致），
所以能在电脑上把整站跑通再烧板子。
"""

import binascii
import hashlib
import struct

GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
MAX_FRAME = 512 * 1024      # 单帧上限，防止被一条大消息打爆内存

OP_CONT = 0x0
OP_TEXT = 0x1
OP_BIN = 0x2
OP_CLOSE = 0x8
OP_PING = 0x9
OP_PONG = 0xA


def accept_key(key):
    digest = hashlib.sha1((key + GUID).encode('utf-8')).digest()
    return binascii.b2a_base64(digest).decode('ascii').strip()


def _frame(op, payload):
    head = bytearray()
    head.append(0x80 | op)
    n = len(payload)
    if n < 126:
        head.append(n)
    elif n < 65536:
        head.append(126)
        head += struct.pack('>H', n)
    else:
        head.append(127)
        head += struct.pack('>Q', n)
    return bytes(head) + payload


class WS:
    """把一条已经完成握手的 TCP 连接包成消息收发器。"""

    def __init__(self, reader, writer):
        self.reader = reader
        self.writer = writer
        self.closed = False
        self.buf = b''

    # ---------------- 底层 ----------------
    async def _read(self, n):
        out = self.buf
        while len(out) < n:
            chunk = await self.reader.read(n - len(out))
            if not chunk:
                raise OSError('eof')
            out += chunk
        self.buf = b''
        return out

    async def recv(self):
        """返回一条文本消息；对端关闭或出错返回 None。"""
        if self.closed:
            return None
        try:
            while True:
                head = await self._read(2)
                fin = head[0] & 0x80
                op = head[0] & 0x0F
                masked = head[1] & 0x80
                length = head[1] & 0x7F
                if length == 126:
                    length = struct.unpack('>H', await self._read(2))[0]
                elif length == 127:
                    length = struct.unpack('>Q', await self._read(8))[0]
                if length > MAX_FRAME:
                    await self.close(1009)
                    return None
                mask = await self._read(4) if masked else b''
                payload = await self._read(length)
                if mask:
                    payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))

                if op == OP_CLOSE:
                    self.closed = True
                    return None
                if op == OP_PING:
                    await self._write(OP_PONG, payload)
                    continue
                if op == OP_PONG:
                    continue
                if op == OP_BIN:
                    # 游戏里用不到二进制，收到就直接丢
                    continue
                if op == OP_CONT:
                    self.buf = payload
                    return payload.decode('utf-8', 'replace')
                if not fin:
                    # 分片：把第一片存起来等后续（浏览器小消息不会走这里）
                    self.buf = payload
                    continue
                return payload.decode('utf-8', 'replace')
        except Exception:
            self.closed = True
            return None

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

    # ---------------- 对外 ----------------
    async def send(self, text):
        return await self._write(OP_TEXT, text.encode('utf-8'))

    async def close(self, code=1000):
        if self.closed:
            return
        self.closed = True
        try:
            self.writer.write(_frame(OP_CLOSE, struct.pack('>H', code)))
            await self.writer.drain()
        except Exception:
            pass
        try:
            await self.writer.wait_closed()
        except Exception:
            try:
                self.writer.close()
            except Exception:
                pass


async def handshake(reader, writer, headers):
    """读掉 HTTP 头之后调用：回 101 并返回 WS 对象。"""
    key = headers.get('sec-websocket-key', '')
    if not key:
        writer.write(b'HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
        await writer.drain()
        return None
    resp = (
        'HTTP/1.1 101 Switching Protocols\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        'Sec-WebSocket-Accept: %s\r\n\r\n' % accept_key(key)
    )
    writer.write(resp.encode('ascii'))
    await writer.drain()
    try:
        # 游戏要的是低延迟：关掉 Nagle，小包立刻发出去
        import socket as _socket
        sock = writer.get_extra_info('socket')
        if sock is not None:
            sock.setsockopt(_socket.IPPROTO_TCP, _socket.TCP_NODELAY, 1)
    except Exception:
        pass
    return WS(reader, writer)
