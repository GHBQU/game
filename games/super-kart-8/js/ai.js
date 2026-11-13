/* ============================================================
   Super Kart 8 — ai.js
   AI 车手：速度剖面 / 走线跟随 / 弯道漂移 / 金币与道具箱 / 道具决策
   ------------------------------------------------------------
   1. 赛道预计算「曲率限速 + 反向制动」的速度剖面，弯前就收油。
   2. 转向 = 前视点追踪 + 曲率前馈 + 边缘回打（沿用已验证的控制器）。
   3. 弯道主动漂移攒迷你涡轮：入弯锁定方向，出弯释放，弯中按
      需要的横摆角速度反解漂移摇杆量，转不过来就立刻收漂。
   4. 会主动吃金币（每枚 +1.1% 极速）与道具箱，开局有火箭起步。
   5. 难度只映射为「极速 / 弯道 / 漂移积极性 / 反应」，领先时不再自废武功。
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;

  /* 为赛道生成赛车线（按曲率取内线，平滑过渡） */
  function buildRacingLine(track) {
    if (track._racingLine) return track._racingLine;
    const N = track.count;
    let off = new Array(N);
    for (let i = 0; i < N; i++) {
      const s = track.samples[i];
      const k = U.clamp(s.kSigned * 55, -1, 1);
      off[i] = k * s.width * 0.3;
    }
    for (let pass = 0; pass < 14; pass++) {
      const next = off.slice();
      for (let i = 0; i < N; i++) {
        next[i] = (off[(i - 1 + N) % N] * 0.5 + off[i] + off[(i + 1) % N] * 0.5) / 2;
      }
      off = next;
    }
    track._racingLine = off;
    return off;
  }

  /* 赛道速度剖面：每个采样点的“能安全通过的速度”
     grip 为允许的侧向加速度，decel 为刹车减速度 */
  function buildSpeedProfile(track) {
    if (track._speedProfile) return track._speedProfile;
    const N = track.count;
    const ds = track.spacing;
    const grip = 27.0;
    const decel = 30.0;
    const v = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = Math.abs(track.samples[i].kSigned);
      v[i] = Math.min(72, Math.sqrt(grip / Math.max(0.0011, k)));
    }
    // 反向传播：保证每个点都来得及刹到下一个点
    for (let pass = 0; pass < 3; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const nx = v[(i + 1) % N];
        const cap = Math.sqrt(nx * nx + 2 * decel * ds);
        if (v[i] > cap) v[i] = cap;
      }
    }
    // 轻度平滑，避免目标速度锯齿
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const avg = (v[(i - 1 + N) % N] + v[i] * 2 + v[(i + 1) % N]) * 0.25;
      out[i] = Math.min(v[i], avg);
    }
    track._speedProfile = out;
    return out;
  }

  /* 采样平均曲率（用于漂移决策） */
  function curvatureAhead(track, s, dist) {
    const N = track.count;
    const step = track.spacing;
    let sum = 0, cnt = 0;
    for (let d = 0; d < dist; d += step * 3) {
      const i = Math.floor(U.mod(s + d, track.length) / step) % N;
      sum += track.samples[i].kSigned;
      cnt++;
    }
    return sum / Math.max(1, cnt);
  }

  /* 难度 → 参数（键为菜单里的 data-diff）
     mul     基础极速倍率（AI 还会自己吃金币 +11%，所以 1.09 实际是 +21%）
     corner  弯道速度剖面倍率
     start   掐秒火箭起步成功率
     catch   落后时最多再叠加的极速（橡皮筋追击）
     lift    领先时最多收掉的极速（橡皮筋让位）
     pick    会主动抢金币 / 加速带 / 道具箱的车手比例
     item    用道具前的犹豫时间倍率（越大越迟钝）
     power   AI 开出「翻盘级道具」（三连蘑菇/星星/闪电/炮弹）的权重系数；
             玩家恒为 1，完整享受落后补偿。原作里 CPU 也几乎拿不到这些道具。
     设计目标：普通难度下「不失误的熟练玩家」能稳定赢，困难/专家仍有压力。 */
  const TUNE = {
    0.8:  { mul: 0.88, corner: 0.88, react: 0.95, start: 0.15, catch: 0.03, lift: 0.12, pick: 0.55, item: 2.20, power: 0.25 },
    1:    { mul: 0.93, corner: 0.92, react: 0.75, start: 0.35, catch: 0.05, lift: 0.08, pick: 0.75, item: 1.60, power: 0.45 },
    1.12: { mul: 1.00, corner: 0.97, react: 0.55, start: 0.65, catch: 0.08, lift: 0.05, pick: 0.90, item: 1.20, power: 0.70 },
    1.25: { mul: 1.08, corner: 1.02, react: 0.38, start: 0.90, catch: 0.11, lift: 0.02, pick: 1.00, item: 0.90, power: 1.00 }
  };
  function tuneFor(d) {
    let best = TUNE[1], bd = 1e9;
    for (const k in TUNE) {
      const dd = Math.abs(parseFloat(k) - d);
      if (dd < bd) { bd = dd; best = TUNE[k]; }
    }
    return best;
  }

  const _v = new THREE.Vector3();

  class AIDriver {
    constructor(kart, track, difficulty, seed) {
      this.kart = kart;
      this.track = track;
      this.line = buildRacingLine(track);
      this.profile = buildSpeedProfile(track);
      this.diff = difficulty || 1;
      const t = tuneFor(this.diff);
      this.tune = t;
      this.rng = U.RNG(seed || 1234);
      this.speedMul = t.mul * this.rng.range(0.995, 1.012);
      this.cornerMul = t.corner * this.rng.range(0.99, 1.015);
      this.reaction = t.react;
      this.reverseTimer = 0;
      this.stuckTimer = 0;
      // 低难度里有一部分车手不去抢金币 / 加速带 / 道具箱（各自固定，不会逐帧抖动）
      this.noPick = this.rng.next() > t.pick;
      this.itemDelayScale = t.item;
      this.itemPower = (t.power === undefined) ? 1 : t.power;
      this.itemTimer = 0.6;
      this.itemDelay = this.rng.range(0.4, 1.8) * this.itemDelayScale;
      this.lineBias = this.rng.range(-0.7, 0.7);
      this.aggression = this.rng.range(0.5, 1.0) * this.diff;
      this.avoidTimer = 0;
      this.avoidDir = 0;
      this.coinTimer = 0;
      this.startBoosted = false;
      this.ctrlDamp = 1.8;
      this.laMul = 0.30;
    }

    lineAt(s) {
      const N = this.track.count;
      const i = Math.floor(U.mod(s, this.track.length) / this.track.spacing) % N;
      return this.line[i];
    }

    profileAt(s) {
      const N = this.track.count;
      const i = Math.floor(U.mod(s, this.track.length) / this.track.spacing) % N;
      return this.profile[i];
    }

    /* 开局火箭起步：由 game.js 在 GO 的瞬间调用 */
    rollStartBoost() {
      if (this.startBoosted) return false;
      if (this.rng.next() > this.tune.start) return false;
      this.startBoosted = true;
      return true;
    }

    update(dt, race) {
      const kart = this.kart;
      const track = this.track;
      const input = { accel: 1, brake: 0, steer: 0, drift: false, item: false, lookBack: false };

      if (kart.bulletTime > 0 || kart.rescueActive) { kart.aiSpeedBonus = this.speedMul - 1; return input; }
      if (kart.finished && race && race.state === 'finished') input.accel = 0.45;

      const s = kart.lastS;
      const speed = Math.abs(kart.speed);
      const proj = track.project(kart.pos, kart.hint);
      const halfW = proj.halfWidth;
      const latNow = proj.lateral;
      const offroad = Math.abs(latNow) > halfW - 1.0;

      /* --- 难度 / 橡皮筋：落后才加把劲，领先就收油让位 --- */
      let bonus = this.speedMul - 1;
      if (race && race.state === 'racing' && race.player && !kart.finished) {
        const gap = kart.totalDist - race.player.totalDist;
        if (gap < -40) bonus += Math.min(this.tune.catch, (-gap - 40) / 700);
        else if (gap > 120) bonus -= Math.min(this.tune.lift, (gap - 120) / 2600);
      }
      // 下限必须跟着基础倍率走，否则 mul < 0.95 时会被旧的 -0.05 钳住、难度降不下去
      kart.aiSpeedBonus = U.clamp(bonus,
        this.tune.mul - 1 - this.tune.lift - 0.01,
        this.tune.mul - 1 + this.tune.catch);

      /* --- 卡死自救 --- */
      if (speed < 2.5 && race && race.state === 'racing') this.stuckTimer += dt;
      else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 0.5);
      if (this.stuckTimer > 1.0) {
        this.reverseTimer = 0.7;
        this.stuckTimer = 0;
      }
      if (this.reverseTimer > 0) {
        this.reverseTimer -= dt;
        input.accel = 0;
        input.brake = 1;
        input.steer = Math.abs(latNow) > 1.5 ? -U.sign(latNow) : 1;
        input.drift = false;
        return input;
      }

      /* --- 目标点 --- */
      const lookAhead = 6 + speed * this.laMul;
      const sAhead = s + lookAhead;
      let latTarget = this.lineAt(sAhead) + this.lineBias * 0.5;
      const curv = curvatureAhead(track, s + 4, 26);
      latTarget += U.clamp(curv * 18, -2.6, 2.6);
      if (offroad) latTarget = latNow * 0.25;   // 复位：往赛道中央拉

      /* --- 避障（优先级最高，命中会打断吃金币） --- */
      this.avoidTimer = Math.max(0, this.avoidTimer - dt);
      let danger = null;
      if (!offroad && this.avoidTimer <= 0 && SK.game && SK.game.itemSys) {
        const items = SK.game.itemSys;
        let dangerD = 1e9;
        const check = (p) => {
          const d = _v.subVectors(p, kart.pos);
          const along = d.dot(kart.forward);
          const lateral = d.dot(proj.side);
          if (along > 1 && along < 15 && Math.abs(lateral) < 3.4) {
            if (along < dangerD) { dangerD = along; danger = lateral; }
          }
        };
        for (let i = 0; i < items.bananas.length; i++) check(items.bananas[i].pos);
        for (let i = 0; i < items.shells.length; i++) {
          if (items.shells[i].owner === kart) continue;
          check(items.shells[i].pos);
        }
        if (danger !== null) {
          this.avoidDir = danger > 0 ? -1 : 1;
          this.avoidTimer = 0.62;
        }
      }
      if (this.avoidTimer > 0) latTarget += this.avoidDir * 4.2;

      /* --- 加速带优先：能踩就一定踩（横向目标限速移动，避免画龙） --- */
      let padAim = false;
      if (!this.noPick && !offroad && this.avoidTimer <= 0) {
        let best = null, bestScore = 1e9;
        for (let i = 0; i < track.boostPads.length; i++) {
          const p = track.boostPads[i];
          const ds = U.mod(p.s - s, track.length);
          if (ds < 4 || ds > 30) continue;
          if (Math.abs(p.lat) > halfW - 1.6) continue;
          const off = Math.abs(p.lat - latTarget);
          if (off > 4.5) continue;
          const score = Math.abs(ds - 14) + off * 2.5;
          if (score < bestScore) { bestScore = score; best = p; }
        }
        if (best) {
          latTarget += U.clamp(best.lat - latTarget, -8.5 * dt, 8.5 * dt);
          padAim = true;
        }
      }

      /* --- 吃金币 / 抢道具箱：锁定前方固定距离的那一枚 --- */
      this.coinTimer = Math.max(0, this.coinTimer - dt);
      if (!this.noPick && !padAim && !offroad && this.avoidTimer <= 0 && SK.game && SK.game.itemSys) {
        const items = SK.game.itemSys;
        let want = null, bestScore = 1e9;
        const pick = (list, lookDist) => {
          for (let i = 0; i < list.length; i++) {
            const o = list[i];
            if (!o.active) continue;
            const ds = U.mod(o.s - s, track.length);
            if (ds < 4 || ds > 34) continue;
            if (Math.abs(o.lat) > halfW - 1.5) continue;
            const off = Math.abs(o.lat - latTarget);
            if (off > 4.5) continue;
            const score = Math.abs(ds - lookDist) + off * 3.0;
            if (score < bestScore) { bestScore = score; want = o; }
          }
        };
        pick(items.coins, 20);
        if (!kart.item && !kart.finished) pick(items.boxes, 18);
        if (want) latTarget += U.clamp(want.lat - latTarget, -7 * dt, 7 * dt);
      }

      /* --- 超车 / 并排避让 --- */
      let lift = 0;
      if (!offroad && race && race.karts) {
        for (let ki = 0; ki < race.karts.length; ki++) {
          const other = race.karts[ki];
          if (other === kart || other.rescueActive || other.finished) continue;
          const dx = other.pos.x - kart.pos.x, dy = other.pos.y - kart.pos.y, dz = other.pos.z - kart.pos.z;
          const along = dx * kart.forward.x + dy * kart.forward.y + dz * kart.forward.z;
          const latDiff = dx * proj.side.x + dy * proj.side.y + dz * proj.side.z;
          if (Math.abs(latDiff) > 3.2) continue;
          // 并排：轻推远离，避免互相蹭车
          if (Math.abs(along) < 4.5 && Math.abs(latDiff) < 2.6) {
            latTarget += (latDiff >= 0 ? -1 : 1) * 1.5;
            continue;
          }
          if (along < 1.0 || along > 24) continue;
          const relSpeed = kart.speed - other.speed;
          if (relSpeed < 1.2) continue;
          // 右侧与左侧的可用空间
          const roomR = halfW - 2.6 - latNow;
          const roomL = halfW - 2.6 + latNow;
          const dir = roomR > roomL ? 1 : -1;
          const push = U.clamp(2.0 + Math.abs(latDiff) + (24 - along) * 0.08, 2.0, 4.6);
          latTarget += dir * push;
          // 两边都堵死：稍微收油，别顶到人家尾翼
          if (Math.min(roomR, roomL) < 1.5 && along < 8) lift = 0.4;
        }
      }
      latTarget = U.clamp(latTarget, -halfW + 2.4, halfW - 2.4);

      /* --- 转向：纯追踪前馈 + 横摆角速度阻尼（高速不画龙） --- */
      const tgt = track.pointAt(sAhead, latTarget);
      const desired = _v.subVectors(tgt, kart.pos);
      desired.addScaledVector(kart.up, -desired.dot(kart.up)).normalize();
      const toRight = desired.dot(proj.side);
      const toFwd = desired.dot(kart.forward);
      const ang = Math.atan2(toRight, toFwd);
      const kPP = 2 * Math.sin(ang) / Math.max(3, lookAhead);
      const yawWant = speed * kPP;                       // 需要的横摆角速度（右正）
      let yawNow = 0;
      if (this._prevFwd) {
        const ax = _v.crossVectors(this._prevFwd, kart.forward);
        yawNow = -ax.dot(kart.up) / Math.max(1e-4, dt);
      }
      if (!this._prevFwd) this._prevFwd = kart.forward.clone();
      else this._prevFwd.copy(kart.forward);
      // 反重力翻滚段的 up 在旋转，横摆角速度的测量会被污染 → 只用前馈
      const rolled = Math.abs(proj.roll || 0) > 0.2;
      const yawCmd = yawWant + (rolled ? 0 : (yawWant - yawNow) * this.ctrlDamp);
      const turnMul0 = 1 - 0.26 * Math.min(1, speed / Math.max(1, kart.maxSpeed));
      let steerCmd = yawCmd / Math.max(0.2, kart.turnRate * turnMul0);
      // 靠边时强制往内打方向，避免贴墙
      const edge = Math.abs(latNow) - halfW * 0.78;
      if (edge > 0) steerCmd -= U.sign(latNow) * Math.min(0.8, edge * 0.24);
      input.steer = U.clamp(steerCmd, -1, 1);

      /* --- 速度剖面：油门 / 刹车 --- */
      const ahead = 5.5 + speed * 0.5;
      let vTarget = this.profileAt(s + ahead) * this.cornerMul;
      // 再往前多看一点，遇到更慢的弯提前收油
      const vNext = this.profileAt(s + ahead + 14) * this.cornerMul;
      if (vNext < vTarget) vTarget = vNext + 2.0;
      vTarget = Math.min(vTarget, kart.maxSpeed * (1 + kart.aiSpeedBonus) * 1.02);
      if (offroad) vTarget = Math.min(vTarget, kart.maxSpeed * 0.65);
      // 加速期间不要自己踩刹车，否则蘑菇 / 迷你涡轮全被浪费
      if (kart.boostTime > 0) {
        vTarget = Math.max(vTarget, kart.maxSpeed * (1 + kart.aiSpeedBonus) * kart.boostFactor * 0.99);
      }
      if (speed > vTarget + 2.2) {
        input.brake = U.clamp01((speed - vTarget) / 6);
        input.accel = 0;
      } else if (speed > vTarget + 0.4) {
        input.accel = 0.25;
      } else {
        input.accel = 1;
      }
      // 被前车堵住两侧时轻收油（正在加速冲刺时不收）
      if (lift > 0 && kart.boostTime <= 0) input.accel = Math.min(input.accel, lift);
      // 已经压到路肩外：收油 + 轻刹，先把车拉回来再谈速度
      if (Math.abs(latNow) > halfW + 0.2) {
        input.accel = 0;
        input.brake = Math.max(input.brake, 0.4);
      }

      /* --- 漂移说明 ---
         本作漂移的横摆角速度下限是 0.5×1.42×turnRate，相当于半径 26m 的弯，
         而 20 条赛道最急的弯也在 R40 以上，硬漂只会往弯心内侧切出去。
         所以 AI 不漂移，靠走线 + 加速带 + 金币拿速度。 */

      if (kart.offroadTimer > 0.15) input.accel = Math.max(input.accel, 0.9);

      /* --- 道具 --- */
      if (kart.item && kart.item.roulette <= 0) {
        this.itemTimer += dt;
        if (this.itemTimer > this.itemDelay) {
          if (this.wantUseItem(kart, race)) {
            input.item = true;
            this.itemTimer = 0;
            this.itemDelay = this.rng.range(0.5, 2.2) * this.itemDelayScale;
          }
        }
      } else {
        this.itemTimer = 0;
      }
      return input;
    }

    wantUseItem(kart, race) {
      const item = kart.item;
      const type = item.type;
      const karts = race.karts;
      const track = this.track;
      const s = kart.lastS;
      const curv = Math.abs(curvatureAhead(track, s + 6, 30));
      // 前方最近对手 / 后方最近对手
      let ahead = null, aheadD = 1e9;
      let behind = null, behindD = 1e9;
      for (let i = 0; i < karts.length; i++) {
        const k = karts[i];
        if (k === kart) continue;
        const d = k.totalDist - kart.totalDist;
        if (d > 0 && d < aheadD) { aheadD = d; ahead = k; }
        if (d < 0 && -d < behindD) { behindD = -d; behind = k; }
      }
      switch (type) {
        case 'mushroom':
          return curv < 0.008 || kart.offroadTimer > 0.2;
        case 'tripleMushroom':
          return curv < 0.008 || kart.offroadTimer > 0.2 || (aheadD < 65 && aheadD > 12);
        case 'greenShell':
          return aheadD < 70 && aheadD > 8;
        case 'redShell':
          return !!ahead && aheadD < 120;
        case 'banana':
          return behindD < 26 || (curv > 0.02 && Math.random() < 0.35);
        case 'star':
          return true;
        case 'lightning':
          return kart.position > 2 || aheadD < 45;
        case 'bullet':
          return kart.position > 2;
      }
      return false;
    }
  }

  SK.AIDriver = AIDriver;
  SK.buildRacingLine = buildRacingLine;
  SK.buildSpeedProfile = buildSpeedProfile;
})();
