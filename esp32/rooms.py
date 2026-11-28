# -*- coding: utf-8 -*-
"""
游戏厅 · 联机房间（ESP32 上的 WebSocket 房间服务）
------------------------------------------------------------------
协议和纸片勇者 / 暗夜幸存者现有的保持一致，客户端一行都不用改：

  客户端 → 服务端
    {"t":"ping","ts":123}            心跳，顺便测 RTT
    {"t":"create","name":"小明"}      建房，4 位房号
    {"t":"join","room":"K7QM","name":"小红"}
    {"t":"msg","d":{...}}            房间内广播（游戏自己的负载，服务端不解析）
    {"t":"leave"}

  服务端 → 客户端
    {"t":"pong","ts":123,"srv":毫秒}
    {"t":"joined","id":"a1b2c3","room":"K7QM","hostId":"a1b2c3","players":[...]}
    {"t":"peers","hostId":"...","players":[{"id","name","seat"}]}
    {"t":"msg","from":"a1b2c3","d":{...}}
    {"t":"left"}
    {"t":"err","msg":"..."}

延迟上的几个决定：
  · 消息只做一次 json 解析 + 一次重新编码，不做任何排队或节流
  · 广播用 write 一次写完再 drain，避免每个玩家一次 syscall
  · 握手时给 socket 关掉 Nagle（在 wsproto.handshake 里）
  · 房间全在内存里，不落 flash，避免读写文件带来的毫秒级抖动
"""

import json
import time

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


class Member:
    __slots__ = ('mid', 'name', 'seat', 'ws', 'last')

    def __init__(self, mid, name, seat, ws):
        self.mid = mid
        self.name = name
        self.seat = seat
        self.ws = ws
        self.last = time.time()


class Room:
    __slots__ = ('code', 'members', 'host', 'created')

    def __init__(self, code, host):
        self.code = code
        self.members = {}
        self.host = host
        self.created = time.time()


def _now_ms():
    try:
        return int(time.time() * 1000) & 0x7FFFFFFF
    except Exception:
        return 0


class Rooms:
    def __init__(self, max_players=8, max_rooms=16, idle=45):
        self.max_players = max_players
        self.max_rooms = max_rooms
        self.idle = idle
        self.rooms = {}
        self.seq = 0

    # ---------------- 小工具 ----------------
    def _new_code(self):
        # 用递增序号 + 时间散列，保证不重复又不依赖随机数
        self.seq = (self.seq + 1) & 0xFFFF
        seed = (int(time.time() * 1000) + self.seq * 7919) & 0x7FFFFFFF
        for _ in range(64):
            seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
            code = ''.join(CODE_ALPHABET[(seed >> (5 * i)) & 31] for i in range(4))
            if code not in self.rooms:
                return code
        return 'AAAA'

    def _new_id(self):
        self.seq = (self.seq + 1) & 0xFFFF
        seed = (int(time.time() * 1000000) ^ (self.seq << 13)) & 0xFFFFFF
        return '%06x' % seed

    def _peers(self, room):
        players = []
        for m in room.members.values():
            players.append({'id': m.mid, 'name': m.name, 'seat': m.seat})
        players.sort(key=lambda p: p['seat'])
        return {'t': 'peers', 'hostId': room.host, 'players': players}

    async def _send(self, member, payload):
        return await member.ws.send(payload)

    async def _broadcast(self, room, payload, skip=None):
        text = json.dumps(payload)
        dead = []
        for m in room.members.values():
            if skip is not None and m.mid == skip:
                continue
            if m.ws.closed:
                dead.append(m.mid)
                continue
            m.ws.writer.write(_frame_text(text))
        # 一次 drain，减少系统调用
        for m in room.members.values():
            if m.ws.closed:
                continue
            try:
                await m.ws.writer.drain()
            except Exception:
                dead.append(m.mid)
        for mid in dead:
            self._drop(room, mid, kill=True)

    def _drop(self, room, mid, kill=False):
        """把玩家从房间摘掉。

        kill=False 是「换房间」：连接还要继续用，绝不能标记成已关闭；
        kill=True 是「这条连接真的死了」：由调用方负责关掉。
        """
        m = room.members.pop(mid, None)
        if not m:
            return None
        if kill:
            try:
                m.ws.closed = True
            except Exception:
                pass
        if not room.members:
            self.rooms.pop(room.code, None)
            return m
        if room.host == mid:
            # 房主走了就把房主交给座位最小的那个人
            nxt = None
            for cand in room.members.values():
                if nxt is None or cand.seat < nxt.seat:
                    nxt = cand
            room.host = nxt.mid if nxt else ''
        return m

    # ---------------- 主循环 ----------------
    async def handle(self, ws):
        member = None
        room = None
        try:
            while True:
                raw = await ws.recv()
                if raw is None:
                    break
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                if not isinstance(msg, dict):
                    continue
                t = msg.get('t')

                if t == 'ping':
                    if member:
                        member.last = time.time()
                    await ws.send(json.dumps({'t': 'pong', 'ts': msg.get('ts', 0), 'srv': _now_ms()}))
                    continue

                if t == 'create':
                    if member and room:
                        self._drop(room, member.mid)
                        await self._broadcast(room, self._peers(room)) if room.members else None
                    if len(self.rooms) >= self.max_rooms:
                        await ws.send(json.dumps({'t': 'err', 'msg': '房间满了，等一会儿再建'}))
                        continue
                    code = self._new_code()
                    name = str(msg.get('name') or '玩家')[:12]
                    room = Room(code, '')
                    mid = self._new_id()
                    member = Member(mid, name, 0, ws)
                    room.members[mid] = member
                    room.host = mid
                    self.rooms[code] = room
                    await ws.send(json.dumps({
                        't': 'joined', 'id': mid, 'room': code,
                        'hostId': mid, 'players': [{'id': mid, 'name': name, 'seat': 0}],
                    }))
                    continue

                if t == 'join':
                    code = str(msg.get('room') or '').upper().strip()[:4]
                    target = self.rooms.get(code)
                    if not target:
                        await ws.send(json.dumps({'t': 'err', 'msg': '没有这个房间号'}))
                        continue
                    if len(target.members) >= self.max_players:
                        await ws.send(json.dumps({'t': 'err', 'msg': '房间满了'}))
                        continue
                    if member and room:
                        self._drop(room, member.mid)
                    room = target
                    used = set(m.seat for m in room.members.values())
                    seat = 0
                    while seat in used and seat < self.max_players:
                        seat += 1
                    name = str(msg.get('name') or '玩家')[:12]
                    mid = self._new_id()
                    member = Member(mid, name, seat, ws)
                    room.members[mid] = member
                    await ws.send(json.dumps({
                        't': 'joined', 'id': mid, 'room': room.code,
                        'hostId': room.host, 'players': [
                            {'id': m.mid, 'name': m.name, 'seat': m.seat}
                            for m in sorted(room.members.values(), key=lambda x: x.seat)
                        ],
                    }))
                    await self._broadcast(room, self._peers(room))
                    continue

                if t == 'msg':
                    if not member or not room:
                        await ws.send(json.dumps({'t': 'err', 'msg': '还没进房间'}))
                        continue
                    member.last = time.time()
                    d = msg.get('d')
                    if d is None:
                        continue
                    # 只做一次编码：直接把 d 塞进去，避免二次序列化
                    await self._broadcast(room, {'t': 'msg', 'from': member.mid, 'd': d}, skip=member.mid)
                    continue

                if t == 'leave':
                    if room and member:
                        self._drop(room, member.mid)
                        member = None
                        live = room
                        room = None
                        if live.members:
                            await self._broadcast(live, self._peers(live))
                    await ws.send(json.dumps({'t': 'left'}))
                    continue

                if t == 'stat':
                    await ws.send(json.dumps({
                        't': 'stat',
                        'rooms': [{'code': r.code, 'n': len(r.members)} for r in self.rooms.values()],
                    }))
                    continue

        except Exception:
            pass
        finally:
            if room and member:
                self._drop(room, member.mid, kill=True)
                if room.members:
                    try:
                        await self._broadcast(room, self._peers(room))
                    except Exception:
                        pass
            await ws.close()

    # ---------------- 兜底清理 ----------------
    async def janitor(self):
        """定时把长时间没动静的连接清掉，防止半开连接占着座位。"""
        while True:
            await asyncio.sleep(10)
            now = time.time()
            for code in list(self.rooms.keys()):
                room = self.rooms.get(code)
                if not room:
                    continue
                for m in list(room.members.values()):
                    if now - m.last > self.idle:
                        self._drop(room, m.mid, kill=True)
                        try:
                            await m.ws.close(1001)
                        except Exception:
                            pass
                if room.members:
                    try:
                        await self._broadcast(room, self._peers(room))
                    except Exception:
                        pass

    def stats(self):
        return {
            'rooms': len(self.rooms),
            'players': sum(len(r.members) for r in self.rooms.values()),
        }


def _frame_text(text):
    from wsproto import _frame, OP_TEXT
    return _frame(OP_TEXT, text.encode('utf-8'))
