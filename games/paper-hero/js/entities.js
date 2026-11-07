/* 纸片勇者 — 玩家、道具、投射物、特效 */
(function (PH) {
  const U = PH.U;
  const T = 32;

  // 雨爱歌词，作为司凤鸟的子弹字形
  const LYRICS = '窗外的天气就像是你多变表情下雨陪我哭泣滴清晰呼吸爱里想念透明勇敢'.split('');
  PH.LYRICS = LYRICS;

  /* ---------------- 物理 ---------------- */
  const Phys = (PH.Phys = {
    resolveX(e, g) {
      const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T);
      const y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h - 0.01) / T);
      e.hitWall = 0;
      if (e.vx > 0) {
        for (let ty = y0; ty <= y1; ty++) {
          if (g.solidAt(x1, ty)) {
            e.x = x1 * T - e.w;
            e.vx = 0;
            e.hitWall = 1;
            break;
          }
        }
      } else if (e.vx < 0) {
        for (let ty = y0; ty <= y1; ty++) {
          if (g.solidAt(x0, ty)) {
            e.x = (x0 + 1) * T;
            e.vx = 0;
            e.hitWall = -1;
            break;
          }
        }
      }
      if (e.x < 0) {
        e.x = 0;
        e.vx = 0;
        e.hitWall = -1;
      }
      if (e.x + e.w > g.level.w * T) {
        e.x = g.level.w * T - e.w;
        e.vx = 0;
        e.hitWall = 1;
      }
    },

    resolveY(e, g) {
      const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T);
      const y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h - 0.01) / T);
      const wasGround = e.onGround;
      e.onGround = false;
      e.hitCeil = false;
      if (e.vy >= 0) {
        for (let tx = x0; tx <= x1; tx++) {
          if (g.solidAt(tx, y1)) {
            e.y = y1 * T - e.h;
            e.vy = 0;
            e.onGround = true;
            break;
          }
        }
        // 单向木板
        if (!e.onGround && !e.dropThrough) {
          const py = e.py + e.h;
          for (let tx = x0; tx <= x1; tx++) {
            const ty = Math.floor((e.y + e.h) / T);
            if (g.plankAt(tx, ty) && py <= ty * T + 3) {
              e.y = ty * T - e.h;
              e.vy = 0;
              e.onGround = true;
              break;
            }
          }
        }
      } else if (e.vy < 0) {
        for (let tx = x0; tx <= x1; tx++) {
          if (g.solidAt(tx, y0)) {
            e.y = (y0 + 1) * T;
            e.vy = 0;
            e.hitCeil = true;
            break;
          }
        }
      }
      if (!wasGround && e.onGround && e.onLand) e.onLand();
    },

    move(e, dt, g) {
      e.py = e.y;
      e.x += e.vx * dt;
      this.resolveX(e, g);
      e.y += e.vy * dt;
      this.resolveY(e, g);
      if (!isFinite(e.x) || !isFinite(e.y)) {
        console.warn('NaN position', e.constructor && e.constructor.name, e.vx, e.vy);
        e.x = isFinite(e.x) ? e.x : 0;
        e.y = isFinite(e.y) ? e.y : 0;
        e.vx = 0;
        e.vy = 0;
      }
    },

    onGroundAt(g, x, y, w) {
      const ty = Math.floor((y + 0.5) / T);
      for (let tx = Math.floor(x / T); tx <= Math.floor((x + w - 1) / T); tx++) {
        if (g.solidAt(tx, ty) || g.plankAt(tx, ty)) return true;
      }
      return false;
    },
  });

  /* ---------------- 玩家 ---------------- */
  let START_VX = 0;
  class Player {
    constructor(x, y) {
      this.w = 26;
      this.h = 56;
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.facing = 1;
      this.hp = 3;
      this.maxHp = 3;
      this.coins = 0;
      this.score = 0;
      this.shield = 0;
      this.mount = 0;
      this.hasIce = false;
      this.ammo = { gun: 0, egg: 0, weak: 0 };
      this.coyote = 0;
      this.buffer = 0;
      this.jumpHeld = false;
      this.invuln = 0;
      this.hurtT = 0;
      this.dead = false;
      this.deadT = 0;
      this.iceCd = 0;
      this.gunCd = 0;
      this.throwCd = 0;
      this.animT = 0;
      this.squash = 1;
      this.wasGround = true;
      this.stepT = 0;
      this.landT = 0;
      this.dashT = 0;
      this.trailT = 0;
      this.grown = false;
      this.growT = 0;
      this.pose = 'idle';
      // 双人模式
      this.pad = null; // 用自己的键位表；null = 默认单人键位
      this.tag = 'P1';
      this.color = '#E2574C';
      this.spr = 'hero'; // 联机时按座位换成别的纸片角色
      this.duel = false;
      this.stun = 0;
      this.lastSafe = null;
    }

    get cx() {
      return this.x + this.w / 2;
    }
    get cy() {
      return this.y + this.h / 2;
    }
    get bottom() {
      return this.y + this.h;
    }

    reset(x, y) {
      this.x = x;
      this.y = y;
      this.vx = this.vy = 0;
      this.invuln = 0;
      this.hurtT = 0;
      this.dead = false;
      this.deadT = 0;
    }

    hurt(n, g, srcX) {
      if (this.invuln > 0 || this.dead) return false;
      // 双人竞速：不掉血，只被弹开 + 短暂眩晕
      if (g && g.duel) {
        this.vx = (srcX !== undefined && srcX > this.cx ? -1 : 1) * 260;
        this.vy = -330;
        this.invuln = 1.1;
        this.stun = 0.42;
        this.hurtT = 0.4;
        PH.Audio.sfx('hurt');
        g.shake(6, 0.2);
        g.burst(this.cx, this.y + this.h / 2, 10, { color: '#E2574C', kind: 'paper' });
        return true;
      }
      if (this.shield > 0) {
        this.shield = 0;
        this.grown = false;
        this.invuln = 1.2;
        this.hurtT = 0.4;
        PH.Audio.sfx('bossHit');
        g.burst(this.cx, this.y + 20, 12, { color: '#8FD8E8', kind: 'paper' });
        g.shake(6, 0.2);
        return true;
      }
      this.hp -= n;
      this.invuln = 1.5;
      this.hurtT = 0.5;
      this.vx = (srcX !== undefined && srcX > this.cx ? -1 : 1) * 210;
      this.vy = -300;
      g.shake(9, 0.3);
      g.hitstop(0.09);
      PH.Audio.sfx('hurt');
      g.burst(this.cx, this.y + this.h / 2, 14, { color: '#E2574C', kind: 'paper' });
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.deadT = 0;
        this.vy = -520;
        PH.Audio.sfx('die');
      }
      return true;
    }

    // 回血：返回实际补上的心数
    heal(n, g, silent) {
      if (this.dead) return 0;
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + n);
      const got = this.hp - before;
      if (got <= 0) return 0;
      if (!silent) PH.Audio.sfx('heal');
      if (g) {
        g.burst(this.cx, this.y + this.h * 0.3, 10, { color: '#F0798C', kind: 'star', life: 0.8, up: 90, grav: 240 });
        g.particles.push({
          kind: 'healNum',
          x: this.cx,
          y: this.y - 4,
          vx: 0,
          vy: -58,
          t: 0,
          life: 1,
          text: '+' + got,
          grav: -18,
        });
      }
      return got;
    }

    addItem(kind, g) {
      let healed = 0;
      switch (kind) {
        case 'ice':
          this.hasIce = true;
          break;
        case 'grow':
          this.grown = true;
          this.growT = 14;
          this.shield = 1;
          healed = this.heal(1, g, true);
          break;
        case 'gun':
          this.ammo.gun += 10;
          break;
        case 'egg':
          this.ammo.egg += 3;
          break;
        case 'weak':
          this.ammo.weak += 2;
          break;
        case 'horse':
          this.mount = 11;
          break;
      }
      PH.Audio.sfx(kind === 'grow' || kind === 'horse' ? 'power' : 'pickup');
      g.burst(this.cx, this.y + this.h / 2, 16, { color: '#F2C14E', kind: 'star' });
      return { healed };
    }

    update(dt, g) {
      const In = this.pad || PH.Input;
      this.animT += dt;
      if (this.stun > 0) this.stun -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.hurtT > 0) this.hurtT -= dt;
      if (this.iceCd > 0) this.iceCd -= dt;
      if (this.gunCd > 0) this.gunCd -= dt;
      if (this.throwCd > 0) this.throwCd -= dt;
      if (this.mount > 0) this.mount -= dt;
      if (this.growT > 0) {
        this.growT -= dt;
        if (this.growT <= 0) {
          this.shield = 0;
          this.grown = false;
        }
      }
      if (this.landT > 0) this.landT -= dt;
      this.squash += (1 - this.squash) * Math.min(1, dt * 12);

      if (this.dead) {
        this.deadT += dt;
        this.vy += 1800 * dt;
        this.y += this.vy * dt;
        this.x += this.vx * dt;
        return;
      }

      const frozen = this.stun > 0;
      const run = !frozen && In.down('run');
      const maxSpd = (run ? 350 : 245) * (this.mount > 0 ? 1.28 : 1) * (this.grown ? 1.06 : 1);
      const accel = (this.onGround ? 2400 : 1500) * (this.mount > 0 ? 1.5 : 1);
      const fric = this.onGround ? 2600 : 700;
      let dir = 0;
      if (!frozen && In.down('left')) dir -= 1;
      if (!frozen && In.down('right')) dir += 1;

      if (dir !== 0) {
        this.vx += dir * accel * dt;
        this.vx = U.clamp(this.vx, -maxSpd, maxSpd);
        this.facing = dir;
      } else {
        this.vx = U.approach(this.vx, 0, fric * dt);
      }

      // 跳跃
      if (this.onGround) this.coyote = 0.1;
      else this.coyote -= dt;
      if (!frozen && In.pressed('jump')) this.buffer = 0.12;
      else this.buffer -= dt;
      this.jumpHeld = !frozen && In.down('jump');

      if (this.buffer > 0 && this.coyote > 0) {
        this.vy = -720 * (this.mount > 0 ? 1.08 : 1);
        this.buffer = 0;
        this.coyote = 0;
        this.onGround = false;
        this.squash = 1.18;
        this.landT = 0;
        PH.Audio.sfx(this.mount > 0 ? 'jumpBig' : 'jump');
        g.dust(this.cx, this.bottom, 6);
      }
      // 松开跳跃键削减上升速度
      if (this.vy < 0 && !this.jumpHeld) this.vy += 2400 * dt * 0.55;

      const grav = this.vy < 0 && this.jumpHeld ? 2400 * 0.72 : 2400;
      this.vy += grav * dt;
      if (this.vy > 1250) this.vy = 1250;

      this.dropThrough = !frozen && In.down('down');
      const prevGround = this.onGround;
      Phys.move(this, dt, g);
      if (!prevGround && this.onGround) {
        this.squash = 0.82;
        this.landT = 0.16;
        PH.Audio.sfx('land');
        g.dust(this.cx, this.bottom, 5);
      }

      // 尖刺
      if (g.spikeAt(this.x, this.y, this.w, this.h)) {
        if (this.hurt(1, g, this.cx + this.facing * 20)) this.vy = -420;
      }

      // 掉出世界
      if (this.y > g.level.h * T + 80) {
        if (g.duel || g.online) {
          const sp = this.lastSafe || this.spawn || { x: g.player.spawn.x, y: g.player.spawn.y };
          this.x = sp.x;
          this.y = sp.y;
          this.vx = 0;
          this.vy = 0;
          this.stun = 0.85;
          this.invuln = 1.4;
          this.squash = 0.8;
          PH.Audio.sfx('hurt');
          g.burst(sp.x + this.w / 2, sp.y + this.h / 2, 14, { color: '#E2574C', kind: 'paper' });
          g.toast(g.online ? '掉下去了 · 回到落脚点' : this.tag + ' 掉下去了');
        } else if (!this.dead) {
          this.dead = true;
          this.deadT = 0;
          this.hp = 0;
          PH.Audio.sfx('die');
        }
      }
      // 记录最近的安全落脚点
      if (this.onGround && Math.abs(this.vx) >= 0) {
        this.lastSafe = { x: this.x, y: this.y };
      }

      // 跑步尘土与纸屑
      if (this.onGround && Math.abs(this.vx) > 200) {
        this.trailT -= dt;
        if (this.trailT <= 0) {
          this.trailT = 0.1;
          g.dust(this.cx - this.facing * 10, this.bottom - 2, 1, 0.5);
        }
      }

      // 动作姿态
      if (!this.onGround) this.pose = this.vy < 0 ? 'jump' : 'fall';
      else if (Math.abs(this.vx) > 25) this.pose = 'run';
      else this.pose = 'idle';

      // 攻击
      if (In.pressed('ice') && this.hasIce && this.iceCd <= 0) {
        this.iceCd = 0.4;
        g.bullets.push(new IceShot(this.cx + this.facing * 16, this.y + this.h * 0.45, this.facing));
        PH.Audio.sfx('ice');
        g.burst(this.cx + this.facing * 18, this.y + this.h * 0.45, 4, { color: '#9FE6F5', kind: 'spark' });
      }
      if (In.pressed('gun') && this.ammo.gun > 0 && this.gunCd <= 0) {
        this.gunCd = 0.22;
        this.ammo.gun--;
        g.bullets.push(new GunShot(this.cx + this.facing * 18, this.y + this.h * 0.42, this.facing));
        PH.Audio.sfx('shoot');
        g.shake(2, 0.06);
      }
      if (In.pressed('egg') && this.ammo.egg > 0 && this.throwCd <= 0) {
        this.throwCd = 0.4;
        this.ammo.egg--;
        g.bullets.push(new EggShot(this.cx + this.facing * 12, this.y + this.h * 0.35, this.facing));
        PH.Audio.sfx('throw');
      }
      if (In.pressed('weak') && this.ammo.weak > 0 && this.throwCd <= 0) {
        this.throwCd = 0.4;
        this.ammo.weak--;
        g.bullets.push(new WeakShot(this.cx + this.facing * 12, this.y + this.h * 0.35, this.facing));
        PH.Audio.sfx('throw');
      }
    }

    draw(ctx, g) {
      const bob = this.pose === 'run' ? Math.sin(this.animT * 15) * 2.2 : Math.sin(this.animT * 2.4) * 1.2;
      let h = this.grown ? 100 : 86;
      if (this.mount > 0) h = 78;
      const spr = this.spr || 'hero';
      const s = PH.Assets.sizeForH(spr, h);
      const cx = this.cx;
      const foot = this.y + this.h;
      const rot = 0;
      const sy = this.squash * (this.pose === 'jump' ? 1.04 : 1);
      const sx = 1 + (1 - this.squash) * 0.55;

      // 地面阴影
      if (this.onGround) {
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#3A2A1E';
        ctx.beginPath();
        ctx.ellipse(cx, foot - 2, s.w * 0.34, 5, 0, 0, 7);
        ctx.fill();
        ctx.restore();
      }

      // 坐骑
      if (this.mount > 0) {
        const hs = PH.Assets.sizeForH('itemHorse', 78);
        const hb = Math.sin(this.animT * 10) * 2;
        PH.Assets.draw(ctx, 'itemHorse', cx - hs.w / 2 + 4, foot - hs.h + 4 + hb, hs.w, hs.h, {
          flip: this.facing < 0,
          rot: Math.sin(this.animT * 6) * 0.03,
        });
      }

      let alpha = 1;
      if (this.invuln > 0 && this.hurtT <= 0) alpha = 0.45 + Math.abs(Math.sin(this.animT * 22)) * 0.55;
      if (this.dead) alpha = 0.85;

      ctx.save();
      if (this.mount > 0) ctx.translate(0, -26);
      PH.Assets.draw(ctx, spr, cx - s.w / 2, foot - h + bob, s.w, h, {
        flip: this.facing < 0,
        rot,
        alpha,
        scaleY: sy,
        scaleX: sx * 1.06,
        shadow: true,
      });
      ctx.restore();

      // 双人标记
      if (this.showTag) {
        const labelY = foot - h - 8 + bob;
        ctx.save();
        ctx.globalAlpha = this.dead ? 0.4 : 1;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(cx, labelY + 10);
        ctx.lineTo(cx - 6, labelY + 1);
        ctx.lineTo(cx + 6, labelY + 1);
        ctx.closePath();
        ctx.fill();
        PH.Paper.text(ctx, this.tag, cx, labelY - 2, {
          size: 12,
          align: 'center',
          color: this.color,
          weight: '900',
          outline: 'rgba(255,248,232,0.9)',
          outlineW: 3.5,
        });
        ctx.restore();
      }

      // 变大护盾光环
      if (this.shield > 0) {
        ctx.save();
        const gr = ctx.createRadialGradient(cx, foot - h * 0.5, 8, cx, foot - h * 0.5, h * 0.62);
        gr.addColorStop(0, 'rgba(255,225,140,0.20)');
        gr.addColorStop(0.7, 'rgba(255,210,110,0.12)');
        gr.addColorStop(1, 'rgba(255,210,110,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.ellipse(cx, foot - h * 0.5, s.w * 0.75, h * 0.62, 0, 0, 7);
        ctx.fill();
        ctx.globalAlpha = 0.55 + Math.sin(this.animT * 5) * 0.2;
        ctx.fillStyle = '#FFEFA8';
        for (let i = 0; i < 3; i++) {
          const a = this.animT * 2 + (i * Math.PI * 2) / 3;
          const px = cx + Math.cos(a) * s.w * 0.55;
          const py = foot - h * 0.55 + Math.sin(a) * h * 0.34;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, 7);
          ctx.fill();
        }
        ctx.restore();
      }
      if (this.mount > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#E2574C';
        for (let i = 0; i < 4; i++) {
          const t = (this.animT * 2 + i * 0.25) % 1;
          ctx.globalAlpha = 0.35 * (1 - t);
          ctx.beginPath();
          ctx.ellipse(cx - this.facing * (10 + t * 46), foot - 10 - t * 18, 9, 3, 0, 0, 7);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }
  PH.Player = Player;

  /* ---------------- 投射物 ---------------- */
  class Shot {
    constructor(x, y, w, h) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.vx = 0;
      this.vy = 0;
      this.life = 3;
      this.dead = false;
      this.t = 0;
      this.fromPlayer = false;
      this.dmg = 1;
    }
    update(dt, g) {
      this.t += dt;
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.life <= 0) this.dead = true;
      // 撞墙即消失：整颗子弹的包围盒采样，斜飞也不会从墙角穿过去
      if (!this.dead) this.killOnWall(g);
    }

    // 有没有压进实心方块（出生瞬间给一点宽限，避免贴墙开枪时子弹刚出现就没）
    hitWall(g, grace) {
      if (grace && this.t < grace) return null;
      const x0 = Math.floor((this.x + 1) / T), x1 = Math.floor((this.x + this.w - 1) / T);
      const y0 = Math.floor((this.y + 1) / T), y1 = Math.floor((this.y + this.h - 1) / T);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (g.solidAt(tx, ty)) return { tx, ty };
        }
      }
      return null;
    }

    // 撞墙：贴回墙表面再爆，碎屑不会出现在墙体里面
    killOnWall(g, grace) {
      const hit = this.hitWall(g, grace);
      if (!hit) return false;
      if (Math.abs(this.vx) >= Math.abs(this.vy)) {
        this.x = this.vx > 0 ? hit.tx * T - this.w : (hit.tx + 1) * T;
      } else {
        this.y = this.vy > 0 ? hit.ty * T - this.h : (hit.ty + 1) * T;
      }
      this.dead = true;
      this.wallBurst(g);
      return true;
    }

    wallBurst(g) {
      g.burst(this.x + this.w / 2, this.y + this.h / 2, 5, { color: '#C9BFA6', kind: 'paper' });
    }

    draw(ctx, g) {}
  }

  class IceShot extends Shot {
    constructor(x, y, dir) {
      super(x - 7, y - 7, 14, 14);
      this.vx = dir * 560;
      this.fromPlayer = true;
      this.dir = dir;
      this.life = 1.1;
      this.kind = 'ice';
    }
    wallBurst(g) {
      g.burst(this.x + 7, this.y + 7, 7, { color: '#9FE6F5', kind: 'spark' });
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x + 7, this.y + 7);
      ctx.rotate(this.t * 12);
      ctx.fillStyle = '#8FD8E8';
      ctx.strokeStyle = '#2E6E86';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = i % 2 ? 4 : 8;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#D8F7FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x + 2, this.y + 7);
      ctx.lineTo(this.x - 12, this.y + 7);
      ctx.stroke();
      ctx.restore();
    }
  }

  class GunShot extends Shot {
    constructor(x, y, dir) {
      super(x - 8, y - 8, 16, 16);
      this.vx = dir * 760;
      this.fromPlayer = true;
      this.dir = dir;
      this.life = 0.9;
      this.kind = 'gun';
    }
    wallBurst(g) {
      g.burst(this.x + 8, this.y + 8, 6, { color: '#F2C14E', kind: 'spark' });
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x + 8, this.y + 8);
      ctx.rotate(this.t * 14 * this.dir);
      ctx.fillStyle = '#5FA85A';
      ctx.strokeStyle = '#26401F';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.rect(-7, -2.6, 14, 5.2);
      ctx.rect(-2.6, -7, 5.2, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#F6F1DE';
      ctx.font = 'bold 7px ' + PH.Fonts.ui;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('67', 0, 0.5);
      ctx.restore();
    }
  }

  class EggShot extends Shot {
    constructor(x, y, dir) {
      super(x - 10, y - 10, 20, 20);
      this.vx = dir * 330;
      this.vy = -330;
      this.fromPlayer = true;
      this.dir = dir;
      this.life = 2.4;
      this.rolling = false;
      this.spin = 0;
    }
    update(dt, g) {
      this.t += dt;
      this.life -= dt;
      if (!this.rolling) {
        this.vy += 1500 * dt;
      }
      const prevBottom = this.y + this.h;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.spin += this.vx * dt * 0.05;
      if (this.y + this.h > g.level.h * T) this.dead = true;
      // 只有「蛋的正下方中心落到某块地的顶面」才算落地；贴着墙侧面飞进去不算
      const tyB = Math.floor((this.y + this.h) / T);
      const solid = g.solidAt(Math.floor((this.x + this.w / 2) / T), tyB);
      const fromAbove = prevBottom <= tyB * T + 4;
      if (!this.rolling && this.vy > 0 && solid && fromAbove) {
        this.rolling = true;
        this.vy = 0;
        this.y = tyB * T - this.h;
        this.vx = this.dir * 300;
        PH.Audio.sfx('land');
      } else if (this.rolling) {
        if (g.solidAt(Math.floor((this.x + (this.dir > 0 ? this.w : 0)) / T), Math.floor((this.y + this.h / 2) / T))) {
          this.dead = true;
          g.burst(this.x + this.w / 2, this.y + this.h / 2, 8, { color: '#F6E08A', kind: 'star' });
        }
      } else if (this.killOnWall(g)) {
        // 还在空中就撞到墙：碎掉，不穿过去
      }
      if (this.life <= 0) this.dead = true;
    }
    wallBurst(g) {
      g.burst(this.x + this.w / 2, this.y + this.h / 2, 9, { color: '#F6E08A', kind: 'star' });
    }
    draw(ctx) {
      const s = PH.Assets.sizeForH('itemEgg', 30);
      PH.Assets.draw(ctx, 'itemEgg', this.x + this.w / 2 - s.w / 2, this.y + this.h / 2 - s.h / 2, s.w, s.h, {
        rot: this.spin,
      });
    }
  }

  class WeakShot extends Shot {
    constructor(x, y, dir) {
      super(x - 8, y - 8, 16, 16);
      this.vx = dir * 380;
      this.vy = -260;
      this.fromPlayer = true;
      this.dir = dir;
      this.life = 2.2;
    }
    update(dt, g) {
      this.t += dt;
      this.life -= dt;
      this.vy += 900 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.vy > 0 && g.solidAt(Math.floor((this.x + this.w / 2) / T), Math.floor((this.y + this.h) / T))) {
        this.pop(g);
      } else if (this.killOnWall(g)) {
        // 撞墙也是就地挥发
      }
      if (this.life <= 0) this.pop(g);
    }
    wallBurst(g) {
      this.pop(g);
    }
    pop(g) {
      this.dead = true;
      PH.Audio.sfx('freeze');
      g.burst(this.x + 8, this.y + 8, 18, { color: '#7FD08A', kind: 'smoke' });
      g.weakClouds.push({ x: this.x + 8, y: this.y + 8, r: 20, maxR: 92, t: 0, life: 3.2 });
    }
    draw(ctx) {
      const s = PH.Assets.sizeForH('itemWeak', 26);
      PH.Assets.draw(ctx, 'itemWeak', this.x + 8 - s.w / 2, this.y + 8 - s.h / 2, s.w, s.h, {
        rot: this.t * 6,
      });
    }
  }

  // 敌方投射物
  class SausageShot extends Shot {
    constructor(x, y, vx, vy) {
      super(x - 9, y - 18, 18, 36);
      this.vx = vx;
      this.vy = vy;
      this.life = 5;
      this.dmg = 1;
      this.rot = 0;
    }
    update(dt, g) {
      super.update(dt, g);
      this.vy += 1200 * dt;
      this.rot = Math.atan2(this.vy, this.vx) - Math.PI / 2;
      if (this.y > g.level.h * T + 40) this.dead = true;
    }
    wallBurst(g) {
      g.burst(this.x + 9, this.y + 18, 6, { color: '#C0392B', kind: 'paper' });
    }
    draw(ctx) {
      const s = PH.Assets.sizeForH('sausageShot', 36);
      PH.Assets.draw(ctx, 'sausageShot', this.x + 9 - s.w / 2, this.y + 18 - s.h / 2, s.w, s.h, { rot: this.rot });
    }
  }

  class CharShot extends Shot {
    constructor(x, y, vx, vy, ch, size) {
      const sz = size || 26;
      super(x - sz / 2, y - sz / 2, sz, sz);
      this.vx = vx;
      this.vy = vy;
      this.ch = ch;
      this.life = 4;
      this.rot = U.rnd(-0.2, 0.2);
      this.dmg = 1;
    }
    update(dt, g) {
      this.vy += 240 * dt;
      super.update(dt, g);
      if (this.dead) return;
      if (!this.dead) this.killOnWall(g);
    }
    wallBurst(g) {
      g.burst(this.x + this.w / 2, this.y + this.h / 2, 5, { color: '#8A6BB5', kind: 'paper' });
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
      ctx.rotate(this.rot + Math.sin(this.t * 4) * 0.06);
      ctx.fillStyle = '#FBF4E2';
      ctx.strokeStyle = 'rgba(70,50,40,0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(-this.w / 2, -this.h / 2, this.w, this.h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4A2A3A';
      ctx.font = 'bold ' + Math.floor(this.w * 0.72) + 'px ' + PH.Fonts.hand;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.ch, 0, 1);
      ctx.restore();
    }
  }

  class DigitShot extends Shot {
    constructor(x, y, dir, ch) {
      super(x - 13, y - 13, 26, 26);
      this.vx = dir * 250;
      this.dmg = 1;
      this.life = 4;
      this.ch = ch;
      this.rot = 0;
    }
    update(dt, g) {
      super.update(dt, g);
      this.rot += dt * 6;
      if (this.dead) return;
      if (!this.dead) this.killOnWall(g);
    }
    wallBurst(g) {
      g.burst(this.x + 13, this.y + 13, 5, { color: '#3F6B8E', kind: 'paper' });
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x + 13, this.y + 13);
      ctx.rotate(this.rot);
      ctx.fillStyle = '#5C9BD1';
      ctx.strokeStyle = '#243F58';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.rect(-10, -11, 20, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FBF4E2';
      ctx.font = 'bold 18px ' + PH.Fonts.ui;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.ch, 0, 1);
      ctx.restore();
    }
  }

  // 骷髅兵的箭
  class ArrowShot extends Shot {
    constructor(x, y, vx, vy) {
      super(x - 11, y - 4, 22, 8);
      this.vx = vx;
      this.vy = vy;
      this.life = 4;
      this.dmg = 1;
      this.rot = Math.atan2(vy, vx);
      this.grav = 150;
    }
    update(dt, g) {
      this.t += dt;
      this.life -= dt;
      this.vy += this.grav * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot = Math.atan2(this.vy, this.vx);
      if (this.life <= 0) this.dead = true;
      if (!this.dead) this.killOnWall(g);
    }
    wallBurst(g) {
      g.burst(this.x + 11, this.y + 4, 5, { color: '#C9BFA6', kind: 'paper' });
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x + 11, this.y + 4);
      ctx.rotate(this.rot);
      // 箭杆
      ctx.strokeStyle = '#8C6B46';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
      // 箭头
      ctx.fillStyle = '#EDE6D8';
      ctx.strokeStyle = 'rgba(60,45,30,0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(4, -4.6);
      ctx.lineTo(4, 4.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 尾羽
      ctx.fillStyle = '#D9604C';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-19, -5.5);
      ctx.lineTo(-9, -1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-19, 5.5);
      ctx.lineTo(-9, 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 小宇枪手的子弹
  class GunBullet extends Shot {
    constructor(x, y, vx, vy) {
      super(x - 5, y - 3, 10, 6);
      this.vx = vx;
      this.vy = vy;
      this.life = 2.2;
      this.dmg = 1;
      this.rot = Math.atan2(vy, vx);
    }
    update(dt, g) {
      this.t += dt;
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.life <= 0) this.dead = true;
      if (!this.dead) this.killOnWall(g);
    }
    wallBurst(g) {
      g.burst(this.x + 5, this.y + 3, 4, { color: '#F2C14E', kind: 'spark' });
    }
    draw(ctx) {
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const nx = this.vx / sp, ny = this.vy / sp;
      ctx.save();
      // 拖影
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#FFD48A';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x + 5 - nx * 24, this.y + 3 - ny * 24);
      ctx.lineTo(this.x + 5, this.y + 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.translate(this.x + 5, this.y + 3);
      ctx.rotate(this.rot);
      ctx.fillStyle = '#F7D27A';
      ctx.strokeStyle = '#7A4B22';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3.1, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFF4CE';
      ctx.beginPath();
      ctx.ellipse(2, -0.6, 2.4, 1.1, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }

  class GraveShot extends Shot {
    constructor(x, y, tx, ty) {
      super(x - 13, y - 18, 26, 36);
      this.dmg = 2;
      this.life = 5;
      const ang = Math.atan2(ty - y, tx - x);
      this.vx = Math.cos(ang) * 190;
      this.vy = Math.sin(ang) * 190;
      this.homeT = 1.15;
      this.rot = 0;
    }
    update(dt, g) {
      this.t += dt;
      this.life -= dt;
      if (!isFinite(this.x) || !isFinite(this.y)) {
        this.dead = true;
        return;
      }
      if (this.homeT > 0) {
        this.homeT -= dt;
        const p = g.player;
        if (p && !p.dead) {
          const ang = Math.atan2(p.y + p.h / 2 - (this.y + 18), p.x + p.w / 2 - (this.x + 13));
          this.vx += Math.cos(ang) * 420 * dt;
          this.vy += Math.sin(ang) * 420 * dt;
          const sp = Math.hypot(this.vx, this.vy);
          const max = 260;
          if (sp > max) {
            this.vx *= max / sp;
            this.vy *= max / sp;
          }
        }
      } else {
        this.vy += 1300 * dt;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot = Math.sin(this.t * 8) * 0.12;
      this.killOnWall(g);
      if (this.life <= 0) this.dead = true;
    }
    draw(ctx) {
      const s = PH.Assets.sizeForH('grave', 40);
      PH.Assets.draw(ctx, 'grave', this.x + 13 - s.w / 2, this.y + 18 - s.h / 2, s.w, s.h, { rot: this.rot });
    }
  }

  /* ---------------- 拾取物 ---------------- */
  class Coin {
    constructor(x, y) {
      this.w = 18;
      this.h = 22;
      this.x = x + 7;
      this.y = y + 5;
      this.t = U.rnd(0, 6);
      this.dead = false;
      this.type = 'coin';
      this.mag = 0;
    }
    update(dt, g) {
      this.t += dt;
      const p = g.player;
      if (!p || p.dead) return;
      const dx = p.cx - (this.x + 9);
      const dy = p.y + p.h / 2 - (this.y + 11);
      const d = Math.hypot(dx, dy);
      if (d < 78) {
        this.mag = Math.min(1, this.mag + dt * 3.2);
        this.x += (dx / (d || 1)) * this.mag * 220 * dt;
        this.y += (dy / (d || 1)) * this.mag * 220 * dt;
      }
      if (d < 26) {
        this.dead = true;
        p.coins++;
        p.score += 100;
        PH.Audio.sfx('coin');
        g.burst(this.x + 9, this.y + 11, 5, { color: '#F2C14E', kind: 'star', small: true });
      }
    }
    draw(ctx, g) {
      PH.Paper.coin(ctx, this.x + 9, this.y + 11 + Math.sin(this.t * 3) * 2, 9, this.t);
    }
  }

  const ITEM_LABEL = {
    ice: '冰冰冰',
    grow: '变大药水',
    gun: '67 枪',
    egg: '奶蛋',
    weak: '虚弱药水',
    horse: '十八马',
  };
  PH.ITEM_LABEL = ITEM_LABEL;

  class ItemPickup {
    constructor(kind, x, y) {
      this.w = 30;
      this.h = 30;
      this.x = x + 1;
      this.y = y - 4;
      this.kind = kind;
      this.t = U.rnd(0, 6);
      this.dead = false;
      this.type = 'item';
      this.spr = { ice: 'itemIce', grow: 'itemGrow', gun: 'itemGun', egg: 'itemEgg', weak: 'itemWeak', horse: 'itemHorse' }[kind];
    }
    update(dt, g) {
      this.t += dt;
      const p = g.player;
      if (!p || p.dead) return;
      if (U.hit(this, { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 })) {
        this.dead = true;
        const res = p.addItem(this.kind, g);
        const healed = res && res.healed;
        g.toast(ITEM_LABEL[this.kind] + (healed ? '  ·  回复 ' + healed + ' 心' : ''));
      }
    }
    draw(ctx) {
      const bob = Math.sin(this.t * 2.6) * 4;
      const s = PH.Assets.sizeForH(this.spr, 40);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#3A2A1E';
      ctx.beginPath();
      ctx.ellipse(this.x + 15, this.y + 34, 12, 4, 0, 0, 7);
      ctx.fill();
      ctx.restore();
      PH.Assets.draw(ctx, this.spr, this.x + 15 - s.w / 2, this.y + 30 - s.h + bob, s.w, s.h, {
        rot: Math.sin(this.t * 2) * 0.08,
      });
      // 闪光
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(this.t * 4) * 0.35;
      ctx.fillStyle = '#FFF6C8';
      const sx = this.x + 15 + Math.cos(this.t * 1.7) * 16;
      const sy = this.y + 8 + Math.sin(this.t * 2.4) * 8;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 5);
      ctx.lineTo(sx + 1.6, sy - 1.6);
      ctx.lineTo(sx + 5, sy);
      ctx.lineTo(sx + 1.6, sy + 1.6);
      ctx.lineTo(sx, sy + 5);
      ctx.lineTo(sx - 1.6, sy + 1.6);
      ctx.lineTo(sx - 5, sy);
      ctx.lineTo(sx - 1.6, sy - 1.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 回血心：小的心补 1 心，大的（金色）补满
  class HeartPickup {
    constructor(x, y, big) {
      this.big = !!big;
      this.w = this.big ? 30 : 22;
      this.h = this.big ? 30 : 22;
      this.x = x + (32 - this.w) / 2;
      this.y = y + (32 - this.h) / 2;
      this.t = U.rnd(0, 6);
      this.dead = false;
      this.type = 'heart';
      this.amount = this.big ? 9 : 1;
    }
    update(dt, g) {
      this.t += dt;
      const p = g.player;
      if (!p || p.dead) return;
      if (p.hp >= p.maxHp) return; // 满血时不消耗，留着以后吃
      if (U.hit(this, { x: p.x - 6, y: p.y - 6, w: p.w + 12, h: p.h + 12 })) {
        if (p.heal(this.amount, g) > 0) {
          this.dead = true;
          g.burst(this.x + this.w / 2, this.y + this.h / 2, 14, { color: '#F0798C', kind: 'star' });
        }
      }
    }
    draw(ctx) {
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2 + Math.sin(this.t * 2.4) * 3.5;
      const pulse = 1 + Math.sin(this.t * 3.2) * 0.055;
      const R = this.big ? 36 : 26;

      // 地面影子
      ctx.save();
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = '#3A2A1E';
      ctx.beginPath();
      ctx.ellipse(cx, this.y + this.h + 6, this.w * 0.42, 3.6, 0, 0, 7);
      ctx.fill();
      ctx.restore();

      // 光晕
      const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, R);
      const base = this.big ? '255,206,110' : '255,146,152';
      gr.addColorStop(0, 'rgba(' + base + ',' + (0.3 + Math.sin(this.t * 4) * 0.09).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(' + base + ',0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 7);
      ctx.fill();

      // 大心：转动的金色虚线环
      if (this.big) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.t * 0.8);
        ctx.strokeStyle = 'rgba(226,169,59,0.6)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, 7);
        ctx.stroke();
        ctx.restore();
      }

      // 心形
      PH.Paper.heart(ctx, cx, cy, (this.big ? 30 : 21) * pulse, true, this.big ? '#F2C14E' : '#E2574C');

      // 小星点
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const a = this.t * 1.4 + (i * Math.PI * 2) / 3;
        const rr = (this.big ? 24 : 18) + Math.sin(this.t * 2 + i) * 2;
        const sx = cx + Math.cos(a) * rr;
        const sy = cy + Math.sin(a) * rr * 0.8;
        const ss = 1.4 + (i % 2) * 0.7;
        ctx.globalAlpha = 0.35 + Math.sin(this.t * 3 + i * 2) * 0.25;
        ctx.fillStyle = this.big ? '#FFE9A8' : '#FFD3D3';
        ctx.beginPath();
        ctx.moveTo(sx, sy - ss * 2.4);
        ctx.lineTo(sx + ss * 0.8, sy);
        ctx.lineTo(sx, sy + ss * 2.4);
        ctx.lineTo(sx - ss * 0.8, sy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class Checkpoint {
    constructor(x, y) {
      this.x = x + 8;
      this.y = y + 4;
      this.w = 16;
      this.h = 46;
      this.active = false;
      this.t = 0;
      this.type = 'checkpoint';
      this.dead = false;
    }
    update(dt, g) {
      this.t += dt;
      const p = g.player;
      if (!this.active && p && !p.dead && U.hit(this, p)) {
        this.active = true;
        g.checkpoint = { x: this.x - 4, y: this.y + 28 - 56 };
        PH.Audio.sfx('checkpoint');
        g.toast('记录点');
        g.burst(this.x + 8, this.y, 18, { color: '#F2C14E', kind: 'star' });
      }
    }
    draw(ctx) {
      const bx = this.x, by = this.y;
      ctx.save();
      ctx.strokeStyle = '#4A3626';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx + 4, by + 46);
      ctx.lineTo(bx + 4, by + 2);
      ctx.stroke();
      const wave = this.active ? Math.sin(this.t * 4) * 3 : 0;
      ctx.fillStyle = this.active ? '#E2574C' : 'rgba(140,120,100,0.45)';
      ctx.beginPath();
      ctx.moveTo(bx + 4, by + 2);
      ctx.lineTo(bx + 30 + wave, by + 9);
      ctx.lineTo(bx + 4, by + 17);
      ctx.closePath();
      ctx.fill();
      if (this.active) {
        ctx.globalAlpha = 0.5 + Math.sin(this.t * 5) * 0.2;
        ctx.fillStyle = '#FFE7A3';
        ctx.beginPath();
        ctx.arc(bx + 4, by + 2, 4, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class GoalFlag {
    constructor(x, y) {
      this.x = x;
      this.y = y - 4;
      this.w = 26;
      this.h = 150;
      this.t = 0;
      this.type = 'goal';
      this.dead = false;
      this.reached = false;
    }
    update(dt, g) {
      this.t += dt;
      if (this.reached) return;
      const list = g.players || [g.player];
      for (const p of list) {
        if (!p || p.dead) continue;
        if (U.hit({ x: this.x - 10, y: this.y, w: 40, h: this.h }, p)) {
          this.reached = true;
          g.onGoal(p);
          return;
        }
      }
    }
    draw(ctx) {
      const bx = this.x, by = this.y;
      ctx.save();
      // 旗杆
      ctx.strokeStyle = '#6B5136';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx + 6, by + this.h);
      ctx.lineTo(bx + 6, by + 6);
      ctx.stroke();
      // 底座
      ctx.fillStyle = '#8B6A46';
      ctx.beginPath();
      ctx.ellipse(bx + 6, by + this.h, 16, 6, 0, 0, 7);
      ctx.fill();
      // 旗帜
      const wave = Math.sin(this.t * 3) * 4;
      ctx.beginPath();
      ctx.moveTo(bx + 8, by + 10);
      ctx.quadraticCurveTo(bx + 44 + wave, by + 24, bx + 62, by + 16 + wave);
      ctx.lineTo(bx + 62, by + 54 + wave);
      ctx.quadraticCurveTo(bx + 40 + wave, by + 60, bx + 8, by + 46);
      ctx.closePath();
      ctx.fillStyle = '#E2574C';
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,30,25,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#FDF8EA';
      ctx.font = 'bold 20px ' + PH.Fonts.ui;
      ctx.textAlign = 'center';
      ctx.fillText('终', bx + 34, by + 40 + wave * 0.6);
      // 顶球
      ctx.fillStyle = '#F2C14E';
      ctx.beginPath();
      ctx.arc(bx + 6, by + 4, 6, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- 移动平台 ---------------- */
  class MovingPlatform {
    constructor(o) {
      this.baseX = o.x * T;
      this.baseY = o.y * T;
      this.w = (o.w || 3) * T;
      this.h = 16;
      this.x = this.baseX;
      this.y = this.baseY;
      this.axis = o.axis || 'x';
      this.range = (o.range || 3) * T;
      this.speed = o.speed || 70;
      this.t = o.phase || 0;
      this.dx = 0;
      this.dy = 0;
      this.type = 'platform';
      this.dead = false;
      this.rider = null;
    }
    update(dt, g) {
      this.t += dt;
      const off = Math.sin(this.t * (this.speed / 60)) * this.range * 0.5;
      const nx = this.baseX + (this.axis === 'x' ? off : 0);
      const ny = this.baseY + (this.axis === 'y' ? off : 0);
      this.dx = nx - this.x;
      this.dy = ny - this.y;
      this.x = nx;
      this.y = ny;
      const p = g.player;
      if (p && !p.dead) {
        const feet = p.y + p.h;
        if (
          p.x + p.w > this.x + 2 &&
          p.x < this.x + this.w - 2 &&
          feet >= this.y - 4 &&
          feet <= this.y + this.h + Math.max(6, -this.dy + 6) &&
          p.vy >= 0
        ) {
          p.y = this.y - p.h;
          p.vy = 0;
          p.onGround = true;
          p.x += this.dx;
          p.y += this.dy;
          this.rider = p;
        }
      }
    }
    draw(ctx) {
      const th = PH.Paper.themes[this.themeName] || PH.THEMES.meadow;
      ctx.save();
      ctx.shadowColor = 'rgba(40,28,18,0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = th.plank;
      PH.Paper.roughRect(ctx, this.x, this.y, this.w, this.h, 1.6, 77);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = th.plank2;
      ctx.lineWidth = 2;
      for (let i = 0; i < this.w; i += 22) {
        ctx.beginPath();
        ctx.moveTo(this.x + i + 6, this.y + 2);
        ctx.lineTo(this.x + i + 6, this.y + this.h - 2);
        ctx.stroke();
      }
      // 挂绳
      ctx.strokeStyle = 'rgba(90,70,50,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.x + 6, this.y);
      ctx.lineTo(this.x + 6, this.y - 400);
      ctx.moveTo(this.x + this.w - 6, this.y);
      ctx.lineTo(this.x + this.w - 6, this.y - 400);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  PH.Ent = {
    Player,
    Coin,
    ItemPickup,
    HeartPickup,
    Checkpoint,
    GoalFlag,
    MovingPlatform,
    IceShot,
    GunShot,
    EggShot,
    WeakShot,
    SausageShot,
    CharShot,
    DigitShot,
    GraveShot,
    ArrowShot,
    GunBullet,
    LYRICS,
  };
})(window.PH);
