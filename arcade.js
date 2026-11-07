/* ==========================================================================
   游戏厅 · 账号与门禁
   --------------------------------------------------------------------------
   纯前端实现：账号存在本机 localStorage，不上传、不联网。
   注意：这是「门禁」不是「安全」—— 打开控制台的人可以绕过。

   对外接口 window.Arcade：
     INVITE                  邀请码原文
     inviteOk(str)           邀请码是否正确
     current()               当前登录用户 { name, invited, createdAt } | null
     register(name, pw, invite) -> Promise<{ok, code, msg}>
     login(name, pw)            -> Promise<{ok, code, msg}>
     activateInvite(code)       -> {ok, msg}
     logout()
     status(now)             门禁总状态 { ok, code, user, open, cls, next }
     formatNext(date)        把下次开放时间格式化成「明天 16:30」
     dayLabel(date)          「2026-11-07 周六」
   ========================================================================== */
(function () {
  'use strict';

  var INVITE = '#include<bits/stdc++.h>';
  var K_ACC = 'arcade.accounts.v1';
  var K_SES = 'arcade.session.v1';

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
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mmdd(d) { return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  /* ---------------- 邀请码 ---------------- */
  function normalizeInvite(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }
  function inviteOk(s) { return normalizeInvite(s) === INVITE; }

  /* ---------------- 口令哈希 ---------------- */
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
  function hashPassword(pw, salt) {
    var s = salt + '|' + pw + '|arcade-v1';
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        var bytes = new TextEncoder().encode(s);
        return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return pad2(b.toString(16));
          }).join('');
        }).catch(function () { return fnv(s); });
      } catch (e) { /* 落到下面 */ }
    }
    return Promise.resolve(fnv(s));
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

  /* ---------------- 账号 ---------------- */
  function allAccounts() { return read(K_ACC, {}); }

  function current() {
    var ses = read(K_SES, null);
    if (!ses || !ses.name) return null;
    var acc = allAccounts()[String(ses.name).toLowerCase()];
    if (!acc) return null;
    return { name: acc.name, invited: !!acc.invited, createdAt: acc.createdAt };
  }

  function validateName(name) {
    var n = String(name || '').trim();
    if (n.length < 1) return '账号名不能为空';
    if (n.length > 20) return '账号名最多 20 个字符';
    if (/[\s]/.test(n)) return '账号名不能包含空格';
    return null;
  }

  function register(name, pw, invite) {
    var n = String(name || '').trim();
    var p = String(pw || '');
    var bad = validateName(n);
    if (bad) return Promise.resolve({ ok: false, code: 'name', msg: bad });
    if (p.length < 4) return Promise.resolve({ ok: false, code: 'pw', msg: '密码至少 4 位' });
    if (p.length > 64) return Promise.resolve({ ok: false, code: 'pw', msg: '密码最多 64 位' });

    var key = n.toLowerCase();
    var accs = allAccounts();
    if (accs[key]) return Promise.resolve({ ok: false, code: 'dup', msg: '这个账号名已经被注册了' });

    var salt = makeSalt();
    return hashPassword(p, salt).then(function (hash) {
      accs[key] = {
        name: n,
        salt: salt,
        hash: hash,
        invited: inviteOk(invite),
        createdAt: Date.now()
      };
      if (!write(K_ACC, accs)) {
        return { ok: false, code: 'storage', msg: '浏览器存储不可用，注册失败' };
      }
      write(K_SES, { name: n, at: Date.now() });
      return {
        ok: true,
        code: inviteOk(invite) ? 'ok' : 'need-invite',
        msg: inviteOk(invite) ? '注册成功' : '注册成功，但还需要邀请码才能开始游戏'
      };
    });
  }

  function login(name, pw) {
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
    var user = current();
    if (!user) return { ok: false, msg: '请先登录' };
    if (!inviteOk(code)) return { ok: false, msg: '邀请码不对' };
    var accs = allAccounts();
    var key = user.name.toLowerCase();
    if (!accs[key]) return { ok: false, msg: '账号不存在' };
    accs[key].invited = true;
    write(K_ACC, accs);
    return { ok: true, msg: '邀请码已激活' };
  }

  function logout() {
    try { localStorage.removeItem(K_SES); } catch (e) {}
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
    INVITE: INVITE,
    inviteOk: inviteOk,
    current: current,
    register: register,
    login: login,
    activateInvite: activateInvite,
    logout: logout,
    status: status,
    classify: classify,
    windows: windows,
    isOpen: isOpen,
    nextOpen: nextOpen,
    formatNext: formatNext,
    windowText: windowText,
    dayLabel: dayLabel,
    dayName: function (d) { return DAY[d.getDay()]; }
  };

  /* ---------------- 游戏页守卫 ---------------- */
  if (window.ARCADE_GUARD) {
    var st = status();
    if (!st.ok) {
      document.documentElement.style.visibility = 'hidden';
      location.replace('../../?locked=' + encodeURIComponent(st.code));
    }
  }
})();
