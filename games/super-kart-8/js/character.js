/* ============================================================
   Super Kart 8 — character.js
   8 位车手的高精度程序化模型
   · 真实眼球（巩膜 / 虹膜 / 瞳孔 / 高光 / 眼睑）
   · 分指手套、鞋底鞋带、袖口领口、发丝、布料层次
   · PBR 材质 + 顶点色环境遮蔽
   模型朝向：局部 -Z 为正面
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;
  const PI = Math.PI;

  const ROSTER = [
    {
      id: 'marco', name: '马可', title: '水管工', color: 0xe23b3b, accent: 0x2b4fd8,
      stats: { speed: 3, accel: 3, handling: 3, weight: 3 }, kart: 'standard',
      blurb: '全能型选手，各项性能均衡。'
    },
    {
      id: 'luca', name: '卢卡', title: '兄弟', color: 0x2f9e44, accent: 0x1f3fa8,
      stats: { speed: 3.5, accel: 3.2, handling: 3.4, weight: 2.6 }, kart: 'standard',
      blurb: '速度略高，操控灵活。'
    },
    {
      id: 'peach', name: '桃花', title: '公主', color: 0xff7ab5, accent: 0xffe066,
      stats: { speed: 2.6, accel: 4.2, handling: 4.2, weight: 2.0 }, kart: 'bike',
      blurb: '加速与操控出色，极速偏低。'
    },
    {
      id: 'koopa', name: '龟霸', title: '魔王', color: 0xf0a020, accent: 0x2f7d31,
      stats: { speed: 4.6, accel: 2.0, handling: 2.1, weight: 4.8 }, kart: 'atv',
      blurb: '重量级，极速最强但转向笨重。'
    },
    {
      id: 'mush', name: '蘑菇仔', title: '小助手', color: 0x3aa0ff, accent: 0xfff3d6,
      stats: { speed: 2.1, accel: 4.7, handling: 4.4, weight: 1.4 }, kart: 'standard',
      blurb: '轻量级，起步与转向极快。'
    },
    {
      id: 'yoshi', name: '龙奇', title: '小恐龙', color: 0x62c33a, accent: 0xffffff,
      stats: { speed: 3.2, accel: 3.8, handling: 3.9, weight: 2.4 }, kart: 'bike',
      blurb: '均衡偏灵巧，适合弯道。'
    },
    {
      id: 'boo', name: '幽灵', title: '调皮鬼', color: 0xf2f4ff, accent: 0x9b7bff,
      stats: { speed: 3.0, accel: 4.0, handling: 3.6, weight: 1.8 }, kart: 'bike',
      blurb: '飘忽不定，加速优秀。'
    },
    {
      id: 'metal', name: '铁马可', title: '金属体', color: 0xb8c4d4, accent: 0x6c7a8c,
      stats: { speed: 4.5, accel: 1.6, handling: 2.4, weight: 5.0 }, kart: 'standard',
      blurb: '超重装甲，抗撞但不灵活。'
    }
  ];

  /* ============================================================
     材质
     ============================================================ */
  function makePalette() {
    const cache = {};
    function std(key, color, opts) {
      if (cache[key]) return cache[key];
      const m = U.matStd(color, Object.assign({ vertexColors: true, envMapIntensity: 0.26 }, opts || {}));
      cache[key] = m;
      return m;
    }
    return { std, cache };
  }

  /* ============================================================
     几何工具
     ============================================================ */
  function M(parent, geo, mat, p, r, s) {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (r) m.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0);
    if (s) m.scale.set(s[0], s[1], s[2]);
    parent.add(m);
    return m;
  }

  function ball(parent, mat, rx, ry, rz, p, segW, segH) {
    return M(parent, U.ellipsoid(rx, ry, rz, segW || 18, segH || 13), mat, p);
  }

  const _up = new THREE.Vector3(0, 1, 0);
  /** 两点之间的胶囊（含两端球帽），用于四肢 */
  function limb(parent, mat, a, b, r0, r1, radial) {
    const A = new THREE.Vector3(a[0], a[1], a[2]);
    const B = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = new THREE.Vector3().subVectors(B, A);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r1, r0, len, radial || 12, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(_up, dir.clone().normalize());
    const g = new THREE.Group();
    g.position.copy(A).addScaledVector(dir, 0.5);
    g.quaternion.copy(q);
    parent.add(g);
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    // 关节球
    const j1 = new THREE.Mesh(U.ellipsoid(r0, r0, r0, 12, 9), mat);
    j1.position.copy(A);
    parent.add(j1);
    const j2 = new THREE.Mesh(U.ellipsoid(r1, r1, r1, 12, 9), mat);
    j2.position.copy(B);
    parent.add(j2);
    return g;
  }

  /** 手指/爪：从掌心向外散开的细胶囊 */
  function fingers(parent, mat, origin, dirBase, spread, count, r, len, tipMat) {
    const base = new THREE.Vector3(dirBase[0], dirBase[1], dirBase[2]).normalize();
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const d = base.clone();
      d.x += t * spread;
      d.y += Math.abs(t) * -0.06;
      d.normalize();
      const start = new THREE.Vector3(origin[0], origin[1], origin[2]);
      const end = start.clone().addScaledVector(d, len * (1 - Math.abs(t) * 0.18));
      limb(parent, mat, start.toArray(), end.toArray(), r, r * 0.86, 8);
      if (tipMat) {
        const tip = new THREE.Mesh(U.ellipsoid(r * 0.9, r * 0.9, r * 0.9, 8, 6), tipMat);
        tip.position.copy(end);
        parent.add(tip);
      }
    }
  }

  /* ---------------- 眼睛 ---------------- */
  /**
   * @param {Object} o {x,y,z,r, iris, sclera, lookY, lookX, lid}
   */
  function eyes(parent, o) {
    const x = o.x, y = o.y, z = o.z, r = o.r;
    const sclera = o.scleraMat;
    const irisMat = o.irisMat;
    const pupilMat = o.pupilMat;
    const glowMat = o.glowMat;
    const lidMat = o.lidMat;
    const lookY = o.lookY === undefined ? -0.12 : o.lookY;
    const lookX = o.lookX === undefined ? 0 : o.lookX;

    [-1, 1].forEach(s => {
      const ex = s * x;
      // 巩膜
      const e = ball(parent, sclera, r, r * 1.1, r * 0.78, [ex, y, z], 20, 14);
      e.userData.noAO = true;
      // 虹膜（略微凸出）
      const ir = r * 0.56;
      const ix = ex + lookX * r * 0.3;
      const iy = y + lookY * r * 0.5;
      const iz = z - r * 0.52;
      const im = ball(parent, irisMat, ir, ir, ir * 0.42, [ix, iy, iz], 18, 12);
      im.userData.noAO = true;
      // 瞳孔
      const pu = ball(parent, pupilMat, ir * 0.52, ir * 0.52, ir * 0.3, [ix, iy, iz - ir * 0.34], 14, 10);
      pu.userData.noAO = true;
      // 高光（左上）
      const hl = ball(parent, glowMat, ir * 0.26, ir * 0.26, ir * 0.16,
        [ix - s * ir * 0.28, iy + ir * 0.34, iz - ir * 0.4], 10, 8);
      hl.userData.noAO = true;
      hl.renderOrder = 2;
      // 上眼睑（压住眼球上方，减少"呆滞感"）
      if (o.lid !== false && lidMat) {
        const lid = ball(parent, lidMat, r * 1.06, r * 0.5, r * 0.86,
          [ex, y + r * 0.62, z + r * 0.06], 16, 10);
        lid.rotation.z = s * 0.16;
      }
      // 下眼睑阴影
      if (o.lid !== false && lidMat) {
        const low = ball(parent, lidMat, r * 0.98, r * 0.3, r * 0.7,
          [ex, y - r * 0.78, z + r * 0.1], 14, 8);
        low.rotation.z = -s * 0.1;
      }
    });
  }

  function brows(parent, mat, o) {
    const x = o.x, y = o.y, z = o.z, w = o.w || 0.13, h = o.h || 0.035;
    [-1, 1].forEach(s => {
      const b = ball(parent, mat, w, h, h * 1.4, [s * x, y, z], 12, 8);
      b.rotation.z = s * (o.tilt === undefined ? 0.12 : o.tilt);
      b.rotation.x = o.rotX || 0;
    });
  }

  function mouth(parent, mat, o) {
    const m = ball(parent, mat, o.w, o.h, o.d || 0.05, [o.x || 0, o.y, o.z], 16, 10);
    m.rotation.x = o.rotX || 0;
    return m;
  }

  /* ---------------- 手套 ---------------- */
  function glove(parent, mat, pos, cuffMat, dir, big) {
    const s = big || 1;
    const g = ball(parent, mat, 0.1 * s, 0.105 * s, 0.11 * s, pos, 16, 12);
    // 手背隆起
    ball(parent, mat, 0.08 * s, 0.075 * s, 0.06 * s, [pos[0], pos[1] + 0.045 * s, pos[2] + 0.02], 12, 9);
    // 袖口
    if (cuffMat) {
      const cuff = M(parent, new THREE.CylinderGeometry(0.088 * s, 0.095 * s, 0.07 * s, 16, 1, true), cuffMat,
        [pos[0], pos[1] + 0.06 * s, pos[2] + 0.07 * s], [0.5, 0, 0]);
      cuff.rotation.x = 0.55;
    }
    // 四指 + 拇指
    const d = dir || [0, -0.15, -1];
    fingers(parent, mat, [pos[0], pos[1] + 0.01 * s, pos[2] - 0.06 * s], d, 0.34, 4, 0.026 * s, 0.1 * s);
    const thumbStart = [pos[0] + (pos[0] > 0 ? -0.09 : 0.09) * s, pos[1] + 0.01 * s, pos[2] - 0.02 * s];
    limb(parent, mat, thumbStart,
      [thumbStart[0] + (pos[0] > 0 ? -0.05 : 0.05) * s, thumbStart[1] - 0.02 * s, thumbStart[2] - 0.075 * s],
      0.028 * s, 0.024 * s, 8);
    return g;
  }

  /* ---------------- 鞋 ---------------- */
  function boot(parent, mat, soleMat, pos, size, face) {
    const s = size || 1;
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    parent.add(g);
    // 鞋面
    const upper = M(g, U.roundedBox(0.22 * s, 0.16 * s, 0.38 * s, 0.07 * s, 3), mat, [0, 0.06 * s, 0]);
    upper.rotation.x = -0.06;
    // 鞋头
    ball(g, mat, 0.11 * s, 0.085 * s, 0.1 * s, [0, 0.05 * s, -0.19 * s], 14, 10);
    // 鞋底
    M(g, U.roundedBox(0.235 * s, 0.055 * s, 0.4 * s, 0.025 * s, 2), soleMat, [0, -0.025 * s, 0]);
    // 鞋帮
    M(g, new THREE.CylinderGeometry(0.1 * s, 0.115 * s, 0.1 * s, 14, 1, true), mat, [0, 0.14 * s, 0.05 * s]);
    // 鞋带
    if (face !== false) {
      for (let i = 0; i < 3; i++) {
        M(g, new THREE.BoxGeometry(0.13 * s, 0.012 * s, 0.012 * s), soleMat,
          [0, 0.115 * s + i * 0.024 * s, -0.06 * s + i * 0.032 * s], [0.3, 0, 0]);
      }
    }
    return g;
  }

  /* ============================================================
     头部基础（球颅 + 下颌 + 耳朵）
     ============================================================ */
  function headBase(pal, opts) {
    const head = new THREE.Group();
    const r = opts.r || 0.33;
    // 颅骨
    ball(head, pal.skin, r, r * 1.02, r * 0.97, [0, 0, 0], 26, 18);
    // 下颌 / 面颊
    ball(head, pal.skin, r * 0.9, r * 0.78, r * 0.82, [0, -r * 0.28, -r * 0.16], 22, 15);
    // 颧骨
    [-1, 1].forEach(s => {
      ball(head, pal.skin, r * 0.28, r * 0.24, r * 0.24, [s * r * 0.55, -r * 0.1, -r * 0.5], 14, 10);
    });
    // 耳朵
    [-1, 1].forEach(s => {
      const ear = ball(head, pal.skin, r * 0.16, r * 0.22, r * 0.12, [s * r * 0.95, -r * 0.05, r * 0.02], 14, 10);
      ear.rotation.z = s * 0.2;
      ball(head, pal.skinDark, r * 0.09, r * 0.13, r * 0.06, [s * r * 1.0, -r * 0.05, r * 0.02], 10, 8);
    });
    return head;
  }

  /* ============================================================
     各角色
     ============================================================ */
  const builders = {};

  /* ---------------- 水管工（马可 / 卢卡 / 铁马可） ---------------- */
  builders.plumber = function (c) {
    const pal = makePalette();
    const metal = c.id === 'metal';
    const skinC = metal ? 0xb9c6d6 : (c.id === 'luca' ? 0xe0ae84 : 0xdfa87c);
    const shirtC = metal ? 0x9dabbd : c.color;
    const overallC = metal ? 0x5b6575 : c.accent;

    const skin = pal.std('skin', skinC, { roughness: 0.62 });
    const skinDark = pal.std('skinDark', 0xb8875f, { roughness: 0.68 });
    const shirt = pal.std('shirt', shirtC, { roughness: 0.78 });
    const overall = pal.std('overall', overallC, { roughness: 0.7 });
    const gold = pal.std('gold', 0xffd60a, { roughness: 0.3, metalness: 0.55 });
    const white = pal.std('white', 0xfbfcff, { roughness: 0.45 });
    const bootMat = pal.std('boot', metal ? 0x3d4552 : 0x6b4423, { roughness: 0.55, metalness: metal ? 0.7 : 0 });
    const sole = pal.std('sole', 0x2a2118, { roughness: 0.85 });
    const hair = pal.std('hair', metal ? 0x4a5361 : 0x3a2418, { roughness: 0.75 });
    const capMat = pal.std('cap', metal ? 0x808b9c : c.color, { roughness: 0.62, metalness: metal ? 0.6 : 0 });
    const irisMat = pal.std('iris', metal ? 0x7fd8ff : 0x2f5fa8, { roughness: 0.15, emissive: metal ? 0x1a5f80 : 0x000000, emissiveIntensity: 0.5 });
    const pupilMat = pal.std('pupil', 0x12182a, { roughness: 0.1 });
    const scleraMat = pal.std('sclera', 0xffffff, { roughness: 0.16 });
    const glowMat = pal.std('glow', 0xffffff, { roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.55 });

    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);

    /* --- 躯干：旋转体剖面，压扁成椭圆 --- */
    const torsoGeo = U.lathe([
      [0.02, 0.28], [0.21, 0.29], [0.285, 0.35], [0.32, 0.46],
      [0.33, 0.60], [0.32, 0.74], [0.29, 0.84], [0.235, 0.92], [0.14, 0.97], [0.02, 0.99]
    ], 28, true);
    const torso = new THREE.Mesh(torsoGeo, shirt);
    torso.scale.z = 0.76;
    body.add(torso);
    // 肩部三角肌
    [-1, 1].forEach(sg => {
      ball(body, shirt, 0.135, 0.14, 0.14, [sg * 0.29, 0.855, 0.0], 18, 13);
    });
    // 领口
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 8, 24), shirt);
    collar.position.set(0, 0.955, -0.015);
    collar.rotation.x = Math.PI / 2;
    body.add(collar);
    // 腹部（背带裤包裹）
    const bellyGeo = U.lathe([
      [0.02, 0.29], [0.205, 0.295], [0.265, 0.34], [0.30, 0.44], [0.298, 0.55], [0.268, 0.63], [0.02, 0.64]
    ], 28, true);
    const belly = new THREE.Mesh(bellyGeo, overall);
    belly.scale.z = 0.80;
    body.add(belly);
    // 背带裤前胸片
    M(body, U.roundedBox(0.34, 0.3, 0.08, 0.06, 3), overall, [0, 0.66, -0.2]);
    // 背带
    [-1, 1].forEach(s => {
      M(body, U.roundedBox(0.1, 0.34, 0.06, 0.03, 2), overall, [s * 0.15, 0.79, -0.19], [0.18, 0, s * 0.06]);
      M(body, U.roundedBox(0.1, 0.3, 0.06, 0.03, 2), overall, [s * 0.15, 0.78, 0.19], [-0.2, 0, s * -0.06]);
    });
    // 金属扣
    [-1, 1].forEach(s => {
      M(body, new THREE.CylinderGeometry(0.045, 0.045, 0.024, 14), gold, [s * 0.15, 0.68, -0.235], [PI / 2, 0, 0]);
      M(body, new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12), gold, [s * 0.15, 0.68, -0.24], [PI / 2, 0, 0]);
    });
    // 腰带
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.028, 8, 30), sole);
    belt.position.set(0, 0.42, 0);
    belt.rotation.x = PI / 2;
    belt.scale.z = 0.76;
    body.add(belt);

    /* --- 手臂 --- */
    const shoulderY = 0.865, shoulderX = 0.305;
    [-1, 1].forEach(s => {
      const sh = [s * shoulderX, shoulderY, 0.0];
      const el = [s * 0.355, 0.71, -0.17];
      const wr = [s * 0.285, 0.655, -0.44];
      // 肩（布球）
      ball(body, shirt, 0.115, 0.115, 0.12, sh, 16, 11);
      // 短袖
      limb(body, shirt, sh, el, 0.1, 0.085, 14);
      // 袖口
      const cuff = M(body, new THREE.CylinderGeometry(0.092, 0.088, 0.05, 16, 1, true), shirt,
        [el[0], el[1], el[2]], [0.5, 0, 0]);
      // 前臂（皮肤）
      limb(body, skin, el, wr, 0.078, 0.065, 14);
      // 手套
      glove(body, white, [wr[0], wr[1] - 0.03, wr[2] - 0.03], white, [0, -0.25, -1], 1.0);
    });

    /* --- 腿 --- */
    [-1, 1].forEach(s => {
      const hip = [s * 0.155, 0.36, 0.02];
      const knee = [s * 0.19, 0.30, -0.3];
      const ankle = [s * 0.19, 0.11, -0.44];
      limb(body, overall, hip, knee, 0.125, 0.105, 14);
      limb(body, overall, knee, ankle, 0.1, 0.085, 14);
      // 裤脚
      M(body, new THREE.CylinderGeometry(0.092, 0.1, 0.06, 16, 1, true), overall, [ankle[0], ankle[1] + 0.03, ankle[2]], [0.2, 0, 0]);
      boot(body, bootMat, sole, [ankle[0], ankle[1] - 0.06, ankle[2] - 0.06], 1.0);
    });

    /* --- 头 --- */
    const head = headBase(pal, { r: 0.35 });
    head.scale.setScalar(0.855);
    head.position.set(0, 1.265, -0.01);
    body.add(head);

    // 脖子（可见的一段）
    M(body, new THREE.CylinderGeometry(0.098, 0.115, 0.16, 18), skinDark, [0, 0.995, -0.01]);
    M(body, new THREE.CylinderGeometry(0.1, 0.1, 0.05, 18), skin, [0, 1.04, -0.01]);

    // 大鼻子
    const nose = ball(head, skin, 0.125, 0.108, 0.11, [0, -0.055, -0.335], 18, 13);
    // 鼻翼
    [-1, 1].forEach(s => ball(head, skin, 0.045, 0.04, 0.045, [s * 0.075, -0.09, -0.315], 10, 8));

    // 眼睛
    eyes(head, {
      x: 0.125, y: 0.055, z: -0.285, r: 0.082,
      scleraMat, irisMat, pupilMat, glowMat,
      lidMat: skin, lookY: -0.1
    });
    // 眉毛
    brows(head, hair, { x: 0.13, y: 0.185, z: -0.29, w: 0.075, h: 0.032, tilt: 0.14 });

    // 胡子：三层叠片
    [-1, 1].forEach(s => {
      ball(head, hair, 0.102, 0.042, 0.046, [s * 0.09, -0.135, -0.318], 14, 9);
      ball(head, hair, 0.068, 0.034, 0.04, [s * 0.168, -0.118, -0.295], 12, 8);
      ball(head, hair, 0.05, 0.032, 0.036, [s * 0.045, -0.165, -0.325], 10, 7);
    });
    // 嘴（藏在胡子下）
    mouth(head, pal.std('mouth', 0x7a3b3b, { roughness: 0.5 }), { y: -0.2, z: -0.31, w: 0.06, h: 0.02 });
    // 下巴
    ball(head, skin, 0.13, 0.09, 0.1, [0, -0.25, -0.26], 14, 10);

    // 帽子：帽顶 + 帽檐 + 帽箍 + 徽章
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.368, 30, 18, 0, PI * 2, 0, PI * 0.665), capMat);
    cap.position.set(0, 0.052, 0.035);
    cap.scale.set(1.03, 0.95, 1.02);
    cap.rotation.x = -0.34;
    head.add(cap);
    // 后脑头发（只覆盖后半圈，一直包到后颈）
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.359, 26, 18, 0, PI, PI * 0.40, PI * 0.52), hair);
    hairBack.position.set(0, 0.01, 0.03);
    hairBack.rotation.x = -0.12;
    head.add(hairBack);
    // 帽箍
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.362, 0.368, 0.055, 26, 1, true), pal.std('capBand', metal ? 0x5a6472 : U.shade(c.color, -0.18), { roughness: 0.6 }));
    band.position.set(0, 0.02, 0.02);
    head.add(band);
    // 帽檐
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.4, 0.045, 26, 1, false, -1.05, 2.1), capMat);
    brim.position.set(0, 0.055, -0.245);
    brim.rotation.x = 0.16;
    brim.scale.z = 0.95;
    head.add(brim);
    // 徽章
    const badgeC = pal.std('badge', 0xffffff, { roughness: 0.4 });
    M(head, new THREE.CylinderGeometry(0.1, 0.1, 0.016, 20), badgeC, [0, 0.27, -0.235], [PI / 2 + 0.28, 0, 0]);
    M(head, new THREE.CylinderGeometry(0.072, 0.072, 0.02, 20), pal.std('badgeIn', metal ? 0x8d98a8 : c.color, { roughness: 0.4 }),
      [0, 0.27, -0.24], [PI / 2 + 0.28, 0, 0]);

    // 鬓角
    [-1, 1].forEach(s => {
      ball(head, hair, 0.055, 0.11, 0.07, [s * 0.305, -0.03, -0.06], 12, 9);
    });

    g.userData.head = head;
    g.userData.body = body;
    return g;
  };

  /* ---------------- 公主 ---------------- */
  builders.princess = function (c) {
    const pal = makePalette();
    const skin = pal.std('skin', 0xfadcc4, { roughness: 0.55 });
    const dress = pal.std('dress', c.color, { roughness: 0.62 });
    const dressDark = pal.std('dressDark', U.shade(c.color, -0.22), { roughness: 0.66 });
    const goldTrim = pal.std('goldTrim', c.accent, { roughness: 0.28, metalness: 0.7 });
    const white = pal.std('white', 0xfdfdff, { roughness: 0.4 });
    const hairMat = pal.std('hair', 0xffd451, { roughness: 0.4, metalness: 0.05 });
    const hairDark = pal.std('hairDark', 0xe0b23a, { roughness: 0.45 });
    const lips = pal.std('lips', 0xd9687a, { roughness: 0.34 });
    const blue = pal.std('blue', 0x63c8f0, { roughness: 0.12, metalness: 0.1, emissive: 0x0f4a63, emissiveIntensity: 0.35 });
    const scleraMat = pal.std('sclera', 0xffffff, { roughness: 0.14 });
    const irisMat = pal.std('iris', 0x3f78c8, { roughness: 0.12 });
    const pupilMat = pal.std('pupil', 0x15203a, { roughness: 0.1 });
    const glowMat = pal.std('glow', 0xffffff, { roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.55 });

    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);

    // 裙：多层旋转体
    const skirtGeo = U.lathe([
      [0.03, -0.16], [0.5, -0.135], [0.53, -0.06], [0.5, 0.02],
      [0.4, 0.12], [0.3, 0.22], [0.23, 0.31], [0.2, 0.38], [0.02, 0.40]
    ], 36, true);
    const skirt = new THREE.Mesh(skirtGeo, dress);
    skirt.scale.z = 0.86;
    body.add(skirt);
    // 裙摆内衬
    const under = new THREE.Mesh(U.lathe([
      [0.03, -0.03], [0.5, -0.02], [0.51, 0.02], [0.02, 0.02]
    ], 36, true), white);
    under.scale.z = 0.86;
    body.add(under);
    // 裙摆第二层（荷叶边）
    const frill = new THREE.Mesh(U.lathe([
      [0.03, -0.15], [0.46, -0.14], [0.5, -0.08], [0.46, -0.02], [0.42, 0.03], [0.02, 0.04]
    ], 36, true), dressDark);
    frill.scale.z = 0.88;
    body.add(frill);
    // 裙边金线
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.515, 0.013, 6, 44), goldTrim);
    hem.position.set(0, -0.115, 0);
    hem.rotation.x = PI / 2;
    hem.scale.z = 0.88;
    body.add(hem);
    // 腰部金边
    const waist = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 30), goldTrim);
    waist.position.set(0, 0.41, 0);
    waist.rotation.x = PI / 2;
    waist.scale.z = 0.87;
    body.add(waist);

    // 上身
    const bodice = new THREE.Mesh(U.lathe([
      [0.02, 0.40], [0.195, 0.41], [0.21, 0.5], [0.215, 0.62], [0.20, 0.72], [0.155, 0.80], [0.02, 0.82]
    ], 28, true), dress);
    bodice.scale.z = 0.76;
    body.add(bodice);
    // 胸口
    ball(body, dress, 0.19, 0.14, 0.15, [0, 0.66, -0.06], 18, 13);
    // 泡泡袖
    [-1, 1].forEach(s => {
      ball(body, white, 0.12, 0.11, 0.115, [s * 0.25, 0.75, 0], 18, 13);
    });
    // 项链宝石
    M(body, new THREE.OctahedronGeometry(0.055, 0), blue, [0, 0.755, -0.19]);
    // 领口金饰
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 6, 24, PI), goldTrim);
    collar.position.set(0, 0.79, -0.06);
    collar.rotation.set(PI / 2, 0, 0);
    body.add(collar);

    // 手臂 + 长手套
    [-1, 1].forEach(s => {
      const sh = [s * 0.245, 0.75, 0];
      const el = [s * 0.3, 0.62, -0.14];
      const wr = [s * 0.28, 0.63, -0.36];
      limb(body, skin, sh, el, 0.06, 0.052, 12);
      limb(body, white, el, wr, 0.056, 0.05, 12);
      // 手套口金边
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 6, 16), goldTrim);
      cuff.position.set(el[0], el[1], el[2]);
      cuff.rotation.x = 1.1;
      body.add(cuff);
      glove(body, white, [wr[0], wr[1] - 0.02, wr[2] - 0.02], null, [0, -0.25, -1], 0.86);
    });

    // 腿
    [-1, 1].forEach(s => {
      const hip = [s * 0.1, 0.36, -0.02];
      const knee = [s * 0.12, 0.26, -0.22];
      const ankle = [s * 0.13, 0.09, -0.3];
      limb(body, white, hip, knee, 0.075, 0.062, 12);
      limb(body, skin, knee, ankle, 0.058, 0.05, 12);
      boot(body, pal.std('shoe', 0xe8536a, { roughness: 0.35 }), pal.std('sole2', 0xf6e8c8, { roughness: 0.6 }),
        [ankle[0], ankle[1] - 0.05, ankle[2] - 0.05], 0.82);
    });

    // 头
    const head = headBase(pal, { r: 0.315 });
    head.position.set(0, 1.235, 0);
    body.add(head);
    M(body, new THREE.CylinderGeometry(0.085, 0.1, 0.12, 14), skin, [0, 1.0, -0.01]);

    // 鼻子/嘴
    ball(head, skin, 0.045, 0.045, 0.05, [0, -0.06, -0.3], 12, 9);
    const lip = mouth(head, lips, { y: -0.16, z: -0.285, w: 0.06, h: 0.024, d: 0.03 });
    // 眼
    eyes(head, {
      x: 0.115, y: 0.045, z: -0.255, r: 0.078,
      scleraMat, irisMat, pupilMat, glowMat, lidMat: skin, lookY: -0.08
    });
    // 睫毛
    const lash = pal.std('lash', 0x33244a, { roughness: 0.5 });
    [-1, 1].forEach(s => {
      for (let i = 0; i < 3; i++) {
        const b = M(head, new THREE.BoxGeometry(0.05, 0.012, 0.012), lash,
          [s * (0.09 + i * 0.022), 0.115 - i * 0.008, -0.288], [0, 0, s * (0.4 + i * 0.18)]);
      }
    });
    // 眉毛
    brows(head, hairDark, { x: 0.115, y: 0.15, z: -0.27, w: 0.062, h: 0.016, tilt: 0.2 });

    // 头发：刘海 + 后发 + 卷
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.335, 30, 18, 0, PI * 2, 0, PI * 0.66), hairMat);
    hairCap.position.set(0, 0.015, 0.015);
    hairCap.scale.set(1.02, 1.0, 1.04);
    head.add(hairCap);
    // 刘海分缕
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + i * 0.25;
      const lock = ball(head, hairMat, 0.075, 0.14, 0.08,
        [Math.sin(a) * 0.24, 0.19, -Math.cos(a) * 0.22], 14, 10);
      lock.rotation.z = -a * 0.9;
      lock.rotation.x = -0.35;
    }
    // 后发髻
    ball(head, hairMat, 0.19, 0.21, 0.18, [0, 0.06, 0.27], 20, 14);
    ball(head, hairMat, 0.13, 0.14, 0.12, [0, 0.27, 0.24], 16, 11);
    // 侧卷发
    [-1, 1].forEach(s => {
      ball(head, hairMat, 0.09, 0.16, 0.09, [s * 0.3, -0.1, 0.03], 14, 10);
      ball(head, hairMat, 0.075, 0.12, 0.075, [s * 0.31, -0.26, 0.02], 13, 9);
      ball(head, hairMat, 0.055, 0.08, 0.055, [s * 0.3, -0.38, 0.01], 11, 8);
    });

    // 皇冠
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.185, 0.1, 22, 1, true), goldTrim);
    crown.position.set(0, 0.3, 0.01);
    head.add(crown);
    const crownTop = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 6, 26), goldTrim);
    crownTop.position.set(0, 0.35, 0.01);
    crownTop.rotation.x = PI / 2;
    head.add(crownTop);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2;
      const spike = M(head, new THREE.ConeGeometry(0.032, 0.1, 6), goldTrim,
        [Math.cos(a) * 0.175, 0.4, 0.01 + Math.sin(a) * 0.175]);
      spike.rotation.z = -Math.cos(a) * 0.18;
      spike.rotation.x = Math.sin(a) * 0.18;
      ball(head, blue, 0.022, 0.022, 0.022, [Math.cos(a) * 0.175, 0.44, 0.01 + Math.sin(a) * 0.175], 8, 6);
    }
    ball(head, blue, 0.038, 0.038, 0.038, [0, 0.3, -0.18], 10, 8);
    // 耳环
    [-1, 1].forEach(s => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.012, 6, 14), goldTrim);
      ring.position.set(s * 0.3, -0.11, 0.01);
      ring.rotation.y = PI / 2;
      head.add(ring);
      ball(head, blue, 0.018, 0.018, 0.018, [s * 0.3, -0.15, 0.01], 8, 6);
    });

    g.userData.head = head;
    g.userData.body = body;
    return g;
  };

  /* ---------------- 龟霸 ---------------- */
  builders.koopa = function (c) {
    const pal = makePalette();
    const skin = pal.std('skin', 0xf2c14e, { roughness: 0.6 });
    const skinDark = pal.std('skinDark', 0xd9a336, { roughness: 0.65 });
    const bellyMat = pal.std('belly', 0xf8e7bb, { roughness: 0.6 });
    const shell = pal.std('shell', 0x2f7d31, { roughness: 0.5 });
    const shellDark = pal.std('shellDark', 0x1e5a22, { roughness: 0.55 });
    const spikeMat = pal.std('spike', 0xfff6dc, { roughness: 0.35 });
    const hairMat = pal.std('hair', 0xd7263d, { roughness: 0.5 });
    const cuffMat = pal.std('cuff', 0x3b3b52, { roughness: 0.45, metalness: 0.5 });
    const spikeMetal = pal.std('spikeMetal', 0xb9c4d2, { roughness: 0.25, metalness: 0.9 });
    const scleraMat = pal.std('sclera', 0xfff8e6, { roughness: 0.2 });
    const irisMat = pal.std('iris', 0xff8a2a, { roughness: 0.15, emissive: 0x6a2200, emissiveIntensity: 0.4 });
    const pupilMat = pal.std('pupil', 0x1a1208, { roughness: 0.1 });
    const glowMat = pal.std('glow', 0xffffff, { roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.6 });

    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);

    // 躯干
    const torsoGeo = U.lathe([
      [0.03, 0.26], [0.27, 0.27], [0.35, 0.36], [0.385, 0.5],
      [0.385, 0.64], [0.35, 0.78], [0.3, 0.88], [0.19, 0.94], [0.02, 0.96]
    ], 26, true);
    const torso = new THREE.Mesh(torsoGeo, skin);
    torso.scale.z = 0.84;
    body.add(torso);
    // 腹甲
    for (let i = 0; i < 4; i++) {
      const w = 0.4 - i * 0.03;
      M(body, U.roundedBox(w, 0.15, 0.07, 0.045, 3), bellyMat, [0, 0.33 + i * 0.155, -0.255 + i * 0.02]);
    }
    // 背壳
    const shellGeo = new THREE.SphereGeometry(0.55, 26, 18, 0, PI * 2, 0, PI * 0.58);
    const shellM = new THREE.Mesh(shellGeo, shell);
    shellM.position.set(0, 0.62, 0.2);
    shellM.rotation.x = PI * 0.45;
    shellM.scale.set(1.08, 1.16, 1.0);
    body.add(shellM);
    // 壳缘
    // 壳缘只保留后半圈，避免在正面看成一条腰带
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.045, 8, 26, PI * 1.05), shellDark);
    rim.position.set(0, 0.46, 0.2);
    rim.rotation.set(1.34, 0, PI * 0.475);
    rim.scale.set(1.04, 1.0, 1.0);
    body.add(rim);
    // 壳刺（环状 3 圈）
    for (let ring = 0; ring < 3; ring++) {
      const rr = 0.42 - ring * 0.11;
      const n = 8 - ring * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2 + ring * 0.4;
        const px = Math.cos(a) * rr;
        const pz = 0.28 + ring * 0.12 + Math.sin(a) * rr * 0.55;
        const py = 0.72 + ring * 0.16;
        const sp = M(body, new THREE.ConeGeometry(0.075, 0.24, 7), spikeMat, [px, py, pz]);
        sp.rotation.set(0.5 + ring * 0.15, 0, -Math.cos(a) * 0.5);
      }
    }

    // 手臂
    [-1, 1].forEach(s => {
      const sh = [s * 0.42, 0.8, 0];
      const el = [s * 0.52, 0.66, -0.14];
      const wr = [s * 0.48, 0.6, -0.36];
      ball(body, skin, 0.16, 0.16, 0.16, sh, 18, 13);
      limb(body, skin, sh, el, 0.135, 0.115, 14);
      limb(body, skin, el, wr, 0.11, 0.1, 14);
      // 铆钉护腕
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.11, 18, 1, true), cuffMat);
      cuff.position.set(el[0], el[1], el[2]);
      cuff.rotation.x = 0.9;
      body.add(cuff);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * PI * 2;
        M(body, new THREE.ConeGeometry(0.026, 0.075, 5), spikeMetal,
          [el[0] + Math.cos(a) * 0.135, el[1] + 0.05, el[2] + Math.sin(a) * 0.135], [0.9, 0, a]);
      }
      // 爪
      ball(body, skin, 0.115, 0.1, 0.12, [wr[0], wr[1] - 0.02, wr[2] - 0.03], 16, 12);
      fingers(body, skin, [wr[0], wr[1] - 0.02, wr[2] - 0.1], [0, -0.2, -1], 0.36, 3, 0.036, 0.11, spikeMat);
    });

    // 腿
    [-1, 1].forEach(s => {
      const hip = [s * 0.22, 0.3, 0.0];
      const knee = [s * 0.25, 0.22, -0.24];
      const ankle = [s * 0.25, 0.1, -0.36];
      limb(body, skin, hip, knee, 0.16, 0.13, 14);
      limb(body, skin, knee, ankle, 0.12, 0.1, 14);
      boot(body, pal.std('boot2', 0x7a4a12, { roughness: 0.55 }), pal.std('sole3', 0x4a2c08, { roughness: 0.7 }),
        [ankle[0], ankle[1] - 0.04, ankle[2] - 0.06], 1.02);
    });

    // 头
    const head = new THREE.Group();
    head.position.set(0, 1.16, -0.04);
    head.scale.setScalar(1.18);
    body.add(head);
    M(body, new THREE.CylinderGeometry(0.15, 0.2, 0.16, 14), skin, [0, 1.0, -0.02]);
    ball(head, skin, 0.36, 0.33, 0.35, [0, 0, 0], 26, 18);
    // 口鼻
    ball(head, skin, 0.27, 0.18, 0.2, [0, -0.14, -0.24], 20, 14);
    ball(head, skinDark, 0.23, 0.09, 0.1, [0, -0.075, -0.35], 18, 12);
    // 鼻孔
    [-1, 1].forEach(s => ball(head, skinDark, 0.028, 0.022, 0.022, [s * 0.07, -0.05, -0.42], 8, 6));
    // 嘴 + 獠牙
    mouth(head, pal.std('mouth2', 0x8a3a2a, { roughness: 0.45 }), { y: -0.2, z: -0.33, w: 0.15, h: 0.03 });
    for (let i = 0; i < 4; i++) {
      const f = M(head, new THREE.ConeGeometry(0.028, 0.08, 5), spikeMat,
        [-0.105 + i * 0.07, -0.225, -0.36], [PI, 0, 0]);
    }
    // 眼
    eyes(head, {
      x: 0.155, y: 0.07, z: -0.27, r: 0.088,
      scleraMat, irisMat, pupilMat, glowMat, lidMat: skin, lookY: -0.06
    });
    // 粗眉
    brows(head, skinDark, { x: 0.16, y: 0.2, z: -0.26, w: 0.1, h: 0.036, tilt: -0.24 });
    // 角
    [-1, 1].forEach(s => {
      const horn = M(head, new THREE.ConeGeometry(0.082, 0.34, 8), spikeMat, [s * 0.26, 0.29, -0.05]);
      horn.rotation.z = s * 0.34;
      horn.rotation.x = -0.12;
      // 角上的环
      for (let k = 0; k < 2; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04 - k * 0.012, 0.008, 5, 12), skinDark);
        ring.position.set(s * 0.24 + s * (0.03 + k * 0.03), 0.3 + 0.16 + k * 0.06, -0.02);
        ring.rotation.x = PI / 2;
        ring.rotation.z = s * 0.34;
        head.add(ring);
      }
    });
    // 红发
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.3;
      const tuft = M(head, new THREE.ConeGeometry(0.06, 0.28, 6), hairMat,
        [Math.sin(a) * 0.18, 0.3, Math.cos(a) * 0.16], [-0.5 + Math.cos(a) * 0.3, 0, Math.sin(a) * 0.4]);
    }
    ball(head, hairMat, 0.2, 0.1, 0.18, [0, 0.26, 0.16], 16, 11);

    g.userData.head = head;
    g.userData.body = body;
    g.userData.scale = 1.06;
    return g;
  };

  /* ---------------- 蘑菇仔 ---------------- */
  builders.mushroom = function (c) {
    const pal = makePalette();
    const skin = pal.std('skin', 0xfff2d8, { roughness: 0.6 });
    const capMat = pal.std('cap', c.color, { roughness: 0.42 });
    const capUnder = pal.std('capUnder', 0xf1dcbc, { roughness: 0.7 });
    const spotMat = pal.std('spot', 0xfffdf5, { roughness: 0.5 });
    const vest = pal.std('vest', 0x2f6fd0, { roughness: 0.62 });
    const vestTrim = pal.std('vestTrim', 0xffe066, { roughness: 0.4, metalness: 0.4 });
    const shoeMat = pal.std('shoe', 0xc0392b, { roughness: 0.45 });
    const sole = pal.std('sole', 0x7a2018, { roughness: 0.7 });
    const white = pal.std('white', 0xffffff, { roughness: 0.5 });
    const scleraMat = pal.std('sclera', 0xffffff, { roughness: 0.14 });
    const irisMat = pal.std('iris', 0x2a4a8a, { roughness: 0.12 });
    const pupilMat = pal.std('pupil', 0x101528, { roughness: 0.1 });
    const glowMat = pal.std('glow', 0xffffff, { roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.6 });

    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);

    // 身体（小）
    const torso = new THREE.Mesh(U.lathe([
      [0.02, 0.28], [0.16, 0.28], [0.2, 0.34], [0.21, 0.44], [0.19, 0.52], [0.14, 0.58], [0.02, 0.59]
    ], 22, true), skin);
    torso.scale.z = 0.82;
    body.add(torso);
    // 马甲
    const vestGeo = U.lathe([
      [0.02, 0.3], [0.17, 0.3], [0.215, 0.36], [0.225, 0.46], [0.2, 0.54], [0.02, 0.55]
    ], 24, true);
    const vestM = new THREE.Mesh(vestGeo, vest);
    vestM.scale.z = 0.84;
    body.add(vestM);
    // 马甲前襟
    M(body, U.roundedBox(0.1, 0.24, 0.04, 0.02, 2), vestTrim, [0, 0.44, -0.19]);
    // 纽扣
    for (let i = 0; i < 3; i++) {
      M(body, new THREE.SphereGeometry(0.018, 10, 8), vestTrim, [0, 0.36 + i * 0.07, -0.215]);
    }
    // 手臂
    [-1, 1].forEach(s => {
      const sh = [s * 0.19, 0.5, 0];
      const el = [s * 0.24, 0.4, -0.1];
      const wr = [s * 0.22, 0.42, -0.28];
      limb(body, skin, sh, el, 0.055, 0.05, 12);
      limb(body, skin, el, wr, 0.05, 0.045, 12);
      glove(body, white, [wr[0], wr[1] - 0.01, wr[2] - 0.01], white, [0, -0.2, -1], 0.72);
    });
    // 腿
    [-1, 1].forEach(s => {
      const hip = [s * 0.1, 0.3, 0];
      const knee = [s * 0.12, 0.2, -0.14];
      const ankle = [s * 0.12, 0.08, -0.2];
      limb(body, skin, hip, knee, 0.062, 0.055, 12);
      limb(body, skin, knee, ankle, 0.052, 0.048, 12);
      boot(body, shoeMat, sole, [ankle[0], ankle[1] - 0.04, ankle[2] - 0.05], 0.72);
    });

    // 头
    const head = new THREE.Group();
    head.position.set(0, 0.82, 0);
    body.add(head);
    ball(head, skin, 0.24, 0.22, 0.23, [0, 0, 0], 22, 16);
    // 菌盖
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 30, 20, 0, PI * 2, 0, PI * 0.58), capMat);
    cap.position.set(0, 0.12, 0);
    cap.scale.set(1.06, 1.02, 1.06);
    head.add(cap);
    // 菌盖内侧
    const under = new THREE.Mesh(new THREE.CircleGeometry(0.425, 30), capUnder);
    under.position.set(0, 0.125, 0);
    under.rotation.x = PI / 2;
    under.scale.set(1.05, 1.05, 1);
    head.add(under);
    // 白点（贴面）
    const spots = [
      [0, 0.47, 0, 0.15], [0.28, 0.36, 0.08, 0.11], [-0.26, 0.37, -0.05, 0.12],
      [0.08, 0.36, -0.33, 0.1], [-0.12, 0.37, 0.3, 0.11], [0.34, 0.2, -0.2, 0.08]
    ];
    spots.forEach(sp => {
      const b = ball(head, spotMat, sp[3], sp[3] * 0.42, sp[3], [sp[0], sp[1], sp[2]], 14, 10);
      b.rotation.x = -0.2;
    });
    // 眼
    eyes(head, {
      x: 0.1, y: 0.0, z: -0.19, r: 0.072,
      scleraMat, irisMat, pupilMat, glowMat, lidMat: skin, lookY: -0.05
    });
    // 嘴
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 14, PI), pal.std('mouth3', 0xb85a5a, { roughness: 0.5 }));
    lip.position.set(0.01, -0.12, -0.215);
    lip.rotation.set(0, 0, PI);
    head.add(lip);
    brows(head, pal.std('brow3', 0x8a6a4a, { roughness: 0.6 }), { x: 0.1, y: 0.1, z: -0.2, w: 0.05, h: 0.014, tilt: 0.16 });

    g.userData.head = head;
    g.userData.body = body;
    g.userData.scale = 0.88;
    return g;
  };

  /* ---------------- 小恐龙 ---------------- */
  builders.dino = function (c) {
    const pal = makePalette();
    const skin = pal.std('skin', c.color, { roughness: 0.55 });
    const skinDark = pal.std('skinDark', U.shade(c.color, -0.16), { roughness: 0.6 });
    const belly = pal.std('belly', 0xfffdf0, { roughness: 0.55 });
    const saddle = pal.std('saddle', 0xe63946, { roughness: 0.5 });
    const saddleTrim = pal.std('saddleTrim', 0xffd60a, { roughness: 0.35 });
    const crest = pal.std('crest', 0xff5c5c, { roughness: 0.45 });
    const bootM = pal.std('boot', 0xf08a2a, { roughness: 0.5 });
    const sole = pal.std('sole', 0xc4661a, { roughness: 0.7 });
    const scleraMat = pal.std('sclera', 0xffffff, { roughness: 0.14 });
    const irisMat = pal.std('iris', 0x1d3a7a, { roughness: 0.12 });
    const pupilMat = pal.std('pupil', 0x0d1220, { roughness: 0.1 });
    const glowMat = pal.std('glow', 0xffffff, { roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.6 });

    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);

    // 躯干
    const torso = new THREE.Mesh(U.lathe([
      [0.02, 0.24], [0.22, 0.25], [0.28, 0.32], [0.31, 0.44],
      [0.3, 0.58], [0.26, 0.7], [0.2, 0.78], [0.02, 0.8]
    ], 24, true), skin);
    torso.scale.z = 0.86;
    body.add(torso);
    // 白肚皮
    const bellyM = new THREE.Mesh(U.lathe([
      [0.02, 0.26], [0.16, 0.27], [0.2, 0.34], [0.21, 0.46], [0.19, 0.58], [0.02, 0.6]
    ], 20, true), belly);
    bellyM.position.set(0, 0, -0.09);
    bellyM.scale.set(0.94, 1, 0.66);
    body.add(bellyM);
    // 鞍
    M(body, U.roundedBox(0.34, 0.09, 0.34, 0.05, 3), saddle, [0, 0.61, 0.05]);
    M(body, U.roundedBox(0.36, 0.035, 0.36, 0.02, 2), saddleTrim, [0, 0.565, 0.05]);
    [-1, 1].forEach(s => {
      M(body, U.roundedBox(0.06, 0.1, 0.3, 0.03, 2), saddle, [s * 0.19, 0.56, 0.05]);
    });

    // 手臂
    [-1, 1].forEach(s => {
      const sh = [s * 0.28, 0.6, -0.02];
      const el = [s * 0.32, 0.52, -0.16];
      const wr = [s * 0.3, 0.53, -0.32];
      limb(body, skin, sh, el, 0.07, 0.062, 12);
      limb(body, skin, el, wr, 0.06, 0.055, 12);
      ball(body, skin, 0.068, 0.062, 0.07, [wr[0], wr[1] - 0.01, wr[2] - 0.03], 12, 9);
      fingers(body, skinDark, [wr[0], wr[1] - 0.01, wr[2] - 0.08], [0, -0.2, -1], 0.3, 3, 0.02, 0.055);
    });

    // 腿
    [-1, 1].forEach(s => {
      const hip = [s * 0.16, 0.3, 0.02];
      const knee = [s * 0.19, 0.24, -0.2];
      const ankle = [s * 0.19, 0.1, -0.3];
      limb(body, skin, hip, knee, 0.11, 0.09, 13);
      limb(body, skin, knee, ankle, 0.085, 0.075, 13);
      boot(body, bootM, sole, [ankle[0], ankle[1] - 0.04, ankle[2] - 0.05], 0.94);
    });

    // 尾巴
    const tail = new THREE.Group();
    tail.position.set(0, 0.3, 0.32);
    body.add(tail);
    const tailGeo = U.lathe([[0.17, 0.0], [0.14, 0.2], [0.1, 0.42], [0.05, 0.62], [0.005, 0.78]], 14, true);
    const tm = new THREE.Mesh(tailGeo, skin);
    tm.rotation.x = PI / 2 - 0.55;
    tail.add(tm);
    // 尾刺
    for (let i = 0; i < 3; i++) {
      const t = 0.15 + i * 0.2;
      const p = M(tail, new THREE.ConeGeometry(0.045 - i * 0.01, 0.1, 5), crest,
        [0, 0.08 - i * 0.02, 0.15 + t]);
      p.rotation.x = 0.5;
    }

    // 背棘
    for (let i = 0; i < 4; i++) {
      M(body, new THREE.ConeGeometry(0.05 - i * 0.006, 0.11, 5), crest,
        [0, 0.72 - i * 0.11, 0.24 + i * 0.02], [0.45, 0, 0]);
    }

    // 头
    const head = new THREE.Group();
    head.position.set(0, 0.88, -0.06);
    body.add(head);
    M(body, new THREE.CylinderGeometry(0.1, 0.12, 0.12, 14), skin, [0, 0.8, -0.02]);
    ball(head, skin, 0.27, 0.25, 0.26, [0, 0.02, 0.02], 24, 17);
    // 长嘴
    const snout = ball(head, skin, 0.18, 0.145, 0.26, [0, -0.06, -0.26], 20, 14);
    snout.rotation.x = 0.12;
    ball(head, skinDark, 0.135, 0.05, 0.16, [0, -0.14, -0.32], 16, 11);
    // 鼻孔
    [-1, 1].forEach(s => ball(head, skinDark, 0.026, 0.02, 0.02, [s * 0.065, -0.03, -0.47], 8, 6));
    // 嘴缝
    mouth(head, pal.std('mouthD', 0x9a4a3a, { roughness: 0.5 }), { y: -0.12, z: -0.35, w: 0.11, h: 0.018 });
    // 眼（在头顶两侧，凸出）
    [-1, 1].forEach(s => {
      const socket = ball(head, skin, 0.1, 0.13, 0.11, [s * 0.155, 0.185, -0.07], 16, 12);
      const e = ball(head, scleraMat, 0.085, 0.115, 0.075, [s * 0.175, 0.2, -0.13], 18, 13);
      e.userData.noAO = true;
      const ir = ball(head, irisMat, 0.048, 0.058, 0.035, [s * 0.19, 0.19, -0.19], 14, 10);
      ir.userData.noAO = true;
      const pu = ball(head, pupilMat, 0.024, 0.03, 0.02, [s * 0.195, 0.19, -0.215], 10, 8);
      pu.userData.noAO = true;
      const hl = ball(head, glowMat, 0.014, 0.016, 0.01, [s * 0.175, 0.215, -0.225], 8, 6);
      hl.userData.noAO = true;
    });
    // 头冠
    for (let i = 0; i < 3; i++) {
      const cr = M(head, new THREE.ConeGeometry(0.07 - i * 0.01, 0.2 - i * 0.02, 6), crest,
        [0, 0.235 - i * 0.01, 0.06 + i * 0.11], [-0.4 + i * 0.22, 0, 0]);
    }

    g.userData.head = head;
    g.userData.body = body;
    g.userData.tail = tail;
    return g;
  };

  /* ---------------- 幽灵 ---------------- */
  builders.ghost = function (c) {
    const pal = makePalette();
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0xf6f8ff, roughness: 0.32, metalness: 0.0,
      transparent: true, opacity: 0.93,
      emissive: 0x7f8fc8, emissiveIntensity: 0.28,
      vertexColors: true,
      envMapIntensity: 1.1
    });
    const dark = pal.std('dark', 0x1a1a2a, { roughness: 0.2 });
    const tongue = pal.std('tongue', 0xff6b8a, { roughness: 0.4 });
    const crownMat = pal.std('crown', 0xc9a6ff, { roughness: 0.2, metalness: 0.5, emissive: 0x4a2f8a, emissiveIntensity: 0.55 });
    const jewel = pal.std('jewel', 0x7ee0ff, { roughness: 0.1, emissive: 0x1a6b8a, emissiveIntensity: 0.7 });
    const glowMat = pal.std('glow', 0xffffff, { roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.8 });

    const g = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.3;
    g.add(body);

    const head = new THREE.Group();
    head.position.set(0, 0.62, 0);
    body.add(head);

    // 主体：球 + 波浪下摆
    const main = ball(head, ghostMat, 0.46, 0.46, 0.46, [0, 0.06, 0], 28, 20);
    main.userData.noAO = true;
    // 下摆
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      const lobe = ball(body, ghostMat, 0.16, 0.2, 0.16,
        [Math.cos(a) * 0.33, 0.14 - (i % 2) * 0.06, Math.sin(a) * 0.33], 16, 12);
      lobe.userData.noAO = true;
    }
    ball(body, ghostMat, 0.42, 0.24, 0.4, [0, 0.2, 0], 22, 14).userData.noAO = true;

    // 眼（深色椭圆 + 高光）
    [-1, 1].forEach(s => {
      const e = ball(head, dark, 0.115, 0.15, 0.09, [s * 0.16, 0.11, -0.37], 18, 13);
      e.userData.noAO = true;
      const hl = ball(head, glowMat, 0.032, 0.04, 0.02, [s * 0.16 - s * 0.03, 0.17, -0.45], 10, 8);
      hl.userData.noAO = true;
    });
    // 嘴（张开的椭圆口）
    const m = ball(head, dark, 0.085, 0.105, 0.05, [0, -0.17, -0.4], 16, 12);
    m.userData.noAO = true;
    // 舌
    const tg = ball(head, tongue, 0.07, 0.055, 0.04, [0, -0.235, -0.42], 14, 10);
    tg.userData.noAO = true;

    // 手
    [-1, 1].forEach(s => {
      const arm = ball(body, ghostMat, 0.13, 0.16, 0.13, [s * 0.45, 0.6, -0.1], 16, 12);
      arm.userData.noAO = true;
      for (let k = 0; k < 3; k++) {
        const f = ball(body, ghostMat, 0.045, 0.055, 0.045, [s * (0.5 + k * 0.03), 0.68 + (k % 2) * 0.03, -0.14 - k * 0.03], 10, 8);
        f.userData.noAO = true;
      }
    });

    // 小皇冠
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.1, 18, 1, true), crownMat);
    crown.position.set(0, 0.5, 0);
    head.add(crown);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * PI * 2;
      M(head, new THREE.ConeGeometry(0.03, 0.09, 5), crownMat, [Math.cos(a) * 0.16, 0.58, Math.sin(a) * 0.16]);
    }
    ball(head, jewel, 0.035, 0.035, 0.035, [0, 0.5, -0.17], 10, 8);

    g.userData.head = head;
    g.userData.body = body;
    g.userData.isGhost = true;
    g.userData.hover = true;
    return g;
  };

  /* ============================================================
     收尾：顶点色 AO + 统一材质开关
     ============================================================ */
  function finalize(root) {
    root.traverse(o => {
      if (!o.isMesh) return;
      if (!o.geometry) return;
      if (o.userData.noAO) {
        U.bakeAO(o.geometry, 0, 1);
      } else {
        U.bakeAO(o.geometry, 0.2);
      }
    });
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const m = o.material;
      if (m.vertexColors) return;
      // 材质没开顶点色时，几何体上的 color 属性会被忽略，无需处理
    });
  }

  const Character = {
    ROSTER,
    build(id) {
      const c = ROSTER.find(r => r.id === id) || ROSTER[0];
      let g;
      if (c.id === 'peach') g = builders.princess(c);
      else if (c.id === 'koopa') g = builders.koopa(c);
      else if (c.id === 'mush') g = builders.mushroom(c);
      else if (c.id === 'yoshi') g = builders.dino(c);
      else if (c.id === 'boo') g = builders.ghost(c);
      else g = builders.plumber(c);

      finalize(g);

      const sc = g.userData.scale || 1;
      g.scale.setScalar(sc);
      g.userData.charId = id;
      g.userData.charData = c;
      g.userData.phase = Math.random() * 10;
      return g;
    },
    get(id) { return ROSTER.find(r => r.id === id) || ROSTER[0]; }
  };

  SK.Character = Character;
})();
