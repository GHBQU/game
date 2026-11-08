/* 纸片勇者 — 主循环、场景、HUD */
(function (PH) {
  const U = PH.U, T = 32, VW = 960, VH = 544;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(VW * dpr);
    canvas.height = Math.round(VH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ---------------- 输入 ---------------- */
  const MAP = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'ArrowUp', 'KeyW'],
    run: ['ShiftLeft', 'ShiftRight'],
    ice: ['KeyY'],
    gun: ['KeyJ'],
    egg: ['KeyK'],
    weak: ['KeyL'],
    pause: ['Escape', 'KeyP'],
    mute: ['KeyM'],
    confirm: ['Enter', 'Space'],
  };
  const Input = (PH.Input = {
    cur: new Set(),
    prev: new Set(),
    jp: new Set(),
    v: {},
    anyKey: false,
    anyT: 0,
    down(a) {
      if (this.v[a]) return true;
      const ks = MAP[a];
      if (!ks) return false;
      for (const k of ks) if (this.cur.has(k)) return true;
      return false;
    },
    pressed(a) {
      if (this.vp && this.vp[a]) return true;
      const ks = MAP[a];
      if (!ks) return false;
      for (const k of ks) if (this.jp.has(k) || (this.cur.has(k) && !this.prev.has(k))) return true;
      return false;
    },
    endFrame() {
      this.prev = new Set(this.cur);
      this.jp.clear();
      this.vp = {};
      this.anyKey = false;
    },
    virt(a, on) {
      if (on && !this.v[a]) this.vp = this.vp || {}, (this.vp[a] = true);
      this.v[a] = on;
    },
  });

  // 双人键位：P1 用 WASD 一侧，P2 用方向键一侧
  const PAD1_KEYS = {
    left: ['KeyA'],
    right: ['KeyD'],
    jump: ['KeyW', 'KeyC'],
    run: ['ShiftLeft'],
    down: ['KeyS'],
  };
  const PAD2_KEYS = {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    jump: ['ArrowUp', 'Enter', 'Numpad0'],
    run: ['ShiftRight', 'Slash', 'Numpad1'],
    down: ['ArrowDown'],
  };
  function makePad(keys, useVirtual) {
    const pad = {
      keys,
      useVirtual: !!useVirtual,
      down(a) {
        if (pad.useVirtual && Input.v && Input.v[a]) return true;
        const ks = keys[a];
        if (!ks) return false;
        for (const k of ks) if (Input.cur.has(k)) return true;
        return false;
      },
      pressed(a) {
        if (pad.useVirtual && Input.vp && Input.vp[a]) return true;
        const ks = keys[a];
        if (!ks) return false;
        for (const k of ks) if (Input.jp.has(k)) return true;
        return false;
      },
    };
    return pad;
  }
  PH.makePad = makePad;

  window.addEventListener('keydown', (e) => {
    if (PH.Account && PH.Account.opened) return; // 账号面板打开时不吃游戏按键
    if (PH.Online && PH.Online.opened) return; // 联机面板同理
    if (PH.Skins && PH.Skins.opened) return;   // 选角色时也一样
    if (PH.About && PH.About.opened) return;   // 更新日志 / 名单也一样
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!Input.cur.has(e.code)) {
      Input.anyKey = true;
      Input.anyT = 0.3;
    }
    Input.cur.add(e.code);
    if (!Input.prev.has(e.code)) Input.jp.add(e.code);
    if (G.state === 'title' || G.state === 'boot') {
      PH.Audio.init();
      PH.Audio.resume();
    }
  });
  window.addEventListener('keyup', (e) => Input.cur.delete(e.code));
  window.addEventListener('blur', () => Input.cur.clear());

  /* ---------------- 指针 ---------------- */
  const Pointer = { x: -99, y: -99, down: false, inside: false };
  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * VW) / r.width, y: ((e.clientY - r.top) * VH) / r.height };
  }
  canvas.addEventListener('pointermove', (e) => {
    const p = toGame(e);
    Pointer.x = p.x;
    Pointer.y = p.y;
    Pointer.inside = true;
    canvas.style.cursor = G.buttons && G.buttons.some((b) => hitRect(p, b)) ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => {
    Pointer.inside = false;
    Pointer.x = -99;
  });
  canvas.addEventListener('pointerdown', (e) => {
    PH.Audio.init();
    PH.Audio.resume();
    const p = toGame(e);
    Pointer.x = p.x;
    Pointer.y = p.y;
    Pointer.down = true;
    Input.anyKey = true;
    if (G.buttons) {
      for (const b of G.buttons) {
        if (!b.locked && hitRect(p, b)) {
          PH.Audio.sfx('click');
          b.onClick && b.onClick();
          break;
        }
      }
    }
  });
  canvas.addEventListener('pointerup', () => (Pointer.down = false));

  function hitRect(p, b) {
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  // 触屏
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
    document.querySelectorAll('.tbtn').forEach((btn) => {
      const k = btn.dataset.key;
      const act = btn.dataset.act;
      const on = (e) => {
        e.preventDefault();
        PH.Audio.init();
        PH.Audio.resume();
        if (act === 'pause') {
          if (G.state === 'play') {
            PH.Audio.sfx('pause');
            setState('pause');
          }
          return;
        }
        Input.virt(k, true);
        btn.classList.add('on');
        Input.anyKey = true;
      };
      const off = (e) => {
        e.preventDefault();
        if (act === 'pause') return;
        Input.virt(k, false);
        btn.classList.remove('on');
      };
      btn.addEventListener('touchstart', on, { passive: false });
      btn.addEventListener('touchend', off, { passive: false });
      btn.addEventListener('touchcancel', off, { passive: false });
      btn.addEventListener('mousedown', on);
      btn.addEventListener('mouseup', off);
    });
  }

  /* ---------------- 存档（每个本机档案一套） ---------------- */
  const LIVES_BASE = 5;   // 初始生命
  const LIVES_MAX = 9;    // 加命道具的上限
  const BUBBLE_ALONE = 3.0; // 单人等多久自动破
  const BUBBLE_TEAM = 7.0;  // 多人等队友来救的时限

  const Save = {
    unlocked: 1,
    cleared: {},
    best: {},
    // 限时挑战最好成绩：{ 'C-1': { time: 42.3, score: 1200 } }
    challenge: {},
    plays: 0,
    lives: LIVES_BASE,
    // 角色：单人一个，双人各一个
    skins: { solo: 'hero', p1: 'hero', p2: 'player2' },
    load() {
      const d = PH.Profiles ? PH.Profiles.data() : null;
      this.unlocked = Math.max(1, (d && d.unlocked) || 1);
      this.cleared = (d && d.cleared) || {};
      this.best = (d && d.best) || {};
      this.challenge = (d && d.challenge) || {};
      this.plays = (d && d.plays) | 0;
      this.lives = d && typeof d.lives === 'number' ? d.lives : LIVES_BASE;
      this.skins = Object.assign({ solo: 'hero', p1: 'hero', p2: 'player2' }, (d && d.skins) || {});
    },
    save() {
      if (PH.Profiles) PH.Profiles.write(this.snapshot());
    },
    snapshot() {
      return {
        unlocked: this.unlocked,
        cleared: this.cleared || {},
        best: this.best || {},
        challenge: this.challenge || {},
        plays: this.plays || 0,
        lives: this.lives,
        skins: this.skins,
      };
    },
  };
  Save.load();
  PH.getSaveSnapshot = () => Save.snapshot();
  PH.Save = Save;

  /* ---------------- 世界 ---------------- */
  class World {
    constructor(def, opts) {
      opts = opts || {};
      this.def = def;
      this.theme = def.theme;
      this.level = { w: def.w, h: def.h };
      this.grid = def.grid;
      this.entities = [];
      this.bullets = [];
      this.particles = [];
      this.weakClouds = [];
      this.toasts = [];
      this.cam = { x: 0, y: 0, sx: 0, sy: 0, trauma: 0 };
      this.time = 0;
      this.timeLeft = def.time || 300;
      this.hitstopT = 0;
      this.slowmoT = 0;
      this.bossDefeated = false;
      this.won = false;
      this.clearT = 0;
      this.deathT = 0;
      this.score = 0;
      this.coinCount = 0;
      this.bossClearT = 0;
      this.introT = 2.4;
      this.checkpoint = null;
      this.totalCoins = 0;
      this.boss = null;

      const px = def.start.x * T + 3;
      const py = (def.start.y + 1) * T - 56;
      this.player = new PH.Player(px, py);
      this.player.spawn = { x: px, y: py };
      this.player.lives = Save.lives;
      this.players = [this.player];
      this.duel = !!(opts && opts.duel);
      this.winner = null;
      this.duelTime = 0;

      /* ---- 联机竞速：本地只跑自己那一个角色，别人是「幽灵」 ---- */
      this.online = !!(opts && opts.online);
      this.deaths = 0;
      this.failed = false;
      this.gainedLife = 0;
      this.raceTime = 0;
      this.countdown = this.online ? 3.4 : 0;
      this.ghosts = new Map();
      this.netT = 0;
      if (this.online) {
        this.player.lives = Save.lives;
        this.player.tag = '你';
        this.player.color = '#E2574C';
        this.player.showTag = false;
        this.player.spr = PH.Net ? PH.Net.skinOf(PH.Net.myId) : 'hero';
        this.timeLeft = 9999;
        // 按座位在起跑线上错开一点，几个人不会叠成一坨
        const seat = PH.Net ? PH.Net.mySeat : 0;
        this.player.x = Math.max(8, px + (1.5 - seat) * 30);
        this.player.spawn = { x: this.player.x, y: py };
        this.player.isLocal = true;
      }
      if (!this.duel && !this.online) {
        // 单人：用这个档案挑的角色
        if (PH.Skins) this.player.spr = PH.Skins.key('solo');
      }
      if (this.duel) {
        // 两个人错开一点站位，免得叠在一起
        const skins = PH.Skins ? PH.Skins.get() : { p1: 'hero', p2: 'player2' };
        this.player.pad = makePad(PAD1_KEYS, true);
        this.player.tag = 'P1';
        this.player.color = '#E2574C';
        this.player.showTag = true;
        this.player.duel = true;
        const p2 = new PH.Player(px + 34, py);
        p2.spawn = { x: px + 34, y: py };
        p2.pad = makePad(PAD2_KEYS, false);
        p2.tag = 'P2';
        p2.color = '#2F7FC4';
        // 双人：两个人自己在面板里挑的角色
        this.player.spr = skins.p1;
        p2.spr = skins.p2;
        p2.showTag = true;
        p2.duel = true;
        p2.facing = 1;
        this.p2 = p2;
        this.players.push(p2);
        this.player.hp = 3;
        this.player.maxHp = 3;
        p2.hp = 3;
        p2.maxHp = 3;
        this.player.lives = Save.lives;
        p2.lives = Save.lives;
      }

      for (const e of def.ents) {
        if (e.type === 'coin') {
          this.entities.push(new PH.Ent.Coin(e.x * T, e.y * T));
          this.totalCoins++;
        } else if (e.type === 'item') {
          if (!this.duel) this.entities.push(new PH.Ent.ItemPickup(e.item, e.x * T, e.y * T));
        } else if (e.type === 'heart') {
          if (!this.duel) this.entities.push(new PH.Ent.HeartPickup(e.x * T, e.y * T, e.big));
        } else if (e.type === 'checkpoint') {
          this.entities.push(new PH.Ent.Checkpoint(e.x * T, e.y * T));
        } else if (e.type === 'moving') {
          const m = new PH.Ent.MovingPlatform(e);
          m.themeName = this.theme;
          this.entities.push(m);
        } else {
          const en = PH.makeEnemy(e);
          if (en) this.entities.push(en);
        }
      }
      this.goal = def.goal ? new PH.Ent.GoalFlag(def.goal.x * T, (def.goal.y + 1) * T - 150) : null;
      if (def.boss) {
        this.boss = PH.makeEnemy({ type: def.boss.type, x: def.boss.x, y: def.boss.y });
        if (this.boss) this.entities.push(this.boss);
      }

      this.buildProps();
      if (!this.duel) this.placeLifePickups();
      this.amb = [];
      for (let i = 0; i < 26; i++) {
        this.amb.push({
          x: Math.random() * VW,
          y: Math.random() * VH,
          vx: U.rnd(-8, 8),
          vy: U.rnd(-6, 10),
          s: U.rnd(1.5, 4),
          a: U.rnd(0.1, 0.4),
          ph: U.rnd(0, 6),
        });
      }

      if (opts.fromCheckpoint) {
        const cp = opts.cp;
        this.player.x = cp.x;
        this.player.y = cp.y;
        this.checkpoint = cp;
        this.player.hp = this.player.maxHp;
        // 把检查点激活
        for (const e of this.entities) if (e.type === 'checkpoint' && Math.abs(e.x - cp.x) < 80) e.active = true;
      }
      this.updateCamera(1, true);
    }

    buildProps() {
      this.props = [];
      const rng = U.mulberry(this.def.id.split('').reduce((a, c) => a + c.charCodeAt(0), 7) * 131);
      const dark = this.theme === 'cave' || this.theme === 'nest';
      for (let tx = 1; tx < this.level.w - 1; tx++) {
        for (let ty = 1; ty < this.level.h; ty++) {
          if (this.grid[ty][tx] !== 1) continue;
          if (this.grid[ty - 1][tx] !== 0) continue;
          if (this.grid[ty - 1][tx - 1] !== 0 || this.grid[ty - 1][tx + 1] !== 0) continue;
          const r = rng();
          if (r > 0.34) continue;
          const kinds = dark ? ['rock', 'tuft', 'rock', 'mushroom'] : ['bush', 'flower', 'tuft', 'flower', 'rock'];
          this.props.push({
            t: kinds[Math.floor(rng() * kinds.length)],
            x: tx * T + 16 + (rng() - 0.5) * 14,
            y: ty * T + 2,
            s: 0.7 + rng() * 0.7,
            flip: rng() > 0.5,
            tone: rng(),
          });
        }
      }
    }

    drawProps(camX) {
      const th = PH.THEMES[this.theme];
      const dark = this.theme === 'cave' || this.theme === 'nest';
      for (const p of this.props) {
        if (p.x < camX - 60 || p.x > camX + VW + 60) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(p.s * (p.flip ? -1 : 1), p.s);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#2A1A12';
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 3, 0, 0, 7);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (p.t === 'bush') {
          ctx.fillStyle = th.grass2;
          ctx.beginPath();
          ctx.arc(-7, -6, 7, 0, 7);
          ctx.arc(1, -10, 8.4, 0, 7);
          ctx.arc(9, -5, 6.6, 0, 7);
          ctx.fill();
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#DFF2B4';
          ctx.beginPath();
          ctx.arc(-3, -12, 3.6, 0, 7);
          ctx.arc(5, -13, 2.8, 0, 7);
          ctx.fill();
        } else if (p.t === 'flower') {
          ctx.strokeStyle = th.grass2;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(1.5, -7, 0, -13);
          ctx.stroke();
          const col = p.tone > 0.6 ? '#F2A0B4' : p.tone > 0.3 ? '#FFE08A' : '#FDF6E3';
          ctx.fillStyle = col;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * 7;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * 3.4, -13 + Math.sin(a) * 3.4, 2.5, 0, 7);
            ctx.fill();
          }
          ctx.fillStyle = '#E2A93B';
          ctx.beginPath();
          ctx.arc(0, -13, 1.8, 0, 7);
          ctx.fill();
        } else if (p.t === 'tuft') {
          for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = i % 2 ? th.grass : th.grass2;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(i * 3 - 4, 0);
            ctx.quadraticCurveTo(i * 3 - 4 + (i % 2 ? 3 : -3), -6, i * 3 - 4 + (i % 2 ? 6 : -6), -11 - i);
            ctx.stroke();
          }
        } else if (p.t === 'rock') {
          ctx.fillStyle = dark ? '#6F6472' : '#B6AA96';
          ctx.beginPath();
          ctx.moveTo(-8, 0);
          ctx.lineTo(-6, -6);
          ctx.lineTo(0, -9);
          ctx.lineTo(7, -6);
          ctx.lineTo(9, 0);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = '#FFF6E0';
          ctx.beginPath();
          ctx.moveTo(-5, -6);
          ctx.lineTo(0, -8.4);
          ctx.lineTo(2, -6);
          ctx.closePath();
          ctx.fill();
        } else if (p.t === 'crystal') {
          ctx.fillStyle = U.rgba(th.accent, 0.55);
          ctx.beginPath();
          ctx.moveTo(0, -16);
          ctx.lineTo(4, -4);
          ctx.lineTo(0, 0);
          ctx.lineTo(-4, -4);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(1.5, -5);
          ctx.lineTo(0, -3);
          ctx.closePath();
          ctx.fill();
        } else if (p.t === 'mushroom') {
          ctx.fillStyle = '#E8DCC4';
          ctx.fillRect(-2, -7, 4, 7);
          ctx.fillStyle = p.tone > 0.5 ? '#D9604C' : '#B57FC8';
          ctx.beginPath();
          ctx.arc(0, -8, 7, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.arc(-3, -10, 1.4, 0, 7);
          ctx.arc(2.5, -9, 1, 0, 7);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    updateAmb(dt) {
      for (const m of this.amb) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.ph += dt;
        if (m.y > VH + 10) {
          m.y = -10;
          m.x = Math.random() * VW;
        }
        if (m.y < -10) m.y = VH + 10;
        if (m.x > VW + 10) m.x = -10;
        if (m.x < -10) m.x = VW + 10;
      }
    }

    drawAmb() {
      const dark = this.theme === 'cave' || this.theme === 'nest';
      ctx.save();
      for (const m of this.amb) {
        ctx.globalAlpha = m.a * (0.5 + Math.sin(m.ph * 2) * 0.4);
        ctx.fillStyle = dark ? '#B6F0A8' : '#FFF6C8';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.s, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }

    solidAt(tx, ty) {
      if (!isFinite(tx) || !isFinite(ty)) return false;
      if (tx < 0 || tx >= this.level.w) return true;
      if (ty < 0 || ty >= this.level.h) return false;
      const v = this.grid[ty][tx];
      return v === 1 || v === 2 || v === 3 || v === 6;
    }
    plankAt(tx, ty) {
      if (tx < 0 || tx >= this.level.w || ty < 0 || ty >= this.level.h) return false;
      return this.grid[ty][tx] === 4;
    }
    spikeAt(x, y, w, h) {
      const x0 = Math.floor(x / T), x1 = Math.floor((x + w - 1) / T);
      const y0 = Math.floor(y / T), y1 = Math.floor((y + h - 1) / T);
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++) {
          if (tx < 0 || tx >= this.level.w || ty < 0 || ty >= this.level.h) continue;
          if (this.grid[ty][tx] === 5) return true;
        }
      return false;
    }

    // ---- 特效 ----
    burst(x, y, n, o) {
      o = o || {};
      for (let i = 0; i < n; i++) {
        const a = U.rnd(0, U.TAU);
        const sp = o.small ? U.rnd(20, 90) : U.rnd(40, 210);
        this.particles.push({
          kind: o.kind || 'paper',
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (o.up || 40),
          t: 0,
          life: o.life || U.rnd(0.4, 0.9),
          size: o.small ? U.rnd(2, 4) : U.rnd(3, 7),
          color: o.color || '#E2574C',
          rot: U.rnd(0, 6),
          vr: U.rnd(-8, 8),
          grav: o.grav === undefined ? 620 : o.grav,
        });
      }
    }
    dust(x, y, n, scale) {
      for (let i = 0; i < n; i++) {
        this.particles.push({
          kind: 'smoke',
          x: x + U.rnd(-8, 8),
          y: y + U.rnd(-4, 2),
          vx: U.rnd(-50, 50),
          vy: U.rnd(-70, -10),
          t: 0,
          life: U.rnd(0.28, 0.55),
          size: U.rnd(5, 11) * (scale || 1),
          color: '#E8DCC4',
          rot: 0,
          vr: 0,
          grav: -30,
        });
      }
    }
    shake(amount, time) {
      this.cam.trauma = Math.min(1.4, this.cam.trauma + amount / 22);
    }
    hitstop(t) {
      this.hitstopT = Math.max(this.hitstopT, t);
    }
    addScore(v, x, y) {
      this.score += v;
      this.particles.push({ kind: 'score', x, y, vx: 0, vy: -60, t: 0, life: 0.9, text: '+' + v, color: '#F2C14E', grav: -30 });
    }
    toast(text) {
      this.toasts.push({ text, t: 0, life: 2.2 });
    }

    onGoal(winner) {
      if (this.won) return;
      this.won = true;
      this.winner = winner || this.player;
      this.clearT = 0;
      this.player.vx = 0;
      if (this.duel) for (const pl of this.players) pl.vx = 0;
      PH.Audio.sfx('clear');
      if (this.goal) this.burst(this.goal.x + 6, this.goal.y + 40, 40, { color: '#F2C14E', kind: 'paper', life: 1.6 });
      else this.burst(this.player.cx, this.player.cy, 40, { color: '#F2C14E', kind: 'paper', life: 1.6 });
    }

    // 双人：两人不能跑出同一屏。落后的人会被「牵引」着往前走。
    // 牵引不是传送：逐帧推进并沿路检查砖块，撞到墙就贴住墙、当场挤死，绝不穿墙。
    updateDuelBounds(dt) {
      if (!this.duel || this.won) return;
      const [a, b] = this.players;
      if (Math.abs(a.cx - b.cx) <= VW - 180) return;
      const lead = a.cx > b.cx ? a : b;
      const back = lead === a ? b : a;
      if (back.dead || back.bubbled || back.eliminated) return;
      const dir = Math.sign(lead.cx - back.cx) || 1;
      const want = lead.x - dir * (VW - 200);
      const gap = (want - back.x) * dir;
      if (gap <= 0) return;
      const nx = back.x + Math.min(gap, 1200 * (dt || 0.016)) * dir;
      const hitTile = this.pullPathBlocked(back, back.x, nx, dir);
      if (hitTile !== null) {
        back.x = this.pullStopX(back, back.x, dir, hitTile);
        back.vx = 0;
        this.crushPlayer(back);
        return;
      }
      back.x = nx;
      if (back.vx * dir < 0) back.vx = 0;
    }

    // 牵引路径上有实心砖吗？只看身体高度，脚下的地面不算墙
    pullPathBlocked(p, fromX, toX, dir) {
      const y0 = Math.floor((p.y + 6) / T);
      const y1 = Math.floor((p.y + p.h - 6) / T);
      const edge = dir > 0 ? fromX + p.w : fromX;
      const dest = dir > 0 ? toX + p.w : toX;
      const x0 = Math.floor(Math.min(edge, dest) / T);
      const x1 = Math.floor(Math.max(edge, dest) / T);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.solidAt(tx, ty)) return tx;
        }
      }
      return null;
    }

    // 贴着墙停下，别让身体嵌进砖里
    pullStopX(p, fromX, dir, tx) {
      if (!isFinite(tx)) return fromX;
      return dir > 0
        ? Math.min(fromX, tx * T - p.w - 1)
        : Math.max(fromX, (tx + 1) * T + 1);
    }

    // 被领先的人挤到墙上：直接挤死（后面照常走扣命 / 变泡泡流程）
    crushPlayer(p) {
      if (p.dead || p.eliminated) return;
      p.hp = 0;
      p.dead = true;
      p.deadT = 0;
      if (p.markDeath) p.markDeath();
      p.vx = 0;
      p.vy = -260;
      p.invuln = 0;
      this.burst(p.cx, p.cy, 18, { color: '#E2574C', kind: 'paper' });
      this.shake(10, 0.24);
      PH.Audio.sfx('die');
      this.toast((p.tag || '玩家') + ' 被挤到墙上了！');
    }

    updateCamera(dt, snap) {
      const p = this.player;
      const maxX = Math.max(0, this.level.w * T - VW);
      let targetX;
      if (this.duel) {
        const mid = (this.players[0].cx + this.players[1].cx) / 2;
        targetX = U.clamp(mid - VW * 0.5, 0, maxX);
      } else if (p.bubbled && p.bubble) {
        // 人变泡泡了，镜头跟着泡泡，别让它飘出画面
        targetX = U.clamp(p.bubble.x + 23 - VW * 0.45, 0, maxX);
      } else {
        targetX = U.clamp(p.cx - VW * 0.42 + p.facing * 46, 0, maxX);
      }
      if (snap) this.cam.x = targetX;
      else this.cam.x = U.lerp(this.cam.x, targetX, Math.min(1, dt * 5.2));
      this.cam.trauma = Math.max(0, this.cam.trauma - dt * 1.9);
      const tr = this.cam.trauma * this.cam.trauma;
      this.cam.sx = (Math.random() - 0.5) * 34 * tr;
      this.cam.sy = (Math.random() - 0.5) * 26 * tr;
    }

    /* ---------------- 生命 / 死亡 / 复活 ---------------- */
    gainLife(n) {
      Save.lives = Math.min(LIVES_MAX, Math.max(0, Save.lives + n));
      Save.save();
      this.player.lives = Save.lives;
      if (PH.Hub && PH.Hub.pushSave) PH.Hub.pushSave(Save.snapshot());
    }

    // 一个玩家倒下：扣一条命 → 多人变泡泡 / 单人直接回存档点；命用完了就彻底出局
    downPlayer(p) {
      if (p.bubbled || p.eliminated) return;
      p.deadFloat = false;
      p.lives = Math.max(0, (p.lives == null ? Save.lives : p.lives) - 1);
      if (!this.duel) {
        Save.lives = p.lives;
        Save.save();
        if (PH.Hub && PH.Hub.pushSave) PH.Hub.pushSave(Save.snapshot());
      }
      this.deaths++;
      if (p.lives <= 0) {
        p.eliminated = true;
        p.hidden = true;
        p.dead = true;
        this.burst(p.cx, p.cy, 18, { color: '#C9BFA6', kind: 'paper' });
        this.toast((this.duel ? p.tag + ' ' : '') + '生命用完了…');
        this.checkAllDown();
        return;
      }
      p.dead = true;
      p.vx = 0;
      p.vy = 0;
      if (!this.duel && !this.online) {
        // 单人：没有泡泡这回事，扣完命当场回存档点继续跑
        p.bubbled = false;
        p.hidden = false;
        p.bubble = null;
        this.respawnBubbledPlayer(p);
        PH.Audio.sfx('pop');
        this.toast('少了一条命 · 回到' + (this.checkpoint ? '存档点' : '起点'));
        this.checkAllDown();
        return;
      }
      p.bubbled = true;
      p.hidden = true;
      const bub = new PH.Ent.Bubble(p, { online: !!this.online, at: p.deathSpot || null });
      p.bubble = bub;
      this.entities.push(bub);
      PH.Audio.sfx('pop');
      this.toast(this.online ? '变成泡泡了 · 等人跳上来戳破' : p.tag + ' 变成泡泡了，跳起来戳破！');
      this.checkAllDown();
    }

    // 泡泡破了 / 单人扣命后 → 回到存档点
    respawnBubbledPlayer(p) {
      // 联机竞速没有「存档点」的概念，回到最近的安全落脚点更合理
      if (this.online && p.lastSafe) {
        p.reset(p.lastSafe.x, p.lastSafe.y);
        p.hp = p.maxHp;
        p.invuln = 1.8;
        p.stun = 0.35;
        p.bubbled = false;
        p.hidden = false;
        p.dead = false;
        p.deadT = 0;
        this.deathT = 0;
        this.toast('泡泡破了 · 回到落脚点');
        return;
      }
      const cp = this.checkpoint;
      const sp = cp ? { x: cp.x, y: cp.y } : p.spawn || { x: this.def.start.x * T + 3, y: 0 };
      p.reset(sp.x, sp.y);
      p.hp = p.maxHp;
      p.invuln = 1.8;
      p.stun = 0.35;
      p.bubbled = false;
      p.hidden = false;
      p.bubble = null;
      p.deadT = 0;
      this.deathT = 0;
      this.updateCamera(1, true);
      this.toast(cp ? '回到存档点' : '回到起点');
    }

    // 多人都倒下了？两人全在泡泡里就没人能救，直接判失败
    checkAllDown() {
      // 还有人正处在倒下动画里，等这一下过去再判
      if (this.players.some((p) => p.dead && !p.bubbled && !p.eliminated)) return false;
      const alive = this.players.filter((p) => !p.eliminated && !p.bubbled);
      if (alive.length) return false;
      // 联机还有队友能赶过来救，先别判失败（泡泡自己有超时兜底）
      if (this.online && PH.Net && PH.Net.peerCount && PH.Net.peerCount() > 1) {
        if (this.entities.some((e) => e.type === 'bubble' && !e.dead)) return false;
      }
      this.failed = true;
      return true;
    }

    // 本关还有几个人能继续
    aliveCount() {
      return this.players.filter((p) => !p.eliminated).length;
    }

    // 每关自动放两颗「加命」泡泡（在 32% / 68% 处的地面上）
    placeLifePickups() {
      [0.32, 0.68].forEach((f, i) => {
        const tx = Math.max(3, Math.min(this.level.w - 3, Math.floor(this.level.w * f)));
        for (let ty = 3; ty < this.level.h - 1; ty++) {
          if (!this.solidAt(tx, ty)) continue;
          if (this.solidAt(tx, ty - 1) || this.solidAt(tx, ty - 2)) break;
          this.entities.push(new PH.Ent.LifePickup(tx * T, (ty - 1) * T));
          return;
        }
      });
    }

    // 联机：把别人的位置插值过来，并把自己的位置按 20Hz 发出去
    updateNet(dt) {
      const list = Array.from(this.ghosts.values());
      for (const g of list) {
        g.animT += dt;
        g.x = U.lerp(g.x, g.tx, Math.min(1, dt * 10));
        g.y = U.lerp(g.y, g.ty, Math.min(1, dt * 10));
      }
      // 几个人挤在一起时，把名字牌错开，别糊成一团
      list.sort((a, b) => a.x - b.x);
      for (let i = 0; i < list.length; i++) {
        let stack = 0;
        for (let j = 0; j < i; j++) if (Math.abs(list[j].x - list[i].x) < 52) stack++;
        list[i].labelDy = -stack * 13;
      }
      if (this.won) return;
      this.netT -= dt;
      if (this.netT > 0) return;
      this.netT = 0.05;
      const p = this.player;
      PH.Net.relay({
        k: 'st',
        x: Math.round(p.x),
        y: Math.round(p.y),
        f: p.facing,
        po: p.pose,
        t: Math.round(this.raceTime * 10) / 10,
        hp: p.hp,
        mx: p.maxHp,
        bub: p.bubbled ? 1 : 0,
        air: p.onGround ? 0 : 1,
      });
    }

    // 本地玩家跳起来戳破别人的泡泡：告诉对方「我把你救了」
    checkGhostRescue() {
      if (!this.online || !PH.Net || this.player.dead || this.player.eliminated || this.player.bubbled) return;
      const p = this.player;
      if (p.onGround) return;
      for (const gh of this.ghosts.values()) {
        if (!gh.bubbled || gh.gone || gh.rescueSent) continue;
        const bx = gh.x - 10, by = gh.y - 10, bw = 46, bh = 46;
        if (p.y + p.h > by + bh + 6) continue;
        if (!U.hit({ x: bx, y: by, w: bw, h: bh }, { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 })) continue;
        gh.rescueSent = true;
        PH.Net.relay({ k: 'rescue', to: gh.id });
        this.toast('戳破了 ' + gh.name + ' 的泡泡！');
      }
    }

    update(dt) {
      if (this.hitstopT > 0) {
        this.hitstopT -= dt;
        return;
      }
      const d = dt;
      this.time += d;
      if (this.introT > 0) this.introT -= d;
      if (this.duel) {
        if (!this.won && this.introT <= 0) this.duelTime += d;
      } else if (this.online) {
        if (this.countdown > 0) {
          this.countdown -= d;
          if (this.countdown <= 0) PH.Audio.sfx('start');
        } else if (!this.won) this.raceTime += d;
      } else if (!this.won && this.introT <= 0) {
        this.timeLeft = Math.max(0, this.timeLeft - d); // 开场横幅期间不扣时间
      }
      if (!this.duel && !this.online && this.timeLeft <= 0 && !this.player.dead) {
        this.timeUp = true;
        this.player.hurt(99, this);
      }

      const frozen = this.online && this.countdown > 0;
      for (const pl of this.players) {
        if (frozen) pl.vx = 0;
        else pl.update(d, this);
      }
      if (this.online) this.updateNet(d);
      this.player = this.players[0];
      if (this.player.coins !== this.coinCount) this.coinCount = this.player.coins;

      // 倒数 3-2-1 期间敌人也站着不动，免得还没开跑就挨打
      if (!frozen) {
        for (const e of this.entities) {
          if (e.dead) continue;
          if (e.x !== undefined && Math.abs(e.x - this.cam.x) > VW + 400 && e.type !== 'goal') continue;
          e.update(d, this);
        }
        if (this.goal) this.goal.update(d, this);
      }

      for (const b of this.bullets) b.update(d, this);
      this.bullets = this.bullets.filter((b) => !b.dead);
      this.entities = this.entities.filter((e) => !(e.dead && e.type !== 'wave'));
      this.entities = this.entities.filter((e) => !(e.dead && e.type === 'wave' && e.life < 0));

      this.updateWeakClouds(d);
      this.updateParticles(d);
      this.resolveContacts();
      if (this.online) this.checkGhostRescue();

      for (const t of this.toasts) t.t += d;
      this.toasts = this.toasts.filter((t) => t.t < t.life);

      for (const pl of this.players) if (pl.dead) pl.deadT += d;
      if (this.player.dead) this.deathT += d;
      this.updateAmb(d);
      this.updateDuelBounds(d);
      this.updateCamera(d);

      if (this.bossDefeated && !this.won) {
        this.bossClearT = (this.bossClearT || 0) + d;
        if (this.bossClearT > 1.5) this.onGoal();
      }
      if (this.won) this.clearT += d;
    }

    updateWeakClouds(dt) {
      for (const c of this.weakClouds) {
        c.t += dt;
        c.r = U.lerp(20, c.maxR, Math.min(1, c.t / 0.35));
        if (c.t > c.life) c.dead = true;
      }
      for (const c of this.weakClouds) {
        if (c.dead) continue;
        for (const e of this.entities) {
          if (e.type !== 'enemy' && !e.isBoss) continue;
          if (e.dead) continue;
          if (U.dist(c.x, c.y, e.cx, e.cy) < c.r + 20) e.weak = Math.max(e.weak, 3.5);
        }
      }
      this.weakClouds = this.weakClouds.filter((c) => !c.dead);
    }

    updateParticles(dt) {
      for (const p of this.particles) {
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.grav) p.vy += p.grav * dt;
        if (p.vr) p.rot += p.vr * dt;
        if (p.kind === 'smoke') p.vx *= 1 - 2.4 * dt;
      }
      this.particles = this.particles.filter((p) => p.t < p.life);
    }

    resolveContacts() {
      const p = this.player;
      // 玩家子弹
      for (const b of this.bullets) {
        if (b.dead) continue;
        if (b.fromPlayer) {
          for (const e of this.entities) {
            if (e.dead || (e.type !== 'enemy' && !e.isBoss)) continue;
            if (!U.hit(b, e)) continue;
            if (b.kind === 'ice') {
              if (!e.isBoss) {
                e.freeze = 4.2;
                PH.Audio.sfx('freeze');
                this.burst(e.cx, e.cy, 10, { color: '#9FE6F5', kind: 'spark' });
              } else {
                e.freeze = 1.2;
                e.damage(1, this);
              }
              b.dead = true;
              break;
            } else if (b.kind === 'egg') {
              e.damage(99, this);
              e.freeze = 0;
              this.burst(e.cx, e.cy, 14, { color: '#F6E08A', kind: 'paper' });
              this.shake(5, 0.15);
              b.life = Math.min(b.life, 0.12);
              break;
            } else {
              e.damage(b.dmg || 1, this);
              b.dead = true;
              this.burst(b.x + 8, b.y + 8, 5, { color: '#9FD08A', kind: 'spark' });
              break;
            }
          }
        } else {
          for (const pl of this.players) {
            if (b.dead || pl.dead) continue;
            if (!U.hit(b, { x: pl.x + 4, y: pl.y + 4, w: pl.w - 8, h: pl.h - 8 })) continue;
            if (pl.hurt(b.dmg || 1, this, b.x)) {
              b.dead = true;
              this.burst(b.x + 8, b.y + 8, 8, { color: '#E2574C', kind: 'paper' });
            }
            break;
          }
        }
      }

      // 玩家与敌人
      for (const pl of this.players) {
        if (pl.dead) continue;
        for (const e of this.entities) {
          if (e.dead || (e.type !== 'enemy' && !e.isBoss)) continue;
          if (!U.hit({ x: pl.x + 3, y: pl.y + 3, w: pl.w - 6, h: pl.h - 4 }, e)) continue;
          const stomping = pl.vy > 60 && pl.py + pl.h <= e.y + 18;
          if (e.freeze > 0) {
            e.damage(99, this);
            this.burst(e.cx, e.cy, 12, { color: '#9FE6F5', kind: 'paper' });
            pl.vy = -430;
            PH.Audio.sfx('freeze');
            continue;
          }
          if (stomping && e.stompable) {
            if (e.stomp(this)) {
              pl.vy = -520;
              pl.squash = 1.2;
              pl.y = e.y - pl.h - 1;
              this.shake(4, 0.12);
              this.hitstop(0.05);
            }
            continue;
          }
          if (pl.mount > 0 && !e.isBoss) {
            e.damage(99, this);
            this.shake(5, 0.15);
            continue;
          }
          if (pl.hurt(e.touchDmg || 1, this, e.cx)) {
            this.burst(pl.cx, pl.cy, 10, { color: '#E2574C', kind: 'paper' });
          }
        }
      }
    }

    draw() {
      const camX = this.cam.x - this.cam.sx;
      const camY = -this.cam.sy;
      PH.Paper.drawBackdrop(ctx, this.theme, camX, camY, this.time, this.level.w * T);

      ctx.save();
      ctx.translate(-Math.round(camX), -Math.round(camY));
      this.drawPits(camX);
      this.drawTiles(camX, camY);
      this.drawProps(camX);
      this.drawEntities(camX, camY);
      this.drawBullets();
      this.drawParticles();
      ctx.restore();

      PH.Paper.drawFore(ctx, this.theme, camX, camY);
      this.drawAmb();
      this.drawVignette();
    }

    tileType(tx, ty) {
      const v = this.grid[ty][tx];
      if (v === 2) return 'brick';
      if (v === 3) return 'stone';
      if (v === 4) return 'plank';
      if (v === 5) return 'spike';
      if (v === 6) return 'wood';
      return null;
    }

    // 只给真正空的列画深渊
    drawPits(camX) {
      const x0 = Math.max(0, Math.floor(camX / T) - 1);
      const x1 = Math.min(this.level.w - 1, Math.floor((camX + VW) / T) + 1);
      const g = ctx.createLinearGradient(0, 404, 0, 544);
      g.addColorStop(0, 'rgba(34,25,28,0.15)');
      g.addColorStop(0.3, 'rgba(28,20,24,0.72)');
      g.addColorStop(0.65, 'rgba(20,14,18,0.95)');
      g.addColorStop(1, 'rgba(14,10,14,1)');
      const empty = [];
      for (let tx = x0; tx <= x1; tx++) {
        let hasGround = false;
        for (let ty = 11; ty < this.level.h; ty++) {
          const v = this.grid[ty][tx];
          if (v === 1 || v === 6) {
            hasGround = true;
            break;
          }
        }
        empty.push(!hasGround);
      }
      ctx.fillStyle = g;
      let run = -1;
      for (let i = 0; i <= empty.length; i++) {
        if (empty[i] && run < 0) run = i;
        else if (!empty[i] && run >= 0) {
          ctx.fillRect((x0 + run) * T, 404, (i - run) * T, 140);
          run = -1;
        }
      }
    }

    drawTiles(camX, camY) {
      const x0 = Math.max(0, Math.floor(camX / T) - 1);
      const x1 = Math.min(this.level.w - 1, Math.floor((camX + VW) / T) + 1);
      const y0 = Math.max(0, Math.floor(camY / T) - 1);
      const y1 = Math.min(this.level.h - 1, Math.floor((camY + VH) / T) + 1);
      const G = this.grid;

      // 1) 连续的土体
      for (let tx = x0; tx <= x1; tx++) {
        let ty = y0;
        while (ty <= y1) {
          if (G[ty][tx] === 1) {
            let ty2 = ty;
            while (ty2 + 1 < this.level.h && G[ty2 + 1][tx] === 1) ty2++;
            const rh = (ty2 - ty + 1) * T;
            PH.Paper.fillDirt(ctx, this.theme, tx * T, ty * T + 5, T, rh - 5);
            // 明暗
            const gv = ctx.createLinearGradient(0, ty * T, 0, ty * T + rh);
            gv.addColorStop(0, 'rgba(255,242,214,0.22)');
            gv.addColorStop(0.18, 'rgba(255,242,214,0.06)');
            gv.addColorStop(0.55, 'rgba(0,0,0,0)');
            gv.addColorStop(1, 'rgba(58,38,22,0.24)');
            ctx.fillStyle = gv;
            ctx.fillRect(tx * T, ty * T + 5, T, rh - 5);
            // 侧边阴影
            const leftOpen = tx === 0 || G[ty][tx - 1] !== 1;
            const rightOpen = tx === this.level.w - 1 || G[ty][tx + 1] !== 1;
            if (leftOpen) {
              const g1 = ctx.createLinearGradient(tx * T, 0, tx * T + 6, 0);
              g1.addColorStop(0, 'rgba(58,38,22,0.20)');
              g1.addColorStop(1, 'rgba(58,38,22,0)');
              ctx.fillStyle = g1;
              ctx.fillRect(tx * T, ty * T + 4, 6, rh - 4);
            }
            if (rightOpen) {
              const g2 = ctx.createLinearGradient(tx * T + T, 0, tx * T + T - 6, 0);
              g2.addColorStop(0, 'rgba(58,38,22,0.20)');
              g2.addColorStop(1, 'rgba(58,38,22,0)');
              ctx.fillStyle = g2;
              ctx.fillRect(tx * T + T - 6, ty * T + 4, 6, rh - 4);
            }
            // 底部
            const below = ty2 + 1 < this.level.h ? G[ty2 + 1][tx] : 0;
            if (below !== 1) {
              const g3 = ctx.createLinearGradient(0, (ty2 + 1) * T - 7, 0, (ty2 + 1) * T);
              g3.addColorStop(0, 'rgba(60,40,25,0)');
              g3.addColorStop(1, 'rgba(60,40,25,0.25)');
              ctx.fillStyle = g3;
              ctx.fillRect(tx * T, (ty2 + 1) * T - 7, T, 7);
            }
            PH.Paper.drawGrassCap(ctx, this.theme, tx, ty);
            ty = ty2 + 1;
          } else ty++;
        }
      }

      // 2) 木地板
      for (let tx = x0; tx <= x1; tx++) {
        let ty = y0;
        while (ty <= y1) {
          if (G[ty][tx] === 6) {
            let ty2 = ty;
            while (ty2 + 1 < this.level.h && G[ty2 + 1][tx] === 6) ty2++;
            const rh = (ty2 - ty + 1) * T;
            PH.Paper.fillWood(ctx, this.theme, tx * T, ty * T + 8, T, rh - 8);
            const gw = ctx.createLinearGradient(0, ty * T, 0, ty * T + rh);
            gw.addColorStop(0, 'rgba(255,240,210,0.10)');
            gw.addColorStop(0.6, 'rgba(0,0,0,0)');
            gw.addColorStop(1, 'rgba(50,30,16,0.28)');
            ctx.fillStyle = gw;
            ctx.fillRect(tx * T, ty * T + 8, T, rh - 8);
            PH.Paper.drawWoodCap(ctx, this.theme, tx, ty);
            ty = ty2 + 1;
          } else ty++;
        }
      }

      // 3) 砖 / 石 / 木板 / 尖刺
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const v = G[ty][tx];
          if (!v || v === 1 || v === 6) continue;
          const type = this.tileType(tx, ty);
          if (!type) continue;
          const variant = (((tx * 7 + ty * 13) % 4) + 4) % 4;
          PH.Paper.drawTile(ctx, this.theme, type, variant, tx * T, ty * T, T);
        }
      }
    }

    drawEntities(camX, camY) {
      const list = [];
      for (const e of this.entities) {
        if (e.x === undefined) continue;
        if (e.x + 400 < camX || e.x - 400 > camX + VW) continue;
        list.push(e);
      }
      for (const pl of this.players) {
        if (!pl.dead || pl.deadT < 3) list.push(pl);
      }
      if (this.online) for (const g of this.ghosts.values()) list.push(g);
      list.sort((a, b) => {
        const d = (a.y + (a.h || 0)) - (b.y + (b.h || 0));
        if (Math.abs(d) > 0.5) return d;
        // 自己永远画在最上面，叠在一起也看得见
        const own = (a.isLocal ? 1 : 0) - (b.isLocal ? 1 : 0);
        if (own) return own;
        return (a.tag === 'P1' ? 1 : 0) - (b.tag === 'P1' ? 1 : 0);
      });
      for (const e of list) {
        if (e.draw) e.draw(ctx, this);
      }
      if (this.goal) this.goal.draw(ctx, this);
    }

    drawBullets() {
      for (const b of this.bullets) b.draw(ctx, this);
    }

    drawParticles() {
      for (const p of this.particles) {
        const k = p.t / p.life;
        ctx.save();
        if (p.kind === 'paper') {
          ctx.globalAlpha = 1 - k * k;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8);
        } else if (p.kind === 'smoke') {
          ctx.globalAlpha = (1 - k) * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 + k * 1.4), 0, 7);
          ctx.fill();
        } else if (p.kind === 'spark') {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -1, p.size, 2);
        } else if (p.kind === 'healNum') {
          // 回血飘字：+1 加一颗纸心
          ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
          ctx.font = 'bold 19px ' + PH.Fonts.ui;
          ctx.textAlign = 'center';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(120,32,30,.6)';
          ctx.lineWidth = 4;
          ctx.strokeText(p.text, p.x - 8, p.y);
          ctx.fillStyle = '#FFF4E6';
          ctx.fillText(p.text, p.x - 8, p.y);
          PH.Paper.heart(ctx, p.x + 11, p.y - 6, 13, true, '#E2574C');
        } else if (p.kind === 'score') {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.font = 'bold 18px ' + PH.Fonts.ui;
          ctx.textAlign = 'center';
          ctx.strokeStyle = 'rgba(60,40,20,.5)';
          ctx.lineWidth = 3;
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillText(p.text, p.x, p.y);
        }
        ctx.restore();
      }
      // 虚弱云
      for (const c of this.weakClouds) {
        const k = c.t / c.life;
        ctx.save();
        ctx.globalAlpha = 0.22 * (1 - k) + 0.06;
        ctx.fillStyle = '#7FD08A';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, 7);
        ctx.fill();
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.strokeStyle = '#B6F0A8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r * 0.9, 0, 7);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawVignette() {
      if (this.theme === 'meadow' || this.theme === 'courtyard') return;
      const g = ctx.createRadialGradient(VW / 2, VH / 2, 180, VW / 2, VH / 2, 620);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(10,6,16,0.38)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  /* ---------------- 游戏状态 ---------------- */
  const G = {
    state: 'boot',
    stateT: 0,
    world: null,
    levelIndex: 0,
    hover: {},
    buttons: [],
    fade: 0,
    fadeDir: 0,
    pending: null,
    deadT: 0,
    titleT: 0,
    starT: 0,
    selIndex: 0,
    lastStats: null,
    victoryT: 0,
    challenge: null,
    lastChallenge: null,
    challengeT: 0,
    mode: 'single', // 'single' | 'duel'
    lastDuel: null,
    duelT: 0,
  };
  PH.G = G;

  function setState(s, instant) {
    if (instant) {
      G.state = s;
      G.stateT = 0;
      return;
    }
    G.pending = s;
    G.fadeDir = 1;
  }

  function updateFade(dt) {
    if (G.fadeDir === 1) {
      G.fade += dt * 4.5;
      if (G.fade >= 1) {
        G.fade = 1;
        G.state = G.pending;
        G.stateT = 0;
        G.fadeDir = -1;
      }
    } else if (G.fadeDir === -1) {
      G.fade -= dt * 3.2;
      if (G.fade <= 0) {
        G.fade = 0;
        G.fadeDir = 0;
        G.pending = null;
      }
    }
  }

  function startLevel(id, fromCp) {
    const def = PH.Levels[id];
    if (!def) return;
    const opts = fromCp ? { fromCheckpoint: true, cp: fromCp } : {};
    if (G.mode === 'duel') opts.duel = true;
    if (G.mode === 'online') opts.online = true;
    G.world = new World(def, opts);
    G.levelId = id;
    G.levelIndex = PH.LEVEL_ORDER.indexOf(id);
    G.challenge = (PH.CHALLENGE_ORDER || []).indexOf(id) >= 0 ? id : null;
    const music = id.endsWith('B') ? 'boss' : def.theme === 'meadow' || def.theme === 'courtyard' ? 'field' : 'cave';
    PH.Audio.play(music);
    setState('play');
    G.buttons = [];
  }

  function restartLevel() {
    const cp = G.world && G.world.checkpoint;
    const id = G.levelId;
    G.world = null;
    startLevel(id, cp);
  }

  /* ---------------- 按钮 ---------------- */
  function addBtn(id, x, y, w, h, label, onClick, o) {
    const b = Object.assign({ id, x, y, w, h, label, onClick, hover: 0 }, o || {});
    G.buttons.push(b);
    return b;
  }

  function drawButtons(dt) {
    for (const b of G.buttons) {
      if (b.custom) continue;
      const over = Pointer.inside && hitRect(Pointer, b);
      b.hover = U.lerp(b.hover || 0, over && !b.locked ? 1 : 0, Math.min(1, dt * 14));
      const lift = b.hover * 3;
      const col = b.color || '#FBF3DF';
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2 - lift);
      ctx.rotate(b.rot || 0);
      ctx.translate(-b.w / 2, -b.h / 2);
      // 后面的纸
      ctx.save();
      ctx.globalAlpha = 0.6;
      PH.Paper.panel(ctx, 2, 4, b.w, b.h, {
        fill: b.locked ? '#C9BCA2' : '#E2D2B0',
        fill2: b.locked ? '#C0B398' : '#D6C4A0',
        seed: b.id.length * 13 + 1,
        shadowAlpha: 0.18,
        blur: 6,
        border: false,
      });
      ctx.restore();
      PH.Paper.panel(ctx, 0, 0, b.w, b.h, {
        fill: b.locked ? '#E3D8C2' : col,
        fill2: b.locked ? '#D6C9B0' : U.mix(col, '#E8D9B8', 0.55),
        seed: b.id.length * 17 + 3,
        shadowAlpha: 0.42 + b.hover * 0.16,
        blur: 16 + b.hover * 8,
        stroke: 'rgba(64,44,28,0.6)',
        lw: 2.4,
      });
      if (!b.locked) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = b.accent || 'rgba(226,87,76,0.35)';
        ctx.fillRect(8, b.h - 8, b.w - 16, 3);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#6B5136';
        ctx.beginPath();
        ctx.arc(14, 14, 2.6, 0, 7);
        ctx.fill();
        ctx.restore();
      }
      if (b.hover > 0.3 && !b.locked) {
        ctx.globalAlpha = b.hover * 0.5;
        ctx.strokeStyle = '#E2574C';
        ctx.lineWidth = 2;
        PH.Paper.roughRect(ctx, -1, -1, b.w + 2, b.h + 2, 2, 9);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (b.locked) {
        PH.Paper.icon(ctx, 'lock', b.w / 2, b.h / 2 - 8, 26, 'rgba(90,72,52,0.55)');
        PH.Paper.text(ctx, b.label, b.w / 2, b.h / 2 + 20, {
          size: b.size || 17,
          align: 'center',
          color: 'rgba(90,72,52,0.6)',
          weight: '700',
        });
      } else {
        PH.Paper.text(ctx, b.label, b.w / 2, b.h / 2 + (b.sub ? -2 : 6), {
          size: b.size || 24,
          align: 'center',
          color: b.textColor || '#3A2A1E',
          weight: '700',
        });
        if (b.sub)
          PH.Paper.text(ctx, b.sub, b.w / 2, b.h / 2 + 20, {
            size: 12,
            align: 'center',
            color: 'rgba(70,50,35,.6)',
          });
      }
      ctx.restore();
    }
  }

  /* ---------------- 场景：标题 ---------------- */
  function drawTitle(dt) {
    G.titleT += dt;
    const t = G.titleT;
    const cam = Math.sin(t * 0.05) * 120;
    PH.Paper.drawBackdrop(ctx, 'meadow', cam, 0, t, 9999);

    // 纸山
    ctx.save();
    const hg = ctx.createLinearGradient(0, 440, 0, 544);
    hg.addColorStop(0, '#9BC873');
    hg.addColorStop(1, '#7BA955');
    ctx.fillStyle = hg;
    PH.Paper.hillPath(ctx, VW, 544, 492, 56, 4, 240);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(190, 508, 130, 16, -0.08, 0, 7);
    ctx.fill();
    ctx.restore();

    // 主角与小伴
    const hh = 128;
    const soloSkin = PH.Skins ? PH.Skins.key('solo') : 'hero';
    const s = PH.Assets.sizeForH(soloSkin, hh);
    const bobY = Math.sin(t * 1.9) * 2;
    PH.Assets.draw(ctx, soloSkin, 156 - s.w / 2, 516 - hh + bobY, s.w, hh, {});
    const bs = PH.Assets.sizeForH('buddy', 104);
    PH.Assets.draw(ctx, 'buddy', 812 - bs.w / 2, 520 - 104 + Math.sin(t * 1.7 + 1) * 3, bs.w, 104, { flip: true });

    // 标题字
    const title = '纸片勇者';
    const size = 86;
    const gap = 12;
    const totalW = size * title.length + gap * (title.length - 1);
    let tx = VW / 2 - totalW / 2;
    for (let i = 0; i < title.length; i++) {
      const ch = title[i];
      const rot = (i % 2 ? 1 : -1) * 0.028 + Math.sin(t * 0.7 + i) * 0.012;
      ctx.save();
      ctx.translate(tx + size / 2, 150 + Math.sin(t * 1.1 + i * 0.5) * 2.5);
      ctx.rotate(rot);
      // 阴影
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#3A2A1E';
      ctx.beginPath();
      ctx.roundRect(-size / 2 + 4, -size / 2 + 8, size, size, 9);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = i % 2 ? '#FBEBBE' : '#FFFBF0';
      ctx.strokeStyle = '#3A2A1E';
      ctx.lineWidth = 5.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, 7);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-size / 2 + 5, -size / 2 + 5, size - 10, size - 10, 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
      PH.Paper.text(ctx, ch, 0, 5, {
        size: size * 0.68,
        align: 'center',
        color: i % 2 ? '#D2503F' : '#3A2A1E',
        font: PH.Fonts.hand,
        weight: '900',
      });
      ctx.restore();
      tx += size + gap;
    }

    // 副标题纸条
    ctx.save();
    ctx.translate(VW / 2, 232);
    ctx.rotate(-0.012);
    PH.Paper.panel(ctx, -190, -20, 380, 40, { fill: '#FDF6E3', fill2: '#F0E3C6', seed: 15, shadowAlpha: 0.22, blur: 10 });
    PH.Paper.text(ctx, '红 肠 王 国 大 冒 险', 0, 8, {
      size: 22,
      align: 'center',
      color: '#6B5136',
      font: PH.Fonts.hand,
      weight: '700',
    });
    ctx.restore();

    // 漂浮的小道具
    const items = [
      ['itemIce', 396, 462, 0],
      ['itemEgg', 486, 470, 1.4],
      ['itemGun', 576, 462, 2.8],
    ];
    items.forEach(([n, x, y, ph]) => {
      const s2 = PH.Assets.sizeForH(n, 38);
      ctx.save();
      ctx.globalAlpha = 0.9;
      PH.Assets.draw(ctx, n, x - s2.w / 2, y + Math.sin(t * 1.6 + ph) * 6, s2.w, s2.h, {
        rot: Math.sin(t * 1.2 + ph) * 0.09,
      });
      ctx.restore();
    });

    PH.Paper.text(ctx, '一个小朋友画的游戏，所以它真的长这样。', VW / 2, VH - 16, {
      size: 13,
      align: 'center',
      color: 'rgba(60,45,30,0.5)',
    });

    // 菜单
    G.buttons = [];
    const bw = 145, bh = 52, gap2 = 10;
    const by = 350;
    const rowW = bw * 6 + gap2 * 5;
    const rowX = VW / 2 - rowW / 2;
    addBtn('start', rowX, by, bw, bh, '开始冒险', () => {
      G.mode = 'single';
      const id = PH.LEVEL_ORDER[Math.min(Save.unlocked - 1, PH.LEVEL_ORDER.length - 1)];
      startLevel(id);
    }, { color: '#FFF3D0', size: 18 });
    addBtn('select', rowX + (bw + gap2), by, bw, bh, '关卡选择', () => {
      G.mode = 'single';
      setState('select');
    }, { color: '#FBF3DF', size: 18 });
    addBtn('duel', rowX + (bw + gap2) * 2, by, bw, bh, '双人竞速', () => {
      G.mode = 'duel';
      setState('select');
    }, { color: '#EAF1FB', size: 18, textColor: '#2F5F96', accent: 'rgba(47,127,196,0.45)' });
    addBtn('online', rowX + (bw + gap2) * 3, by, bw, bh, '联机竞速', () => {
      PH.Online.open();
    }, { color: '#F3EBFB', size: 18, textColor: '#6B4A96', accent: 'rgba(139,119,201,0.5)' });
    addBtn('help', rowX + (bw + gap2) * 4, by, bw, bh, '操作说明', () => {
      G.mode = 'single';
      setState('help');
    }, { color: '#FBF3DF', size: 18 });
    addBtn('about', rowX + (bw + gap2) * 5, by, bw, bh, '更新日志', () => {
      PH.About.open('log');
    }, { color: '#FDF1DD', size: 18, textColor: '#8A5A16', accent: 'rgba(214,150,50,0.45)' });

    // 右上角：本机档案
    const pName = PH.Profiles ? PH.Profiles.name() : '';
    const shortName = Array.from(pName).length > 4 ? Array.from(pName).slice(0, 4).join('') + '…' : pName;
    addBtn('account', VW - 152, 14, 138, 40, '档案 · ' + shortName, () => PH.Account.open(), {
      color: '#EAF6E4',
      size: 13.5,
      textColor: '#2F6B33',
      accent: 'rgba(76,175,80,0.5)',
    });
    addBtn('skins', VW - 152, 60, 138, 34, '角色 · ' + (PH.Skins ? PH.Skins.label() : '勇者'), () => PH.Skins.open(), {
      color: '#F3EBFB',
      size: 13,
      textColor: '#6B4A96',
      accent: 'rgba(139,119,201,0.5)',
    });
    addBtn('creators', VW - 152, 98, 138, 32, '创作者名单', () => PH.About.open('credits'), {
      color: '#FDF1DD',
      size: 12.5,
      textColor: '#8A5A16',
      accent: 'rgba(214,150,50,0.45)',
    });

    if (Input.pressed('confirm') && G.buttons.length) {
      const id = PH.LEVEL_ORDER[Math.min(Save.unlocked - 1, PH.LEVEL_ORDER.length - 1)];
      startLevel(id);
    }
  }

  /* ---------------- 场景：选关 ---------------- */
  function drawSelect(dt) {
    const duelMode = G.mode === 'duel';
    PH.Paper.drawBackdrop(ctx, duelMode ? 'courtyard' : 'meadow', G.titleT * 10, 0, G.titleT, 9999);
    ctx.fillStyle = duelMode ? 'rgba(24,34,48,0.58)' : 'rgba(36,26,21,0.55)';
    ctx.fillRect(0, 0, VW, VH);

    if (duelMode) {
      PH.Paper.text(ctx, '双人竞速 · 选赛道', VW / 2, 66, {
        size: 38,
        align: 'center',
        color: '#FDF6E3',
        outline: 'rgba(28,48,74,0.8)',
        outlineW: 8,
        font: PH.Fonts.hand,
      });
      // 键位说明放在底部空白处
      const kw = 640, ky = VH - 62;
      ctx.save();
      PH.Paper.panel(ctx, VW / 2 - kw / 2, ky, kw, 40, { fill: 'rgba(252,246,230,0.94)', fill2: 'rgba(237,224,196,0.94)', seed: 12, shadowAlpha: 0.26, blur: 8 });
      ctx.restore();
      PH.Paper.text(ctx, 'P1', VW / 2 - kw / 2 + 22, ky + 25, { size: 14, color: '#E2574C', weight: '900' });
      PH.Paper.text(ctx, 'A / D 移动 · W 跳 · Shift 冲刺', VW / 2 - kw / 2 + 50, ky + 25, { size: 13.5, color: '#4A3626' });
      PH.Paper.text(ctx, 'P2', VW / 2 + 46, ky + 25, { size: 14, color: '#2F7FC4', weight: '900' });
      PH.Paper.text(ctx, '← / → 移动 · ↑ 跳 · / 冲刺', VW / 2 + 74, ky + 25, { size: 13.5, color: '#4A3626' });
      if (isTouchUI()) {
        PH.Paper.text(ctx, '手机上双人模式需要接键盘', VW / 2, ky + 52, {
          size: 12,
          align: 'center',
          color: 'rgba(253,246,227,0.8)',
          outline: 'rgba(28,40,60,0.4)',
          outlineW: 3,
        });
      }
    } else {
      PH.Paper.text(ctx, '选择关卡', VW / 2, 72, {
        size: 40,
        align: 'center',
        color: '#FDF6E3',
        outline: 'rgba(40,26,18,0.75)',
        outlineW: 8,
        font: PH.Fonts.hand,
      });
    }

    G.buttons = [];
    const cols = 4, cw = 200, chh = 132, gx = 26, gy = 16;
    const startX = (VW - (cols * cw + (cols - 1) * gx)) / 2;
    const startY = 100;
    PH.LEVEL_ORDER.forEach((id, i) => {
      const def = PH.Levels[id];
      const cx = startX + (i % cols) * (cw + gx);
      const cy = startY + Math.floor(i / cols) * (chh + gy);
      const unlocked = duelMode ? true : i < Save.unlocked;
      const cleared = Save.cleared[id];
      const title = PH.LEVEL_TITLES[id];
      const isBoss = id.endsWith('B');

      ctx.save();
      const hover = Pointer.inside && Pointer.x > cx && Pointer.x < cx + cw && Pointer.y > cy && Pointer.y < cy + chh;
      ctx.translate(cx + cw / 2, cy + chh / 2 - (hover && unlocked ? 4 : 0));
      ctx.translate(-cw / 2, -chh / 2);
      PH.Paper.panel(ctx, 0, 0, cw, chh, {
        fill: unlocked ? (isBoss ? '#FBE9D2' : '#FCF6E6') : '#DCD2BE',
        fill2: unlocked ? (isBoss ? '#F3D6B4' : '#EFE3C8') : '#CDC2AC',
        seed: i * 31 + 5,
        shadowAlpha: hover ? 0.45 : 0.3,
      });
      // 关卡编号
      PH.Paper.text(ctx, id, 18, 42, {
        size: 30,
        color: unlocked ? (isBoss ? '#C8443A' : '#3A2A1E') : 'rgba(80,65,50,.4)',
        font: PH.Fonts.hand,
        weight: '900',
      });
      PH.Paper.text(ctx, def.name, 68, 40, {
        size: 18,
        color: unlocked ? '#4A3626' : 'rgba(80,65,50,.4)',
        weight: '700',
      });

      // 底部缎带
      ctx.save();
      ctx.globalAlpha = unlocked ? 0.92 : 0.4;
      ctx.fillStyle = title.color;
      PH.Paper.roughRect(ctx, 8, chh - 34, cw - 16, 24, 1.2, i * 7 + 2);
      ctx.fill();
      ctx.restore();
      PH.Paper.text(ctx, title.world, cw / 2, chh - 17, {
        size: 11.5,
        align: 'center',
        color: '#FDF6E3',
        weight: '700',
      });

      if (cleared) {
        PH.Paper.icon(ctx, 'star', cw - 30, 30, 24, '#E2A93B');
      }
      if (!unlocked) {
        PH.Paper.icon(ctx, 'lock', cw - 30, 30, 26, 'rgba(80,65,50,.45)');
      } else {
        // 小图示
        const spr = isBoss ? (id === '1-B' ? 'boss1' : 'boss2') : def.theme === 'cave' || def.theme === 'nest' ? 'skeleton' : 'cabbage';
        let ss = PH.Assets.sizeForH(spr, isBoss ? 62 : 52);
        const maxW = cw * 0.44;
        if (ss.w > maxW) ss = { w: maxW, h: (ss.h * maxW) / ss.w };
        PH.Assets.draw(ctx, spr, cw - 26 - ss.w, chh - 40 - ss.h, ss.w, ss.h, {
          flip: true,
          alpha: 0.92,
        });
        if (cleared) {
          PH.Paper.stamp(ctx, cw / 2 - 4, 76, '已通关', -0.13, 0.3);
        }
      }
      ctx.restore();

      G.buttons.push({
        id: 'lv' + id,
        x: cx,
        y: cy,
        w: cw,
        h: chh,
        label: '',
        locked: !unlocked,
        onClick: () => {
          if (!unlocked) return;
          startLevel(id);
        },
        duel: duelMode,
        hover: 0,
        custom: true,
      });
    });

    /* ---- 限时挑战入口 ---- */
    if (duelMode) {
      addBtn('back', 22, 20, 96, 40, '返回', () => {
        G.mode = 'single';
        setState('title');
      }, { size: 17, color: '#F6EEDC' });
      if (Input.pressed('pause')) {
        G.mode = 'single';
        setState('title');
      }
      return;
    }
    const cUnlocked = PH.challengeUnlocked();
    const clearedN = PH.LEVEL_ORDER.filter((id) => Save.cleared[id]).length;
    const bx = startX, by = startY + 2 * chh + gy + 14;
    const bw = cols * cw + (cols - 1) * gx, bh = 54;
    const overC = Pointer.inside && Pointer.x > bx && Pointer.x < bx + bw && Pointer.y > by && Pointer.y < by + bh;
    ctx.save();
    ctx.translate(bx + bw / 2, by + bh / 2 - (overC && cUnlocked ? 3 : 0));
    ctx.translate(-bw / 2, -bh / 2);
    PH.Paper.panel(ctx, 0, 0, bw, bh, {
      fill: cUnlocked ? '#FBEBD0' : '#DBD1BD',
      fill2: cUnlocked ? '#F1CFA2' : '#CCC1AB',
      seed: 83,
      shadowAlpha: overC && cUnlocked ? 0.46 : 0.3,
    });
    // 左边的小票签
    ctx.save();
    ctx.globalAlpha = cUnlocked ? 1 : 0.45;
    ctx.fillStyle = '#C8443A';
    PH.Paper.roughRect(ctx, 14, 10, 96, bh - 20, 1.4, 91);
    ctx.fill();
    ctx.restore();
    PH.Paper.text(ctx, '限时挑战', 62, bh / 2 + 7, {
      size: 20,
      align: 'center',
      color: cUnlocked ? '#FFF6E2' : 'rgba(255,246,226,0.75)',
      font: PH.Fonts.hand,
      weight: '900',
    });
    PH.Paper.text(ctx, cUnlocked ? '3 张计时地图 · 比谁跑得更快' : '全部 8 关通关后开启', 126, bh / 2 - 2, {
      size: 15,
      color: cUnlocked ? '#5A4030' : 'rgba(80,65,50,.55)',
      weight: '700',
    });
    PH.Paper.text(ctx, cUnlocked ? '已有 ' + Object.keys(Save.challenge || {}).length + ' 张跑完' : '已通关 ' + clearedN + ' / 8', 126, bh / 2 + 17, {
      size: 12,
      color: cUnlocked ? 'rgba(120,80,50,.75)' : 'rgba(80,65,50,.45)',
    });
    if (cUnlocked) {
      PH.Paper.text(ctx, '进入 ›', bw - 26, bh / 2 + 8, {
        size: 19,
        align: 'right',
        color: '#C8443A',
        weight: '900',
        font: PH.Fonts.hand,
      });
    } else {
      PH.Paper.icon(ctx, 'lock', bw - 36, bh / 2, 20, 'rgba(80,65,50,.4)');
    }
    ctx.restore();
    G.buttons.push({
      id: 'challenge',
      x: bx, y: by, w: bw, h: bh,
      label: '', locked: !cUnlocked, hover: 0, custom: true,
      onClick: () => {
        if (!cUnlocked) return;
        setState('challenge');
      },
    });

    addBtn('back', 22, 20, 96, 40, '返回', () => setState('title'), { size: 17, color: '#F6EEDC' });
    if (Input.pressed('pause')) setState('title');
  }

  /* ---------------- 场景：限时挑战选图 ---------------- */
  function drawChallenge(dt) {
    PH.Paper.drawBackdrop(ctx, 'courtyard', G.titleT * 8, 0, G.titleT, 9999);
    ctx.fillStyle = 'rgba(28,16,20,0.62)';
    ctx.fillRect(0, 0, VW, VH);

    PH.Paper.text(ctx, '限时挑战', VW / 2, 76, {
      size: 42,
      align: 'center',
      color: '#FDF6E3',
      outline: 'rgba(120,26,22,0.85)',
      outlineW: 9,
      font: PH.Fonts.hand,
      weight: '900',
    });
    PH.Paper.text(ctx, '跑到终点就算完成，用掉的时间越少越好', VW / 2, 104, {
      size: 14,
      align: 'center',
      color: 'rgba(253,246,227,0.72)',
    });

    G.buttons = [];
    const list = PH.CHALLENGE_ORDER;
    const cw = 250, chh = 226, gap = 30;
    const startX = (VW - (list.length * cw + (list.length - 1) * gap)) / 2;
    const startY = 132;

    list.forEach((id, i) => {
      const def = PH.Levels[id];
      const best = PH.getChallengeBest(id);
      const x = startX + i * (cw + gap), y = startY;
      const over = Pointer.inside && Pointer.x > x && Pointer.x < x + cw && Pointer.y > y && Pointer.y < y + chh;
      const title = PH.LEVEL_TITLES[id];

      ctx.save();
      ctx.translate(x + cw / 2, y + chh / 2 - (over ? 5 : 0));
      ctx.rotate((i - 1) * 0.008);
      ctx.translate(-cw / 2, -chh / 2);
      PH.Paper.panel(ctx, 0, 0, cw, chh, {
        fill: '#FCF6E6',
        fill2: '#EFE2C4',
        seed: 40 + i * 13,
        shadowAlpha: over ? 0.5 : 0.34,
      });
      PH.Paper.tape(ctx, cw / 2 - 34, 2, 68, -0.12);

      PH.Paper.text(ctx, '0' + (i + 1), 18, 46, {
        size: 30,
        color: 'rgba(200,68,58,0.85)',
        font: PH.Fonts.hand,
        weight: '900',
      });
      PH.Paper.text(ctx, def.name, 64, 43, {
        size: 21,
        color: '#3A2A1E',
        font: PH.Fonts.hand,
        weight: '900',
      });
      PH.Paper.text(ctx, def.sub.replace('限时挑战 · ', ''), 18, 68, {
        size: 12.5,
        color: 'rgba(90,70,50,.65)',
      });

      // 限时 / 最佳
      ctx.save();
      ctx.fillStyle = 'rgba(60,45,30,0.06)';
      ctx.fillRect(14, 82, cw - 28, 62);
      ctx.restore();
      PH.Paper.text(ctx, '限时', 24, 106, { size: 13, color: 'rgba(90,70,50,.75)' });
      PH.Paper.text(ctx, def.time + ' 秒', 66, 108, { size: 17, color: '#4A3626', weight: '800' });
      PH.Paper.text(ctx, '最佳', 24, 132, { size: 13, color: 'rgba(90,70,50,.75)' });
      if (best) {
        PH.Paper.icon(ctx, 'star', 60, 128, 13, '#E2A93B');
        PH.Paper.text(ctx, best.time.toFixed(1) + ' 秒', 86, 134, { size: 17, color: '#C8443A', weight: '800' });
      } else {
        PH.Paper.text(ctx, '还没跑过', 66, 134, { size: 15, color: 'rgba(120,100,80,.55)' });
      }

      // 右上角立绘
      const spr = def.theme === 'nest' ? 'stone' : def.theme === 'courtyard' ? 'cannon' : 'cabbage';
      let ss = PH.Assets.sizeForH(spr, 50);
      const maxW = cw * 0.24;
      if (ss.w > maxW) ss = { w: maxW, h: (ss.h * maxW) / ss.w };
      PH.Assets.draw(ctx, spr, cw - 12 - ss.w, 16, ss.w, ss.h, { flip: true, alpha: 0.95 });

      // 赛道示意：起点 → 终点旗
      ctx.save();
      ctx.strokeStyle = 'rgba(120,100,80,0.32)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(26, 166);
      ctx.lineTo(cw - 44, 166);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(120,100,80,0.45)';
      ctx.beginPath();
      ctx.arc(24, 166, 3.4, 0, 7);
      ctx.fill();
      // 小旗
      ctx.strokeStyle = '#8C6B46';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cw - 38, 174);
      ctx.lineTo(cw - 38, 152);
      ctx.stroke();
      ctx.fillStyle = '#C8443A';
      ctx.beginPath();
      ctx.moveTo(cw - 38, 152);
      ctx.lineTo(cw - 18, 158);
      ctx.lineTo(cw - 38, 164);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 底部缎带
      ctx.save();
      ctx.fillStyle = '#C8443A';
      PH.Paper.roughRect(ctx, 10, chh - 34, cw - 20, 24, 1.2, i * 9 + 3);
      ctx.fill();
      ctx.restore();
      PH.Paper.text(ctx, best ? '已跑完 · 再来一次' : '点我开始计时', cw / 2, chh - 17, {
        size: 12,
        align: 'center',
        color: '#FFF6E2',
        weight: '700',
      });

      ctx.restore();

      G.buttons.push({
        id: 'ch' + id, x, y, w: cw, h: chh, label: '', hover: 0, custom: true,
        onClick: () => startLevel(id),
      });
    });

    // 合计最佳
    const done = list.filter((id) => PH.getChallengeBest(id)).length;
    const totalBest = list.reduce((a, id) => {
      const b = PH.getChallengeBest(id);
      return a + (b ? b.time : 0);
    }, 0);
    PH.Paper.text(ctx, done === list.length ? '三张总用时  ' + totalBest.toFixed(1) + ' 秒' : '已完成 ' + done + ' / ' + list.length + ' 张', VW / 2, startY + chh + 28, {
      size: 16,
      align: 'center',
      color: 'rgba(253,246,227,0.8)',
      weight: '700',
    });

    addBtn('back', 22, 20, 96, 40, '返回', () => setState('select'), { size: 17, color: '#F6EEDC' });
    if (Input.pressed('pause')) setState('select');
  }

  /* ---------------- 场景：双人结算 ---------------- */
  function drawDuelClear(dt) {
    G.duelT += dt;
    const st = G.lastDuel || { winnerTag: 'P1', winnerColor: '#E2574C', time: 0, gap: 0 };
    const def = PH.Levels[st.id];
    G.world.draw();
    ctx.fillStyle = 'rgba(30,20,16,0.58)';
    ctx.fillRect(0, 0, VW, VH);

    const w = 520, h = 372, x = (VW - w) / 2, y = (VH - h) / 2;
    PH.Paper.stackPanel(ctx, x, y, w, h, { fill: '#FCF6E6', fill2: '#EFE2C4', seed: 67, shadowAlpha: 0.56 });
    PH.Paper.tape(ctx, x + 44, y + 2, 104, -0.2);
    PH.Paper.tape(ctx, x + w - 152, y + 4, 96, 0.16);

    // 冠军色块
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = st.winnerColor;
    ctx.beginPath();
    ctx.arc(VW / 2, y + 96, 54, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = st.winnerColor;
    ctx.beginPath();
    ctx.arc(VW / 2, y + 96, 34, 0, 7);
    ctx.fill();
    ctx.restore();
    PH.Paper.text(ctx, st.winnerTag, VW / 2, y + 106, {
      size: 30,
      align: 'center',
      color: '#FFF8EC',
      font: PH.Fonts.hand,
      weight: '900',
    });

    PH.Paper.text(ctx, st.winnerTag + ' 获胜！', VW / 2, y + 176, {
      size: 36,
      align: 'center',
      color: '#3A2A1E',
      font: PH.Fonts.hand,
      weight: '900',
    });
    PH.Paper.text(ctx, (def ? def.name + '  ·  ' : '') + '用时 ' + st.time.toFixed(1) + ' 秒', VW / 2, y + 204, {
      size: 15,
      align: 'center',
      color: 'rgba(90,70,50,.72)',
    });
    if (st.gap > 0) {
      PH.Paper.text(ctx, st.loserTag + ' 还差 ' + st.gap + ' 格', VW / 2, y + 228, {
        size: 13,
        align: 'center',
        color: 'rgba(120,90,70,.65)',
      });
    }

    G.buttons = [];
    addBtn('again', VW / 2 - 200, y + h - 76, 130, 50, '再来一局', () => {
      G.world = null;
      startLevel(st.id);
    }, { color: '#FFF3D0', size: 18 });
    addBtn('tracks', VW / 2 - 60, y + h - 76, 130, 50, '换赛道', () => setState('select'), { size: 17 });
    addBtn('home', VW / 2 + 80, y + h - 76, 120, 50, '回标题', () => {
      G.mode = 'single';
      setState('title');
    }, { size: 17 });
  }

  /* ---------------- 生命耗尽 → 回到上一个 BOSS 之后 ---------------- */
  function rollbackProgress() {
    let lastBoss = -1;
    PH.LEVEL_ORDER.forEach((id, i) => {
      if (id.endsWith('B') && Save.cleared[id]) lastBoss = i;
    });
    const keep = {};
    const keepBest = {};
    PH.LEVEL_ORDER.slice(0, lastBoss + 1).forEach((id) => {
      if (Save.cleared[id]) keep[id] = true;
      if (Save.best && Save.best[id]) keepBest[id] = Save.best[id];
    });
    Save.cleared = keep;
    Save.best = keepBest;
    Save.unlocked = lastBoss < 0 ? 1 : Math.min(PH.LEVEL_ORDER.length, lastBoss + 2);
    Save.lives = LIVES_BASE;
    Save.save();
    if (PH.Hub && PH.Hub.pushSave) PH.Hub.pushSave(Save.snapshot());
    return lastBoss;
  }

  function failLevel() {
    const w = G.world;
    if (!w || w.failShown) return;
    w.failShown = true;
    if (w.duel) {
      const low = Math.min.apply(null, w.players.map((p) => p.lives));
      Save.lives = Math.max(0, low);
      Save.save();
    }
    const before = Save.lives;
    let rollbackTo = -1;
    if (Save.lives <= 0) rollbackTo = rollbackProgress();
    G.failInfo = {
      id: G.levelId,
      lives: Math.max(0, before),
      deaths: w.deaths,
      rollback: rollbackTo !== -2 && before <= 0,
      bossId: rollbackTo >= 0 ? PH.LEVEL_ORDER[rollbackTo] : '',
    };
    PH.Audio.sfx('die');
    G.failT = 0;
    setState('levelFail');
  }

  /* ---------------- 场景：本关失败 ---------------- */
  function drawLevelFail(dt) {
    G.failT = (G.failT || 0) + dt;
    const st = G.failInfo || { lives: 0, deaths: 0, rollback: false };
    if (G.world) G.world.draw();
    ctx.fillStyle = 'rgba(30,20,16,0.66)';
    ctx.fillRect(0, 0, VW, VH);

    const w = 520, h = 330, x = (VW - w) / 2, y = (VH - h) / 2;
    PH.Paper.stackPanel(ctx, x, y, w, h, { fill: '#FCF6E6', fill2: '#EFE2C4', seed: 91, shadowAlpha: 0.58 });
    PH.Paper.tape(ctx, x + 44, y + 2, 104, -0.2);

    // 一只破掉的泡泡
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#9FC6D8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(VW / 2, y + 74, 28, 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(VW / 2 + 6, y + 82, 4, 0, 7);
    ctx.stroke();
    ctx.restore();

    PH.Paper.text(ctx, '本关失败', VW / 2, y + 96, {
      size: 34,
      align: 'center',
      color: '#3A2A1E',
      font: PH.Fonts.hand,
      weight: '900',
    });
    PH.Paper.text(ctx, st.rollback ? '生命用完了' : '生命用完了，这关没能过去', VW / 2, y + 124, {
      size: 14,
      align: 'center',
      color: 'rgba(90,70,50,.72)',
    });

    const rows = [
      ['本关倒下', st.deaths + ' 次'],
      ['剩余生命', st.rollback ? '0 → 重新补满 ' + LIVES_BASE : String(st.lives)],
      ['进度', st.rollback ? (st.bossId ? '回到 ' + st.bossId + ' 之后' : '回到最初的第一关') : '存档点已清空，重跑本关'],
    ];
    rows.forEach((r, i) => {
      PH.Paper.text(ctx, r[0], x + 84, y + 166 + i * 30, { size: 15, color: '#6B5136' });
      PH.Paper.text(ctx, r[1], x + w - 84, y + 166 + i * 30, {
        size: 15,
        align: 'right',
        color: i === 2 && st.rollback ? '#C8443A' : '#3A2A1E',
        weight: '800',
      });
    });

    G.buttons = [];
    addBtn('failRetry', VW / 2 - 190, y + h - 68, 170, 48, st.rollback ? '重新开始' : '重跑本关', () => {
      G.world = null;
      G.mode = 'single';
      startLevel(G.levelId);
    }, { color: '#FFF3D0', size: 18 });
    addBtn('failHome', VW / 2 + 20, y + h - 68, 170, 48, '回标题', () => {
      G.world = null;
      G.mode = 'single';
      setState('title');
    }, { color: '#F6EEDC', size: 17 });
  }

  /* ---------------- 场景：联机结算 ---------------- */
  function drawOnlineClear(dt) {
    G.onlineT = (G.onlineT || 0) + dt;
    const w = G.world;
    if (!w) {
      setState('title');
      return;
    }
    const rows = onlineStandings(w);
    const mine = rows.findIndex((r) => r.me);
    const myRank = mine < 0 ? rows.length : mine + 1;

    w.draw();
    ctx.fillStyle = 'rgba(30,20,16,0.6)';
    ctx.fillRect(0, 0, VW, VH);

    const pw = 560, ph = 236 + rows.length * 46, x = (VW - pw) / 2, y = (VH - ph) / 2;
    PH.Paper.stackPanel(ctx, x, y, pw, ph, { fill: '#FCF6E6', fill2: '#EFE2C4', seed: 77, shadowAlpha: 0.58 });
    PH.Paper.tape(ctx, x + 44, y + 2, 104, -0.2);
    PH.Paper.tape(ctx, x + pw - 152, y + 4, 96, 0.16);

    PH.Paper.text(ctx, '比赛结果', VW / 2, y + 62, {
      size: 34,
      align: 'center',
      color: '#3A2A1E',
      font: PH.Fonts.hand,
      weight: '900',
    });
    PH.Paper.text(ctx, w.def.name + '  ·  ' + (w.won ? '你第 ' + myRank + ' 名' : '你还在路上'), VW / 2, y + 88, {
      size: 14,
      align: 'center',
      color: 'rgba(90,70,50,.7)',
    });

    rows.forEach((r, i) => {
      const ry = y + 118 + i * 46;
      const rank = i + 1;
      ctx.save();
      ctx.globalAlpha = r.me ? 1 : 0.92;
      // 名次圆章
      ctx.fillStyle = rank === 1 ? '#E2A93B' : rank === 2 ? '#B9BFC7' : rank === 3 ? '#C89A6B' : 'rgba(120,95,70,.28)';
      ctx.beginPath();
      ctx.arc(x + 54, ry + 10, 15, 0, 7);
      ctx.fill();
      ctx.restore();
      PH.Paper.text(ctx, String(rank), x + 54, ry + 16, {
        size: 15,
        align: 'center',
        color: '#FFF8EC',
        weight: '900',
      });

      ctx.save();
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(x + 88, ry + 6, 5, 0, 7);
      ctx.fill();
      ctx.restore();

      const nm = Array.from(r.name).slice(0, 8).join('') + (r.me ? '（你）' : '');
      PH.Paper.text(ctx, nm, x + 104, ry + 12, {
        size: 17,
        color: '#3A2A1E',
        weight: r.me ? '900' : '700',
      });

      const right = r.gone ? '已离开' : r.finished ? r.time.toFixed(1) + ' 秒' : '未完赛';
      PH.Paper.text(ctx, right, x + pw - 52, ry + 12, {
        size: 17,
        align: 'right',
        color: r.finished ? '#3F8B46' : 'rgba(90,70,50,.55)',
        weight: '800',
        font: r.finished ? PH.Fonts.mono : undefined,
      });
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#6B5136';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(x + 40, ry + 30);
      ctx.lineTo(x + pw - 40, ry + 30);
      ctx.stroke();
      ctx.restore();
    });

    G.buttons = [];
    const by = y + ph - 72;
    if (PH.Net.isHost()) {
      addBtn('onAgain', VW / 2 - 218, by, 140, 50, '再来一局', () => {
        PH.Net.relay({ k: 'start', level: G.levelId });
        PH.startOnlineRace(G.levelId);
      }, { color: '#FFF3D0', size: 18 });
      addBtn('onRoom', VW / 2 - 64, by, 140, 50, '回到房间', () => {
        PH.leaveOnlineRace(true);
        PH.Online.open();
      }, { size: 17 });
      addBtn('onHome', VW / 2 + 90, by, 120, 50, '回标题', () => {
        PH.leaveOnlineRace(false);
      }, { size: 17 });
    } else {
      addBtn('onRoom', VW / 2 - 150, by, 140, 50, '回到房间', () => {
        PH.leaveOnlineRace(true);
        PH.Online.open();
      }, { color: '#FFF3D0', size: 17 });
      addBtn('onHome', VW / 2 + 10, by, 140, 50, '回标题', () => {
        PH.leaveOnlineRace(false);
      }, { size: 17 });
    }
    PH.Paper.text(ctx, '房主点「再来一局」，所有人一起开跑', VW / 2, by - 18, {
      size: 12,
      align: 'center',
      color: 'rgba(90,70,50,.5)',
    });
  }

  /* ---------------- 场景：挑战结算 ---------------- */
  function drawChallengeClear(dt) {
    G.challengeT += dt;
    const st = G.lastChallenge || { used: 0, limit: 60, best: 0, isBest: false };
    G.world.draw();
    ctx.fillStyle = 'rgba(30,20,16,0.58)';
    ctx.fillRect(0, 0, VW, VH);

    const w = 540, h = 402, x = (VW - w) / 2, y = (VH - h) / 2;
    PH.Paper.stackPanel(ctx, x, y, w, h, { fill: '#FCF6E6', fill2: '#EFE2C4', seed: 61, shadowAlpha: 0.56 });
    PH.Paper.tape(ctx, x + 40, y + 2, 100, -0.2);

    PH.Paper.text(ctx, '挑战完成', VW / 2, y + 66, {
      size: 36,
      align: 'center',
      color: '#3A2A1E',
      font: PH.Fonts.hand,
      weight: '900',
    });
    const def = PH.Levels[st.id];
    PH.Paper.text(ctx, def ? def.name : '', VW / 2, y + 92, {
      size: 15,
      align: 'center',
      color: 'rgba(120,80,50,.7)',
    });

    // 大用时
    PH.Paper.text(ctx, st.used.toFixed(1), VW / 2 - 26, y + 162, {
      size: 62,
      align: 'center',
      color: '#C8443A',
      font: PH.Fonts.hand,
      weight: '900',
    });
    PH.Paper.text(ctx, '秒', VW / 2 + 62, y + 160, {
      size: 20,
      color: '#C8443A',
      weight: '800',
    });

    if (st.isBest) {
      PH.Paper.stamp(ctx, x + w - 108, y + 96, '新纪录', -0.18, 0.62);
    }

    const rows = [
      ['关卡限时', st.limit + ' 秒'],
      ['最好成绩', st.best.toFixed(1) + ' 秒'],
      ['金币', st.coins + ' / ' + st.total],
    ];
    rows.forEach((r, i) => {
      PH.Paper.text(ctx, r[0], x + 96, y + 216 + i * 32, { size: 16, color: '#6B5136' });
      PH.Paper.text(ctx, r[1], x + w - 96, y + 216 + i * 32, { size: 17, align: 'right', color: '#3A2A1E', weight: '800' });
    });

    G.buttons = [];
    const idx = PH.CHALLENGE_ORDER.indexOf(st.id);
    const nextId = PH.CHALLENGE_ORDER[idx + 1];
    if (nextId) {
      addBtn('nextc', VW / 2 - 210, y + h - 74, 140, 50, '下一张', () => startLevel(nextId), { color: '#FFF3D0', size: 18 });
      addBtn('retryc', VW / 2 - 60, y + h - 74, 130, 50, '再跑一次', () => startLevel(st.id), { color: '#F6EEDC', size: 17 });
      addBtn('backc', VW / 2 + 80, y + h - 74, 130, 50, '返回', () => setState('challenge'), { size: 17 });
    } else {
      addBtn('retryc', VW / 2 - 200, y + h - 74, 130, 50, '再跑一次', () => startLevel(st.id), { color: '#FFF3D0', size: 17 });
      addBtn('backc', VW / 2 - 60, y + h - 74, 130, 50, '返回列表', () => setState('challenge'), { size: 17 });
      addBtn('homec', VW / 2 + 80, y + h - 74, 120, 50, '回标题', () => setState('title'), { size: 17 });
    }
  }

  /* ---------------- 场景：帮助 ---------------- */
  const HELP = [
    ['A D / ← →', '左右移动'],
    ['空格 / W / ↑', '跳跃（长按跳更高）'],
    ['Shift', '加速奔跑'],
    ['Y', '发射冰冰冰（需先拾取）'],
    ['J', '67 枪连射'],
    ['K', '扔出奶蛋（会滚）'],
    ['L', '扔出虚弱药水'],
    ['↓', '从木板上跳下去'],
    ['Esc / P', '暂停'],
    ['M', '静音'],
  ];

  const isTouchUI = () => document.body.classList.contains('touch');
  function drawHelp(dt) {
    PH.Paper.drawBackdrop(ctx, 'meadow', 800 + G.titleT * 10, 0, G.titleT, 9999);
    ctx.fillStyle = 'rgba(36,26,21,0.6)';
    ctx.fillRect(0, 0, VW, VH);

    const w = 640, h = 470, x = (VW - w) / 2, y = 36;
    PH.Paper.stackPanel(ctx, x, y, w, h, { fill: '#FCF6E6', fill2: '#EFE2C4', seed: 21, shadowAlpha: 0.5 });
    PH.Paper.tape(ctx, x + 40, y + 4, 110, -0.24);
    PH.Paper.tape(ctx, x + w - 48, y + 6, 110, 0.2);

    PH.Paper.text(ctx, '操作说明', x + w / 2, y + 62, {
      size: 36,
      align: 'center',
      color: '#3A2A1E',
      font: PH.Fonts.hand,
      weight: '900',
    });
    HELP.forEach((row, i) => {
      const ry = y + 104 + i * 30;
      ctx.save();
      ctx.fillStyle = 'rgba(60,45,30,0.06)';
      ctx.fillRect(x + 60, ry - 20, w - 120, 28);
      ctx.restore();
      PH.Paper.text(ctx, row[0], x + 84, ry, { size: 17, color: '#C8443A', weight: '700', font: PH.Fonts.mono });
      PH.Paper.text(ctx, row[1], x + 300, ry, { size: 17, color: '#4A3626' });
    });
    PH.Paper.text(ctx, '小提示：站在敌人头上可以踩扁它；滚木和坦克踩不得。', x + w / 2, y + h - 62, {
      size: 13,
      align: 'center',
      color: 'rgba(90,70,50,.7)',
    });

    G.buttons = [
      {
        id: 'helpback',
        x: VW / 2 - 90,
        y: y + h - 50,
        w: 180,
        h: 42,
        label: '知道了',
        color: '#FFF3D0',
        onClick: () => setState('title'),
        hover: 0,
        size: 21,
      },
    ];
    if (Input.pressed('pause') || Input.pressed('confirm')) setState('title');
  }

  /* ---------------- HUD ---------------- */
  function drawLevelBanner(w) {
    if (!(w.introT > 0) || w.boss) return;
    const def = w.def;
    const a = Math.min(1, (2.4 - w.introT) * 7) * Math.min(1, w.introT * 2.2);
    const slide = (1 - Math.min(1, (2.4 - w.introT) * 6)) * -60;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, slide);
    const bw = 420, bh = 92;
    const bx = VW / 2 - bw / 2, by = 150;
    PH.Paper.stackPanel(ctx, bx, by, bw, bh, { fill: '#FDF6E3', fill2: '#F0E3C6', seed: 51, shadowAlpha: 0.45 });
    PH.Paper.text(ctx, def.id + '  ' + def.name, VW / 2, by + 44, {
      size: 32,
      align: 'center',
      color: '#3A2A1E',
      font: PH.Fonts.hand,
      weight: '900',
    });
    const tl = PH.LEVEL_TITLES[def.id];
    PH.Paper.text(ctx, (tl && tl.world) || '', VW / 2, by + 70, {
      size: 14,
      align: 'center',
      color: 'rgba(90,70,50,.7)',
    });
    ctx.restore();
  }

  // 双人竞速 HUD：左右两个玩家条 + 中间赛道进度
  function drawDuelHUD(w) {
    const list = w.players;
    const goalX = w.goal ? w.goal.x : w.level.w * T;
    const prog = (pl) => U.clamp(pl.cx / Math.max(1, goalX), 0, 1);
    const p0 = prog(list[0]);
    const p1 = prog(list[1]);
    const lead = Math.abs(p0 - p1) < 0.004 ? -1 : p0 > p1 ? 0 : 1;

    const chip = (idx, x) => {
      const pl = list[idx];
      PH.Paper.panel(ctx, x, 12, 188, 46, { fill: '#FCF6E6', fill2: '#EDE0C4', seed: 7 + idx * 5, shadowAlpha: 0.26, blur: 9 });
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(x + 21, 35, 12, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x + 21, 35, 7, 0, 7);
      ctx.fill();
      ctx.restore();
      PH.Paper.text(ctx, pl.tag, x + 36, 42, { size: 17, color: pl.color, weight: '900', font: PH.Fonts.hand });
      if (pl.stun > 0) {
        PH.Paper.text(ctx, '摔了', x + 74, 40, { size: 12, color: 'rgba(200,68,58,.9)' });
      }
      drawMiniHearts(ctx, x + 176, 39, pl.hp, pl.maxHp);
      if (lead === idx) PH.Paper.icon(ctx, 'star', x + 180, 22, 12, '#E2A93B');
    };
    chip(0, 14);
    chip(1, VW - 14 - 188);

    // 中间赛道
    const bx = 228, by = 22, bw = VW - 456, bh = 10;
    ctx.save();
    ctx.fillStyle = 'rgba(60,40,25,0.32)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(255,246,227,0.4)';
    ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = 'rgba(253,246,227,0.9)';
    ctx.beginPath();
    ctx.moveTo(bx + bw + 6, by - 3);
    ctx.lineTo(bx + bw + 16, by + bh / 2);
    ctx.lineTo(bx + bw + 6, by + bh + 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    for (let i = 0; i < 2; i++) {
      const pl = list[i];
      const mx = bx + bw * prog(pl);
      ctx.save();
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(mx, by + bh / 2, 6, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(253,246,227,0.92)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    PH.Paper.text(ctx, '先到终点者获胜  ·  ' + w.duelTime.toFixed(1) + ' 秒', VW / 2, 52, {
      size: 12.5,
      align: 'center',
      color: 'rgba(253,246,227,0.88)',
      outline: 'rgba(40,26,18,0.55)',
      outlineW: 3,
    });
  }

  /* ---------------- 联机：幽灵 + HUD ---------------- */
  function drawGhostSprite(ctx, world) {
    const g = this;
    const h = 86;
    const spr = g.spr || 'hero';
    const s = PH.Assets.sizeForH(spr, h);
    const cx = g.x + g.w / 2;
    const foot = g.y + g.h;
    const bob = g.pose === 'run' ? Math.sin(g.animT * 15) * 2.2 : Math.sin(g.animT * 2.4) * 1.2;

    if (g.bubbled) {
      // 倒下的对手也是一颗泡泡，跳上去才能戳破
      const bcy = foot - 36;
      const r = 25 + Math.sin(g.animT * 3) * 1.2;
      ctx.save();
      const grad = ctx.createRadialGradient(cx - r * 0.35, bcy - r * 0.4, r * 0.15, cx, bcy, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(160,210,230,0.24)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, bcy, r, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      PH.Assets.draw(ctx, spr, cx - s.w * 0.27, bcy - 17, s.w * 0.54, 33, {
        flip: g.facing < 0,
        alpha: 0.85,
        shadow: false,
      });
      PH.Paper.text(ctx, '↑ 跳起来戳破', cx, bcy - r - 8, {
        size: 11,
        align: 'center',
        color: '#3A2A1E',
        weight: '800',
        outline: 'rgba(255,248,232,0.9)',
        outlineW: 3,
      });
    } else {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#3A2A1E';
      ctx.beginPath();
      ctx.ellipse(cx, foot - 2, s.w * 0.3, 4.5, 0, 0, 7);
      ctx.fill();
      ctx.restore();

      PH.Assets.draw(ctx, spr, cx - s.w / 2, foot - h + bob, s.w, h, {
        flip: g.facing < 0,
        alpha: 0.5,
        shadow: false,
      });
    }

    // 名字牌
    const labelY = foot - h - 7 + bob + (g.labelDy || 0);
    ctx.save();
    ctx.globalAlpha = 0.92;
    PH.Paper.text(ctx, g.name, cx, labelY, {
      size: 11.5,
      align: 'center',
      color: g.color,
      weight: '900',
      outline: 'rgba(255,248,232,0.92)',
      outlineW: 3.4,
    });
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(cx - measureName(g.name) * 0.5 - 8, labelY - 4, 3, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  function measureName(n) {
    // 粗略估宽：中文按 11.5px、其余按 6px
    let w = 0;
    for (const ch of String(n)) w += /[\u4e00-\u9fa5]/.test(ch) ? 11.5 : 6.4;
    return w;
  }

  function drawOnlineHUD(w) {
    const p = w.player;
    // 左上：生命 + 金币
    PH.Paper.panel(ctx, 14, 12, 236, 52, { fill: '#FCF6E6', fill2: '#EDE0C4', seed: 3, shadowAlpha: 0.26, blur: 9 });
    const hearts = Math.min(p.maxHp, 5);
    for (let i = 0; i < hearts; i++) PH.Paper.heart(ctx, 44 + i * 32, 38, 24, i < p.hp, '#E2574C');
    PH.Paper.coin(ctx, 202, 38, 10, w.time * 0.6);
    PH.Paper.text(ctx, '× ' + p.coins, 214, 45, { size: 17, color: '#4A3626', weight: '700' });
    drawLifeChip(ctx, 262, 39, p.lives);

    // 中上：关卡 + 计时
    const cw = 258;
    PH.Paper.panel(ctx, VW / 2 - cw / 2, 12, cw, 44, { fill: '#FCF6E6', fill2: '#EDE0C4', seed: 9, shadowAlpha: 0.22, blur: 8 });
    PH.Paper.text(ctx, w.def.id + '  ' + w.def.name, VW / 2 - cw / 2 + 14, 40, { size: 15, color: '#4A3626', weight: '700' });
    PH.Paper.text(ctx, w.raceTime.toFixed(1), VW / 2 + cw / 2 - 38, 41, {
      size: 19,
      align: 'right',
      font: PH.Fonts.mono,
      weight: '800',
      color: w.won ? '#3F8B46' : '#3A2A1E',
    });
    PH.Paper.text(ctx, '秒', VW / 2 + cw / 2 - 20, 40, { size: 11, color: 'rgba(90,70,50,.6)' });

    // 右上：名次板
    const rows = onlineStandings(w);
    const rw = 218, rh = 34 + rows.length * 24;
    const rx = VW - rw - 14, ry = 12;
    PH.Paper.panel(ctx, rx, ry, rw, rh, { fill: '#FCF6E6', fill2: '#EDE0C4', seed: 21, shadowAlpha: 0.26, blur: 9 });
    PH.Paper.text(ctx, '名次', rx + 13, ry + 22, { size: 11.5, color: 'rgba(90,70,50,.55)', weight: '700' });
    PH.Paper.text(ctx, '生命 / 用时', rx + rw - 13, ry + 22, { size: 11.5, align: 'right', color: 'rgba(90,70,50,.55)' });
    rows.forEach((r, i) => {
      const y = ry + 44 + i * 24;
      ctx.save();
      ctx.globalAlpha = r.gone ? 0.4 : 1;
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(rx + 20, y - 4, 4, 0, 7);
      ctx.fill();
      if (r.me) {
        ctx.strokeStyle = 'rgba(60,42,30,0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(rx + 20, y - 4, 7, 0, 7);
        ctx.stroke();
      }
      ctx.restore();
      const nm = Array.from(r.name).slice(0, 5).join('');
      PH.Paper.text(ctx, nm, rx + 32, y, {
        size: 13.5,
        color: r.me ? '#3A2A1E' : 'rgba(60,42,30,0.82)',
        weight: r.me ? '800' : '600',
      });
      if (r.gone || r.finished) {
        PH.Paper.text(ctx, r.gone ? '离线' : r.time.toFixed(1) + ' 秒', rx + rw - 14, y, {
          size: 13,
          align: 'right',
          color: r.finished ? '#3F8B46' : 'rgba(60,42,30,0.45)',
          weight: r.finished ? '800' : '600',
          font: r.finished ? PH.Fonts.mono : undefined,
        });
      } else {
        // 不报百分比，直接看还剩几颗心
        drawMiniHearts(ctx, rx + rw - 14, y - 4, r.hp, r.maxHp);
      }
    });
  }

  function drawOnlineCountdown(w) {
    if (w.countdown <= 0) return;
    const t = w.countdown - 0.4;
    const n = Math.ceil(t);
    const label = n > 0 ? String(n) : '跑！';
    const frac = n > 0 ? t - Math.floor(t) : 0.4 - Math.abs(t);
    const scale = n > 0 ? 0.92 + frac * 0.34 : 1.1;
    const alpha = w.countdown > 0.4 ? 1 : Math.max(0, (w.countdown / 0.4) * 1.2);

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#F6EFDD';
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();

    ctx.save();
    ctx.translate(VW / 2, VH * 0.42);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    PH.Paper.text(ctx, label, 0, 0, {
      size: n > 0 ? 92 : 68,
      align: 'center',
      color: '#FDF6E3',
      outline: 'rgba(58,34,22,0.9)',
      outlineW: 12,
      font: PH.Fonts.hand,
      weight: '900',
    });
    ctx.restore();

    PH.Paper.text(ctx, '谁先到终点谁赢', VW / 2, VH * 0.42 + 74, {
      size: 15,
      align: 'center',
      color: '#FDF6E3',
      outline: 'rgba(58,34,22,0.7)',
      outlineW: 5,
      weight: '700',
    });
  }

  // 剩余生命：一颗小泡泡 + ×N
  // 一排小纸心（右对齐），给多人界面显示各自血量
  function drawMiniHearts(ctx, rightX, y, hp, maxHp) {
    const n = Math.max(1, Math.min(5, maxHp | 0 || 3));
    const step = 14;
    for (let i = 0; i < n; i++) {
      const hx = rightX - (n - 1 - i) * step - 7;
      PH.Paper.heart(ctx, hx, y, 13, i < hp, '#E2574C');
    }
  }

  function drawLifeChip(ctx, x, y, n) {
    ctx.save();
    const grad = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, 12);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.6, 'rgba(200,235,248,0.75)');
    grad.addColorStop(1, 'rgba(150,205,228,0.55)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
    PH.Paper.text(ctx, '× ' + n, x + 18, y + 6, {
      size: 17,
      color: n <= 1 ? '#C8443A' : '#3A2A1E',
      weight: '800',
      font: PH.Fonts.mono,
    });
  }

  function drawHUD(dt) {
    const w = G.world;
    const p = w.player;
    if (w.duel) {
      drawDuelHUD(w);
      drawLevelBanner(w);
      return;
    }
    if (w.online) {
      drawOnlineHUD(w);
      drawOnlineCountdown(w);
      return;
    }
    ctx.save();

    // 左：生命 + 剩余条数 + 金币
    PH.Paper.panel(ctx, 14, 12, 306, 56, { fill: '#FCF6E6', fill2: '#EDE0C4', seed: 3, shadowAlpha: 0.28, blur: 10 });
    for (let i = 0; i < Math.min(p.maxHp, 8); i++) {
      PH.Paper.heart(ctx, 44 + i * 32, 40, 24, i < p.hp, '#E2574C');
    }
    drawLifeChip(ctx, 148, 40, p.lives);
    PH.Paper.coin(ctx, 236, 40, 11, w.time * 0.6);
    PH.Paper.text(ctx, '× ' + p.coins, 252, 47, { size: 20, color: '#4A3626', weight: '700' });

    // 中：关卡名 + 时间
    const def = w.def;
    if (G.challenge) {
      /* ---- 限时挑战的倒计时 ---- */
      const left = Math.max(0, w.timeLeft);
      const low = left <= 10;
      const blink = low ? 0.7 + Math.sin(w.time * 14) * 0.3 : 1;
      const pw = 300;
      PH.Paper.panel(ctx, VW / 2 - pw / 2, 10, pw, 52, {
        fill: low ? '#FBE3DC' : '#FCF6E6',
        fill2: low ? '#F2C6BA' : '#EDE0C4',
        seed: 8,
        shadowAlpha: 0.24,
        blur: 8,
      });
      PH.Paper.text(ctx, '限时挑战', VW / 2 - pw / 2 + 16, 36, {
        size: 15,
        color: '#C8443A',
        weight: '800',
        font: PH.Fonts.hand,
      });
      ctx.save();
      ctx.globalAlpha = blink;
      PH.Paper.text(ctx, left.toFixed(1), VW / 2 + pw / 2 - 34, 42, {
        size: 28,
        align: 'right',
        color: low ? '#C8443A' : '#3A2A1E',
        font: PH.Fonts.mono,
        weight: '800',
      });
      ctx.restore();
      PH.Paper.text(ctx, '秒', VW / 2 + pw / 2 - 14, 40, { size: 12, color: low ? '#C8443A' : '#6B5136' });
      // 剩余时间条
      const ratio = U.clamp(left / def.time, 0, 1);
      const bw = pw - 32;
      ctx.save();
      ctx.fillStyle = 'rgba(70,50,32,0.16)';
      ctx.fillRect(VW / 2 - bw / 2, 48, bw, 5);
      ctx.fillStyle = low ? '#C8443A' : '#7FB63F';
      ctx.fillRect(VW / 2 - bw / 2, 48, bw * ratio, 5);
      ctx.restore();
      // 最好成绩
      const cb = PH.getChallengeBest(G.challenge);
      PH.Paper.text(ctx, cb ? '最佳 ' + cb.time.toFixed(1) + ' 秒' : '第一次跑 · 加油', VW / 2, 76, {
        size: 12,
        align: 'center',
        color: 'rgba(253,246,227,0.72)',
        outline: 'rgba(40,26,18,0.5)',
        outlineW: 3,
      });
    } else {
      PH.Paper.panel(ctx, VW / 2 - 128, 12, 256, 40, { fill: '#FCF6E6', fill2: '#EDE0C4', seed: 8, shadowAlpha: 0.22, blur: 8 });
      PH.Paper.text(ctx, def.id + '  ' + def.name, VW / 2 - 114, 39, { size: 17, color: '#4A3626', weight: '700' });
      const tl = Math.ceil(w.timeLeft);
      PH.Paper.text(ctx, U.fmtTime(tl), VW / 2 + 114, 39, {
        size: 17,
        align: 'right',
        color: tl < 30 ? '#C8443A' : '#6B5136',
        weight: '700',
      });
    }

    // 右：道具槽
    PH.Paper.panel(ctx, VW - 14 - 240, 12, 240, 56, { fill: '#FCF6E6', fill2: '#EDE0C4', seed: 13, shadowAlpha: 0.28, blur: 10 });
    const slots = [
      ['itemIce', p.hasIce, null, 'Y'],
      ['itemGun', p.ammo.gun > 0, p.ammo.gun, 'J'],
      ['itemEgg', p.ammo.egg > 0, p.ammo.egg, 'K'],
      ['itemWeak', p.ammo.weak > 0, p.ammo.weak, 'L'],
    ];
    slots.forEach((sl, i) => {
      const sx = VW - 14 - 240 + 12 + i * 56;
      const sy = 17;
      ctx.save();
      PH.Paper.roughRect(ctx, sx, sy, 48, 46, 1.4, 60 + i);
      ctx.fillStyle = sl[1] ? 'rgba(255,249,232,0.95)' : 'rgba(120,100,80,0.07)';
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = sl[1] ? 'rgba(90,70,50,0.42)' : 'rgba(90,70,50,0.24)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if (sl[1]) {
        const size = PH.Assets.sizeForH(sl[0], 29);
        PH.Assets.draw(ctx, sl[0], sx + 24 - size.w / 2, sy + 6, size.w, size.h);
        if (sl[2] !== null) {
          PH.Paper.text(ctx, '' + sl[2], sx + 44, sy + 42, {
            size: 14,
            align: 'right',
            color: '#3A2A1E',
            weight: '800',
          });
        }
      } else {
        PH.Paper.icon(ctx, 'lock', sx + 24, sy + 20, 12, 'rgba(90,70,50,0.16)');
      }
      PH.Paper.text(ctx, sl[3], sx + 4, sy + 42, {
        size: 11,
        color: sl[1] ? 'rgba(200,68,58,0.85)' : 'rgba(90,70,50,0.45)',
        weight: '800',
      });
    });

    ctx.restore();

    // BOSS 血条
    if (w.boss && !w.boss.dead && w.boss.intro <= 0.4) {
      const b = w.boss;
      const bw = 420, bh = 26;
      const bx = VW / 2 - bw / 2, by = VH - 52;
      PH.Paper.panel(ctx, bx - 10, by - 8, bw + 20, bh + 16, { fill: '#FCF6E6', fill2: '#EDE0C4', seed: 33, shadowAlpha: 0.3, blur: 10 });
      ctx.save();
      ctx.fillStyle = 'rgba(60,40,25,0.18)';
      ctx.fillRect(bx, by, bw, bh);
      const ratio = Math.max(0, b.hp / b.maxHp);
      const grd = ctx.createLinearGradient(bx, by, bx + bw, by);
      grd.addColorStop(0, '#E2574C');
      grd.addColorStop(1, '#C8443A');
      ctx.fillStyle = grd;
      ctx.fillRect(bx, by, bw * ratio, bh);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx, by, bw * ratio, bh * 0.4);
      ctx.globalAlpha = 1;
      ctx.restore();
      PH.Paper.text(ctx, b.name, VW / 2, by + 19, {
        size: 16,
        align: 'center',
        color: '#FDF6E3',
        weight: '800',
      });
      // 阶段点
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.globalAlpha = i < 4 - b.phase ? 1 : 0.3;
        PH.Paper.icon(ctx, 'star', bx + bw + 22, by + bh / 2 - 12 + i * 12, 9, '#E2A93B');
        ctx.restore();
      }
    }

    // 开场横幅
    drawLevelBanner(w);

    // 提示气泡
    const hint = (w.def.hints || []).find((h) => Math.abs(p.cx - h.x * T) < 200 && !(w.seenHints && w.seenHints[h.text]));
    if (hint) {
      w.seenHints = w.seenHints || {};
      w.seenHints[hint.text] = true;
      w.toast(hint.text);
    }

    // toast
    w.toasts.forEach((t, i) => {
      const a = Math.min(1, t.t * 6) * Math.min(1, (t.life - t.t) * 3);
      ctx.save();
      ctx.globalAlpha = a;
      const tw = Math.min(560, t.text.length * 16 + 52);
      PH.Paper.panel(ctx, VW / 2 - tw / 2, 82 + i * 46, tw, 38, {
        fill: '#FDF6E3',
        fill2: '#EFE2C4',
        seed: 5,
        shadowAlpha: 0.25,
        blur: 8,
      });
      PH.Paper.text(ctx, t.text, VW / 2, 107 + i * 46, {
        size: 16,
        align: 'center',
        color: '#4A3626',
        weight: '700',
      });
      ctx.restore();
    });

    // BOSS 出场名牌
    if (w.boss && w.boss.intro > 0) {
      const a = Math.min(1, (2.2 - w.boss.intro) * 2.5);
      ctx.save();
      ctx.globalAlpha = a;
      const bg = ctx.createLinearGradient(0, 60, 0, 190);
      bg.addColorStop(0, 'rgba(30,20,16,0)');
      bg.addColorStop(0.3, 'rgba(30,20,16,0.55)');
      bg.addColorStop(0.7, 'rgba(30,20,16,0.55)');
      bg.addColorStop(1, 'rgba(30,20,16,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 60, VW, 130);
      PH.Paper.text(ctx, w.boss.name, VW / 2, 138, {
        size: 62,
        align: 'center',
        color: '#FDF6E3',
        font: PH.Fonts.hand,
        weight: '900',
        outline: 'rgba(200,68,58,0.9)',
        outlineW: 10,
      });
      PH.Paper.text(ctx, '—— 出来挡路了 ——', VW / 2, 174, {
        size: 16,
        align: 'center',
        color: 'rgba(253,246,227,0.75)',
      });
      ctx.restore();
    }
  }

  /* ---------------- 场景：游戏 ---------------- */
  function updatePlay(dt) {
    const w = G.world;
    if (!w) return;
    if (Input.pressed('pause') && !w.won && !w.player.dead) {
      PH.Audio.sfx('pause');
      setState('pause');
      return;
    }
    if (Input.pressed('mute')) {
      const on = PH.Audio.toggleMute();
      w.toast(on ? '声音开' : '已静音');
    }
    w.update(dt);

    if (w.won && w.clearT > 1.3) {
      if (w.duel) {
        finishDuel();
        return;
      }
      if (w.online) {
        finishOnline();
        return;
      }
      if (G.challenge) {
        finishChallenge();
        return;
      }
      Save.cleared[G.levelId] = true;
      const idx = PH.LEVEL_ORDER.indexOf(G.levelId);
      Save.unlocked = Math.max(Save.unlocked, Math.min(PH.LEVEL_ORDER.length, idx + 2));
      Save.best = Save.best || {};
      const prevBest = Save.best[G.levelId];
      const used = Math.round(w.def.time - w.timeLeft);
      if (!prevBest || w.score > prevBest.score) {
        Save.best[G.levelId] = { score: w.score, coins: w.player.coins, time: used };
      }
      Save.save();
      if (PH.Hub && PH.Hub.pushSave) PH.Hub.pushSave(Save.snapshot());
      G.lastStats = {
        coins: w.player.coins,
        total: w.totalCoins,
        score: w.score,
        time: w.def.time - w.timeLeft,
        id: G.levelId,
      };
      if (G.levelId === '2-B') {
        G.victoryT = 0;
        setState('victory');
      } else setState('clear');
      return;
    }
    // 倒下 0.9 秒后：扣命 → 变泡泡，或者直接出局
    for (const pl of w.players) {
      if (pl.dead && !pl.bubbled && !pl.eliminated && pl.deadT > 0.9) w.downPlayer(pl);
    }
    if (w.failed) {
      failLevel();
      return;
    }
  }

  function drawPlay(dt) {
    G.world.draw();
    drawHUD(dt);
  }

  /* ---------------- 暂停 / 结算 ---------------- */
  function drawPause(dt) {
    G.world.draw();
    drawHUD(dt);
    ctx.fillStyle = 'rgba(30,20,16,0.55)';
    ctx.fillRect(0, 0, VW, VH);

    const w = 704, h = 428, x = (VW - w) / 2, y = (VH - h) / 2;
    PH.Paper.stackPanel(ctx, x, y, w, h, { fill: '#FCF6E6', fill2: '#EFE2C4', seed: 17, shadowAlpha: 0.55 });
    PH.Paper.tape(ctx, x + 42, y + 2, 100, -0.22);
    PH.Paper.tape(ctx, x + w - 152, y + 4, 96, 0.18);

    /* ---- 左：菜单 ---- */
    const lc = x + 152;
    PH.Paper.text(ctx, '暂停一下', lc, y + 66, {
      size: 33,
      align: 'center',
      color: '#3A2A1E',
      font: PH.Fonts.hand,
      weight: '900',
    });
    PH.Paper.text(ctx, '喘口气，顺便记记键位', lc, y + 86, {
      size: 12,
      align: 'center',
      color: 'rgba(90,70,50,.58)',
    });

    G.buttons = [];
    const bx = x + 30, bw2 = 244, bh2 = 46;
    addBtn('resume', bx, y + 104, bw2, bh2, '继续游戏', () => setState('play'), { color: '#FFF3D0', size: 21 });
    const onlineRace = !!(PH.G.world && PH.G.world.online);
    if (onlineRace) {
      addBtn('toRoom', bx, y + 156, bw2, bh2, '回到联机房间', () => {
        PH.leaveOnlineRace(true);
        PH.Online.open();
      }, { color: '#F3EBFB', size: 17, textColor: '#6B4A96' });
    } else {
      addBtn('retry', bx, y + 156, bw2, bh2, '重新开始', () => {
        G.world = null;
        startLevel(G.levelId);
      }, { color: '#F6EEDC', size: 20 });
    }
    if (onlineRace) {
      addBtn('acc', bx, y + 208, bw2, bh2, '档案 · ' + (PH.Profiles ? PH.Profiles.name() : '玩家'), () => PH.Account.open(), { color: '#F6EEDC', size: 17 });
    } else {
      const halfW = (bw2 - 8) / 2;
      addBtn('acc', bx, y + 208, halfW, bh2, '档案', () => PH.Account.open(), { color: '#F6EEDC', size: 18 });
      addBtn('skins', bx + halfW + 8, y + 208, halfW, bh2, '角色', () => PH.Skins.open(), {
        color: '#F3EBFB', size: 18, textColor: '#6B4A96', accent: 'rgba(139,119,201,0.5)',
      });
    }
    addBtn('sound', bx, y + 260, bw2, bh2, (PH.Audio.muted ? '声音：已关' : '声音：开'), () => {
      PH.Audio.toggleMute();
    }, { color: (PH.Audio.muted ? '#EFE6D2' : '#EAF6E4'), size: 19, textColor: (PH.Audio.muted ? '#7A6650' : '#2F6B33') });
    const pauseBack = G.challenge ? 'challenge' : 'select';
    const pauseLabel = onlineRace ? '退出这场比赛' : G.world && G.world.duel ? '返回赛道列表' : G.challenge ? '返回挑战列表' : '返回选关';
    if (onlineRace) {
      addBtn('quit', bx, y + 312, bw2, bh2, pauseLabel, () => {
        PH.leaveOnlineRace(true);
        PH.Online.open();
      }, { color: '#FBE3DC', size: 18, textColor: '#8E2F26' });
    } else {
      addBtn('quit', bx, y + 312, bw2, bh2, pauseLabel, () => setState(pauseBack), { color: '#F6EEDC', size: 18 });
    }

    addBtn('aboutPause', bx, y + 364, bw2, 32, '更新日志 · 创作者名单', () => PH.About.open('log'), {
      color: '#FDF1DD', size: 13.5, textColor: '#8A5A16', accent: 'rgba(214,150,50,0.45)',
    });
    PH.Paper.text(ctx, '按 Esc / P 也能直接继续', lc, y + h - 10, {
      size: 11.5,
      align: 'center',
      color: 'rgba(90,70,50,.48)',
    });

    /* ---- 中间虚线 ---- */
    ctx.save();
    ctx.strokeStyle = 'rgba(90,70,50,0.26)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x + 302, y + 32);
    ctx.lineTo(x + 302, y + h - 32);
    ctx.stroke();
    ctx.restore();

    /* ---- 右：键位 ---- */
    const kx = x + 330;
    const rows = HELP;
    const gapY = 29;
    const ry0 = y + 92;

    PH.Paper.text(ctx, '键位', kx + 4, y + 56, { size: 17, color: '#6B5136', weight: '800' });
    PH.Paper.text(ctx, '键盘', kx + w - 330 - 26, y + 56, {
      size: 11,
      align: 'right',
      color: 'rgba(90,70,50,.45)',
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(200,68,58,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(kx + 4, y + 64);
    ctx.lineTo(kx + 44, y + 64);
    ctx.stroke();
    ctx.restore();

    rows.forEach((row, i) => {
      const ry = ry0 + i * gapY;
      if (i % 2 === 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(60,45,30,0.055)';
        ctx.fillRect(kx - 2, ry - 17, w - 352, Math.min(gapY - 3, 26));
        ctx.restore();
      }
      PH.Paper.text(ctx, row[0], kx + 6, ry, {
        size: 12.5,
        color: '#C8443A',
        weight: '700',
        font: PH.Fonts.mono,
      });
      // 手绘引导虚线
      ctx.save();
      ctx.font = '700 12.5px ' + PH.Fonts.mono;
      const kw = ctx.measureText(row[0]).width;
      ctx.restore();
      const fx = kx + 6 + kw + 9;
      const tx2 = kx + 118;
      if (tx2 > fx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(120,100,80,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([1.5, 3.5]);
        ctx.beginPath();
        ctx.moveTo(fx, ry - 4);
        ctx.lineTo(tx2, ry - 4);
        ctx.stroke();
        ctx.restore();
      }
      PH.Paper.text(ctx, row[1], kx + 130, ry, {
        size: 14,
        color: '#4A3626',
      });
    });

    PH.Paper.text(ctx, isTouchUI() ? '手机上用屏幕按键，效果一样' : '小提示：站敌人头上能踩扁它', kx + 6, y + h - 24, {
      size: 11.5,
      color: 'rgba(90,70,50,.5)',
    });

    if (Input.pressed('pause')) setState('play');
  }

  function drawClear(dt) {
    G.world.draw();
    ctx.fillStyle = 'rgba(30,20,16,0.5)';
    ctx.fillRect(0, 0, VW, VH);
    const st = G.lastStats || { coins: 0, total: 0, score: 0, time: 0 };
    const w = 520, h = 380, x = (VW - w) / 2, y = (VH - h) / 2;
    PH.Paper.stackPanel(ctx, x, y, w, h, { fill: '#FCF6E6', fill2: '#EFE2C4', seed: 23, shadowAlpha: 0.55 });
    PH.Paper.stamp(ctx, VW / 2 + 150, y + 54, '通关', -0.18, 0.8);
    PH.Paper.text(ctx, '这一关过了！', VW / 2 - 110, y + 86, {
      size: 40,
      align: 'center',
      color: '#3A2A1E',
      font: PH.Fonts.hand,
      weight: '900',
    });
    const rows = [
      ['金币', st.coins + ' / ' + st.total],
      ['得分', '' + st.score],
      ['用时', U.fmtTime(st.time)],
    ];
    rows.forEach((r, i) => {
      PH.Paper.text(ctx, r[0], x + 90, y + 150 + i * 40, { size: 20, color: '#6B5136' });
      PH.Paper.text(ctx, r[1], x + w - 90, y + 150 + i * 40, { size: 22, align: 'right', color: '#3A2A1E', weight: '800' });
    });
    // 星星
    const stars = st.coins >= st.total * 0.8 ? 3 : st.coins >= st.total * 0.45 ? 2 : 1;
    for (let i = 0; i < 3; i++) {
      PH.Paper.icon(ctx, 'star', VW / 2 - 46 + i * 46, y + 288, 30, i < stars ? '#E2A93B' : 'rgba(120,100,80,0.22)');
    }

    G.buttons = [];
    const idx = PH.LEVEL_ORDER.indexOf(st.id);
    const nextId = PH.LEVEL_ORDER[idx + 1];
    if (nextId) {
      addBtn('next', VW / 2 - 160, y + h - 78, 180, 54, '下一关', () => startLevel(nextId), { color: '#FFF3D0', size: 22 });
      addBtn('sel', VW / 2 + 30, y + h - 78, 130, 54, '选关', () => setState('select'), { size: 18 });
    } else {
      addBtn('sel', VW / 2 - 130, y + h - 78, 260, 54, '返回选关', () => setState('select'), { size: 20 });
    }
  }

  function drawGameOver(dt) {
    G.world.draw();
    ctx.fillStyle = 'rgba(40,18,14,0.62)';
    ctx.fillRect(0, 0, VW, VH);
    const w = 460, h = 300, x = (VW - w) / 2, y = (VH - h) / 2;
    PH.Paper.stackPanel(ctx, x, y, w, h, { fill: '#FBF1DE', fill2: '#EBDCC0', seed: 29, shadowAlpha: 0.5 });
    const timeUp = G.challenge && G.world && G.world.timeUp;
    PH.Paper.text(ctx, timeUp ? '时间到！' : G.challenge ? '挑战失败' : '被纸片打败了', VW / 2, y + 92, {
      size: timeUp ? 42 : 38,
      align: 'center',
      color: timeUp ? '#C8443A' : '#3A2A1E',
      font: PH.Fonts.hand,
      weight: '900',
    });
    PH.Paper.text(ctx, timeUp ? '差一点点，再快一些。' : G.challenge ? '被纸片打败了，计时赛可没有存档点。' : '别灰心，再来一次。', VW / 2, y + 128, {
      size: G.challenge ? 15 : 16,
      align: 'center',
      color: 'rgba(90,70,50,.7)',
    });
    G.buttons = [];
    addBtn('retry', VW / 2 - 150, y + 164, 300, 52, '再来一次', () => restartLevel(), { color: '#FFF3D0' });
    addBtn('sel', VW / 2 - 150, y + 226, 300, 46, G.challenge ? '返回挑战列表' : '返回选关', () => setState(G.challenge ? 'challenge' : 'select'), { size: 19 });
  }

  function drawVictory(dt) {
    G.victoryT += dt;
    const t = G.victoryT;
    PH.Paper.drawBackdrop(ctx, 'meadow', 260 + t * 6, 0, t, 9999);

    // 纸山坡
    ctx.save();
    const hg = ctx.createLinearGradient(0, 430, 0, 544);
    hg.addColorStop(0, '#9BC873');
    hg.addColorStop(1, '#78A852');
    ctx.fillStyle = hg;
    PH.Paper.hillPath(ctx, VW, 544, 488, 46, 8, 260);
    ctx.fill();
    ctx.restore();

    // 彩纸
    if (!G.confetti) G.confetti = [];
    if (Math.random() < 0.6) {
      G.confetti.push({
        x: U.rnd(0, VW), y: -20, vx: U.rnd(-30, 30), vy: U.rnd(60, 160),
        rot: U.rnd(0, 6), vr: U.rnd(-5, 5), s: U.rnd(4, 9),
        c: U.pick(['#E2574C', '#F2C14E', '#7FB63F', '#5C9BD1', '#B57FC8', '#FDF6E3']),
        life: 9,
      });
    }
    for (const p2 of G.confetti) {
      p2.x += p2.vx * dt;
      p2.y += p2.vy * dt;
      p2.rot += p2.vr * dt;
      p2.vy += 8 * dt;
      p2.life -= dt;
    }
    G.confetti = G.confetti.filter((p2) => p2.life > 0 && p2.y < VH + 30);
    for (const p2 of G.confetti) {
      ctx.save();
      ctx.translate(p2.x, p2.y);
      ctx.rotate(p2.rot);
      ctx.fillStyle = p2.c;
      ctx.fillRect(-p2.s / 2, -p2.s / 2, p2.s, p2.s * 0.66);
      ctx.restore();
    }

    // 主角与小伴站在坡上
    const s = PH.Assets.sizeForH('hero', 132);
    PH.Assets.draw(ctx, 'hero', VW / 2 - 96 - s.w / 2, 404 + Math.sin(t * 2) * 3, s.w, s.h, { shadow: true });
    const b = PH.Assets.sizeForH('buddy', 108);
    PH.Assets.draw(ctx, 'buddy', VW / 2 + 96 - b.w / 2, 432 + Math.sin(t * 2 + 1) * 4, b.w, b.h, { flip: true });

    PH.Paper.text(ctx, '全部通关！', VW / 2, 176, {
      size: 74,
      align: 'center',
      color: '#FDF6E3',
      font: PH.Fonts.hand,
      weight: '900',
      outline: '#C8443A',
      outlineW: 16,
    });
    PH.Paper.text(ctx, '红肠王国恢复了平静，纸片们又能好好晒太阳了。', VW / 2, 226, {
      size: 18,
      align: 'center',
      color: '#3A2A1E',
    });
    ctx.save();
    PH.Paper.panel(ctx, VW / 2 - 120, 248, 240, 46, { fill: '#FDF6E3', fill2: '#F0E3C6', seed: 41, shadowAlpha: 0.22, blur: 8 });
    PH.Paper.text(ctx, '总得分  ' + G.world.score, VW / 2, 278, {
      size: 21,
      align: 'center',
      color: '#6B5136',
      weight: '800',
    });
    ctx.restore();

    G.buttons = [];
    addBtn('back', VW / 2 - 214, 330, 200, 52, '回到标题', () => {
      G.confetti = [];
      setState('title');
    }, { color: '#FFF3D0', size: 20 });
    addBtn('toChallenge', VW / 2 + 14, 330, 200, 52, '限时挑战', () => {
      G.confetti = [];
      setState('challenge');
    }, { color: '#FBE3D2', size: 20, textColor: '#8E2F26' });
  }

  PH.startLevel = startLevel;
  PH.World = World;
  PH.setState = setState;
  PH.allCleared = () => PH.LEVEL_ORDER.every((id) => !!Save.cleared[id]);
  PH.challengeUnlocked = () => PH.allCleared();
  PH.getChallengeBest = (id) => (Save.challenge && Save.challenge[id]) || null;

  // 双人竞速结算
  function finishDuel() {
    const w = G.world;
    if (!w || w.duelDone) return;
    w.duelDone = true;
    const winner = w.winner || w.players[0];
    const loser = w.players.find((p) => p !== winner) || w.players[1];
    G.lastDuel = {
      id: G.levelId,
      winnerTag: winner.tag,
      winnerColor: winner.color,
      loserTag: loser.tag,
      time: w.duelTime,
      gap: Math.max(0, Math.round((w.goal.x - loser.cx) / 32)),
      p1: w.players[0].tag,
      p2: w.players[1].tag,
    };
    const lowLives = Math.min.apply(null, w.players.map((p) => p.lives));
    Save.lives = Math.max(0, lowLives);
    Save.save();
    G.duelT = 0;
    PH.Audio.sfx('clear');
    setState('duelClear');
  }

  /* ---------------- 联机竞速 ---------------- */

  // 名次：先按完赛时间，再按进度
  function onlineStandings(w) {
    const start = w.def.start.x * T;
    const goal = w.goal ? w.goal.x : w.level.w * T;
    const span = Math.max(1, goal - start);
    const rows = [
      {
        id: PH.Net.myId || 'me',
        name: (PH.Profiles && PH.Profiles.name()) || '你',
        color: '#E2574C',
        me: true,
        pct: U.clamp((w.player.cx - start) / span, 0, 1),
        hp: w.player.hp,
        maxHp: w.player.maxHp,
        finished: !!w.won,
        time: w.won ? w.raceTime : null,
      },
    ];
    for (const g of w.ghosts.values()) {
      rows.push({
        id: g.id,
        name: g.name,
        color: g.color,
        me: false,
        gone: !!g.gone,
        pct: U.clamp((g.x + 13 - start) / span, 0, 1),
        hp: typeof g.hp === 'number' ? g.hp : 3,
        maxHp: g.maxHp || 3,
        finished: !!g.finished,
        time: g.finished ? g.time : null,
      });
    }
    rows.sort((a, b) => {
      if (a.finished && b.finished) return a.time - b.time;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.pct - a.pct;
    });
    return rows;
  }

  function finishOnline() {
    const w = G.world;
    if (!w || w.onlineDone) return;
    w.onlineDone = true;
    w.raceTime = Math.max(0.1, w.raceTime);
    PH.Net.relay({ k: 'fin', t: Math.round(w.raceTime * 10) / 10 });
    PH.Audio.sfx('clear');
    G.onlineT = 0;
    setState('onlineClear');
  }

  // 收到别人的联机消息
  PH.onlinePeerMsg = function (from, d) {
    const w = G.world;
    if (!d || !w || !w.online) return;
    if (d.k === 'st') {
      let g = w.ghosts.get(from);
      if (!g) {
        g = {
          id: from,
          name: PH.Net.nameOf(from),
          color: PH.Net.colorOf(from),
          w: 26,
          h: 56,
          x: d.x,
          y: d.y,
          tx: d.x,
          ty: d.y,
          facing: d.f || 1,
          pose: d.po || 'idle',
          spr: PH.Net.skinOf(from),
          animT: 0,
          hp: 3,
          maxHp: 3,
          bubbled: false,
          finished: false,
          time: null,
          draw: drawGhostSprite,
        };
        w.ghosts.set(from, g);
      }
      g.tx = d.x;
      g.ty = d.y;
      g.facing = d.f || 1;
      g.pose = d.po || 'idle';
      if (typeof d.hp === 'number') g.hp = Math.max(0, d.hp);
      if (typeof d.mx === 'number') g.maxHp = Math.max(1, d.mx);
      g.bubbled = !!d.bub;
      g.air = !!d.air;
      if (!g.bubbled) g.rescueSent = false;
      g.lastSeen = G.stateT;
    } else if (d.k === 'rescue') {
      // 有人跳起来戳破了我的泡泡
      if (!d.to || d.to !== PH.Net.myId) return;
      const b = w.player && w.player.bubble;
      if (b && !b.dead && w.player.bubbled) {
        b.pop(w, true);
        w.toast('被 ' + PH.Net.nameOf(from) + ' 救出来了！');
      }
    } else if (d.k === 'fin') {
      const g = w.ghosts.get(from);
      if (g) {
        g.finished = true;
        g.time = d.t;
      }
    } else if (d.k === 'quit') {
      const g = w.ghosts.get(from);
      if (g) g.gone = true;
    }
  };

  // 有人退房：把幽灵也撤掉
  PH.onlinePeersChanged = function () {
    const w = G.world;
    if (!w || !w.online) return;
    const ids = PH.Net.players.map((p) => p.id);
    for (const id of Array.from(w.ghosts.keys())) {
      if (ids.indexOf(id) < 0) w.ghosts.delete(id);
    }
  };

  PH.startOnlineRace = function (id) {
    if (!PH.Levels[id]) return;
    G.mode = 'online';
    G.onlineT = 0;
    startLevel(id);
  };

  // 离开联机（回标题 / 回房间）
  PH.leaveOnlineRace = function (stayInRoom) {
    const w = G.world;
    if (w && w.online && !w.onlineDone) PH.Net.relay({ k: 'quit' });
    if (!stayInRoom) PH.Net.leave();
    G.mode = 'single';
    G.world = null;
    // 直接切场景：淡出期间还在暂停界面画 world 会空指针
    setState('title', true);
  };

  // 限时挑战通关：记录用时
  function finishChallenge() {
    const w = G.world;
    if (!w || w.challengeDone) return; // 转场淡出期间会被重复调用
    w.challengeDone = true;
    const id = G.challenge;
    const used = Math.max(0.1, w.def.time - w.timeLeft);
    const prev = (Save.challenge && Save.challenge[id]) || null;
    const isBest = !prev || used < prev.time;
    if (isBest) {
      Save.challenge = Save.challenge || {};
      Save.challenge[id] = { time: used, score: w.score };
      Save.save();
      if (PH.Hub && PH.Hub.pushSave) PH.Hub.pushSave(Save.snapshot());
    }
    G.lastChallenge = {
      id,
      used,
      best: Math.min(used, prev ? prev.time : used),
      isBest,
      prev: prev ? prev.time : null,
      limit: w.def.time,
      score: w.score,
      coins: w.player.coins,
      total: w.totalCoins,
    };
    G.challengeT = 0;
    setState('challengeClear');
  }

  // 把本机服务上的存档并进当前档案（取并集 / 更高分 / 更快）
  function mergeSaveData(cloud) {
    if (!cloud) return false;
    let changed = false;
    const un = cloud.unlocked | 0;
    if (un > Save.unlocked) {
      Save.unlocked = Math.min(PH.LEVEL_ORDER.length, un);
      changed = true;
    }
    const c = cloud.cleared || {};
    for (const k in c) if (c[k] && !Save.cleared[k]) { Save.cleared[k] = true; changed = true; }
    const b = cloud.best || {};
    Save.best = Save.best || {};
    for (const k in b) {
      const prev = Save.best[k];
      if (!prev || (b[k] && b[k].score) > (prev.score || 0)) { Save.best[k] = b[k]; changed = true; }
    }
    const ch = cloud.challenge || {};
    Save.challenge = Save.challenge || {};
    for (const k in ch) {
      const prev = Save.challenge[k];
      if (!prev || (ch[k] && ch[k].time < prev.time)) { Save.challenge[k] = ch[k]; changed = true; }
    }
    if (changed) Save.save();
    return changed;
  }

  // 切换 / 新建 / 改名 / 删除档案后：把存档指针换成新档案
  PH.applyProfile = function (kind) {
    Save.load();
    if (kind === 'remove' || kind === 'switch') {
      // 关卡选择的解锁状态、挑战成绩都会跟着变，正在玩的关卡保持不动
      if (G.world && G.state === 'play') G.world.toast('已切换到「' + PH.Profiles.name() + '」的进度');
    }
    if (kind === 'new') {
      if (G.world && G.state === 'play') G.world.toast('新档案「' + PH.Profiles.name() + '」已就位');
    }
  };

  /* ---------------- 主循环 ---------------- */
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 120;

  function frame(now) {
    const raw = Math.min(0.1, (now - last) / 1000);
    last = now;
    let dt = raw;
    G.stateT += dt;
    updateFade(dt);

    // 更新
    if (G.state !== 'boot') {
      if (G.state === 'play') {
        acc += dt;
        let guard = 0;
        while (acc >= STEP && guard++ < 8) {
          updatePlay(STEP);
          acc -= STEP;
          if (G.state !== 'play') break;
        }
      } else if (G.state === 'pause') {
        if (Input.pressed('pause')) setState('play');
      }
    }

    // 绘制
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    G.buttons = [];
    switch (G.state) {
      case 'boot':
        ctx.fillStyle = '#F6EFDD';
        ctx.fillRect(0, 0, VW, VH);
        break;
      case 'title':
        drawTitle(dt);
        break;
      case 'select':
        G.titleT += dt;
        drawSelect(dt);
        break;
      case 'challenge':
        G.titleT += dt;
        drawChallenge(dt);
        break;
      case 'challengeClear':
        drawChallengeClear(dt);
        break;
      case 'duelClear':
        drawDuelClear(dt);
        break;
      case 'onlineClear':
        drawOnlineClear(dt);
        break;
      case 'levelFail':
        drawLevelFail(dt);
        break;
      case 'help':
        G.titleT += dt;
        drawHelp(dt);
        break;
      case 'play':
        drawPlay(raw);
        break;
      case 'pause':
        drawPause(dt);
        break;
      case 'clear':
        drawClear(dt);
        break;
      case 'gameover':
        drawGameOver(dt);
        break;
      case 'victory':
        drawVictory(dt);
        break;
    }

    document.body.classList.toggle('playing', G.state === 'play');

    if (G.state !== 'pause' && G.state !== 'play') drawButtons(dt);
    else if (G.state === 'pause') drawButtons(dt);

    // 转场遮罩
    if (G.fade > 0) {
      ctx.save();
      ctx.globalAlpha = G.fade;
      ctx.fillStyle = '#F6EFDD';
      ctx.fillRect(0, 0, VW, VH);
      // 撕纸边
      ctx.globalAlpha = G.fade * 0.22;
      ctx.fillStyle = '#3A2A1E';
      for (let i = 0; i < 22; i++) {
        const x = (i / 22) * VW;
        const hh = 3 + ((i * 37) % 7);
        ctx.fillRect(x, VH - hh, VW / 22 + 1, hh);
      }
      ctx.restore();
    }

    Input.endFrame();
    requestAnimationFrame(frame);
  }

  /* ---------------- 启动：联机 / 账号 ---------------- */
  function bootHub() {
    if (!PH.Hub) return;
    PH.Hub.boot().then(async () => {
      // 账号可能刚绑到同名档案上，重新读一次进度
      if (PH.applyProfile) PH.applyProfile('switch');
      // 游戏厅门禁只关系「有没有账号可以同步云存档」，不阻断游戏本身：
      // 拿着固定网址 / 邀请链接进来的手机、平板、别的电脑，只要服务器开着就得能联机，
      // 不能被「没登录 / 没邀请码 / 不在开放时间」踢回游戏厅首页。
      PH.Hub.gate = PH.Hub.gateCode();
      // 邀请链接（?server=…&room=…）：服务器探活完成后自动打开联机面板并进房
      if (PH.Online && PH.Online.consumeInvite) PH.Online.consumeInvite();
      if (PH.Hub.useAccount()) {
        const cloud = await PH.Hub.pullSave();
        if (!cloud) return;
        // 账号档案可能刚被切过去，先按当前档案加载再合并
        Save.load();
        if (mergeSaveData(cloud)) {
          if (G.world) G.world.toast('账号存档已同步');
        }
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    const loader = document.getElementById('loader');
    const fill = document.getElementById('barfill');
    PH.Assets.load((d, total) => {
      if (fill) fill.style.width = Math.round((d / total) * 100) + '%';
    }).then(() => {
      // 预生成当前主题纹理
      PH.Paper.tilesFor('meadow');
      PH.Paper.getBg('meadow');
      if (loader) {
        loader.classList.add('hide');
        setTimeout(() => loader.remove(), 600);
      }
      setState('title', true);
      PH.Audio.init();
      bootHub();
    });
    requestAnimationFrame(frame);
  }

  window.addEventListener('pointerdown', () => {
    PH.Audio.init();
    PH.Audio.resume();
  });

  boot();
})(window.PH);
