/* 纸片勇者 — 联机面板（DOM 覆盖层）
 * 建房 / 进房 / 选赛道 / 开赛，界面复用纸片风格的 .acc-* 样式。
 *
 * 联机拓扑：Cloudflare Worker + Durable Object 常驻在公网，房主电脑不用开机。
 * 手机 / 平板 / 别的电脑各自用流量或任意 Wi-Fi 打开「固定游戏网址」，
 * 都会连到同一个 Cloudflare 端点、进同一个 4 位房号，最多 4 人。
 * 互相之间不需要在同一个局域网；旧的本机服务 + 快速隧道只作为可选兜底。
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
          if (PH.NetSync) PH.NetSync.begin(d.wid || 0);
          if (PH.startOnlineRace) PH.startOnlineRace(d.level);
        } else if (PH.onlinePeerMsg) PH.onlinePeerMsg(data.from, d);
      }
    },

    render() {
      if (!this.el) return;
      const N = PH.Net;
      if (this.mode === 'home') {
        this.title.textContent = '联机竞速';
        this.lead.textContent = '这台电脑当服务器 · 手机 / 平板 / 别的电脑，各在哪个网络都行';
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
        this.lead.textContent = '连不上 Cloudflare 服务器，稍后再试一次';
        this.body.innerHTML =
          '<p class="acc-msg err">' + esc(N.error || '连不上联机服务') + '</p>' +
          '<button class="acc-btn primary" data-act="retry">再试一次</button>' +
          '<p class="acc-tip">联机跑在 <b>Cloudflare 上，不需要任何人的电脑开机</b>：' +
          '手机用流量、平板连别的 Wi-Fi、电脑在别的城市，彼此不在同一个局域网也能进同一个房间。<br>' +
          '现在多半是网络暂时连不上 Cloudflare；<b>这个页面会自己重连，不用刷新</b>。' +
          '单机关卡照常能玩。</p>' +
          this.serverField() +
          '<p class="acc-msg" id="onMsg"></p>';
        this.foot.textContent = '';
      }
      this.wire();
    },

    originHint() {
      const ep = (PH.Hub && PH.Hub.endpoint) || '';
      if (!ep) return 'Cloudflare 常驻服务器 · 不需要任何人的电脑开机';
      return '当前服务器：<b>' + esc(ep) + '</b> · 设备 A / B 不在同一网络也能进同一个房间';
    },

    // 手动指定服务器：只在调试或临时换服务器时才需要动，普通玩家留空即可
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
          '<p class="acc-msg err">暂时连不上 Cloudflare 联机服务器</p>' +
          '<p class="acc-tip">联机服务跑在 <b>Cloudflare 上，不需要房主电脑开机</b>：' +
          '手机用流量、平板连别的 Wi-Fi、另一台电脑在别的网络，三台设备互相不在同一个局域网也能进同一个房间。<br>' +
          '现在多半是本机网络暂时访问不了 Cloudflare，换个网络或稍等一下即可。<br>' +
          '<b>这个页面会一直自动重连</b>，恢复后不用刷新、不用重新要链接；单机关卡照常能玩。</p>' +
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
        '<p class="acc-tip"><b>跨网联机：</b>房主建好房后把「邀请链接」或「固定网址 + 房号」发给朋友。' +
        '手机、平板、另一台电脑不管各自在哪个网络，打开就会自动连到同一个 Cloudflare 房间。' +
        '<b>服务器常驻云端，不需要房主电脑开机，地址也不会变</b>；最多 4 个人一起跑。</p>' +
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

    // 固定入口：地址永远不变。隧道每次换址由启动脚本同步到 GitHub，
    // 客户端打开这个网址会自己读到最新地址，所以旧链接不会失效。
    fixedUrl() {
      const c = PH.Config || {};
      // 永远用游戏厅那个不变的地址：房主不管是在 localhost、隧道地址还是 Pages 上建房，
      // 发给朋友的都是同一条链接，隧道换了也不会失效。
      if (c.gameUrl) return c.gameUrl;
      return location.href.split('#')[0].split('?')[0];
    },

    // 备用网址：自定义域名在有些网络里解析不了时，GitHub Pages 官方地址一定可达
    backupUrl() {
      const c = PH.Config || {};
      return c.gameUrlAlt && c.gameUrlAlt !== c.gameUrl ? c.gameUrlAlt : '';
    },

    hostOf(u) {
      try { return new URL(u).hostname; } catch (e) { return String(u || ''); }
    },

    inviteUrl() {
      // Cloudflare 地址固定，邀请链接永远指向同一个服务器，
      // 不能让一条碰巧更快、但随时会关机的旧本机隧道混进 server= 里。
      const cloud = PH.Hub && PH.Hub.cloudUrl ? PH.Hub.cloudUrl() : '';
      const pub = cloud || this.publicEndpoint();
      const base = this.fixedUrl().replace(/\?.*$/, '');
      const q = [];
      if (pub) q.push('server=' + encodeURIComponent(pub));
      q.push('room=' + encodeURIComponent(PH.Net.room || ''));
      return base + (base.indexOf('?') >= 0 ? '&' : '?') + q.join('&');
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
      const fixed = this.fixedUrl();
      const invite =
        '<div class="acc-field on-invite"><label>' +
        (hasPub
          ? '邀请链接 · 手机 / 平板 / 别的电脑，各自用流量或任意 Wi-Fi 都能进'
          : '邀请链接 · 当前网络连不上 Cloudflare，恢复后可直接进') +
        '</label>' +
        '<div class="acc-inline"><input id="onInvite" readonly value="' + esc(this.inviteUrl()) + '" />' +
        '<button class="acc-btn mini" data-act="invite">复制</button></div>' +
        '<div class="acc-inline on-fixed"><input id="onFixed" readonly value="' + esc(fixed) + '" />' +
        '<button class="acc-btn mini" data-act="fixed">固定网址</button></div>' +
        (this.backupUrl()
          ? '<button class="acc-btn ghost mini on-backup" data-act="backup">备用网址 · ' +
            esc(this.hostOf(this.backupUrl())) + '</button>'
          : '') +
        '<p class="acc-tip on-cross">固定网址和 Cloudflare 服务器地址都永远不变，' +
        '朋友不用重新要链接，只报个房号也能进。<br>' +
        '<b>服务器在云端常驻，房主电脑关机也不影响，三台设备彼此不在同一个局域网也照样联机。</b></p>' +
        '</div>';

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
          else if (act === 'fixed') this.copyFixed();
          else if (act === 'backup') this.copyBackup();
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
          ok ? '服务器已连上：' + PH.Hub.endpoint : '连不上 Cloudflare 服务器，检查网络后会自动重连',
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

    copyFixed() {
      const input = document.getElementById('onFixed');
      const url = input ? input.value : this.fixedUrl();
      if (input) {
        input.select();
        input.setSelectionRange(0, url.length);
      }
      const done = () => this.flash('固定网址已复制：' + url + '（报房号 ' + PH.Net.room + ' 给朋友就行）', false);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => {
          try { document.execCommand('copy'); done(); } catch (e) { this.flash('请手动复制上面的固定网址', true); }
        });
      } else {
        try { document.execCommand('copy'); done(); } catch (e) { this.flash('请手动复制上面的固定网址', true); }
      }
    },

    copyBackup() {
      const url = this.backupUrl();
      if (!url) return;
      const done = () => this.flash('备用网址已复制：' + url + '（房号 ' + PH.Net.room + '）', false);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => this.flash('备用网址：' + url, false));
      } else this.flash('备用网址：' + url, false);
    },

    startRace() {
      if (!PH.Net.isHost()) return;
      if (PH.Net.players.length < 2) {
        this.flash('至少两个人才能开赛，把邀请链接发给朋友吧', true);
        return;
      }
      // 开赛统一走 game.js：先给本轮世界定一个编号，再通知所有人，
      // 免得上一轮「怪物死了 / 道具没了」的迟到消息串到新一局
      if (PH.beginOnlineRace) PH.beginOnlineRace(this.level);
      else {
        PH.Net.relay({ k: 'start', level: this.level });
        this.close();
        if (PH.startOnlineRace) PH.startOnlineRace(this.level);
      }
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
