/* ============================================================
   Super Kart 8 — net.js
   联机核心：云服务账号 / 房间 / WebRTC 传输 / 比赛状态同步 / 插值
   ------------------------------------------------------------
   拓扑：房主星型。房主与每位玩家各建一条 RTCPeerConnection，
   两条 DataChannel：ev（可靠有序，用于房间与事件）与 st（不可靠，用于状态快照）。
   房主是唯一权威：跑 AI、汇总状态、下发快照、裁定名次。
   每位玩家只模拟自己的车（响应最快），远端车用插值渲染。
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const CFG = window.SK_CLOUD_CONFIG || {};

  /* ================= 常量 ================= */
  const STATE_HZ = 15;              // 快照频率
  const STATE_DT = 1 / STATE_HZ;
  const INTERP = 0.12;              // 远端插值延迟（秒）
  const MAX_EXTRAP = 0.35;          // 最多外推
  const BUF_KEEP = 14;              // 每辆车保留的快照数
  const ROOM_TTL_MS = 120000;       // 房间心跳超时
  const PLAYER_TTL_MS = 30000;      // 玩家心跳超时
  const SIGNAL_POLL_FAST = 420;     // 连接中轮询间隔
  const SIGNAL_POLL_SLOW = 1600;    // 已连接轮询间隔
  const SIGNAL_TTL_MS = 90000;

  const ICE = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.miwifi.com:3478' },
      { urls: 'stun:stun.chat.bilibili.com:3478' }
    ],
    iceCandidatePoolSize: 2
  };

  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /* ================= 小工具 ================= */
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _q1 = new THREE.Quaternion();

  const nowSec = () => performance.now() / 1000;
  const r2 = (n) => Math.round(n * 100) / 100;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const isFn = (f) => typeof f === 'function';

  function randCode(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
    return s;
  }

  /* ================= 事件总线 ================= */
  const listeners = Object.create(null);
  function on(ev, fn) {
    (listeners[ev] || (listeners[ev] = [])).push(fn);
    return () => off(ev, fn);
  }
  function off(ev, fn) {
    const a = listeners[ev];
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  function emit(ev, payload) {
    const a = listeners[ev];
    if (!a) return;
    for (let i = 0; i < a.length; i++) {
      try { a[i](payload); } catch (e) { console.error('[net]', e); }
    }
  }

  /* ============================================================
     一、云端：账号 + 房间表 + 信令表
     ============================================================ */
  class Cloud {
    constructor() {
      this.client = null;
      this.session = null;
      this.user = null;
      this.nick = '';
      this.playerId = null;
      this._init = null;
      this.lastError = null;
    }

    async init() {
      if (this.client) return this.client;
      if (this._init) return this._init;
      this._init = (async () => {
        if (!window.WorkBuddyCloud) throw new Error('云 SDK 未加载（lib/workbuddy-cloud.js）');
        if (!CFG.endpoint || !CFG.publishableKey) throw new Error('缺少云服务配置');
        this.client = window.WorkBuddyCloud.createWorkBuddyCloud({
          endpoint: CFG.endpoint,
          oauthRelayBaseUrl: CFG.oauthRelayBaseUrl,
          publishableKey: CFG.publishableKey
        });
        return this.client;
      })();
      return this._init;
    }

    get db() { return this.client.database; }
    get auth() { return this.client.auth; }
    get signedIn() { return !!this.session; }

    /** 处理 OAuth 回调 → 恢复会话。必须在任何路由守卫之前执行。 */
    async restore() {
      await this.init();
      const url = new URL(location.href);
      if (url.searchParams.has('code') || url.searchParams.has('error')) {
        const provider = url.searchParams.get('provider');
        if (provider === 'workbuddy' && isFn(this.auth.handleWorkBuddyCallback)) {
          try {
            const { data, error } = await this.auth.handleWorkBuddyCallback();
            if (error) this.lastError = error.message || '登录未完成';
            else if (data) {
              for (const k of ['code', 'state', 'provider']) url.searchParams.delete(k);
              history.replaceState(null, '', url.pathname + url.search + url.hash);
            }
          } catch (e) {
            this.lastError = e.message || String(e);
          }
        }
      }
      try {
        const { data, error } = await this.auth.getSession();
        if (!error && data) this._setSession(data);
      } catch (e) {
        this.lastError = e.message || String(e);
      }
      emit('auth', this.snapshot());
      return this.session;
    }

    _setSession(s) {
      this.session = s || null;
      this.user = (s && s.user) || null;
      const u = this.user || {};
      this.nick = u.name || u.nickname || u.displayName || '';
    }

    snapshot() {
      return {
        signedIn: this.signedIn,
        name: this.nick,
        playerId: this.playerId,
        error: this.lastError
      };
    }

    async signIn() {
      await this.init();
      const back = new URL(location.href);
      // 官方站点回调固定到根路径；GitHub Pages 等子路径部署要保留所在目录，
      // 否则 OAuth 回调会跳到用户站点根（通常是别人的主页 / 404）。
      let officialHost = '';
      try { officialHost = new URL(CFG.endpoint).hostname; } catch (e) { /* ignore */ }
      back.pathname = (officialHost && back.hostname === officialHost)
        ? '/'
        : back.pathname.replace(/[^/]*$/, '');
      for (const k of ['code', 'state', 'provider']) back.searchParams.delete(k);
      back.searchParams.set('mp', '1');          // 登录后直接回到联机大厅
      const { data, error } = await this.auth.signInWithOAuth({
        provider: 'workbuddy',
        redirectTo: back.toString()
      });
      if (error) throw new Error(error.message || '无法发起登录');
      if (!data || !data.url) throw new Error('登录地址无效');
      location.assign(data.url);
    }

    async signOut() {
      try { await this.auth.signOut(); } catch (e) { /* ignore */ }
      this.session = null; this.user = null; this.nick = ''; this.playerId = null;
      emit('auth', this.snapshot());
    }

    async _q(fn) {
      const { data, error } = await fn();
      if (error) throw error;
      return data;
    }

    /* ---------------- 房间 ---------------- */
    async listRooms() {
      const rooms = await this._q(() => this.db.from('sk_rooms')
        .select('code,name,owner_name,track_id,cc,laps,status,max_players,ai_fill,created_at,updated_at')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
        .limit(24));
      if (!rooms || !rooms.length) return [];
      const alive = rooms.filter(r => Date.now() - new Date(r.updated_at).getTime() < ROOM_TTL_MS);
      if (!alive.length) return [];
      const codes = alive.map(r => r.code);
      let players = [];
      try {
        players = await this._q(() => this.db.from('sk_room_players')
          .select('room_code,name,char_id,ready,is_host,slot,last_seen')
          .in('room_code', codes));
      } catch (e) { /* 房间刚被删掉也无所谓 */ }
      const by = {};
      for (const p of players || []) {
        if (Date.now() - new Date(p.last_seen).getTime() > PLAYER_TTL_MS) continue;
        (by[p.room_code] || (by[p.room_code] = [])).push(p);
      }
      return alive.map(r => Object.assign({}, r, { players: by[r.code] || [] }))
        .filter(r => r.players.length > 0);
    }

    async createRoom(opts) {
      const nick = (opts.name || this.nick || '玩家').slice(0, 12);
      let code = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const c = randCode(4);
        try {
          await this._q(() => this.db.from('sk_rooms').insert({
            code: c,
            name: (opts.roomName || (nick + '的房间')).slice(0, 20),
            owner_name: nick,
            track_id: opts.trackId,
            cc: opts.cc,
            laps: opts.laps,
            ai_fill: !!opts.aiFill,
            status: 'waiting'
          }).select());
          code = c;
          break;
        } catch (e) {
          if (e && (e.code === '23505' || /duplicate/i.test(e.message || ''))) continue;
          throw e;
        }
      }
      if (!code) throw new Error('房间号分配失败，请重试');
      const rows = await this._q(() => this.db.from('sk_room_players').insert({
        room_code: code,
        name: nick,
        char_id: opts.charId,
        slot: 0,
        ready: true,
        is_host: true
      }).select());
      this.playerId = rows && rows[0] && rows[0].player_id;
      return { code, playerId: this.playerId, name: nick };
    }

    async joinRoom(code, opts) {
      const room = await this._q(() => this.db.from('sk_rooms')
        .select('code,name,status,track_id,cc,laps,ai_fill,owner_name')
        .eq('code', code).maybeSingle());
      if (!room) throw new Error('房间不存在或已关闭');
      if (room.status !== 'waiting') throw new Error('这一局已经开始了');
      const ps = await this._q(() => this.db.from('sk_room_players')
        .select('player_id,slot,name,last_seen,is_host').eq('room_code', code));
      const live = (ps || []).filter(p => Date.now() - new Date(p.last_seen).getTime() < PLAYER_TTL_MS);
      const hostRow = live.find(p => p.is_host) || (ps || []).find(p => p.is_host);
      if (!hostRow) throw new Error('房间已关闭（找不到房主）');
      const used = new Set(live.map(p => p.slot));
      let slot = 0;
      while (used.has(slot)) slot++;
      if (slot >= 8) throw new Error('房间已满（8 人）');
      const nick = (opts.name || this.nick || '玩家').slice(0, 12);
      const rows = await this._q(() => this.db.from('sk_room_players').upsert({
        room_code: code,
        name: nick,
        char_id: opts.charId,
        slot,
        ready: false,
        is_host: false,
        last_seen: new Date().toISOString()
      }, { onConflict: 'room_code,player_id' }).select());
      this.playerId = rows && rows[0] && rows[0].player_id;
      return { room, playerId: this.playerId, slot, name: nick, hostId: hostRow.player_id };
    }

    async listPlayers(code) {
      try {
        return (await this._q(() => this.db.from('sk_room_players')
          .select('player_id,name,char_id,slot,ready,is_host,last_seen')
          .eq('room_code', code)
          .order('slot', { ascending: true }))) || [];
      } catch (e) { return []; }
    }

    async heartbeat(code, isHost) {
      if (!this.playerId) return;
      try {
        await this.db.from('sk_room_players')
          .update({ last_seen: new Date().toISOString() })
          .eq('room_code', code).eq('player_id', this.playerId);
        if (isHost) {
          await this.db.from('sk_rooms')
            .update({ updated_at: new Date().toISOString() })
            .eq('code', code);
        }
      } catch (e) { /* 心跳失败不致命 */ }
    }

    async setReady(code, ready, charId) {
      if (!this.playerId) return;
      try {
        await this.db.from('sk_room_players')
          .update({ ready: !!ready, char_id: charId, last_seen: new Date().toISOString() })
          .eq('room_code', code).eq('player_id', this.playerId);
      } catch (e) { /* ignore */ }
    }

    async setRoomSettings(code, s) {
      try {
        await this.db.from('sk_rooms').update({
          track_id: s.trackId, cc: s.cc, laps: s.laps, ai_fill: !!s.aiFill,
          status: s.status || 'waiting',
          updated_at: new Date().toISOString()
        }).eq('code', code);
      } catch (e) { /* ignore */ }
    }

    async leaveRoom(code, isHost) {
      if (!this.playerId) return;
      try {
        await this.db.from('sk_room_players').delete()
          .eq('room_code', code).eq('player_id', this.playerId);
      } catch (e) { /* ignore */ }
      if (isHost) {
        try { await this.db.from('sk_rooms').delete().eq('code', code); } catch (e) { /* ignore */ }
      }
      this.playerId = null;
    }

    /* ---------------- 信令 ---------------- */
    async sendSignal(code, toId, kind, payload) {
      const { error } = await this.db.from('sk_signals').insert({
        room_code: code, to_id: toId, kind, payload: JSON.stringify(payload || {})
      });
      if (error) throw error;
    }

    async pollSignals(since) {
      try {
        return (await this._q(() => this.db.from('sk_signals')
          .select('id,from_id,kind,payload')
          .eq('to_id', this.playerId)
          .gt('id', since)
          .order('id', { ascending: true })
          .limit(40))) || [];
      } catch (e) { return []; }
    }

    async purgeSignals() {
      try {
        await this.db.from('sk_signals').delete()
          .eq('from_id', this.playerId)
          .lt('created_at', new Date(Date.now() - SIGNAL_TTL_MS).toISOString());
      } catch (e) { /* ignore */ }
    }

    /** 结算落库（个人成绩，公开可查） */
    async saveResult(row) {
      try {
        await this.db.from('sk_results').insert({
          room_code: row.roomCode || '',
          track_id: row.trackId,
          player_name: row.name,
          char_id: row.charId,
          position: row.pos,
          total_ms: row.totalMs | 0,
          best_lap_ms: row.bestMs | 0,
          cc: row.cc,
          laps: row.laps
        });
      } catch (e) { /* 落库失败不影响比赛 */ }
    }

    async leaderboard(trackId, limit) {
      try {
        return (await this._q(() => this.db.from('sk_results')
          .select('player_name,char_id,position,total_ms,best_lap_ms,cc,created_at')
          .eq('track_id', trackId).eq('cc', 100)
          .order('total_ms', { ascending: true })
          .limit(limit || 8))) || [];
      } catch (e) { return []; }
    }
  }

  /* ============================================================
     二、传输层
     ============================================================ */
  function waitIce(pc, timeout) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      const check = () => { if (pc.iceGatheringState === 'complete') finish(); };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(finish, timeout || 3500);
    });
  }

  class PeerLink {
    constructor(id) {
      this.id = id;
      this.pc = new RTCPeerConnection(ICE);
      this.ev = null;
      this.st = null;
      this.open = false;
      this.closed = false;
      this.lastRecv = nowSec();
      this.pc.onconnectionstatechange = () => {
        const s = this.pc.connectionState;
        if (s === 'failed' || s === 'closed') this.closed = true;
      };
    }

    bind(ch) {
      if (ch.label === 'ev') {
        this.ev = ch;
        ch.onopen = () => {
          this.open = true;
          if (this.onOpen) this.onOpen(this);
        };
        ch.onclose = () => { this.open = false; this.closed = true; };
      } else if (ch.label === 'st') {
        this.st = ch;
      }
      ch.onmessage = (e) => {
        this.lastRecv = nowSec();
        if (this.onData) this.onData(this, e.data, ch.label === 'ev');
      };
    }

    send(obj, reliable) {
      const ch = reliable ? this.ev : (this.st || this.ev);
      if (!ch || ch.readyState !== 'open') return false;
      try {
        ch.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
        return true;
      } catch (e) {
        return false;
      }
    }

    close() {
      this.closed = true;
      try { this.pc.close(); } catch (e) { /* ignore */ }
    }
  }

  /** 云端信令传输：房主轮询 offer，玩家轮询 answer */
  class CloudTransport {
    constructor(o) {
      this.code = o.code;
      this.role = o.role;
      this.selfId = o.selfId;
      this.hostId = o.hostId;
      this.cloud = o.cloud;
      this.peers = new Map();
      this.onPeer = null;
      this.onMessage = null;
      this.onPeerGone = null;
      this.since = 0;
      this.alive = true;
      this._timer = null;
      this._busy = false;
    }

    start() {
      this._loop();
    }

    _anyConnecting() {
      if (this.role === 'guest') {
        const l = this.peers.get(this.hostId);
        return !l || !l.open;
      }
      for (const p of this.peers.values()) if (!p.open) return true;
      return false;
    }

    async _loop() {
      if (!this.alive) return;
      let delay = SIGNAL_POLL_FAST;
      try {
        await this._poll();
        delay = this._anyConnecting() ? SIGNAL_POLL_FAST : SIGNAL_POLL_SLOW;
      } catch (e) {
        delay = 1200;
      }
      if (!this.alive) return;
      this._timer = setTimeout(() => this._loop(), delay);
    }

    async _poll() {
      if (this._busy) return;
      this._busy = true;
      let rows = [];
      try {
        rows = await this.cloud.pollSignals(this.since);
      } finally {
        this._busy = false;
      }
      for (const row of rows) {
        if (row.id > this.since) this.since = row.id;
        let payload = {};
        try { payload = row.payload ? JSON.parse(row.payload) : {}; } catch (e) { payload = {}; }
        if (this.role === 'host') {
          if (row.kind === 'offer') await this._accept(row.from_id, payload);
          else if (row.kind === 'bye') this._dropPeer(row.from_id);
        } else {
          if (row.kind === 'answer') await this._applyAnswer(payload);
          else if (row.kind === 'bye') this._hostGone();
        }
      }
      // 随机清理自己发出的旧信令
      if (Math.random() < 0.08) this.cloud.purgeSignals();
    }

    async _accept(fromId, payload) {
      if (this.peers.has(fromId)) {
        const old = this.peers.get(fromId);
        if (old.open) return;         // 重复投递的 offer 直接忽略
        old.close();
        this.peers.delete(fromId);
      }
      const link = new PeerLink(fromId);
      link.onData = (l, data, reliable) => { if (this.onMessage) this.onMessage(l.id, data, reliable); };
      link.onOpen = (l) => { if (this.onPeer) this.onPeer(l.id, l); };
      link.pc.ondatachannel = (e) => link.bind(e.channel);
      this.peers.set(fromId, link);
      try {
        await link.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
        const answer = await link.pc.createAnswer();
        await link.pc.setLocalDescription(answer);
        await waitIce(link.pc);
        await this.cloud.sendSignal(this.code, fromId, 'answer', { sdp: link.pc.localDescription.sdp });
      } catch (e) {
        console.warn('[net] accept failed', e && e.message);
      }
    }

    async _applyAnswer(payload) {
      const link = this.peers.get(this.hostId);
      if (!link || link.open) return;
      try {
        await link.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      } catch (e) {
        console.warn('[net] answer failed', e && e.message);
      }
    }

    _dropPeer(id) {
      const link = this.peers.get(id);
      if (link) { link.close(); this.peers.delete(id); }
      if (this.onPeerGone) this.onPeerGone(id);
    }

    _hostGone() {
      if (this.onPeerGone) this.onPeerGone(this.hostId);
    }

    connect() {
      // 玩家主动向房主发 offer
      const link = new PeerLink(this.hostId);
      link.onData = (l, data, reliable) => { if (this.onMessage) this.onMessage(l.id, data, reliable); };
      link.onOpen = (l) => { if (this.onPeer) this.onPeer(l.id, l); };
      link.bind(link.pc.createDataChannel('ev', { ordered: true }));
      link.bind(link.pc.createDataChannel('st', { ordered: false, maxRetransmits: 0 }));
      this.peers.set(this.hostId, link);
      return (async () => {
        const offer = await link.pc.createOffer();
        await link.pc.setLocalDescription(offer);
        await waitIce(link.pc);
        await this.cloud.sendSignal(this.code, this.hostId, 'offer', { sdp: link.pc.localDescription.sdp });
      })();
    }

    sendTo(id, msg, reliable) {
      const link = this.peers.get(id);
      if (!link) return false;
      return link.send(msg, reliable !== false);
    }

    broadcast(msg, reliable) {
      let n = 0;
      for (const link of this.peers.values()) if (link.send(msg, reliable !== false)) n++;
      return n;
    }

    peerIds() { return Array.from(this.peers.keys()); }

    close() {
      this.alive = false;
      if (this._timer) clearTimeout(this._timer);
      for (const l of this.peers.values()) l.close();
      this.peers.clear();
    }
  }

  /** 同浏览器多标签本地联机（调试 / 断网演示）：BroadcastChannel 模拟 DataChannel */
  class LocalTransport {
    constructor(o) {
      this.code = o.code;
      this.role = o.role;
      this.selfId = o.selfId;
      this.hostId = o.hostId;
      this.onPeer = null;
      this.onMessage = null;
      this.onPeerGone = null;
      this.peers = new Map();
      this.ch = new BroadcastChannel('sk-lan-' + o.code);
      this.alive = true;
      this.ch.onmessage = (e) => this._recv(e.data);
    }

    start() {
      if (this.role === 'guest') {
        setTimeout(() => {
          if (!this.alive) return;
          this.peers.set(this.hostId, { id: this.hostId, open: true });
          if (this.onPeer) this.onPeer(this.hostId, null);
        }, 60);
      }
    }

    connect() { /* 本地传输无需握手 */ }

    _recv(m) {
      if (!this.alive || !m) return;
      if (m.from === this.selfId) return;
      if (m.to !== this.selfId) return;
      if (!this.peers.has(m.from)) {
        this.peers.set(m.from, { id: m.from, open: true });
        if (this.onPeer) this.onPeer(m.from, null);
      }
      if (m.kind === 'bye') {
        this.peers.delete(m.from);
        if (this.onPeerGone) this.onPeerGone(m.from);
        return;
      }
      if (this.onMessage) this.onMessage(m.from, m.data, m.reliable !== false);
    }

    sendTo(id, msg, reliable) {
      if (!this.alive) return false;
      try {
        this.ch.postMessage({ to: id, from: this.selfId, kind: 'msg', data: msg, reliable: reliable !== false });
        return true;
      } catch (e) { return false; }
    }

    broadcast(msg, reliable) {
      let n = 0;
      for (const id of this.peers.keys()) if (this.sendTo(id, msg, reliable)) n++;
      return n;
    }

    peerIds() { return Array.from(this.peers.keys()); }

    close() {
      this.alive = false;
      for (const id of this.peers.keys()) {
        try { this.ch.postMessage({ to: id, from: this.selfId, kind: 'bye' }); } catch (e) { /* ignore */ }
      }
      this.peers.clear();
      try { this.ch.close(); } catch (e) { /* ignore */ }
    }
  }

  /* ============================================================
     三、比赛状态同步
     ============================================================ */
  const F_DRIFT = 3;
  const F_BOOST = 4;
  const F_STAR = 8;
  const F_SPIN = 16;
  const F_OFFROAD = 32;
  const F_FINISH = 64;
  const F_RESCUE = 128;
  const F_GLIDER = 256;
  const F_SHRINK = 512;
  const F_AIR = 1024;

  function packKart(k) {
    const d = k.drift;
    let flags = 0;
    if (d.active) flags |= d.dir > 0 ? 2 : 1;
    if (k.boostTime > 0) flags |= F_BOOST;
    if (k.starTimer > 0) flags |= F_STAR;
    if (k.spinTimer > 0) flags |= F_SPIN;
    if (k.offroadTimer > 0.15) flags |= F_OFFROAD;
    if (k.finished) flags |= F_FINISH;
    if (k.rescueActive) flags |= F_RESCUE;
    if (k.glider > 0) flags |= F_GLIDER;
    if (k.shrinkTimer > 0) flags |= F_SHRINK;
    if (!k.onGround) flags |= F_AIR;
    return [
      r2(k.pos.x), r2(k.pos.y), r2(k.pos.z),
      r3(k.forward.x), r3(k.forward.y), r3(k.forward.z),
      r3(k.up.x), r3(k.up.y), r3(k.up.z),
      r2(k.speed), r2(k.totalDist), k.lap | 0, flags,
      k.finished ? r2(k.finishTime) : -1
    ];
  }

  function unpackState(v) {
    return {
      p: [v[0], v[1], v[2]],
      f: [v[3], v[4], v[5]],
      u: [v[6], v[7], v[8]],
      sp: v[9], dist: v[10], lap: v[11], flags: v[12], ft: v[13]
    };
  }

  class RaceSync {
    constructor(o) {
      this.transport = o.transport;
      this.isHost = !!o.isHost;
      this.selfId = o.selfId;
      this.hostId = o.hostId;
      this.roster = o.roster || [];
      this.index = new Map();
      this.roster.forEach((r, i) => this.index.set(r.id, i));
      this.localIdx = this.index.has(this.selfId) ? this.index.get(this.selfId) : 0;
      this.n = this.roster.length;

      this.buf = new Array(this.n);
      this.latest = new Array(this.n);
      for (let i = 0; i < this.n; i++) { this.buf[i] = []; this.latest[i] = null; }

      this.lastSend = 0;
      this.lastRecv = nowSec();
      this.hostClock = 0;
      this.ping = 0;
      this.finishedOrder = [];
      this.results = null;
      this.onEvent = null;        // (kind, data, fromId)
      this.onResults = null;
      this.onDisconnect = null;
      this.deadPeers = new Set();
      this.clockOffset = 0;
      this.started = true;
      this._pending = [];
    }

    /* ---- 时钟：hostTime ≈ localTime + offset ---- */
    now() { return nowSec() + this.clockOffset; }

    sendEvent(kind, data) {
      const msg = { t: 'ev', kind, data: data || {}, from: this.selfId };
      if (this.isHost) this.transport.broadcast(msg, true);
      else this.transport.sendTo(this.hostId, msg, true);
    }

    /** 房主把事件转发给所有人（含来源） */
    relay(kind, data, fromId) {
      if (!this.isHost) return;
      this.transport.broadcast({ t: 'ev', kind, data: data || {}, from: fromId }, true);
    }

    /* ---- 每帧 ---- */
    update(game, dt) {
      const now = nowSec();
      const local = game.player;
      if (!local) return;

      if (this.isHost) {
        // 房主：本机车辆（自己 + AI）直接读实时状态
        for (let i = 0; i < game.karts.length; i++) {
          const k = game.karts[i];
          if (k.isRemote) continue;
          this.latest[i] = packKart(k);
        }
        if (now - this.lastSend >= STATE_DT) {
          this.lastSend = now;
          const out = [Math.round(now * 1000)];
          for (let i = 0; i < this.n; i++) {
            const v = this.latest[i];
            if (v) for (let j = 0; j < 14; j++) out.push(v[j]);
            else for (let j = 0; j < 14; j++) out.push(0);
          }
          this.transport.broadcast(out, false);
        }
      } else {
        if (now - this.lastSend >= STATE_DT) {
          this.lastSend = now;
          this.transport.sendTo(this.hostId, packKart(local), false);
        }
      }

      // 远端插值
      const renderTime = now - INTERP;
      for (let i = 0; i < game.karts.length; i++) {
        const k = game.karts[i];
        if (!k.isRemote) continue;
        const s = this.sample(i, renderTime);
        if (s) this.apply(k, s, dt);
      }

      // 断线检测
      if (now - this.lastRecv > 6 && this.onDisconnect) this.onDisconnect();
    }

    sample(i, time) {
      const b = this.buf[i];
      if (!b.length) return this.latest[i] ? unpackState(this.latest[i]) : null;
      if (time <= b[0].t) return b[0];
      for (let j = b.length - 1; j >= 0; j--) {
        if (b[j].t <= time) {
          const a = b[j];
          const n = b[j + 1];
          if (!n) {
            // 外推：沿前向按当前速度走
            const dt = Math.min(MAX_EXTRAP, time - a.t);
            const sp = a.sp;
            return {
              p: [a.p[0] + a.f[0] * sp * dt, a.p[1] + a.f[1] * sp * dt, a.p[2] + a.f[2] * sp * dt],
              f: a.f, u: a.u, sp: a.sp, dist: a.dist, lap: a.lap, flags: a.flags, ft: a.ft
            };
          }
          const k = (time - a.t) / Math.max(0.001, n.t - a.t);
          return {
            p: [a.p[0] + (n.p[0] - a.p[0]) * k, a.p[1] + (n.p[1] - a.p[1]) * k, a.p[2] + (n.p[2] - a.p[2]) * k],
            f: [a.f[0] + (n.f[0] - a.f[0]) * k, a.f[1] + (n.f[1] - a.f[1]) * k, a.f[2] + (n.f[2] - a.f[2]) * k],
            u: [a.u[0] + (n.u[0] - a.u[0]) * k, a.u[1] + (n.u[1] - a.u[1]) * k, a.u[2] + (n.u[2] - a.u[2]) * k],
            sp: a.sp + (n.sp - a.sp) * k,
            dist: a.dist + (n.dist - a.dist) * k,
            lap: k > 0.5 ? n.lap : a.lap,
            flags: k > 0.5 ? n.flags : a.flags,
            ft: n.ft > 0 ? n.ft : a.ft
          };
        }
      }
      return b[0];
    }

    apply(k, s, dt) {
      k.pos.set(s.p[0], s.p[1], s.p[2]);
      k.forward.set(s.f[0], s.f[1], s.f[2]);
      k.up.set(s.u[0], s.u[1], s.u[2]);
      if (k.forward.lengthSq() < 1e-6) k.forward.set(0, 0, -1); else k.forward.normalize();
      if (k.up.lengthSq() < 1e-6) k.up.set(0, 1, 0); else k.up.normalize();
      k.speed = s.sp;
      k.totalDist = s.dist;
      k.lap = s.lap;
      const f = s.flags;
      const drift = f & F_DRIFT;
      k.drift.active = drift !== 0;
      k.drift.dir = drift === 2 ? 1 : -1;
      if (drift) k.drift.charge = Math.max(k.drift.charge, 1.6);
      k.boostTime = (f & F_BOOST) ? Math.max(k.boostTime, 0.18) : 0;
      k.starTimer = (f & F_STAR) ? Math.max(k.starTimer, 0.2) : 0;
      k.spinTimer = (f & F_SPIN) ? Math.max(k.spinTimer, 0.2) : 0;
      k.offroadTimer = (f & F_OFFROAD) ? Math.max(k.offroadTimer, 0.2) : 0;
      k.shrinkTimer = (f & F_SHRINK) ? Math.max(k.shrinkTimer, 0.2) : 0;
      k.onGround = !(f & F_AIR);
      k.glider = (f & F_GLIDER) ? 1 : 0;
      if (k.gliderMesh) k.gliderMesh.visible = !!k.glider;
      if (f & F_FINISH) { k.finished = true; if (s.ft > 0) k.finishTime = s.ft; }
      if (k.hint === undefined || k.hint < 0) k.hint = 0;
      const pr = k.track.project(k.pos, k.hint);
      k.hint = pr.index;
      k.lastS = pr.s;
      k.syncVisual(dt, 0);
    }

    /* ---- 收到状态 ---- */
    onState(peerId, data) {
      this.lastRecv = nowSec();
      if (Array.isArray(data)) {
        if (this.isHost) {
          const idx = this.index.get(peerId);
          if (idx === undefined) return;
          this.latest[idx] = data;
          const b = this.buf[idx];
          b.push(Object.assign({ t: nowSec() }, unpackState(data)));
          if (b.length > BUF_KEEP) b.shift();
        } else {
          const t = data[0] / 1000;
          if (t > this.hostClock) this.hostClock = t;
          const base = nowSec();
          for (let i = 0; i < this.n; i++) {
            const off = 1 + i * 14;
            const v = data.slice(off, off + 14);
            if (v.length < 14) break;
            const b = this.buf[i];
            b.push(Object.assign({ t: base }, unpackState(v)));
            if (b.length > BUF_KEEP) b.shift();
          }
        }
      }
    }

    /* ---- 完赛 ---- */
    reportFinish(id, time, best) {
      if (this.finishedOrder.indexOf(id) < 0) this.finishedOrder.push(id);
      this.latestFinish = this.latestFinish || {};
      this.latestFinish[id] = { time, best };
    }
  }

  /* ============================================================
     四、房间层（大厅 + 开局 + 结算）
     ============================================================ */
  class Room {
    constructor(o) {
      this.transport = o.transport;
      this.role = o.role;                 // host | guest
      this.isHost = o.role === 'host';
      this.code = o.code;
      this.selfId = o.selfId;
      this.hostId = o.hostId;
      this.name = o.name || '玩家';
      this.charId = o.charId || 'marco';
      this.players = [];
      this.settings = o.settings || { trackId: 'mushroom-plains', cc: 100, laps: 3, aiFill: true };
      this.race = null;
      this.state = 'lobby';               // lobby | preparing | racing | results
      this.prepared = new Set();
      this.chat = [];
      this._hb = null;
      this._rosterTimer = null;
      this._startSeq = 0;
      this.hostClockOffset = 0;
      this.pingMs = 0;
      this._pingSent = new Map();

      this.transport.onPeer = (id, link) => this._onPeer(id, link);
      this.transport.onMessage = (id, data, reliable) => this._onMessage(id, data, reliable);
      this.transport.onPeerGone = (id) => this._onPeerGone(id);

      if (this.isHost) {
        this.players = [{
          id: this.selfId, name: this.name, charId: this.charId,
          slot: 0, ready: true, isHost: true, ping: 0
        }];
        this.hostId = this.selfId;
      }
    }

    /* ---------------- 基础 ---------------- */
    start() {
      this.transport.start();
      if (this.isHost) {
        this._rosterTimer = setInterval(() => this._syncRosterFromDb(), 4000);
        this._syncRosterFromDb();
      } else {
        this.transport.connect();
      }
      this._hb = setInterval(() => {
        if (SK.Net.cloud && SK.Net.cloud.signedIn) {
          SK.Net.cloud.heartbeat(this.code, this.isHost);
        }
      }, 6000);
      emit('room', this.snapshot());
    }

    snapshot() {
      return {
        code: this.code,
        role: this.role,
        isHost: this.isHost,
        selfId: this.selfId,
        hostId: this.hostId,
        players: this.players.slice(),
        settings: Object.assign({}, this.settings),
        state: this.state,
        chat: this.chat.slice(-40),
        ping: this.pingMs,
        connected: this.players.length > 1 || this.isHost
      };
    }

    _emitRoom() { emit('room', this.snapshot()); }

    _sortPlayers() {
      this.players.sort((a, b) => a.slot - b.slot);
    }

    /* ---------------- 传输事件 ---------------- */
    _onPeer(id) {
      if (!this.isHost) {
        // 玩家：连上房主，报到
        this.transport.sendTo(id, {
          t: 'join', name: this.name, charId: this.charId, from: this.selfId
        }, true);
      }
    }

    _onPeerGone(id) {
      if (this.isHost) {
        const i = this.players.findIndex(p => p.id === id);
        if (i >= 0) {
          const gone = this.players.splice(i, 1)[0];
          this._broadcastRoster();
          emit('toast', { text: (gone.name || '玩家') + ' 离开了房间', kind: 'warn' });
        }
      } else {
        emit('toast', { text: '与房主的连接已断开', kind: 'error' });
        emit('disconnected', {});
      }
    }

    _onMessage(id, data, reliable) {
      if (Array.isArray(data)) {
        if (this.race) this.race.onState(id, data);
        return;
      }
      if (!data || typeof data !== 'object') return;
      const t = data.t;
      if (!t) return;

      /* ---- 通用 ---- */
      if (t === 'ping') {
        if (this.isHost) this.transport.sendTo(id, { t: 'pong', t0: data.t0, t1: nowSec() }, true);
        return;
      }
      if (t === 'pong') {
        const rtt = (nowSec() - data.t0) * 1000;
        this.pingMs = this.pingMs ? Math.round(this.pingMs * 0.6 + rtt * 0.4) : Math.round(rtt);
        this.hostClockOffset = data.t1 + (rtt / 1000) / 2 - nowSec();
        if (this.race) this.race.clockOffset = this.hostClockOffset;
        return;
      }
      if (t === 'chat') {
        this.chat.push({ from: data.from, name: data.name, text: data.text, ts: Date.now() });
        if (this.chat.length > 60) this.chat.shift();
        emit('chat', this.chat[this.chat.length - 1]);
        return;
      }
      if (t === 'ev') {
        if (this.isHost) this.relayEvent(data);
        // 发起者本地已经播过效果，回环消息只用于其他端
        if (data.from !== this.selfId) this._applyEvent(data.kind, data.data, data.from);
        return;
      }

      /* ---- 房主处理 ---- */
      if (this.isHost) {
        if (t === 'join') return this._hostAcceptJoin(id, data);
        if (t === 'ready') {
          const p = this.players.find(x => x.id === id);
          if (p) { p.ready = !!data.v; this._broadcastRoster(); }
          return;
        }
        if (t === 'profile') {
          const p = this.players.find(x => x.id === id);
          if (p) { p.name = (data.name || p.name).slice(0, 12); p.charId = data.charId || p.charId; this._broadcastRoster(); }
          return;
        }
        if (t === 'prepared') {
          this.prepared.add(id);
          if (this._prepResolve) this._prepResolve();
          return;
        }
        if (t === 'finish') {
          if (this.race) this.race.reportFinish(id, data.time, data.best);
          this._checkResults();
          return;
        }        if (t === 'rematch') {
          this._toLobbyAll();
          return;
        }
        if (t === 'leave') {
          this._onPeerGone(id);
          return;
        }
      }

      /* ---- 玩家处理 ---- */
      if (!this.isHost) {
        if (t === 'welcome') {
          this.selfId = data.you.id;
          this.players = data.players || [];
          this.settings = data.settings || this.settings;
          this._sortPlayers();
          this._emitRoom();
          emit('joined', this.snapshot());
          this._sendPing();
          return;
        }
        if (t === 'room') {
          this.players = data.players || [];
          this.settings = data.settings || this.settings;
          this.state = data.state || 'lobby';
          this.hostId = data.hostId || this.hostId;
          this._sortPlayers();
          this._emitRoom();
          return;
        }
        if (t === 'prepare') {
          emit('prepare', data);
          return;
        }
        if (t === 'start') {
          emit('start', data);
          return;
        }
        if (t === 'results') {
          this.state = 'results';
          if (this.race) this.race.results = data.rows;
          this._applyResults(data.rows);
          return;
        }
        if (t === 'tolobby') {
          this.state = 'lobby';
          this.race = null;
          emit('tolobby', {});
          return;
        }
      }
    }

    _sendPing() {
      if (this.isHost) return;
      this.transport.sendTo(this.hostId, { t: 'ping', t0: nowSec() }, true);
    }

    /* ---------------- 房主：玩家加入 ---------------- */
    _hostAcceptJoin(id, data) {
      let p = this.players.find(x => x.id === id);
      if (!p) {
        const used = new Set(this.players.map(x => x.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        if (slot >= 8) {
          this.transport.sendTo(id, { t: 'kick', reason: '房间已满' }, true);
          return;
        }
        p = {
          id, name: (data.name || '玩家').slice(0, 12), charId: data.charId || 'marco',
          slot, ready: false, isHost: false, ping: 0
        };
        this.players.push(p);
        emit('toast', { text: p.name + ' 加入了房间', kind: 'ok' });
      } else {
        p.name = (data.name || p.name).slice(0, 12);
        p.charId = data.charId || p.charId;
      }
      this._sortPlayers();
      this.transport.sendTo(id, {
        t: 'welcome',
        you: { id, slot: p.slot },
        players: this.players,
        settings: this.settings
      }, true);
      this._broadcastRoster();
    }

    /** 房主从数据库补齐人数：把没连上的人踢掉，避免幽灵位 */
    async _syncRosterFromDb() {
      if (!this.isHost || !SK.Net.cloud || !SK.Net.cloud.signedIn) return;
      const rows = await SK.Net.cloud.listPlayers(this.code);
      const live = rows.filter(r => Date.now() - new Date(r.last_seen).getTime() < PLAYER_TTL_MS);
      const ids = new Set(live.map(r => r.player_id));
      let changed = false;
      for (let i = this.players.length - 1; i >= 0; i--) {
        const p = this.players[i];
        if (p.isHost) continue;
        if (!ids.has(p.id)) {
          // 还没通过 P2P 连上、但仍在数据库里的玩家不踢
          const row = rows.find(r => r.player_id === p.id);
          if (!row) { this.players.splice(i, 1); changed = true; }
        }
      }
      if (changed) this._broadcastRoster();
    }

    _broadcastRoster() {
      this._sortPlayers();
      const msg = {
        t: 'room', players: this.players, settings: this.settings,
        state: this.state, hostId: this.hostId
      };
      this.transport.broadcast(msg, true);
      this._emitRoom();
    }

    relayEvent(data) {
      this.transport.broadcast({ t: 'ev', kind: data.kind, data: data.data, from: data.from }, true);
    }

    _applyEvent(kind, data, from) {
      if (this.race && this.race.onEvent) this.race.onEvent(kind, data, from);
      emit('gameevent', { kind, data, from });
    }

    /* ---------------- 玩家操作 ---------------- */
    setReady(v) {
      if (this.isHost) return;
      const me = this.players.find(p => p.id === this.selfId);
      if (me) me.ready = !!v;
      this.transport.sendTo(this.hostId, { t: 'ready', v: !!v }, true);
      this._emitRoom();
    }

    setProfile(name, charId) {
      this.name = name;
      this.charId = charId;
      if (this.isHost) {
        const me = this.players.find(p => p.id === this.selfId);
        if (me) { me.name = name; me.charId = charId; }
        this._broadcastRoster();
      } else {
        this.transport.sendTo(this.hostId, { t: 'profile', name, charId }, true);
        const me = this.players.find(p => p.id === this.selfId);
        if (me) { me.name = name; me.charId = charId; }
        this._emitRoom();
      }
    }

    setSettings(s) {
      if (!this.isHost) return;
      Object.assign(this.settings, s);
      this._broadcastRoster();
    }

    sendChat(text) {
      const msg = { t: 'chat', from: this.selfId, name: this.name, text: String(text).slice(0, 90) };
      if (this.isHost) this.transport.broadcast(msg, true);
      else this.transport.sendTo(this.hostId, msg, true);
      this.chat.push({ from: this.selfId, name: this.name, text: msg.text, ts: Date.now() });
      emit('chat', { from: this.selfId, name: this.name, text: msg.text, ts: Date.now() });
    }

    /* ---------------- 开局 ---------------- */
    buildRoster() {
      const humans = this.players.slice().sort((a, b) => a.slot - b.slot).slice(0, 8);
      const roster = humans.map(p => ({
        id: p.id, name: p.name, charId: p.charId, slot: p.slot,
        isLocal: p.id === this.selfId, ai: false
      }));
      if (this.settings.aiFill) {
        const usedChar = new Set(roster.map(r => r.charId));
        const pool = SK.Character.ROSTER.map(c => c.id).filter(c => !usedChar.has(c));
        let ai = 0;
        while (roster.length < 8 && pool.length) {
          const cid = pool.splice((Math.random() * pool.length) | 0, 1)[0];
          roster.push({
            id: 'ai-' + ai, name: SK.Character.get(cid).name, charId: cid,
            slot: roster.length, isLocal: false, ai: true
          });
          ai++;
        }
      }
      return roster;
    }

    hostPrepare() {
      if (!this.isHost) return null;
      const roster = this.buildRoster();
      this._startSeq++;
      const msg = {
        t: 'prepare',
        seq: this._startSeq,
        roster,
        settings: this.settings
      };
      this.transport.broadcast(msg, true);
      this.prepared = new Set();
      this.state = 'preparing';
      return msg;
    }

    waitPrepared(timeoutMs) {
      if (!this.isHost) return Promise.resolve();
      return new Promise((resolve) => {
        const t0 = Date.now();
        this._prepResolve = () => {
          const need = this.players.filter(p => !p.isHost).map(p => p.id);
          const ok = need.every(id => this.prepared.has(id));
          if (ok || Date.now() - t0 > timeoutMs) {
            this._prepResolve = null;
            resolve();
          }
        };
        this._prepResolve();
      });
    }

    hostStart(roster, startAt) {
      const msg = { t: 'start', at: startAt, roster, settings: this.settings };
      this.transport.broadcast(msg, true);
      this.state = 'racing';
      return msg;
    }

    guestPrepared() {
      if (this.isHost) return;
      this.transport.sendTo(this.hostId, { t: 'prepared' }, true);
    }

    /* ---------------- 结算 ---------------- */
    reportSelfFinish(time, best) {
      if (this.isHost) {
        if (this.race) this.race.reportFinish(this.selfId, time, best);
        this._checkResults();
      } else {
        this.transport.sendTo(this.hostId, { t: 'finish', time, best }, true);
      }
    }

    _checkResults() {
      if (!this.isHost || !this.race) return;
      const humans = this.players.map(p => p.id);
      const fin = this.race.latestFinish || {};
      const all = humans.every(id => fin[id]);
      const now = nowSec();
      if (!this._firstFinish) this._firstFinish = now;
      if (all || now - this._firstFinish > 30) this._broadcastResults();
    }

    _broadcastResults() {
      if (!this.isHost) return;
      if (this._resultsSent) return;
      this._resultsSent = true;
      const rows = this.players.map(p => {
        const f = (this.race && this.race.latestFinish && this.race.latestFinish[p.id]) || null;
        return {
          id: p.id, name: p.name, charId: p.charId,
          time: f ? f.time : 0, best: f ? f.best : 0, dnf: !f
        };
      }).sort((a, b) => {
        if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
        return a.time - b.time;
      });
      const msg = { t: 'results', rows };
      this.transport.broadcast(msg, true);
      this.state = 'results';
      if (this.race) this.race.results = rows;
      this._applyResults(rows);
    }

    _applyResults(rows) {
      emit('results', { t: 'results', rows });
      this.saveMyResult(rows);
    }

    /** 每个客户端只写自己那一行（RLS 也只允许这样） */
    saveMyResult(rows) {
      const c = SK.Net.cloud;
      if (!c || !c.signedIn) return;
      const i = rows.findIndex(r => r.id === this.selfId);
      if (i < 0) return;
      const r = rows[i];
      c.saveResult({
        roomCode: this.code,
        trackId: this.settings.trackId,
        name: r.name, charId: r.charId,
        pos: i + 1,
        totalMs: Math.round((r.time || 0) * 1000),
        bestMs: Math.round((r.best || 0) * 1000),
        cc: this.settings.cc, laps: this.settings.laps
      });
    }

    _toLobbyAll() {
      this.state = 'lobby';
      this.race = null;
      this._firstFinish = 0;
      this._resultsSent = false;
      this.prepared = new Set();
      if (this.isHost) {
        this.transport.broadcast({ t: 'tolobby' }, true);
        if (SK.Net.cloud && SK.Net.cloud.signedIn) {
          SK.Net.cloud.setRoomSettings(this.code, Object.assign({}, this.settings, { status: 'waiting' }));
        }
      }
      emit('tolobby', {});
      this._emitRoom();
    }

    leave() {
      if (this._hb) clearInterval(this._hb);
      if (this._rosterTimer) clearInterval(this._rosterTimer);
      if (!this.isHost && this.transport) {
        try { this.transport.sendTo(this.hostId, { t: 'leave' }, true); } catch (e) { /* ignore */ }
      }
      if (this.isHost && this.transport) {
        this.transport.broadcast({ t: 'tolobby' }, true);
      }
      if (this.transport) this.transport.close();
    }
  }

  /* ============================================================
     五、门面
     ============================================================ */
  const cloud = new Cloud();
  const Net = {
    cloud,
    room: null,
    race: null,
    mode: 'cloud',          // cloud | local
    on, off, emit,
    ready: false,
    cfg: CFG,
    lastError: null,

    async init() {
      try {
        await cloud.init();
      } catch (e) {
        this.lastError = e.message || String(e);
      }
      return this;
    },

    async restore() {
      try {
        await cloud.restore();
        this.ready = true;
      } catch (e) {
        this.lastError = e.message || String(e);
        console.warn('[net] restore failed', e);
      }
      return cloud.snapshot();
    },

    async signIn() {
      try { await cloud.signIn(); }
      catch (e) { this.lastError = e.message || String(e); emit('toast', { text: this.lastError, kind: 'error' }); throw e; }
    },

    async signOut() {
      await cloud.signOut();
    },

    /** 建立房间（房主） */
    async hostRoom(opts) {
      const local = this.mode === 'local';
      const info = local
        ? { code: opts.code || ('L' + randCode(3)), playerId: 'host', name: opts.name }
        : await cloud.createRoom(opts);
      const transport = local
        ? new LocalTransport({ code: info.code, role: 'host', selfId: info.playerId, hostId: info.playerId })
        : new CloudTransport({ code: info.code, role: 'host', selfId: info.playerId, hostId: info.playerId, cloud });
      const room = new Room({
        transport, role: 'host', code: info.code,
        selfId: info.playerId, hostId: info.playerId,
        name: opts.name, charId: opts.charId,
        settings: { trackId: opts.trackId, cc: opts.cc, laps: opts.laps, aiFill: opts.aiFill !== false }
      });
      room.start();
      this.room = room;
      this.race = null;
      emit('room', room.snapshot());
      return room;
    },

    /** 加入房间（玩家） */
    async joinRoom(code, opts) {
      const local = this.mode === 'local';
      code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!local && code.length < 4) throw new Error('请输入 4 位房间号');
      const info = local
        ? { playerId: 'g-' + randCode(4), name: opts.name, hostId: 'host' }
        : await cloud.joinRoom(code, opts);
      const hostId = info.hostId;
      const transport = local
        ? new LocalTransport({ code, role: 'guest', selfId: info.playerId, hostId })
        : new CloudTransport({ code, role: 'guest', selfId: info.playerId, hostId, cloud });
      const room = new Room({
        transport, role: 'guest', code,
        selfId: info.playerId, hostId,
        name: opts.name, charId: opts.charId,
        settings: { trackId: opts.trackId || 'mushroom-plains', cc: opts.cc || 100, laps: opts.laps || 3, aiFill: true }
      });
      room.start();
      this.room = room;
      this.race = null;
      emit('room', room.snapshot());
      return room;
    },

    async leaveRoom() {
      const r = this.room;
      if (!r) return;
      const isHost = r.isHost;
      const code = r.code;
      r.leave();
      this.room = null;
      this.race = null;
      if (this.mode !== 'local' && cloud.signedIn) {
        await cloud.leaveRoom(code, isHost);
      }
      emit('left', {});
    },

    /** 房主：准备 + 下发开局 */
    async hostBeginRace(game) {
      const room = this.room;
      if (!room || !room.isHost) return;
      const msg = room.hostPrepare();
      if (!msg) return;
      // 本地先建赛道
      game.netPending = { roster: msg.roster, settings: msg.settings };
      await game.prepareTrack(msg.settings.trackId);
      await room.waitPrepared(20000);
      const at = (performance.now() / 1000) + 4.2;
      room.hostStart(msg.roster, at);
      this.startRaceLocally(game, msg.roster, msg.settings, at);
    },

    startRaceLocally(game, roster, settings, hostAt) {
      const offset = this.room ? this.room.hostClockOffset : 0;
      const localAt = hostAt - offset;
      // 名单由房主下发，里面的 isLocal 是「房主视角」。
      // 每个客户端必须按自己的 selfId 重算，否则客机会把房主的车当成自己的车
      // （相机、HUD、输入、火箭起步全部错位）。
      const selfId = this.room.selfId;
      const localRoster = roster.map(r => Object.assign({}, r, {
        isLocal: r.id === selfId
      }));
      this.race = new RaceSync({
        transport: this.room.transport,
        isHost: this.room.isHost,
        selfId,
        hostId: this.room.hostId,
        roster: localRoster
      });
      if (this.room) this.room.race = this.race;
      game.startRace({
        net: true,
        roster: localRoster,
        settings,
        startAtLocal: localAt,
        isHost: this.room.isHost
      });
    }
  };

  SK.Net = Net;
  SK.Net.Cloud = Cloud;
  SK.Net.Room = Room;
  SK.Net.RaceSync = RaceSync;
  SK.Net.LocalTransport = LocalTransport;
})();
