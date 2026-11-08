/* 纸片勇者 — 联机客户端
 * 走 tools/net_server.py 提供的 WebSocket（/ws），按 4 位房号组房间。
 * 只做三件事：连接、建房/进房、把消息丢给 ui 层；不掺和玩法。
 */
(function (PH) {
  // 座位 0-3 对应四个纸片角色（0 是主角）
  const COLORS = ['#E2574C', '#2F7FC4', '#7FB63F', '#B47BD0'];
  const SKINS = ['hero', 'player2', 'player3', 'player4'];

  const N = (PH.Net = {
    ws: null,
    status: 'idle', // idle | connecting | open | closed | error
    error: '',
    myId: '',
    room: '',
    hostId: '',
    players: [],
    rtt: 0,
    on: null, // (type, payload) => void
    _ping: null,
    _wait: null,

    url() {
      if (PH.Hub && PH.Hub.wsUrl) return PH.Hub.wsUrl();
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + (location.host || 'localhost:8777') + '/ws';
    },

    emit(type, data) {
      if (this.on) this.on(type, data);
    },

    // 换服务器：彻底断开旧连接，下次 connect() 会重新读 Hub.endpoint
    reset() {
      this.stopPing();
      if (this.ws) {
        try {
          this.ws.onclose = null;
          this.ws.onmessage = null;
          this.ws.onerror = null;
          this.ws.onopen = null;
          this.ws.close();
        } catch (e) {}
      }
      this.ws = null;
      this.status = 'idle';
      this.error = '';
      this.room = '';
      this.hostId = '';
      this.players = [];
      this.myId = '';
      this._wait = null;
    },

    connect() {
      if (this.status === 'open') return Promise.resolve();
      if (this._wait) return this._wait;
      this.status = 'connecting';
      this.error = '';
      this._wait = new Promise((resolve, reject) => {
        let settled = false;
        const fail = (msg) => {
          if (settled) return;
          settled = true;
          this.status = 'error';
          this.error = msg;
          this._wait = null;
          reject(new Error(msg));
        };
        let ws;
        try {
          ws = new WebSocket(this.url());
        } catch (e) {
          fail('这个浏览器打不开联机');
          return;
        }
        this.ws = ws;
        const timer = setTimeout(() => {
          if (this.status === 'open') return;
          try {
            ws.close();
          } catch (e) {}
          fail('连不上联机服务，先双击目录里的「启动游戏.command」');
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timer);
          settled = true;
          this.status = 'open';
          this.error = '';
          this._wait = null;
          this.startPing();
          this.emit('open');
          resolve();
        };
        ws.onmessage = (e) => {
          let msg;
          try {
            msg = JSON.parse(e.data);
          } catch (err) {
            return;
          }
          this.handle(msg);
        };
        ws.onclose = () => {
          clearTimeout(timer);
          this.stopPing();
          const was = this.status;
          this.room = '';
          this.players = [];
          // 掉线了先换一条隧道试试
          if (PH.Hub && PH.Hub.status === 'online') {
            setTimeout(() => PH.Hub.failover(PH.Hub.endpoint), 300);
          }
          if (!settled) {
            // 还没连上就断了：多半是服务没开
            fail('连不上联机服务，先双击目录里的「启动游戏.command」');
            return;
          }
          this.status = 'closed';
          this._wait = null;
          if (was === 'open') {
            this.error = '和联机服务的连接断开了';
            this.emit('close');
          }
        };
        ws.onerror = () => {
          /* onclose 会接着来 */
        };
      });
      return this._wait;
    },

    handle(msg) {
      if (msg.t === 'pong') {
        if (msg.ts) this.rtt = Math.max(0, Math.min(999, Date.now() - msg.ts));
        this.emit('rtt', this.rtt);
        return;
      }
      if (msg.t === 'joined') {
        this.myId = msg.id;
        this.room = msg.room;
        this.hostId = msg.hostId;
        this.players = msg.players || [];
        this.emit('joined', msg);
        return;
      }
      if (msg.t === 'peers') {
        this.hostId = msg.hostId;
        this.players = msg.players || [];
        this.emit('peers', msg);
        return;
      }
      if (msg.t === 'msg') {
        this.emit('peer', msg);
        return;
      }
      if (msg.t === 'err') {
        this.error = msg.msg || '联机出了点问题';
        this.emit('neterr', msg);
        return;
      }
      if (msg.t === 'left') {
        this.room = '';
        this.players = [];
        this.emit('left');
      }
    },

    startPing() {
      this.stopPing();
      this._ping = setInterval(() => this.send({ t: 'ping', ts: Date.now() }), 8000);
    },
    stopPing() {
      if (this._ping) clearInterval(this._ping);
      this._ping = null;
    },

    create(name) {
      return this.connect().then(() => this.send({ t: 'create', name: name }));
    },
    joinRoom(code, name) {
      return this.connect().then(() => this.send({ t: 'join', room: code, name: name }));
    },
    send(d) {
      if (!this.ws || this.ws.readyState !== 1) return false;
      try {
        this.ws.send(JSON.stringify(d));
        return true;
      } catch (e) {
        return false;
      }
    },
    // 只在房间里转发给其他人
    relay(d) {
      if (!this.room) return false;
      return this.send({ t: 'msg', d: d });
    },
    leave() {
      this.send({ t: 'leave' });
      this.room = '';
      this.players = [];
    },
    isHost() {
      return !!this.room && this.myId === this.hostId;
    },
    peerCount() {
      return this.players.length;
    },
    seatOf(id) {
      const p = this.players.find((q) => q.id === id);
      return p && typeof p.seat === 'number' ? p.seat : 0;
    },
    get mySeat() {
      return this.seatOf(this.myId);
    },
    colorOf(id) {
      return COLORS[this.seatOf(id) % 4];
    },
    // 每个座位一个专属角色：0 主角，1/2/3 是后画的三张
    skinOf(id) {
      return SKINS[this.seatOf(id) % 4];
    },
    skinOfSeat(seat) {
      return SKINS[(seat || 0) % 4];
    },
    nameOf(id) {
      const p = this.players.find((q) => q.id === id);
      return p ? p.name : '玩家';
    },
  });

  /* ---------------- 共享世界事件簿 ----------------
   * 联机竞速里每人各跑一份世界，但「怪物被打死 / 金币道具被捡走 / 记录点被点亮」
   * 必须是全房间同一份状态。这里只存两样轻量的东西，玩法仍由 game.js 的 World 决定：
   *   epoch   本轮比赛的编号，换关卡时一起换，上一轮的迟到消息直接丢掉
   *   pending 世界还没建好时先收着的事件，World 一出生就补放一遍
   */
  PH.NetSync = {
    epoch: 0,
    pending: [],

    newEpoch() {
      return Date.now().toString(36) + '-' + (N.myId || 'x') + '-' + Math.random().toString(36).slice(2, 6);
    },
    begin(wid) {
      this.epoch = wid || this.newEpoch();
      this.pending.length = 0;
      return this.epoch;
    },
    // 世界还没建好：只要纪元对得上就先攒着
    buffer(d) {
      if (d && d.ep === this.epoch && this.pending.length < 400) this.pending.push(d);
    },
    flush(w) {
      if (!w || !this.pending.length) return;
      const list = this.pending.slice();
      this.pending.length = 0;
      for (const d of list) {
        if (d.k === 'ev' && w.applyNetEvent) w.applyNetEvent(d);
        else if (d.k === 'ws' && w.applyNetSnapshot) w.applyNetSnapshot(d);
      }
    },
  };
})(window.PH);
