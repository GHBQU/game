/* ============================================================
 * 星野物语 — 游戏系统：农夫 / 战斗 / 制作 / 任务 / 社交 / 时间
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G, U = G.U, C = G.C, DB = G.DB;

  // ---------- 任务模板 ----------
  const QUEST_TEMPLATES = [
    { id:'q_meet', title:'初来乍到', desc:'和村里的 3 位村民打个招呼', type:'talk', need:3, reward:{ money:100, xp:30 }, once:true },
    { id:'q_farm', title:'第一桶金', desc:'收获 5 份作物并出售赚钱', type:'harvest', need:5, reward:{ money:200, xp:50, items:[['seed_turnip',5]] } },
    { id:'q_sell', title:'小商人', desc:'累计赚取 1000 G', type:'earn', need:1000, reward:{ money:300, xp:80 } },
    { id:'q_kill', title:'村庄卫士', desc:'击败 10 只怪物', type:'kill', need:10, reward:{ money:250, xp:100, items:[['potion_hp',3]] } },
    { id:'q_mine', title:'矿工新手', desc:'挖掘 15 块石头或矿石', type:'mine', need:15, reward:{ money:300, xp:120, items:[['pickaxe',1]] } },
    { id:'q_fish', title:'钓鱼达人', desc:'钓到 5 条鱼', type:'fish', need:5, reward:{ money:250, xp:90, items:[['fishing',1]] } },
    { id:'q_forage', title:'采集能手', desc:'采集 10 份野外的花、莓果或蘑菇', type:'forage', need:10, reward:{ money:150, xp:60 } },
    { id:'q_friend', title:'广交朋友', desc:'让一位村民的好感度达到 5 颗心', type:'friend', need:5, reward:{ money:300, xp:100, items:[['cake',1]] } },
    { id:'q_mine5', title:'深层探险', desc:'到达幽暗矿洞第 5 层', type:'minelevel', need:5, reward:{ money:600, xp:200, items:[['steelsword',1]] } },
    { id:'q_boss', title:'虚空危机', desc:'击败虚空领主', type:'boss', need:1, reward:{ money:2000, xp:500, items:[['ring',1]] } },
    { id:'q_crop10', title:'丰收季节', desc:'累计收获 30 份作物', type:'harvestTotal', need:30, reward:{ money:500, xp:150 } },
    { id:'q_cook', title:'家常味道', desc:'制作 5 次料理', type:'cook', need:5, reward:{ money:200, xp:80 } },
  ];

  class Systems {
    constructor(game) { this.game = game; }

    // ========== 农业 ==========
    till(x, y) {
      const g = this.game, w = g.world, p = g.player;
      if (w.getTilled(x, y)) { G.toast('这里已经耕过了'); return; }
      const t = w.get(x, y);
      if (t === G.T.WATER || t === G.T.WALL || t === G.T.WOOD_FLOOR || t === G.T.PATH || t === G.T.CAVE_FLOOR) { G.toast('这里无法耕种'); return; }
      if (w.objectAt(x, y)) { G.toast('先清理掉这里的障碍物'); return; }
      if (!p.useStamina(2)) return;
      // 清除花草
      if (t === G.T.TALL_GRASS || t === G.T.FLOWER || t === G.T.GRASS) {
        p.addItem('fiber', t === G.T.FLOWER ? 1 : U.randInt(1,2));
      }
      w.set(x, y, G.T.DIRT);
      w.setTilled(x, y, 1);
      G.Audio.play('chop');
      G.particles.burst(x*16+8, y*16+8, '#8a6038', 5, 40, 2, 200);
      p.gainXp(2, 'farming');
    }

    water(x, y) {
      const g = this.game, w = g.world, p = g.player;
      if (!w.getTilled(x, y)) { G.toast('这里没有耕地'); return; }
      if (w.getTilled(x, y) === 2) { return; }
      if (!p.useStamina(1)) return;
      w.setTilled(x, y, 2);
      G.Audio.play('water');
      G.particles.burst(x*16+8, y*16+8, '#5bc8e8', 6, 35, 2, 100);
      p.gainXp(2, 'farming');
    }

    plant(x, y, item) {
      const g = this.game, w = g.world, p = g.player;
      const def = G.DB.item(item.id);
      if (def.type !== 'seed') { G.toast('这不是种子'); return false; }
      if (!w.getTilled(x, y)) { G.toast('需要先用锄头耕地'); return false; }
      if (w.cropAt(x, y)) { G.toast('这里已经种了东西'); return false; }
      const cropDef = G.DB.crops[def.crop];
      if (!cropDef) return false;
      if (!cropDef.seasons.includes(C.SEASONS[w.season])) {
        G.toast(`${def.name} 不适合在${C.SEASONS[w.season]}季种植`); return false;
      }
      p.removeItem(item.id, 1);
      w.setCrop(x, y, { type:def.crop, day:0, watered:false, harvested:false, growth:0 });
      G.Audio.play('plant');
      p.gainXp(3, 'farming');
      return true;
    }

    harvest(x, y) {
      const g = this.game, w = g.world, p = g.player;
      const crop = w.cropAt(x, y);
      if (!crop) return false;
      const def = G.DB.crops[crop.type];
      const ready = crop.day >= def.days;
      if (!ready) { G.toast(`还没成熟（${crop.day}/${def.days} 天）`); return false; }
      if (!p.useStamina(2)) return false;
      const yieldId = crop.type;
      let amount = 1;
      if (p.skills.farming >= 5 && U.chance(.3)) amount = 2;
      p.addItem(yieldId, amount);
      p.gainXp(def.days * 3 + 5, 'farming');
      p.stats.harvested += amount;
      G.particles.text(x*16+8, y*16, `+${amount} ${G.DB.item(yieldId).name}`, '#c8f060');
      G.Audio.play('harvest');
      if (def.regrow > 0) {
        crop.day = def.days - def.regrow; crop.harvested = true;
      } else if (def.tree) {
        crop.day = 0;
      } else {
        w.setCrop(x, y, null);
        w.setTilled(x, y, 1);
      }
      this.track('harvest', amount);
      this.track('harvestTotal', amount);
      g.checkQuests();
      return true;
    }

    // 每天推进作物生长
    advanceDay() {
      const g = this.game, w = g.world;
      let grown = 0;
      for (const key in w.crops) {
        const c = w.crops[key];
        const [x, y] = key.split(',').map(Number);
        const watered = w.getTilled(x, y) === 2;
        if (watered || U.chance(.15)) {
          c.day++;
          if (c.day >= G.DB.crops[c.type].days) grown++;
        }
        // 浇水状态重置，如果没水则枯死风险
        w.setTilled(x, y, 1);
        if (!watered && !U.chance(.85)) {
          w.setCrop(x, y, null);
          G.toast('有作物因缺水枯萎了……');
        }
      }
      // 野草在外头生长
      if (U.chance(.6)) {
        for (let i = 0; i < 3; i++) {
          const x = U.randInt(5, 100), y = U.randInt(5, 100);
          const t = w.get(x, y);
          if (t === G.T.DIRT && !w.cropAt(x, y) && !w.objectAt(x, y)) w.set(x, y, G.T.TALL_GRASS);
        }
      }
      return grown;
    }

    // ========== 战斗 ==========
    attack(dirX, dirY, weapon) {
      const p = this.game.player;
      if (p.attackTimer > 0 || p.fishing) return;
      const def = G.DB.item(weapon ? weapon.id : null);
      const isWeapon = def && (def.type === 'weapon');
      const damage = isWeapon ? def.damage : 5;
      const staminaCost = isWeapon ? (def.stamina || 3) : 2;
      if (!p.useStamina(staminaCost)) return;
      p.attackTimer = 0.34;
      p.swing = 1; p.swingDir = p.dir;
      G.Audio.play(isWeapon ? 'swing' : 'swing');
      const range = def && def.range ? def.range : 26;
      const dx = dirX, dy = dirY;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len, ny = dy / len;
      const hitX = p.x + nx * range * .6, hitY = p.y + ny * range * .6;
      // 挥砍粒子
      G.particles.burst(hitX, hitY, '#f0e0a0', 5, 70, 2, 0);
      // 命中怪物
      for (const m of this.game.monsters) {
        if (m.dead) continue;
        const d = U.dist(m.x, m.y, hitX, hitY);
        if (d < (m.w || 14) / 2 + 18) {
          const crit = U.chance(.1 + p.skills.combat * .01);
          const dmg = Math.floor(damage * (crit ? 1.8 : 1) * (1 + p.skills.combat * .08));
          m.hurt(dmg, { x:nx, y:ny });
          G.particles.text(m.x, m.y - 10, crit ? `暴击 ${dmg}!` : `${dmg}`, crit ? '#ffd040' : '#fff');
          G.Audio.play('hit');
          p.gainXp(Math.ceil(dmg / 2), 'combat');
          if (m.dead) this.onMonsterDead(m);
        }
      }
      // 挥砍工具（砍树/矿/石/草）
      const tileX = Math.floor((p.x + nx * 20) / 16), tileY = Math.floor((p.y + ny * 20) / 16);
      const usingTool = def && def.type === 'tool';
      if (usingTool) this.useTool(tileX, tileY, def.shape);
    }

    useTool(x, y, shape) {
      const g = this.game, w = g.world, p = g.player;
      const obj = w.objectAt(x, y);
      if (shape === 'hoe') { this.till(x, y); return; }
      if (shape === 'can') { this.water(x, y); return; }
      if (shape === 'rod') { this.startFishing(); return; }
      if (shape === 'axe' || shape === 'pick') {
        if (obj) {
          const valid = (shape === 'axe' && (obj.type === 'tree' || obj.type === 'pine')) ||
                        (shape === 'pick' && (obj.type === 'rock' || obj.type === 'ore'));
          if (!valid) { if (shape === 'pick' && obj.type === 'tree') G.toast('砍树要用斧头'); else if (shape === 'axe' && obj.type === 'rock') G.toast('挖矿要用镐子'); return; }
          obj.hp--;
          G.Audio.play(shape === 'axe' ? 'chop' : 'mine');
          G.particles.burst(x*16+8, y*16+8, obj.type==='ore' ? '#c8b060' : '#8a6038', 6, 50, 2, 180);
          if (obj.hp <= 0) this.breakObject(obj);
          p.gainXp(shape === 'axe' ? 3 : 5, shape === 'axe' ? 'foraging' : 'mining');
        } else {
          const t = w.get(x, y);
          if (shape === 'pick' && (t === G.T.STONE_FLOOR || t === G.T.GRAVEL)) {
            w.set(x, y, G.T.CAVE_FLOOR);
            p.addItem('stone', 1); p.gainXp(2, 'mining'); G.Audio.play('mine');
          }
        }
        return;
      }
      // 徒手也能采野草 & 灌木
      if (!obj) {
        const t = w.get(x, y);
        if (t === G.T.TALL_GRASS || t === G.T.FLOWER) {
          if (!p.useStamina(1)) return;
          p.addItem('fiber', 1);
          if (t === G.T.FLOWER) p.addItem('flower', 1);
          w.set(x, y, G.T.GRASS);
          G.Audio.play('chop');
          p.gainXp(2, 'foraging');
          this.track('forage', 1);
        }
      }
    }

    breakObject(obj) {
      const g = this.game, w = g.world, p = g.player;
      const x = obj.x, y = obj.y;
      G.Audio.play(obj.type === 'ore' ? 'mine' : 'chop');
      if (obj.type === 'tree' || obj.type === 'pine') {
        p.addItem('wood', U.randInt(4, 8));
        if (U.chance(.2)) p.addItem('acorn', 1);
        p.stats.mined++;
        G.particles.text(x*16, y*16-8, '+木材', '#d8b070');
      } else if (obj.type === 'rock') {
        p.addItem('stone', U.randInt(2, 4));
        if (U.chance(.25)) p.addItem('coal', 1);
        p.stats.mined++;
      } else if (obj.type === 'ore') {
        p.addItem(obj.ore, U.randInt(1, obj.ore === 'prismatic' ? 1 : 3));
        if (U.chance(.3)) p.addItem('stone', 1);
        p.stats.mined++;
        p.gainXp(8, 'mining');
        G.particles.text(x*16, y*16-8, `+${G.DB.item(obj.ore).name}`, '#e8d040');
      } else if (obj.type === 'bush') {
        p.addItem('berry', obj.berries || U.randInt(1,3));
        p.addItem('fiber', U.randInt(1,2));
        this.track('forage', 1);
        if (U.chance(.2)) p.addItem('sage', 1);
      }
      w.removeObject(obj);
      this.track('mine', 1);
      g.checkQuests();
    }

    onMonsterDead(m) {
      const p = this.game.player;
      const gold = U.randInt(m.def.gold[0], m.def.gold[1]);
      p.money += gold;
      p.gainXp(m.xp, 'combat');
      p.stats.kills++;
      G.Audio.play('enemyDie');
      G.particles.text(m.x, m.y - 10, `+${m.xp} XP  +${gold}G`, '#ffd040');
      // 掉落
      (m.def.drops || []).forEach(d => {
        if (U.chance(d[2])) {
          p.addItem(d[1], d[0]);
          G.particles.text(m.x + U.rand(-8,8), m.y - 18, `+${G.DB.item(d[1]).name}`, '#a8e8a8');
        }
      });
      this.track('kill', 1);
      if (m.def.boss) this.track('boss', 1);
      this.game.checkQuests();
    }

    // ========== 钓鱼 ==========
    startFishing() {
      const g = this.game, p = g.player;
      // 找附近水域
      const near = [
        [Math.floor(p.x/16), Math.floor(p.y/16)],
        [Math.floor(p.x/16)+1, Math.floor(p.y/16)],
        [Math.floor(p.x/16)-1, Math.floor(p.y/16)],
        [Math.floor(p.x/16), Math.floor(p.y/16)+1],
        [Math.floor(p.x/16), Math.floor(p.y/16)-1],
      ];
      if (!near.some(([x,y]) => g.world.isWater(x,y))) { G.toast('需要靠近水边才能钓鱼'); return false; }
      if (!p.useStamina(3)) return false;
      p.fishing = { timer: 0, phase: 'cast', wait: U.rand(1.5, 4), result: null };
      G.Audio.play('water');
      G.toast('抛竿了……等待鱼儿上钩！（按 J 收杆）');
      return true;
    }
    updateFishing(dt) {
      const p = this.game.player;
      if (!p.fishing) return;
      const f = p.fishing;
      f.timer += dt;
      if (f.phase === 'cast' && f.timer >= f.wait) {
        f.phase = 'bite'; f.timer = 0;
        G.Audio.play('phone');
        G.toast('咬钩了！快按 J 收杆！');
      }
      if (f.phase === 'bite' && f.timer > 1.8) { p.fishing = null; G.toast('鱼儿跑掉了……'); }
    }
    reelFish() {
      const p = this.game.player;
      if (!p.fishing) return;
      if (p.fishing.phase !== 'bite') { p.fishing = null; G.toast('收竿了'); return; }
      const skill = p.skills.fishing;
      const fishPool = ['fish_carp','fish_carp','fish_trout','fish_trout','fish_salmon'];
      if (skill >= 4) fishPool.push('fish_tuna');
      if (skill >= 7) fishPool.push('fish_star');
      const fish = U.pick(fishPool);
      p.addItem(fish, 1);
      p.gainXp(12 + skill * 2, 'fishing');
      p.stats.fishCaught++;
      G.Audio.play('harvest');
      G.particles.text(p.x, p.y - 14, `+${G.DB.item(fish).name}`, '#8ad8f8');
      G.toast(`钓到了 ${G.DB.item(fish).name}！`);
      p.fishing = null;
      this.track('fish', 1);
      this.game.checkQuests();
    }

    // ========== 制作 ==========
    canCraft(recipe) {
      const p = this.game.player;
      if (p.skills[recipe.skill] < recipe.level) return false;
      for (const id in recipe.need) if (p.countItem(id) < recipe.need[id]) return false;
      return true;
    }
    craft(recipe) {
      const p = this.game.player;
      if (!this.canCraft(recipe)) { G.toast('材料不足或技能等级不够'); return false; }
      for (const id in recipe.need) p.removeItem(id, recipe.need[id]);
      p.addItem(recipe.out, 1);
      p.gainXp(10, recipe.skill);
      G.Audio.play('craft');
      G.toast(`制作了 ${recipe.name}！`);
      if (recipe.out === 'bread' || recipe.out === 'soup' || recipe.out === 'cake') this.track('cook', 1);
      this.game.checkQuests();
      return true;
    }

    // ========== 使用物品 ==========
    useItem(slotIndex) {
      const p = this.game.player;
      const slot = p.inventory[slotIndex];
      if (!slot) return;
      const def = G.DB.item(slot.id);
      if (def.type === 'food') {
        p.heal(def.edible || 10);
        p.stamina = U.clamp(p.stamina + (def.edible||10)*.5, 0, p.maxStamina);
        p.removeItem(slot.id, 1);
        G.Audio.play('eat');
        G.toast(`吃下了${def.name}，恢复体力`);
      } else if (def.type === 'potion') {
        if (def.heal) p.heal(def.heal);
        if (def.mana) p.mana = U.clamp(p.mana + def.mana, 0, p.maxMana);
        if (def.stamina) p.stamina = U.clamp(p.stamina + def.stamina, 0, p.maxStamina);
        p.removeItem(slot.id, 1);
        G.Audio.play('magic');
        G.toast(`使用了${def.name}`);
      } else if (def.type === 'crop' || def.type === 'fish' || def.type === 'forage') {
        p.heal(def.edible || 8);
        p.stamina = U.clamp(p.stamina + 8, 0, p.maxStamina);
        p.removeItem(slot.id, 1);
        G.Audio.play('eat');
        G.toast(`吃下了${def.name}`);
      } else if (def.type === 'seed') {
        G.toast('先耕地，再选中种子按 J 播种');
      } else if (def.type === 'special' && slot.id === 'chest') {
        const loot = U.pick([['gold', U.randInt(30,80)], ['prismatic',1], ['ring',1], ['potion_hp',3], ['elixir',1]]);
        p.addItem(loot[0], loot[1]); p.removeItem('chest',1);
        G.Audio.play('coin');
        G.toast(`打开了宝箱：获得 ${G.DB.item(loot[0]).name} ×${loot[1]}`);
      } else if (def.type === 'special' && slot.id === 'ring') {
        this.propose();
      }
    }

    // ========== 出售 ==========
    sellAll() {
      const g = this.game, p = g.player;
      let total = 0, count = 0;
      const sellable = p.inventory.filter(s => {
        const d = G.DB.item(s.id);
        return d.price > 0 && !['tool','weapon','seed'].includes(d.type);
      });
      for (const s of sellable) {
        total += G.DB.item(s.id).price * s.n;
        count += s.n;
        p.removeItem(s.id, s.n);
      }
      if (count === 0) { G.toast('没有可以出售的物品'); return; }
      p.money += total;
      G.Audio.play('coin');
      G.toast(`出售了 ${count} 件物品，获得 ${total} G！`);
      this.track('earn', total);
      g.checkQuests();
    }

    // ========== 社交 ==========
    talk(npc) {
      const g = this.game, p = g.player;
      if (npc.talkCooldown > 0) return;
      npc.talkCooldown = 1;
      const friend = p.friendship[npc.id] || 0;
      const lines = [
        `你好呀，我是${npc.name}，村里的${npc.role}。`,
        `今天天气不错，对吧？`,
        `听说矿洞深处有很厉害的怪物，你要小心。`,
        `种田可是门学问，土壤湿润的时候作物长得最快。`,
        `你看起来是个有梦想的人，加油！`,
        friend >= 5 ? `我们已经是好朋友了，有什么需要尽管说！` : `我们多聊聊吧，我还不太了解你。`,
        friend >= 10 ? `我……我一直想对你说，你是我最重要的人。` : `最近村里发生不少事呢。`,
      ];
      G.dialogue(npc.name, U.pick(lines));
      if (!p.talkedToday[npc.id]) {
        p.friendship[npc.id] = friend + 2;
        p.talkedToday[npc.id] = true;
        p.gainXp(3, 'foraging');
        this.track('talk', 1);
        G.toast(`与 ${npc.name} 的好感 +2`);
        g.checkQuests();
      }
    }

    gift(npc) {
      const p = this.game.player;
      const slot = p.selectedItem();
      if (!slot) { G.toast('先选中一份礼物'); return; }
      const def = G.DB.item(slot.id);
      const likes = npc.likes || [];
      let amount = def.type === 'food' ? 10 : 5;
      if (likes.includes(slot.id)) amount = def.gift || 25;
      else if (def.type === 'crop' || def.type === 'fish') amount = 10;
      p.removeItem(slot.id, 1);
      const before = Math.floor((p.friendship[npc.id] || 0) / 20);
      p.friendship[npc.id] = (p.friendship[npc.id] || 0) + amount;
      const after = Math.floor((p.friendship[npc.id] || 0) / 20);
      G.dialogue(npc.name, likes.includes(slot.id) ? npc.giftLine : `唔……${def.name}？还是谢谢你啦。`);
      G.Audio.play('magic');
      G.particles.burst(npc.x, npc.y - 12, '#e8524b', 10, 40, 3, 0);
      if (after > before) G.toast(`❤ ${npc.name} 的好感提升了一颗心！`);
      this.game.checkQuests();
    }

    propose() {
      const p = this.game.player;
      const candidates = G.DB.npcs.filter(n => (p.friendship[n.id] || 0) >= 60 && !p.spouse);
      if (candidates.length === 0) { G.toast('需要先和某位村民好感达到 3 颗心'); return; }
      const npc = candidates.sort((a,b) => p.friendship[b.id] - p.friendship[a.id])[0];
      p.spouse = npc.id;
      p.partner = npc.id;
      G.dialogue(npc.name, `我……我愿意！从今天起，我们就是一家人了。`);
      G.toast(`💍 你和 ${npc.name} 结婚了！`);
      G.Audio.play('levelup');
      G.particles.burst(p.x, p.y, '#ff9fc0', 30, 80, 3, 0);
    }

    adoptPet(type) {
      const p = this.game.player;
      if (p.money < 500) { G.toast('需要 500 G 才能领养宠物'); return; }
      p.money -= 500;
      this.game.pets.push(new G.Pet(type, p.x, p.y, p));
      G.Audio.play('coin');
      G.toast(type === 'dog' ? '领养了一只小狗：旺财！' : type === 'cat' ? '领养了一只小猫：糯米！' : '领养了一只小鸟：小啾！');
    }

    // ========== 任务 ==========
    track(type, amount = 1) {
      const p = this.game.player;
      for (const q of p.quests) {
        if (q.done) continue;
        const tpl = QUEST_TEMPLATES.find(t => t.id === q.id);
        if (!tpl || tpl.type !== type) continue;
        if (type === 'earn') q.progress += amount;
        else if (type === 'minelevel') q.progress = Math.max(q.progress, amount);
        else q.progress += amount;
        if (q.progress >= tpl.need) { q.progress = tpl.need; this.completeQuest(q, tpl); }
      }
    }

    completeQuest(q, tpl) {
      const p = this.game.player;
      q.done = true;
      const r = tpl.reward;
      if (r.money) { p.money += r.money; }
      if (r.xp) p.gainXp(r.xp);
      (r.items || []).forEach(([id,n]) => p.addItem(id,n));
      G.Audio.play('levelup');
      G.toast(`🎉 任务完成：${tpl.title}！奖励 ${r.money||0}G`);
      this.game.checkQuests();
    }

    acceptQuest(id) {
      const p = this.game.player;
      const tpl = QUEST_TEMPLATES.find(t => t.id === id);
      if (!tpl || p.quests.some(q => q.id === id)) return;
      p.quests.push({ id, progress:0, done:false });
      G.toast(`接受任务：${tpl.title}`);
      G.Audio.play('phone');
    }

    claimQuest(id) {
      const p = this.game.player;
      const q = p.quests.find(q => q.id === id);
      const tpl = QUEST_TEMPLATES.find(t => t.id === id);
      if (!q || !tpl || q.claimed) return;
      q.claimed = true;
      G.toast(`领取了 ${tpl.title} 的奖励`);
    }

    // ========== 时间 ==========
    advanceTime(minutes) {
      const g = this.game;
      g.gameTime += minutes;
      if (g.gameTime >= C.DAY_MINUTES) {
        g.gameTime -= C.DAY_MINUTES;
        g.world.day++;
        if (g.world.day > 28) {
          g.world.day = 1; g.world.season++;
          if (g.world.season > 3) { g.world.season = 0; g.world.year++; }
          G.toast(`❄ 新的一年，第 ${g.world.year} 年开始了！`);
        }
        this.advanceDay();
        g.onNewDay();
        G.Audio.play('levelup');
      }
    }
  }

  G.Systems = Systems;
  G.QUEST_TEMPLATES = QUEST_TEMPLATES;
})(window);
