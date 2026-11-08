/* 纸片勇者 — 游戏厅桥接层
 *
 * 这个文件负责三件事：
 *   1. 找到「本机服务」现在在哪：读同目录 endpoint.json，逐个 /health 探活，挑最快的那个。
 *      endpoint.json 由本机的 tools/tunnel.py 在每次隧道重启后自动更新到 GitHub。
 *      **本机那台电脑就是服务器**：Cloudflare 快速隧道把它映射到公网，
 *      设备 A / 设备 B 不用在同一个局域网，只要都连到同一个隧道地址就能进同一个房间。
 *      邀请链接里的 ?server= 可以强制指定服务器，避免朋友误连到他自己电脑上的服务。
 *   2. 账号：用游戏厅（../../arcade.js）的账号，有账号才把进度存到本机服务上。
 *   3. 服务没开 / 探测失败 → 整个联机和账号系统静默关掉，游戏照常单机玩。
 */
(function (PH) {
  const K_SERVER = 'paperhero.server'; // 手动/邀请指定的服务器地址
  const H = (PH.Hub = {
    status: 'idle', // idle | probing | online | offline
    endpoint: '',
    endpoints: [],
    candidates: [],
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

    /* ---------------- 端点发现 ---------------- */
    async loadCandidates() {
      const list = [];
      const manual = this.manual();
      const here = location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : '';
      // 自己开服务（页面就在服务根目录）时，同源就是最稳的；
      // 挂在游戏厅 /games/ 下面时同源是 Pages，探它只会 404，跳过
      if (here && !/\/games\//.test(location.pathname)) list.push(here);
      try {
        const r = await fetch('endpoint.json?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          (j.endpoints || []).forEach((u) => list.push(String(u).replace(/\/+$/, '')));
        }
      } catch (e) {
        /* Pages 上拿不到就当没有 */
      }
      // 本机直连兜底：只有双击 file:// 或页面本来就开在这台电脑上时才加。
      // 公网页面绝不能探 localhost，否则朋友会连到他自己电脑的服务、房号永远对不上。
      const localHost =
        location.protocol === 'file:' ||
        /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
      // 页面本身就由那台服务发出时，同源地址已经在列表里，别再塞一个等价的 localhost 造成两端选路不一致
      const hereIsServer = !!here && !/\/games\//.test(location.pathname) && /^(localhost|127\.0\.0\.1)/.test(location.hostname);
      if (!manual && localHost && !hereIsServer) list.push('http://localhost:8777');
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
      this.status = 'probing';
      this.lastError = '';
      this.emit('change');
      this.candidates = await this.loadCandidates();
      const hits = (await Promise.all(this.candidates.map((ep) => this.probe(ep)))).filter(Boolean);
      hits.sort((a, b) => a.ms - b.ms);
      if (!hits.length) {
        this.status = 'offline';
        this.endpoint = '';
        this.rtt = 0;
        this.lastError = '本机服务没开，联机关掉；账号改用离线密钥验证';
        this.loadAccount();
        this.emit('change');
        return false;
      }
      // 两台设备必须连同一台服务器，房号才对得上：邀请链接 / 手动指定的地址只要活着就强制选它
      const manual = this.manual();
      const forced = manual && hits.find((h) => h.ep === manual);
      const best = forced || hits[0];
      this.endpoint = best.ep;
      this.endpoints = hits.map((h) => h.ep);
      this.rtt = best.ms;
      this.status = 'online';
      this.loadAccount();
      this.emit('change');
      return true;
    },

    async boot() {
      try {
        return await this.discover();
      } catch (e) {
        this.status = 'offline';
        this.lastError = (e && e.message) || '探测失败';
        this.emit('change');
        return false;
      }
    },

    // 联机中途掉线：换下一个健康端点；都不行就重读 endpoint.json
    async failover(badEndpoint) {
      const rest = (this.endpoints || []).filter((e) => e !== badEndpoint);
      const hits = (await Promise.all(rest.map((e) => this.probe(e, 2000)))).filter(Boolean);
      if (hits.length) {
        this.endpoint = hits[0].ep;
        this.rtt = hits[0].ms;
        this.status = 'online';
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

    // 云端存档：必须服务在线 + 有主页账号；离线时进度只存本机
    useAccount() {
      return this.status === 'online' && !!this.account && !!window.Arcade;
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
