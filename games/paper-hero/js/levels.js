/* 纸片勇者 — 关卡构建与关卡数据 */
(function (PH) {
  const TILE_ID = { ground: 1, brick: 2, stone: 3, plank: 4, spike: 5, wood: 6 };

  class LevelBuilder {
    constructor(w, h, theme) {
      this.w = w;
      this.h = h;
      this.theme = theme;
      this.grid = [];
      for (let y = 0; y < h; y++) this.grid.push(new Array(w).fill(0));
      this.ents = [];
      this.start = { x: 3, y: h - 5 };
      this.goal = { x: w - 6, y: h - 5 };
      this.hints = [];
      this.name = '';
      this.sub = '';
      this.time = 240;
    }
    set(x, y, v) {
      if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.grid[y][x] = v;
    }
    g(x0, x1, top = 13) {
      for (let x = x0; x <= x1; x++) for (let y = top; y < this.h; y++) this.set(x, y, TILE_ID.ground);
      return this;
    }
    pit(x0, x1) {
      for (let x = x0; x <= x1; x++) for (let y = 0; y < this.h; y++) this.set(x, y, 0);
      return this;
    }
    block(x, y, w, h, kind = 'brick') {
      const v = TILE_ID[kind] || TILE_ID.brick;
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.set(x + i, y + j, v);
      return this;
    }
    plat(x, y, w) {
      for (let i = 0; i < w; i++) this.set(x + i, y, TILE_ID.plank);
      return this;
    }
    spike(x, y, w = 1) {
      for (let i = 0; i < w; i++) this.set(x + i, y, TILE_ID.spike);
      return this;
    }
    wood(x0, x1, top = 13) {
      for (let x = x0; x <= x1; x++) for (let y = top; y < this.h; y++) this.set(x, y, TILE_ID.wood);
      return this;
    }
    coin(x, y) {
      this.ents.push({ type: 'coin', x, y });
      return this;
    }
    coins(x, y, n, step = 1) {
      for (let i = 0; i < n; i++) this.coin(x + i * step, y);
      return this;
    }
    arc(x, y, n, up = 2) {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        this.coin(x + i, Math.round(y - Math.sin(t * Math.PI) * up));
      }
      return this;
    }
    enemy(type, x, y, o) {
      this.ents.push(Object.assign({ type, x, y }, o || {}));
      return this;
    }
    item(type, x, y) {
      this.ents.push({ type: 'item', item: type, x, y });
      return this;
    }
    moving(x, y, w, axis = 'x', range = 4, speed = 70, phase = 0) {
      this.ents.push({ type: 'moving', x, y, w, axis, range, speed, phase });
      return this;
    }
    hint(x, y, text, keys) {
      this.hints.push({ x, y, text, keys });
      return this;
    }
    player(x, y) {
      this.start = { x, y };
      return this;
    }
    flag(x, y) {
      this.goal = { x, y };
      return this;
    }
    check(x, y) {
      this.ents.push({ type: 'checkpoint', x, y });
      return this;
    }
    // 回血心；big = true 时是补满的金心
    heart(x, y, big) {
      this.ents.push({ type: 'heart', x, y, big: !!big });
      return this;
    }
    box(x, y, kind) {
      this.ents.push({ type: 'box', x, y, kind: kind || 'coin' });
      return this;
    }
    boss(x, y, type) {
      this.bossDef = { type, x, y };
      return this;
    }
    build(id) {
      return {
        id,
        name: this.name,
        sub: this.sub,
        theme: this.theme,
        w: this.w,
        h: this.h,
        grid: this.grid,
        ents: this.ents,
        start: this.start,
        goal: this.goal,
        hints: this.hints,
        time: this.time,
        boss: this.bossDef || null,
      };
    }
  }

  const L = {};
  function make(id, w, theme, name, sub) {
    const b = new LevelBuilder(w, 17, theme);
    b.name = name;
    b.sub = sub;
    L[id] = b;
    return b;
  }

  /* ============ 1-1 青草坡 ============ */
  {
    const b = make('1-1', 172, 'meadow', '青草坡', '一切从这里开始');
    b.g(0, 171, 13);
    b.player(3, 12);
    b.hint(5, 9, '用 ← → 或 A D 移动', 'move');
    b.hint(11, 9, '按 空格 跳跃，长按跳得更高', 'jump');
    b.coins(7, 12, 4);
    b.arc(13, 11, 4, 2);
    b.enemy('sausage', 19, 12);
    b.g(22, 28, 11);
    b.coins(22, 10, 3);
    b.coins(23, 9, 4);
    b.enemy('cabbage', 32, 12);
    b.heart(36, 12);
    b.hint(36, 8, '红心能回一颗心；满血时它不会被吃掉', 'heart');
    b.block(37, 10, 3, 1, 'brick');
    b.coins(37, 8, 3);
    b.item('ice', 38, 7);
    b.hint(41, 8, '拿到冰冰冰后按 Y 发射，可以冻住敌人', 'ice');
    b.pit(44, 47);
    b.arc(43, 11, 6, 3);
    b.enemy('sausage', 52, 12);
    b.plat(54, 10, 4);
    b.coins(54, 8, 4);
    b.enemy('kid67', 61, 12);
    b.coins(64, 12, 3);
    b.enemy('cannon', 68, 12);
    b.check(72, 12);
    b.block(76, 11, 2, 2, 'stone');
    b.block(80, 10, 2, 3, 'stone');
    b.block(84, 9, 2, 4, 'stone');
    b.coins(80, 7, 2);
    b.coins(84, 6, 2);
    b.pit(88, 93);
    b.moving(89, 10, 3, 'x', 4, 80);
    b.arc(88, 9, 8, 2);
    b.heart(96, 12);
    b.enemy('bird', 98, 8, { range: 3 });
    b.item('egg', 100, 11);
    b.hint(102, 8, '按 K 扔出奶蛋，滚过去能撞死敌人', 'egg');
    b.enemy('cabbage', 106, 12);
    b.enemy('tank', 112, 12);
    b.coins(115, 10, 5);
    b.plat(114, 9, 6);
    b.enemy('sausage', 120, 12);
    b.pit(124, 128);
    b.moving(125, 11, 3, 'x', 3, 90, 1.6);
    b.arc(124, 10, 7, 2);
    b.enemy('skeleton', 132, 12);
    b.block(136, 10, 4, 1, 'brick');
    b.coins(136, 8, 4);
    b.item('grow', 138, 7);
    b.enemy('gunner', 143, 12);
    b.enemy('sausage', 148, 12);
    b.arc(150, 11, 5, 2);
    b.flag(164, 12);
    L['1-1'] = b.build('1-1');
  }

  /* ============ 1-2 风车谷 ============ */
  {
    const b = make('1-2', 184, 'meadow', '风车谷', '跳过去，别往下看');
    b.g(0, 20, 13);
    b.player(2, 12);
    b.item('gun', 8, 11);
    b.hint(10, 8, '按 J 用 67 枪射击远处敌人', 'gun');
    b.enemy('gunner', 16, 12);
    b.pit(21, 25);
    b.moving(22, 11, 3, 'x', 3, 80);
    b.arc(21, 10, 7, 2);
    b.g(26, 34, 12);
    b.coins(27, 10, 5);
    b.enemy('cabbage', 31, 11);
    b.pit(35, 40);
    b.plat(37, 9, 3);
    b.coins(36, 7, 5);
    b.g(41, 50, 13);
    b.enemy('bird', 44, 6, { range: 4 });
    b.heart(45, 12);
    b.enemy('kid67', 47, 12);
    b.check(49, 12);
    b.pit(53, 58);
    b.moving(54, 10, 2, 'y', 3, 55);
    b.moving(58, 12, 3, 'x', 4, 90, 2);
    b.coins(53, 8, 6);
    b.g(59, 70, 13);
    b.enemy('sausage', 62, 12);
    b.g(63, 66, 10);
    b.coins(63, 8, 4);
    b.g(71, 80, 11);
    b.coins(72, 9, 6);
    b.enemy('gunner', 77, 10);
    b.pit(81, 86);
    b.plat(83, 8, 3);
    b.arc(81, 10, 7, 2);
    b.g(87, 96, 13);
    b.item('egg', 88, 11);
    b.heart(90, 12);
    b.enemy('cannon', 92, 12);
    b.enemy('sausage', 95, 12);
    b.plat(98, 9, 5);
    b.coins(98, 7, 5);
    b.pit(97, 104);
    b.moving(99, 11, 3, 'x', 5, 100);
    b.g(105, 118, 13);
    b.enemy('skeleton', 108, 12);
    b.enemy('bird', 112, 6, { range: 4 });
    b.arc(113, 11, 5, 2);
    b.check(116, 12);
    b.g(121, 130, 10);
    b.coins(122, 8, 6);
    b.enemy('cabbage', 126, 9);
    b.pit(131, 136);
    b.plat(133, 8, 3);
    b.g(137, 150, 13);
    b.enemy('kid67', 140, 12);
    b.enemy('tank', 145, 12);
    b.coins(147, 10, 4);
    b.pit(151, 155);
    b.moving(152, 11, 3, 'x', 3, 95, 1);
    b.g(156, 176, 13);
    b.enemy('sausage', 160, 12);
    b.enemy('cabbage', 165, 12);
    b.arc(166, 11, 6, 3);
    b.flag(174, 12);
    L['1-2'] = b.build('1-2');
  }

  /* ============ 1-3 滚木坡 ============ */
  {
    const b = make('1-3', 186, 'meadow', '滚木坡', '木头不认人');
    b.g(0, 18, 13);
    b.player(2, 12);
    b.enemy('sausage', 10, 12);
    b.item('ice', 14, 11);
    b.hint(18, 8, '滚木压过来时跳起来躲开', 'log');
    b.g(19, 30, 12);
    b.enemy('log', 20, 11);
    b.coins(20, 10, 6);
    b.enemy('log', 26, 11);
    b.pit(31, 34);
    b.g(35, 44, 13);
    b.heart(36, 12);
    b.enemy('skeleton', 39, 12);
    b.plat(41, 9, 4);
    b.coins(41, 7, 4);
    b.g(45, 52, 13);
    b.enemy('cannon', 45, 12);
    b.enemy('cabbage', 48, 12);
    b.check(52, 12);
    b.g(53, 62, 10);
    b.coins(54, 8, 6);
    b.g(63, 70, 8);
    b.coins(64, 6, 5);
    b.enemy('bird', 68, 4, { range: 3 });
    b.g(71, 80, 13);
    b.enemy('log', 74, 12);
    b.enemy('gunner', 78, 12);
    b.pit(81, 85);
    b.plat(83, 9, 3);
    b.g(86, 100, 12);
    b.enemy('tank', 90, 11);
    b.enemy('sausage', 95, 11);
    b.coins(96, 9, 4);
    b.pit(101, 105);
    b.moving(102, 10, 3, 'y', 4, 60);
    b.g(106, 118, 13);
    b.enemy('skeleton', 110, 12);
    b.enemy('log', 115, 12);
    b.item('weak', 108, 11);
    b.block(120, 10, 3, 1, 'brick');
    b.coins(120, 8, 3);
    b.check(117, 12);
    b.g(125, 140, 11);
    b.coins(126, 9, 8);
    b.enemy('cabbage', 132, 10);
    b.enemy('bird', 136, 5, { range: 4 });
    b.pit(141, 145);
    b.plat(143, 8, 3);
    b.g(146, 160, 13);
    b.enemy('log', 150, 12);
    b.enemy('kid67', 155, 12);
    b.coins(157, 11, 4);
    b.pit(161, 164);
    b.g(165, 180, 13);
    b.item('horse', 168, 11);
    b.enemy('sausage', 172, 12);
    b.heart(175, 12, true);
    b.arc(170, 11, 5, 2);
    b.flag(178, 12);
    L['1-3'] = b.build('1-3');
  }

  /* ============ 1-B 良子的院子 ============ */
  {
    const b = make('1-B', 32, 'courtyard', '良子的院子', 'BOSS · 红肠鸡蛋锤');
    b.wood(0, 31, 13);
    b.block(0, 0, 1, 17, 'stone');
    b.block(31, 0, 1, 17, 'stone');
    b.player(4, 12);
    b.coins(2, 11, 2);
    b.item('ice', 6, 11);
    b.item('grow', 8, 11);
    b.item('egg', 10, 11);
    b.heart(13, 12);
    b.heart(26, 12, true);
    b.boss(20, 11, 'boss1');
    L['1-B'] = b.build('1-B');
    L['1-B'].boss = { type: 'boss1', x: 20, y: 11 };
    L['1-B'].goal = null;
  }

  /* ============ 2-1 洞口 ============ */
  {
    const b = make('2-1', 180, 'cave', '红肠矿洞', '炮口朝上的玩意儿');
    b.g(0, 24, 13);
    b.player(2, 12);
    b.item('gun', 7, 11);
    b.coins(9, 12, 4);
    b.enemy('cannon', 15, 12);
    b.hint(13, 8, '红肠炮管会向上喷红肠，别站在它上面', 'cannon');
    b.enemy('cannon', 19, 12);
    b.pit(25, 29);
    b.plat(27, 9, 3);
    b.g(30, 42, 12);
    b.coins(31, 10, 5);
    b.enemy('tank', 36, 11);
    b.heart(39, 11);
    b.block(40, 8, 3, 1, 'brick');
    b.coins(40, 6, 3);
    b.pit(43, 47);
    b.moving(44, 11, 3, 'x', 4, 85);
    b.g(48, 60, 13);
    b.enemy('skeleton', 52, 12);
    b.item('ice', 56, 11);
    b.check(58, 12);
    b.g(61, 70, 9);
    b.coins(62, 7, 6);
    b.enemy('bird', 66, 4, { range: 3 });
    b.g(71, 78, 11);
    b.enemy('cannon', 74, 10);
    b.pit(79, 84);
    b.plat(81, 8, 3);
    b.g(85, 98, 13);
    b.enemy('tank', 90, 12);
    b.enemy('gunner', 95, 12);
    b.spike(99, 12, 4);
    b.g(99, 108, 13);
    b.coins(100, 9, 6);
    b.plat(102, 9, 4);
    b.enemy('cabbage', 106, 12);
    b.pit(109, 113);
    b.moving(110, 10, 3, 'y', 3, 65);
    b.g(114, 126, 13);
    b.enemy('kid67', 118, 12);
    b.item('egg', 122, 11);
    b.heart(124, 12);
    b.g(127, 140, 12);
    b.spike(127, 11, 3);
    b.enemy('skeleton', 133, 11);
    b.coins(135, 10, 5);
    b.check(142, 12);
    b.g(141, 152, 13);
    b.enemy('cannon', 146, 12);
    b.enemy('tank', 150, 12);
    b.pit(153, 158);
    b.plat(155, 9, 3);
    b.coins(153, 8, 6);
    b.g(159, 172, 13);
    b.enemy('gunner', 163, 12);
    b.arc(165, 11, 6, 3);
    b.flag(170, 12);
    L['2-1'] = b.build('2-1');
  }

  /* ============ 2-2 骨头走廊 ============ */
  {
    const b = make('2-2', 190, 'cave', '骨头走廊', '这里的骨头会走路');
    b.g(0, 18, 13);
    b.player(2, 12);
    b.enemy('skeleton', 10, 12);
    b.item('grow', 14, 11);
    b.spike(19, 12, 3);
    b.g(19, 30, 13);
    b.enemy('skeleton', 24, 12);
    b.coins(26, 11, 4);
    b.plat(28, 9, 4);
    b.coins(28, 7, 4);
    b.pit(31, 36);
    b.moving(32, 10, 3, 'x', 4, 80);
    b.g(37, 48, 12);
    b.heart(39, 11);
    b.spike(44, 11, 4);
    b.enemy('gunner', 42, 11);
    b.coins(44, 8, 4);
    b.check(50, 10);
    b.g(49, 58, 11);
    b.enemy('skeleton', 54, 10);
    b.pit(59, 64);
    b.plat(61, 8, 3);
    b.g(65, 74, 13);
    b.enemy('cannon', 69, 12);
    b.enemy('sausage', 72, 12);
    b.g(75, 84, 9);
    b.coins(76, 7, 6);
    b.enemy('bird', 80, 4, { range: 4 });
    b.pit(85, 90);
    b.moving(86, 11, 3, 'x', 4, 95, 1.2);
    b.g(91, 104, 13);
    b.enemy('skeleton', 96, 12);
    b.item('ice', 100, 11);
    b.check(102, 12);
    b.g(105, 114, 12);
    b.spike(105, 11, 4);
    b.enemy('tank', 110, 11);
    b.coins(107, 9, 6);
    b.pit(117, 122);
    b.plat(119, 8, 3);
    b.g(123, 136, 13);
    b.heart(125, 12);
    b.enemy('skeleton', 128, 12);
    b.enemy('gunner', 132, 12);
    b.coins(134, 11, 4);
    b.pit(137, 142);
    b.moving(138, 10, 3, 'y', 4, 70);
    b.g(143, 156, 12);
    b.enemy('cabbage', 148, 11);
    b.enemy('cannon', 152, 11);
    b.g(157, 168, 13);
    b.enemy('skeleton', 161, 12);
    b.arc(163, 11, 5, 2);
    b.flag(166, 12);
    L['2-2'] = b.build('2-2');
  }

  /* ============ 2-3 蛆巢深处 ============ */
  {
    const b = make('2-3', 194, 'nest', '蛆巢深处', '越往下越不干净');
    b.g(0, 20, 13);
    b.player(2, 12);
    b.enemy('bird', 8, 6, { range: 4 });
    b.item('gun', 12, 11);
    b.enemy('stone', 16, 12);
    b.hint(14, 8, '讲解石会扔出会追人的坟墓', 'stone');
    b.g(21, 30, 11);
    b.coins(22, 9, 6);
    b.enemy('stone', 28, 10);
    b.pit(31, 36);
    b.plat(33, 9, 3);
    b.coins(31, 7, 6);
    b.g(37, 50, 13);
    b.enemy('tank', 42, 12);
    b.enemy('sausage', 46, 12);
    b.item('weak', 39, 11);
    b.g(51, 60, 9);
    b.check(52, 8);
    b.coins(52, 7, 6);
    b.enemy('bird', 56, 4, { range: 3 });
    b.pit(61, 66);
    b.moving(62, 11, 3, 'x', 3, 90);
    b.g(67, 80, 12);
    b.enemy('stone', 72, 11);
    b.enemy('gunner', 77, 11);
    b.g(81, 92, 11);
    b.spike(81, 10, 3);
    b.enemy('skeleton', 86, 10);
    b.coins(88, 9, 4);
    b.pit(93, 98);
    b.plat(95, 8, 3);
    b.g(99, 112, 13);
    b.heart(101, 12);
    b.enemy('tank', 104, 12);
    b.enemy('stone', 109, 12);
    b.g(113, 124, 10);
    b.check(114, 9);
    b.coins(114, 8, 8);
    b.enemy('bird', 119, 5, { range: 5 });
    b.pit(125, 130);
    b.moving(126, 9, 3, 'y', 4, 65);
    b.g(131, 146, 13);
    b.enemy('skeleton', 136, 12);
    b.enemy('cabbage', 141, 12);
    b.item('horse', 133, 11);
    b.pit(147, 152);
    b.plat(149, 9, 3);
    b.g(153, 168, 12);
    b.enemy('stone', 158, 11);
    b.enemy('tank', 163, 11);
    b.coins(165, 10, 4);
    b.g(169, 182, 13);
    b.enemy('gunner', 173, 12);
    b.heart(171, 12, true);
    b.arc(174, 11, 5, 2);
    b.flag(180, 12);
    L['2-3'] = b.build('2-3');
  }

  /* ============ 2-B 大蛆怪的巢 ============ */
  {
    const b = make('2-B', 34, 'nest', '大蛆怪的巢', 'BOSS · 地下大蛆');
    b.wood(0, 33, 13);
    b.block(0, 0, 1, 17, 'stone');
    b.block(33, 0, 1, 17, 'stone');
    b.player(4, 12);
    b.item('ice', 7, 11);
    b.item('gun', 9, 11);
    b.item('grow', 11, 11);
    b.item('egg', 13, 11);
    b.heart(16, 12);
    b.heart(29, 12, true);
    b.coins(2, 11, 2);
    L['2-B'] = b.build('2-B');
    L['2-B'].boss = { type: 'boss2', x: 24, y: 12 };
    L['2-B'].goal = null;
  }

  /* ============ 限时挑战：三张计时地图 ============ */
  {
    const b = make('C-1', 132, 'meadow', '纸风冲刺', '限时挑战 · 一路向右别回头');
    b.time = 50;
    b.g(0, 20, 13);
    b.player(2, 12);
    b.coins(6, 12, 4);
    b.enemy('sausage', 12, 12);
    b.enemy('cabbage', 17, 12);
    b.pit(21, 25);
    b.plat(23, 10, 2);
    b.arc(21, 10, 7, 2);
    b.g(27, 46, 13);
    b.block(30, 10, 3, 1, 'brick');
    b.item('ice', 31, 7);
    b.enemy('cabbage', 36, 12);
    b.enemy('sausage', 41, 12);
    b.pit(47, 51);
    b.plat(49, 10, 3);
    b.arc(47, 10, 6, 2);
    b.g(52, 78, 13);
    b.plat(56, 10, 4);
    b.coins(56, 8, 4);
    b.enemy('kid67', 62, 12);
    b.enemy('cannon', 68, 12);
    b.block(72, 10, 3, 1, 'brick');
    b.coins(72, 8, 3);
    b.pit(79, 84);
    b.moving(80, 10, 3, 'x', 4, 90);
    b.g(85, 110, 12);
    b.coins(87, 10, 5);
    b.enemy('skeleton', 93, 11);
    b.item('grow', 97, 11);
    b.enemy('tank', 103, 11);
    b.heart(107, 11);
    b.pit(111, 114);
    b.g(115, 131, 13);
    b.arc(116, 11, 6, 2);
    b.flag(127, 12);
    L['C-1'] = b.build('C-1');
  }

  {
    const b = make('C-2', 140, 'courtyard', '红肠火线', '限时挑战 · 顶着炮火往前冲');
    b.time = 60;
    b.g(0, 24, 13);
    b.player(2, 12);
    b.item('gun', 6, 11);
    b.enemy('cannon', 13, 12);
    b.enemy('gunner', 19, 12);
    b.pit(25, 29);
    b.moving(26, 11, 3, 'x', 3, 100);
    b.g(30, 55, 13);
    b.enemy('tank', 36, 12);
    b.block(40, 10, 4, 1, 'brick');
    b.coins(40, 8, 4);
    b.enemy('cannon', 46, 12);
    b.enemy('gunner', 51, 12);
    b.pit(56, 60);
    b.plat(58, 10, 3);
    b.g(61, 88, 13);
    b.enemy('skeleton', 66, 12);
    b.enemy('tank', 72, 12);
    b.enemy('cannon', 78, 12);
    b.item('grow', 82, 11);
    b.heart(85, 12);
    b.pit(89, 93);
    b.moving(90, 11, 3, 'x', 3, 105);
    b.g(94, 118, 13);
    b.enemy('gunner', 99, 12);
    b.enemy('tank', 105, 12);
    b.enemy('cannon', 110, 12);
    b.g(113, 118, 13);
    b.spike(114, 12, 3);
    b.pit(119, 123);
    b.plat(121, 10, 3);
    b.g(124, 139, 13);
    b.arc(125, 11, 5, 2);
    b.flag(135, 12);
    L['C-2'] = b.build('C-2');
  }

  {
    const b = make('C-3', 152, 'nest', '深渊末路', '限时挑战 · 脚下没有退路');
    b.time = 70;
    b.g(0, 18, 13);
    b.player(2, 12);
    b.enemy('stone', 10, 12);
    b.item('ice', 14, 11);
    b.pit(19, 25);
    b.plat(22, 10, 3);
    b.arc(19, 10, 7, 2);
    b.g(26, 44, 12);
    b.coins(28, 10, 5);
    b.enemy('stone', 32, 11);
    b.enemy('skeleton', 38, 11);
    b.pit(45, 52);
    b.moving(46, 10, 3, 'x', 4, 95, 1);
    b.g(53, 74, 11);
    b.coins(55, 9, 6);
    b.enemy('bird', 60, 5, { range: 4 });
    b.enemy('stone', 66, 10);
    b.pit(75, 80);
    b.plat(77, 8, 3);
    b.g(81, 105, 13);
    b.enemy('tank', 87, 12);
    b.enemy('stone', 93, 12);
    b.enemy('gunner', 99, 12);
    b.heart(102, 12);
    b.pit(106, 112);
    b.moving(107, 10, 3, 'y', 3, 70);
    b.g(113, 130, 12);
    b.enemy('skeleton', 118, 11);
    b.item('horse', 122, 11);
    b.enemy('cabbage', 127, 11);
    b.pit(131, 136);
    b.plat(133, 9, 3);
    b.g(137, 151, 13);
    b.arc(138, 11, 5, 2);
    b.flag(147, 12);
    L['C-3'] = b.build('C-3');
  }

  /* ================================================================
     异境 · 独立关卡序列 X-1 ~ X-4
     这四张图不改动上面任何常规关卡 / 限时挑战的数据，也不塞进主线序列。
     每张图用一种互不重复的反常空间规则（见 js/oddity.js），
     odd 字段同时承担「规则配置」和「关卡说明」，供选关卡片与 HUD 读取。
     ================================================================ */

  /* ============ X-1 圈地：环形纸带，左右边界相接 ============ */
  {
    const w = 96;
    const b = make('X-1', w, 'meadow', '圈地', '异境 · 走到尽头会从另一头回来');
    b.time = 300;
    b.g(0, w - 1, 13);
    // 三处普通深坑：只在水平方向循环，垂直方向照常摔死
    b.pit(20, 24);
    b.pit(62, 66);
    b.pit(78, 82);
    b.arc(20, 11, 5, 2);
    b.arc(62, 10, 6, 3);
    b.arc(78, 10, 5, 2);
    b.plat(22, 10, 2);
    b.plat(64, 9, 2);
    b.plat(79, 10, 3);
    // 一堵从上到下的石墙：把「起点侧」和「终点侧」彻底隔开，
    // 唯一绕过去的办法是继续往右走到地图尽头、翻页到地图最左侧。
    b.block(44, 0, 2, 13, 'stone');
    b.player(48, 12);
    b.flag(8, 12);
    b.hint(50, 9, '石墙挡住了左边。往右一直跑，纸带的尽头会翻到另一头', 'move');
    b.hint(5, 9, '终点就在墙背面 —— 得绕一整圈才能碰到', 'goal');
    b.coins(50, 12, 4);
    b.coins(2, 11, 4);
    b.enemy('sausage', 54, 12);
    b.enemy('cabbage', 70, 12);
    b.enemy('gunner', 87, 12);
    b.enemy('sausage', 13, 12);
    b.heart(58, 12);
    b.heart(4, 12);
    b.check(30, 12);
    b.check(73, 12);
    L['X-1'] = b.build('X-1');
    L['X-1'].odd = {
      kind: 'loop',
      rule: '左右边界相接 · 走到尽头翻回另一头；终点在石墙背面',
      place: '异境序列第 1 关 · 独立于主线 1-1~2-B 与限时挑战 C-1~C-3',
      brief: '首尾粘成一条纸带，没有左右墙；一堵贯穿高度的石墙把终点隔在背面',
      bound: '只有水平方向首尾相接；深坑照常摔死、石墙不可穿越，重力与敌人位置不变',
      distinct: '常规关一路向右到终点；本关向右只会绕回原点，得懂「尽头即另一头」',
    };
  }

  /* ============ X-2 纸洞群：互不相邻的孤岛 ============ */
  {
    const w = 108;
    const b = make('X-2', w, 'nest', '纸洞群', '异境 · 没有路，只有洞');
    b.time = 320;
    b.g(0, 18, 13);
    b.g(40, 58, 13);
    b.g(80, w - 1, 13);
    b.player(2, 12);
    b.flag(100, 12);
    b.hint(4, 9, '岛和岛之间没有可以跳过去的地方，找纸上的洞钻进去', 'move');
    b.coins(5, 12, 5);
    b.enemy('sausage', 11, 12);
    b.enemy('cabbage', 47, 12);
    b.enemy('skeleton', 90, 12);
    b.enemy('gunner', 96, 12);
    b.heart(52, 12);
    b.heart(86, 12);
    b.arc(41, 6, 5, 2);
    b.arc(81, 5, 5, 2);
    b.check(44, 12);
    b.check(84, 12);
    L['X-2'] = b.build('X-2');
    L['X-2'].odd = {
      kind: 'gate',
      rule: '岛与岛之间没有路 · 只有纸洞能跨过去，出口朝向会反过来',
      place: '异境序列第 2 关 · 独立于主线 1-1~2-B 与限时挑战 C-1~C-3',
      brief: '两段 21 格宽的深渊把地面切成三座孤岛，岛间没有任何落脚点',
      bound: '纸洞单向、顺序固定；掉进深渊仍会摔死，出口高度朝向都变且不能逆行',
      distinct: '常规关靠跳跃或移动平台跨坑；本关断裂远超跳跃极限，只能靠空间跳跃',
      cuts: [[19, 39], [59, 79]],
      gates: [
        { x0: 15, x1: 18, y0: 11, y1: 14, toX: 42, toY: 2, flip: true, label: '纸洞 1 · 你从第二座岛的上空掉了出来' },
        { x0: 55, x1: 58, y0: 11, y1: 14, toX: 82, toY: 1, flip: true, label: '纸洞 2 · 这一次出口更高' },
      ],
    };
  }

  /* ============ X-3 叠影夹缝：同一坐标叠着两套互相矛盾的地形 ============ */
  {
    const w = 88;
    const b = make('X-3', w, 'courtyard', '叠影夹缝', '异境 · 同一处有两套地面');
    b.time = 320;
    // 下层页（A）：常规高度 y=13 的地面，两处可跳的坑
    b.g(0, w - 1, 13);
    b.pit(24, 28);
    b.pit(46, 50);
    b.plat(24, 10, 5);
    b.plat(46, 10, 5);
    b.player(2, 12);
    b.flag(44, 7); // 只有上层页够得到这个高度
    b.hint(4, 9, '纸上其实叠着两页。踩到折痕，脚下的地形会整套换掉', 'move');
    b.coins(6, 12, 5);
    b.coins(36, 6, 5);
    b.coins(20, 6, 4);
    b.enemy('cabbage', 12, 12);
    b.enemy('gunner', 38, 7);
    b.enemy('sausage', 62, 12);
    b.heart(10, 12);
    b.heart(40, 7);
    b.check(8, 12);
    b.check(60, 12);
    L['X-3'] = b.build('X-3');
    // 上层页（B）：悬在 y=8 的石带，下半屏完全是空的；两处缺口必须跳过
    const upper = [];
    for (let y = 0; y < 17; y++) upper.push(new Array(w).fill(0));
    for (let x = 0; x < w; x++) {
      if ((x >= 30 && x <= 33) || (x >= 54 && x <= 57)) continue;
      upper[8][x] = 3;
    }
    L['X-3'].odd = {
      kind: 'phase',
      rule: '同一坐标叠着两页地形 · 踩折痕翻页，脚下会整套换掉',
      place: '异境序列第 3 关 · 独立于主线 1-1~2-B 与限时挑战 C-1~C-3',
      brief: '下层是 y=13 的地面，上层是悬在 y=8 的石带；同一段 x 叠着两套地形',
      bound: '只在折痕翻页，两页共用重力与坑判定；上层石带外没有落脚点，掉出去会摔死',
      distinct: '常规关地形唯一且静态；本关同一处有两套地形，路线取决于当前是哪一页',
      grids: [L['X-3'].grid, upper],
      folds: [
        { x: 16, w: 2.5, to: 1, floor: 8, label: '折痕 · 翻到上层，终点旗只在这一页' },
        { x: 52, w: 2.5, to: 0, floor: 13, label: '折痕 · 翻回下层' },
      ],
    };
  }

  /* ============ X-4 落天井：往下掉却从正上方落回来 ============ */
  {
    const w = 92;
    const b = make('X-4', w, 'cave', '落天井', '异境 · 井底连着天');
    b.time = 340;
    b.g(0, w - 1, 13);
    // 三口井：把整列挖空，下层从这里掉下去
    b.pit(16, 21);
    b.pit(40, 45);
    b.pit(66, 71);
    // 倒挂的一层：悬在 y=4 的石带，留两处缺口；每口井的正上方都有石带接住
    for (let x = 8; x < w; x++) {
      if ((x >= 30 && x <= 33) || (x >= 54 && x <= 57)) continue;
      b.set(x, 4, 3);
    }
    b.player(2, 12);
    b.flag(86, 3);
    b.hint(5, 9, '井不是坑。往下掉，会从同一列的正上方落回来', 'jump');
    b.coins(6, 12, 5);
    b.coins(24, 2, 5);
    b.coins(48, 2, 5);
    b.coins(76, 2, 4);
    b.enemy('sausage', 10, 12);
    b.enemy('cabbage', 28, 12);
    b.enemy('skeleton', 50, 12);
    b.enemy('gunner', 24, 3);
    b.enemy('cabbage', 78, 3);
    b.heart(34, 12);
    b.heart(46, 3);
    b.check(8, 12);
    b.check(74, 12);
    L['X-4'] = b.build('X-4');
    L['X-4'].odd = {
      kind: 'well',
      rule: '井口连着天 · 掉下去会从同一列正上方落回来，终点在倒挂的一层',
      place: '异境序列第 4 关 · 独立于主线 1-1~2-B 与限时挑战 C-1~C-3',
      brief: '下层是 y=13 的地面与三口井，上层是悬在 y=4 的石带；井底和天空相接',
      bound: '只有井能上倒挂层，且只能「下→上」；上层缺口会掉回下层或摔死',
      distinct: '常规关掉坑就是死亡；本关掉井是唯一的向上通路，垂直空间被反过来',
      wells: [
        { x0: 16, x1: 21, outX: 18, outY: 0, triggerY: 12.5 },
        { x0: 40, x1: 45, outX: 42, outY: 0, triggerY: 12.5 },
        { x0: 66, x1: 71, outX: 68, outY: 0, triggerY: 12.5 },
      ],
      ceiling: [[8, 29], [34, 53], [58, 91]],
    };
  }

  PH.Levels = L;
  PH.LEVEL_ORDER = ['1-1', '1-2', '1-3', '1-B', '2-1', '2-2', '2-3', '2-B'];
  // 全部通关后解锁的限时挑战
  PH.CHALLENGE_ORDER = ['C-1', 'C-2', 'C-3'];
  // 异境：独立序列，不并入主线、不并入限时挑战，不计入解锁与全通关判定
  PH.ODD_ORDER = ['X-1', 'X-2', 'X-3', 'X-4'];
  PH.LEVEL_TITLES = {
    '1-1': { world: '第一世界 · 青草坡', color: '#7FB63F' },
    '1-2': { world: '第一世界 · 青草坡', color: '#7FB63F' },
    '1-3': { world: '第一世界 · 青草坡', color: '#7FB63F' },
    '1-B': { world: '第一世界 · BOSS', color: '#E0563F' },
    '2-1': { world: '第二世界 · 地下', color: '#7A7080' },
    '2-2': { world: '第二世界 · 地下', color: '#7A7080' },
    '2-3': { world: '第二世界 · 地下', color: '#7A7080' },
    '2-B': { world: '第二世界 · BOSS', color: '#9C4A6A' },
    'C-1': { world: '限时挑战 · 纸风', color: '#C8443A' },
    'C-2': { world: '限时挑战 · 火线', color: '#C8443A' },
    'C-3': { world: '限时挑战 · 深渊', color: '#C8443A' },
    'X-1': { world: '异境 01 · 环形纸带', color: '#6B4A96' },
    'X-2': { world: '异境 02 · 折叠纸洞', color: '#8A4A86' },
    'X-3': { world: '异境 03 · 叠影双页', color: '#2F7F88' },
    'X-4': { world: '异境 04 · 倒挂天井', color: '#8A5A16' },
  };
})(window.PH);
