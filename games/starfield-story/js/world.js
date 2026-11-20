/* ============================================================
 * 星野物语 — 世界生成 / 地图 / 地形 / 物体
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G, U = G.U, C = G.C;

  // 地形编号
  const T = {
    GRASS: 0, TALL_GRASS: 1, DIRT: 2, TILLED: 3, WATER: 4, SAND: 5,
    STONE_FLOOR: 6, PATH: 7, WOOD_FLOOR: 8, SNOW: 9, FOREST: 10,
    CAVE_FLOOR: 11, BRIDGE: 12, FLOWER: 13, GRAVEL: 14, WALL: 15, LAVA: 16,
  };

  function idx(x, y) { return y * C.MAP_W + x; }

  class World {
    constructor() {
      this.w = C.MAP_W; this.h = C.MAP_H;
      this.terrain = new Uint8Array(this.w * this.h);
      this.tilled = new Uint8Array(this.w * this.h);   // 0=无 1=耕地 2=已浇水
      this.objects = [];      // 树/石/矿/灌木/箱子/建筑/传送点等
      this.crops = {};        // key "x,y" -> crop 数据
      this.portals = [];      // 传送门
      this.chests = [];
      this.day = 1; this.season = 0; this.year = 1;
      this.seed = 0;
    }

    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    get(x, y) { return this.inBounds(x, y) ? this.terrain[idx(x, y)] : T.WALL; }
    set(x, y, t) { if (this.inBounds(x, y)) this.terrain[idx(x, y)] = t; }
    getTilled(x, y) { return this.inBounds(x, y) ? this.tilled[idx(x, y)] : 0; }
    setTilled(x, y, v) { if (this.inBounds(x, y)) this.tilled[idx(x, y)] = v; }
    cropAt(x, y) { return this.crops[x + ',' + y]; }
    setCrop(x, y, c) { if (c) this.crops[x + ',' + y] = c; else delete this.crops[x + ',' + y]; }

    isWater(x, y) { const t = this.get(x, y); return t === T.WATER || t === T.LAVA; }
    isWalkable(x, y) {
      if (!this.inBounds(x, y)) return false;
      const t = this.get(x, y);
      if (t === T.WATER || t === T.WALL || t === T.LAVA) return false;
      // 有实体阻挡的物体
      for (const o of this.objects) {
        if (o.dead) continue;
        if (o.x === x && o.y === y && o.solid && !o.passable) return false;
      }
      return true;
    }
    // 用于寻路/生成的快速判断（不遍历物体）
    terrainWalkable(x, y) {
      if (!this.inBounds(x, y)) return false;
      const t = this.get(x, y);
      return t !== T.WATER && t !== T.WALL && t !== T.LAVA;
    }

    objectAt(x, y, type) {
      return this.objects.find(o => !o.dead && o.x === x && o.y === y && (!type || o.type === type));
    }
    objectsNear(x, y, r) {
      return this.objects.filter(o => !o.dead && Math.abs(o.x - x) <= r && Math.abs(o.y - y) <= r);
    }
    addObject(o) { this.objects.push(Object.assign({ id: U.uid(), dead: false }, o)); return this.objects[this.objects.length - 1]; }
    removeObject(o) { o.dead = true; }

    generate(seed = Date.now()) {
      this.seed = seed;
      const W = this.w, H = this.h;
      const rnd = (x, y, s = 0) => U.fbm(x * 0.045, y * 0.045, seed % 1000 + s);

      // --- 基础地形：按区域划分 ---
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let t = T.GRASS;
          const n = rnd(x, y, 0);
          // 北方雪原 (y<18)
          if (y < 16 + n * 6) t = T.SNOW;
          // 东方森林 (x>72)
          else if (x > 70 + (n - .5) * 10 && x < 104) t = T.FOREST;
          // 西方草原/湖泊
          else if (x < 16) {
            const lake = U.fbm(x * 0.08, y * 0.06, seed % 1000 + 5);
            t = lake > .56 ? T.WATER : (lake > .5 ? T.SAND : T.GRASS);
          }
          // 南方海滩 (y>104)
          else if (y > 104 + (n - .5) * 6) {
            const beach = U.fbm(x * 0.07, y * 0.07, seed % 1000 + 9);
            t = beach > .6 ? T.WATER : (beach > .5 ? T.SAND : T.GRASS);
          }
          // 中部泥土带
          else if (n < .32) t = T.DIRT;

          // 随机花草
          if (t === T.GRASS) {
            const f = U.hash(x, y, seed % 997);
            if (f > .96) t = T.FLOWER;
            else if (f > .86) t = T.TALL_GRASS;
          }
          if (t === T.FOREST && U.hash(x, y, seed % 991) > .88) t = T.TALL_GRASS;
          this.set(x, y, t);
        }
      }

      // --- 村庄与道路 ---
      const cx = 32, cy = 30;
      // 村庄广场（圆形木地板）
      for (let y = cy - 10; y <= cy + 10; y++) for (let x = cx - 12; x <= cx + 12; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot((x - cx) / 1.2, y - cy);
        if (d < 8) this.set(x, y, T.WOOD_FLOOR);
      }
      // 十字道路
      for (let x = 4; x < 72; x++) { this.set(x, cy, T.PATH); this.set(x, cy + 1, T.PATH); }
      for (let y = 6; y < 74; y++) { this.set(cx, y, T.PATH); this.set(cx + 1, y, T.PATH); }
      // 通往各区域的支路
      for (let y = 30; y < 112; y++) this.set(16, y, T.PATH);
      for (let x = 16; x < 90; x++) this.set(x, 60, T.PATH);
      for (let y = 10; y < 30; y++) this.set(52, y, T.PATH);

      // --- 农场区域 (20..44, 38..56) ---
      for (let y = 38; y <= 56; y++) for (let x = 20; x <= 44; x++) {
        if (this.get(x, y) === T.TALL_GRASS || this.get(x, y) === T.FLOWER) this.set(x, y, T.DIRT);
        if (U.hash(x, y, 42) > .85) this.set(x, y, T.DIRT);
      }
      // 围栏
      for (let x = 19; x <= 45; x++) { this.addObject({ type:'fence', x, y:37, solid:true }); this.addObject({ type:'fence', x, y:57, solid:true }); }
      for (let y = 37; y <= 57; y++) { this.addObject({ type:'fence', x:19, y, solid:true }); this.addObject({ type:'fence', x:45, y, solid:true }); }
      // 农场大门（南边）
      this.removeObject(this.objectAt(32, 57, 'fence'));

      // --- 建筑 ---
      const buildings = [
        { type:'house', x:26, y:24, w:6, h:5, name:'你的小屋', door:[29,29] },
        { type:'shop', x:34, y:23, w:5, h:4, name:'露西的杂货店', door:[36,27] },
        { type:'smith', x:40, y:24, w:5, h:4, name:'马库斯铁匠铺', door:[42,28] },
        { type:'tavern', x:26, y:34, w:6, h:5, name:'露比酒馆', door:[29,39] },
        { type:'clinic', x:40, y:34, w:5, h:4, name:'玛丽诊所', door:[42,38] },
        { type:'barn', x:38, y:50, w:5, h:4, name:'谷仓', door:[40,54] },
        { type:'house', x:20, y:22, w:4, h:3, name:'艾琳娜的家', door:[22,25] },
        { type:'house', x:16, y:38, w:4, h:3, name:'戈登的小屋', door:[18,41] },
        { type:'house', x:44, y:30, w:4, h:3, name:'托马斯的牧场', door:[46,33] },
        { type:'house', x:46, y:20, w:4, h:3, name:'欧文的帐篷', door:[48,23] },
      ];
      buildings.forEach(b => {
        this.addObject({ ...b, solid: true, passable: false, building: true });
        for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) this.set(xx, yy, T.WOOD_FLOOR);
        this.set(b.door[0], b.door[1], T.PATH);
      });
      this.buildings = buildings;

      // --- 传送点 ---
      this.portals = [
        { x:52, y:14, to:'mine', name:'幽暗矿洞入口', w:2, h:2 },
        { x:88, y:40, to:'forest', name:'枫叶森林', w:2, h:2 },
        { x:10, y:96, to:'lake', name:'星落湖畔', w:2, h:2 },
        { x:30, y:8, to:'snow', name:'霜雪高地', w:2, h:2 },
        { x:64, y:112, to:'beach', name:'南湾海滩', w:2, h:2 },
        { x:52, y:16, to:'village', name:'返回村庄', w:2, h:2, from:'mine' },
        { x:90, y:42, to:'village', name:'返回村庄', w:2, h:2, from:'forest' },
        { x:12, y:98, to:'village', name:'返回村庄', w:2, h:2, from:'lake' },
        { x:32, y:10, to:'village', name:'返回村庄', w:2, h:2, from:'snow' },
        { x:66, y:114, to:'village', name:'返回村庄', w:2, h:2, from:'beach' },
      ];
      this.portals.forEach(p => this.addObject({ type:'portal', ...p, solid:false }));

      // --- 树木 / 石头 / 矿物 / 灌木 ---
      const randomFill = (type, count, test, extra) => {
        let tries = 0;
        while (count > 0 && tries < count * 40) {
          tries++;
          const x = U.randInt(2, W - 3), y = U.randInt(2, H - 3);
          if (!test(x, y)) continue;
          if (this.objectAt(x, y) || this.getTilled(x, y)) continue;
          this.addObject(Object.assign({ type, x, y, solid: type !== 'bush' }, extra ? extra(x, y) : {}));
          count--;
        }
      };
      // 森林树木
      randomFill('tree', 220, (x,y) => {
        const t = this.get(x,y);
        return (t === T.FOREST || (t === T.GRASS && x > 60)) && Math.hypot(x-32,y-30) > 18;
      }, () => ({ hp: 3, variant: U.randInt(0,2) }));
      // 普通树木（草原点缀）
      randomFill('tree', 45, (x,y) => this.get(x,y) === T.GRASS && Math.hypot(x-32,y-30) > 22, () => ({ hp: 3, variant: U.randInt(0,2) }));
      // 松树（雪地）
      randomFill('pine', 60, (x,y) => this.get(x,y) === T.SNOW, () => ({ hp: 4 }));
      // 石头
      randomFill('rock', 90, (x,y) => {
        const t = this.get(x,y);
        return (t === T.GRASS || t === T.DIRT || t === T.GRAVEL || t === T.SNOW) && Math.hypot(x-32,y-30) > 12;
      }, () => ({ hp: 2 }));
      // 矿脉（在矿洞区 & 北部山地）
      randomFill('ore', 55, (x,y) => (y < 22 && this.get(x,y) !== T.WATER) || (x > 66 && x < 104), () => ({
        hp: 3,
        ore: U.pick(['copper','copper','iron','iron','silver','gold','coal','prismatic']),
      }));
      // 灌木（可采浆果）
      randomFill('bush', 70, (x,y) => {
        const t = this.get(x,y); return (t === T.GRASS || t === T.FOREST || t === T.TALL_GRASS) && Math.hypot(x-32,y-30) > 16;
      }, () => ({ hp: 1, berries: U.randInt(1,3) }));

      // --- 矿洞专用区域（地图西北角的地下洞穴）---
      this.mineLevels = {};
      for (let lv = 1; lv <= 5; lv++) this.mineLevels[lv] = this.generateMineLevel(lv);

      // --- 初始宝箱 ---
      this.chests = [
        { x: 78, y: 26, opened: false, loot: [{ id:'gold', n:3 },{ id:'potion_hp', n:2 }] },
        { x: 56, y: 90, opened: false, loot: [{ id:'prismatic', n:1 },{ id:'chest', n:1 }] },
        { x: 24, y: 10, opened: false, loot: [{ id:'ring', n:1 }] },
      ];
      this.chests.forEach(c => this.addObject({ type:'chest', ...c, solid:true }));

      // --- 路标 ---
      this.addObject({ type:'sign', x:31, y:32, solid:false, text:'欢迎来到星野村！\n往北是矿洞，东边是森林，\n南边有你的农场。' });
      this.addObject({ type:'sign', x:52, y:15, solid:false, text:'幽暗矿洞\n深处有强大的怪物与宝藏。\n带好武器和火把！' });
      this.addObject({ type:'sign', x:21, y:58, solid:false, text:'你的农场\n用锄头耕地 → 播种 → 浇水。\n别忘了照顾作物！' });

      // --- _mailbox ---
      this.addObject({ type:'mailbox', x:28, y:29, solid:false });

      return this;
    }

    generateMineLevel(level) {
      const W = 40, H = 30;
      const tiles = new Uint8Array(W * H);
      const objs = [];
      const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.WALL : tiles[y * W + x];
      const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t; };
      // 初始全为墙
      tiles.fill(T.WALL);
      // 随机房间
      const rooms = [];
      const roomCount = 5 + level;
      for (let i = 0; i < roomCount; i++) {
        const w = U.randInt(5, 10), h = U.randInt(5, 9);
        const x = U.randInt(1, W - w - 2), y = U.randInt(1, H - h - 2);
        rooms.push({ x, y, w, h, cx: x + (w>>1), cy: y + (h>>1) });
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, T.CAVE_FLOOR);
      }
      // 连接房间
      for (let i = 1; i < rooms.length; i++) {
        const a = rooms[i-1], b = rooms[i];
        let x = a.cx, y = a.cy;
        while (x !== b.cx) { set(x, y, T.CAVE_FLOOR); set(x, y+1, T.CAVE_FLOOR); x += Math.sign(b.cx - x); }
        while (y !== b.cy) { set(x, y, T.CAVE_FLOOR); set(x+1, y, T.CAVE_FLOOR); y += Math.sign(b.cy - y); }
      }
      // 起点与出口
      const start = rooms[0], exit = rooms[rooms.length-1];
      set(start.cx, start.cy, T.CAVE_FLOOR);
      // 矿石
      let oreCount = 12 + level * 6;
      let tries = 0;
      while (oreCount > 0 && tries < 400) {
        tries++;
        const x = U.randInt(1, W-2), y = U.randInt(1, H-2);
        if (get(x,y) !== T.CAVE_FLOOR) continue;
        if (objs.some(o => o.x === x && o.y === y)) continue;
        if (Math.hypot(x-start.cx, y-start.cy) < 3 || Math.hypot(x-exit.cx, y-exit.cy) < 2) continue;
        const pool = level >= 4 ? ['iron','silver','gold','gold','prismatic','coal'] :
                     level >= 2 ? ['copper','iron','iron','silver','coal','gold'] : ['copper','copper','iron','coal'];
        objs.push({ type:'ore', x, y, solid:true, hp:2 + Math.floor(level/2), ore: U.pick(pool), id: U.uid(), dead:false });
        oreCount--;
      }
      // 石头
      for (let i = 0; i < 10 + level * 3; i++) {
        const x = U.randInt(1, W-2), y = U.randInt(1, H-2);
        if (get(x,y) === T.CAVE_FLOOR && !objs.some(o => o.x===x&&o.y===y)) objs.push({ type:'rock', x, y, solid:true, hp:2, id:U.uid(), dead:false });
      }
      // 楼梯（下一层）与返回楼梯
      objs.push({ type:'stairs', x:exit.cx, y:exit.cy, solid:false, to: level < 5 ? level+1 : 0, id:U.uid(), dead:false });
      if (level > 1) objs.push({ type:'stairs', x:start.cx, y:start.cy+1, solid:false, to: level-1, id:U.uid(), dead:false });
      else objs.push({ type:'exit', x:start.cx, y:start.cy+1, solid:false, id:U.uid(), dead:false });
      return { w:W, h:H, tiles, objects:objs, start: { x:start.cx*16, y:start.cy*16 } };
    }

    serialize() {
      return {
        seed: this.seed, terrain: Array.from(this.terrain), tilled: Array.from(this.tilled),
        objects: this.objects.filter(o => !o.dead), crops: this.crops, portals: this.portals,
        chests: this.chests, buildings: this.buildings, mineLevels: this.mineLevels,
        day: this.day, season: this.season, year: this.year,
      };
    }
    static deserialize(d) {
      const w = new World();
      w.seed = d.seed;
      w.terrain = Uint8Array.from(d.terrain);
      w.tilled = Uint8Array.from(d.tilled);
      w.objects = d.objects || [];
      w.crops = d.crops || {};
      w.portals = d.portals || [];
      w.chests = d.chests || [];
      w.buildings = d.buildings || [];
      w.mineLevels = d.mineLevels || {};
      w.day = d.day || 1; w.season = d.season || 0; w.year = d.year || 1;
      return w;
    }
  }

  G.T = T;
  G.World = World;
})(window);
