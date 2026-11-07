/* 纸片勇者 — 玩家档案面板（DOM 覆盖层，纸片风格）
 * 本机版：不联网、不注册、不收验证码，昵称 + 本机存档。
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

  const A = (PH.Account = {
    el: null,
    body: null,
    foot: null,
    title: null,
    opened: false,
    mode: 'main', // main | new | rename
    draft: '',

    init() {
      this.el = document.getElementById('account');
      if (!this.el) return;
      this.body = document.getElementById('accBody');
      this.foot = document.getElementById('accFoot');
      this.title = document.getElementById('accTitle');
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
      this.render();
    },

    close() {
      if (!this.el) return;
      this.el.hidden = true;
      this.opened = false;
      this.mode = 'main';
    },

    render() {
      if (!this.el) return;
      const P = PH.Profiles;
      if (!P || !P.current) return;
      this.title.textContent = this.mode === 'new' ? '新建档案' : this.mode === 'rename' ? '改个名字' : '玩家档案';
      this.body.innerHTML = this.mode === 'main' ? this.mainHtml() : this.formHtml();
      this.foot.innerHTML =
        this.mode === 'main'
          ? '进度只存在这台电脑的浏览器里 · 共 ' + P.count + ' 个档案'
          : '名字随时能改 · 最多 ' + P.MAX + ' 个档案';
      this.wire();
      if (this.mode !== 'main') {
        const inp = document.getElementById('accName');
        if (inp) setTimeout(() => {
          inp.focus();
          inp.select();
        }, 60);
      }
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
              : '<button class="acc-x" data-del="' + esc(p.id) + '" title="删除这个档案" aria-label="删除">×</button>') +
            '</div>'
          );
        })
        .join('');

      return (
        '<div class="acc-user">' +
        '<div class="acc-avatar" style="background:linear-gradient(160deg,' + av[0] + ',' + av[1] + ');color:' + av[2] + '">' +
        esc(Array.from(cur.name)[0] || '勇') + '</div>' +
        '<div class="acc-who"><div class="acc-name">' + esc(cur.name) +
        ' <button class="acc-link" data-act="rename">改名</button></div>' +
        '<div class="acc-sub2"><i class="dot"></i>本机档案 · ' + esc(P.ago(s.lastAt)) + '</div></div></div>' +
        '<div class="acc-stats"><span>已解锁 <b>' + Math.min(s.unlocked, total) + '</b>/' + total + ' 关</span>' +
        '<span>已通关 <b>' + s.cleared + '</b> 关</span>' +
        '<span>限时 <b>' + s.challenge + '</b> 张</span></div>' +
        '<div class="acc-label">切换档案</div>' +
        '<div class="acc-list">' + rows + '</div>' +
        '<button class="acc-btn primary" data-act="new">＋ 新建一个档案</button>' +
        '<p class="acc-tip">家里每个人建一个档案，进度各存各的、互不覆盖。换电脑或清理浏览器数据会丢掉进度，记得别清缓存。</p>'
      );
    },

    formHtml() {
      const P = PH.Profiles;
      const isNew = this.mode === 'new';
      const val = esc(this.draft || (isNew ? '' : P.name()));
      const full = P.count >= P.MAX;
      return (
        '<div class="acc-field"><label>' + (isNew ? '起个名字' : '新的名字') + '</label>' +
        '<input id="accName" maxlength="10" type="text" autocomplete="off" placeholder="比如：小勇者 / 姐姐 / 弟弟" value="' + val + '" /></div>' +
        '<p class="acc-msg" id="accMsg"></p>' +
        (full && isNew
          ? '<button class="acc-btn primary" disabled>最多 ' + P.MAX + ' 个档案</button>'
          : '<button class="acc-btn primary" data-act="save">' + (isNew ? '开始冒险' : '保存名字') + '</button>') +
        '<button class="acc-btn ghost" data-act="back">取消</button>'
      );
    },

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
          if (!window.confirm('删除档案「' + p.name + '」？这个档案的进度会一起消失，且无法恢复。')) return;
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
          } else if (act === 'new') {
            this.mode = 'new';
            this.draft = '';
            this.render();
          } else if (act === 'rename') {
            this.mode = 'rename';
            this.draft = PH.Profiles.name();
            this.render();
          } else if (act === 'save') this.submit();
        });
      });
      const inp = document.getElementById('accName');
      if (inp) {
        inp.addEventListener('input', () => {
          this.draft = inp.value;
          const m = document.getElementById('accMsg');
          if (m) m.textContent = '';
        });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.submit();
        });
      }
    },

    submit() {
      const inp = document.getElementById('accName');
      const raw = inp ? inp.value : this.draft;
      const name = PH.Profiles.tidyName(raw);
      if (this.mode === 'new') {
        const p = PH.Profiles.create(name);
        if (!p) {
          this.msg('档案数量到上限了，先删掉一个再建。', true);
          return;
        }
        PH.Profiles.select(p.id);
        if (PH.applyProfile) PH.applyProfile('new');
        this.mode = 'main';
        this.draft = '';
        this.render();
      } else if (this.mode === 'rename') {
        PH.Profiles.rename(PH.Profiles.currentId, name);
        if (PH.applyProfile) PH.applyProfile('rename');
        this.mode = 'main';
        this.draft = '';
        this.render();
      }
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
