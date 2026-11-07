/* 纸片勇者 — 玩家档案面板
 *
 * 和游戏厅主页共用账号：游戏里不注册、不收手机号、不收验证码。
 *  · 服务在线：直接用主页账号登录（登录入口也只调主页的 login）
 *  · 服务离线：先用密钥 #include<bits/stdc++.h> 验证，再用本机保存的账号密码进
 *  · 账号名 = 档案名，进度跟着账号走；本机还能切换/改名/删除分档
 */
(function (PH) {
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const AVATARS = [
    ['#FFD88F', '#E2A93B', '#6B4515'],
    ['#FFB3A7', '#E2574C', '#7A2119'],
    ['#B9DDF7', '#4E93C7', '#1E4B6B'],
    ['#C6E6B8', '#5FA557', '#25501F'],
    ['#D9CDF5', '#8B77C9', '#3E2F6B'],
  ];

  function avatarOf(p) {
    let h = 0;
    const s = p.id || p.name;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATARS[h % AVATARS.length];
  }

  const I = () => PH.Identity;

  const A = (PH.Account = {
    el: null,
    body: null,
    foot: null,
    title: null,
    opened: false,
    mode: 'main', // main | key | login | rename
    draft: '',
    busy: false,
    notice: '',

    init() {
      this.el = document.getElementById('account');
      if (!this.el) return;
      this.body = document.getElementById('accBody');
      this.foot = document.getElementById('accFoot');
      this.title = document.getElementById('accTitle');
      const lead = this.el.querySelector('.acc-lead');
      if (lead) lead.textContent = '和游戏厅主页共用同一个账号，游戏里不注册。进度存在这台电脑上。';
      document.getElementById('accClose').addEventListener('click', () => this.close());
      this.el.addEventListener('mousedown', (e) => {
        if (e.target.classList && e.target.classList.contains('acc-backdrop')) this.close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.opened) this.close();
      });
    },

    open() {
      if (!this.el) return;
      if (PH.G && PH.G.state === 'play' && PH.setState) PH.setState('pause');
      this.el.hidden = false;
      this.opened = true;
      this.mode = 'main';
      this.draft = '';
      this.notice = '';
      this.render();
    },

    close() {
      if (!this.el) return;
      this.el.hidden = true;
      this.opened = false;
      this.mode = 'main';
    },

    render() {
      if (!this.el || !this.body) return;
      const titles = { main: '玩家档案', key: '离线密钥', login: '账号登录', rename: '改个名字' };
      this.title.textContent = titles[this.mode] || '玩家档案';
      let html;
      if (this.mode === 'key') html = this.keyHtml();
      else if (this.mode === 'login') html = this.loginHtml();
      else if (this.mode === 'rename') html = this.formHtml();
      else html = this.mainHtml();
      this.body.innerHTML = html;
      this.foot.innerHTML =
        this.mode === 'main'
          ? '进度存在这台电脑 · 共 ' + PH.Profiles.count + ' 个本机分档'
          : '账号只在游戏厅主页注册 · 密码和用户都保存在本机';
      this.wire();
      const first = this.body.querySelector('input');
      if (first) setTimeout(() => { first.focus(); first.select(); }, 60);
    },

    /* ---------------- 账号卡片 ---------------- */
    identityHtml() {
      const id = I();
      const u = id ? id.current() : null;
      const home = id ? id.homeUrl() : '';
      const homeLink = home
        ? '<a class="id-link" href="' + esc(home) + '">去主页注册 / 登录</a>'
        : '在游戏厅主页注册一次，账号就会存到这台电脑';

      if (u) {
        const off = u.source === 'offline';
        return (
          '<div class="id-card' + (off ? ' off' : '') + '">' +
          '<span class="id-av">' + esc(Array.from(u.name)[0] || '勇') + '</span>' +
          '<span class="id-who"><b>' + esc(u.name) + '</b>' +
          '<i>' + (off ? '离线密钥已验证 · 进度仍存在本机' : '与游戏厅主页共用 · 服务在线时同步存档') + '</i></span>' +
          '<span class="id-badge">' + (off ? '离线' : '主页账号') + '</span></div>' +
          '<p class="acc-tip" style="margin:0 0 12px">' +
          '账号 <b>' + esc(u.name) + '</b> 的档案已自动对上，单机 / 双人 / 联机的进度是同一份。' +
          ' <button class="id-link" data-act="switchAcct">切换账号</button>' +
          '</p>'
        );
      }

      const needKey = id ? id.needKey() : true;
      if (needKey) {
        return (
          '<div class="id-card off">' +
          '<span class="id-av">钥</span>' +
          '<span class="id-who"><b>本机服务没开</b><i>联机已关闭 · 账号改用密钥验证</i></span>' +
          '<span class="id-badge">离线</span></div>' +
          '<p class="id-note">服务离线时不用服务器、也不用验证码。输入创作者约定的密钥，' +
          '就能用本机保存的主页账号继续玩；不登录也能直接单机。</p>' +
          '<button class="acc-btn primary" data-act="toKey">输入离线密钥</button>' +
          '<button class="acc-btn ghost" data-act="toLogin">用本机账号登录</button>' +
          '<p class="acc-tip">' + homeLink + '。注册时用户名和密码（加盐摘要）会保存在这台电脑。</p>'
        );
      }
      return (
        '<div class="id-card">' +
        '<span class="id-av">?</span>' +
        '<span class="id-who"><b>还没有登录</b><i>游戏里不注册，直接用主页账号</i></span>' +
        '<span class="id-badge">未登录</span></div>' +
        '<p class="id-note">账号和档案是同一个：登录后会按账号名自动对上进度，不用在游戏里再建一次。</p>' +
        '<button class="acc-btn primary" data-act="toLogin">用主页账号登录</button>' +
        '<p class="acc-tip">' + homeLink + '。注册时用户名和密码（加盐摘要）会保存在这台电脑。</p>'
      );
    },

    keyHtml() {
      return (
        '<div class="id-card off">' +
        '<span class="id-av">钥</span>' +
        '<span class="id-who"><b>离线密钥验证</b><i>只在服务器不在线时使用</i></span></div>' +
        '<p class="id-note">密钥是 <span class="id-key">#include&lt;bits/stdc++.h&gt;</span>。' +
        '验证通过后会用本机保存的主页账号继续，进度不会丢。</p>' +
        '<div class="acc-field"><label>密钥</label>' +
        '<input id="idKey" type="text" autocomplete="off" spellcheck="false" placeholder="在这里输入密钥" /></div>' +
        '<p class="acc-msg" id="accMsg"></p>' +
        '<button class="acc-btn primary" data-act="verifyKey">验证并继续</button>' +
        '<button class="acc-btn ghost" data-act="back">先不登录，直接玩</button>'
      );
    },

    loginHtml() {
      const id = I();
      const off = id ? id.needKey() : true;
      const names = id ? id.names() : [];
      const opts = names.length
        ? '<div class="acc-field"><label>本机保存的账号</label><select id="idPick" style="width:100%;height:40px;padding:0 10px;border-radius:8px;border:1.5px solid rgba(70,50,32,.28);background:rgba(255,255,255,.78);font:inherit;color:#3a2a1e">' +
          names.map((n) => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('') + '</select></div>'
        : '';
      return (
        '<p class="id-note">' +
        (off ? '服务离线：先确认密钥已验证，再用本机保存的账号密码登录。' : '直接用游戏厅主页的账号登录；游戏里没有注册入口。') +
        '</p>' + opts +
        '<div class="acc-field"><label>用户名</label>' +
        '<input id="idName" type="text" autocomplete="username" placeholder="主页注册时的用户名" /></div>' +
        '<div class="acc-field"><label>密码</label>' +
        '<input id="idPw" type="password" autocomplete="current-password" placeholder="主页注册时的密码" /></div>' +
        '<p class="acc-msg" id="accMsg"></p>' +
        '<button class="acc-btn primary" data-act="doLogin">' + (off ? '离线登录' : '登录主页账号') + '</button>' +
        (off && !(id && id.keyVerified()) ? '<button class="acc-btn ghost" data-act="toKey">先去验证密钥</button>' : '') +
        '<button class="acc-btn ghost" data-act="back">返回</button>'
      );
    },

    mainHtml() {
      const P = PH.Profiles;
      const cur = P.current;
      const av = avatarOf(cur);
      const s = P.stats(cur.id);
      const total = (PH.LEVEL_ORDER || []).length || 8;
      const rows = P.list
        .map((p) => {
          const a = avatarOf(p);
          const on = p.id === cur.id;
          return (
            '<div class="acc-item' + (on ? ' on' : '') + '" data-pick="' + esc(p.id) + '">' +
            '<span class="acc-av" style="background:linear-gradient(160deg,' + a[0] + ',' + a[1] + ');color:' + a[2] + '">' +
            esc(Array.from(p.name)[0] || '勇') + '</span>' +
            '<span class="acc-who2"><b>' + esc(p.name) + '</b><i>' + esc(on ? '正在使用 · ' + P.line(p.id) : P.line(p.id)) + '</i></span>' +
            (on
              ? '<span class="acc-ck">✓</span>'
              : '<button class="acc-x" data-del="' + esc(p.id) + '" title="删除这个分档" aria-label="删除">×</button>') +
            '</div>'
          );
        })
        .join('');

      return (
        this.identityHtml() +
        (this.notice ? '<p class="acc-msg ok" style="margin:0 0 10px">' + esc(this.notice) + '</p>' : '') +
        '<div class="acc-user">' +
        '<div class="acc-avatar" style="background:linear-gradient(160deg,' + av[0] + ',' + av[1] + ');color:' + av[2] + '">' +
        esc(Array.from(cur.name)[0] || '勇') + '</div>' +
        '<div class="acc-who"><div class="acc-name">' + esc(cur.name) +
        ' <button class="acc-link" data-act="rename">改名</button></div>' +
        '<div class="acc-sub2"><i class="dot"></i>本机分档 · ' + esc(P.ago(s.lastAt)) + '</div></div></div>' +
        '<div class="acc-stats"><span>已解锁 <b>' + Math.min(s.unlocked, total) + '</b>/' + total + ' 关</span>' +
        '<span>已通关 <b>' + s.cleared + '</b> 关</span>' +
        '<span>限时 <b>' + s.challenge + '</b> 张</span></div>' +
        '<div class="acc-label">切换本机分档</div>' +
        '<div class="acc-list">' + rows + '</div>' +
        '<p class="acc-tip">需要新分档就到游戏厅主页注册账号，这里不再单独注册。' +
        '换电脑或清理浏览器数据会丢进度，记得别清缓存。</p>'
      );
    },

    formHtml() {
      const P = PH.Profiles;
      const val = esc(this.draft || P.name());
      return (
        '<div class="acc-field"><label>新的名字</label>' +
        '<input id="accName" maxlength="10" type="text" autocomplete="off" placeholder="比如：小勇者 / 姐姐 / 弟弟" value="' + val + '" /></div>' +
        '<p class="acc-msg" id="accMsg"></p>' +
        '<button class="acc-btn primary" data-act="save">保存名字</button>' +
        '<button class="acc-btn ghost" data-act="back">取消</button>'
      );
    },

    /* ---------------- 交互 ---------------- */
    wire() {
      const body = this.body;
      body.querySelectorAll('[data-pick]').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('[data-del]')) return;
          const id = row.dataset.pick;
          if (id === PH.Profiles.currentId) return;
          if (PH.Profiles.select(id)) {
            if (PH.applyProfile) PH.applyProfile('switch');
            this.render();
          }
        });
      });
      body.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.del;
          const p = PH.Profiles.get(id);
          if (!p) return;
          if (!window.confirm('删除分档「' + p.name + '」？这个分档的进度会一起消失，且无法恢复。')) return;
          if (PH.Profiles.remove(id)) {
            if (PH.applyProfile) PH.applyProfile('remove');
            this.render();
          }
        });
      });
      body.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', () => {
          const act = b.dataset.act;
          if (act === 'back') {
            this.mode = 'main';
            this.draft = '';
            this.render();
          } else if (act === 'toKey') {
            this.mode = 'key';
            this.render();
          } else if (act === 'toLogin') {
            this.mode = 'login';
            this.render();
          } else if (act === 'rename') {
            this.mode = 'rename';
            this.draft = PH.Profiles.name();
            this.render();
          } else if (act === 'switchAcct') {
            I().logout();
            if (PH.Hub) PH.Hub.loadAccount();
            this.mode = I().needKey() && !I().keyVerified() ? 'key' : 'login';
            this.render();
          } else if (act === 'save') this.submitRename();
          else if (act === 'verifyKey') this.submitKey();
          else if (act === 'doLogin') this.submitLogin();
        });
      });
      const pick = document.getElementById('idPick');
      if (pick) {
        pick.addEventListener('change', () => {
          const n = document.getElementById('idName');
          if (n) n.value = pick.value;
        });
        const n = document.getElementById('idName');
        if (n && !n.value && pick.value) n.value = pick.value;
      }
      const key = document.getElementById('idKey');
      if (key) key.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submitKey(); });
      const pw = document.getElementById('idPw');
      if (pw) pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submitLogin(); });
      const inp = document.getElementById('accName');
      if (inp) {
        inp.addEventListener('input', () => {
          this.draft = inp.value;
          const m = document.getElementById('accMsg');
          if (m) m.textContent = '';
        });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submitRename(); });
      }
    },

    submitKey() {
      const id = I();
      const key = document.getElementById('idKey');
      const raw = key ? key.value : '';
      if (!id || !id.verifyKey(raw)) {
        this.msg('密钥不对，再试一次。', true);
        return;
      }
      const r = id.continueOffline();
      this.notice = r.ok ? (r.msg + '（密钥已验证）') : (r.msg || '密钥已验证');
      if (PH.Hub) PH.Hub.loadAccount();
      if (PH.applyProfile) PH.applyProfile('switch');
      this.mode = 'main';
      this.render();
      if (r.ok && PH.Audio && PH.Audio.sfx) PH.Audio.sfx('heal');
    },

    async submitLogin() {
      if (this.busy) return;
      const id = I();
      const nameEl = document.getElementById('idName');
      const pwEl = document.getElementById('idPw');
      const name = nameEl ? nameEl.value.trim() : '';
      const pw = pwEl ? pwEl.value : '';
      if (!name || !pw) { this.msg('用户名和密码都要填。', true); return; }
      if (id.needKey() && !id.keyVerified()) { this.msg('服务离线，请先验证密钥。', true); return; }
      this.busy = true;
      this.msg('正在核对…');
      const r = id.needKey() ? await id.loginOffline(name, pw) : await id.loginOnline(name, pw);
      this.busy = false;
      if (!r.ok) { this.msg(r.msg || '登录失败', true); return; }
      this.notice = '已和主页账号对上：' + name;
      if (PH.Hub) PH.Hub.loadAccount();
      if (PH.applyProfile) PH.applyProfile('switch');
      this.mode = 'main';
      this.render();
    },

    submitRename() {
      const inp = document.getElementById('accName');
      const name = PH.Profiles.tidyName(inp ? inp.value : this.draft);
      PH.Profiles.rename(PH.Profiles.currentId, name);
      if (PH.applyProfile) PH.applyProfile('rename');
      this.mode = 'main';
      this.draft = '';
      this.render();
    },

    msg(text, isErr) {
      const m = document.getElementById('accMsg');
      if (!m) return;
      m.textContent = text || '';
      m.className = 'acc-msg' + (isErr ? ' err' : ' ok');
    },
  });

  A.init();
})(window.PH);
