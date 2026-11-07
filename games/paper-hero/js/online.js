/* 纸片勇者 — 联机面板（DOM 覆盖层）
 * 建房 / 进房 / 选赛道 / 开赛，界面复用纸片风格的 .acc-* 样式。
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
        this.lead.textContent = '两台设备跑同一张图，谁先到终点谁赢';
        this.body.innerHTML = this.homeHtml();
        this.foot.innerHTML = this.originHint();
      } else if (this.mode === 'room') {
        const host = N.isHost();
        this.title.textContent = '房间 ' + esc(N.room);
        this.lead.textContent = host ? '把房号报给朋友，等他进来就能开赛' : '等房主开始比赛';
        this.body.innerHTML = this.roomHtml(host);
        this.foot.textContent = N.players.length + ' / 4 人 · 延迟 ' + (N.rtt ? N.rtt + ' ms' : '—');
      } else {
        this.title.textContent = '联机不上';
        this.lead.textContent = '先把联机服务打开再试一次';
        this.body.innerHTML =
          '<p class="acc-msg err">' + esc(N.error || '连不上联机服务') + '</p>' +
          '<button class="acc-btn primary" data-act="retry">再试一次</button>' +
          '<p class="acc-tip">在游戏目录里双击「启动游戏.command」，它会同时开好网页和联机服务；' +
          '如果是另一台设备，用房间面板底下那个地址打开。</p>';
        this.foot.textContent = '';
      }
      this.wire();
    },

    originHint() {
      const http = location.protocol === 'http:' || location.protocol === 'https:';
      if (!http) return '联机需要先启动服务：双击「启动游戏.command」';
      return '同一 Wi-Fi 下，让朋友用这个地址打开：<b>' + esc(location.origin) + '</b>';
    },

    homeHtml() {
      const last = PH.U && PH.U.store ? PH.U.store.get('lastRoom', '') : '';
      const hub = PH.Hub || {};
      const down = hub.status === 'offline';
      if (down) {
        return (
          '<p class="acc-msg err">联机服务现在是关着的</p>' +
          '<p class="acc-tip">这台电脑上的小服务没开（或者隧道断了），所以联机房间先停用。<br>' +
          '单机关卡、双人同屏都不受影响，照常能玩。<br>' +
          '要联机就在那台电脑上跑 <b>tools/tunnel.sh</b>，它会自己把新地址同步到 GitHub。</p>' +
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
        '<p class="acc-tip">联机只在这台电脑所在的局域网里。开服务的那台电脑建房，其他设备用上面的地址打开游戏、输入房号就能进来。最多 4 个人一起跑。</p>'
      );
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

      return (
        '<div class="on-code"><span>房号</span><b>' + esc(N.room) + '</b>' +
        '<button class="acc-btn mini" data-act="copy">复制</button></div>' +
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
          else if (act === 'start') this.startRace();
          else if (act === 'leave') this.leave();
          else if (act === 'retry') {
            PH.Net.status = 'idle';
            this.mode = 'home';
            this.render();
            if (PH.Hub) {
              PH.Hub.discover().then((ok) => {
                this.mode = ok ? 'home' : 'error';
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
      const code = (input ? input.value : '').trim().toUpperCase();
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

    startRace() {
      if (!PH.Net.isHost()) return;
      if (PH.Net.players.length < 2) {
        this.flash('至少两个人才能开赛，把房号发给朋友吧', true);
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
