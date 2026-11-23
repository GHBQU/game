/* ==========================================================================
   游戏厅 · 账号与门禁
   --------------------------------------------------------------------------
   账号存在服务器（Cloudflare Worker + Durable Object），不再只存本机：
     · 注册 / 登录 / 邀请码 / 令牌都由服务端判定，浏览器只留一个令牌
     · 换设备、换浏览器，用同一个账号就能登回来
     · 所有游戏共用这一个账号，进度另由 arcade-progress.js 同步
   服务连不上时用上次缓存的会话继续玩（门禁不锁人），但写操作一律要服务器。

   ESP32 那套「板子自己当服务器」仍然可用：板子发站时把
   <meta name="arcade-api"> 改写成 same-origin，这里就改调 /api/*。
   meta 写 local 时退回纯浏览器模式（仅供离线演示，不推荐）。

   对外接口 window.Arcade：
     apiMode                 后端模式：URL / 'same-origin' / 'local'
     inviteOk(str)           邀请码是否正确（本机预检，最终以服务端为准）
     current()               当前登录用户 { name, invited, remote } | null
     token()                 当前令牌
     me()                    向服务器核对一次会话 -> Promise<user|null>
     syncSession()           同 me()，兼容旧调用
     register(name, pw, invite) -> Promise<{ok, code, msg, token}>
     login(name, pw)            -> Promise<{ok, code, msg, token}>
     activateInvite(code)       -> Promise<{ok, msg}>
     changePassword(old, next)  -> Promise<{ok, msg}>
     logout()
     status(now)             门禁总状态 { ok, code, user, open, cls, next }
     formatNext(date) / dayLabel(date) / windowText(windows)
     legacyName()            旧版浏览器账号的名字（用于登录框预填）
   ========================================================================== */
(function () {
  'use strict';

  /* 邀请码不在源码里存明文，只存摘要 —— 翻源码读不出原文。
     校验方式：sha256('arcade-invite-v1|' + 去掉空白后的输入) 与下面任一条相等即通过。
     第二条是无 crypto.subtle（非 https / 老浏览器）时的兜底摘要。
     服务端用的是同一条 sha256 摘要，这里只做即时反馈。 */
  var INVITE_DIGESTS = [
    '1248225cb05b01163d46216ba6eb7b739feb52de74859fbfaf2a80e8309042c8',
    '65cb9a1a7eff733b'
  ];
  var K_ACC = 'arcade.accounts.v1';      // 旧版本机账号，只用于一次性搬家
  var K_SES = 'arcade.session.v1';
  var K_MIG = 'arcade.migrated.v1';
  var K_LEGACY = 'arcade.legacy-name.v1';

  /* 统一账号服务地址。换域名只改这一处，或者改 index.html 里的 meta。 */
  var DEFAULT_API = 'https://arcade.ghbqu.dpdns.org';

  /* 后端模式，由页面里的 <meta name="arcade-api"> 决定：
       （不写）       调 DEFAULT_API 的统一账号服务（GitHub Pages 用这个）
       same-origin  调同源的 /api/*（板子自己发整站时用这个）
       local        账号存本机 localStorage（离线演示用）
       http(s)://…  调指定地址的 /api/*
     ESP32 的静态服务在返回 index.html 时会把这里的值改写成 same-origin。 */
  var API_MODE = (function () {
    var m = document.querySelector('meta[name="arcade-api"]');
    var v = m ? String(m.getAttribute('content') || '').trim() : '';
    /* 游戏页没有被服务端改写 meta，但和主页同源，复用主页解析出的结果 */
    if (!v) {
      try { v = localStorage.getItem('arcade.api-mode') || ''; } catch (e) {}
    }
    v = v || DEFAULT_API;
    try { localStorage.setItem('arcade.api-mode', v); } catch (e) {}
    return v;
  })();

  function apiUrl(path) {
    if (API_MODE === 'same-origin') return '/api' + path;
    return API_MODE.replace(/\/+$/, '') + '/api' + path;
  }

  function apiFetch(path, body, timeoutMs) {
    var opts = { method: body === undefined ? 'GET' : 'POST', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    opts.cache = 'no-store';
    var ctrl = null;
    if (window.AbortController) {
      ctrl = new AbortController();
      opts.signal = ctrl.signal;
      setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs || 15000);
    }
    return fetch(apiUrl(path), opts).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, code: 'server', msg: '服务器返回了无法解析的内容' };
      });
    }).catch(function () {
      return { ok: false, code: 'offline', msg: '连不上账号服务，请检查网络后重试' };
    });
  }

  function useApi() { return API_MODE !== 'local'; }

  var DAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ---------------- 存储 ---------------- */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mmdd(d) { return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  /* ---------------- 邀请码 ---------------- */
  function normalizeInvite(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }
  function inviteOk(s) {
    return hashRaw('arcade-invite-v1|' + normalizeInvite(s)).then(function (d) {
      return INVITE_DIGESTS.indexOf(d) >= 0;
    });
  }

  /* ---------------- 口令哈希（仅本机模式 / 旧账号搬家用） ---------------- */
  function fnv(str) {
    var h1 = 0x811c9dc5, h2 = 0x01000193, i, c;
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
        var bytes = new TextEncoder().encode(str);
        return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return pad2(b.toString(16));
          }).join('');
        }).catch(function () { return fnv(str); });
      } catch (e) { /* 落到下面 */ }
    }
    return Promise.resolve(fnv(str));
  }
  function hashPassword(pw, salt) {
    return hashRaw(salt + '|' + pw + '|arcade-v1');
  }
  function makeSalt() {
    var s = '';
    if (window.crypto && crypto.getRandomValues) {
      var arr = new Uint8Array(8);
      crypto.getRandomValues(arr);
      s = Array.prototype.map.call(arr, function (b) { return pad2(b.toString(16)); }).join('');
    } else {
      s = String(Date.now()) + String(Math.random()).slice(2, 10);
    }
    return s;
  }

  /* ---------------- 会话 ---------------- */
  function allAccounts() { return read(K_ACC, {}); }

  function current() {
    var ses = read(K_SES, null);
    if (!ses || !ses.name) return null;
    if (useApi()) {
      /* 没有令牌 = 只是旧版留下的名字，不算登录 */
      if (!ses.token) return null;
      return {
        name: ses.name,
        invited: !!ses.invited,
        token: ses.token,
        remote: true,
        stale: !!ses.stale
      };
    }
    var acc = allAccounts()[String(ses.name).toLowerCase()];
    if (!acc) return null;
    return { name: acc.name, invited: !!acc.invited, createdAt: acc.createdAt };
  }

  function token() {
    var ses = read(K_SES, null);
    return ses && ses.token ? ses.token : '';
  }

  function saveSession(r) {
    write(K_SES, {
      name: r.name,
      invited: !!r.invited,
      token: r.token,
      at: Date.now(),
      stale: false
    });
  }

  /* 标记会话为「未核对」：服务器连不上时不清登录态，但下次能查到就刷新 */
  function markStale() {
    var ses = read(K_SES, null);
    if (!ses) return;
    ses.stale = true;
    write(K_SES, ses);
  }

  /* 向服务器核对一次会话，刷新缓存里的 invited */
  function me() {
    if (!useApi()) return Promise.resolve(current());
    var ses = read(K_SES, null);
    if (!ses || !ses.token) return Promise.resolve(null);
    return apiFetch('/me?token=' + encodeURIComponent(ses.token)).then(function (r) {
      if (r && r.ok) {
        ses.name = r.name;
        ses.invited = !!r.invited;
        ses.stale = false;
        write(K_SES, ses);
        return current();
      }
      if (r && r.code === 'auth') {
        drop(K_SES);
        return null;
      }
      /* offline：保留登录态，标记为待核对 */
      markStale();
      return current();
    });
  }

  function syncSession() { return me(); }

  /* ---------------- 旧版本机账号一次性搬家 ---------------- */
  function legacyName() {
    var n = read(K_LEGACY, '');
    if (n) return n;
    var ses = read(K_SES, null);
    if (ses && ses.name && !ses.token) return String(ses.name);
    var accs = allAccounts();
    var keys = Object.keys(accs);
    return keys.length ? String(accs[keys[0]].name || '') : '';
  }

  function migrateLegacy() {
    if (!useApi()) return Promise.resolve(null);
    if (read(K_MIG, 0)) return Promise.resolve(null);
    var accs = allAccounts();
    var rows = Object.keys(accs).map(function (k) {
      var a = accs[k];
      if (!a || !a.name || !a.salt || !a.hash) return null;
      return {
        name: a.name,
        salt: a.salt,
        hash: a.hash,
        invited: !!a.invited,
        created: a.createdAt || 0
      };
    }).filter(Boolean);

    if (!rows.length) { write(K_MIG, Date.now()); return Promise.resolve(null); }

    return apiFetch('/migrate', { accounts: rows }).then(function (r) {
      if (r && r.ok) {
        write(K_MIG, Date.now());
        if (rows.length === 1) write(K_LEGACY, rows[0].name);
        /* 旧会话没有令牌：清掉，让首页引导重新登录一次（密码不变） */
        var ses = read(K_SES, null);
        if (ses && ses.name && !ses.token) {
          write(K_LEGACY, String(ses.name));
          drop(K_SES);
        }
      }
      return r;
    });
  }

  /* ---------------- 账号 ---------------- */
  function validateName(name) {
    var n = String(name || '').trim();
    if (n.length < 1) return '账号名不能为空';
    if (n.length > 20) return '账号名最多 20 个字符';
    if (/[\s]/.test(n)) return '账号名不能包含空格';
    return null;
  }

  function register(name, pw, invite) {
    if (useApi()) {
      return apiFetch('/register', { name: name, password: pw, invite: invite }, 25000).then(function (r) {
        if (r && r.ok) saveSession(r);
        return r;
      });
    }

    var n = String(name || '').trim();
    var p = String(pw || '');
    var bad = validateName(n);
    if (bad) return Promise.resolve({ ok: false, code: 'name', msg: bad });
    if (p.length < 4) return Promise.resolve({ ok: false, code: 'pw', msg: '密码至少 4 位' });
    if (p.length > 64) return Promise.resolve({ ok: false, code: 'pw', msg: '密码最多 64 位' });

    var key = n.toLowerCase();
    var accs = allAccounts();
    if (accs[key]) return Promise.resolve({ ok: false, code: 'dup', msg: '这个账号名已经被注册了' });

    return inviteOk(invite).then(function (invited) {
      var salt = makeSalt();
      return hashPassword(p, salt).then(function (hash) {
        accs[key] = { name: n, salt: salt, hash: hash, invited: invited, createdAt: Date.now() };
        if (!write(K_ACC, accs)) {
          return { ok: false, code: 'storage', msg: '浏览器存储不可用，注册失败' };
        }
        write(K_SES, { name: n, at: Date.now() });
        return {
          ok: true,
          code: invited ? 'ok' : 'need-invite',
          msg: invited ? '注册成功' : '注册成功，但还需要邀请码才能开始游戏'
        };
      });
    });
  }

  function login(name, pw) {
    if (useApi()) {
      return apiFetch('/login', { name: name, password: pw }, 25000).then(function (r) {
        if (r && r.ok) saveSession(r);
        return r;
      });
    }

    var n = String(name || '').trim();
    var p = String(pw || '');
    var acc = allAccounts()[n.toLowerCase()];
    if (!acc) return Promise.resolve({ ok: false, code: 'nouser', msg: '没有这个账号' });
    return hashPassword(p, acc.salt).then(function (hash) {
      if (hash !== acc.hash) return { ok: false, code: 'pw', msg: '密码不对' };
      write(K_SES, { name: acc.name, at: Date.now() });
      return {
        ok: true,
        code: acc.invited ? 'ok' : 'need-invite',
        msg: acc.invited ? '登录成功' : '登录成功，但还需要邀请码才能开始游戏'
      };
    });
  }

  function activateInvite(code) {
    if (useApi()) {
      var ses = read(K_SES, null);
      if (!ses || !ses.token) return Promise.resolve({ ok: false, code: 'auth', msg: '登录已失效，请重新登录' });
      return apiFetch('/invite', { token: ses.token, invite: code }).then(function (r) {
        if (r && r.ok) { ses.invited = true; write(K_SES, ses); }
        return r;
      });
    }

    var user = current();
    if (!user) return Promise.resolve({ ok: false, msg: '请先登录' });
    return inviteOk(code).then(function (good) {
      if (!good) return { ok: false, msg: '邀请码不对' };
      var accs = allAccounts();
      var key = user.name.toLowerCase();
      if (!accs[key]) return { ok: false, msg: '账号不存在' };
      accs[key].invited = true;
      write(K_ACC, accs);
      return { ok: true, msg: '邀请码已激活' };
    });
  }

  function changePassword(oldPw, newPw) {
    if (!useApi()) return Promise.resolve({ ok: false, msg: '本机模式不支持改密码' });
    var ses = read(K_SES, null);
    if (!ses || !ses.token) return Promise.resolve({ ok: false, code: 'auth', msg: '登录已失效，请重新登录' });
    return apiFetch('/password', {
      token: ses.token,
      oldPassword: oldPw,
      newPassword: newPw
    }).then(function (r) {
      if (r && r.ok && r.token) { ses.token = r.token; write(K_SES, ses); }
      return r;
    });
  }

  function logout() {
    var ses = read(K_SES, null);
    if (useApi() && ses && ses.token) {
      try { apiFetch('/logout', { token: ses.token }, 4000); } catch (e) {}
    }
    drop(K_SES);
  }

  /* ---------------- 日历 ---------------- */
  var offCache = {};

  function expandOff(year) {
    if (offCache[year]) return offCache[year];
    var map = {};
    var cal = window.ARCADE_CALENDAR || { years: {} };
    var yr = cal.years && cal.years[year];
    if (yr && yr.off) {
      yr.off.forEach(function (row) {
        var from = row[0], to = row[1], label = row[2];
        var cur = new Date(2001, parseInt(from.slice(0, 2), 10) - 1, parseInt(from.slice(3), 10));
        var end = new Date(2001, parseInt(to.slice(0, 2), 10) - 1, parseInt(to.slice(3), 10));
        var guard = 0;
        while (cur <= end && guard++ < 400) {
          map[mmdd(cur)] = label;
          cur.setDate(cur.getDate() + 1);
        }
      });
    }
    offCache[year] = map;
    return map;
  }

  function inRange(mm, from, to) {
    if (from <= to) return mm >= from && mm <= to;
    return mm >= from || mm <= to;   // 跨年区间
  }

  /* 返回 { school:布尔, reason:文案, kind }
     优先级：调休上班日 > 法定节假日 > 寒暑假 > 周末 > 工作日
     显式的调休上班日盖过寒暑假区间，否则「调休」数据在寒假里永远不起作用。 */
  function classify(date) {
    var cal = window.ARCADE_CALENDAR || { years: {}, vacations: [] };
    var mm = mmdd(date);
    var year = date.getFullYear();
    var yr = cal.years && cal.years[year];

    if (yr && yr.work && yr.work.indexOf(mm) >= 0) {
      return { school: true, reason: '调休上课', kind: 'makeup' };
    }

    if (yr) {
      var off = expandOff(year);
      if (off[mm]) return { school: false, reason: off[mm], kind: 'holiday' };
    }

    var vacs = cal.vacations || [];
    for (var i = 0; i < vacs.length; i++) {
      if (inRange(mm, vacs[i].from, vacs[i].to)) {
        return { school: false, reason: vacs[i].name, kind: 'vacation' };
      }
    }

    var dow = date.getDay();
    if (dow === 0 || dow === 6) return { school: false, reason: '周末', kind: 'weekend' };
    return { school: true, reason: '上学日', kind: 'weekday' };
  }

  function merge(list) {
    list.sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    list.forEach(function (w) {
      var last = out[out.length - 1];
      if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
      else out.push([w[0], w[1]]);
    });
    return out;
  }

  /* 当天可玩的时间窗，单位：分钟 */
  function windows(date) {
    var cls = classify(date);
    if (!cls.school) return [[0, 1440]];

    var w = [[0, 7 * 60], [16 * 60 + 30, 1440]];
    var dow = date.getDay();
    if (dow === 1 || dow === 5) w.push([15 * 60 + 15, 16 * 60 + 30]);   // 周一 / 周五 15:15 起
    if (dow === 2) w.push([15 * 60 + 15, 17 * 60 + 30]);                 // 周二 15:15–17:30
    return merge(w);
  }

  function isOpen(date) {
    var m = date.getHours() * 60 + date.getMinutes();
    var w = windows(date);
    for (var i = 0; i < w.length; i++) {
      if (m >= w[i][0] && m < w[i][1]) return true;
    }
    return false;
  }

  function nextOpen(now) {
    for (var i = 0; i < 60; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var w = windows(d);
      for (var j = 0; j < w.length; j++) {
        var s = w[j][0];
        var t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(s / 60), s % 60, 0, 0);
        if (t.getTime() > now.getTime()) return t;
      }
    }
    return null;
  }

  function dayLabel(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + DAY[d.getDay()];
  }
  function hm(min) {
    return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
  }
  function windowText(w) {
    return w.map(function (x) { return hm(x[0]) + '–' + (x[1] >= 1440 ? '24:00' : hm(x[1])); }).join('、');
  }
  function formatNext(d) {
    if (!d) return '';
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    var t = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (sameDay) return '今天 ' + t;
    var tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (d.getFullYear() === tom.getFullYear() && d.getMonth() === tom.getMonth() && d.getDate() === tom.getDate()) {
      return '明天 ' + t;
    }
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + DAY[d.getDay()] + ' ' + t;
  }

  /* ---------------- 总状态 ---------------- */
  function status(now) {
    now = now || new Date();
    var user = current();
    var cls = classify(now);
    var open = isOpen(now);
    var res = {
      ok: false,
      code: 'login',
      user: user,
      open: open,
      cls: cls,
      windows: windows(now),
      next: null,
      now: now
    };
    if (!user) { res.code = 'login'; return res; }
    if (!user.invited) { res.code = 'invite'; return res; }
    if (!open) {
      res.code = 'time';
      res.next = nextOpen(now);
      return res;
    }
    res.ok = true;
    res.code = 'ok';
    return res;
  }

  /* ---------------- 对外 ---------------- */
  window.Arcade = {
    apiMode: API_MODE,
    serverUrl: API_MODE === 'same-origin' || API_MODE === 'local' ? '' : API_MODE,
    inviteOk: inviteOk,
    current: current,
    token: token,
    me: me,
    syncSession: syncSession,
    register: register,
    login: login,
    activateInvite: activateInvite,
    changePassword: changePassword,
    logout: logout,
    status: status,
    classify: classify,
    windows: windows,
    isOpen: isOpen,
    nextOpen: nextOpen,
    formatNext: formatNext,
    windowText: windowText,
    dayLabel: dayLabel,
    legacyName: legacyName,
    migrateLegacy: migrateLegacy,
    dayName: function (d) { return DAY[d.getDay()]; }
  };

  /* ---------------- 旧账号搬家（异步，不挡页面） ---------------- */
  if (useApi()) {
    try { migrateLegacy(); } catch (e) {}
  }

  /* ---------------- 游戏页守卫 ---------------- */
  if (window.ARCADE_GUARD) {
    var st = status();
    if (!st.ok) {
      document.documentElement.style.visibility = 'hidden';
      location.replace('../../?locked=' + encodeURIComponent(st.code));
    }
  }
})();
