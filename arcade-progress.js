/* ==========================================================================
   游戏厅 · 云存档同步
   --------------------------------------------------------------------------
   所有游戏共用同一个账号（arcade.js 管的那个），这里只管把各个游戏的
   本机存档（localStorage）跟服务器那一份对齐。

   用法：在游戏自己的脚本之前放一行，声明这个游戏有哪些存档键：

     <script src="../../arcade-progress.js"
             data-game="starfield-farm"
             data-keys="xingye_nongzhuang_save_v1"></script>

   也支持前缀（纸片勇者的档案是动态 id，没法穷举）：
     data-prefix="paperhero.p.,paperhero.profiles"
     data-exclude="paperhero.credentials.v1"

   规则：
     · 服务器是权威。开局先拉一次：服务器版本新就覆盖本机并刷新一次页面；
       本机有未上传的改动就推上去。
     · 之后任何对这些键的写入都会被拦下来，1.5 秒后自动同步。
     · 推送带版本号（base），服务器发现别人已经写过就返回冲突，这一局以服务器为准。
     · 没登录 / 服务器连不上 → 只写本机，等下次登录后自动补传，不丢档。

   对外接口 window.ArcadeProgress：
     game / status / ready
     pull()        手动拉一次
     push()        手动推一次
     saveNow()     push 的别名
     onChange(fn)  同步状态变化回调（'synced' / 'restored' / 'offline' / 'anon' / 'conflict'）
   ========================================================================== */
(function () {
  'use strict';

  var DEFAULT_API = 'https://arcade.ghbqu.dpdns.org';
  var K_SES = 'arcade.session.v1';
  var DEBOUNCE = 1500;

  /* ---------------- 读自己的配置 ---------------- */
  var SELF = document.currentScript;
  if (!SELF) {
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (/arcade-progress\.js/.test(all[i].src || '')) { SELF = all[i]; break; }
    }
  }
  function attr(name) {
    return SELF && SELF.getAttribute ? String(SELF.getAttribute(name) || '').trim() : '';
  }
  function list(name) {
    return attr(name).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  var GAME = attr('data-game') || (location.pathname.split('/').filter(Boolean).slice(-2, -1)[0] || 'unknown');
  var KEYS = list('data-keys');
  var PREFIXES = list('data-prefix');
  var EXCLUDES = list('data-exclude');
  var TOAST = attr('data-toast') !== '0';

  var K_META = 'arcadeprog.meta.' + GAME;

  /* ---------------- 小工具 ---------------- */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeLocal(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function session() {
    var s = read(K_SES, null);
    return s && s.token ? s : null;
  }

  /* 走哪台账号服务器。
     有些游戏页根本不加载 arcade.js（星野农庄就是），只能自己判断：
       · 页面上有 window.Arcade → 直接用它解析好的结果
       · 否则读 localStorage 里的标记
       · 标记是 'local' 但浏览器里有令牌 → 说明这是老版本留下的过期值，
         账号明明在服务器上，照常同步（顺手把这个键修正过来，下次就不用再猜） */
  function apiMode() {
    if (window.Arcade && window.Arcade.apiMode) return window.Arcade.apiMode;
    var v = '';
    try { v = localStorage.getItem('arcade.api-mode') || ''; } catch (e) {}
    if (!v) v = DEFAULT_API;
    if (v === 'local' && session()) {
      v = DEFAULT_API;
      try { localStorage.setItem('arcade.api-mode', v); } catch (e) {}
    }
    return v;
  }
  function apiBase() {
    var v = apiMode();
    if (v === 'local' || v === 'same-origin') return '';
    return v.replace(/\/+$/, '');
  }
  function apiUrl(path) {
    var base = apiBase();
    if (base) return base + '/api' + path;
    return '/api' + path;
  }

  function inScope(key) {
    if (!key) return false;
    for (var i = 0; i < EXCLUDES.length; i++) {
      if (key === EXCLUDES[i] || key.indexOf(EXCLUDES[i]) === 0) return false;
    }
    for (var j = 0; j < KEYS.length; j++) if (key === KEYS[j]) return true;
    for (var k = 0; k < PREFIXES.length; k++) if (key.indexOf(PREFIXES[k]) === 0) return true;
    return false;
  }

  /* ---------------- 快照 ---------------- */
  function scopeKeys() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (inScope(k)) out[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    /* 显式声明的键要占位，才能感知「被删档」 */
    for (var j = 0; j < KEYS.length; j++) {
      if (out[KEYS[j]] !== undefined) continue;
      if (EXCLUDES.indexOf(KEYS[j]) >= 0) continue;
      try {
        var v = localStorage.getItem(KEYS[j]);
        if (v !== null) out[KEYS[j]] = v;
      } catch (e) {}
    }
    return out;
  }

  function isEmpty(keys) {
    for (var k in keys) if (keys[k] != null && keys[k] !== '') return false;
    return true;
  }
  function same(a, b) {
    var ka = Object.keys(a || {}), kb = Object.keys(b || {});
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      if (!(ka[i] in b)) return false;
      if (String(a[ka[i]]) !== String(b[ka[i]])) return false;
    }
    return true;
  }

  /* ---------------- 状态 ---------------- */
  var S = {
    game: GAME,
    status: 'idle',
    ready: null,
    keys: KEYS,
    prefixes: PREFIXES,
    meta: read(K_META, { updated: 0, at: 0 }) || { updated: 0, at: 0 },
    suppress: false,
    timer: null,
    busy: false,
    dirty: false,
    restored: false,
    listeners: []
  };

  function emit(status) {
    S.status = status;
    if (window.ArcadeProgress) window.ArcadeProgress.status = status;
    for (var i = 0; i < S.listeners.length; i++) {
      try { S.listeners[i](status, S); } catch (e) {}
    }
  }

  function saveMeta() {
    S.meta.at = Date.now();
    writeLocal(K_META, S.meta);
  }

  /* ---------------- 提示条 ---------------- */
  var toastEl = null, toastTimer = null;
  function toast(text) {
    if (!TOAST) return;
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = [
          'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
          'padding:9px 14px', 'border-radius:10px',
          'font:13px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
          'background:rgba(20,20,22,.88)', 'color:#fff', 'box-shadow:0 6px 24px rgba(0,0,0,.28)',
          'opacity:0', 'transform:translateY(6px)', 'transition:opacity .22s,transform .22s',
          'pointer-events:none', 'max-width:70vw'
        ].join(';');
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = text;
      toastEl.style.opacity = '1';
      toastEl.style.transform = 'translateY(0)';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        if (!toastEl) return;
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateY(6px)';
      }, 2600);
    } catch (e) {}
  }

  /* 没登录时提醒一次：这一局的进度不会跟到别的设备 */
  function hintAnon() {
    var flag = 'arcadeprog.hint.' + GAME;
    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, '1');
    } catch (e) {}
    toast('未登录：进度只存在这台设备，回游戏厅登录后才会同步到云端');
  }

  /* ---------------- 应用服务器数据到本机 ---------------- */
  var K_BACKUP = 'arcadeprog.backup.' + GAME;

  /* 覆盖之前先把本机这一份留底：换账号、误登录都不会把本地进度直接抹掉 */
  function saveBackup(keys, why) {
    if (!keys || isEmpty(keys)) return false;
    return writeLocal(K_BACKUP, { at: Date.now(), why: why || 'remote', keys: keys });
  }

  function applyRemote(keys) {
    var want = keys || {};
    var current = scopeKeys();
    if (!isEmpty(current) && !same(current, want)) saveBackup(current, 'remote');
    S.suppress = true;
    try {
      Object.keys(current).forEach(function (k) {
        if (!(k in want)) { try { localStorage.removeItem(k); } catch (e) {} }
      });
      Object.keys(want).forEach(function (k) {
        if (want[k] == null) { try { localStorage.removeItem(k); } catch (e) {} return; }
        try { localStorage.setItem(k, want[k]); } catch (e) {}
      });
    } finally {
      S.suppress = false;
    }
  }

  function reloadOnce() {
    var flag = 'arcadeprog.reloaded.' + GAME;
    var token = String(S.meta.updated || 0);
    try {
      if (sessionStorage.getItem(flag) === token) return false;  // 已经为这一版刷过
      sessionStorage.setItem(flag, token);
    } catch (e) {}
    location.reload();
    return true;
  }

  /* ---------------- 网络 ---------------- */
  function request(path, body) {
    var opt = { cache: 'no-store' };
    if (body !== undefined) {
      opt.method = 'POST';
      opt.headers = { 'Content-Type': 'application/json' };
      opt.body = JSON.stringify(body);
    }
    var ctrl = null;
    if (window.AbortController) {
      ctrl = new AbortController();
      opt.signal = ctrl.signal;
      setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 20000);
    }
    return fetch(apiUrl(path), opt).then(function (r) {
      return r.json();
    });
  }

  function pull(quiet) {
    var ses = session();
    if (!ses) { emit('anon'); hintAnon(); return Promise.resolve(null); }
    if (apiMode() === 'local') { emit('anon'); return Promise.resolve(null); }
    return request('/progress?token=' + encodeURIComponent(ses.token) + '&game=' + encodeURIComponent(GAME))
      .then(function (r) {
        if (!r || !r.ok) {
          if (r && r.code === 'auth') {
            try { localStorage.removeItem(K_SES); } catch (e) {}
            emit('anon');
          } else {
            emit('offline');
          }
          return null;
        }
        return decide(r);
      })
      .catch(function () {
        emit('offline');
        return null;
      });
  }

  /* 服务器回来了：判断该用谁的 */
  function decide(r) {
    var serverUpdated = r.updated || 0;
    var serverData = (r.data && r.data.keys) || null;
    var local = scopeKeys();
    var localMeta = S.meta.updated || 0;

    /* 服务器没有存档：立刻上传本机的 */
    if (!serverUpdated || !serverData) {
      S.meta.updated = serverUpdated || 0;
      if (isEmpty(local)) { saveMeta(); emit('synced'); return null; }
      return pushNow(true);
    }

    /* 服务器版本没变：本机如果有别的改动就推上去 */
    if (serverUpdated === localMeta) {
      if (same(local, serverData)) { emit('synced'); return r; }
      if (isEmpty(local)) { applyRemote(serverData); saveMeta(); emit('synced'); return r; }
      return pushNow(true);
    }

    /* 服务器比本机新：以服务器为准 */
    if (serverUpdated > localMeta) {
      if (same(local, serverData)) {
        S.meta.updated = serverUpdated;
        saveMeta();
        emit('synced');
        return r;
      }
      var looked = read(K_META + '.looked', 0);
      S.meta.updated = serverUpdated;
      saveMeta();
      applyRemote(serverData);
      S.restored = true;
      emit('restored');
      if (looked === serverUpdated) {
        /* 已经为这一版刷过一次，说明是游戏又写回了旧值，不再刷，免死循环 */
        return r;
      }
      writeLocal(K_META + '.looked', serverUpdated);
      toast('已恢复云端进度');
      setTimeout(function () { reloadOnce(); }, 120);
      return r;
    }

    /* 本机 meta 反而更新（一般不会发生）：推上去 */
    return pushNow(true);
  }

  function payload() {
    return { v: 1, keys: scopeKeys() };
  }

  function pushNow(force) {
    var ses = session();
    if (!ses) { emit('anon'); return Promise.resolve(null); }
    if (S.busy && !force) { S.dirty = true; return Promise.resolve(null); }
    var data = payload();
    if (!force && isEmpty(data.keys)) { emit('synced'); return Promise.resolve(null); }
    S.busy = true;
    return request('/progress', {
      token: ses.token,
      game: GAME,
      data: data,
      base: S.meta.updated || 0
    }).then(function (r) {
      S.busy = false;
      if (!r || !r.ok) {
        if (r && r.code === 'conflict') {
          emit('conflict');
          S.meta.updated = r.updated || 0;
          saveMeta();
          if (r.data && r.data.keys && !same(scopeKeys(), r.data.keys)) {
            applyRemote(r.data.keys);
            S.restored = true;
            toast('云端进度更新了，已切换');
            setTimeout(function () { reloadOnce(); }, 120);
          }
          return r;
        }
        if (r && r.code === 'auth') {
          try { localStorage.removeItem(K_SES); } catch (e) {}
          emit('anon');
          return r;
        }
        emit('offline');
        S.dirty = true;
        return r;
      }
      S.meta.updated = r.updated || 0;
      S.dirty = false;
      saveMeta();
      emit('synced');
      return r;
    }).catch(function () {
      S.busy = false;
      S.dirty = true;
      emit('offline');
      return null;
    });
  }

  function schedule() {
    clearTimeout(S.timer);
    S.timer = setTimeout(function () { pushNow(false); }, DEBOUNCE);
  }

  /* ---------------- 拦下游戏对本机存档的写入 ---------------- */
  var rawSet = Storage.prototype.setItem;
  var rawRemove = Storage.prototype.removeItem;
  var rawClear = Storage.prototype.clear;

  Storage.prototype.setItem = function (key, value) {
    rawSet.call(this, key, value);
    if (this !== window.localStorage || S.suppress) return;
    if (!inScope(key)) return;
    S.dirty = true;
    saveMeta();
    if (session()) schedule();
  };
  Storage.prototype.removeItem = function (key) {
    rawRemove.call(this, key);
    if (this !== window.localStorage || S.suppress) return;
    if (!inScope(key)) return;
    S.dirty = true;
    saveMeta();
    if (session()) schedule();
  };
  Storage.prototype.clear = function () {
    rawClear.call(this);
    if (this !== window.localStorage || S.suppress) return;
    S.dirty = true;
    saveMeta();
    if (session()) schedule();
  };

  /* 关页面前把没来得及推的推掉 */
  function flush() {
    if (!S.dirty || !session()) return;
    clearTimeout(S.timer);
    try {
      var ses = session();
      var body = JSON.stringify({
        token: ses.token,
        game: GAME,
        data: payload(),
        base: S.meta.updated || 0
      });
      fetch(apiUrl('/progress'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  /* ---------------- 对外 ---------------- */
  window.ArcadeProgress = {
    game: GAME,
    keys: KEYS,
    prefixes: PREFIXES,
    status: 'idle',
    ready: null,
    pull: function () { return pull(); },
    push: function () { return pushNow(true); },
    saveNow: function () { return pushNow(true); },
    snapshot: scopeKeys,
    backup: function () { return read(K_BACKUP, null); },
    /* 把上一次被云端覆盖前的本机存档装回来，并推上去 */
    restoreBackup: function () {
      var b = read(K_BACKUP, null);
      if (!b || !b.keys) return false;
      applyRemote(b.keys);
      saveBackup(scopeKeys(), 'restore');
      saveMeta();
      pushNow(true);
      return true;
    },
    onChange: function (fn) {
      if (typeof fn === 'function') S.listeners.push(fn);
      return this;
    }
  };

  S.ready = pull().then(function (r) {
    window.ArcadeProgress.status = S.status;
    return r;
  });
  window.ArcadeProgress.ready = S.ready;
})();
