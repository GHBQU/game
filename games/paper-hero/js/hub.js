/* 纸片勇者 — 游戏厅桥接层
 *
 * 联机拓扑（默认全走 Cloudflare，房主电脑不用开机）：
 *
 *   手机(流量) ┐
 *   平板(别的 Wi-Fi) ┼──> 固定游戏网址 ─wss─> Cloudflare Worker + Durable Object ─> 同一个房间
 *   电脑(别的城市) ┘
 *
 * 1. 端点发现：优先探 js/cloud.js 里的固定 Cloudflare 地址；
 *    只有它不通才去读 js/config.js / endpoint.json 里的旧本机隧道地址（可选兜底）。
 * 2. ?server= 可强制指定（邀请链接用它，失效时自动回退）。
 *    Cloudflare 地址固定，不需要每次重启更新，也不会出现旧链接失效。
 * 3. 账号：服务在线时存在 Cloudflare Durable Object，兼容游戏厅（../../arcade.js）账号；
 *    所有服务器都不在线才退回本机浏览器凭据 + 离线密钥。
 */
(function (PH) {
  const K_SERVER = 'paperhero.server'; // 手动/邀请指定的服务器地址
  const H = (PH.Hub = {
    status: 'idle', // idle | probing | online | offline
    endpoint: '',
    endpoints: [],
    candidates: [],
    serverId: '',
    rtt: 0,
    account: null,
    lastError: '',
    on: null, // (type, data) => void
    _tried: 0,

    emit(type, data) {
      if (this.on) this.on(type, data);
    },

    /* ---------------- 指定服务器（邀请链接 / 手动填写） ---------------- */
    normalize(u) {
      u = String(u || '').trim().replace(/\/+$/, '');
      if (!u) return '';
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u; // 隧道地址都是 https
      try {
        const x = new URL(u);
        if (!/^https?:$/.test(x.protocol)) return '';
        return x.origin;
      } catch (e) {
        return '';
      }
    },

    // Cloudflare Worker 固定地址：填在 js/cloud.js，不随隧道换址
    cloudUrl() {
      return this.normalize(PH.Config && PH.Config.cloudUrl);
    },

    // 邀请链接 ?server= 优先级最高，并记到本机，刷新后仍连同一台服务器
    manual() {
      try {
        const q = new URLSearchParams(location.search);
        const fromUrl = this.normalize(q.get('server') || q.get('s') || '');
        if (fromUrl) {
          try { localStorage.setItem(K_SERVER, fromUrl); } catch (e) {}
          return fromUrl;
        }
        return this.normalize(localStorage.getItem(K_SERVER) || '');
      } catch (e) {
        return '';
      }
    },

    setManual(u) {
      const v = this.normalize(u);
      try {
        if (v) localStorage.setItem(K_SERVER, v);
        else localStorage.removeItem(K_SERVER);
      } catch (e) {}
      // URL 上还留着 ?server= 时，以新填的为准
      try {
        const q = new URLSearchParams(location.search);
        if (q.has('server') || q.has('s')) {
          q.delete('server'); q.delete('s');
          const s = q.toString();
          history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
        }
      } catch (e) {}
      return v;
    },

    /* ---------------- 从 GitHub 读「当前隧道地址」 ---------------- */
    // 这些地址写在 js/config.js，由「启动游戏.command」的配置区生成。
    // 隧道每次换址，tunnel.py 都会更新 GitHub 上那份 endpoint.json。
    feeds() {
      const c = PH.Config || {};
      const out = [];
      const add = (u) => {
        if (u && out.indexOf(u) < 0) out.push(String(u));
      };
      (c.endpointFeeds || []).forEach(add);
      add('endpoint.json'); // 同目录兜底：本机 / 单文件版 / Pages 缓存
      return out;
    },

    decodeApiContent(s) {
      const bin = atob(String(s).replace(/\s/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      try {
        return new TextDecoder('utf-8').decode(bytes);
      } catch (e) {
        return bin;
      }
    },

    // 加随机参数绕开 GitHub / CDN 的缓存，保证换址后几秒内就能读到新地址。
    // 每个源单独超时：某个源卡住或超时，其它源照常返回结果。
    async readFeed(url) {
      const sep = url.indexOf('?') >= 0 ? '&' : '?';
      const bust = '_=' + Date.now() + Math.random().toString(36).slice(2, 7);
      let ctrl = null;
      let timer = null;
      try {
        ctrl = new AbortController();
        timer = setTimeout(() => {
          try { ctrl.abort(); } catch (e) {}
        }, 3200);
      } catch (e) {}
      try {
        const r = await fetch(url + sep + bust, {
          cache: 'no-store',
          signal: ctrl ? ctrl.signal : undefined,
        });
        if (!r.ok) return null;
        let j = await r.json();
        if (j && j.content && j.encoding === 'base64') j = JSON.parse(this.decodeApiContent(j.content));
        if (!j || !Array.isArray(j.endpoints)) return null;
        return {
          updated: +j.updated || 0,
          endpoints: j.endpoints.map((u) => String(u).replace(/\/+$/, '')).filter(Boolean),
        };
      } catch (e) {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },

    async readFeeds() {
      const rs = await Promise.all(this.feeds().map((u) => this.readFeed(u).catch(() => null)));
      const list = [];
      let updated = 0;
      rs.filter(Boolean).forEach((r) => {
        updated = Math.max(updated, r.updated);
        r.endpoints.forEach((u) => {
          if (list.indexOf(u) < 0) list.push(u);
        });
      });
      if (updated > (this.feedUpdated || 0)) this.feedUpdated = updated;
      return { updated: this.feedUpdated || 0, endpoints: list };
    },

    /* ---------------- 端点发现 ---------------- */
    async loadCandidates() {
      const list = [];
      const manual = this.manual();
      const here = location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : '';
      // 页面直接从隧道地址打开时，同源就是那台服务器；
      // 挂在游戏厅 /games/ 下面时同源是 Pages，探它只会 404，跳过
      if (here && !/\/games\//.test(location.pathname)) list.push(here);
      // GitHub 上的实时地址表：手机 / 平板 / 别的电脑都从这儿拿到当前隧道地址
      try {
        const f = await this.readFeeds();
        f.endpoints.forEach((u) => list.push(u));
      } catch (e) {
        /* 拿不到就继续用下面的兜底 */
      }
      // 本机直连兜底：只有双击 file:// 或页面本来就开在这台电脑上时才加。
      // 公网页面绝不能探 localhost，否则朋友会连到他自己电脑的服务、房号永远对不上。
      const localHost =
        location.protocol === 'file:' ||
        /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
      // 页面本身就由那台服务发出时，同源地址已经在列表里，别再塞一个等价的 localhost 造成两端选路不一致
      const hereIsServer = !!here && !/\/games\//.test(location.pathname) && /^(localhost|127\.0\.0\.1)/.test(location.hostname);
      if (!manual && localHost && !hereIsServer) list.push('http://localhost:8777');
      const cloud = this.cloudUrl();
      if (cloud) list.unshift(cloud);
      if (manual) list.unshift(manual);
      const out = [];
      list.forEach((u) => {
        if (u && out.indexOf(u) < 0) out.push(u);
      });
      return out;
    },

    probe(ep, timeoutMs) {
      return new Promise((resolve) => {
        let done = false;
        const t0 = Date.now();
        const finish = (v) => {
          if (done) return;
          done = true;
          resolve(v);
        };
        let ctrl = null;
        try {
          ctrl = new AbortController();
          setTimeout(() => {
            try {
              ctrl.abort();
            } catch (e) {}
          }, timeoutMs || 2600);
        } catch (e) {}
        fetch(ep + '/health', { signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j && j.ok && (!j.app || j.app === 'paper-hero')) finish({ ep, ms: Date.now() - t0, info: j });
            else finish(null);
          })
          .catch(() => finish(null));
      });
    },

    async discover() {
      const prev = this.status;
      const ok = await this._discover();
      // 服务器从「关着」变「开着」（或反过来）时，开着的联机面板要自己刷新，
      // 朋友不必手动点「重新检测」或刷新网页。
      if (prev !== this.status && PH.Online && PH.Online.opened) {
        try {
          PH.Online.mode = PH.Net && PH.Net.room ? 'room' : this.status === 'online' ? 'home' : 'error';
          PH.Online.render();
        } catch (e) {}
      }
      // 朋友提前把邀请链接开着、房主还没开机：服务器一上线就自动把房间加回来，
      // 不用刷新网页、不用重新点链接。
      if (prev === 'offline' && this.status === 'online' && PH.Online && PH.Online.pendingRoom) {
        try {
          if (!(PH.Net && PH.Net.room) && !PH.Online.busy) {
            PH.Online._inviteDone = false;
            PH.Online.consumeInvite();
          }
        } catch (e) {}
      }
      return ok;
    },

    async _discover() {
      this.status = 'probing';
      this.lastError = '';
      this.emit('change');
      this.candidates = await this.loadCandidates();
      const hits = (await Promise.all(this.candidates.map((ep) => this.probe(ep)))).filter(Boolean);
      hits.sort((a, b) => a.ms - b.ms);
      if (!hits.length) {
        this.status = 'offline';
        this.endpoint = '';
        this.serverId = '';
        this.rtt = 0;
        this.lastError = 'Cloudflare / 本机服务都没连上，联机关掉；账号改用离线密钥验证';
        this.loadAccount();
        this.emit('change');
        return false;
      }
      // 两台设备必须连同一台服务器，房号才对得上：
      // 邀请链接 / 手动指定 > Cloudflare 固定地址 > 最快端点（本机隧道兜底）
      const manual = this.manual();
      const forced = manual && hits.find((h) => h.ep === manual);
      const cloud = this.cloudUrl();
      const cloudHit = cloud && hits.find((h) => h.ep === cloud);
      const best = forced || cloudHit || hits[0];
      this.endpoint = best.ep;
      this.endpoints = hits.map((h) => h.ep);
      this.serverId = (best.info && best.info.sid) || '';
      this.rtt = best.ms;
      this.status = 'online';
      this.loadAccount();
      // 本机浏览器里已有的账号摘要，补写到房主这台电脑上（每台服务器只补一次）
      if (PH.Identity && PH.Identity.syncLocalToServer) {
        try { PH.Identity.syncLocalToServer(); } catch (e) {}
      }
      if (PH.Identity && PH.Identity.refreshServerAccounts) {
        try { PH.Identity.refreshServerAccounts(); } catch (e) {}
      }
      this.emit('change');
      return true;
    },

    async boot() {
      let ok = false;
      try {
        ok = await this.discover();
      } catch (e) {
        this.status = 'offline';
        this.lastError = (e && e.message) || '探测失败';
        this.emit('change');
      }
      this.startWatcher();
      return ok;
    },

    /* ---------------- 「只要服务器开着就行」的自动守候 ----------------
     * 公网页面才开：手机 / 平板 / 别的电脑可以把固定网址一直开着，
     * 房主一启动服务器（或隧道换了地址），页面会自己连上去，不用刷新、不用重发链接。
     * 本地 / file:// 页面保持一次性探测，避免开发调试时反复抢服务器。 */
    isPublicPage() {
      if (location.protocol === 'file:') return false;
      const h = location.hostname || '';
      return !/^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
    },

    startWatcher() {
      if (this._watcher || !this.isPublicPage()) return;
      this._tick = 0;
      this._watcher = setInterval(async () => {
        this._tick++;
        // 离线时每 8 秒找一次服务器；在线后降到 32 秒巡检，别给 GitHub / CDN 添压力
        if (this.status === 'online' && this._tick % 4 !== 0) return;
        try {
          if (this.status === 'offline') {
            await this.discover(); // 服务器开了没？自动重试
            return;
          }
          if (this.status !== 'online') return;
          // 隧道换地址：看 GitHub 地址表里有没有没见过的新地址
          const f = await this.readFeeds();
          const fresh = f.endpoints.some((u) => (this.candidates || []).indexOf(u) < 0);
          if (fresh) {
            if (!(PH.Net && PH.Net.room)) await this.discover();
            return;
          }
          // 当前这条隧道挂了：立刻换到还活着的那条
          const alive = await this.probe(this.endpoint, 2200);
          if (!alive) await this.discover();
        } catch (e) {
          /* 网络抖一下，下一轮再来 */
        }
      }, 8000);
    },

    stopWatcher() {
      if (this._watcher) clearInterval(this._watcher);
      this._watcher = null;
    },

    // 联机中途掉线：换下一个健康端点；都不行就重读 endpoint.json
    async failover(badEndpoint) {
      const rest = (this.endpoints || []).filter((e) => e !== badEndpoint);
      const hits = (await Promise.all(rest.map((e) => this.probe(e, 2000)))).filter(Boolean);
      if (hits.length) {
        this.endpoint = hits[0].ep;
        this.serverId = (hits[0].info && hits[0].info.sid) || this.serverId;
        this.rtt = hits[0].ms;
        this.status = 'online';
        this.loadAccount();
        if (PH.Identity && PH.Identity.refreshServerAccounts) {
          try { PH.Identity.refreshServerAccounts(); } catch (e) {}
        }
        this.emit('change');
        return true;
      }
      return this.discover();
    },

    /* ---------------- 账号 ---------------- */
    // 账号一律来自游戏厅主页（或离线密钥验证后的本机账号），游戏内不注册。
    // 服务器在不在线都要把账号绑到同名档案上，只是「云端同步」需要服务在线。
    loadAccount() {
      const u = PH.Identity ? PH.Identity.current() : null;
      let invited = false;
      try {
        const a = window.Arcade && window.Arcade.current ? window.Arcade.current() : null;
        invited = !!(a && a.invited);
      } catch (e) {}
      this.account = u ? { name: u.name, invited } : null;
      if (u && PH.Identity.bind) PH.Identity.bind();
      if (PH.Account && PH.Account.opened) PH.Account.render();
      return this.account;
    },

    hasArcade() {
      return !!(window.Arcade && window.Arcade.current);
    },

    // 本机服务器存档：服务在线 + 已登录（账号可以来自本机服务器，也可以是游戏厅主页）
    useAccount() {
      return this.status === 'online' && !!this.account;
    },

    displayName() {
      if (this.account) return this.account.name;
      return (PH.Profiles && PH.Profiles.name()) || '玩家';
    },

    // 服务开着但没登录/没邀请码/不在开放时间 → 回游戏厅处理
    gateCode() {
      if (this.status !== 'online') return ''; // 服务没开：不要账号系统
      if (!window.Arcade || !window.Arcade.status) return '';
      try {
        const st = window.Arcade.status();
        return st.ok ? '' : st.code;
      } catch (e) {
        return '';
      }
    },

    /* ---------------- 云端（本机）存档 ---------------- */
    async pullSave() {
      if (!this.useAccount()) return null;
      try {
        const r = await fetch(this.endpoint + '/api/save?account=' + encodeURIComponent(this.account.name), {
          cache: 'no-store',
        });
        const j = await r.json();
        return j && j.ok ? j.data : null;
      } catch (e) {
        return null;
      }
    },

    async pushSave(data) {
      if (!this.useAccount()) return false;
      try {
        const r = await fetch(this.endpoint + '/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: this.account.name, data }),
        });
        const j = await r.json();
        return !!(j && j.ok);
      } catch (e) {
        return false;
      }
    },

    /* ---------------- 给 net.js 用 ---------------- */
    wsUrl() {
      if (this.endpoint) return this.endpoint.replace(/^http/, 'ws') + '/ws';
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + (location.host || 'localhost:8777') + '/ws';
    },
  });
})(window.PH);
