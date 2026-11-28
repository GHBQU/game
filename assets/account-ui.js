(function(){
  var $ = function(id){ return document.getElementById(id); };
  var bar = $('accountbar'), abName = $('ab-name'), abNote = $('ab-note');
  var abMain = $('ab-main'), abLogout = $('ab-logout'), barHint = $('bar-hint');
  var gate = $('gate');
  var panels = gate.querySelectorAll('.gate-panel');
  var tabs = gate.querySelectorAll('.gate-tabs button');
  var fLogin = $('f-login'), fReg = $('f-reg'), fInvite = $('f-invite');
  var lastFocus = null;

  /* ---------- 面板切换 ---------- */
  function showPanel(name){
    for (var i = 0; i < panels.length; i++){
      panels[i].hidden = panels[i].dataset.panel !== name;
    }
    var first = gate.querySelector('.gate-panel:not([hidden]) input');
    if (first) setTimeout(function(){ try{ first.focus(); }catch(e){} }, 60);
  }
  function setTab(which){
    for (var i = 0; i < tabs.length; i++){
      var on = tabs[i].dataset.tab === which;
      tabs[i].classList.toggle('on', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    fLogin.hidden = which !== 'login';
    fReg.hidden = which !== 'reg';
    clearMsg(fLogin); clearMsg(fReg);
  }
  function clearMsg(form){
    var m = form.querySelector('[data-msg]');
    if (m){ m.textContent = ''; m.className = 'gate-msg'; }
  }
  function setMsg(form, text, ok){
    var m = form.querySelector('[data-msg]');
    if (m){ m.textContent = text; m.className = 'gate-msg' + (ok ? ' ok' : ''); }
  }

  /* ---------- 打开 / 关闭 ---------- */
  function openGate(code){
    var st = Arcade.status();
    lastFocus = document.activeElement;

    if (!st.user || code === 'login'){
      showPanel('auth');
      setTab('login');
      fLogin.reset(); fReg.reset();
      clearMsg(fLogin); clearMsg(fReg);
      /* 旧版本机账号搬到服务器后，把名字填回来，省得再想一遍 */
      var oldName = Arcade.legacyName ? Arcade.legacyName() : '';
      var nameInput = fLogin.querySelector('[name="name"]');
      if (oldName && nameInput && !nameInput.value){
        nameInput.value = oldName;
        setMsg(fLogin, '账号已经搬到服务器了，密码不变，登录一次就能继续。', true);
      }
    } else if (code === 'invite' || !st.user.invited){
      showPanel('invite');
      $('invite-hello').textContent = '你好 ' + st.user.name + '，账号已创建，但还没有激活游玩权限。';
      clearMsg(fInvite);
    } else {
      showPanel('time');
      renderTime(st);
    }
    gate.hidden = false;
    var title = gate.querySelector('.gate-panel:not([hidden]) h2');
    if (title) { title.id = title.id || 'gate-title-' + code; gate.querySelector('.gate-card').setAttribute('aria-labelledby', title.id); }
    document.documentElement.style.overflow = 'hidden';
    if (!gate.querySelector('.gate-panel:not([hidden]) input')) {
      var firstAction = gate.querySelector('.gate-panel:not([hidden]) button') || $('gate-x');
      if (firstAction) firstAction.focus();
    }
  }
  function closeGate(){
    gate.hidden = true;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) { try{ lastFocus.focus(); }catch(e){} }
  }

  function renderTime(st){
    var now = st.now;
    var reason = st.cls.school
      ? '今天是' + (st.cls.kind === 'makeup' ? '调休上班日' : '上学日') + '，现在 ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' 不在开放时段。'
      : '当前不在开放时段。';
    $('time-reason').textContent = reason;
    var rows = [
      ['今天', Arcade.dayLabel(now) + ' · ' + st.cls.reason],
      ['今日时段', Arcade.windowText(st.windows)],
      ['下次开放', st.next ? Arcade.formatNext(st.next) : '—']
    ];
    $('time-info').innerHTML = rows.map(function(r, i){
      return '<div><dt>' + r[0] + '</dt><dd' + (i === 2 ? ' class="hot"' : '') + '>' + esc(r[1]) + '</dd></div>';
    }).join('');
    /* 云存档：告诉玩家进度确实存在服务器上，换设备也带得走 */
    var box = document.createElement('div');
    box.innerHTML = '<dt>云存档</dt><dd id="cloud-save">读取中…</dd>';
    $('time-info').appendChild(box);
    loadCloud();
  }

  function loadCloud(){
    var dd = $('cloud-save');
    if (!dd) return;
    var token = Arcade.token ? Arcade.token() : '';
    if (!token){ dd.textContent = '登录后自动同步'; return; }
    var url = (Arcade.serverUrl || '') + '/api/progress/list?token=' + encodeURIComponent(token);
    fetch(url, { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){
      var el = $('cloud-save');
      if (!el) return;
      if (j && j.ok){
        el.textContent = j.games && j.games.length
          ? j.games.length + ' 个游戏的进度已存在服务器'
          : '还没有存档';
      } else {
        el.textContent = '读取失败';
      }
    }).catch(function(){
      var el = $('cloud-save');
      if (el) el.textContent = '连不上账号服务器';
    });
  }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function esc(s){
    return String(s).replace(/[&<>"]/g, function(c){
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c];
    });
  }

  /* ---------- 状态条 ---------- */
  function refresh(){
    var st = Arcade.status();
    var user = st.user;

    if (!user){
      bar.dataset.state = 'login';
      abName.textContent = '未登录';
      abNote.textContent = '登录后凭邀请码进入';
      abMain.textContent = '登录 / 注册';
      abLogout.hidden = true;
      barHint.textContent = '登录并填写邀请码后即可游玩';
    } else if (!user.invited){
      bar.dataset.state = 'invite';
      abName.textContent = user.name;
      abNote.textContent = '待填邀请码';
      abMain.textContent = '填写邀请码';
      abLogout.hidden = false;
      barHint.textContent = '已登录，但还没有邀请码';
    } else if (!st.open){
      bar.dataset.state = 'time';
      abName.textContent = user.name;
      abNote.textContent = st.next ? '未开放 · ' + Arcade.formatNext(st.next) + ' 开' : '未开放';
      abMain.textContent = '开放时间';
      abLogout.hidden = false;
      barHint.textContent = '当前不在开放时段';
    } else {
      bar.dataset.state = 'ok';
      abName.textContent = user.name;
      abNote.textContent = '可游玩 · ' + st.cls.reason;
      abMain.textContent = '我的账号';
      abLogout.hidden = false;
      barHint.textContent = '点击任意条目开始';
    }

    var locked = !st.ok;
    var entries = document.querySelectorAll('.entry:not([data-access="public"])');
    for (var i = 0; i < entries.length; i++){
      entries[i].classList.toggle('locked', locked);
      /* 不用 aria-disabled：链接仍然可点，只是点了会弹出说明 */
      if (locked) entries[i].setAttribute('data-locked', st.code);
      else entries[i].removeAttribute('data-locked');
    }
  }

  /* ---------- 事件 ---------- */
  abMain.addEventListener('click', function(){
    var st = Arcade.status();
    openGate(st.user ? (st.user.invited ? 'time' : 'invite') : 'login');
  });
  abLogout.addEventListener('click', function(){
    Arcade.logout();
    refresh();
  });

  for (var i = 0; i < tabs.length; i++){
    tabs[i].addEventListener('click', function(){ setTab(this.dataset.tab); });
  }

  $('gate-x').addEventListener('click', closeGate);
  $('time-close').addEventListener('click', closeGate);
  gate.addEventListener('click', function(e){ if (e.target === gate) closeGate(); });
  document.addEventListener('keydown', function(e){
    if (gate.hidden) return;
    if (e.key === 'Escape') closeGate();
    if (e.key === 'Tab') {
      var focusable = Array.prototype.filter.call(gate.querySelectorAll('button, input, a[href]'), function(el){ return !el.disabled && el.getClientRects().length > 0; });
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  fLogin.addEventListener('submit', function(e){
    e.preventDefault();
    var d = new FormData(fLogin);
    setMsg(fLogin, '正在登录…', true);
    Arcade.login(d.get('name'), d.get('pw')).then(function(r){
      if (!r.ok){ setMsg(fLogin, r.msg); return; }
      refresh();
      if (r.code === 'ok') closeGate();
      else openGate('invite');
    });
  });

  fReg.addEventListener('submit', function(e){
    e.preventDefault();
    var d = new FormData(fReg);
    setMsg(fReg, '正在注册…', true);
    Arcade.register(d.get('name'), d.get('pw'), d.get('invite')).then(function(r){
      if (!r.ok){ setMsg(fReg, r.msg); return; }
      refresh();
      if (r.code === 'ok') closeGate();
      else openGate('invite');
    });
  });

  fInvite.addEventListener('submit', function(e){
    e.preventDefault();
    var d = new FormData(fInvite);
    Arcade.activateInvite(d.get('invite')).then(function(r){
      if (!r.ok){ setMsg(fInvite, r.msg); return; }
      refresh();
      var st = Arcade.status();
      if (st.ok) closeGate(); else openGate('time');
    });
  });

  /* 点游戏条目时拦截 */
  var entries = document.querySelectorAll('.entry:not([data-access="public"])');
  for (var j = 0; j < entries.length; j++){
    entries[j].addEventListener('click', function(e){
      var st = Arcade.status();
      if (st.ok) return;
      e.preventDefault();
      openGate(st.code);
    });
  }

  /* 从游戏页被踢回来时自动开弹窗 */
  var locked = new URLSearchParams(location.search).get('locked');
  if (locked) openGate(locked);

  refresh();
  /* 接了板子的话，先跟后端核对一次会话，再刷新状态 */
  if (Arcade.syncSession) {
    Arcade.syncSession().then(function(){ refresh(); });
  }
  setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) refresh();
  });
})();
