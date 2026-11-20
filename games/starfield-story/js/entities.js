/* ============================================================
 * 星野物语 — 实体：玩家 / 怪物 / NPC / 宠物 / 粒子
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G, U = G.U, C = G.C;

  class Entity {
    constructor(x, y, w = 14, h = 16) {
      this.x = x; this.y = y; this.w = w; this.h = h;
      this.vx = 0; this.vy = 0;
      this.dir = 'down'; this.anim = 0; this.frame = 0;
      this.dead = false; this.remove = false;
    }
    get cx() { return this.x; }
    get cy() { return this.y; }
    update(dt) { this.anim += dt; this.frame = Math.floor(this.anim * 8) % 4; }
  }

  class Player extends Entity {
    constructor(x, y) {
      super(x, y, 12, 16);
      this.name = '星野';
      this.maxHp = 100; this.hp = 100;
      this.maxStamina = 100; this.stamina = 100;
      this.maxMana = 50; this.mana = 50;
      this.money = 500;
      this.level = 1; this.xp = 0; this.xpNext = 100;
      this.skills = { farming:1, combat:1, mining:1, fishing:1, foraging:1, cooking:1 };
      this.skillXp = { farming:0, combat:0, mining:0, fishing:0, foraging:0, cooking:0 };
      this.inventory = [];
      this.selected = 0;
      this.direction = 'down';
      this.attackTimer = 0; this.invuln = 0; this.actionTimer = 0;
      this.swing = 0; this.swingDir = 'down';
      this.fishingState = null;
      this.partner = null; this.spouse = null; this.children = [];
      this.energy = 100;
      this.heading = 0;
      this.mount = null;
      this.fishing = null;
      this.quests = {};
      this.stats = { steps:0, kills:0, harvested:0, fishCaught:0, mined:0, dayPlayed:0 };
      this.friendship = {};
      this.talkedToday = {};
    }

    addItem(id, n = 1) {
      const def = G.DB.item(id);
      const maxStack = def.type === 'tool' || def.type === 'weapon' ? 1 : 99;
      let remain = n;
      // 先堆叠
      for (const s of this.inventory) {
        if (s.id === id && s.n < maxStack) {
          const add = Math.min(maxStack - s.n, remain);
          s.n += add; remain -= add;
          if (remain <= 0) return true;
        }
      }
      // 新格子（最多 24 格，超出放到背包溢出）
      while (remain > 0 && this.inventory.length < 24) {
        const add = Math.min(maxStack, remain);
        this.inventory.push({ id, n: add }); remain -= add;
      }
      if (remain > 0) { G.Audio && G.Audio.play('coin'); G.toast && G.toast('背包满了！部分物品丢失'); }
      return remain <= 0;
    }
    removeItem(id, n = 1) {
      let remain = n;
      for (let i = this.inventory.length - 1; i >= 0 && remain > 0; i--) {
        const s = this.inventory[i];
        if (s.id !== id) continue;
        const take = Math.min(s.n, remain);
        s.n -= take; remain -= take;
        if (s.n <= 0) this.inventory.splice(i, 1);
      }
      return remain <= 0;
    }
    countItem(id) { return this.inventory.filter(s => s.id === id).reduce((a, s) => a + s.n, 0); }
    selectedItem() { return this.inventory[this.selected] || null; }

    gainXp(amount, skill) {
      this.xp += amount;
      if (skill) {
        this.skillXp[skill] = (this.skillXp[skill] || 0) + amount;
        const need = this.skillLevelNeed(this.skills[skill] || 1);
        if (this.skillXp[skill] >= need) {
          this.skillXp[skill] -= need;
          this.skills[skill] = (this.skills[skill] || 1) + 1;
          G.toast(`${SKILL_NAMES[skill]} 提升到 ${this.skills[skill]} 级！`);
          G.Audio.play('levelup');
        }
      }
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext;
        this.level++;
        this.xpNext = Math.floor(100 * Math.pow(1.35, this.level - 1));
        this.maxHp += 12; this.maxMana += 5; this.maxStamina += 5;
        this.hp = this.maxHp; this.mana = this.maxMana; this.stamina = this.maxStamina;
        G.toast(`⭐ 升级！你现在是 ${this.level} 级`);
        G.Audio.play('levelup');
      }
    }
    skillLevelNeed(level) { return Math.floor(50 * Math.pow(1.5, level - 1)); }

    hurt(dmg) {
      if (this.invuln > 0) return false;
      this.hp -= dmg; this.invuln = 0.8;
      G.Audio.play('hurt');
      G.particles.burst(this.x, this.y, '#e8524b', 8);
      if (this.hp <= 0) {
        this.hp = this.maxHp;
        this.stamina = this.maxStamina / 2;
        this.x = 32 * 16; this.y = 32 * 16;
        this.money = Math.floor(this.money * 0.9);
        G.toast('你晕倒了……醒来时回到了村里，损失了一些钱');
        G.party.onDefeat && G.party.onDefeat();
      }
      return true;
    }
    heal(n) { this.hp = U.clamp(this.hp + n, 0, this.maxHp); }
    useStamina(n) {
      if (this.stamina < n) { G.toast('体力不足！吃点东西休息一下'); return false; }
      this.stamina -= n; return true;
    }

    update(dt, game) {
      super.update(dt);
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.actionTimer = Math.max(0, this.actionTimer - dt);
      this.swing = Math.max(0, this.swing - dt * 4);
      // 体力/魔力自然恢复
      if (this.actionTimer <= 0) this.stamina = U.clamp(this.stamina + dt * 3, 0, this.maxStamina);
      this.mana = U.clamp(this.mana + dt * 1.2, 0, this.maxMana);
      if (this.hp <= 0) this.hurt(1);
    }
    serialize() {
      return {
        x:this.x,y:this.y,name:this.name,hp:this.hp,maxHp:this.maxHp,stamina:this.stamina,
        maxStamina:this.maxStamina,mana:this.mana,maxMana:this.maxMana,money:this.money,
        level:this.level,xp:this.xp,xpNext:this.xpNext,skills:this.skills,skillXp:this.skillXp,
        inventory:this.inventory,selected:this.selected,spouse:this.spouse,children:this.children,
        friendship:this.friendship,quests:this.quests,stats:this.stats,partner:this.partner,
      };
    }
    static deserialize(d) {
      const p = new Player(d.x, d.y);
      Object.assign(p, d);
      return p;
    }
  }

  const SKILL_NAMES = { farming:'农耕', combat:'战斗', mining:'采矿', fishing:'钓鱼', foraging:'采集', cooking:'烹饪' };
  G.SKILL_NAMES = SKILL_NAMES;

  class Monster extends Entity {
    constructor(type, x, y, levelBonus = 0, floor = 1) {
      const def = G.DB.monsters[type];
      super(x, y, def.w, def.h);
      this.type = type; this.def = def;
      this.maxHp = def.hp + levelBonus * 6;
      this.hp = this.maxHp;
      this.dmg = def.dmg + levelBonus * 2;
      this.speed = def.speed * (1 + levelBonus * 0.02);
      this.xp = def.xp + levelBonus * 3;
      this.color = def.color;
      this.floor = floor;
      this.state = 'idle'; this.stateTimer = U.rand(0.5, 2);
      this.wanderDir = U.rand(0, Math.PI * 2);
      this.hurtFlash = 0; this.attackCooldown = 0;
      this.aggroRange = def.boss ? 130 : 96;
      this.homeX = x; this.homeY = y;
      this.bob = U.rand(0, 6);
    }
    update(dt, game) {
      super.update(dt);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt);
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      this.bob += dt * 3;
      const p = game.player;
      const d = U.dist(this.x, this.y, p.x, p.y);
      this.stateTimer -= dt;
      let mx = 0, my = 0;
      if (d < this.aggroRange && d > 1) {
        // 追踪玩家（简单 A* 式直线 + 绕障）
        mx = p.x - this.x; my = p.y - this.y;
        const len = Math.hypot(mx, my) || 1;
        mx /= len; my /= len;
        if (d < 22 && this.attackCooldown <= 0) {
          p.hurt(this.dmg); this.attackCooldown = 1.1;
          G.Audio.play('hit');
        }
      } else if (d < this.aggroRange * 1.8) {
        // 在玩家附近游荡
        if (this.stateTimer <= 0) { this.wanderDir = U.rand(0, Math.PI*2); this.stateTimer = U.rand(1, 3); }
        mx = Math.cos(this.wanderDir); my = Math.sin(this.wanderDir);
      } else {
        // 回家
        const hd = U.dist(this.x, this.y, this.homeX, this.homeY);
        if (hd > 30) { mx = this.homeX - this.x; my = this.homeY - this.y; const l = Math.hypot(mx,my)||1; mx/=l; my/=l; }
        else if (this.stateTimer <= 0) { this.wanderDir = U.rand(0, Math.PI*2); this.stateTimer = U.rand(2, 4); mx = Math.cos(this.wanderDir)*.4; my = Math.sin(this.wanderDir)*.4; }
      }
      // 障碍物避让
      const test = (dx, dy) => game.isBlocked(this.x + dx, this.y + dy, this);
      const s = this.speed * dt;
      if (test(mx * s * 2, my * s * 2)) {
        // 尝试沿墙滑动
        if (!test(mx*s*2, 0)) my = 0;
        else if (!test(0, my*s*2)) mx = 0;
        else { mx = -mx; my = -my; }
      }
      this.vx = mx * s; this.vy = my * s;
      this.x += this.vx; this.y += this.vy;
      if (Math.abs(mx) > Math.abs(my)) this.dir = mx > 0 ? 'right' : 'left';
      else this.dir = my > 0 ? 'down' : 'up';
    }
    hurt(dmg, knockDir) {
      this.hp -= dmg; this.hurtFlash = 0.2;
      G.particles.burst(this.x, this.y, this.color, 6);
      if (knockDir) { this.x += knockDir.x * 8; this.y += knockDir.y * 8; }
      if (this.hp <= 0) this.dead = true;
    }
  }

  class NPC extends Entity {
    constructor(data) {
      super(data.home[0] * 16 + 8, data.home[1] * 16 + 8, 12, 16);
      Object.assign(this, data);
      this.homeX = this.x; this.homeY = this.y;
      this.state = 'idle'; this.timer = U.rand(0.5, 4);
      this.wanderAngle = U.rand(0, 6.28);
      this.schedule = { wake: 6, work: 9, lunch: 12, rest: 20, sleep: 23 };
      this.talkCooldown = 0;
    }
    update(dt, game) {
      super.update(dt);
      this.talkCooldown = Math.max(0, this.talkCooldown - dt);
      this.timer -= dt;
      const hour = game.gameTime / 60;
      if (hour >= 23 || hour < 6) {
        // 回家睡觉
        const d = U.dist(this.x, this.y, this.homeX, this.homeY);
        if (d > 12) this.moveToward(this.homeX, this.homeY, dt, 22);
        else this.dir = 'down';
        return;
      }
      if (this.timer <= 0) {
        this.state = U.pick(['idle','idle','walk','walk','think']);
        this.timer = U.rand(2, 7);
        this.wanderAngle = U.rand(0, 6.28);
      }
      if (this.state === 'walk') {
        const tx = U.clamp(this.x + Math.cos(this.wanderAngle) * 35, 12, G.C.MAP_W * 16 - 12);
        const ty = U.clamp(this.y + Math.sin(this.wanderAngle) * 35, 12, G.C.MAP_H * 16 - 12);
        this.moveToward(tx, ty, dt, 16);
      } else {
        this.frame = 0;
      }
    }
    moveToward(tx, ty, dt, speed) {
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) return;
      const nx = dx / d, ny = dy / d;
      const game = G.game;
      if (game && !game.isBlocked(this.x + nx*speed*dt*2, this.y + ny*speed*dt*2, this)) {
        this.x += nx * speed * dt; this.y += ny * speed * dt;
      }
      this.dir = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'down' : 'up');
    }
  }

  class Pet extends Entity {
    constructor(type, x, y, owner) {
      super(x, y, 10, 10);
      this.type = type; this.owner = owner;
      this.name = type === 'dog' ? '旺财' : type === 'cat' ? '糯米' : '小啾';
      this.love = 10; this.feedTimer = 0;
      this.bob = U.rand(0, 6);
    }
    update(dt, game) {
      super.update(dt);
      this.bob += dt * 4;
      this.feedTimer = Math.max(0, this.feedTimer - dt);
      const p = game.player;
      const d = U.dist(this.x, this.y, p.x, p.y);
      if (d > 130) { this.x = p.x + U.rand(-20,20); this.y = p.y + U.rand(-20,20); return; }
      if (d > 26) {
        const dx = p.x - this.x, dy = p.y - this.y, len = Math.hypot(dx,dy);
        const s = 34 * dt;
        if (!game.isBlocked(this.x + dx/len*s*2, this.y + dy/len*s*2, this)) {
          this.x += dx/len*s; this.y += dy/len*s;
        }
        this.dir = Math.abs(dx) > Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up');
        this.frame = Math.floor(this.anim * 10) % 4;
      } else this.frame = 0;
    }
  }

  class Particle {
    constructor(x, y, color, vx, vy, life, size = 2, gravity = 0) {
      this.x = x; this.y = y; this.color = color;
      this.vx = vx; this.vy = vy; this.life = life; this.maxLife = life;
      this.size = size; this.gravity = gravity; this.dead = false;
    }
    update(dt) {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vy += this.gravity * dt;
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
  }

  class ParticleSystem {
    constructor() { this.list = []; }
    burst(x, y, color, n = 8, speed = 60, size = 2, gravity = 120) {
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, 6.28), s = U.rand(speed * .3, speed);
        this.list.push(new Particle(x, y, color, Math.cos(a)*s, Math.sin(a)*s, U.rand(.3,.8), size, gravity));
      }
    }
    text(x, y, text, color = '#fff') {
      const p = new Particle(x, y, color, 0, -22, 1.1, 10, 0);
      p.text = text; p.isText = true;
      this.list.push(p);
    }
    update(dt) { this.list.forEach(p => p.update(dt)); this.list = this.list.filter(p => !p.dead); }
    clear() { this.list.length = 0; }
  }

  class Projectile extends Entity {
    constructor(x, y, vx, vy, damage, owner, color = '#e8c840', life = 1.5) {
      super(x, y, 6, 6);
      this.vx = vx; this.vy = vy; this.damage = damage;
      this.owner = owner; this.color = color; this.life = life;
    }
    update(dt) {
      super.update(dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
  }

  G.Player = Player;
  G.Monster = Monster;
  G.NPC = NPC;
  G.Pet = Pet;
  G.ParticleSystem = ParticleSystem;
  G.Projectile = Projectile;
})(window);
