/* 纸片勇者 — 游戏厅桥接层
 *
 * 这个文件负责三件事：
 *   1. 找到「本机服务」现在在哪：读同目录 endpoint.json，逐个 /health 探活，挑最快的那个。
 *      endpoint.json 由本机的 tools/publish-endpoint.py 在每次隧道重启后自动更新到 GitHub。
 *   2. 账号：用游戏厅（../../arcade.js）的账号，有账号才把进度存到本机服务上。
 *   3. 服务没开 / 探测失败 → 整个联机和账号系统静默关掉，游戏照常单机玩。
 */
(function (PH) {
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

    /* ---------------- 端点发现 ---------------- */
    async loadCandidates() {
      const list = [];
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
      // 本机直连兜底（file:// 双击打开时也能用）
      list.push('http://localhost:8777');
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
        this.lastError = '本机服务没开，联机和账号都先关掉';
        this.emit('change');
        return false;
      }
      this.endpoint = hits[0].ep;
      this.endpoints = hits.map((h) => h.ep);
      this.rtt = hits[0].ms;
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
    loadAccount() {
      let a = null;
      try {
        if (window.Arcade && window.Arcade.current) a = window.Arcade.current();
      } catch (e) {}
      this.account = a ? { name: a.name, invited: !!a.invited } : null;
      if (this.account && PH.Profiles && PH.Profiles.bindAccount) {
        PH.Profiles.bindAccount(this.account.name);
      }
    },

    hasArcade() {
      return !!(window.Arcade && window.Arcade.current);
    },

    // 有服务器 + 有账号 = 走账号；否则纯本机档案
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
