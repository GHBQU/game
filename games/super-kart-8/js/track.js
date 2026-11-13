/* ============================================================
   Super Kart 8 — track.js
   赛道构建：中心线 / 弧长重采样 / 旋转最小化标架 / 侧倾 / 反重力
             路面 · 路缘 · 护栏 · 加速板 · 跳台 · 地形 · 天空 · 场景
   由 SK.TRACKS 中的定义驱动，支持主题化配色与安全销毁
   坐标约定：quatFromBasis(f, up) 使模型局部 -Z 朝前、+Y 朝上、+X 朝右
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;
  const TAU = Math.PI * 2;

  /* ============================================================
     纹理：按主题缓存，几何 UV 负责平铺，避免 clone 造成的重复显存
     ============================================================ */
  const TEX = {};          // 当前赛道使用的纹理集合（供 items.js 使用）
  const TEX_CACHE = {};    // themeId -> 纹理集合
  let COMMON_TEX = null;

  function tex(canvas, opts) {
    const t = U.texture(canvas, opts);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
    t.anisotropy = Math.min(8, SK.maxAniso || 4);
    t.userData.shared = true;
    return t;
  }

  function makeRoadTexture(th) {
    const c = U.canvas(512, 512), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 512, 512);
    g.addColorStop(0, th.base[0]);
    g.addColorStop(0.5, th.base[1]);
    g.addColorStop(1, th.base[2]);
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 40; i++) {
      x.globalAlpha = 0.06;
      x.fillStyle = i % 2 ? th.speck[1] : th.speck[0];
      x.beginPath();
      x.ellipse(Math.random() * 512, Math.random() * 512, U.rand(20, 90), U.rand(15, 60), Math.random() * TAU, 0, TAU);
      x.fill();
    }
    x.globalAlpha = 1;
    U.speckle(x, 512, 512, 5200, th.speck, 1, 2.4, 0.22);
    x.strokeStyle = 'rgba(20,20,26,0.28)';
    for (let i = 0; i < 14; i++) {
      x.lineWidth = U.rand(0.6, 1.6);
      x.beginPath();
      let px = Math.random() * 512, py = Math.random() * 512;
      x.moveTo(px, py);
      for (let k = 0; k < 5; k++) { px += U.rand(-40, 40); py += U.rand(-40, 40); x.lineTo(px, py); }
      x.stroke();
    }
    return tex(c);
  }

  function makeGrassTexture(gd) {
    const c = U.canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = gd.base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      x.globalAlpha = 0.1;
      x.fillStyle = gd.spots[i % gd.spots.length];
      x.beginPath();
      x.ellipse(Math.random() * 256, Math.random() * 256, U.rand(14, 50), U.rand(10, 40), Math.random() * TAU, 0, TAU);
      x.fill();
    }
    x.globalAlpha = 1;
    U.speckle(x, 256, 256, 3600, gd.spots, 1, 2.6, 0.3);
    return tex(c);
  }

  function hexToRgba(hex, a) {
    const v = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  function makeSkyTexture(stops, th) {
    const W = 512, H = 512;
    const c = U.canvas(W, H), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    const n = stops.length - 1;
    for (let i = 0; i < stops.length; i++) g.addColorStop(i / n, stops[i]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    // 手绘感云带：球面 equirect 映射，横向需要跨接缝重复绘制
    const tint = (th && th.skyCloud) || '#ffffff';
    const cloudCount = (th && th.stars > 0.5) ? 14 : 34;
    const draw = (cx, cy, rw, rh, alpha) => {
      for (const off of [-W, 0, W]) {
        const px = cx + off;
        if (px + rw < 0 || px - rw > W) continue;
        const rg = x.createRadialGradient(px, cy, 0, px, cy, rw);
        rg.addColorStop(0, hexToRgba(tint, alpha));
        rg.addColorStop(0.55, hexToRgba(tint, alpha * 0.55));
        rg.addColorStop(1, hexToRgba(tint, 0));
        x.save();
        x.translate(px, cy);
        x.scale(1, rh / rw);
        x.fillStyle = rg;
        x.beginPath();
        x.arc(0, 0, rw, 0, TAU);
        x.fill();
        x.restore();
      }
    };
    const rng = U.RNG(9001);
    for (let i = 0; i < cloudCount; i++) {
      const cx = rng.range(0, W);
      const cy = rng.range(H * 0.36, H * 0.82);
      const rw = rng.range(26, 96) * (0.6 + (cy / H) * 0.8);
      const rh = rw * rng.range(0.16, 0.3);
      const a = rng.range(0.08, 0.2) * (1 - Math.abs(cy / H - 0.62) * 0.9);
      draw(cx, cy, rw, rh, Math.max(0.03, a));
      // 每一团再叠两三个小鼓包，形成蓬松轮廓
      for (let k = 0; k < 3; k++) {
        const ox = cx + rng.range(-rw * 0.7, rw * 0.7);
        const oy = cy - rng.range(0, rh * 0.9);
        draw(ox, oy, rw * rng.range(0.2, 0.42), rh * rng.range(0.5, 0.9), Math.max(0.02, a * 0.9));
      }
    }
    // 地平线雾带
    const hz = x.createLinearGradient(0, H * 0.72, 0, H);
    hz.addColorStop(0, hexToRgba(tint, 0));
    hz.addColorStop(1, hexToRgba(tint, 0.30));
    x.fillStyle = hz;
    x.fillRect(0, H * 0.72, W, H * 0.28);

    // 轻微扰动，避免大面积渐变出现色带
    for (let i = 0; i < 2200; i++) {
      x.globalAlpha = 0.012;
      x.fillStyle = i % 2 ? '#ffffff' : '#000000';
      x.fillRect(0, Math.random() * H, W, 1);
    }
    x.globalAlpha = 1;
    return tex(c);
  }

  function makeBoostTexture() {
    const c = U.canvas(128, 256), x = c.getContext('2d');
    x.fillStyle = '#2a1f0d'; x.fillRect(0, 0, 128, 256);
    const g = x.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, '#ff9b1f'); g.addColorStop(0.5, '#ffe04a'); g.addColorStop(1, '#ff9b1f');
    x.fillStyle = g; x.fillRect(6, 0, 116, 256);
    x.fillStyle = '#fffbe0';
    for (let i = 0; i < 3; i++) {
      const y = 16 + i * 84;
      x.beginPath();
      x.moveTo(20, y + 48); x.lineTo(64, y); x.lineTo(108, y + 48);
      x.lineTo(108, y + 70); x.lineTo(64, y + 22); x.lineTo(20, y + 70);
      x.closePath(); x.fill();
    }
    x.globalAlpha = 0.22; x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 128, 7);
    x.globalAlpha = 1;
    return tex(c);
  }

  function makeCommonTextures() {
    if (COMMON_TEX) return COMMON_TEX;
    COMMON_TEX = {};

    /* 问号箱 */
    const bc = U.canvas(128, 128), bx = bc.getContext('2d');
    const bg = bx.createLinearGradient(0, 0, 128, 128);
    bg.addColorStop(0, 'rgba(255,255,255,0.96)');
    bg.addColorStop(0.35, 'rgba(160,225,255,0.55)');
    bg.addColorStop(0.7, 'rgba(255,160,230,0.5)');
    bg.addColorStop(1, 'rgba(120,190,255,0.92)');
    bx.fillStyle = bg; bx.fillRect(0, 0, 128, 128);
    bx.strokeStyle = 'rgba(255,255,255,0.92)'; bx.lineWidth = 7;
    bx.strokeRect(3.5, 3.5, 121, 121);
    bx.strokeStyle = 'rgba(255,255,255,0.55)'; bx.lineWidth = 3;
    bx.strokeRect(14, 14, 100, 100);
    bx.fillStyle = 'rgba(30,40,80,0.5)';
    bx.font = 'bold 76px system-ui, sans-serif';
    bx.textAlign = 'center'; bx.textBaseline = 'middle';
    bx.fillText('?', 64, 70);
    const boxTex = (function(t){t.encoding=THREE.sRGBEncoding;return t;})(new THREE.CanvasTexture(bc));
    boxTex.userData.shared = true;
    COMMON_TEX.box = boxTex;

    /* 金币 */
    const cc = U.canvas(128, 128), cx = cc.getContext('2d');
    const cg = cx.createRadialGradient(56, 50, 6, 64, 64, 62);
    cg.addColorStop(0, '#fffde3'); cg.addColorStop(0.45, '#ffd83e'); cg.addColorStop(1, '#de9208');
    cx.fillStyle = cg; cx.beginPath(); cx.arc(64, 64, 60, 0, TAU); cx.fill();
    cx.strokeStyle = '#b8730a'; cx.lineWidth = 6;
    cx.beginPath(); cx.arc(64, 64, 57, 0, TAU); cx.stroke();
    cx.fillStyle = '#fff3b0'; cx.font = 'bold 66px system-ui'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('★', 64, 72);
    const coinTex = (function(t){t.encoding=THREE.sRGBEncoding;return t;})(new THREE.CanvasTexture(cc));
    coinTex.userData.shared = true;
    COMMON_TEX.coin = coinTex;

    COMMON_TEX.boost = makeBoostTexture();
    return COMMON_TEX;
  }

  function themeTextures(themeId) {
    if (TEX_CACHE[themeId]) return TEX_CACHE[themeId];
    const th = SK.THEMES[themeId];
    const t = {
      road: makeRoadTexture(th.road),
      grass: makeGrassTexture(th.ground),
      sky: makeSkyTexture(th.sky, th),
      boost: makeCommonTextures().boost
    };
    TEX_CACHE[themeId] = t;
    return t;
  }

  /* ============================================================
     赛道
     ============================================================ */
  class Track {
    constructor(scene, def) {
      this.scene = scene;
      this.def = def || SK.TRACKS[0];
      this.theme = this.def.themeData || SK.THEMES[this.def.theme];
      this.shape = this.def.shape;
      this.anti = this.def.anti;
      this.samples = [];
      this.count = 0;
      this.length = 1;
      this.spacing = 1.25;
      this.group = new THREE.Group();
      this.group.name = 'track';
      scene.add(this.group);
      this.decorGroup = new THREE.Group();
      this.decorGroup.name = 'decor';
      this.group.add(this.decorGroup);
      this.boostPads = [];
      this.ramps = [];
      this.itemBoxSpots = [];
      this.coinSpots = [];
      this.colliders = [];

      this._buildTextures();
      this.generate();
      this.buildSpatialGrid();
      this.buildRoad();
      this.buildCurbs();
      this.buildWalls();
      this.buildBoostPads();
      this.buildRamps();
      this.buildStartLine();
      this.buildAntigravFx();
      this.placeItemsAndCoins();
      this.buildTerrain();
      this.buildSky();
      this.buildScenery();
      this.buildMinimap();
      this.group.updateMatrixWorld(true);
      this.setupShadows();
    }

    /** 阴影标记：路面接收，场景装饰投射 + 接收 */
    setupShadows() {
      const road = this.roadMesh || null;
      this.group.traverse(o => {
        if (!o.isMesh) return;
        o.receiveShadow = true;
      });
      // 只让装饰与护栏投射阴影（路面/地形自身不投射，省一半深度绘制）
      if (this.decorGroup) {
        this.decorGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
      }
      if (this.terrainMesh) { this.terrainMesh.castShadow = false; }
    }

    _buildTextures() {
      const t = themeTextures(this.def.theme);
      const c = makeCommonTextures();
      TEX.road = t.road;
      TEX.grass = t.grass;
      TEX.sky = t.sky;
      TEX.boost = t.boost;
      TEX.box = c.box;
      TEX.coin = c.coin;
      SK.trackTextures = TEX;
    }

    /* ---------------- 形状函数 ---------------- */
    radiusAt(th) {
      const s = this.shape;
      let r = s.r0;
      for (let i = 0; i < s.rh.length; i++) {
        const h = s.rh[i];
        r += h[0] * Math.sin(h[1] * th + h[2]);
      }
      return r;
    }
    heightAt(th) {
      const s = this.shape;
      let y = s.y0;
      for (let i = 0; i < s.yh.length; i++) {
        const h = s.yh[i];
        y += h[0] * Math.sin(h[1] * th + h[2]);
      }
      return y;
    }
    widthAt(th) {
      const s = this.shape;
      let w = s.w0;
      for (let i = 0; i < s.wh.length; i++) {
        const h = s.wh[i];
        w += h[0] * Math.sin(h[1] * th + h[2]);
      }
      return w;
    }

    /* ---------------- 中心线 ---------------- */
    generate() {
      const DENSE = 4000;
      const rot = this.shape.rot || 0;
      const dense = [];
      for (let i = 0; i < DENSE; i++) {
        const th = (i / DENSE) * TAU + rot;
        const r = this.radiusAt(th);
        dense.push({
          p: new THREE.Vector3(r * Math.cos(th), this.heightAt(th), r * Math.sin(th)),
          th
        });
      }
      let total = 0;
      const cum = [0];
      for (let i = 1; i <= DENSE; i++) {
        total += dense[i - 1].p.distanceTo(dense[i % DENSE].p);
        cum.push(total);
      }
      const N = Math.max(64, Math.round(total / this.spacing));
      this.spacing = total / N;
      const samples = [];
      let seg = 0;
      for (let j = 0; j < N; j++) {
        const s = j * this.spacing;
        while (seg < DENSE - 1 && cum[seg + 1] < s) seg++;
        const s0 = cum[seg], s1 = cum[seg + 1];
        const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
        const a = dense[seg], b = dense[(seg + 1) % DENSE];
        const p = a.p.clone().lerp(b.p, t);
        let th0 = a.th, th1 = b.th;
        if (th1 <= th0) th1 += TAU;
        const th = U.lerp(th0, th1, t);
        samples.push({ p, th, s, i: j });
      }
      for (let j = 0; j < N; j++) {
        const a = samples[(j - 1 + N) % N].p, b = samples[(j + 1) % N].p;
        samples[j].t = b.clone().sub(a).normalize();
      }
      for (let j = 0; j < N; j++) {
        const a = samples[(j - 1 + N) % N].t, b = samples[(j + 1) % N].t;
        samples[j].accel = b.clone().sub(a).divideScalar(this.spacing * 2);
      }

      // 旋转最小化标架（未侧倾）
      let up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion();
      const anti = this.anti;
      const bankGain = this.def.bankGain || 58;
      for (let j = 0; j < N; j++) {
        const sm = samples[j];
        const prev = samples[(j - 1 + N) % N];
        if (j === 0) {
          up = new THREE.Vector3(0, 1, 0);
        } else {
          const axis = new THREE.Vector3().crossVectors(prev.t, sm.t);
          const ang = Math.acos(U.clamp(prev.t.dot(sm.t), -1, 1));
          if (axis.lengthSq() > 1e-10 && ang > 1e-7) {
            axis.normalize();
            q.setFromAxisAngle(axis, ang);
            up.applyQuaternion(q);
          }
          up.addScaledVector(sm.t, -up.dot(sm.t));
          if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
          up.normalize();
        }
        sm.upBase = up.clone();
        const side0 = new THREE.Vector3().crossVectors(sm.t, up).normalize();
        sm.kSigned = sm.accel.dot(side0);
        sm.curvature = sm.accel.length();
        const bank = U.clamp(sm.kSigned * bankGain, -0.26, 0.26);
        sm.bankRaw = bank;
        let roll = 0;
        if (anti) {
          // 用赛道自身参数 θ0 判定，才不会被旋转相位与 mod 弄错
          const rel = U.mod(sm.th - rot, TAU);
          if (rel > anti.a && rel < anti.b) {
            roll = anti.dir * TAU * U.smootherstep((rel - anti.a) / (anti.b - anti.a));
          } else if (rel >= anti.b) {
            roll = anti.dir * TAU;   // 翻转完成后保持整圈，视觉等价于 0
          }
        }
        sm.roll = roll;
        sm.width = this.widthAt(sm.th);
      }

      // 侧倾平滑
      const banks = samples.map(s => s.bankRaw);
      for (let pass = 0; pass < 4; pass++) {
        const next = banks.slice();
        for (let j = 0; j < N; j++) {
          next[j] = (banks[(j - 1 + N) % N] + banks[j] * 2.5 + banks[(j + 1) % N]) / 4.5;
        }
        for (let j = 0; j < N; j++) banks[j] = next[j];
      }
      const startTh = U.mod(rot, TAU);
      for (let j = 0; j < N; j++) {
        const sm = samples[j];
        // 起跑线附近压平，保证发车格水平
        let dth = Math.abs(U.mod(sm.th - startTh + Math.PI, TAU) - Math.PI);
        sm.bank = banks[j] * U.smoothstep(U.clamp01((dth - 0.06) / 0.30));
        const rotQ = new THREE.Quaternion().setFromAxisAngle(sm.t, sm.bank + sm.roll);
        const upR = sm.upBase.clone().applyQuaternion(rotQ);
        upR.addScaledVector(sm.t, -upR.dot(sm.t));
        if (upR.lengthSq() < 1e-8) upR.copy(sm.upBase);
        upR.normalize();
        const sideR = new THREE.Vector3().crossVectors(sm.t, upR).normalize();
        // up = side × tangent  （右手系）
        const nrm = new THREE.Vector3().crossVectors(sideR, sm.t).normalize();
        sm.normal = nrm;
        sm.side = new THREE.Vector3().crossVectors(sm.t, nrm).normalize();
      }

      this.samples = samples;
      this.count = N;
      this.length = N * this.spacing;
      if (anti) {
        let s0 = -1, s1 = -1;
        for (let i = 0; i < N; i++) {
          const rel = U.mod(samples[i].th - rot, TAU);
          if (rel > anti.a - 1e-6 && rel < anti.b + 1e-6) {
            if (s0 < 0) s0 = i;
            s1 = i;
          }
        }
        this.antiStart = s0;
        this.antiEnd = s1;
      } else {
        this.antiStart = -1;
        this.antiEnd = -1;
      }
      this.antiMid = this.antiStart >= 0 ? Math.floor((this.antiStart + this.antiEnd) / 2) : 0;
      this.maxHeight = Math.max.apply(null, samples.map(s => s.p.y));
      this.minHeight = Math.min.apply(null, samples.map(s => s.p.y));
    }

    /* ---------------- 采样工具 ---------------- */
    sampleAt(s) {
      const N = this.count;
      s = U.mod(s, this.length);
      const f = s / this.spacing;
      const i0 = Math.floor(f) % N, i1 = (i0 + 1) % N;
      const t = f - Math.floor(f);
      const a = this.samples[i0], b = this.samples[i1];
      const out = this._tmpFrame || (this._tmpFrame = {
        p: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), side: new THREE.Vector3()
      });
      out.p.copy(a.p).lerp(b.p, t);
      out.t.copy(a.t).lerp(b.t, t).normalize();
      out.n.copy(a.normal).lerp(b.normal, t).normalize();
      out.side.copy(a.side).lerp(b.side, t).normalize();
      out.width = U.lerp(a.width, b.width, t);
      out.i0 = i0; out.t01 = t; out.index = i0;
      out.curvature = U.lerp(a.curvature, b.curvature, t);
      out.kSigned = U.lerp(a.kSigned, b.kSigned, t);
      out.bank = U.lerp(a.bank, b.bank, t);
      out.roll = U.lerp(a.roll, b.roll, t);
      out.th = a.th + (b.th > a.th ? b.th - a.th : b.th + TAU - a.th) * t;
      out.s = s;
      return out;
    }

    pointAt(s, lateral, lift) {
      const f = this.sampleAt(s);
      return f.p.clone()
        .addScaledVector(f.side, lateral || 0)
        .addScaledVector(f.n, lift || 0);
    }

    /** 路拱 + 路缘石高度：与路面网格的横断面一致
     *  路面：0 → 0.10（中间拱起）→ 0
     *  路缘：halfW 之外抬起，+0.55w 处最高 0.16，+1.4 处回落
     */
    crownAt(lateral, halfW) {
      const a = Math.abs(lateral);
      const u = Math.min(1, a / Math.max(0.001, halfW));
      if (a <= halfW) {
        return u <= 0.55 ? U.lerp(0.10, 0.04, u / 0.55) : U.lerp(0.04, 0, (u - 0.55) / 0.45);
      }
      const t = (a - halfW) / 1.4;
      if (t < 1) return 0.02 + 0.14 * Math.sin(Math.PI * Math.min(1, t));
      return 0;
    }

    /** 世界坐标 → 赛道坐标 */
    project(pos, hintIndex) {
      const N = this.count;
      const sm = this.samples;
      let best = -1, bestDist = Infinity;
      if (hintIndex === undefined || hintIndex === null || hintIndex < 0) {
        for (let i = 0; i < N; i += 3) {
          const d = sm[i].p.distanceToSquared(pos);
          if (d < bestDist) { bestDist = d; best = i; }
        }
        for (let k = -4; k <= 4; k++) {
          const i = (best + k + N) % N;
          const d = sm[i].p.distanceToSquared(pos);
          if (d < bestDist) { bestDist = d; best = i; }
        }
      } else {
        const W = 30;
        for (let k = -W; k <= W; k++) {
          const i = (hintIndex + k + N) % N;
          const d = sm[i].p.distanceToSquared(pos);
          if (d < bestDist) { bestDist = d; best = i; }
        }
        if (bestDist > 90 * 90) {
          for (let i = 0; i < N; i += 3) {
            const d = sm[i].p.distanceToSquared(pos);
            if (d < bestDist) { bestDist = d; best = i; }
          }
        }
      }
      const base = sm[best];
      const dx = pos.x - base.p.x, dy = pos.y - base.p.y, dz = pos.z - base.p.z;
      const lateral = dx * base.side.x + dy * base.side.y + dz * base.side.z;
      const height = dx * base.normal.x + dy * base.normal.y + dz * base.normal.z;
      const along = dx * base.t.x + dy * base.t.y + dz * base.t.z;
      const s = U.mod(base.s + along, this.length);
      const halfW = base.width * 0.5;
      const info = this._proj || (this._proj = {});
      info.index = best;
      info.s = s;
      info.lateral = lateral;
      info.height = height;
      info.halfWidth = halfW;
      info.normal = base.normal;
      info.side = base.side;
      info.tangent = base.t;
      info.pos = base.p;
      info.width = base.width;
      info.th = base.th;
      info.curvature = base.curvature;
      info.kSigned = base.kSigned;
      info.bank = base.bank;
      info.roll = base.roll;
      info.offroad = Math.abs(lateral) > halfW;
      info.wall = Math.abs(lateral) > halfW + 1.3;
      info.anti = base.roll > Math.PI * 0.35 && base.roll < Math.PI * 1.65;
      let rampH = 0;
      for (let i = 0; i < this.ramps.length; i++) {
        const r = this.ramps[i];
        const ds = U.mod(s - r.s0, this.length);
        if (ds > 0 && ds < r.len && Math.abs(lateral - r.lat) < r.halfWidth) {
          const u = ds / r.len;
          rampH = Math.max(rampH, r.height * U.smoothstep(Math.min(1, u * 1.12)));
        }
      }
      info.rampH = rampH;
      // 路拱也算进“地面高度”，否则车会在路中间陷进路面
      info.crown = this.crownAt(lateral, halfW);
      info.gap = height - rampH - info.crown;
      return info;
    }

    /* ---------------- 条带构建 ---------------- */
    ribbon(i0, i1, lats, lifts, opts) {
      opts = opts || {};
      const N = this.count;
      const sm = this.samples;
      const getLats = typeof lats === 'function' ? lats : () => lats;
      const getLifts = typeof lifts === 'function' ? lifts : () => lifts;
      const rows = [];
      const positions = [], uvs = [], colors = [], indices = [];
      let cols = 2;
      for (let j = i0; j <= i1; j++) {
        const i = ((j % N) + N) % N;
        const base = sm[i];
        const la = getLats(i, j);
        const li = getLifts(i, j);
        cols = la.length;
        const rowIdx = [];
        for (let k = 0; k < la.length; k++) {
          const p = base.p.clone()
            .addScaledVector(base.side, la[k])
            .addScaledVector(base.normal, li[k]);
          positions.push(p.x, p.y, p.z);
          const u = opts.uAcross ? (k / (la.length - 1)) : (la[k] / (opts.uScale || 1));
          const v = opts.vWorld ? base.s * (opts.vScale || 1) : ((j - i0) / Math.max(1, i1 - i0)) * (opts.vRepeat || 1);
          uvs.push(u, v);
          rowIdx.push(positions.length / 3 - 1);
          if (opts.colorFn) {
            const c = opts.colorFn(i, k, j);
            colors.push(c.r, c.g, c.b);
          }
        }
        rows.push(rowIdx);
      }
      for (let r = 0; r < rows.length - 1; r++) {
        for (let k = 0; k < cols - 1; k++) {
          const a = rows[r][k], b = rows[r][k + 1], c = rows[r + 1][k], d = rows[r + 1][k + 1];
          if (opts.flip) indices.push(a, c, b, b, c, d);
          else indices.push(a, b, c, b, d, c);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      if (colors.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      return geo;
    }

    /* ---------------- 路面 ---------------- */
    buildRoad() {
      const N = this.count;
      const th = this.theme;
      const matRoad = new THREE.MeshLambertMaterial({
        color: th.road.tint || 0xffffff, map: TEX.road, side: THREE.DoubleSide
      });
      this.roadMat = matRoad;
      const geo = this.ribbon(0, N, i => {
        const w = this.samples[i].width * 0.5;
        return [-w, -w * 0.55, 0, w * 0.55, w];
      }, () => [0, 0.04, 0.10, 0.04, 0], {
        uAcross: true, vWorld: true, vScale: 1 / 14
      });
      const road = new THREE.Mesh(geo, matRoad);
      road.name = 'road';
      this.group.add(road);
      this.roadMesh = road;

      const underMat = new THREE.MeshLambertMaterial({ color: 0x2b2f3d, side: THREE.DoubleSide });
      const under = new THREE.Mesh(this.ribbon(0, N, i => {
        const w = this.samples[i].width * 0.5;
        return [-w, w];
      }, () => [-0.8, -0.8], { uAcross: true }), underMat);
      this.group.add(under);

      const shoulderMat = new THREE.MeshLambertMaterial({ color: 0x707791, side: THREE.DoubleSide });
      const shL = new THREE.Mesh(this.ribbon(0, N, i => {
        const w = this.samples[i].width * 0.5;
        return [-w - 1.5, -w];
      }, () => [-0.8, 0], { uAcross: true }), shoulderMat);
      const shR = new THREE.Mesh(this.ribbon(0, N, i => {
        const w = this.samples[i].width * 0.5;
        return [w, w + 1.5];
      }, () => [0, -0.8], { uAcross: true }), shoulderMat);
      this.group.add(shL, shR);
    }

    /* ---------------- 路缘石 ---------------- */
    buildCurbs() {
      const N = this.count;
      const col = this.theme.curb;
      const red = new THREE.Color(col[0]);
      const white = new THREE.Color(col[1]);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const mkCurb = (sign) => this.ribbon(0, N, i => {
        const w = this.samples[i].width * 0.5;
        return [sign * w, sign * (w + 0.55), sign * (w + 1.4)];
      }, () => [0.02, 0.16, 0.02], {
        uAcross: true,
        colorFn: (i, k, j) => (Math.floor(j / 2) % 2 === 0 ? red : white)
      });
      this.group.add(new THREE.Mesh(mkCurb(-1), mat));
      this.group.add(new THREE.Mesh(mkCurb(1), mat));
    }

    /* ---------------- 护栏 ---------------- */
    wallAt(i) {
      const th = U.mod(this.samples[i].th, TAU);
      if (this.anti) {
        const rel = U.mod(this.samples[i].th - (this.shape.rot || 0), TAU);
        if (rel > this.anti.a - 0.02 && rel < this.anti.b + 0.02) return true;
      }
      const gaps = this.def.layout.gaps;
      for (let k = 0; k < gaps.length; k++) {
        const g = gaps[k];
        if (th > g[0] && th < g[1]) return false;
      }
      return true;
    }

    buildWalls() {
      const N = this.count;
      const th = this.theme;
      const c1 = new THREE.Color(th.wall.bands[0]);
      const c2 = new THREE.Color(th.wall.bands[1]);
      const c3 = new THREE.Color(th.wall.trim);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const capMat = new THREE.MeshLambertMaterial({ color: th.wall.cap, side: THREE.DoubleSide });
      const mk = (sign) => {
        let start = 0;
        for (let i = 0; i < N; i++) if (!this.wallAt(i)) { start = i; break; }
        const runs = [];
        let run = null;
        for (let k = 0; k <= N; k++) {
          const i = (start + k) % N;
          const on = this.wallAt(i);
          if (on && !run) run = [start + k, start + k];
          else if (on) run[1] = start + k;
          else if (run) { runs.push(run); run = null; }
        }
        if (run) runs.push(run);
        runs.forEach(r => {
          if (r[1] - r[0] < 2) return;
          const geo = this.ribbon(r[0], r[1], i => {
            const w = this.samples[i].width * 0.5 + 1.5;
            return [sign * w, sign * w, sign * (w - 0.12)];
          }, () => [-0.95, 1.05, 1.2], {
            uAcross: true,
            colorFn: (i, k, j) => {
              const band = Math.floor(j / 6) % 3;
              if (k === 2) return c3;
              return band === 1 ? c1 : c2;
            }
          });
          this.group.add(new THREE.Mesh(geo, mat));
          const cap = this.ribbon(r[0], r[1], i => {
            const w = this.samples[i].width * 0.5 + 1.5;
            return [sign * (w - 0.12), sign * (w - 0.6)];
          }, () => [1.2, 1.13], { uAcross: true });
          this.group.add(new THREE.Mesh(cap, capMat));
        });
      };
      mk(-1); mk(1);
    }

    /* ---------------- 加速板 ---------------- */
    addPad(s, lat, width, len) {
      const v = this.pointAt(s, lat, 0.09);
      const f = this.sampleAt(s);
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ map: TEX.boost, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const geo = new THREE.PlaneGeometry(width, len);
      // 平铺压进 UV，全赛道共用一张纹理，只需一次 offset 动画
      const uv = geo.attributes.uv;
      const rep = Math.max(1, Math.round(len / 5));
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * rep);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      g.add(m);
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.6, len + 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = -0.03;
      g.add(edge);
      g.position.copy(v);
      g.quaternion.copy(U.quatFromBasis(f.t, f.n));
      this.group.add(g);
      this.boostPads.push({ s, lat, width, len, group: g, mat });
    }

    buildBoostPads() {
      const L = this.length;
      const half = this.def.shape.w0 * 0.5;
      this.def.layout.pads.forEach(p => {
        this.addPad(p.f * L, p.lat * half, p.width, p.len);
      });
    }

    /* ---------------- 跳台 ---------------- */
    addRamp(s, lat, width, len, height, glide) {
      const f = this.sampleAt(s);
      const g = new THREE.Group();
      g.position.copy(f.p).addScaledVector(f.side, lat).addScaledVector(f.n, 0.0);
      g.quaternion.copy(U.quatFromBasis(f.t, f.n));
      const verts = [];
      const idx = [];
      const hw = width / 2;
      const push = (x, y, z) => { verts.push(x, y, z); return verts.length / 3 - 1; };
      // 局部 -Z 为前进方向 → 沿 -Z 延伸
      const a = push(-hw, 0, 0), b = push(hw, 0, 0), c = push(hw, 0, -len), d = push(-hw, 0, -len);
      const e = push(-hw, height, -len), f2 = push(hw, height, -len);
      idx.push(a, b, c, a, c, d);
      idx.push(a, e, f2, a, f2, b);
      idx.push(d, c, f2, d, f2, e);
      idx.push(a, d, e);
      idx.push(b, f2, c);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ color: 0xe8571f, side: THREE.DoubleSide, flatShading: true });
      g.add(new THREE.Mesh(geo, mat));
      // 顶端警示条
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.28, 1.0),
        new THREE.MeshLambertMaterial({ color: 0x1d1f26 }));
      topBar.position.set(0, height + 0.12, -len + 0.5);
      g.add(topBar);
      const barStripe = new THREE.Mesh(new THREE.BoxGeometry(width * 0.98, 0.3, 0.24),
        new THREE.MeshLambertMaterial({ color: 0xffd60a }));
      barStripe.position.set(0, height + 0.13, -len + 0.5);
      g.add(barStripe);
      // 侧翼
      const wingMat = new THREE.MeshLambertMaterial({ color: 0xff9f1c, flatShading: true });
      [-1, 1].forEach(sg => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, height * 0.5, len * 0.6), wingMat);
        wing.position.set(sg * (hw + 0.25), height * 0.3, -len * 0.72);
        g.add(wing);
      });
      if (glide) {
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0x8beeff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
        for (let i = 0; i < 3; i++) {
          const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.0, 4), arrowMat);
          arrow.rotation.x = Math.PI / 2;
          arrow.position.set(0, height + 2.4 + i * 2.2, -len - 1.5);
          g.add(arrow);
        }
      }
      this.group.add(g);
      this.ramps.push({ s0: s, len, height, halfWidth: width / 2, glide: !!glide, lat, group: g });
    }

    buildRamps() {
      const L = this.length;
      const half = this.def.shape.w0 * 0.5;
      this.def.layout.ramps.forEach(r => {
        this.addRamp(r.f * L, r.lat * half, r.width, r.len, r.height, r.glide);
      });
    }

    /* ---------------- 起跑线 & 龙门架 ---------------- */
    buildStartLine() {
      const span = Math.max(3, Math.round(6 / this.spacing));
      const COLS = 17;
      const dark = new THREE.Color(0x14161f);
      const light = new THREE.Color(0xf7f9ff);
      const w0 = this.samples[0].width * 0.5;
      const latArr = [];
      for (let k = 0; k < COLS; k++) latArr.push(-w0 + (2 * w0) * k / (COLS - 1));
      const geo = this.ribbon(-span, 0, i => {
        const w = this.samples[i].width * 0.5;
        const arr = [];
        for (let k = 0; k < COLS; k++) arr.push(-w + (2 * w) * k / (COLS - 1));
        return arr;
      }, () => latArr.map(() => 0.045), {
        uAcross: true,
        colorFn: (i, k, j) => (((k + j) % 2) === 0 ? dark : light)
      });
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      this.group.add(mesh);
      const f = this.sampleAt(0);
      const g = new THREE.Group();
      g.position.copy(f.p);
      g.quaternion.copy(U.quatFromBasis(f.t, f.n));
      const w = f.width * 0.5 + 2.4;
      const postMat = new THREE.MeshLambertMaterial({ color: 0xeef4ff });
      const postGeo = new THREE.BoxGeometry(1.6, 10.5, 1.6);
      const capCol = this.theme.wall.cap;
      [-w, w].forEach(x => {
        const p = new THREE.Mesh(postGeo, postMat);
        p.position.set(x, 5.25, 0);
        g.add(p);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 10), new THREE.MeshLambertMaterial({ color: capCol }));
        cap.position.set(x, 10.9, 0);
        g.add(cap);
      });
      const bc = U.canvas(1024, 160);
      const bx = bc.getContext('2d');
      const bg = bx.createLinearGradient(0, 0, 1024, 0);
      bg.addColorStop(0, '#c1121f'); bg.addColorStop(0.5, '#ff5c6c'); bg.addColorStop(1, '#c1121f');
      bx.fillStyle = bg; bx.fillRect(0, 0, 1024, 160);
      for (let i = 0; i < 64; i++) {
        bx.fillStyle = i % 2 ? '#ffffff' : '#151823';
        bx.fillRect(i * 16, 0, 16, 14);
        bx.fillStyle = i % 2 ? '#151823' : '#ffffff';
        bx.fillRect(i * 16, 146, 16, 14);
      }
      bx.fillStyle = '#ffffff';
      bx.font = 'bold 62px "Segoe UI Black", Arial Black, system-ui, sans-serif';
      bx.textAlign = 'center'; bx.textBaseline = 'middle';
      bx.strokeStyle = '#6b0a12'; bx.lineWidth = 9; bx.lineJoin = 'round';
      const title = (this.def.name || 'SUPER KART').toUpperCase();
      bx.strokeText(title, 512, 82);
      bx.fillText(title, 512, 82);
      const bannerTex = (function(t){t.encoding=THREE.sRGBEncoding;return t;})(new THREE.CanvasTexture(bc));
      const banner = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 1.6, 4.4, 0.5),
        new THREE.MeshLambertMaterial({ map: bannerTex }));
      banner.position.set(0, 9.4, 0);
      g.add(banner);
      this.group.add(g);
    }

    /* ---------------- 反重力段光效 ---------------- */
    buildAntigravFx() {
      if (this.antiStart < 0) return;
      const i0 = this.antiStart - 8, i1 = this.antiEnd + 8;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x39d7ff, transparent: true, opacity: 0.13,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
      });
      const geo = this.ribbon(i0, i1, i => {
        const w = this.samples[i].width * 0.5 + 1.55;
        return [-w, -w + 0.5, w - 0.5, w];
      }, () => [0.02, 1.4, 1.4, 0.02], { uAcross: true });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 2;
      this.group.add(m);
      this.antiMat = mat;

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x8beeff, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
      });
      const ringGeo = new THREE.TorusGeometry(1, 0.1, 6, 32);
      this.antiRings = [];
      for (let k = 0; k < 16; k++) {
        const s = U.lerp(i0 * this.spacing, i1 * this.spacing, k / 15);
        const f = this.sampleAt(s);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.scale.set(f.width * 0.5, f.width * 0.5, 1);
        ring.position.copy(f.p);
        ring.quaternion.copy(U.quatFromBasis(f.t, f.n));
        this.group.add(ring);
        this.antiRings.push(ring);
      }
    }

    /* ---------------- 道具箱 & 金币位置 ---------------- */
    placeItemsAndCoins() {
      const L = this.length;
      this.def.layout.itemRows.forEach(f => {
        const s = f * L;
        const fr = this.sampleAt(s);
        const n = 7;
        const span = fr.width * 0.62;
        for (let k = 0; k < n; k++) {
          const lat = -span / 2 + (span / (n - 1)) * k;
          this.itemBoxSpots.push({ s, lat });
        }
      });
      this.def.layout.coinLines.forEach(cl => {
        const s0 = cl.f0 * L, s1 = cl.f1 * L;
        const n = Math.max(3, Math.round((s1 - s0) / 6));
        for (let k = 0; k < n; k++) {
          const s = U.lerp(s0, s1, k / (n - 1));
          const wob = Math.sin((k / (n - 1)) * Math.PI) * 1.6;
          const lat = cl.lat * this.sampleAt(s).width * 0.5 + (cl.lat >= 0 ? wob : -wob);
          this.coinSpots.push({ s, lat });
        }
      });
    }

    /* ---------------- 地形 ---------------- */
    buildTerrain() {
      const gd = this.theme.ground;
      const size = 3400, seg = 108;
      const geo = new THREE.PlaneGeometry(size, size, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      const TILE = 150;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TILE, uv.getY(i) * TILE);
      const colors = [];
      const noise = U.makeNoise1D(1337, 4);
      const noise2 = U.makeNoise1D(99, 3);
      const lake = this.def.lake;
      this.lake = lake;
      const col = new THREE.Color();
      const sand = new THREE.Color(gd.sand);
      const hsl = gd.hsl, vary = gd.vary;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const y = this.terrainBase(x, z, noise, noise2, lake);
        pos.setY(i, y);
        const t = U.clamp01((y + 4) / 26);
        col.setHSL(
          hsl[0] - t * vary[0],
          U.clamp01(hsl[1] - t * vary[1]),
          U.clamp01(hsl[2] + t * vary[2])
        );
        if (lake) {
          const dl = Math.hypot(x - lake.x, z - lake.z) / lake.r;
          if (dl < 1.05) col.lerp(sand, U.clamp01((1 - dl) * 1.6));
        }
        colors.push(col.r, col.g, col.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.grass });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = -0.4;
      this.group.add(mesh);
      this.terrainMesh = mesh;

      if (lake) {
        const waterGeo = new THREE.CircleGeometry(lake.r * 1.02, 56);
        waterGeo.rotateX(-Math.PI / 2);
        const wc = this.theme.water;
        const waterMat = new THREE.MeshLambertMaterial({
          color: wc.color, transparent: true, opacity: wc.opacity || 0.8, emissive: wc.emissive
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.set(lake.x, -3.0, lake.z);
        this.group.add(water);
        this.water = water;

        const shineMat = new THREE.MeshBasicMaterial({
          color: 0xd8f6ff, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const shineGeo = new THREE.CircleGeometry(1, 10);
        for (let i = 0; i < 24; i++) {
          const m = new THREE.Mesh(shineGeo, shineMat);
          m.rotation.x = -Math.PI / 2;
          const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * lake.r * 0.9;
          m.position.set(lake.x + Math.cos(a) * rr, -2.94, lake.z + Math.sin(a) * rr);
          const s = U.rand(1.5, 6);
          m.scale.set(s, s * U.rand(0.2, 0.5), s);
          this.group.add(m);
        }
      }

      // 远山
      const rng = U.RNG(this.def.seed + 7);
      const mt = this.theme.mountain;
      const mountMat = new THREE.MeshLambertMaterial({ color: mt.a, flatShading: true });
      const mountMat2 = new THREE.MeshLambertMaterial({ color: mt.b, flatShading: true });
      const snowMat = new THREE.MeshLambertMaterial({ color: mt.snow, flatShading: true });
      const count = this.def.theme === 'volcano' ? 22 : 32;
      const coneGeo = new THREE.ConeGeometry(1, 1, 7, 1);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + rng.range(-0.09, 0.09);
        const dist = rng.range(880, 1350);
        const h = rng.range(110, 240);
        const r = rng.range(80, 185);
        const g = new THREE.Group();
        const cone = new THREE.Mesh(coneGeo, rng.chance(0.5) ? mountMat : mountMat2);
        cone.scale.set(r, h, r);
        cone.position.y = h / 2;
        g.add(cone);
        if (mt.snowAmt > 0.15) {
          const snow = new THREE.Mesh(coneGeo, snowMat);
          snow.scale.set(r * 0.19 * mt.snowAmt, h * 0.16 * mt.snowAmt, r * 0.19 * mt.snowAmt);
          snow.position.y = h * 0.93;
          g.add(snow);
        }
        g.position.set(Math.cos(a) * dist, -8, Math.sin(a) * dist);
        g.rotation.y = rng.range(0, TAU);
        this.decorGroup.add(g);
      }
    }

    terrainBase(x, z, noise, noise2, lake) {
      const rad = Math.hypot(x, z);
      let falloff;
      if (rad > 430) falloff = 1;
      else {
        const distT = this.distanceToTrackXZ(x, z);
        falloff = U.smoothstep(U.clamp01((distT - 26) / 95));
      }
      let y = -3.4;
      const amp = 12 + Math.min(30, rad * 0.03);
      y += (noise(x * 0.0045) * 0.5 + 0.5) * amp * falloff;
      y += (noise2(x * 0.015 + z * 0.011) * 0.5 + 0.5) * 4.5 * falloff;
      // 远处抬升成环形山脊，遮住地面边缘
      const rim = U.smoothstep(U.clamp01((rad - 900) / 620));
      y += rim * rim * (62 + noise(x * 0.004) * 46);
      if (lake) {
        const dl = Math.hypot(x - lake.x, z - lake.z) / lake.r;
        if (dl < 1) y -= (1 - U.smoothstep(dl)) * 14;
      }
      return y;
    }

    terrainHeightAt(x, z) {
      if (!this._noiseA) {
        this._noiseA = U.makeNoise1D(1337, 4);
        this._noiseB = U.makeNoise1D(99, 3);
      }
      return this.terrainBase(x, z, this._noiseA, this._noiseB, this.lake) - 0.4;
    }

    distanceToTrackXZ(x, z) {
      if (!this._grid) return 999;
      const cell = this._gridCell;
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      let best = Infinity;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const arr = this._grid[(cx + dx) + ',' + (cz + dz)];
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const p = this.samples[arr[k]].p;
          const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d < best) best = d;
        }
      }
      return best === Infinity ? 999 : Math.sqrt(best);
    }

    buildSpatialGrid() {
      const cell = 40;
      this._gridCell = cell;
      this._grid = {};
      for (let i = 0; i < this.count; i++) {
        const p = this.samples[i].p;
        const key = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell);
        if (!this._grid[key]) this._grid[key] = [];
        this._grid[key].push(i);
      }
    }

    /* ============================================================
       场景装饰（按主题分派）
       ============================================================ */
    buildScenery() {
      const rng = U.RNG(this.def.seed + 31);
      const N = this.count;
      const theme = this.theme;
      const mc = this._matCache = {};
      const M = (color, opts) => {
        opts = opts || {};
        const key = color + '|' + (opts.emissive || 0) + '|' + (opts.side === THREE.DoubleSide ? 'd' : '') + (opts.emissiveIntensity || 0);
        if (!mc[key]) mc[key] = U.mat(color, Object.assign({ flat: true }, opts));
        return mc[key];
      };
      const gc = {};
      const G = (key, make) => gc[key] || (gc[key] = make());

      this.dynGroup = new THREE.Group();
      this.dynGroup.name = 'dynamic';
      this.group.add(this.dynGroup);

      /* ---------- 支撑柱 ---------- */
      const pillarGeo = G('pillar', () => new THREE.CylinderGeometry(0.9, 1.5, 1, 8));
      const beamGeo = G('beam', () => new THREE.BoxGeometry(1, 1.0, 2.2));
      const pillarMat = M(theme.scenery === 'volcano' ? 0x3a2a26 : 0xb9c4d8);
      const seen = new Set();
      for (let i = 0; i < N; i += 10) {
        const sm = this.samples[i];
        if (sm.roll > 0.12 && sm.roll < Math.PI * 1.88) continue;
        const groundY = Math.min(this.terrainHeightAt(sm.p.x, sm.p.z), -3.0);
        const topY = sm.p.y - 1.7;
        const h = topY - groundY;
        if (h < 6) continue;
        const key = Math.round(sm.p.x / 36) + ',' + Math.round(sm.p.z / 36);
        if (seen.has(key)) continue;
        seen.add(key);
        for (const sg of [-1, 1]) {
          const leg = new THREE.Mesh(pillarGeo, pillarMat);
          leg.scale.set(1, h, 1);
          leg.position.copy(sm.p)
            .addScaledVector(sm.side, sg * sm.width * 0.44)
            .addScaledVector(sm.normal, -(h * 0.5 + 1.55));
          this.decorGroup.add(leg);
        }
        const beam = new THREE.Mesh(beamGeo, pillarMat);
        beam.scale.x = sm.width * 0.74;
        beam.position.copy(sm.p).addScaledVector(sm.normal, -1.9);
        beam.quaternion.copy(U.quatFromBasis(sm.t, new THREE.Vector3(0, 1, 0)));
        this.decorGroup.add(beam);
      }

      /* ---------- 通用植被几何 ---------- */
      const trunkGeo = G('trunk', () => new THREE.CylinderGeometry(0.55, 0.85, 4.2, 6));
      const pineGeos = G('pine', () => [0, 1, 2].map(k => new THREE.ConeGeometry(4.4 - k * 1.05, 4.4, 7)));
      const roundGeo = G('round', () => new THREE.SphereGeometry(3.4, 8, 6));
      const trunkMat = M(theme.trunk);
      const leafMats = theme.leaves.map(c => M(c));
      const pickLeaf = () => leafMats[(Math.random() * leafMats.length) | 0];

      const mkPine = () => {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 2.1;
        g.add(trunk);
        const mat = pickLeaf();
        for (let k = 0; k < 3; k++) {
          const c = new THREE.Mesh(pineGeos[k], mat);
          c.position.y = 4.2 + k * 2.5;
          g.add(c);
        }
        return g;
      };
      const mkRound = () => {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 2.1;
        g.add(trunk);
        const mat = pickLeaf();
        for (let k = 0; k < 3; k++) {
          const s = new THREE.Mesh(roundGeo, mat);
          s.position.set(U.rand(-1.6, 1.6), 5.2 + U.rand(-0.6, 1.4), U.rand(-1.6, 1.6));
          s.scale.setScalar(U.rand(0.7, 1.15));
          g.add(s);
        }
        return g;
      };
      const bushGeo = G('bush', () => new THREE.SphereGeometry(1, 7, 5));
      const mkBush = () => {
        const g = new THREE.Group();
        const mat = pickLeaf();
        for (let k = 0; k < 4; k++) {
          const s = new THREE.Mesh(bushGeo, mat);
          s.position.set(U.rand(-2, 2), U.rand(0.6, 1.6), U.rand(-2, 2));
          s.scale.setScalar(U.rand(1.4, 2.6));
          g.add(s);
        }
        return g;
      };
      const flowerStem = G('fstem', () => new THREE.CylinderGeometry(0.08, 0.1, 1.1, 4));
      const petalGeo = G('petal', () => new THREE.SphereGeometry(0.26, 6, 5));
      const coreGeo = G('core', () => new THREE.SphereGeometry(0.18, 6, 5));
      const petalMats = [M(0xffe066), M(0xff6b9d), M(0xffffff), M(0xff8b3d), M(0xb388ff)];
      const stemMat = M(0x4caf50);
      const coreMat = M(0xffd60a);
      const mkFlower = () => {
        const g = new THREE.Group();
        const stem = new THREE.Mesh(flowerStem, stemMat);
        stem.position.y = 0.55;
        g.add(stem);
        const petalMat = petalMats[(Math.random() * petalMats.length) | 0];
        for (let k = 0; k < 5; k++) {
          const p = new THREE.Mesh(petalGeo, petalMat);
          const a = (k / 5) * TAU;
          p.position.set(Math.cos(a) * 0.32, 1.15, Math.sin(a) * 0.32);
          g.add(p);
        }
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.y = 1.15;
        g.add(core);
        return g;
      };

      /* ---------- 问号方块 ---------- */
      const blockMat = (() => {
        if (mc.__block) return mc.__block;
        const texC = U.canvas(64, 64), bx = texC.getContext('2d');
        bx.fillStyle = '#f2a20c'; bx.fillRect(0, 0, 64, 64);
        bx.strokeStyle = '#b06d00'; bx.lineWidth = 4;
        bx.strokeRect(2, 2, 60, 60);
        bx.fillStyle = '#fff7d6'; bx.font = 'bold 42px system-ui';
        bx.textAlign = 'center'; bx.textBaseline = 'middle';
        bx.fillText('?', 32, 34);
        mc.__block = new THREE.MeshLambertMaterial({ map: (function(t){t.encoding=THREE.sRGBEncoding;return t;})(new THREE.CanvasTexture(texC)), color: 0xffffff });
        return mc.__block;
      })();
      const blockGeo = G('block', () => new THREE.BoxGeometry(3.2, 3.2, 3.2));
      const mkBlock = () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(blockGeo, blockMat));
        return g;
      };

      /* ---------- 旗帜 / 看台 ---------- */
      const flagMats = [M(0xe63946, { side: THREE.DoubleSide }), M(0x2a9df4, { side: THREE.DoubleSide }), M(0xffd60a, { side: THREE.DoubleSide }), M(0x43aa8b, { side: THREE.DoubleSide })];
      const mkFlag = () => {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(G('fpole', () => new THREE.CylinderGeometry(0.18, 0.18, 11, 6)), M(0xe9eef7));
        pole.position.y = 5.5;
        g.add(pole);
        const cloth = new THREE.Mesh(G('fcloth', () => new THREE.PlaneGeometry(5, 3, 6, 1)), flagMats[(Math.random() * flagMats.length) | 0]);
        cloth.position.set(2.5, 9.2, 0);
        g.add(cloth);
        return g;
      };
      const standStepGeo = G('sstep', () => new THREE.BoxGeometry(30, 1.2, 2.6));
      const standBodyGeo = G('sbody', () => new THREE.CylinderGeometry(0.42, 0.5, 1.0, 6));
      const standHeadGeo = G('shead', () => new THREE.SphereGeometry(0.36, 7, 6));
      const crowdMats = [M(0xe63946), M(0x2a9df4), M(0xffd60a), M(0x43aa8b), M(0xf8961e), M(0xb5179e), M(0xffffff)];
      const skinTones = [M(0xf7d6b5), M(0xe0ac69), M(0x8d5524)];
      const standMat = M(0xd8e2f0);
      const mkStand = () => {
        const g = new THREE.Group();
        for (let k = 0; k < 5; k++) {
          const step = new THREE.Mesh(standStepGeo, standMat);
          step.position.set(0, 1.2 + k * 1.2, -k * 2.6);
          g.add(step);
          for (let i = 0; i < 11; i++) {
            if (Math.random() < 0.22) continue;
            const body = new THREE.Mesh(standBodyGeo, crowdMats[(Math.random() * crowdMats.length) | 0]);
            body.position.set(-13 + i * 2.6 + U.rand(-0.3, 0.3), 2.4 + k * 1.2, -k * 2.6 - 0.2);
            g.add(body);
            const head = new THREE.Mesh(standHeadGeo, skinTones[(Math.random() * skinTones.length) | 0]);
            head.position.set(body.position.x, 3.15 + k * 1.2, body.position.z);
            g.add(head);
          }
        }
        const roof = new THREE.Mesh(G('sroof', () => new THREE.BoxGeometry(32, 0.5, 15)), M(0xff8b3d));
        roof.position.set(0, 8.2, -5.5);
        g.add(roof);
        const poleGeo = G('spole', () => new THREE.CylinderGeometry(0.35, 0.35, 8.4, 6));
        const poleMat = M(0xbfcada);
        for (let k = 0; k < 4; k++) {
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.set(-14 + k * 9.3, 4.2, -12);
          g.add(pole);
        }
        return g;
      };

      /* ---------- 云 ---------- */
      const cloudMat = M(theme.cloud.color, { emissive: theme.cloud.emissive, emissiveIntensity: theme.cloud.int });
      const cloudGeo = G('cloud', () => new THREE.SphereGeometry(1, 9, 7));
      const mkCloud = (scale) => {
        const g = new THREE.Group();
        const n = U.randInt(4, 7);
        for (let k = 0; k < n; k++) {
          const s = new THREE.Mesh(cloudGeo, cloudMat);
          s.scale.set(U.rand(3.5, 7.5) * scale, U.rand(3.5, 7.5) * scale * 0.72, U.rand(3.5, 7.5) * scale);
          s.position.set(U.rand(-11, 11) * scale, U.rand(-1.4, 2.4) * scale, U.rand(-5, 5) * scale);
          g.add(s);
        }
        return g;
      };

      /* ---------- 布置工具 ---------- */
      const place = (factory, count, minD, maxD, scaleRange, collideR) => {
        let placed = 0, tries = 0;
        while (placed < count && tries < count * 40) {
          tries++;
          const i = rng.int(0, N - 1);
          const sm = this.samples[i];
          const dir = rng.sign();
          const dist = rng.range(minD, maxD);
          const p = sm.p.clone().addScaledVector(sm.side, dir * dist);
          if (this.distanceToTrackXZ(p.x, p.z) < sm.width * 0.5 + 5) continue;
          const gy = this.terrainHeightAt(p.x, p.z);
          if (gy > sm.p.y + 30) continue;
          const obj = factory(rng);
          const sc = rng.range(scaleRange[0], scaleRange[1]);
          obj.scale.setScalar(sc);
          obj.position.set(p.x, gy, p.z);
          obj.rotation.y = rng.range(0, TAU);
          this.decorGroup.add(obj);
          // 大树 / 岩石 / 柱子之类给一个圆形碰撞体，避免车直接穿过去
          if (collideR) {
            this.colliders.push({ x: p.x, z: p.z, y: gy, r: collideR * sc });
          }
          placed++;
        }
      };

      /* ============================================================
         主题专属道具
         ============================================================ */
      const V = theme.scenery;

      const cactusMat = M(0x4f8f45);
      const mkCactus = () => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(G('cact', () => new THREE.CylinderGeometry(1.1, 1.4, 7, 8)), cactusMat);
        body.position.y = 3.5;
        g.add(body);
        [-1, 1].forEach(sg => {
          const arm = new THREE.Mesh(G('cactarm', () => new THREE.CylinderGeometry(0.55, 0.6, 3.2, 6)), cactusMat);
          arm.position.set(sg * 1.5, 4.2, 0);
          arm.rotation.z = sg * 0.55;
          g.add(arm);
          const tip = new THREE.Mesh(G('cactip', () => new THREE.SphereGeometry(0.56, 6, 5)), cactusMat);
          tip.position.set(sg * 2.5, 5.4, 0);
          g.add(tip);
        });
        return g;
      };
      const rockMat = M(0x9a7a52);
      const rockGeo = G('rock', () => new THREE.DodecahedronGeometry(1, 0));
      const mkRock = () => {
        const g = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const s = new THREE.Mesh(rockGeo, rockMat);
          s.position.set(U.rand(-2, 2), U.rand(0.3, 1.4), U.rand(-2, 2));
          s.scale.set(U.rand(1.5, 3.4), U.rand(1.0, 2.2), U.rand(1.5, 3.4));
          s.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(0, 3));
          g.add(s);
        }
        return g;
      };
      const mkPyramid = () => {
        const g = new THREE.Group();
        const p = new THREE.Mesh(G('pyr', () => new THREE.ConeGeometry(1, 1, 4)), M(0xd8b878));
        p.scale.set(26, 34, 26);
        p.position.y = 17;
        p.rotation.y = Math.PI / 4;
        g.add(p);
        const cap = new THREE.Mesh(G('pyrcap', () => new THREE.ConeGeometry(1, 1, 4)), M(0xf6dd9a));
        cap.scale.set(4.4, 5.6, 4.4);
        cap.position.y = 31.2;
        cap.rotation.y = Math.PI / 4;
        g.add(cap);
        return g;
      };
      const iceMat = M(0xa8e0f8, { emissive: 0x2a6f90, emissiveIntensity: 0.35 });
      const mkIce = () => {
        const g = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const c = new THREE.Mesh(G('ice', () => new THREE.ConeGeometry(1, 1, 5)), iceMat);
          const h = U.rand(4, 11);
          c.scale.set(U.rand(1.0, 2.0), h, U.rand(1.0, 2.0));
          c.position.set(U.rand(-3, 3), h / 2, U.rand(-3, 3));
          c.rotation.y = U.rand(0, TAU);
          g.add(c);
        }
        return g;
      };
      const snowLeaf = M(0xe8f6ff);
      const mkSnowPine = () => {
        const g = mkPine();
        for (let k = 0; k < 3; k++) {
          const c = new THREE.Mesh(pineGeos[k], snowLeaf);
          c.position.y = 4.2 + k * 2.5;
          c.scale.setScalar(0.72 - k * 0.06);
          g.add(c);
        }
        return g;
      };
      const caneRed = M(0xff4f7f);
      const caneWhite = M(0xfff6fb);
      const caneSegGeo = G('caneseg', () => new THREE.CylinderGeometry(0.75, 0.75, 1.1, 10));
      const mkCane = () => {
        const g = new THREE.Group();
        for (let k = 0; k < 8; k++) {
          const seg = new THREE.Mesh(caneSegGeo, k % 2 ? caneWhite : caneRed);
          seg.position.y = 0.55 + k * 1.05;
          g.add(seg);
        }
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI;
          const seg = new THREE.Mesh(caneSegGeo, k % 2 ? caneWhite : caneRed);
          seg.position.set(1.9 - Math.cos(a) * 1.9, 8.9 + Math.sin(a) * 1.9, 0);
          seg.rotation.z = -a;
          g.add(seg);
        }
        return g;
      };
      const mkLolli = () => {
        const g = new THREE.Group();
        const stick = new THREE.Mesh(G('lstick', () => new THREE.CylinderGeometry(0.24, 0.24, 9, 6)), M(0xfff8f0));
        stick.position.y = 4.5;
        g.add(stick);
        const head = new THREE.Mesh(G('lhead', () => new THREE.SphereGeometry(1, 16, 12)), M(0xff8fc7));
        head.scale.set(3.4, 3.4, 0.6);
        head.position.y = 9.8;
        g.add(head);
        const swirl = new THREE.Mesh(G('lswirl', () => new THREE.TorusGeometry(1, 0.16, 6, 20, Math.PI * 3)), M(0xffffff));
        swirl.scale.set(2.2, 2.2, 0.6);
        swirl.position.set(0, 9.8, 0.45);
        g.add(swirl);
        return g;
      };
      const deadMat = M(0x4a352c);
      const mkDead = () => {
        const g = new THREE.Group();
        const t = new THREE.Mesh(G('deadtrunk', () => new THREE.CylinderGeometry(0.5, 1.1, 8, 5)), deadMat);
        t.position.y = 4;
        g.add(t);
        for (let k = 0; k < 4; k++) {
          const b = new THREE.Mesh(G('deadbranch', () => new THREE.CylinderGeometry(0.2, 0.4, 4.2, 5)), deadMat);
          const a = (k / 4) * TAU;
          b.position.set(Math.cos(a) * 1.2, 5.2 + k * 0.8, Math.sin(a) * 1.2);
          b.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
          g.add(b);
        }
        return g;
      };
      const lavaMat = M(0x3a2a26);
      const lavaGlowMat = M(0xff6a1f, { emissive: 0xff4400, emissiveIntensity: 1.1 });
      const mkLavaRock = () => {
        const g = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const s = new THREE.Mesh(G('lrock', () => new THREE.DodecahedronGeometry(1, 0)), lavaMat);
          s.position.set(U.rand(-2.5, 2.5), U.rand(0.4, 1.6), U.rand(-2.5, 2.5));
          s.scale.set(U.rand(1.4, 3.2), U.rand(1.0, 2.4), U.rand(1.4, 3.2));
          s.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(0, 3));
          g.add(s);
        }
        const glow = new THREE.Mesh(G('lglow', () => new THREE.SphereGeometry(1, 8, 6)), lavaGlowMat);
        glow.position.y = 0.4;
        glow.scale.set(U.rand(1.2, 2.2), 0.35, U.rand(1.2, 2.2));
        g.add(glow);
        return g;
      };
      const mkVolcano = () => {
        const g = new THREE.Group();
        const cone = new THREE.Mesh(G('vcone', () => new THREE.ConeGeometry(1, 1, 12, 1, true)), M(0x3a2a26, { side: THREE.DoubleSide }));
        cone.scale.set(70, 62, 70);
        cone.position.y = 31;
        g.add(cone);
        const caldera = new THREE.Mesh(G('vcald', () => new THREE.SphereGeometry(1, 12, 6)),
          M(0xff6a1f, { emissive: 0xff3c00, emissiveIntensity: 1.3 }));
        caldera.scale.set(22, 4, 22);
        caldera.position.y = 60;
        g.add(caldera);
        const plume = new THREE.Mesh(G('vplume', () => new THREE.CylinderGeometry(1, 1.8, 1, 8, 1, true)),
          M(0x6a4a44, { side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
        plume.scale.set(16, 60, 16);
        plume.position.y = 92;
        g.add(plume);
        return g;
      };
      const palmLeafMat = M(0x2f9e4f, { side: THREE.DoubleSide });
      const palmLeafGeo = G('palmleaf', () => new THREE.ConeGeometry(1, 5.5, 4));
      const mkPalm = () => {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(G('palmtrunk', () => new THREE.CylinderGeometry(0.45, 0.85, 11, 7)), M(0xb08a55));
        trunk.position.y = 5.5;
        trunk.rotation.z = U.rand(-0.12, 0.12);
        g.add(trunk);
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * TAU;
          const leaf = new THREE.Mesh(palmLeafGeo, palmLeafMat);
          leaf.scale.set(1.5, 1, 0.28);
          leaf.position.set(Math.cos(a) * 2.4, 11.2, Math.sin(a) * 2.4);
          leaf.rotation.set(Math.cos(a) * 0.9, -a, -Math.sin(a) * 0.9);
          g.add(leaf);
        }
        return g;
      };
      const mkLighthouse = () => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(G('lhbody', () => new THREE.CylinderGeometry(4.2, 6.2, 26, 12)), M(0xf6f2e8));
        body.position.y = 13;
        g.add(body);
        for (let k = 0; k < 3; k++) {
          const band = new THREE.Mesh(G('lhband', () => new THREE.CylinderGeometry(1, 1, 3.4, 12)), M(0xe63946));
          const r = U.lerp(6.0, 4.4, (k * 9 + 5) / 26);
          band.scale.set(r, 1, r);
          band.position.y = 5 + k * 9;
          g.add(band);
        }
        const top = new THREE.Mesh(G('lhtop', () => new THREE.CylinderGeometry(4.8, 4.8, 2.2, 12)), M(0x2b2f3d));
        top.position.y = 26.5;
        g.add(top);
        const lamp = new THREE.Mesh(G('lhlamp', () => new THREE.SphereGeometry(3.2, 10, 8)),
          M(0xfff3b0, { emissive: 0xffd60a, emissiveIntensity: 1.3 }));
        lamp.position.y = 29.2;
        g.add(lamp);
        const roof = new THREE.Mesh(G('lhroof', () => new THREE.ConeGeometry(4.4, 4, 12)), M(0xe63946));
        roof.position.y = 33;
        g.add(roof);
        return g;
      };
      const mkParasol = () => {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(G('parapole', () => new THREE.CylinderGeometry(0.14, 0.14, 4.4, 6)), M(0xf0ece0));
        pole.position.y = 2.2;
        g.add(pole);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          const panel = new THREE.Mesh(G('parapanel', () => new THREE.ConeGeometry(1, 1.4, 3)), M(k % 2 ? 0xfff6e8 : 0xe63946, { side: THREE.DoubleSide }));
          panel.scale.set(1.6, 1, 1.6);
          panel.position.set(Math.cos(a) * 1.1, 4.4, Math.sin(a) * 1.1);
          panel.rotation.set(Math.cos(a) * 0.32, -a, -Math.sin(a) * 0.32);
          g.add(panel);
        }
        return g;
      };
      const winMat = M(0xffe066, { emissive: 0xffc93c, emissiveIntensity: 0.9 });
      const winMat2 = M(0x5fe0ff, { emissive: 0x2fa8e0, emissiveIntensity: 0.8 });
      const towerGeo = G('tower', () => new THREE.BoxGeometry(1, 1, 1));
      const towerWinGeo = G('twinner', () => new THREE.BoxGeometry(1, 0.9, 0.35));
      const neonMatA = M(0xff2f7f, { emissive: 0xff2f7f, emissiveIntensity: 1.2 });
      const neonMatB = M(0x5fe0ff, { emissive: 0x5fe0ff, emissiveIntensity: 1.2 });
      const neonGeo = G('tneon', () => new THREE.BoxGeometry(1, 1, 2));
      const towerBodyMats = [M(0x2a3050), M(0x22283f), M(0x353a5c)];
      const mkTower = () => {
        const g = new THREE.Group();
        const h = U.rand(24, 62);
        const w = U.rand(7, 13);
        const body = new THREE.Mesh(towerGeo, towerBodyMats[(Math.random() * 3) | 0]);
        body.scale.set(w, h, w * U.rand(0.7, 1.3));
        body.position.y = h / 2;
        g.add(body);
        const nWin = Math.floor(h / 7);
        for (let k = 1; k < nWin; k++) {
          const row = new THREE.Mesh(towerWinGeo, Math.random() < 0.3 ? winMat2 : winMat);
          row.scale.x = w * 0.8;
          row.position.set(0, k * 6.2, w * 0.5 + 0.1);
          g.add(row);
        }
        const neon = new THREE.Mesh(neonGeo, Math.random() < 0.5 ? neonMatA : neonMatB);
        neon.scale.set(w * 1.05, 1.2, 1.2);
        neon.position.set(0, h + 1.4, 0);
        g.add(neon);
        return g;
      };
      const mkLamp = () => {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(G('lamppost', () => new THREE.CylinderGeometry(0.24, 0.34, 8, 6)), M(0x3a4058));
        pole.position.y = 4;
        g.add(pole);
        const arm = new THREE.Mesh(G('lamporm', () => new THREE.BoxGeometry(2.4, 0.28, 0.28)), M(0x3a4058));
        arm.position.set(1.0, 8, 0);
        g.add(arm);
        const head = new THREE.Mesh(G('lamphead', () => new THREE.SphereGeometry(0.8, 8, 6)),
          M(0xfff0b8, { emissive: 0xffd860, emissiveIntensity: 1.4 }));
        head.position.set(2.1, 7.8, 0);
        g.add(head);
        return g;
      };
      const mesaMats = [M(0x9a4a30), M(0xb05a38), M(0x8a3f2a)];
      const mkMesa = () => {
        const g = new THREE.Group();
        const h = U.rand(18, 44);
        const r = U.rand(7, 15);
        const body = new THREE.Mesh(G('mesa', () => new THREE.CylinderGeometry(1, 1.12, 1, 9)), mesaMats[(Math.random() * 3) | 0]);
        body.scale.set(r, h, r);
        body.position.y = h / 2;
        g.add(body);
        const cap = new THREE.Mesh(G('mesacap', () => new THREE.CylinderGeometry(1, 1, 1, 9)), M(0xd08a5a));
        cap.scale.set(r * 1.06, 2.2, r * 1.06);
        cap.position.y = h - 0.6;
        g.add(cap);
        return g;
      };
      const bigLeafMat = M(0x2f8a42, { side: THREE.DoubleSide });
      const bigLeafGeo = G('bigleaf', () => new THREE.SphereGeometry(1, 7, 5, 0, Math.PI));
      const mkBigLeaf = () => {
        const g = new THREE.Group();
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU;
          const leaf = new THREE.Mesh(bigLeafGeo, bigLeafMat);
          leaf.scale.set(1.6, 0.28, 5.4);
          leaf.position.set(Math.cos(a) * 2.4, 1.2 + k * 0.3, Math.sin(a) * 2.4);
          leaf.rotation.set(0.3, -a, 0);
          g.add(leaf);
        }
        return g;
      };
      const mkRuinPillar = () => {
        const g = new THREE.Group();
        const h = U.rand(8, 20);
        const p = new THREE.Mesh(G('ruin', () => new THREE.CylinderGeometry(1.6, 2.0, 1, 8)), M(0x9a9a86));
        p.scale.y = h;
        p.position.y = h / 2;
        g.add(p);
        const cap = new THREE.Mesh(G('ruincap', () => new THREE.BoxGeometry(4.6, 1.2, 4.6)), M(0x8a8a76));
        cap.position.y = h + 0.6;
        g.add(cap);
        return g;
      };

      /* ---------- 地标：城堡 ---------- */
      const castle = new THREE.Group();
      const buildCastle = () => {
        const wallMat = M(0xe8dcc4);
        const roofMat = M(0xd94f4f);
        const base = new THREE.Mesh(G('cbase', () => new THREE.BoxGeometry(46, 26, 40)), wallMat);
        base.position.y = 13;
        castle.add(base);
        const merlonGeo = G('cmerlon', () => new THREE.BoxGeometry(4, 4, 4));
        for (let i = 0; i < 9; i++) {
          const c = new THREE.Mesh(merlonGeo, wallMat);
          c.position.set(-22 + i * 5.5, 28, 20);
          castle.add(c);
          const c2 = new THREE.Mesh(merlonGeo, wallMat);
          c2.position.set(-22 + i * 5.5, 28, -20);
          castle.add(c2);
        }
        const towerGeo = G('ctower', () => new THREE.CylinderGeometry(6.5, 7.8, 1, 10));
        const roofGeo = G('croof', () => new THREE.ConeGeometry(8.8, 13, 10));
        const winGeo = G('cwin', () => new THREE.BoxGeometry(2.2, 4, 0.8));
        const winMatB = M(0x2b2f3d);
        [[-19, -16], [19, -16], [0, -12]].forEach((p, k) => {
          const h = k === 2 ? 48 : 38;
          const t = new THREE.Mesh(towerGeo, wallMat);
          t.scale.y = h;
          t.position.set(p[0], h / 2, p[1]);
          castle.add(t);
          const roof = new THREE.Mesh(roofGeo, roofMat);
          roof.position.set(p[0], h + 6.5, p[1]);
          castle.add(roof);
          const win = new THREE.Mesh(winGeo, winMatB);
          win.position.set(p[0], h * 0.66, p[1] + 7.4);
          castle.add(win);
        });
        const door = new THREE.Mesh(G('cdoor', () => new THREE.BoxGeometry(9, 14, 1.4)), M(0x6b4a2f));
        door.position.set(0, 7, 20.4);
        castle.add(door);
        const flagPole = new THREE.Mesh(G('cflagpole', () => new THREE.CylinderGeometry(0.25, 0.25, 16, 6)), M(0xf0f0f0));
        flagPole.position.set(0, 54, -12);
        castle.add(flagPole);
        const flag = new THREE.Mesh(G('cflag', () => new THREE.PlaneGeometry(7, 4.5, 8, 2)), M(0xe63946, { side: THREE.DoubleSide }));
        flag.position.set(3.5, 60, -12);
        castle.add(flag);
      };

      /* ---------- 按主题布置 ---------- */
      if (V === 'meadow') {
        place(mkPine, 130, 14, 130, [0.7, 1.4], 1.25);
        place(mkRound, 110, 16, 140, [0.7, 1.3], 1.35);
        place(mkBush, 130, 10, 90, [0.7, 1.4]);
        place(mkFlower, 220, 9, 42, [0.8, 1.5]);
        const mushroomCapMats = [M(0xe63946), M(0xff8b3d), M(0x9b5de5), M(0x38b000)];
        const mkMushroomTree = () => {
          const g = new THREE.Group();
          const stem = new THREE.Mesh(G('mstem', () => new THREE.CylinderGeometry(1.2, 2.0, 8, 10)), M(0xf2e3c8));
          stem.position.y = 4;
          g.add(stem);
          const cap = new THREE.Mesh(G('mcap', () => new THREE.SphereGeometry(5.4, 16, 9, 0, TAU, 0, Math.PI * 0.54)),
            mushroomCapMats[(Math.random() * 4) | 0]);
          cap.position.y = 8.6;
          cap.scale.y = 0.8;
          g.add(cap);
          const spotMat = M(0xfff8e7);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + Math.random();
            const rr = U.rand(2.0, 4.2);
            const sp = new THREE.Mesh(G('mspot', () => new THREE.SphereGeometry(1.0, 8, 6)), spotMat);
            sp.position.set(Math.cos(a) * rr, 9.5 + U.rand(-0.4, 0.4), Math.sin(a) * rr);
            sp.scale.setScalar(U.rand(0.7, 1.3));
            g.add(sp);
          }
          return g;
        };
        place(mkMushroomTree, 24, 26, 120, [0.8, 1.5], 1.9);
        const mkPipe = () => {
          const g = new THREE.Group();
          const body = new THREE.Mesh(G('pipe', () => new THREE.CylinderGeometry(2.6, 2.6, 5.5, 14, 1, true)), M(0x2eb82e, { side: THREE.DoubleSide }));
          body.position.y = 2.75;
          g.add(body);
          const rim = new THREE.Mesh(G('piperim', () => new THREE.CylinderGeometry(3.1, 3.1, 1.1, 14, 1, true)), M(0x1f8b1f, { side: THREE.DoubleSide }));
          rim.position.y = 5.5;
          g.add(rim);
          const inner = new THREE.Mesh(G('pipein', () => new THREE.CircleGeometry(2.6, 16)), M(0x0a2a0a, { side: THREE.DoubleSide }));
          inner.rotation.x = -Math.PI / 2;
          inner.position.y = 5.4;
          g.add(inner);
          return g;
        };
        place(mkPipe, 16, 18, 70, [0.8, 1.4], 1.7);
        const mkPiranha = () => {
          const g = new THREE.Group();
          const stem = new THREE.Mesh(G('pstem', () => new THREE.CylinderGeometry(0.5, 0.75, 4.2, 8)), M(0x2e8b57));
          stem.position.y = 2.1;
          g.add(stem);
          const head = new THREE.Mesh(G('phead', () => new THREE.SphereGeometry(1.5, 10, 8)), M(0xd7263d));
          head.position.y = 4.6;
          head.scale.set(1, 0.85, 1);
          g.add(head);
          const lip = new THREE.Mesh(G('plip', () => new THREE.TorusGeometry(1.15, 0.35, 6, 14)), M(0xfff3d6));
          lip.position.y = 4.55;
          lip.rotation.x = Math.PI / 2;
          g.add(lip);
          return g;
        };
        place(mkPiranha, 20, 12, 55, [0.8, 1.3], 1.0);
        place(mkBlock, 16, 12, 50, [0.9, 1.4]);
        place(mkFlag, 12, 12, 34, [0.9, 1.3]);
        buildCastle();
        castle.position.set(-6, -3.2, 6);
        castle.rotation.y = -0.35;
        this.decorGroup.add(castle);
      } else if (V === 'beach') {
        place(mkPalm, 90, 14, 120, [0.8, 1.35], 1.1);
        place(mkBush, 70, 10, 80, [0.7, 1.3]);
        place(mkRock, 46, 12, 90, [0.8, 1.6], 2.1);
        place(mkParasol, 26, 10, 48, [0.9, 1.3], 0.7);
        place(mkFlag, 14, 12, 40, [0.9, 1.3]);
        place(mkBlock, 8, 14, 50, [0.9, 1.2]);
        if (this.def.theme !== 'sunset' && this.lake) {
          const lh = mkLighthouse();
          lh.scale.setScalar(1.5);
          lh.position.set(this.lake.x, -3.2, this.lake.z + this.lake.r + 12);
          this.decorGroup.add(lh);
        }
      } else if (V === 'desert') {
        place(mkCactus, 90, 14, 110, [0.8, 1.4], 1.25);
        place(mkRock, 70, 12, 100, [0.8, 1.7], 2.1);
        place(mkDead, 30, 16, 80, [0.7, 1.2], 0.9);
        place(mkFlag, 10, 14, 44, [0.9, 1.2]);
        const py = mkPyramid();
        py.scale.setScalar(1.2);
        py.position.set(Math.cos(2.1) * 420, -4, Math.sin(2.1) * 420);
        this.decorGroup.add(py);
        const py2 = mkPyramid();
        py2.scale.setScalar(0.85);
        py2.position.set(Math.cos(2.32) * 470, -4, Math.sin(2.32) * 470);
        this.decorGroup.add(py2);
      } else if (V === 'canyon') {
        place(mkMesa, 70, 18, 140, [0.7, 1.6], 4.5);
        place(mkRock, 60, 12, 100, [0.8, 1.6], 2.1);
        place(mkDead, 26, 16, 80, [0.7, 1.2], 0.9);
        place(mkFlag, 10, 12, 40, [0.9, 1.2]);
      } else if (V === 'snow') {
        place(mkSnowPine, 130, 14, 130, [0.75, 1.45], 1.2);
        place(mkIce, 60, 12, 100, [0.8, 1.6], 1.9);
        place(mkBush, 60, 10, 70, [0.7, 1.2]);
        place(mkRock, 30, 14, 90, [0.8, 1.4], 2.0);
        place(mkFlag, 10, 12, 40, [0.9, 1.2]);
      } else if (V === 'candy') {
        place(mkCane, 60, 14, 110, [0.8, 1.4], 1.0);
        place(mkLolli, 50, 14, 105, [0.8, 1.5], 0.9);
        place(mkBush, 80, 10, 80, [0.7, 1.3]);
        place(mkFlower, 120, 9, 45, [0.9, 1.6]);
        place(mkBlock, 12, 12, 50, [0.9, 1.3]);
        place(mkFlag, 10, 12, 40, [0.9, 1.2]);
      } else if (V === 'volcano') {
        place(mkDead, 80, 12, 110, [0.8, 1.4], 0.95);
        place(mkLavaRock, 80, 10, 100, [0.8, 1.6], 2.1);
        place(mkRock, 40, 14, 90, [0.8, 1.5], 2.1);
        place(mkFlag, 8, 14, 44, [0.9, 1.2]);
        const v = mkVolcano();
        v.position.set(Math.cos(3.6) * 560, -6, Math.sin(3.6) * 560);
        this.decorGroup.add(v);
      } else if (V === 'night') {
        place(mkTower, 70, 26, 150, [0.8, 1.6], 3.4);
        place(mkLamp, 60, 9, 40, [0.9, 1.2], 0.55);
        place(mkBush, 50, 10, 80, [0.7, 1.2]);
        place(mkFlag, 10, 12, 40, [0.9, 1.2]);
        place(mkBlock, 8, 14, 54, [0.9, 1.2]);
      } else if (V === 'jungle') {
        place(mkBigLeaf, 110, 10, 90, [0.8, 1.6], 1.2);
        place(mkPine, 90, 14, 120, [0.75, 1.4], 1.25);
        place(mkBush, 100, 9, 70, [0.8, 1.5]);
        place(mkRuinPillar, 26, 14, 70, [0.8, 1.4], 1.2);
        place(mkFlower, 110, 9, 40, [0.9, 1.5]);
        place(mkBlock, 12, 12, 50, [0.9, 1.3]);
      }

      /* ---------- 看台（起点两侧） ---------- */
      for (const sign of [-1, 1]) {
        const sm = this.samples[10];
        const g = mkStand();
        const p = sm.p.clone().addScaledVector(sm.side, sign * (sm.width * 0.5 + 20));
        const gy = this.terrainHeightAt(p.x, p.z);
        g.position.set(p.x, Math.min(gy, sm.p.y - 4), p.z);
        const dir = new THREE.Vector3().copy(sm.p).sub(p).setY(0).normalize();
        g.rotation.y = Math.atan2(dir.x, dir.z);
        this.decorGroup.add(g);
      }

      /* ---------- 云（动态） ---------- */
      this.clouds = [];
      const cloudCount = V === 'volcano' ? 14 : 24;
      for (let i = 0; i < cloudCount; i++) {
        const c = mkCloud(U.rand(0.9, 2.1));
        const a = rng.range(0, TAU), r = rng.range(150, 640);
        c.position.set(Math.cos(a) * r, rng.range(70, 150), Math.sin(a) * r);
        c.userData.base = c.position.clone();
        c.userData.speed = rng.range(0.5, 1.6);
        this.dynGroup.add(c);
        this.clouds.push(c);
      }

      /* ---------- 空中漂浮问号块（动态） ---------- */
      this.floaters = [];
      const flCount = V === 'meadow' ? 12 : 8;
      for (let i = 0; i < flCount; i++) {
        const b = mkBlock();
        const i2 = rng.int(0, N - 1);
        const sm = this.samples[i2];
        const sgn = rng.sign();
        b.position.copy(sm.p)
          .addScaledVector(sm.side, sgn * rng.range(sm.width * 0.62, sm.width * 0.95))
          .add(new THREE.Vector3(0, rng.range(3.5, 7.5), 0));
        b.scale.setScalar(rng.range(0.7, 1.1));
        this.dynGroup.add(b);
        this.floaters.push(b);
      }

      // 静态合批：把上千个网格合并成十几个 draw call
      U.bakeStatic(this.decorGroup);
    }

    /* ---------------- 天空 ---------------- */
    buildSky() {
      const th = this.theme;
      const geo = new THREE.SphereGeometry(2000, 32, 20);
      const mat = new THREE.MeshBasicMaterial({ map: TEX.sky, side: THREE.BackSide, depthWrite: false, fog: false });
      const sky = new THREE.Mesh(geo, mat);
      sky.name = 'sky';
      this.scene.add(sky);
      this.sky = sky;

      /* 星空 */
      if (th.stars > 0) {
        const n = 900;
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        const c = new THREE.Color();
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          // 只铺满上半球；acos 入参必须夹在 [-1,1]
          const ph = Math.acos(U.clamp(1 - Math.random() * 1.45, -1, 1));
          const r = 1750;
          pos[i * 3] = Math.cos(a) * Math.sin(ph) * r;
          pos[i * 3 + 1] = Math.abs(Math.cos(ph)) * r * 0.9 + 80;
          pos[i * 3 + 2] = Math.sin(a) * Math.sin(ph) * r;
          c.setHSL(0.55 + Math.random() * 0.12, 0.3, 0.7 + Math.random() * 0.3);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const stars = new THREE.Points(sg, new THREE.PointsMaterial({
          size: 7, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, fog: false
        }));
        this.scene.add(stars);
        this.stars = stars;
      }

      /* 太阳 / 月亮 */
      const sunTexC = U.canvas(256, 256);
      const sx = sunTexC.getContext('2d');
      const g = sx.createRadialGradient(128, 128, 8, 128, 128, 128);
      const sc = new THREE.Color(th.sun.color);
      const rgb = `${Math.round(sc.r * 255)},${Math.round(sc.g * 255)},${Math.round(sc.b * 255)}`;
      if (th.sun.moon) {
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.3, `rgba(${rgb},0.95)`);
        g.addColorStop(0.62, `rgba(${rgb},0.22)`);
      } else {
        g.addColorStop(0, 'rgba(255,255,245,1)');
        g.addColorStop(0.22, `rgba(${rgb},0.95)`);
        g.addColorStop(0.5, `rgba(${rgb},0.34)`);
      }
      g.addColorStop(1, `rgba(${rgb},0)`);
      sx.fillStyle = g; sx.fillRect(0, 0, 256, 256);
      const sun = new THREE.Mesh(new THREE.PlaneGeometry(th.sun.size, th.sun.size),
        new THREE.MeshBasicMaterial({ map: (function(t){t.encoding=THREE.sRGBEncoding;return t;})(new THREE.CanvasTexture(sunTexC)), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sun.position.set(th.sun.pos[0], th.sun.pos[1], th.sun.pos[2]);
      sun.lookAt(0, 0, 0);
      this.scene.add(sun);
      this.sun = sun;
    }

    /* ---------------- 小地图路径 ---------------- */
    buildMinimap() {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const s of this.samples) {
        minX = Math.min(minX, s.p.x); maxX = Math.max(maxX, s.p.x);
        minZ = Math.min(minZ, s.p.z); maxZ = Math.max(maxZ, s.p.z);
      }
      const pad = 20;
      const scale = 1 / Math.max(maxX - minX + pad * 2, maxZ - minZ + pad * 2);
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      this.minimap = {
        points: this.samples.map(s => ({
          x: 0.5 + (s.p.x - cx) * scale,
          y: 0.5 + (s.p.z - cz) * scale
        })),
        scale, cx, cz
      };
    }

    toMinimap(x, z) {
      const m = this.minimap;
      return { x: 0.5 + (x - m.cx) * m.scale, y: 0.5 + (z - m.cz) * m.scale };
    }

    /* ---------------- 每帧动画 ---------------- */
    update(dt, time) {
      if (this.clouds) {
        for (let i = 0; i < this.clouds.length; i++) {
          const c = this.clouds[i];
          c.position.x = c.userData.base.x + Math.sin(time * 0.08 * c.userData.speed + c.userData.base.z) * 14;
          c.position.z = c.userData.base.z + Math.cos(time * 0.06 * c.userData.speed) * 10;
        }
      }
      if (this.floaters) {
        for (let i = 0; i < this.floaters.length; i++) {
          const b = this.floaters[i];
          b.rotation.y += dt * 0.9;
          b.position.y += Math.sin(time * 1.6 + i) * dt * 0.35;
        }
      }
      if (this.water) this.water.material.opacity = 0.76 + Math.sin(time * 1.3) * 0.05;
      if (this.antiMat) this.antiMat.opacity = 0.11 + Math.sin(time * 3.0) * 0.04;
      if (this.antiRings) {
        for (let i = 0; i < this.antiRings.length; i++) {
          const r = this.antiRings[i];
          r.scale.z = 0.85 + Math.sin(time * 2.6 - i * 0.5) * 0.15;
        }
      }
      if (this.boostPads && this.boostPads.length && TEX.boost) {
        // 共享纹理 → 每帧只推进一次 offset
        TEX.boost.offset.y -= dt * 1.6;
      }
    }

    /* ---------------- 销毁 ---------------- */
    dispose() {
      const scene = this.scene;
      const disposeMesh = (root) => {
        root.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => {
              // 主题纹理跨赛道复用，只在非共享时才释放
              if (m.map && !m.map.userData.shared) m.map.dispose();
              m.dispose();
            });
          }
        });
      };
      disposeMesh(this.group);
      scene.remove(this.group);
      if (this.sky) { disposeMesh(this.sky); scene.remove(this.sky); this.sky = null; }
      if (this.sun) { disposeMesh(this.sun); scene.remove(this.sun); this.sun = null; }
      if (this.stars) { disposeMesh(this.stars); scene.remove(this.stars); this.stars = null; }
      this.samples = [];
      this.boostPads = [];
      this.ramps = [];
      this.colliders = [];
      this._grid = null;
      this.group = null;
    }
  }

  SK.Track = Track;
})();
