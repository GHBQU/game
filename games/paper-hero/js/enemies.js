/* 纸片勇者 — 敌人与 BOSS */
(function (PH) {
  const U = PH.U;
  const T = 32;
  const A = PH.Assets;

  // 联机共享世界：击杀统一走 World.netClaim 把实体编号广播出去，
  // 别人收到后同一只怪一起消失；单机沿用原来的死亡表现。
  // body(extra) 可以返回 undo()，供「同时击杀」判归属时撤回分数。
  function netDie(self, g, body) {
    if (g && g.netClaim) return g.netClaim(self, 'kill', body);
    body({});
    return true;
  }

  class Enemy {
    constructor(o) {
      this.type = 'enemy';
      this.t = U.rnd(0, 6);
      this.dead = false;
      this.vx = 0;
      this.vy = 0;
      this.dir = -1;
      this.onGround = false;
      this.hp = 1;
      this.maxHp = 1;
      this.freeze = 0;
      this.weak = 0;
      this.hurtCd = 0;
      this.flash = 0;
      this.stompable = true;
      this.spr = 'sausage';
      this.sprH = 56;
      this.scoreVal = 100;
      this.speed = 52;
      this.gravity = true;
      this.turnAtEdge = true;
      this.squash = 1;
      this.deadT = 0;
      this.kind = 'enemy';
    }

    place(tx, ty) {
      this.x = tx * T + (T - this.w) / 2;
      this.y = (ty + 1) * T - this.h;
    }

    get cx() {
      return this.x + this.w / 2;
    }
    get cy() {
      return this.y + this.h / 2;
    }

    update(dt, g) {
      this.t += dt;
      if (this.hurtCd > 0) this.hurtCd -= dt;
      if (this.flash > 0) this.flash -= dt;
      this.squash += (1 - this.squash) * Math.min(1, dt * 10);
      if (this.freeze > 0) {
        this.freeze -= dt;
        this.vy += 1800 * dt;
        this.vx *= 0.9;
        PH.Phys.move(this, dt, g);
        return;
      }
      if (this.weak > 0) this.weak -= dt;
      this.think(dt, g);
      if (this.gravity) {
        this.vy += 1800 * dt;
        if (this.vy > 900) this.vy = 900;
      }
      const before = this.vx;
      PH.Phys.move(this, dt, g);
      if (this.hitWall) this.onWall(this.hitWall);
      // 地面的：到边缘就转身
      if (this.turnAtEdge && this.onGround && Math.abs(this.vx) > 1) {
        const aheadX = this.dir > 0 ? this.x + this.w + 3 : this.x - 3;
        if (!PH.Phys.onGroundAt(g, aheadX, this.y + this.h, 2)) {
          this.dir *= -1;
          this.vx = Math.abs(this.vx) * this.dir * (this.slowMul ? this.slowMul() : 1);
        }
      } else if (this.turnAtEdge && this.gravity && !this.onGround && this.vy > 0 && Math.abs(this.vx) > 4) {
        // 被击退 / 起跳后往下掉时，如果落点前面是坑，就别再往前飘了
        if (!this.groundAhead(g, this.dir * 20)) this.vx *= Math.max(0, 1 - 7 * dt);
      }
      // 真的掉下去了才回收（避免无限下落）
      if (this.gravity && this.y > g.level.h * T + 200) this.dead = true;
    }

    // 身前 dx 处有没有落脚点（dx 为 0 表示脚下），用来判断悬崖
    groundAhead(g, dx, w) {
      const probeW = w === undefined ? Math.max(10, this.w * 0.6) : w;
      const x = this.cx + dx - probeW / 2;
      return PH.Phys.onGroundAt(g, x, this.y + this.h, probeW);
    }

    onWall() {
      this.dir *= -1;
    }

    speedMul() {
      return this.weak > 0 ? 0.45 : 1;
    }

    think(dt, g) {}

    damage(n, g, srcX) {
      if (this.dead) return false;
      if (this.hurtCd > 0) return false;
      this.hp -= n;
      this.hurtCd = 0.18;
      this.flash = 0.22;
      this.squash = 1.22;
      PH.Audio.sfx('bossHit');
      g.burst(this.cx, this.cy, 8, { color: '#E2574C', kind: 'paper' });
      if (this.hp <= 0) {
        this.die(g);
        return true;
      }
      // 多血量的怪 / BOSS：把剩余血量也同步出去，大家打的是同一条血
      if (g && g.online && this.nid && this.maxHp > 1 && PH.Net && PH.Net.relay) {
        PH.Net.relay({
          k: 'ev', ep: g.netEpoch, id: this.nid, a: 'hit', hp: this.hp,
          t: Math.round(g.raceTime * 1000), by: PH.Net.myId || 'me',
        });
      }
      return false;
    }

    stomp(g) {
      this.damage(2, g);
      return true;
    }

    die(g) {
      if (this.dead) return;
      netDie(this, g, (extra) => {
        this.dead = true;
        this.deadT = 0;
        g.particles.push({
          kind: 'enemyPoof',
          x: this.cx,
          y: this.cy,
          t: 0,
          life: 0.5,
          spr: this.spr,
          w: this.w * 1.2,
          h: this.h * 1.2,
          flip: this.dir > 0,
        });
        g.burst(this.cx, this.cy, 16, { color: '#F2C14E', kind: 'paper' });
        g.addScore(this.scoreVal, this.cx, this.cy);
        PH.Audio.sfx('stomp');
        // 只剩最后一颗心时，小怪有几率掉一颗回血心；这颗心也要同步给别人
        const p = g.player;
        if (p && !p.dead && p.hp <= 1 && this.w < 80 && Math.random() < 0.28) {
          const hx = this.cx - 16, hy = this.cy - 16;
          if (g.netDropHeart) {
            const id = g.netDropHeart(hx, hy, false);
            if (id) extra.drop = { id: id, x: hx, y: hy, big: 0 };
          } else {
            g.entities.push(new PH.Ent.HeartPickup(hx, hy, false));
          }
        }
        extra.spr = this.spr;
        extra.w = this.w;
        extra.h = this.h;
        extra.boss = this.isBoss ? 1 : 0;
        return () => { g.score -= this.scoreVal; };
      });
    }

    drawShadow(ctx, g) {
      if (!this.onGround || this.gravity === false) return;
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = '#2A1A12';
      ctx.beginPath();
      ctx.ellipse(this.cx, this.y + this.h - 1, this.w * 0.4, 4, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }

    drawSprite(ctx, o) {
      o = o || {};
      const s = A.sizeForH(this.spr, this.sprH);
      const bob = this.onGround && Math.abs(this.vx) > 2 ? Math.sin(this.t * 12) * 1.6 : Math.sin(this.t * 3) * 1;
      const flip = this.noFlip ? false : this.faceLeft ? this.dir > 0 : this.dir < 0;
      A.draw(ctx, this.spr, this.cx - s.w / 2, this.y + this.h - this.sprH + bob + (o.dy || 0), s.w, this.sprH, {
        flip,
        rot: o.rot || 0,
        alpha: this.flash > 0 ? 0.6 : 1,
        scaleY: this.squash,
      });
    }

    draw(ctx, g) {
      this.drawShadow(ctx, g);
      this.drawSprite(ctx);
      if (this.freeze > 0) drawIceBlock(ctx, this);
      if (this.weak > 0) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#7FD08A';
        for (let i = 0; i < 3; i++) {
          const a = this.t * 2 + (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.arc(this.cx + Math.cos(a) * 20, this.cy + Math.sin(a) * 26, 3, 0, 7);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  function drawIceBlock(ctx, e) {
    const w = e.w * 1.5, h = e.h * 1.15;
    const x = e.cx - w / 2, y = e.y + e.h - h + 4;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#9FE6F5';
    ctx.strokeStyle = '#E8FBFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + w - 2, y + 3);
    ctx.lineTo(x + w, y + h - 4);
    ctx.lineTo(x + 2, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + 4);
    ctx.lineTo(x + w * 0.42, y + h * 0.5);
    ctx.lineTo(x + w * 0.28, y + h - 4);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 红肠小怪 ---------------- */
  class Sausage extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 34;
      this.h = 46;
      this.spr = 'sausage';
      this.sprH = 56;
      this.hp = 1;
      this.speed = 54;
      this.scoreVal = 100;
      this.place(tx, ty);
    }
    think(dt, g) {
      this.vx = this.dir * this.speed * this.speedMul();
      if (this.weak > 0) this.vx *= 0.5;
    }
  }

  /* ---------------- 白菜对我笑 ---------------- */
  class Cabbage extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 38;
      this.h = 36;
      this.spr = 'cabbage';
      this.sprH = 48;
      this.hp = 1;
      this.hop = 1.2;
      this.scoreVal = 150;
      this.place(tx, ty);
    }
    think(dt, g) {
      this.hop -= dt;
      if (this.onGround) {
        this.vx = U.approach(this.vx, 0, 900 * dt);
        if (this.hop <= 0) {
          this.hop = 1.5 + U.rnd(0.5);
          let dir = g.player && g.player.cx < this.cx ? -1 : 1;
          // 落点前方是坑就别跳了，免得自己蹦下去
          if (!this.groundAhead(g, dir * 76)) {
            if (this.groundAhead(g, -dir * 76)) dir = -dir;
            else {
              this.hop = 0.4;
              return;
            }
          }
          this.dir = dir;
          this.vy = -540;
          this.vx = this.dir * 120;
          this.squash = 0.78;
        }
      }
      if (this.onGround && Math.abs(this.vx) < 4) this.vx = 0;
      if (!this.onGround) this.vx = U.approach(this.vx, this.dir * 120, 300 * dt);
    }
    draw(ctx, g) {
      this.drawShadow(ctx, g);
      this.drawSprite(ctx);
      if (this.freeze > 0) drawIceBlock(ctx, this);
    }
  }

  /* ---------------- 六七男孩 ---------------- */
  class Kid67 extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 32;
      this.h = 52;
      this.spr = 'enemy67';
      this.sprH = 60;
      this.hp = 2;
      this.maxHp = 2;
      this.speed = 34;
      this.noFlip = true;
      this.cool = 1.8;
      this.scoreVal = 250;
      this.place(tx, ty);
    }
    think(dt, g) {
      this.vx = this.dir * this.speed;
      this.cool -= dt;
      const p = g.player;
      if (this.cool <= 0 && p && !p.dead && this.weak <= 0) {
        this.cool = 2.6;
        if (Math.abs(p.cy - this.cy) < 150 && Math.abs(p.cx - this.cx) < 460) {
          const y = this.y + 18;
          g.bullets.push(new PH.Ent.DigitShot(this.cx - 12, y, -1, '6'));
          g.bullets.push(new PH.Ent.DigitShot(this.cx + 12, y, 1, '7'));
          this.squash = 1.14;
          PH.Audio.sfx('shoot');
          g.burst(this.cx - 16, y, 4, { color: '#5C9BD1', kind: 'spark' });
          g.burst(this.cx + 16, y, 4, { color: '#5C9BD1', kind: 'spark' });
        }
      }
    }
    draw(ctx, g) {
      this.drawShadow(ctx, g);
      this.drawSprite(ctx);
      if (this.freeze > 0) drawIceBlock(ctx, this);
    }
  }

  /* ---------------- 小宇枪手 ---------------- */
  class Gunner extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 32;
      this.h = 54;
      this.spr = 'gunner';
      this.sprH = 62;
      this.hp = 2;
      this.maxHp = 2;
      this.speed = 38;
      this.faceLeft = true;
      this.cool = 0;
      this.aim = 0;
      this.burstN = 0;
      this.burstT = 0;
      this.flashT = 0;
      this.scoreVal = 220;
      this.place(tx, ty);
    }
    think(dt, g) {
      if (this.flashT > 0) this.flashT -= dt;
      const p = g.player;
      const sees = p && !p.dead && Math.abs(p.cx - this.cx) < 470 && Math.abs(p.cy - this.cy) < 120;
      // 连续点射中
      if (this.burstN > 0) {
        this.vx = 0;
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.fire(g);
          this.burstN--;
          this.burstT = 0.14;
          if (this.burstN === 0) this.cool = 1.7;
        }
        return;
      }
      if (this.cool > 0) this.cool -= dt;
      if (sees && this.weak <= 0) {
        this.dir = p.cx < this.cx ? -1 : 1;
        this.vx = 0;
        this.aim += dt;
        if (this.aim > 0.42 && this.cool <= 0) {
          this.aim = 0;
          this.burstN = 3;
          this.burstT = 0;
        }
      } else {
        this.aim = 0;
        this.vx = this.dir * this.speed;
      }
    }
    fire(g) {
      const p = g.player;
      const ox = this.cx + this.dir * 24;
      const oy = this.y + 21;
      let ax = this.dir, ay = 0;
      if (p) {
        const dx = p.cx - ox;
        const dy = p.y + p.h * 0.42 - oy;
        const ang = Math.atan2(U.clamp(dy, -70, 70), dx);
        ax = Math.cos(ang);
        ay = Math.sin(ang);
      }
      g.bullets.push(new PH.Ent.GunBullet(ox, oy, ax * 540, ay * 540));
      this.flashT = 0.07;
      this.squash = 0.9;
      g.burst(ox, oy, 4, { color: '#FFD48A', kind: 'spark' });
      PH.Audio.sfx('shoot');
      g.shake(1.6, 0.06);
    }
    draw(ctx, g) {
      this.drawShadow(ctx, g);
      if (this.aim > 0.08) {
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.min(0.45, this.aim * 0.8);
        ctx.fillStyle = '#E2574C';
        ctx.beginPath();
        ctx.arc(this.cx + this.dir * 26, this.y + 21, 2.4 + this.aim * 6, 0, 7);
        ctx.fill();
        ctx.restore();
      }
      this.drawSprite(ctx);
      if (this.flashT > 0) {
        const ox = this.cx + this.dir * 28, oy = this.y + 21;
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.flashT * 16);
        ctx.fillStyle = '#FFF0B8';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = i % 2 ? 4 : 13;
          ctx.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      if (this.freeze > 0) drawIceBlock(ctx, this);
    }
  }

  /* ---------------- 骷髅兵 ---------------- */
  class Skeleton extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 32;
      this.h = 56;
      this.spr = 'skeleton';
      this.sprH = 64;
      this.hp = 3;
      this.maxHp = 3;
      this.speed = 38;
      this.faceLeft = true;
      this.charge = 0;
      this.chargeCd = 0;
      this.aim = -1;
      this.shootCd = 1.6;
      this.scoreVal = 280;
      this.place(tx, ty);
    }
    think(dt, g) {
      const p = g.player;
      const dx = p ? p.cx - this.cx : 0;
      const dy = p ? p.cy - this.cy : 0;
      const dist = Math.abs(dx);
      if (this.shootCd > 0) this.shootCd -= dt;
      if (this.chargeCd > 0) this.chargeCd -= dt;

      // 近身冲撞
      if (this.charge > 0) {
        this.charge -= dt;
        // 冲到悬崖边就刹车，不往坑里冲
        if (!this.groundAhead(g, this.dir * 24)) {
          this.charge = 0;
          this.chargeCd = 1.2;
          this.vx = 0;
          return;
        }
        this.vx = this.dir * 235;
        if (this.charge <= 0) this.chargeCd = 1.2;
        if (Math.random() < 0.25) g.dust(this.cx, this.y + this.h, 1, 0.4);
        return;
      }
      // 拉弓
      if (this.aim >= 0) {
        this.aim += dt;
        this.vx = 0;
        if (p) this.dir = dx < 0 ? -1 : 1;
        if (this.aim > 0.62) {
          this.aim = -1;
          this.shootCd = 2.2;
          this.fire(g);
        }
        return;
      }
      if (p && !p.dead && this.weak <= 0) {
        if (dist < 125 && Math.abs(dy) < 70 && this.chargeCd <= 0) {
          this.charge = 0.7;
          this.dir = dx < 0 ? -1 : 1;
          this.vx = this.dir * 200;
          g.burst(this.cx, this.y + this.h - 4, 5, { color: '#C9BFA6', kind: 'smoke' });
          return;
        }
        if (dist < 440 && Math.abs(dy) < 110 && this.shootCd <= 0) {
          this.aim = 0;
          this.dir = dx < 0 ? -1 : 1;
          this.vx = 0;
          return;
        }
      }
      this.vx = this.dir * this.speed * (this.weak > 0 ? 0.4 : 1);
    }
    fire(g) {
      const p = g.player;
      const ox = this.cx + this.dir * 16;
      const oy = this.y + 24;
      let ang = this.dir > 0 ? 0 : Math.PI;
      if (p) ang = Math.atan2(U.clamp(p.y + p.h * 0.45 - oy, -90, 90), p.cx - ox);
      const sp = 440;
      g.bullets.push(new PH.Ent.ArrowShot(ox, oy, Math.cos(ang) * sp, Math.sin(ang) * sp));
      g.burst(ox, oy, 4, { color: '#C9BFA6', kind: 'spark' });
      PH.Audio.sfx('shoot');
    }
    draw(ctx, g) {
      this.drawShadow(ctx, g);
      this.drawSprite(ctx);
      if (this.aim >= 0) {
        const t = Math.min(1, this.aim / 0.62);
        const pull = -2 - (1 - t) * 7;
        ctx.save();
        ctx.translate(this.cx + this.dir * 12, this.y + 24);
        ctx.scale(this.dir, 1);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#8C6B46';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pull - 10, 0);
        ctx.lineTo(pull + 8, 0);
        ctx.stroke();
        ctx.fillStyle = '#EDE6D8';
        ctx.strokeStyle = 'rgba(60,45,30,0.6)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(pull + 15, 0);
        ctx.lineTo(pull + 6, -4.2);
        ctx.lineTo(pull + 6, 4.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#D9604C';
        ctx.beginPath();
        ctx.moveTo(pull - 10, 0);
        ctx.lineTo(pull - 16, -4.5);
        ctx.lineTo(pull - 7, -1);
        ctx.closePath();
        ctx.fill();
        if (t > 0.65) {
          ctx.globalAlpha = (t - 0.65) / 0.35;
          ctx.fillStyle = '#FFE9A8';
          ctx.beginPath();
          ctx.arc(pull + 15, 0, 4.5, 0, 7);
          ctx.fill();
        }
        ctx.restore();
      }
      if (this.freeze > 0) drawIceBlock(ctx, this);
    }
  }

  /* ---------------- 讲解石 ---------------- */
  class Stone extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 40;
      this.h = 44;
      this.spr = 'stone';
      this.sprH = 54;
      this.hp = 3;
      this.maxHp = 3;
      this.cool = 1.6;
      this.scoreVal = 320;
      this.turnAtEdge = false;
      this.noFlip = true;
      this.place(tx, ty);
    }
    think(dt, g) {
      this.vx = 0;
      const p = g.player;
      this.cool -= dt;
      if (this.cool <= 0 && p && !p.dead && this.weak <= 0) {
        this.cool = 2.7;
        const sx = this.cx, sy = this.y + 8;
        g.bullets.push(new PH.Ent.GraveShot(sx, sy, p.cx, p.cy));
        this.squash = 1.16;
        PH.Audio.sfx('throw');
        g.burst(sx, sy, 6, { color: '#8A7F72', kind: 'smoke' });
      }
    }
    draw(ctx, g) {
      this.drawShadow(ctx, g);
      this.drawSprite(ctx);
      if (this.freeze > 0) drawIceBlock(ctx, this);
    }
  }

  /* ---------------- 司凤鸟 ---------------- */
  class Bird extends Enemy {
    constructor(tx, ty, o) {
      super();
      this.w = 42;
      this.h = 26;
      this.spr = 'bird';
      this.sprH = 44;
      this.hp = 2;
      this.maxHp = 2;
      this.gravity = false;
      this.turnAtEdge = false;
      this.baseY = ty * T;
      this.faceLeft = true;
      this.range = ((o && o.range) || 3) * T;
      this.homeX = tx * T;
      this.dir = -1;
      this.cool = 1.4;
      this.scoreVal = 260;
      this.lyricIdx = U.rndInt(0, PH.Ent.LYRICS.length - 1);
      this.x = tx * T;
      this.y = this.baseY;
    }
    think(dt, g) {
      const p = g.player;
      const tx2 = p && !p.dead ? p.cx : this.homeX;
      const targetX = U.clamp(tx2, this.homeX - 200, this.homeX + 200);
      this.x += U.clamp((targetX - this.cx) * 0.6, -70, 70) * dt;
      this.y = this.baseY + Math.sin(this.t * 2.1) * 34;
      this.dir = targetX < this.cx ? -1 : 1;
      this.cool -= dt;
      if (this.cool <= 0 && p && !p.dead && this.weak <= 0) {
        this.cool = 2.1;
        // 向四周撒出一圈歌词字
        const n = 6;
        const off = U.rnd(0, U.TAU);
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * U.TAU + U.rnd(-0.08, 0.08);
          const ch = PH.Ent.LYRICS[this.lyricIdx++ % PH.Ent.LYRICS.length];
          const sp = U.rnd(105, 150);
          g.bullets.push(new PH.Ent.CharShot(this.cx, this.cy, Math.cos(a) * sp, Math.sin(a) * sp - 20, ch, 24));
        }
        this.squash = 1.3;
        PH.Audio.sfx('ice');
        g.burst(this.cx, this.cy, 8, { color: '#C9A6D8', kind: 'spark' });
      }
    }
    onWall() {}
    draw(ctx, g) {
      const flap = Math.sin(this.t * 7) * 0.16;
      const s = A.sizeForH(this.spr, this.sprH);
      A.draw(ctx, this.spr, this.cx - s.w / 2, this.y + this.h - this.sprH, s.w, this.sprH, {
        flip: this.dir > 0,
        rot: flap - 0.1,
        alpha: this.flash > 0 ? 0.6 : 1,
      });
      if (this.freeze > 0) drawIceBlock(ctx, this);
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#2A1A12';
      ctx.beginPath();
      ctx.ellipse(this.cx, this.baseY + 60, 16, 4, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- 滚木 ---------------- */
  class Log extends Enemy {
    constructor(tx, ty, o) {
      super();
      this.w = 44;
      this.h = 44;
      this.spr = 'log';
      this.sprH = 54;
      this.hp = 4;
      this.maxHp = 4;
      this.stompable = false;
      this.speed = 128;
      this.turnAtEdge = false;
      this.spin = 0;
      this.scoreVal = 180;
      this.dir = (o && o.dir) || -1;
      this.place(tx, ty);
      this.y = (ty + 1) * T - this.h;
    }
    think(dt, g) {
      this.vx = this.dir * this.speed;
      this.spin += (this.vx / this.w) * dt * 2.2;
    }
    onWall() {
      this.dir *= -1;
      PH.Audio.sfx('land');
    }
    update(dt, g) {
      super.update(dt, g);
      if (this.y > g.level.h * T + 60) this.dead = true;
      if (this.onGround && Math.abs(this.vx) > 10 && Math.random() < 0.2) g.dust(this.cx, this.y + this.h, 1, 0.5);
    }
    draw(ctx, g) {
      this.drawShadow(ctx, g);
      const s = A.sizeForH(this.spr, this.sprH);
      A.draw(ctx, this.spr, this.cx - s.w / 2, this.y + this.h - this.sprH, s.w, this.sprH, {
        rot: this.spin,
        flip: false,
        alpha: this.flash > 0 ? 0.6 : 1,
      });
      if (this.freeze > 0) drawIceBlock(ctx, this);
    }
  }

  /* ---------------- 红肠炮管 ---------------- */
  class Cannon extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 38;
      this.h = 40;
      this.spr = 'cannon';
      this.sprH = 46;
      this.hp = 5;
      this.maxHp = 5;
      this.stompable = false;
      this.gravity = true;
      this.turnAtEdge = false;
      this.cool = 1.4;
      this.scoreVal = 300;
      this.place(tx, ty);
    }
    think(dt, g) {
      this.vx = 0;
      this.cool -= dt;
      if (this.cool <= 0) {
        this.cool = 2.2;
        if (this.weak <= 0) {
          g.bullets.push(new PH.Ent.SausageShot(this.cx, this.y - 6, U.rnd(-40, 40), -700));
          this.squash = 0.82;
          PH.Audio.sfx('shoot');
          g.burst(this.cx, this.y - 4, 6, { color: '#D9DFD2', kind: 'smoke' });
          g.shake(2, 0.08);
        }
      }
    }
    draw(ctx, g) {
      this.drawShadow(ctx, g);
      const s = A.sizeForH(this.spr, this.sprH + Math.sin(this.t * 3) * 1);
      A.draw(ctx, this.spr, this.cx - s.w / 2, this.y + this.h - this.sprH, s.w, this.sprH, {
        scaleY: this.squash,
        alpha: this.flash > 0 ? 0.6 : 1,
      });
      if (this.freeze > 0) drawIceBlock(ctx, this);
    }
  }

  /* ---------------- 红肠坦克 ---------------- */
  class Tank extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 62;
      this.h = 38;
      this.spr = 'tank';
      this.sprH = 50;
      this.hp = 8;
      this.maxHp = 8;
      this.stompable = false;
      this.turnAtEdge = false;
      this.cool = 1.6;
      this.burst = 0;
      this.scoreVal = 500;
      this.place(tx, ty);
    }
    think(dt, g) {
      this.vx = 0;
      if (g.player) this.dir = g.player.cx < this.cx ? -1 : 1;
      this.cool -= dt;
      if (this.burst > 0) {
        this.burst -= dt;
        if (this.burst <= 0) {
          g.bullets.push(new PH.Ent.SausageShot(this.cx + this.dir * 34, this.y + 18, this.dir * 330, -40));
          PH.Audio.sfx('shoot');
          g.shake(3, 0.1);
        }
      } else if (this.cool <= 0 && this.weak <= 0) {
        this.cool = 2.8;
        this.burst = 0.4;
        this.squash = 0.9;
      }
    }
    draw(ctx, g) {
      this.drawShadow(ctx, g);
      const s = A.sizeForH(this.spr, this.sprH + 2);
      A.draw(ctx, this.spr, this.cx - s.w / 2, this.y + this.h - this.sprH, s.w, this.sprH, {
        flip: this.dir < 0,
        alpha: this.flash > 0 ? 0.6 : 1,
      });
      if (this.freeze > 0) drawIceBlock(ctx, this);
    }
  }

  /* ---------------- 冲击波 ---------------- */
  class Shockwave {
    constructor(x, y, dir) {
      this.x = x;
      this.y = y;
      this.w = 34;
      this.h = 40;
      this.dir = dir;
      this.t = 0;
      this.life = 1.6;
      this.dead = false;
      this.type = 'wave';
    }
    update(dt, g) {
      this.t += dt;
      this.life -= dt;
      this.x += this.dir * 430 * dt;
      if (this.life <= 0) this.dead = true;
      if (g.solidAt(Math.floor(this.x / T), Math.floor((this.y + this.h + 4) / T)) === false) {
        // 掉坑
      }
      if (Math.random() < 0.5) g.dust(this.x + 17, this.y + this.h, 1, 0.6);
    }
    draw(ctx) {
      const a = Math.min(1, this.life * 1.6);
      ctx.save();
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = '#F2C14E';
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(this.x + 17, this.y + this.h, 10 + i * 9, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = '#C9A227';
      ctx.beginPath();
      ctx.moveTo(this.x + 6, this.y + this.h);
      ctx.lineTo(this.x + 17, this.y + this.h - 26);
      ctx.lineTo(this.x + 28, this.y + this.h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- BOSS 1 良子 ---------------- */
  class Boss1 extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 86;
      this.h = 118;
      this.spr = 'boss1';
      this.sprH = 210;
      this.hp = 30;
      this.maxHp = 30;
      this.stompable = true;
      this.isBoss = true;
      this.name = '良子';
      this.state = 'idle';
      this.stT = 0;
      this.phase = 1;
      this.dir = -1;
      this.scoreVal = 3000;
      this.turnAtEdge = false;
      this.intro = 2.2;
      this.hammerRot = 0;
      this.stunT = 0;
      this.jumpCd = 2.4;
      this.deadT = 0;
      this.place(tx, ty);
    }
    get vulnerable() {
      return this.state === 'stun';
    }
    think(dt, g) {
      const p = g.player;
      this.stT += dt;
      if (this.intro > 0) {
        this.intro -= dt;
        this.vx = 0;
        return;
      }
      const hpr = this.hp / this.maxHp;
      this.phase = hpr > 0.66 ? 1 : hpr > 0.33 ? 2 : 3;
      if (this.stunT > 0) {
        this.stunT -= dt;
        this.state = 'stun';
        this.vx = 0;
        if (this.stunT <= 0) this.state = 'walk';
        return;
      }
      if (this.state === 'slam') {
        this.vx = 0;
        this.hammerRot = U.lerp(this.hammerRot, 1.9, Math.min(1, dt * 14));
        if (this.stT > 0.34) {
          this.doSlam(g);
          this.state = 'stun';
          this.stunT = this.phase === 3 ? 1.05 : 1.5;
          this.stT = 0;
        }
        return;
      }
      if (this.state === 'jump') {
        if (this.onGround && this.vy >= 0 && this.stT > 0.2) {
          this.state = 'slam';
          this.stT = 0;
          this.hammerRot = 0;
        }
        return;
      }
      // walk toward player
      const dir = p && p.cx < this.cx ? -1 : 1;
      this.dir = dir;
      const spd = this.phase === 3 ? 92 : this.phase === 2 ? 70 : 52;
      this.vx = dir * spd;
      this.jumpCd -= dt;
      if (this.jumpCd <= 0) {
        this.jumpCd = this.phase === 3 ? 1.7 : this.phase === 2 ? 2.3 : 3;
        this.state = 'jump';
        this.stT = 0;
        this.vy = -760;
        this.vx = dir * 130;
        PH.Audio.sfx('jumpBig');
        g.dust(this.cx, this.y + this.h, 10);
      }
    }
    doSlam(g) {
      PH.Audio.sfx('hammer');
      g.shake(16, 0.4);
      g.hitstop(0.06);
      g.dust(this.cx, this.y + this.h, 16, 1.4);
      g.burst(this.cx, this.y + this.h, 12, { color: '#C9A227', kind: 'paper' });
      g.entities.push(new Shockwave(this.cx - 20, this.y + this.h - 40, 1));
      g.entities.push(new Shockwave(this.cx - 20, this.y + this.h - 40, -1));
      if (this.phase >= 2) {
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.36;
          g.bullets.push(new PH.Ent.SausageShot(this.cx, this.y, Math.cos(a) * 340, Math.sin(a) * 340 - 180));
        }
      }
      if (this.phase >= 3) {
        for (let i = 0; i < 3; i++) {
          g.bullets.push(new PH.Ent.SausageShot(this.cx, this.y + 20, U.rnd(-260, 260), -560 - i * 40));
        }
      }
    }
    onWall() {
      this.dir *= -1;
    }
    damage(n, g) {
      if (this.intro > 0) return false;
      return super.damage(n, g);
    }
    stomp(g) {
      if (!this.vulnerable) {
        g.player.hurt(1, g, this.cx);
        return false;
      }
      this.damage(3, g);
      PH.Audio.sfx('bossHit');
      g.toast('弱点命中');
      return true;
    }
    die(g) {
      if (this.dead) return;
      netDie(this, g, (extra) => {
        this.dead = true;
        this.deadT = 0;
        this.state = 'dead';
        PH.Audio.sfx('roar');
        PH.Audio.sfx('boom');
        g.shake(24, 1.2);
        g.hitstop(0.2);
        g.burst(this.cx, this.cy, 40, { color: '#E2574C', kind: 'paper' });
        g.addScore(this.scoreVal, this.cx, this.cy);
        g.bossDefeated = true;
        extra.boss = 1;
        extra.spr = this.spr || 'sausage';
        extra.w = this.w;
        extra.h = this.h;
        return () => { g.score -= this.scoreVal; };
      });
    }
    update(dt, g) {
      this.t += dt;
      if (this.hurtCd > 0) this.hurtCd -= dt;
      if (this.flash > 0) this.flash -= dt;
      this.squash += (1 - this.squash) * Math.min(1, dt * 10);
      if (this.dead) {
        this.deadT += dt;
        this.vy += 1400 * dt;
        PH.Phys.move(this, dt, g);
        if (Math.random() < 0.3) g.burst(this.cx + U.rnd(-40, 40), this.cy + U.rnd(-40, 40), 3, { color: '#F2C14E', kind: 'paper' });
        return;
      }
      if (this.freeze > 0) this.freeze -= dt;
      this.think(dt, g);
      this.vy += 2000 * dt;
      PH.Phys.move(this, dt, g);
      if (this.state === 'walk' && this.onGround === false && this.stT > 0.35) {
        this.state = 'jump';
        this.stT = 0;
      }
    }
    draw(ctx, g) {
      const s = A.sizeForH(this.spr, this.sprH);
      const foot = this.y + this.h;
      // 影子
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#2A1A12';
      ctx.beginPath();
      ctx.ellipse(this.cx, foot, 44, 8, 0, 0, 7);
      ctx.fill();
      ctx.restore();
      // 锤子
      const hr = this.state === 'slam' ? -1.05 + this.hammerRot * 1.15 : this.state === 'stun' ? 1.15 : -0.45;
      ctx.save();
      ctx.translate(this.cx + this.dir * 56, this.y + 34);
      ctx.rotate(hr * this.dir);
      ctx.scale(this.dir, 1);
      const hs = A.sizeForH('hammer', 156);
      A.draw(ctx, 'hammer', -hs.w / 2, -hs.h + 12, hs.w, hs.h, { shadow: true });
      ctx.restore();

      const blink = this.flash > 0 ? 0.65 : 1;
      const stunWobble = 0;
      A.draw(ctx, this.spr, this.cx - s.w / 2, foot - this.sprH, s.w, this.sprH, {
        flip: this.dir < 0,
        rot: stunWobble,
        alpha: blink,
        scaleY: this.squash,
      });
      // 眩晕星
      if (this.state === 'stun') {
        for (let i = 0; i < 3; i++) {
          const a = this.t * 3 + (i * Math.PI * 2) / 3;
          const x = this.cx + Math.cos(a) * 34;
          const y = this.y + 12 + Math.sin(a) * 8;
          PH.Paper.icon(ctx, 'star', x, y, 14, '#F2C14E');
        }
      }
      // 阶段怒气
      if (this.phase >= 3 && !this.dead) {
        ctx.save();
        ctx.globalAlpha = 0.25 + Math.sin(this.t * 6) * 0.1;
        ctx.strokeStyle = '#E2574C';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(this.cx, this.cy, 70, 90, 0, 0, 7);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ---------------- BOSS 2 大蛆怪 ---------------- */
  class Boss2 extends Enemy {
    constructor(tx, ty) {
      super();
      this.w = 150;
      this.h = 64;
      this.spr = 'boss2';
      this.sprH = 120;
      this.hp = 36;
      this.maxHp = 36;
      this.stompable = true;
      this.isBoss = true;
      this.name = '大蛆怪';
      this.dir = 1;
      this.state = 'crawl';
      this.stT = 0;
      this.phase = 1;
      this.scoreVal = 5000;
      this.turnAtEdge = false;
      this.intro = 2.2;
      this.cool = 2;
      this.burrowT = 0;
      this.alpha = 1;
      this.deadT = 0;
      this.faceSign = -1; // -1 = 已镜像（头朝右），1 = 原图（头朝左）
      this.turnT = 0;
      this.turnPop = 0;
      this.place(tx, ty);
      this.y = (ty + 1) * T - this.h;
      this.baseY = this.y;
    }
    get vulnerable() {
      return this.state !== 'burrow';
    }
    think(dt, g) {
      const p = g.player;
      this.stT += dt;
      if (this.intro > 0) {
        this.intro -= dt;
        this.vx = 0;
        return;
      }
      const hpr = this.hp / this.maxHp;
      this.phase = hpr > 0.66 ? 1 : hpr > 0.33 ? 2 : 3;
      this.cool -= dt;

      if (this.state === 'burrow') {
        this.alpha = Math.max(0, this.alpha - dt * 3);
        this.y = U.approach(this.y, this.baseY + 80, 240 * dt);
        this.vx = 0;
        this.burrowT += dt;
        if (this.burrowT > 0.75) {
          const px = p ? U.clamp(p.cx - 60, 80, g.level.w * T - 220) : this.cx;
          this.x = px;
          this.state = 'erupt';
          this.stT = 0;
        }
        return;
      }
      if (this.state === 'erupt') {
        this.alpha = Math.min(1, this.alpha + dt * 4);
        this.y = U.approach(this.y, this.baseY, 700 * dt);
        this.vx = 0;
        if (this.stT > 0.05 && this.stT - dt <= 0.05) {
          g.shake(14, 0.35);
          PH.Audio.sfx('boom');
          g.burst(this.cx, this.baseY + this.h, 24, { color: '#9C4A6A', kind: 'paper' });
          for (let i = 0; i < 4; i++) {
            g.bullets.push(new PH.Ent.GraveShot(this.cx + U.rnd(-40, 40), this.y, this.cx + U.rnd(-200, 200), this.y - 100));
          }
        }
        if (this.stT > 0.5) {
          this.state = 'crawl';
          this.stT = 0;
          this.cool = 1.4;
        }
        return;
      }

      if (this.state === 'charge') {
        this.vx = this.dir * (this.phase === 3 ? 300 : 240);
        if (this.hitWall) {
          this.state = 'crawl';
          this.dir *= -1;
          this.stT = 0;
          this.cool = 1.2;
          g.shake(8, 0.25);
        }
        return;
      }

      // crawl（站得太近就不转身，免得来回抖）
      if (p && Math.abs(p.cx - this.cx) > 34) this.dir = p.cx < this.cx ? -1 : 1;
      this.vx = this.dir * (this.phase === 3 ? 105 : 78);
      if (this.cool <= 0) {
        if (this.phase >= 2 && Math.random() < 0.5) {
          this.state = 'burrow';
          this.burrowT = 0;
          this.stT = 0;
          g.shake(6, 0.2);
          PH.Audio.sfx('roar');
        } else if (this.phase >= 2 && Math.random() < 0.6) {
          this.state = 'charge';
          this.stT = 0;
          g.shake(5, 0.2);
        } else {
          // 吐东西
          for (let i = 0; i < 3; i++) {
            g.bullets.push(new PH.Ent.GraveShot(this.cx + this.dir * 50, this.y + 20, this.cx + this.dir * 400, this.y + 120));
          }
          PH.Audio.sfx('throw');
          this.cool = this.phase === 3 ? 1.6 : 2.4;
        }
      }
      if (this.stT > 5.5) {
        this.state = 'crawl';
        this.stT = 0;
        this.cool = Math.min(this.cool, 0.4);
      }
    }
    onWall() {}
    stomp(g) {
      if (this.state === 'burrow') {
        return false;
      }
      this.damage(2, g);
      g.toast('弱点命中');
      return true;
    }
    die(g) {
      if (this.dead) return;
      netDie(this, g, (extra) => {
        this.dead = true;
        this.deadT = 0;
        this.state = 'dead';
        PH.Audio.sfx('roar');
        g.shake(26, 1.4);
        g.hitstop(0.22);
        g.burst(this.cx, this.cy, 50, { color: '#9C4A6A', kind: 'paper' });
        g.addScore(this.scoreVal, this.cx, this.cy);
        g.bossDefeated = true;
        extra.boss = 1;
        extra.spr = this.spr || 'sausage';
        extra.w = this.w;
        extra.h = this.h;
        return () => { g.score -= this.scoreVal; };
      });
    }
    update(dt, g) {
      this.t += dt;
      if (this.hurtCd > 0) this.hurtCd -= dt;
      if (this.flash > 0) this.flash -= dt;
      this.squash += (1 - this.squash) * Math.min(1, dt * 10);
      if (this.dead) {
        this.deadT += dt;
        this.alpha = Math.max(0, 1 - this.deadT * 0.4);
        if (this.deadT < 0.05 || Math.random() < 0.25) g.burst(this.cx + U.rnd(-90, 90), this.cy + U.rnd(-30, 30), 4, { color: '#9CE87A', kind: 'paper' });
        return;
      }
      if (this.freeze > 0) this.freeze -= dt;
      this.think(dt, g);
      // 平滑转身：横向压扁穿过 0 再翻到另一面
      const want = this.dir >= 0 ? -1 : 1;
      if (this.faceSign !== want) {
        this.turnT = Math.min(1, this.turnT + dt * 7.6);
        if (this.turnT >= 1) {
          this.faceSign = want;
          this.turnT = 0;
          this.turnPop = 1; // 翻完弹一下
        }
      } else if (this.turnT > 0) {
        this.turnT = Math.max(0, this.turnT - dt * 6);
      }
      if (this.turnPop > 0) this.turnPop = Math.max(0, this.turnPop - dt * 7);
      if (this.state === 'crawl' || this.state === 'charge') {
        this.vy += 2000 * dt;
        if (this.vy > 1200) this.vy = 1200;
      }
      PH.Phys.move(this, dt, g);
      if (this.onGround) this.baseY = this.y;
      if (this.y > g.level.h * T) this.y = g.level.h * T - this.h;
    }
    draw(ctx, g) {
      const img = A.img[this.spr];
      if (!img) return;
      const W = 300;
      const H = (img.height / img.width) * W;
      const leftX = this.cx - W / 2;
      const baseY = this.y + this.h - H + 8;
      const amp = this.state === 'charge' ? 4.5 : this.state === 'burrow' ? 2 : 9.5;
      const turn = this.turnT || 0;
      const sign = (this.faceSign || 1) * (1 - 2 * turn) * (1 + 0.07 * (this.turnPop || 0) * Math.sin((1 - this.turnPop) * Math.PI));

      ctx.save();
      ctx.globalAlpha = this.alpha;

      // 地面影子
      ctx.save();
      ctx.globalAlpha = 0.18 * this.alpha;
      ctx.fillStyle = '#2A1A12';
      ctx.beginPath();
      ctx.ellipse(this.cx, this.y + this.h, 80 * Math.abs(sign) + 6, 10, 0, 0, 7);
      ctx.fill();
      ctx.restore();

      // 镜像围绕中心做；转身时顺势下蹲、略微倾斜，看起来是“扭身”而不是“翻牌”
      const swing = Math.sin(turn * Math.PI);
      const squashY = 1 - 0.12 * swing;
      const lean = 0.075 * swing * (this.faceSign || 1);
      const pivotY = baseY + H;
      ctx.save();
      ctx.translate(this.cx, pivotY);
      ctx.rotate(lean);
      ctx.scale(sign, squashY);
      ctx.translate(-this.cx, -pivotY);

      // 连续波纹：2px 一列扫过去，接缝只有亚像素，不会再出现一条条硬边
      const paint = () => {
        const cols = Math.ceil(W / 2);
        const arc = Math.sin(turn * Math.PI);
        for (let i = 0; i < cols; i++) {
          const x0 = i * 2;
          const cw = Math.min(2, W - x0);
          const u = x0 / W;
          // 头（u→0）几乎不动，越靠尾巴甩得越厉害
          let wave = Math.sin(this.t * 5.4 - u * 4.6) * amp * (0.1 + u * u * 1.25);
          wave += arc * 7 * u * u; // 转身时尾巴顺势摆一下
          ctx.drawImage(
            img,
            (x0 / W) * img.width, 0, (cw / W) * img.width, img.height,
            leftX + x0, baseY + wave, cw + 0.8, H
          );
        }
      };

      paint();

      // 受击闪白：叠一层提亮，跟随同样的形变（以前这里画的是没翻转的原图）
      if (this.flash > 0) {
        ctx.globalAlpha = Math.min(1, this.flash * 1.6) * 0.5 * this.alpha;
        ctx.globalCompositeOperation = 'lighter';
        paint();
        ctx.globalCompositeOperation = 'source-over';
      }

      // 第三阶段眼睛发光
      if (this.phase === 3 && !this.dead) {
        ctx.save();
        ctx.globalAlpha = 0.45 + Math.sin(this.t * 4) * 0.15;
        ctx.fillStyle = '#9CE87A';
        ctx.beginPath();
        ctx.arc(leftX + W * 0.075, baseY + H * 0.5, 7.5, 0, 7);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
      ctx.restore();
    }
  }

  // LevelBuilder 的 boss 支持
  PH.Enemies = { Enemy, Sausage, Cabbage, Kid67, Gunner, Skeleton, Stone, Bird, Log, Cannon, Tank, Shockwave, Boss1, Boss2 };
  PH.makeEnemy = function (def) {
    switch (def.type) {
      case 'sausage': return new Sausage(def.x, def.y);
      case 'cabbage': return new Cabbage(def.x, def.y);
      case 'kid67': return new Kid67(def.x, def.y);
      case 'gunner': return new Gunner(def.x, def.y);
      case 'skeleton': return new Skeleton(def.x, def.y);
      case 'stone': return new Stone(def.x, def.y);
      case 'bird': return new Bird(def.x, def.y, def);
      case 'log': return new Log(def.x, def.y, def);
      case 'cannon': return new Cannon(def.x, def.y);
      case 'tank': return new Tank(def.x, def.y);
      case 'boss1': return new Boss1(def.x, def.y);
      case 'boss2': return new Boss2(def.x, def.y);
    }
    return null;
  };
})(window.PH);
