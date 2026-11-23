/* 纸片勇者 — 账号桥接：直接用游戏厅的统一账号
 *
 * 规则：
 *   1. 游戏里不注册。账号就是游戏厅首页那一个，存在统一账号服务器上，
 *      所有游戏共用；登录一次，哪个游戏都认。
 *   2. 进度不走「按账号名覆盖」的旧云存档了，改由 arcade-progress.js
 *      按「账号 + 游戏」同步本机档案（paperhero.profiles / paperhero.p.*）。
 *   3. 账号服务器连不上时，改用密钥验证： #include<bits/stdc++.h>
 *      验证通过后可以用本机镜像的账号密码进入，进度仍存本机，等服务器恢复再补传。
 */
(function (PH) {
  'use strict';

  const SECRET = '#include<bits/stdc++.h>';
  const K_CRED = 'paperhero.credentials.v1';   // { 用户名小写: {name, salt, hash, at} }，离线兜底
  const K_KEY = 'paperhero.offlinekey.v1';     // 密钥通过的标志（只存摘要）
  const K_SES = 'paperhero.offlinesession.v1'; // 离线会话 { name, at }
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
    online: true,        // 账号服务是否可达（探活结果，默认乐观）
    probed: false,
    serverNames: [],

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

    serverOnline() {
      return this.online;
    },
    needKey() {
      return !this.online;
    },

    homeUrl() {
      if (/\/games\//.test(location.pathname)) return '../../';
      return '';
    },

    /* ---------------- 账号服务探活 ---------------- */
    apiBase() {
      if (!this.hasArcade()) return '';
      const mode = window.Arcade.apiMode || 'local';
      if (mode === 'local' || mode === 'same-origin') return '';
      return String(mode).replace(/\/+$/, '');
    },

    async probe() {
      const mode = this.hasArcade() ? window.Arcade.apiMode || 'local' : 'local';
      if (mode === 'local') {
        this.online = false;
        this.probed = true;
        return false;
      }
      const url = this.apiBase() + '/api/health';
      const ctrl = window.AbortController ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 6000) : null;
      try {
        const r = await fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
        const j = await r.json();
        this.online = !!(j && j.ok);
      } catch (e) {
        this.online = false;
      }
      if (timer) clearTimeout(timer);
      this.probed = true;
      if (PH.Hub && PH.Hub.loadAccount) PH.Hub.loadAccount();
      if (PH.Account && PH.Account.opened) PH.Account.render();
      return this.online;
    },

    serverLabel() {
      return '账号服务器';
    },

    /* ---------------- 本机镜像凭据（离线兜底） ---------------- */
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
      const u = this.arcadeUser();
      if (u) push(u.name);
      return out;
    },

    // 登录成功后留一份本机镜像，服务器连不上时还能进
    async remember(name, pw) {
      const n = String(name || '').trim();
      if (!n || !pw) return false;
      const all = this.credentials();
      const key = n.toLowerCase();
      if (all[key]) return true;
      const salt = newSalt();
      const hash = await pwHash(String(pw), salt);
      all[key] = { name: n, salt, hash, at: Date.now(), from: 'game' };
      return set(K_CRED, all);
    },

    rememberHash(name, salt, hash, from) {
      const n = String(name || '').trim();
      if (!n || !salt || !hash) return false;
      const all = this.credentials();
      all[n.toLowerCase()] = { name: n, salt, hash, at: Date.now(), from: from || 'server' };
      return set(K_CRED, all);
    },

    verifyPassword(name, pw) {
      const all = this.credentials();
      const c = all[String(name || '').trim().toLowerCase()];
      if (!c) return Promise.resolve(false);
      return pwHash(String(pw || ''), c.salt).then((h) => h === c.hash);
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
      if (this.online) {
        if (a && a.name) return { name: a.name, source: 'server' };
        return null;   // 服务器可达但没登录：交给登录框，不退到本机会话
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
    async loginOnline(name, pw) {
      const n = String(name || '').trim();
      const p = String(pw || '');
      if (!n || !p) return { ok: false, msg: '用户名和密码都要填。' };
      if (!this.hasArcade()) return { ok: false, msg: '账号服务不可用' };
      let r;
      try {
        r = await window.Arcade.login(n, p);
      } catch (e) {
        return { ok: false, msg: '登录出了点问题，稍后再试' };
      }
      if (!r || !r.ok) {
        if (r && r.code === 'offline') {
          this.online = false;
          return { ok: false, code: 'offline', msg: '连不上账号服务器，可以先用离线密钥进入' };
        }
        return { ok: false, msg: (r && r.msg) || '登录失败' };
      }
      await this.remember(r.name || n, p);
      this.bind();
      if (PH.Hub && PH.Hub.loadAccount) PH.Hub.loadAccount();
      return { ok: true, name: r.name || n, msg: '账号验证通过（全站通用）' };
    },

    // 服务离线：先过密钥，再用本机镜像的账号密码核对
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
      return this.current();
    },

    /* ---------------- 兼容旧接口 ---------------- */
    refreshServerAccounts() {
      this.serverNames = this.names();
      return Promise.resolve(this.serverNames);
    },
    syncLocalToServer() {
      // 老版本机账号的搬家现在由 arcade.js 统一做，这里只触发一次
      if (this.hasArcade() && window.Arcade.migrateLegacy) {
        try { window.Arcade.migrateLegacy(); } catch (e) {}
      }
      return Promise.resolve(true);
    },
    setServerSession() {
      if (this.hasArcade() && window.Arcade.me) {
        try { window.Arcade.me(); } catch (e) {}
      }
      if (PH.Hub && PH.Hub.loadAccount) PH.Hub.loadAccount();
    },

    async serverJson() {
      return { ok: false, msg: '旧接口已废弃' };
    },
  });

  I.syncArcadeAccounts();
  I.probe();
})(window.PH);
