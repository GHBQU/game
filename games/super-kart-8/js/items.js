/* ============================================================
   Super Kart 8 — items.js
   道具：蘑菇 / 三连蘑菇 / 绿龟壳 / 红龟壳 / 香蕉 / 星星 / 闪电 / 炮弹
   金币收集 · 道具箱刷新 · 世界内投射物模拟
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;

  const r3 = (n) => Math.round(n * 1000) / 1000;

  const ITEM_DEF = {
    mushroom: { name: '加速蘑菇', icon: '🍄', color: '#ff6b6b' },
    tripleMushroom: { name: '三连蘑菇', icon: '🍄🍄', color: '#ff8b3d' },
    greenShell: { name: '绿龟壳', icon: '🟢', color: '#43aa8b' },
    redShell: { name: '红龟壳', icon: '🔴', color: '#e63946' },
    banana: { name: '香蕉皮', icon: '🍌', color: '#ffd60a' },
    star: { name: '无敌星', icon: '⭐', color: '#ffe066' },
    lightning: { name: '闪电', icon: '⚡', color: '#8ecae6' },
    bullet: { name: '炮弹刺客', icon: '🚀', color: '#495057' }
  };

  /* 名次 → 道具权重（越靠后越强，对齐马力欧卡丁车的「落后补偿」）
     8 行 = 8 个档位，每行权重和都是 100，方便验证单调性。
     第 1 名只给防御 / 干扰道具；越往后，三连蘑菇、星星、闪电、炮弹越多。 */
  const POOL = [
    // 1st  —— 完全没有翻盘道具
    { mushroom: 20, banana: 34, greenShell: 42, redShell: 4, tripleMushroom: 0, star: 0, lightning: 0, bullet: 0 },
    // 2nd
    { mushroom: 22, banana: 24, greenShell: 34, redShell: 16, tripleMushroom: 4, star: 0, lightning: 0, bullet: 0 },
    // 3rd
    { mushroom: 20, banana: 16, greenShell: 24, redShell: 26, tripleMushroom: 10, star: 3, lightning: 1, bullet: 0 },
    // 4th
    { mushroom: 19, banana: 10, greenShell: 15, redShell: 28, tripleMushroom: 14, star: 7, lightning: 4, bullet: 3 },
    // 5th
    { mushroom: 17, banana: 6, greenShell: 10, redShell: 24, tripleMushroom: 18, star: 11, lightning: 7, bullet: 7 },
    // 6th
    { mushroom: 15, banana: 4, greenShell: 6, redShell: 20, tripleMushroom: 22, star: 14, lightning: 9, bullet: 10 },
    // 7th
    { mushroom: 13, banana: 3, greenShell: 4, redShell: 14, tripleMushroom: 24, star: 16, lightning: 11, bullet: 15 },
    // 8th  —— 86% 是翻盘级道具
    { mushroom: 10, banana: 2, greenShell: 2, redShell: 10, tripleMushroom: 24, star: 17, lightning: 14, bullet: 21 }
  ];
  const ITEM_KEYS = Object.keys(POOL[0]);
  // 「翻盘级」道具：原作里 CPU 几乎拿不到这些（Bullet Bill / 闪电 / 星星），
  // 玩家则完整享受落后补偿。AI 侧用 powerScale 降权，避免 7 台落后 AI 集体开挂。
  const COMEBACK = { tripleMushroom: 1, star: 1, lightning: 1, bullet: 1 };
  const GUARD = ['mushroom', 'banana', 'greenShell'];

  /* 相对名次 → 权重行（相邻两行线性插值）。
     frac = 0 表示第 1 名，frac = 1 表示最后一名。 */
  function poolAt(frac) {
    const x = U.clamp01(frac) * (POOL.length - 1);
    const i0 = Math.floor(x);
    const i1 = Math.min(POOL.length - 1, i0 + 1);
    const t = x - i0;
    if (i0 === i1 || t <= 0) return POOL[i0];
    const out = {};
    for (let i = 0; i < ITEM_KEYS.length; i++) {
      const k = ITEM_KEYS[i];
      out[k] = POOL[i0][k] * (1 - t) + POOL[i1][k] * t;
    }
    return out;
  }

  /* position: 当前名次(1 起)  total: 本场参赛车数
     关键：按「相对名次」而不是绝对名次取表。8 人局第 1~8 名精确对应 8 行；
     2 人局里第 2 名就是最后一名，直接拿最强档，不会出现「垫底却只给弱道具」。 */
  function rollItem(position, total, rng, powerScale) {
    const n = U.clamp((total | 0) || POOL.length, 2, POOL.length);
    const frac = (U.clamp(position, 1, n) - 1) / (n - 1);
    const table = poolAt(frac);
    const rand = rng || Math.random;
    const scale = (powerScale === undefined || powerScale === null) ? 1 : U.clamp01(powerScale);

    // 默认（玩家）直接用原表；AI 按难度把翻盘道具降权，砍掉的权重回补给防御道具，总和仍为 100
    const w = {};
    let sum = 0, cut = 0;
    for (let i = 0; i < ITEM_KEYS.length; i++) {
      const k = ITEM_KEYS[i];
      const nw = (scale < 1 && COMEBACK[k]) ? table[k] * scale : table[k];
      w[k] = nw;
      sum += nw;
      cut += table[k] - nw;
    }
    if (cut > 0) {
      let gsum = 0;
      for (let i = 0; i < GUARD.length; i++) gsum += w[GUARD[i]];
      if (gsum <= 0) { w[GUARD[0]] += cut; sum += cut; }
      else {
        for (let i = 0; i < GUARD.length; i++) {
          const add = cut * w[GUARD[i]] / gsum;
          w[GUARD[i]] += add;
          sum += add;
        }
      }
    }

    let r = rand() * sum;
    for (let i = 0; i < ITEM_KEYS.length; i++) {
      const k = ITEM_KEYS[i];
      r -= w[k];
      if (r <= 0) return k;
    }
    return 'mushroom';
  }

  /* ---------------- 模型工厂 ---------------- */
  const Geo = {};
  function shellMesh(color) {
    const g = new THREE.Group();
    const domeMat = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0xfff8e7, flatShading: true });
    const innerMat = new THREE.MeshLambertMaterial({ color: 0xfaf0d5, flatShading: true });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), domeMat);
    dome.position.y = 0.12;
    g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 6, 16), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.12;
    g.add(rim);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.58, 16), innerMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.1;
    g.add(bottom);
    // 六边形纹路
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.14, 6), innerMat);
      s.position.set(Math.cos(a) * 0.38, 0.2, Math.sin(a) * 0.38);
      s.rotation.x = -Math.PI / 2 + 0.35;
      s.rotation.z = a;
      g.add(s);
    }
    return g;
  }

  function bananaMesh() {
    const g = new THREE.Group();
    const peelMat = new THREE.MeshLambertMaterial({ color: 0xffd60a, flatShading: true, side: THREE.DoubleSide });
    const tipMat = new THREE.MeshLambertMaterial({ color: 0x8a6a1a, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const peel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 6, 10, Math.PI * 0.9), peelMat);
      peel.rotation.set(Math.PI / 2, 0, a);
      peel.position.y = 0.18 + i * 0.02;
      g.add(peel);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 8), peelMat);
    core.position.y = 0.42;
    g.add(core);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), tipMat);
    tip.position.y = 0.68;
    g.add(tip);
    g.scale.setScalar(0.95);
    return g;
  }

  function bulletMesh() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2b2f3d, flatShading: true });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.6, 1.4, 6, 10)
      : new THREE.CylinderGeometry(0.6, 0.6, 2, 10), bodyMat);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.8, 10), new THREE.MeshLambertMaterial({ color: 0xe63946 }));
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = -1.1;
    g.add(cone);
    [-1, 1].forEach(s => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      eye.position.set(s * 0.24, 0.22, -0.5);
      g.add(eye);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      p.position.set(s * 0.24, 0.22, -0.62);
      g.add(p);
    });
    return g;
  }

  /* ---------------- 道具图标（Canvas 绘制，避免 emoji 依赖） ---------------- */
  const ICON_CACHE = {};
  function iconCanvas() {
    const c = U.canvas(128, 128);
    return { c, x: c.getContext('2d') };
  }
  function roundRect(x, r, a, b, w, h) {
    x.beginPath();
    x.moveTo(a + r, b);
    x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
    x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
    x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r);
    x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b);
    x.closePath();
  }

  function drawMushroom(x, cx, cy, r, capColor) {
    // 菌柄
    x.fillStyle = '#f4e3c6';
    roundRect(x, r * 0.28, cx - r * 0.62, cy + r * 0.05, r * 1.24, r * 1.05);
    x.fill();
    x.fillStyle = 'rgba(0,0,0,0.12)';
    x.fillRect(cx - r * 0.62, cy + r * 0.62, r * 1.24, r * 0.1);
    // 菌盖
    const g = x.createLinearGradient(cx, cy - r, cx, cy + r * 0.35);
    g.addColorStop(0, '#ff8a8a');
    g.addColorStop(0.45, capColor);
    g.addColorStop(1, '#9e1b22');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx - r * 1.1, cy + r * 0.12);
    x.bezierCurveTo(cx - r * 1.1, cy - r * 0.95, cx + r * 1.1, cy - r * 0.95, cx + r * 1.1, cy + r * 0.12);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(90,10,10,0.45)'; x.lineWidth = r * 0.07; x.stroke();
    // 白点
    x.fillStyle = '#fffdf5';
    [[-0.5, -0.2, 0.26], [0.42, -0.34, 0.2], [0.02, -0.58, 0.18], [-0.12, -0.02, 0.15]].forEach(p => {
      x.beginPath();
      x.ellipse(cx + p[0] * r, cy + p[1] * r, p[2] * r, p[2] * r * 0.85, 0, 0, Math.PI * 2);
      x.fill();
    });
    // 眼
    x.fillStyle = '#2a2035';
    x.beginPath(); x.ellipse(cx - r * 0.2, cy + r * 0.45, r * 0.07, r * 0.11, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(cx + r * 0.2, cy + r * 0.45, r * 0.07, r * 0.11, 0, 0, 7); x.fill();
  }

  function drawShell(x, cx, cy, r, color, dark) {
    const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.45, r * 0.1, cx, cy, r * 1.05);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, color);
    g.addColorStop(1, dark);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx - r * 0.95, cy + r * 0.42);
    x.bezierCurveTo(cx - r * 1.0, cy - r * 0.95, cx + r * 1.0, cy - r * 0.95, cx + r * 0.95, cy + r * 0.42);
    x.closePath();
    x.fill();
    // 六边形纹
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = r * 0.06;
    for (let i = -1; i <= 1; i++) {
      x.beginPath();
      x.arc(cx + i * r * 0.38, cy - r * 0.12, r * 0.22, 0, Math.PI * 2);
      x.stroke();
    }
    // 边沿
    x.fillStyle = '#fff8e7';
    roundRect(x, r * 0.16, cx - r * 0.98, cy + r * 0.34, r * 1.96, r * 0.34);
    x.fill();
    x.strokeStyle = 'rgba(120,90,40,0.35)'; x.lineWidth = r * 0.05;
    roundRect(x, r * 0.16, cx - r * 0.98, cy + r * 0.34, r * 1.96, r * 0.34);
    x.stroke();
  }

  function drawBanana(x, cx, cy, r) {
    const g = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#fff6a8');
    g.addColorStop(0.4, '#ffd60a');
    g.addColorStop(1, '#d99400');
    x.strokeStyle = g;
    x.lineWidth = r * 0.34;
    x.lineCap = 'round';
    x.beginPath();
    x.arc(cx, cy - r * 0.35, r * 0.78, 0.35, Math.PI - 0.35);
    x.stroke();
    x.strokeStyle = '#8a6a1a';
    x.lineWidth = r * 0.12;
    x.beginPath();
    x.moveTo(cx - r * 0.7, cy + r * 0.5); x.lineTo(cx - r * 0.78, cy + r * 0.74);
    x.moveTo(cx + r * 0.7, cy + r * 0.5); x.lineTo(cx + r * 0.78, cy + r * 0.74);
    x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.5)';
    x.beginPath();
    x.ellipse(cx - r * 0.2, cy - r * 0.6, r * 0.32, r * 0.1, -0.4, 0, 7);
    x.fill();
  }

  function drawStar(x, cx, cy, r) {
    const g = x.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#fffde0');
    g.addColorStop(0.5, '#ffd93b');
    g.addColorStop(1, '#e59a10');
    x.fillStyle = g;
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
    x.fill();
    x.strokeStyle = '#b8730a'; x.lineWidth = r * 0.08; x.stroke();
    x.fillStyle = '#3a2600';
    x.beginPath(); x.ellipse(cx - r * 0.18, cy - r * 0.02, r * 0.07, r * 0.1, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(cx + r * 0.18, cy - r * 0.02, r * 0.07, r * 0.1, 0, 0, 7); x.fill();
  }

  function drawLightning(x, cx, cy, r) {
    const g = x.createLinearGradient(cx, cy - r, cx, cy + r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#ffe066');
    g.addColorStop(1, '#ffa000');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx + r * 0.12, cy - r);
    x.lineTo(cx - r * 0.55, cy + r * 0.12);
    x.lineTo(cx - r * 0.05, cy + r * 0.12);
    x.lineTo(cx - r * 0.2, cy + r);
    x.lineTo(cx + r * 0.6, cy - r * 0.18);
    x.lineTo(cx + r * 0.06, cy - r * 0.18);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(180,110,0,0.6)'; x.lineWidth = r * 0.06; x.stroke();
  }

  function drawBullet(x, cx, cy, r) {
    x.fillStyle = '#2b2f3d';
    x.beginPath();
    x.ellipse(cx, cy + r * 0.1, r * 0.62, r * 0.8, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#e63946';
    x.beginPath();
    x.moveTo(cx, cy - r * 0.95);
    x.quadraticCurveTo(cx + r * 0.5, cy - r * 0.4, cx + r * 0.5, cy - r * 0.1);
    x.lineTo(cx - r * 0.5, cy - r * 0.1);
    x.quadraticCurveTo(cx - r * 0.5, cy - r * 0.4, cx, cy - r * 0.95);
    x.fill();
    x.fillStyle = '#fff';
    x.beginPath(); x.ellipse(cx - r * 0.22, cy - r * 0.3, r * 0.13, r * 0.16, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(cx + r * 0.22, cy - r * 0.3, r * 0.13, r * 0.16, 0, 0, 7); x.fill();
    x.fillStyle = '#111';
    x.beginPath(); x.ellipse(cx - r * 0.22, cy - r * 0.3, r * 0.07, r * 0.09, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(cx + r * 0.22, cy - r * 0.3, r * 0.07, r * 0.09, 0, 0, 7); x.fill();
    // 尾焰
    x.fillStyle = '#ffb703';
    x.beginPath();
    x.moveTo(cx - r * 0.3, cy + r * 0.78);
    x.lineTo(cx, cy + r * 1.12);
    x.lineTo(cx + r * 0.3, cy + r * 0.78);
    x.closePath(); x.fill();
  }

  function iconFor(type) {
    if (ICON_CACHE[type]) return ICON_CACHE[type];
    const { c, x } = iconCanvas();
    if (type === 'mushroom') drawMushroom(x, 64, 68, 34, '#e63946');
    else if (type === 'tripleMushroom') {
      drawMushroom(x, 44, 88, 22, '#ff8b3d');
      drawMushroom(x, 84, 88, 22, '#e63946');
      drawMushroom(x, 64, 56, 24, '#43aa8b');
    } else if (type === 'greenShell') drawShell(x, 64, 66, 36, '#4ade80', '#15803d');
    else if (type === 'redShell') drawShell(x, 64, 66, 36, '#ff6b6b', '#b91c1c');
    else if (type === 'banana') drawBanana(x, 64, 58, 34);
    else if (type === 'star') drawStar(x, 64, 64, 40);
    else if (type === 'lightning') drawLightning(x, 64, 64, 42);
    else if (type === 'bullet') drawBullet(x, 64, 58, 34);
    const url = c.toDataURL('image/png');
    ICON_CACHE[type] = url;
    return url;
  }

  /* ---------------- 开箱特效池 ---------------- */
  function radialTex(size, inner, outer) {
    const c = U.canvas(size, size);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.32, outer);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  const SHARD_COLORS = [0xff4d6d, 0xffd60a, 0x4fc3f7, 0x7bdc6a, 0xb388ff, 0xffa94d];
  let GLOW_TEX = null;

  class BoxFX {
    constructor(scene) {
      this.scene = scene;
      this.shardGeo = new THREE.OctahedronGeometry(0.38, 0);
      this.mats = SHARD_COLORS.map(c => new THREE.MeshLambertMaterial({
        color: c, emissive: c, emissiveIntensity: 0.55,
        transparent: true, opacity: 1, depthWrite: false
      }));
      this.shards = [];
      for (let i = 0; i < 72; i++) {
        const m = new THREE.Mesh(this.shardGeo, this.mats[i % this.mats.length]);
        m.visible = false;
        m.renderOrder = 4;
        m.frustumCulled = false;
        scene.add(m);
        this.shards.push({ mesh: m, life: 0, maxLife: 1, active: false, vel: new THREE.Vector3(), spin: new THREE.Vector3(), scale: 1 });
      }
      if (!GLOW_TEX) GLOW_TEX = radialTex(128, 'rgba(255,255,255,1)', 'rgba(150,230,255,0.75)');
      this.glows = [];
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: GLOW_TEX, color: 0xffffff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        sp.visible = false;
        sp.renderOrder = 5;
        scene.add(sp);
        this.glows.push({ sprite: sp, life: 0, maxLife: 1, size: 1 });
      }
    }

    burst(pos, colorTint) {
      const base = pos.clone();
      // 晶体碎片
      for (let i = 0; i < 24; i++) {
        let s = this.shards.find(x => !x.active);
        if (!s) break;
        s.active = true;
        s.life = s.maxLife = U.rand(0.6, 0.92);
        s.scale = U.rand(0.65, 1.2);
        s.mesh.position.copy(base).add(new THREE.Vector3(U.rand(-0.35, 0.35), U.rand(-0.3, 0.45), U.rand(-0.35, 0.35)));
        s.vel.set(U.rand(-1, 1), U.rand(-0.1, 1), U.rand(-1, 1)).normalize().multiplyScalar(U.rand(2.6, 5.6));
        s.vel.y += U.rand(1.4, 3.6);
        s.spin.set(U.rand(-14, 14), U.rand(-14, 14), U.rand(-14, 14));
        s.mesh.rotation.set(U.rand(0, 6), U.rand(0, 6), U.rand(0, 6));
        s.mesh.material = this.mats[(Math.random() * this.mats.length) | 0];
        s.mesh.scale.setScalar(s.scale);
        s.mesh.visible = true;
      }
      // 中心闪光
      for (let i = 0; i < 2; i++) {
        const g = this.glows.find(x => x.life <= 0);
        if (!g) break;
        g.life = g.maxLife = 0.3 + i * 0.12;
        g.size = i === 0 ? 9.5 : 5.2;
        g.sprite.position.copy(base);
        g.sprite.material.color.set(i === 0 ? 0xffffff : (colorTint || 0x9be7ff));
        g.sprite.material.opacity = 0.95;
        g.sprite.scale.setScalar(1.2);
        g.sprite.visible = true;
      }
    }

    update(dt) {
      for (let i = 0; i < this.shards.length; i++) {
        const s = this.shards[i];
        if (!s.active) continue;
        s.life -= dt;
        if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
        s.vel.y -= 18 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.mesh.rotation.x += s.spin.x * dt;
        s.mesh.rotation.y += s.spin.y * dt;
        s.mesh.rotation.z += s.spin.z * dt;
        const t = 1 - s.life / s.maxLife;
        s.mesh.scale.setScalar(s.scale * (1 - t * t) * (t < 0.1 ? 0.5 + t * 5 : 1));
      }
      for (let i = 0; i < this.glows.length; i++) {
        const g = this.glows[i];
        if (g.life <= 0) continue;
        g.life -= dt;
        if (g.life <= 0) { g.sprite.visible = false; continue; }
        const t = 1 - g.life / g.maxLife;
        g.sprite.scale.setScalar(U.lerp(1.2, g.size, U.easeOutCubic(t)));
        g.sprite.material.opacity = 0.95 * (1 - t);
      }
    }
  }

  /* ============================================================ */
  class ItemSystem {
    constructor(scene, track, particles) {
      this.scene = scene;
      this.track = track;
      this.particles = particles;
      this.boxes = [];
      this.coins = [];
      this.shells = [];
      this.bananas = [];
      this.bullets = [];
      this.fx = new BoxFX(scene);
      this.buildBoxes();
      this.buildCoins();
    }

    buildBoxes() {
      const tex = SK.trackTextures.box;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1.0, side: THREE.FrontSide });
      const innerMat = new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
      this.boxGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
      this.boxInnerGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
      this.boxMat = mat;
      this.boxInnerMat = innerMat;
      const spots = this.track.itemBoxSpots;
      for (let i = 0; i < spots.length; i++) {
        const sp = spots[i];
        const f = this.track.sampleAt(sp.s);
        const crown = this.track.crownAt ? this.track.crownAt(sp.lat, f.width * 0.5) : 0;
        const pos = f.p.clone().addScaledVector(f.side, sp.lat).addScaledVector(f.n, 1.5 + crown);
        const g = new THREE.Group();
        const outer = new THREE.Mesh(this.boxGeo, mat);
        g.add(outer);
        const inner = new THREE.Mesh(this.boxInnerGeo, innerMat);
        g.add(inner);
        g.position.copy(pos);
        this.scene.add(g);
        this.boxes.push({
          group: g, outer, inner, s: sp.s, lat: sp.lat, base: pos.clone(),
          active: true, timer: 0, pop: 0, baseQuat: U.quatFromBasis(f.t, f.n)
        });
      }
    }

    buildCoins() {
      const tex = SK.trackTextures.coin;
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
        color: 0xffffff
      });
      this.coinGeo = new THREE.PlaneGeometry(1.15, 1.15);
      this.coinMat = mat;
      const spots = this.track.coinSpots;
      for (let i = 0; i < spots.length; i++) {
        const sp = spots[i];
        const f = this.track.sampleAt(sp.s);
        const pos = f.p.clone().addScaledVector(f.side, sp.lat).addScaledVector(f.n, 1.25);
        const m = new THREE.Mesh(this.coinGeo, mat);
        m.position.copy(pos);
        this.scene.add(m);
        this.coins.push({
          mesh: m, s: sp.s, lat: sp.lat, base: pos.clone(), active: true, timer: 0,
          phase: Math.random() * 6.28, baseQuat: U.quatFromBasis(f.t, f.n)
        });
      }
    }

    /* ---------------- 每帧 ---------------- */
    update(dt, time, karts, player, race) {
      const track = this.track;
      // 开箱碎片 / 闪光
      this.fx.update(dt);
      // 道具箱
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i];
        b.outer.rotation.y += dt * 1.2;
        b.outer.rotation.x += dt * 0.6;
        b.inner.rotation.y -= dt * 0.9;
        const bob = Math.sin(time * 2 + i * 0.7) * 0.18;
        b.group.position.copy(b.base);
        b.group.position.y += bob;
        if (b.active) {
          // 内芯呼吸
          const pulse = 1 + Math.sin(time * 3.4 + i * 1.3) * 0.06;
          b.inner.scale.setScalar(pulse);
        }
        if (!b.active) {
          b.timer -= dt;
          if (b.pop > 0) {
            // 被撞开的瞬间：轻微膨胀后立刻消失
            b.pop -= dt;
            const k = 1 - Math.max(0, b.pop) / 0.1;
            b.group.scale.setScalar(1 + k * 0.38);
            b.outer.rotation.y += dt * 20;
            b.group.visible = b.pop > 0;
          } else {
            b.group.visible = false;
            if (b.timer <= 0) {
              b.active = true;
              b.group.visible = true;
              b.group.scale.setScalar(0.001);
              b.respawnT = 0;
            }
          }
        } else if ((b.respawnT = (b.respawnT || 0) + dt) < 0.4) {
          const u = b.respawnT / 0.4;
          b.group.scale.setScalar(U.easeOutBack(u));
        } else {
          b.group.scale.setScalar(1);
        }
      }
      // 金币
      for (let i = 0; i < this.coins.length; i++) {
        const c = this.coins[i];
        c.mesh.rotation.y += dt * 2.6;
        c.mesh.quaternion.copy(c.baseQuat);
        c.mesh.rotateY(time * 2.6 + c.phase);
        if (c.active) {
          c.mesh.position.copy(c.base);
          c.mesh.position.y += Math.sin(time * 3 + c.phase) * 0.1;
          c.mesh.visible = true;
          c.mesh.scale.setScalar(1);
        } else {
          c.timer -= dt;
          if (c.timer <= 0) {
            c.active = true;
            c.mesh.visible = true;
          } else {
            c.mesh.visible = false;
          }
        }
      }

      // 与卡丁车碰撞（金币 / 道具箱）
      for (let k = 0; k < karts.length; k++) {
        const kart = karts[k];
        if (kart.finished && race && race.autoDriveFinished) { /* 继续跑 */ }
        // 道具箱
        for (let i = 0; i < this.boxes.length; i++) {
          const b = this.boxes[i];
          if (!b.active) continue;
          const dx = kart.pos.x - b.group.position.x;
          const dy = kart.pos.y - b.group.position.y;
          const dz = kart.pos.z - b.group.position.z;
          if (dx * dx + dy * dy + dz * dz < 2.6 * 2.6) {
            b.active = false;
            b.timer = 4.0;
            b.pop = 0.1;
            this._burstBox(b, kart);
            if (race && race.onItemBox) race.onItemBox(kart);
          }
        }
        // 金币
        for (let i = 0; i < this.coins.length; i++) {
          const c = this.coins[i];
          if (!c.active) continue;
          if (kart.pos.distanceToSquared(c.mesh.position) < 2.2 * 2.2) {
            c.active = false;
            c.timer = 9;
            if (race && race.onCoin) race.onCoin(kart, c.mesh.position);
          }
        }
      }

      // 投射物
      this.updateShells(dt, karts, race);
      this.updateBananas(dt, karts, race);
      this.updateBullets(dt, karts, race);
    }

    /** 吃到道具箱：碎片 + 光环 + 闪光 + 音效 */
    _burstBox(b, kart) {
      const p = b.group.position;
      this.fx.burst(p, 0x9be7ff);
      if (this.particles) {
        this.particles.hitBurst(p, 0xbdefff);
        // 面向镜头的竖环 + 贴地横环，两圈不同颜色
        this.particles.ring(p.clone(), kart.forward, 0xd8f4ff, 3.2, 0.3);
        this.particles.ring(p.clone(), new THREE.Vector3(0, 1, 0), 0x9be7ff, 2.6, 0.46);
      }
      const pl = SK.game && SK.game.player;
      const near = !pl || kart === pl || kart.pos.distanceToSquared(pl.pos) < 40 * 40;
      if (near && SK.audio) SK.audio.play('itemBox');
      if (kart.isPlayer && SK.game) {
        SK.game.shake = Math.max(SK.game.shake, 0.12);
        if (SK.game.hud && SK.game.hud.itemBurst) SK.game.hud.itemBurst();
      }
    }

    /* ---------------- 龟壳 ---------------- */
    spawnShell(kart, type, atPos, atDir, hint) {
      const dir = atDir || kart.forward;
      const base = atPos || kart.pos;
      const mesh = shellMesh(type === 'redShell' ? 0xe63946 : 0x35b06b);
      mesh.position.copy(base).addScaledVector(kart.up, 0.9).addScaledVector(dir, -1.6);
      this.scene.add(mesh);
      const s = {
        mesh, type, owner: kart, pos: mesh.position,
        dir: dir.clone(), speed: type === 'redShell' ? 62 : 58,
        life: 7, bounces: 0, target: null,
        hint: hint !== undefined ? hint : kart.hint, spin: 0,
        up: kart.up.clone()
      };
      if (type === 'redShell') s.target = this.findTargetAhead(kart);
      this.shells.push(s);
      if (SK.audio) SK.audio.play('shell');
      return s;
    }

    /** 远端打出的龟壳：只在本机复制一份视觉与碰撞 */
    remoteShell(type, pos, dir, hint, ownerKart) {
      if (!ownerKart) return;
      this.spawnShell(ownerKart, type,
        new THREE.Vector3(pos[0], pos[1], pos[2]),
        new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(),
        hint);
    }

    _netEvent(kind, data, kart) {
      const g = SK.game;
      if (g && g.netSync && kart && !kart.isRemote) g.netSync.sendEvent(kind, data);
    }

    findTargetAhead(kart) {
      const karts = SK.game ? SK.game.karts : [];
      let best = null, bestD = Infinity;
      for (let i = 0; i < karts.length; i++) {
        const k = karts[i];
        if (k === kart) continue;
        const d = k.position - kart.position;
        if (d > 0 && d < bestD) { bestD = d; best = k; }
      }
      return best;
    }

    updateShells(dt, karts, race) {
      const track = this.track;
      for (let i = this.shells.length - 1; i >= 0; i--) {
        const s = this.shells[i];
        s.life -= dt;
        // 红壳追踪
        if (s.type === 'redShell' && s.target && !s.target.finished) {
          const to = s.target.pos.clone().sub(s.pos);
          const d = to.length();
          if (d > 0.01) {
            const want = to.normalize();
            s.dir.lerp(want, U.clamp01(dt * 5.5)).normalize();
          }
        }
        s.pos.addScaledVector(s.dir, s.speed * dt);
        // 贴地 + 撞墙反弹
        const info = track.project(s.pos, s.hint);
        s.hint = info.index;
        if (info.gap > 1.2) {
          s.pos.addScaledVector(info.normal, -(info.gap - 0.9));
        } else {
          s.pos.addScaledVector(info.normal, -(info.gap - 0.9));
        }
        s.up.lerp(info.normal, 0.3).normalize();
        const limit = info.halfWidth + 0.5;
        if (Math.abs(info.lateral) > limit) {
          const sg = U.sign(info.lateral);
          s.pos.addScaledVector(info.side, -sg * (Math.abs(info.lateral) - limit));
          // 反射速度方向
          const vn = s.dir.dot(info.side) * sg;
          if (vn > 0) {
            s.dir.addScaledVector(info.side, -vn * 2 * sg).normalize();
            s.bounces++;
            if (s.bounces > 5 || s.type === 'redShell') { this.breakShell(i, true); continue; }
          }
        }
        // 旋转
        s.spin += dt * 12;
        s.mesh.position.copy(s.pos);
        s.mesh.rotation.y += dt * 8;
        // 尾迹
        if (Math.random() < 0.4 && this.particles) {
          this.particles.add.spawn(s.pos.x, s.pos.y, s.pos.z, 0, 0.6, 0,
            s.type === 'redShell' ? 0xff8b8b : 0x9be7a0, 0.3, 0.25, { gravity: 0, drag: 2, sizeEnd: 0.02 });
        }
        // 命中判定
        let hit = false;
        for (let k = 0; k < karts.length; k++) {
          const kart = karts[k];
          if (kart === s.owner && s.life > 6.5) continue;
          if (kart.pos.distanceToSquared(s.pos) < 2.4 * 2.4) {
            if (race && race.onShellHit) race.onShellHit(s.owner, kart, s.type);
            hit = true;
            break;
          }
        }
        if (hit || s.life <= 0) { this.breakShell(i, hit); }
      }
    }

    breakShell(idx, withFx) {
      const s = this.shells[idx];
      if (withFx && this.particles) {
        this.particles.hitBurst(s.pos, s.type === 'redShell' ? 0xff6b6b : 0x7bdc6a);
      }
      this.scene.remove(s.mesh);
      U.disposeObject(s.mesh);
      this.shells.splice(idx, 1);
      if (SK.audio) SK.audio.play('pop');
    }

    /* ---------------- 香蕉 ---------------- */
    dropBanana(kart, atPos) {
      const mesh = bananaMesh();
      const pos = atPos
        ? atPos.clone()
        : kart.pos.clone().addScaledVector(kart.forward, -2.2).addScaledVector(kart.up, 0.05);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.bananas.push({ mesh, pos, life: 30, owner: kart, phase: Math.random() * 6 });
      if (SK.audio) SK.audio.play('drop');
      return pos;
    }

    remoteBanana(pos, ownerKart) {
      if (!ownerKart) return;
      this.dropBanana(ownerKart, new THREE.Vector3(pos[0], pos[1], pos[2]));
    }

    updateBananas(dt, karts, race) {
      for (let i = this.bananas.length - 1; i >= 0; i--) {
        const b = this.bananas[i];
        b.life -= dt;
        b.mesh.rotation.y += dt * 0.6;
        b.mesh.position.y = b.pos.y + Math.sin(b.life * 3 + b.phase) * 0.05;
        let hit = false;
        for (let k = 0; k < karts.length; k++) {
          const kart = karts[k];
          if (kart === b.owner && b.life > 28) continue;
          if (kart.pos.distanceToSquared(b.pos) < 2.0 * 2.0) {
            if (race && race.onBananaHit) race.onBananaHit(b.owner, kart);
            hit = true;
            break;
          }
        }
        if (hit || b.life <= 0) {
          if (this.particles) this.particles.hitBurst(b.pos, 0xffd60a);
          this.scene.remove(b.mesh);
          U.disposeObject(b.mesh);
          this.bananas.splice(i, 1);
          if (SK.audio) SK.audio.play('pop');
        }
      }
    }

    /* ---------------- 炮弹 ---------------- */
    launchBullet(kart) {
      if (SK.audio) SK.audio.play('bullet');
      kart.bulletTime = 3.4;
      kart.invuln = 3.6;
      kart.speed = Math.min(SK.U.SPEED_MAX, kart.maxSpeed * 1.42);
      if (this.particles) {
        this.particles.ring(kart.pos.clone().addScaledVector(kart.up, 0.5), kart.up, 0xffd60a, 8, 0.6);
      }
    }

    updateBullets(dt, karts, race) {
      // 炮弹本体跟随被发射的卡丁车（视觉在 kart 上），此处处理撞击
      for (let k = 0; k < karts.length; k++) {
        const kart = karts[k];
        if (!(kart.bulletTime > 0)) continue;
        for (let j = 0; j < karts.length; j++) {
          const other = karts[j];
          if (other === kart) continue;
          if (kart.pos.distanceToSquared(other.pos) < 3.4 * 3.4) {
            if (race && race.onBulletHit) race.onBulletHit(kart, other);
          }
        }
      }
    }

    /* ---------------- 使用道具 ---------------- */
    useItem(kart, race) {
      const item = kart.item;
      if (!item || item.roulette > 0) return false;
      const type = item.type;
      if (type === 'mushroom' || (type === 'tripleMushroom' && item.count > 0)) {
        kart.applyBoost(1.5, 1.34);
        if (this.particles) {
          const p = kart.pos.clone().addScaledVector(kart.up, 0.4);
          this.particles.ring(p, kart.up, 0xffb703, 4.5, 0.45);
        }
        if (SK.audio) SK.audio.play('boost');
        if (type === 'tripleMushroom') {
          item.count--;
          if (item.count <= 0) kart.item = null;
        } else {
          kart.item = null;
        }
        return true;
      }
      if (type === 'greenShell' || type === 'redShell') {
        const s = this.spawnShell(kart, type);
        this._netEvent('shell', {
          type,
          pos: [r3(s.pos.x), r3(s.pos.y), r3(s.pos.z)],
          dir: [r3(s.dir.x), r3(s.dir.y), r3(s.dir.z)],
          hint: s.hint
        }, kart);
        kart.item = null;
        return true;
      }
      if (type === 'banana') {
        if (item.count > 1) { item.count--; } else { kart.item = null; }
        const pos = this.dropBanana(kart);
        this._netEvent('banana', {
          pos: [r3(pos.x), r3(pos.y), r3(pos.z)]
        }, kart);
        return true;
      }
      if (type === 'star') {
        kart.startStar(7.5);
        kart.applyBoost(0.5, 1.26);
        if (SK.audio) SK.audio.play('star');
        kart.item = null;
        return true;
      }
      if (type === 'lightning') {
        for (let i = 0; i < SK.game.karts.length; i++) {
          const k = SK.game.karts[i];
          if (k === kart) continue;
          k.squish(3.2);
          k.spinTimer = Math.max(k.spinTimer, 0.7);
          if (this.particles && k !== SK.game.player) {
            this.particles.hitBurst(k.pos.clone().addScaledVector(k.up, 1), 0x9be7ff);
          }
        }
        if (SK.audio) SK.audio.play('lightning');
        if (race && race.onLightning) race.onLightning(kart);
        this._netEvent('lightning', {}, kart);
        kart.item = null;
        return true;
      }
      if (type === 'bullet') {
        this.launchBullet(kart);
        kart.item = null;
        return true;
      }
      return false;
    }

    reset() {
      for (const s of this.shells) { this.scene.remove(s.mesh); U.disposeObject(s.mesh); }
      this.shells.length = 0;
      for (const b of this.bananas) { this.scene.remove(b.mesh); U.disposeObject(b.mesh); }
      this.bananas.length = 0;
      for (const b of this.bullets) { this.scene.remove(b.mesh); U.disposeObject(b.mesh); }
      this.bullets.length = 0;
      for (const b of this.boxes) { b.active = true; b.group.visible = true; b.group.scale.setScalar(1); b.pop = 0; }
      for (const c of this.coins) { c.active = true; c.mesh.visible = true; }
      if (this.fx) {
        for (const s of this.fx.shards) { s.active = false; s.life = 0; s.mesh.visible = false; }
        for (const g of this.fx.glows) { g.life = 0; g.sprite.visible = false; }
      }
    }

    /** 切换赛道时彻底清理（共享纹理不释放） */
    dispose() {
      const kill = (obj) => {
        obj.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => {
              if (m.map && !m.map.userData.shared) m.map.dispose();
              m.dispose();
            });
          }
        });
        if (obj.parent) obj.parent.remove(obj);
      };
      for (const b of this.boxes) kill(b.group);
      for (const c of this.coins) if (c.mesh.parent) c.mesh.parent.remove(c.mesh);
      for (const s of this.shells) kill(s.mesh);
      for (const b of this.bananas) kill(b.mesh);
      for (const b of this.bullets) kill(b.mesh);
      this.boxes.length = 0;
      this.coins.length = 0;
      this.shells.length = 0;
      this.bananas.length = 0;
      this.bullets.length = 0;
      if (this.boxGeo) this.boxGeo.dispose();
      if (this.boxInnerGeo) this.boxInnerGeo.dispose();
      if (this.coinGeo) this.coinGeo.dispose();
      if (this.fx) {
        for (const s of this.fx.shards) if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
        for (const g of this.fx.glows) if (g.sprite.parent) g.sprite.parent.remove(g.sprite);
        this.fx.shardGeo.dispose();
        this.fx.mats.forEach(m => m.dispose());
      }
    }
  }

  SK.ItemSystem = ItemSystem;
  SK.ITEM_DEF = ITEM_DEF;
  SK.itemIcon = iconFor;
  SK.rollItem = rollItem;
  SK.ITEM_POOL = POOL;      // 供 tools/itemcheck.js 做分布验证
  SK.itemPoolAt = poolAt;
})();
