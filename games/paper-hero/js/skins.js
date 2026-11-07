/* 纸片勇者 — 角色选择面板（DOM 覆盖层，纸片风格）
 * 单机：挑一个角色；双人同屏：P1、P2 各挑一个（选到同一个会自动换开）。
 * 选择跟着当前档案走，存在存档里。
 */
(function (PH) {
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 四个纸片角色，key 对应 assets/sprites 里的文件名
  const CHARS = [
    { key: 'hero', name: '勇者', sub: '原版主角' },
    { key: 'player2', name: '绿衣小子', sub: '蓝裤子' },
    { key: 'player3', name: '白发女孩', sub: '粉鞋子' },
    { key: 'player4', name: '紫衣尖头', sub: '尖头发' },
  ];
  const KEYS = CHARS.map((c) => c.key);
  const DEF = { solo: 'hero', p1: 'hero', p2: 'player2' };
  const P1_COLOR = '#E2574C';
  const P2_COLOR = '#2F7FC4';

  const S = (PH.Skins = {
    el: null,
    body: null,
    foot: null,
    opened: false,

    init() {
      this.el = document.getElementById('skins');
      if (!this.el) return;
      this.body = document.getElementById('skinBody');
      this.foot = document.getElementById('skinFoot');
      document.getElementById('skinClose').addEventListener('click', () => this.close());
      this.el.addEventListener('mousedown', (e) => {
        if (e.target.classList && e.target.classList.contains('acc-backdrop')) this.close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.opened) this.close();
      });
    },

    /* ---------- 读写 ---------- */
    get() {
      const raw = (PH.Save && PH.Save.skins) || {};
      const s = Object.assign({}, DEF, raw);
      for (const k of ['solo', 'p1', 'p2']) {
        if (KEYS.indexOf(s[k]) < 0) s[k] = DEF[k];
      }
      // 双人不能撞衫：真撞了就换开
      if (s.p1 === s.p2) s.p2 = KEYS.filter((k) => k !== s.p1)[0] || DEF.p2;
      return s;
    },

    key(role) {
      return this.get()[role] || 'hero';
    },

    set(role, key) {
      if (KEYS.indexOf(key) < 0) return;
      const s = this.get();
      const prev = s[role];
      s[role] = key;
      if (role === 'p1' || role === 'p2') {
        const other = role === 'p1' ? 'p2' : 'p1';
        if (s[other] === key) s[other] = prev; // 撞衫就互换，谁也不会被挤掉
      }
      if (PH.Save) {
        PH.Save.skins = s;
        PH.Save.save();
      }
      PH.Audio.sfx('click');
      this.apply();
      this.render();
    },

    // 改完立刻在当前这一关生效（暂停面板里换角色时）
    apply() {
      const w = PH.G && PH.G.world;
      if (!w) return;
      const s = this.get();
      if (w.duel && w.players && w.players.length > 1) {
        w.players[0].spr = s.p1;
        w.players[1].spr = s.p2;
      } else if (!w.online) {
        w.player.spr = s.solo;
      }
    },

    nameOf(key) {
      const c = CHARS.filter((x) => x.key === key)[0];
      return c ? c.name : '勇者';
    },

    label() {
      return this.nameOf(this.key('solo'));
    },

    src(key) {
      const img = PH.Assets && PH.Assets.img && PH.Assets.img[key];
      if (img && img.src) return img.src;
      return 'assets/sprites/' + key + '.png';
    },

    /* ---------- 面板 ---------- */
    open() {
      if (!this.el) return;
      if (PH.G && PH.G.state === 'play' && PH.setState) PH.setState('pause');
      this.el.hidden = false;
      this.opened = true;
      this.render();
    },

    close() {
      if (!this.el) return;
      this.el.hidden = true;
      this.opened = false;
    },

    render() {
      if (!this.el || !this.body) return;
      const s = this.get();
      const card = (c) => {
        const on = s.solo === c.key;
        return (
          '<button class="skin-item' + (on ? ' on' : '') + '" data-role="solo" data-key="' + esc(c.key) + '" aria-pressed="' + on + '">' +
          '<span class="skin-pic"><img src="' + esc(this.src(c.key)) + '" alt=""></span>' +
          '<b>' + esc(c.name) + '</b>' +
          '<i>' + esc(c.sub) + '</i>' +
          '<span class="skin-ck">' + (on ? '✓' : '') + '</span>' +
          '</button>'
        );
      };
      const mini = (role, c) => {
        const on = s[role] === c.key;
        return (
          '<button class="skin-mini' + (on ? ' on' : '') + '" data-role="' + role + '" data-key="' + esc(c.key) + '" title="' + esc(c.name) + '" aria-pressed="' + on + '">' +
          '<img src="' + esc(this.src(c.key)) + '" alt="' + esc(c.name) + '">' +
          '</button>'
        );
      };

      this.body.innerHTML =
        '<p class="acc-label">单人模式</p>' +
        '<div class="skin-grid">' + CHARS.map(card).join('') + '</div>' +
        '<p class="acc-label">双人同屏</p>' +
        '<div class="skin-line" style="--c:' + P1_COLOR + '">' +
        '<span class="skin-tag" style="color:' + P1_COLOR + '">P1</span>' +
        CHARS.map((c) => mini('p1', c)).join('') +
        '</div>' +
        '<div class="skin-line" style="--c:' + P2_COLOR + '">' +
        '<span class="skin-tag" style="color:' + P2_COLOR + '">P2</span>' +
        CHARS.map((c) => mini('p2', c)).join('') +
        '</div>';
      this.foot.textContent = '角色选择跟着这个档案走 · 双人的选择也会记住';
      this.wire();
    },

    wire() {
      this.body.querySelectorAll('[data-role]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.set(btn.dataset.role, btn.dataset.key);
        });
      });
    },
  });

  S.init();
})(window.PH);
