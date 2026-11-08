/* 纸片勇者 — 联机面板（DOM 覆盖层）
 * 建房 / 进房 / 选赛道 / 开赛，界面复用纸片风格的 .acc-* 样式。
 *
 * 联机拓扑：房主那台电脑跑 tools/net_server.py 当服务器，
 * tools/tunnel.py 用 Cloudflare 快速隧道把它映射到公网。
 * 设备 A / 设备 B 不用在同一个局域网：都打开同一个隧道地址（或游戏厅页面 + ?server=），
 * 连到同一台服务器、进同一个 4 位房号即可，最多 4 人。
 */
(function (PH) {
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LEVELS = () => PH.LEVEL_ORDER || Object.keys(PH.Levels || {});

  const O = (PH.Online = {
    el: null,
    body: null,
    foot: null,
    title: null,
    lead: null,
    opened: false,
    mode: 'home', // home | room | error
    level: '',
    busy: false,
    msg: '',
    msgType: '',
    pendingRoom: '',
    _inviteDone: false,

    init() {
      this.el = document.getElementById('online');
      if (!this.el) return;
      this.body = document.getElementById('onBody');
      this.foot = document.getElementById('onFoot');
      this.title = document.getElementById('onTitle');
      this.lead = document.getElementById('onLead');
      document.getElementById('onClose').addEventListener('click', () => this.close());
      this.el.addEventListener('mousedown', (e) => {
        if (e.target.classList && e.target.classList.contains('acc-backdrop')) this.close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.opened) this.close();
      });
      PH.Net.on = (type, data) => this.onNet(type, data);
      this.level = LEVELS()[0] || '1-1';
      try {
        const q = new URLSearchParams(location.search);
        this.pendingRoom = (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      } catch (e) {}
    },

    // 由 game.js 等服务探测完成后调用：朋友点开邀请链接就自动进房
    consumeInvite() {
      if (!this.pendingRoom || this._inviteDone) return;
      this._inviteDone = true;
      const room = this.pendingRoom;
      this.open();
      this.mode = 'home';
      this.msg = '正在通过邀请链接加入房间 ' + room + '…';
      this.render();
      setTimeout(() => {
        const input = document.getElementById('onCode');
        if (input) input.value = room;
        this.join();
      }, 160);
    },

    open() {
      if (!this.el) return;
      if (PH.G && PH.G.state === 'play' && PH.setState) PH.setState('pause');
      this.el.hidden = false;
      this.opened = true;
      this.mode = PH.Net.room ? 'room' : 'home';
      this.msg = '';
      this.render();
    },

    close() {
      if (!this.el) return;
      this.el.hidden = true;
      this.opened = false;
    },

    myName() {
      if (PH.Hub && PH.Hub.displayName) return PH.Hub.displayName();
      return (PH.Profiles && PH.Profiles.name()) || '玩家';
    },

    onNet(type, data) {
      if (type === 'joined') {
        this.mode = 'room';
        this.msg = '';
        this.busy = false;
        this.render();
      } else if (type === 'peers') {
        if (PH.onlinePeersChanged) PH.onlinePeersChanged();
        this.render();
      } else if (type === 'neterr') {
        this.busy = false;
        this.msg = data.msg || '联机出了点问题';
        this.msgType = 'err';
        if (!PH.Net.room) this.mode = 'home';
        this.render();
      } else if (type === 'close') {
        this.mode = 'error';
        this.busy = false;
        this.render();
      } else if (type === 'peer') {
        const d = data && data.d;
        if (!d) return;
        if (d.k === 'start') {
          this.close();
          if (PH.startOnlineRace) PH.startOnlineRace(d.level);
        } else if (PH.onlinePeerMsg) PH.onlinePeerMsg(data.from, d);
      }
    },

    render() {
      if (!this.el) return;
      const N = PH.Net;
      if (this.mode === 'home') {
        this.title.textContent = '联机竞速';
        this.lead.textContent = '本机当服务器 · 两台设备不用在同一个网络';
        this.body.innerHTML = this.homeHtml();
        this.foot.innerHTML = this.originHint();
      } else if (this.mode === 'room') {
        const host = N.isHost();
        this.title.textContent = '房间 ' + esc(N.room);
        this.lead.textContent = host ? '把邀请链接发给朋友，等他进来就能开赛' : '等房主开始比赛';
        this.body.innerHTML = this.roomHtml(host);
        this.foot.textContent = N.players.length + ' / 4 人 · 延迟 ' + (N.rtt ? N.rtt + ' ms' : '—');
      } else {
        this.title.textContent = '联机不上';
        this.lead.textContent = '先把那台电脑上的服务器打开再试一次';
        this.body.innerHTML =
          '<p class="acc-msg err">' + esc(N.error || '连不上联机服务') + '</p>' +
          '<button class="acc-btn primary" data-act="retry">再试一次</button>' +
          '<p class="acc-tip">联机由<b>房主那台电脑当服务器</b>，通过 Cloudflare 内网穿透连到公网，' +
          '设备 A 和设备 B <b>不用在同一个局域网</b>。<br>' +
          '让房主双击「启动游戏.command」或运行 <b>python3 tools/tunnel.py</b>；' +
          '如果隧道地址刚变过，把房主发来的邀请链接打开，或把服务器地址贴到下面再连一次。</p>' +
          this.serverField() +
          '<p class="acc-msg" id="onMsg"></p>';
        this.foot.textContent = '';
      }
      this.wire();
    },

    originHint() {
      const ep = (PH.Hub && PH.Hub.endpoint) || '';
      if (!ep) return '本机电脑当服务器 · 走内网穿透，跨网也能联机';
      return '当前服务器：<b>' + esc(ep) + '</b> · 设备 A / B 不在同一网络也能进同一个房间';
    },

    // 手动指定服务器：Pages 上的地址表还没刷新、或隧道刚换地址时用它兜底
    serverField() {
      const v = PH.Hub && PH.Hub.manual ? PH.Hub.manual() : '';
      return (
        '<div class="acc-field on-server"><label>服务器地址（邀请链接会自动填好，一般不用改）</label>' +
        '<div class="acc-inline">' +
        '<input id="onServer" autocomplete="off" spellcheck="false" placeholder="留空 = 自动寻找" value="' + esc(v) + '" />' +
        '<button class="acc-btn mini" data-act="server">连接</button></div></div>'
      );
    },

    homeHtml() {
      const last = PH.U && PH.U.store ? PH.U.store.get('lastRoom', '') : '';
      const hub = PH.Hub || {};
      const down = hub.status === 'offline';
      if (down) {
        return (
          '<p class="acc-msg err">那台电脑上的联机服务现在是关着的</p>' +
          '<p class="acc-tip">联机由<b>房主的电脑当服务器</b>，Cloudflare 隧道把它连到公网，' +
          '所以两台设备 <b>不用在同一个局域网</b>，用流量 / 别的 Wi-Fi 都行。<br>' +
          '让房主在那台电脑上双击「启动游戏.command」（或运行 <b>python3 tools/tunnel.py</b>），' +
          '它会自动开两条隧道并把新地址同步到游戏厅。<br>' +
          '单机关卡、双人同屏不受影响，照常能玩。</p>' +
          this.serverField() +
          '<button class="acc-btn ghost" data-act="retry">重新检测</button>'
        );
      }
      return (
        '<button class="acc-btn primary" data-act="create">创建房间</button>' +
        '<div class="acc-or"><span>或者加入朋友的房间</span></div>' +
        '<div class="acc-field"><label>房号</label><div class="acc-inline">' +
        '<input id="onCode" maxlength="4" autocomplete="off" spellcheck="false" placeholder="4 位房号" value="' + esc(last) + '" />' +
        '<button class="acc-btn mini" data-act="join">加入</button></div></div>' +
        '<p class="acc-msg' + (this.msgType === 'err' ? ' err' : '') + '" id="onMsg">' + esc(this.msg) + '</p>' +
        '<p class="acc-tip"><b>跨网联机：</b>房主建好房后点「复制邀请链接」发给朋友，' +
        '朋友不管在哪个网络，打开链接就会自动连到这台电脑并进房；' +
        '也可以把房号报给他，让他打开同一个游戏网址手动输入。最多 4 个人一起跑。</p>' +
        this.serverField()
      );
    },

    // 从健康端点里挑一个公网地址。房主在 localhost 建房时绝不能把 localhost 发给朋友
    isLocal(u) {
      const s = String(u || '').replace(/^https?:\/\//i, '').toLowerCase();
      return !s || /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(s);
    },

    publicEndpoint() {
      const eps = (PH.Hub && PH.Hub.endpoints) || [];
      const pub = eps.find((u) => !this.isLocal(u));
      if (pub) return pub;
      const m = PH.Hub && PH.Hub.manual ? PH.Hub.manual() : '';
      return this.isLocal(m) ? '' : m;
    },

    // 邀请链接直接用隧道地址当页面地址：页面和 /ws 同源，最稳，也不依赖 Pages 是否刷新。
    // 隧道没开时不带 server=，让朋友走自动发现（避免误连到他自己电脑的 localhost）。
    inviteUrl() {
      const pub = this.publicEndpoint();
      const base = pub ? pub + '/' : location.href.split('#')[0].split('?')[0];
      const q = [];
      if (pub) q.push('server=' + encodeURIComponent(pub));
      q.push('room=' + encodeURIComponent(PH.Net.room || ''));
      return base + '?' + q.join('&');
    },

    roomHtml(host) {
      const N = PH.Net;
      const me = N.myId;
      const rows = N.players
        .map((p, i) => {
          const color = N.colorOf(p.id);
          const isHost = p.id === N.hostId;
          const skin = N.skinOf(p.id);
          const src = (PH.Assets && PH.Assets.img[skin] && PH.Assets.img[skin].src) || 'assets/sprites/' + skin + '.png';
          return (
            '<div class="acc-item on">' +
            '<span class="acc-av on-av" style="border-color:' + color + '">' +
            '<img src="' + esc(src) + '" alt="">' +
            '</span>' +
            '<span class="acc-who2"><b>' + esc(p.name) + (p.id === me ? '（你）' : '') + '</b>' +
            '<i>' + (isHost ? '房主' : '玩家 ' + (i + 1)) + '</i></span>' +
            (isHost ? '<span class="acc-ck" style="color:' + color + '">★</span>' : '') +
            '</div>'
          );
        })
        .join('');

      let picker = '';
      if (host) {
        picker =
          '<div class="acc-label">选择赛道</div>' +
          '<div class="on-levels">' +
          LEVELS()
            .map((id) => {
              const name = (PH.Levels && PH.Levels[id] && PH.Levels[id].name) || '';
              return (
                '<button class="on-level' + (id === this.level ? ' on' : '') + '" data-level="' + esc(id) + '">' +
                '<b>' + esc(id) + '</b><i>' + esc(name) + '</i></button>'
              );
            })
            .join('') +
          '</div>';
      }

      const hasPub = !!this.publicEndpoint();
      const invite =
        '<div class="acc-field on-invite"><label>' +
        (hasPub
          ? '邀请链接 · 朋友不用和你在同一个网络'
          : '邀请链接 · 隧道没开，这条只在同一个网络里有效；跨网请让房主运行 tools/tunnel.py') +
        '</label>' +
        '<div class="acc-inline"><input id="onInvite" readonly value="' + esc(this.inviteUrl()) + '" />' +
        '<button class="acc-btn mini" data-act="invite">复制</button></div></div>';

      return (
        '<div class="on-code"><span>房号</span><b>' + esc(N.room) + '</b>' +
        '<button class="acc-btn mini" data-act="copy">复制房号</button></div>' +
        invite +
        '<div class="acc-label">玩家 ' + N.players.length + ' / 4</div>' +
        '<div class="acc-list">' + rows + '</div>' +
        (host
          ? picker + '<button class="acc-btn primary" data-act="start">开始比赛</button>'
          : '<p class="on-wait"><i></i>等房主选赛道…</p>') +
        '<p class="acc-msg err" id="onMsg">' + (this.msgType === 'err' ? esc(this.msg) : '') + '</p>' +
        '<button class="acc-btn ghost" data-act="leave">离开房间</button>'
      );
    },

    wire() {
      const body = this.body;
      body.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', () => {
          const act = b.dataset.act;
          if (act === 'create') this.create();
          else if (act === 'join') this.join();
          else if (act === 'copy') this.copy();
          else if (act === 'invite') this.copyInvite();
          else if (act === 'server') this.applyServer();
          else if (act === 'start') this.startRace();
          else if (act === 'leave') this.leave();
          else if (act === 'retry') {
            PH.Net.reset();
            PH.Net.status = 'idle';
            this.mode = 'home';
            this.msg = '正在重新检测服务器…';
            this.render();
            if (PH.Hub) {
              PH.Hub.discover().then((ok) => {
                this.mode = ok ? 'home' : 'error';
                this.msg = '';
                this.render();
              });
            } else {
              PH.Net.connect().catch(() => {
                this.mode = 'error';
                this.render();
              });
            }
          }
        });
      });
      body.querySelectorAll('[data-level]').forEach((b) => {
        b.addEventListener('click', () => {
          this.level = b.dataset.level;
          this.render();
        });
      });
      const code = document.getElementById('onCode');
      if (code) {
        code.addEventListener('input', () => {
          code.value = code.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
        });
        code.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.join();
        });
        setTimeout(() => code.focus(), 80);
      }
      const srv = document.getElementById('onServer');
      if (srv) {
        srv.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.applyServer();
        });
      }
    },

    flash(text, isErr) {
      this.msg = text || '';
      this.msgType = isErr ? 'err' : '';
      const m = document.getElementById('onMsg');
      if (m) {
        m.textContent = this.msg;
        m.className = 'acc-msg' + (isErr ? ' err' : '');
      }
    },

    applyServer() {
      const input = document.getElementById('onServer');
      const v = input ? input.value.trim() : '';
      if (PH.Hub && PH.Hub.setManual) PH.Hub.setManual(v);
      PH.Net.reset();
      this.busy = true;
      this.flash(v ? '正在连接 ' + v + ' …' : '正在重新寻找服务器…', false);
      if (!PH.Hub) {
        this.busy = false;
        return;
      }
      PH.Hub.discover().then((ok) => {
        this.busy = false;
        this.mode = ok ? 'home' : 'error';
        this.render();
        this.flash(
          ok ? '服务器已连上：' + PH.Hub.endpoint : '连不上这个服务器，检查地址，或让房主重启隧道后重发邀请链接',
          !ok
        );
      });
    },

    create() {
      if (this.busy) return;
      this.busy = true;
      this.flash('正在建房间…', false);
      PH.Net.create(this.myName()).catch(() => {
        this.busy = false;
        this.mode = 'error';
        this.render();
      });
    },

    join() {
      if (this.busy) return;
      const input = document.getElementById('onCode');
      const code = (input ? input.value : this.pendingRoom || '').trim().toUpperCase();
      if (code.length !== 4) {
        this.flash('房号是 4 位，再检查一下', true);
        return;
      }
      this.busy = true;
      this.flash('正在进房间…', false);
      PH.U.store.set('lastRoom', code);
      PH.Net.joinRoom(code, this.myName()).catch(() => {
        this.busy = false;
        this.mode = 'error';
        this.render();
      });
    },

    copy() {
      const code = PH.Net.room;
      const done = () => this.flash('房号已复制：' + code, false);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(() => this.flash('房号：' + code, false));
      } else this.flash('房号：' + code, false);
    },

    copyInvite() {
      const input = document.getElementById('onInvite');
      const url = input ? input.value : this.inviteUrl();
      if (input) {
        input.select();
        input.setSelectionRange(0, url.length);
      }
      const done = () => this.flash('邀请链接已复制，发给朋友就能跨网进房', false);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => {
          try { document.execCommand('copy'); done(); } catch (e) { this.flash('请手动复制上面的链接', true); }
        });
      } else {
        try { document.execCommand('copy'); done(); } catch (e) { this.flash('请手动复制上面的链接', true); }
      }
    },

    startRace() {
      if (!PH.Net.isHost()) return;
      if (PH.Net.players.length < 2) {
        this.flash('至少两个人才能开赛，把邀请链接发给朋友吧', true);
        return;
      }
      PH.Net.relay({ k: 'start', level: this.level });
      this.close();
      if (PH.startOnlineRace) PH.startOnlineRace(this.level);
    },

    leave() {
      PH.Net.leave();
      this.mode = 'home';
      this.msg = '';
      this.render();
    },
  });

  O.init();
})(window.PH);
