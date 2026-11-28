#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
游戏厅 · 中继模拟器（PC 上用，代替 Cloudflare Durable Object）
------------------------------------------------------------------
干的事和真的中继一模一样：

  9100  /__relay   板子连进来（真机上这里是 wss）
  9101  /api/*     玩家请求 → 拆成帧 → 问板子要响应 → 回给玩家
  9101  /ws        WebSocket 整条透传

先跑这个 + tools/board-sim.py，能在电脑上把"外网访问内网板子"验证完，
再去写 relay.js、deploy、上板子。

    python3 tools/relay-sim.py            # 两个端口都用默认
    python3 tools/relay-sim.py 9100 9101
"""

import asyncio
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'esp32'))

import wsproto            # noqa: E402
import main as board      # noqa: E402  （借用它的 HTTP 请求解析）

BOARD_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9100
PUBLIC_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 9101

HOP = ('connection', 'keep-alive', 'transfer-encoding', 'upgrade',
       'content-length', 'date')


def b64e(raw):
    out = base64.b64encode(raw)
    return out.decode()


def b64d(text):
    return base64.b64decode(text or '')


class Hub:
    def __init__(self):
        self.board = None
        self.pending = {}          # mid -> Future（等板子回执）
        self.streams = {}          # mid -> 玩家侧 WS
        self.seq = 0
        self.requests = 0

    def mid(self):
        self.seq += 1
        return 'r%d' % self.seq

    async def send_board(self, payload):
        if self.board is None or self.board.closed:
            raise OSError('板子不在线')
        await self.board.send(json.dumps(payload))

    async def wait(self, mid, timeout=15):
        fut = asyncio.get_running_loop().create_future()
        self.pending[mid] = fut
        try:
            return await asyncio.wait_for(fut, timeout)
        finally:
            self.pending.pop(mid, None)


HUB = Hub()


# ---------------------------------------------------------------- 板子入口
async def serve_board(reader, writer):
    req = await board.read_request(reader)
    if not req:
        writer.close()
        return
    target = req['path'] + (('?' + req['query']) if req['query'] else '')
    if not target.startswith('/__relay'):
        writer.write(b'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n')
        await writer.drain()
        writer.close()
        return

    ws = await wsproto.handshake(reader, writer, req['headers'])
    if not ws:
        return
    token = ''
    if 'token=' in target:
        token = target.split('token=', 1)[1].split('&', 1)[0]
    if HUB.board is not None and not HUB.board.closed:
        # 同名只留一条：新连接踢掉旧的，避免重连留下幽灵
        try:
            await HUB.board.send(json.dumps({'t': 'err', 'msg': 'replaced'}))
            await HUB.board.close()
        except Exception:
            pass
    HUB.board = ws
    print('[relay] 板子已接入 token=%s' % (token or '(空)'))
    await ws.send(json.dumps({'t': 'ready'}))
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
            mid = msg.get('id')
            if t in ('res', 'wsok', 'wserr'):
                fut = HUB.pending.get(mid)
                if fut and not fut.done():
                    if t == 'wserr':
                        fut.set_exception(OSError(msg.get('msg', 'ws error')))
                    else:
                        fut.set_result(msg)
            elif t == 'wsdata':
                pws = HUB.streams.get(mid)
                if pws is not None:
                    try:
                        body = b64d(msg.get('b64')).decode('utf-8', 'replace')
                        await pws.send(body)
                    except Exception:
                        pass
            elif t == 'wsclose':
                pws = HUB.streams.pop(mid, None)
                if pws is not None:
                    try:
                        await pws.close()
                    except Exception:
                        pass
            elif t == 'ping':
                await ws.send(json.dumps({'t': 'pong'}))
            elif t == 'hello':
                print('[relay] 板子自报 %s' % msg.get('device'))
    except Exception as e:
        print('[relay] 板子连接出错: %s' % e)
    finally:
        HUB.board = None
        for mid in list(HUB.streams.keys()):
            pws = HUB.streams.pop(mid, None)
            if pws is not None:
                try:
                    await pws.close()
                except Exception:
                    pass
        print('[relay] 板子已断开')


# ---------------------------------------------------------------- 玩家入口
async def serve_public(reader, writer):
    req = await board.read_request(reader)
    if not req:
        try:
            writer.close()
        except Exception:
            pass
        return

    upgrade = req['headers'].get('upgrade', '').lower()
    if req['path'] == '/ws' and upgrade == 'websocket':
        await tunnel_ws(reader, writer, req)
        return

    target = req['path'] + (('?' + req['query']) if req['query'] else '')
    mid = HUB.mid()
    HUB.requests += 1
    try:
        await HUB.send_board({
            't': 'req', 'id': mid, 'method': req['method'], 'path': target,
            'headers': req['headers'], 'body': b64e(req['body']),
        })
        msg = await HUB.wait(mid)
    except Exception as e:
        body = ('relay: %s' % e).encode()
        writer.write(b'HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain;charset=utf-8\r\n'
                     + b'Access-Control-Allow-Origin: *\r\n'
                     + ('Content-Length: %d\r\n\r\n' % len(body)).encode() + body)
        await writer.drain()
        writer.close()
        return

    raw = b64d(msg.get('body'))
    status = int(msg.get('status') or 200)
    reason = {200: 'OK', 304: 'Not Modified', 400: 'Bad Request',
              401: 'Unauthorized', 404: 'Not Found', 409: 'Conflict',
              500: 'Internal Server Error', 502: 'Bad Gateway'}.get(status, 'OK')
    lines = ['HTTP/1.1 %d %s' % (status, reason)]
    for k in (msg.get('headers') or {}):
        if k.lower() in HOP:
            continue
        lines.append('%s: %s' % (k, msg['headers'][k]))
    lines.append('Access-Control-Allow-Origin: *')
    lines.append('Content-Length: %d' % len(raw))
    lines.append('Connection: close')
    head = ('\r\n'.join(lines) + '\r\n\r\n').encode()
    writer.write(head + (b'' if req['method'] == 'HEAD' else raw))
    await writer.drain()
    try:
        writer.close()
    except Exception:
        pass


async def tunnel_ws(reader, writer, req):
    mid = HUB.mid()
    try:
        await HUB.send_board({'t': 'wsopen', 'id': mid, 'path': req['path']})
        await HUB.wait(mid)
    except Exception as e:
        body = ('relay ws: %s' % e).encode()
        writer.write(b'HTTP/1.1 502 Bad Gateway\r\n'
                     + ('Content-Length: %d\r\n\r\n' % len(body)).encode() + body)
        await writer.drain()
        writer.close()
        return

    pws = await wsproto.handshake(reader, writer, req['headers'])
    if not pws:
        return
    HUB.streams[mid] = pws
    print('[relay] 玩家进入联机流 %s' % mid)
    try:
        while True:
            text = await pws.recv()
            if text is None:
                break
            await HUB.send_board({'t': 'wsdata', 'id': mid,
                                  'b64': b64e(text.encode())})
    except Exception:
        pass
    finally:
        HUB.streams.pop(mid, None)
        try:
            await HUB.send_board({'t': 'wsclose', 'id': mid})
        except Exception:
            pass


async def main():
    await asyncio.start_server(serve_board, '0.0.0.0', BOARD_PORT)
    await asyncio.start_server(serve_public, '0.0.0.0', PUBLIC_PORT)
    print('中继模拟器已启动')
    print('  板子接入  ws://127.0.0.1:%d/__relay' % BOARD_PORT)
    print('  公网入口  http://127.0.0.1:%d/' % PUBLIC_PORT)
    print('            ws://127.0.0.1:%d/ws' % PUBLIC_PORT)
    while True:
        await asyncio.sleep(3600)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print('\n停止')
