// 游戏厅 · 内网穿透中继（Cloudflare Worker + Durable Object）
// ---------------------------------------------------------------------------
// 家里没有公网 IP，板子主动连到这里，外部请求由这里转进去：
//
//   板子 ──wss /__relay──┐
//                        ├─ Durable Object（唯一舱位，board.ghbqu.dpdns.org）
//   玩家 ──https/wss ────┘
//
// 只用一条板子连接，多路复用；空闲时 DO 可以休眠，不计 duration，免费层够用。
// 帧格式与 esp32/tunnel.py 一一对应，改一边必须改另一边。

const TIMEOUT_MS = 15000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

function b64encode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function b64decode(str) {
  const bin = atob(str || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toB64(message) {
  if (typeof message === 'string') return b64encode(new TextEncoder().encode(message));
  return b64encode(new Uint8Array(message));
}

export class Relay {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.seq = 0;
    this.pending = new Map();   // id -> {resolve, reject, timer}
  }

  // 板子那条连接。对象休眠过后内存里的引用会没，靠 attachment 找回来。
  board() {
    for (const ws of this.state.getWebSockets()) {
      const meta = ws.deserializeAttachment && ws.deserializeAttachment();
      if (meta && meta.role === 'board') return ws;
    }
    return null;
  }

  players() {
    const out = [];
    for (const ws of this.state.getWebSockets()) {
      const meta = ws.deserializeAttachment && ws.deserializeAttachment();
      if (meta && meta.role === 'player') out.push({ ws, id: meta.id });
    }
    return out;
  }

  player(id) {
    for (const p of this.players()) if (p.id === id) return p.ws;
    return null;
  }

  wait(id, timeout = TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('board timeout'));
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); this.pending.delete(id); resolve(v); },
        reject: (e) => { clearTimeout(timer); this.pending.delete(id); reject(e); },
      });
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();

    if (url.pathname === '/__relay') return this.connectBoard(request);

    if (upgrade === 'websocket' && url.pathname === '/ws') return this.playerWs(request);

    if (url.pathname === '/__status') {
      const b = this.board();
      return json({ online: !!b, players: this.players().length });
    }

    if (url.pathname === '/health' || url.pathname === '/') {
      return json({ ok: true, service: 'arcade-relay', board: !!this.board(),
                    players: this.players().length });
    }

    return this.proxy(request, url);
  }

  // ---------------------------------------------------------------- 板子接入
  connectBoard(request) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const expect = this.env.RELAY_TOKEN || '';
    if (!expect || token !== expect) return json({ ok: false, error: 'bad token' }, 403);

    const old = this.board();
    if (old) { try { old.close(4000, 'replaced'); } catch (e) {} }

    const pair = new WebSocketPair();
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ role: 'board', device: url.searchParams.get('device') || '' });
    try { server.send(JSON.stringify({ t: 'ready' })); } catch (e) {}

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // ---------------------------------------------------------------- 玩家联机
  async playerWs(request) {
    const board = this.board();
    if (!board) return json({ ok: false, error: 'board offline' }, 503);

    const id = 'p' + (++this.seq);
    const pair = new WebSocketPair();
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ role: 'player', id });

    const ack = this.wait(id, 8000);
    board.send(JSON.stringify({ t: 'wsopen', id, path: '/ws' }));
    try {
      await ack;
    } catch (e) {
      try { server.close(1011, 'board unreachable'); } catch (err) {}
      return json({ ok: false, error: 'board unreachable' }, 502);
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // ---------------------------------------------------------------- HTTP 代理
  async proxy(request, url) {
    const board = this.board();
    if (!board) {
      return json({ ok: false, error: 'board offline' }, 503);
    }
    const id = 'r' + (++this.seq);
    const headers = {};
    for (const [k, v] of request.headers) {
      const lk = k.toLowerCase();
      if (lk === 'host' || lk === 'connection' || lk === 'content-length') continue;
      headers[lk] = v;
    }
    const bodyBuf = request.method === 'GET' || request.method === 'HEAD'
      ? new Uint8Array(0)
      : new Uint8Array(await request.arrayBuffer());

    const wait = this.wait(id);
    board.send(JSON.stringify({
      t: 'req', id, method: request.method,
      path: url.pathname + url.search, headers, body: b64encode(bodyBuf),
    }));

    let msg;
    try {
      msg = await wait;
    } catch (e) {
      return json({ ok: false, error: 'board timeout' }, 504);
    }

    const out = b64decode(msg.body);
    const resHeaders = new Headers();
    for (const k of Object.keys(msg.headers || {})) {
      const lk = k.toLowerCase();
      if (lk === 'connection' || lk === 'content-length' || lk === 'transfer-encoding') continue;
      resHeaders.set(k, msg.headers[k]);
    }
    resHeaders.set('access-control-allow-origin', '*');
    resHeaders.set('access-control-allow-headers', 'content-type');
    resHeaders.set('access-control-allow-methods', 'GET,POST,OPTIONS');
    return new Response(request.method === 'HEAD' ? null : out, {
      status: msg.status || 200,
      headers: resHeaders,
    });
  }

  // ---------------------------------------------------------------- 收发
  async webSocketMessage(ws, message) {
    const meta = ws.deserializeAttachment && ws.deserializeAttachment();
    if (!meta) return;

    // 玩家发来的：原样打包成帧送给板子
    if (meta.role === 'player') {
      const board = this.board();
      if (board) {
        board.send(JSON.stringify({ t: 'wsdata', id: meta.id, b64: toB64(message) }));
      }
      return;
    }

    if (meta.role !== 'board') return;

    let msg;
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch (e) {
      return;
    }

    if (msg.t === 'res' || msg.t === 'wsok' || msg.t === 'wserr') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.t === 'wserr') p.reject(new Error(msg.msg || 'ws error'));
      else p.resolve(msg);
      return;
    }

    if (msg.t === 'wsdata') {
      const player = this.player(msg.id);
      if (player) {
        try { player.send(b64decode(msg.b64)); } catch (e) {}
      }
      return;
    }

    if (msg.t === 'wsclose') {
      const player = this.player(msg.id);
      if (player) { try { player.close(1000, 'closed'); } catch (e) {} }
      return;
    }

    if (msg.t === 'ping') {
      try { ws.send(JSON.stringify({ t: 'pong' })); } catch (e) {}
    }
  }

  async webSocketClose(ws, code, reason) {
    const meta = ws.deserializeAttachment && ws.deserializeAttachment();
    if (!meta) return;
    if (meta.role === 'board') {
      for (const p of this.players()) {
        try { p.ws.close(1011, 'board gone'); } catch (e) {}
      }
      for (const id of [...this.pending.keys()]) {
        const p = this.pending.get(id);
        if (p) p.reject(new Error('board gone'));
      }
    } else if (meta.role === 'player') {
      const board = this.board();
      if (board) {
        try { board.send(JSON.stringify({ t: 'wsclose', id: meta.id })); } catch (e) {}
      }
    }
  }

  async webSocketError(ws, err) {
    await this.webSocketClose(ws, 1011, String(err));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        },
      });
    }

    const id = env.RELAY.idFromName('board');
    const stub = env.RELAY.get(id);
    return stub.fetch(request);
  },
};
