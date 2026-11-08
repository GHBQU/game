/* 纸片勇者 — 账号桥接：和游戏厅主页共用账号
 *
 * 规则（按需求）：
 *   1. 游戏里不注册。账号优先来自 Cloudflare Durable Object，
 *      其次是本机兜底服务 data/accounts.json、游戏厅主页（arcade.js）；
 *      档案按账号名共用。
 *   2. 服务在线：用户名 + 加盐摘要存在 Cloudflare，手机 / 平板 / 别的电脑
 *      都能用同一个账号登录；登录成功后本机再镜像一份，供离线兜底。
 *      只存摘要，不存明文密码。
 *   3. 所有服务器都不在线时，不走服务器验证，改用密钥验证：
 *      #include<bits/stdc++.h>
 *      验证通过后才能用本机保存的账号进入；不验证也能照常单机玩。
 */
(function (PH) {
  'use strict';

  const SECRET = '#include<bits/stdc++.h>';
  const K_CRED = 'paperhero.credentials.v1';   // { 用户名小写: {name, salt, hash, at} }
  const K_KEY = 'paperhero.offlinekey.v1';     // 密钥通过的标志（只存摘要）
  const K_SES = 'paperhero.offlinesession.v1'; // 离线会话 { name, at }
  const K_SSES = 'paperhero.serversession.v1'; // 本机服务器会话 { name, at }
  const K_ARCADE_ACC = 'arcade.accounts.v1';

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }
  function del(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* 摘要算法和主页 arcade.js 保持一致，才能用主页存的 hash 校验密码 */
  function fnv(str) {
    let h1 = 0x811c9dc5, h2 = 0x01000193, i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0;
      h1 = (h1 * 16777619) >>> 0;
      h2 = ((h2 << 5) + h2 + c) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }
  function hashRaw(str) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        const bytes = new TextEncoder().encode(str);
        return crypto.subtle.digest('SHA-256', bytes)
          .then((buf) => Array.prototype.map.call(new Uint8Array(buf), (b) => pad2(b.toString(16))).join(''))
          .catch(() => fnv(str));
      } catch (e) { /* 老浏览器落到 fnv */ }
    }
    return Promise.resolve(fnv(str));
  }
  const pwHash = (pw, salt) => hashRaw(salt + '|' + pw + '|arcade-v1');
  function newSalt() {
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint8Array(8);
      crypto.getRandomValues(a);
      return Array.prototype.map.call(a, (b) => pad2(b.toString(16))).join('');
    }
    return String(Date.now()) + String(Math.random()).slice(2, 10);
  }

  const I = (PH.Identity = {
    SECRET,

    /* ---------------- 主页账号 ---------------- */
    hasArcade() {
      return !!(window.Arcade && typeof window.Arcade.current === 'function');
    },

    arcadeUser() {
      if (!this.hasArcade()) return null;
      try {
        const a = window.Arcade.current();
        return a && a.name ? { name: a.name, invited: !!a.invited } : null;
      } catch (e) {
        return null;
      }
    },

    // 服务在线时不用密钥；探测中 / 离线时都要密钥
    serverOnline() {
      return !!(PH.Hub && PH.Hub.status === 'online');
    },
    needKey() {
      return !this.serverOnline();
    },

    homeUrl() {
      if (/\/games\//.test(location.pathname)) return '../../';
      return '';
    },

    /* ---------------- 本机凭据（主页注册时保存的账号） ---------------- */
    syncArcadeAccounts() {
      const src = get(K_ARCADE_ACC, {});
      const dst = get(K_CRED, {});
      let changed = false;
      Object.keys(src || {}).forEach((k) => {
        const a = src[k];
        if (!a || !a.name || !a.salt || !a.hash) return;
        const key = String(a.name).toLowerCase();
        if (!dst[key]) {
          dst[key] = { name: a.name, salt: a.salt, hash: a.hash, at: Date.now(), from: 'arcade' };
          changed = true;
        }
      });
      if (changed) set(K_CRED, dst);
      return dst;
    },

    credentials() {
      return this.syncArcadeAccounts();
    },

    names() {
      const c = this.credentials();
      const out = [];
      const seen = {};
      const push = (n) => {
        const name = String(n || '').trim();
        const key = name.toLowerCase();
        if (!name || seen[key]) return;
        seen[key] = true;
        out.push(name);
      };
      Object.keys(c).forEach((k) => push(c[k].name));
      // 本机服务器上保存的账号也列出来：换设备后不用重新猜用户名
      (this.serverNames || []).forEach(push);
      return out;
    },

    // 游戏里登录成功时，把这次用到的凭据留一份在本机（离线兜底）
    async remember(name, pw) {
      const n = String(name || '').trim();
      if (!n || !pw) return false;
      const all = this.credentials();
      const key = n.toLowerCase();
      if (all[key]) return true; // 主页已经存过了
      const salt = newSalt();
      const hash = await pwHash(String(pw), salt);
      all[key] = { name: n, salt, hash, at: Date.now(), from: 'game' };
      return set(K_CRED, all);
    },

    // 已经拿到 salt/hash（服务器验证通过 / 从服务器导入）时，直接镜像到本机
    rememberHash(name, salt, hash, from) {
      const n = String(name || '').trim();
      if (!n || !salt || !hash) return false;
      const all = this.credentials();
      all[n.toLowerCase()] = { name: n, salt, hash, at: Date.now(), from: from || 'server' };
      return set(K_CRED, all);
    },

    // 用本机保存的摘要核对密码（离线验证 / 首次迁移用）
    verifyPassword(name, pw) {
      const all = this.credentials();
      const c = all[String(name || '').trim().toLowerCase()];
      if (!c) return Promise.resolve(false);
      return pwHash(String(pw || ''), c.salt).then((h) => h === c.hash);
    },

    /* ---------------- 本机服务器上的账号 ----------------
     * 服务在线：账号密码（只存加盐摘要）写到房主这台电脑的 data/accounts.json，
     * 手机 / 平板 / 别的电脑都能用同一个账号登录。
     * 服务离线：自动退回上面的本机浏览器凭据，不联网也能登录。
     */
    serverNames: [],
    serverBase() {
      return PH.Hub && PH.Hub.status === 'online' && PH.Hub.endpoint ? PH.Hub.endpoint : '';
    },
    serverKey() {
      return (PH.Hub && PH.Hub.serverId) || '';
    },
    serverLabel() {
      const ep = (PH.Hub && PH.Hub.endpoint) || '';
      return /workers\.dev\/?$/i.test(ep) ? 'Cloudflare' : '本机服务器';
    },
    setServerSession(name) {
      set(K_SSES, { name: String(name || '').trim(), sid: this.serverKey(), at: Date.now() });
      del(K_SES);
      // 让右上角档案 / 云存档立刻切到这个账号
      if (PH.Hub && PH.Hub.loadAccount) PH.Hub.loadAccount();
    },

    async serverJson(path, body) {
      const base = this.serverBase();
      if (!base) return { ok: false, msg: '服务器不在线' };
      const opt = { cache: 'no-store' };
      if (body) {
        opt.method = 'POST';
        opt.headers = { 'Content-Type': 'application/json' };
        opt.body = JSON.stringify(body);
      }
      try {
        const r = await fetch(base + path, opt);
        const j = await r.json();
        return j && typeof j === 'object' ? j : { ok: false, msg: '服务器没有回应' };
      } catch (e) {
        return { ok: false, msg: '连不上服务器' };
      }
    },

    // 登录框里的候选账号：本机 + 服务器
    async refreshServerAccounts() {
      if (!this.serverBase()) {
        this.serverNames = [];
        return this.serverNames;
      }
      const r = await this.serverJson('/api/accounts');
      if (r && r.ok && Array.isArray(r.accounts)) {
        this.serverNames = r.accounts.map((a) => a && a.name).filter(Boolean);
        if (PH.Account && PH.Account.opened) PH.Account.render();
      }
      return this.serverNames;
    },

    // 服务从离线变在线：把本机浏览器里已有的账号摘要补写到房主电脑上。
    // 只在同一台服务器上补一次，避免自动守候每次探测都重复提交。
    async syncLocalToServer() {
      const base = this.serverBase();
      if (!base) return false;
      if (this._syncedBase === base) return true;
      this._syncedBase = base;
      const all = this.credentials();
      const jobs = Object.keys(all).map((k) => {
        const c = all[k];
        if (!c || !c.name || !c.salt || !c.hash) return Promise.resolve(null);
        return this.serverJson('/api/account/import', {
          name: c.name,
          salt: c.salt,
          hash: c.hash,
        });
      });
      await Promise.all(jobs);
      this.refreshServerAccounts();
      return true;
    },

    async serverAccount(name) {
      return this.serverJson('/api/account?name=' + encodeURIComponent(String(name || '').trim()));
    },

    /* ---------------- 离线密钥 ---------------- */
    keyOk(input) {
      return String(input == null ? '' : input).trim() === SECRET;
    },
    keyVerified() {
      return get(K_KEY, null) === fnv('paperhero-key|' + SECRET);
    },
    verifyKey(input) {
      if (!this.keyOk(input)) return false;
      return set(K_KEY, fnv('paperhero-key|' + SECRET));
    },
    clearKey() { del(K_KEY); },

    /* ---------------- 当前身份 ---------------- */
    current() {
      const a = this.arcadeUser();
      // 服务在线：优先用本机服务器验证过的账号，其次才是主页会话。
      // 会话记了服务器编号：换到另一台服务器后不会假装还登着。
      if (!this.needKey()) {
        const s = get(K_SSES, null);
        const sid = this.serverKey();
        if (s && s.name && (!s.sid || !sid || s.sid === sid)) return { name: s.name, source: 'server' };
        if (a && a.name) return { name: a.name, source: 'arcade' };
        return null;
      }
      // 服务离线：不管主页有没有登录，都先过密钥验证才算数
      if (!this.keyVerified()) return null;
      const s = get(K_SES, null);
      const name = (a && a.name) || (s && s.name);
      if (name) return { name, source: 'offline' };
      return null;
    },

    // 账号名 → 同名档案，让存档和主页账号共用
    bind() {
      const u = this.current();
      if (!u || !PH.Profiles || !PH.Profiles.bindAccount) return u;
      PH.Profiles.bindAccount(u.name);
      return u;
    },

    /* ---------------- 登录 / 退出 ---------------- */
    // 服务在线：先让本机服务器核对；服务器上还没有这个账号时，
    // 用本机已保存的摘要 / 游戏厅主页账号验证一次，通过后补写到服务器。
    async loginOnline(name, pw) {
      const n = String(name || '').trim();
      const p = String(pw || '');
      if (!n || !p) return { ok: false, msg: '用户名和密码都要填。' };
      if (!this.serverBase()) return this.loginArcade(n, p);
      const first = await this.serverLogin(n, p);
      if (first.ok) {
        await this.syncArcadeSession(n, p);
        return first;
      }
      // 服务器还是旧版 / 正好网络抖了一下：主页账号仍可在本机登录
      if (!first.code) return this.hasArcade() ? this.loginArcade(n, p) : first;
      if (first.code !== 'no_account' && first.code !== 'bad_password') return first;
      // 服务器上没有这个账号：允许从本机/主页迁移；
      // 只是密码不对时不拿本机旧摘要去覆盖服务器，避免把新密码顶掉。
      const imported = await this.importToServer(n, p, first.code === 'no_account');
      if (imported.ok) {
        await this.syncArcadeSession(n, p);
        return imported;
      }
      return first.code === 'bad_password' ? first : imported;
    },

    async serverLogin(name, pw) {
      const info = await this.serverAccount(name);
      if (!info.ok) return { ok: false, msg: info.msg || '连不上服务器' };
      if (!info.exists) return { ok: false, code: 'no_account', msg: this.serverLabel() + ' 上还没有这个账号' };
      const canonical = info.name || name;
      const hash = await pwHash(String(pw), info.salt);
      const r = await this.serverJson('/api/account/login', { name: canonical, hash });
      if (!r.ok) return { ok: false, code: r.code || 'bad_password', msg: r.msg || '密码不对' };
      this.rememberHash(canonical, info.salt, hash, 'server');
      this.setServerSession(canonical);
      this.bind();
      return { ok: true, name: canonical, msg: this.serverLabel() + ' 验证通过' };
    },

    async importToServer(name, pw, allowLocal) {
      const key = String(name || '').trim().toLowerCase();
      let cred = this.credentials()[key];
      let ok = !!allowLocal && !!cred && await this.verifyPassword(name, pw);
      if (!ok && this.hasArcade()) {
        let r = null;
        try { r = await window.Arcade.login(name, pw); } catch (e) {}
        if (r && r.ok) {
          // 主页验证通过：用这次密码重算本机摘要，保证服务器与离线兜底一致
          const salt = newSalt();
          const hash = await pwHash(String(pw), salt);
          this.rememberHash(name, salt, hash, 'arcade');
          cred = { name: String(name).trim(), salt, hash };
          ok = true;
        } else if (r && r.ok === false) {
          return { ok: false, msg: r.msg || '账号或密码不对' };
        }
      }
      if (!ok || !cred) {
        return { ok: false, msg: this.serverLabel() + ' 上还没有这个账号；请先在房主电脑登录一次' };
      }
      const r = await this.serverJson('/api/account/import', {
        name: cred.name,
        salt: cred.salt,
        hash: cred.hash,
      });
      if (!r.ok) return { ok: false, msg: r.msg || '账号存不到服务器' };
      if (r.created === false && r.same !== true) {
        return { ok: false, msg: this.serverLabel() + ' 上已有同名账号，但密码不一致' };
      }
      this.rememberHash(cred.name, cred.salt, cred.hash, 'server');
      this.setServerSession(cred.name);
      this.bind();
      this.refreshServerAccounts();
      return { ok: true, name: cred.name, msg: '账号已保存到 ' + this.serverLabel() };
    },

    async syncArcadeSession(name, pw) {
      if (!this.hasArcade()) return;
      try {
        const r = await window.Arcade.login(name, pw);
        if (!r || !r.ok) {
          if (window.Arcade.logout) window.Arcade.logout();
        }
      } catch (e) {}
    },

    async loginArcade(name, pw) {
      if (!this.hasArcade()) return { ok: false, msg: '服务器不在线；请先用离线密钥，再登录本机保存的账号' };
      let r;
      try {
        r = await window.Arcade.login(name, pw);
      } catch (e) {
        return { ok: false, msg: '登录出了点问题，稍后再试' };
      }
      if (r && r.ok) {
        await this.remember(name, pw);
        this.bind();
      }
      return r || { ok: false, msg: '登录失败' };
    },

    // 服务离线：先过密钥，再用本机保存的账号密码核对
    async loginOffline(name, pw) {
      if (!this.keyVerified()) return { ok: false, msg: '请先输入离线密钥' };
      const ok = await this.verifyPassword(name, pw);
      if (!ok) return { ok: false, msg: '本机没有这个账号，或者密码不对' };
      set(K_SES, { name: String(name).trim(), at: Date.now() });
      this.bind();
      if (PH.Hub && PH.Hub.loadAccount) PH.Hub.loadAccount();
      return { ok: true, msg: '离线验证通过' };
    },

    // 已经验过密钥：直接用上次的账号继续，不再输密码
    continueOffline() {
      if (!this.keyVerified()) return { ok: false, msg: '请先输入离线密钥' };
      const a = this.arcadeUser();
      const ses = get(K_SES, null);
      const names = this.names();
      const name = (a && a.name) || (ses && ses.name) || names[0] || '';
      if (!name) return { ok: false, msg: '这台电脑上还没有保存过账号，先去主页注册一次' };
      set(K_SES, { name, at: Date.now() });
      this.bind();
      if (PH.Hub && PH.Hub.loadAccount) PH.Hub.loadAccount();
      return { ok: true, msg: '已用本机账号继续' };
    },

    logout() {
      if (this.hasArcade() && window.Arcade.logout) {
        try { window.Arcade.logout(); } catch (e) {}
      }
      del(K_SES);
      del(K_SSES);
      return this.current();
    },
  });

  I.syncArcadeAccounts();
})(window.PH);
