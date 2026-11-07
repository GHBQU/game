/* 纸片勇者 — 本机玩家档案
 * 不联网、不注册、不用验证码：昵称 + 本机 localStorage 存档。
 * 一台电脑可以建多个档案（家里几个人各玩各的），切换档案即切换整套进度。
 *
 * 存储结构：
 *   paperhero.profiles         [{ id, name, createdAt, updatedAt }]
 *   paperhero.currentProfile   当前档案 id
 *   paperhero.p.<id>           { unlocked, cleared, best, challenge, plays, lastAt }
 */
(function (PH) {
  const U = PH.U;
  const K_LIST = 'profiles';
  const K_CUR = 'currentProfile';
  const K_DATA = 'p.';
  const MAX = 8;
  const DEFAULT_NAME = '小勇者';

  const blank = () => ({
    unlocked: 1,
    cleared: {},
    best: {},
    challenge: {},
    plays: 0,
    lastAt: 0,
  });

  function tidyName(s) {
    let n = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    n = n.replace(/\s+/g, ' ');
    if (!n) n = DEFAULT_NAME;
    return Array.from(n).slice(0, 10).join('');
  }

  function ago(ts) {
    if (!ts) return '还没玩过';
    const d = Math.max(0, Date.now() - ts);
    const m = d / 60000;
    if (m < 1) return '刚刚玩过';
    if (m < 60) return Math.floor(m) + ' 分钟前';
    const h = m / 60;
    if (h < 24) return Math.floor(h) + ' 小时前';
    const day = h / 24;
    if (day < 30) return Math.floor(day) + ' 天前';
    const dt = new Date(ts);
    return dt.getMonth() + 1 + ' 月 ' + dt.getDate() + ' 日';
  }

  const P = (PH.Profiles = {
    list: [],
    currentId: '',
    MAX,

    init() {
      const raw = U.store.get(K_LIST, null);
      this.list = Array.isArray(raw) ? raw.filter((p) => p && p.id && p.name) : [];
      if (!this.list.length) {
        // 从旧版单存档迁移：把原来的进度装进第一个档案
        const legacy = {
          unlocked: U.store.get('unlocked', 1) || 1,
          cleared: U.store.get('cleared', {}) || {},
          best: U.store.get('best', {}) || {},
          challenge: U.store.get('challenge', {}) || {},
        };
        const had = legacy.unlocked > 1 || Object.keys(legacy.cleared).length > 0;
        const first = this.create(DEFAULT_NAME, had ? legacy : null);
        this.currentId = first.id;
      } else {
        const cur = U.store.get(K_CUR, '');
        this.currentId = this.get(cur) ? cur : this.list[0].id;
      }
      U.store.set(K_CUR, this.currentId);
      return this;
    },

    get(id) {
      return this.list.find((p) => p.id === id) || null;
    },

    get current() {
      return this.get(this.currentId);
    },

    get count() {
      return this.list.length;
    },

    name(id) {
      const p = this.get(id || this.currentId);
      return p ? p.name : DEFAULT_NAME;
    },

    /* ---------- 存档数据 ---------- */
    data(id) {
      const p = this.get(id || this.currentId);
      if (!p) return blank();
      const d = U.store.get(K_DATA + p.id, null);
      return Object.assign(blank(), d || {});
    },

    write(d) {
      const p = this.current;
      if (!p) return;
      const now = Date.now();
      U.store.set(
        K_DATA + p.id,
        Object.assign(blank(), {
          unlocked: Math.max(1, d.unlocked | 0),
          cleared: d.cleared || {},
          best: d.best || {},
          challenge: d.challenge || {},
          plays: d.plays || 0,
          lives: typeof d.lives === 'number' ? d.lives : 5,
          lastAt: now,
        })
      );
      p.updatedAt = now;
      U.store.set(K_LIST, this.list);
    },

    /* ---------- 档案管理 ---------- */
    create(name, seed) {
      if (this.list.length >= MAX) return null;
      const now = Date.now();
      const p = {
        id: 'p' + now.toString(36) + Math.random().toString(36).slice(2, 6),
        name: tidyName(name),
        createdAt: now,
        updatedAt: now,
      };
      this.list.push(p);
      if (seed) U.store.set(K_DATA + p.id, Object.assign(blank(), seed, { lastAt: now }));
      U.store.set(K_LIST, this.list);
      return p;
    },

    select(id) {
      if (!this.get(id)) return false;
      this.currentId = id;
      U.store.set(K_CUR, id);
      return true;
    },

    rename(id, name) {
      const p = this.get(id);
      if (!p) return false;
      p.name = tidyName(name);
      p.updatedAt = Date.now();
      U.store.set(K_LIST, this.list);
      return true;
    },

    remove(id) {
      if (this.list.length <= 1) return false; // 至少留一个档案
      const i = this.list.findIndex((p) => p.id === id);
      if (i < 0) return false;
      this.list.splice(i, 1);
      U.store.del(K_DATA + id);
      U.store.set(K_LIST, this.list);
      if (this.currentId === id) this.select(this.list[0].id);
      return true;
    },

    /* ---------- 展示用统计 ---------- */
    stats(id) {
      const d = this.data(id);
      return {
        unlocked: Math.max(1, d.unlocked | 0),
        cleared: Object.keys(d.cleared || {}).filter((k) => d.cleared[k]).length,
        challenge: Object.keys(d.challenge || {}).length,
        plays: d.plays | 0,
        // 注意：时间戳不能 |0，会溢出成 32 位负数
        lastAt: Number(d.lastAt) || 0,
      };
    },

    // 游戏厅账号 → 对应同名档案（没有就建一个），存档按账号分开
    bindAccount(name) {
      const n = tidyName(name);
      if (!n) return null;
      let p = this.list.find((x) => x.name === n);
      if (!p) p = this.create(n);
      if (p && this.currentId !== p.id) this.select(p.id);
      return p || null;
    },

    line(id) {
      const s = this.stats(id);
      return '已通 ' + s.cleared + ' 关 · ' + ago(s.lastAt);
    },

    ago,
    tidyName,
  });

  P.init();
})(window.PH);
