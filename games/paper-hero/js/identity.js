/* 纸片勇者 — 账号桥接：和游戏厅主页共用账号
 *
 * 规则（按需求）：
 *   1. 游戏里不注册。账号一律来自游戏厅主页（arcade.js），档案按账号名共用。
 *   2. 主页注册时用户名与密码已经存在本机；这里把凭据再镜像一份到游戏自己的存储里，
 *      这样即使主页脚本不在（单文件版 / 本机离线版），游戏也能核对账号。
 *      只存「用户名 + 加盐摘要」，不存明文密码。
 *   3. 本机服务不在线时，不走服务器验证，改用密钥验证：
 *      #include<bits/stdc++.h>
 *      验证通过后才能用本机保存的账号进入；不验证也能照常单机玩。
 */
(function (PH) {
  'use strict';

  const SECRET = '#include<bits/stdc++.h>';
  const K_CRED = 'paperhero.credentials.v1';   // { 用户名小写: {name, salt, hash, at} }
  const K_KEY = 'paperhero.offlinekey.v1';     // 密钥通过的标志（只存摘要）
  const K_SES = 'paperhero.offlinesession.v1'; // { name, at }
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
      return Object.keys(c).map((k) => c[k].name).filter(Boolean);
    },

    // 游戏里登录成功时，把这次用到的凭据留一份在本机
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

    // 用本机保存的摘要核对密码（离线验证用）
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
      // 服务在线：主页账号直接生效
      if (a && !this.needKey()) return { name: a.name, source: 'arcade' };
      // 服务离线：不管主页有没有登录，都先过密钥验证才算数
      if (this.needKey()) {
        if (!this.keyVerified()) return null;
        const s = get(K_SES, null);
        const name = (a && a.name) || (s && s.name);
        if (name) return { name, source: 'offline' };
      }
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
    // 服务在线：直接调主页的登录，不在游戏里注册
    async loginOnline(name, pw) {
      if (!this.hasArcade()) return { ok: false, msg: '这里没有游戏厅账号系统，请用离线密钥' };
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
      return { ok: true, msg: '已用本机账号继续' };
    },

    logout() {
      if (this.hasArcade() && window.Arcade.logout) {
        try { window.Arcade.logout(); } catch (e) {}
      }
      del(K_SES);
      return this.current();
    },
  });

  I.syncArcadeAccounts();
})(window.PH);
