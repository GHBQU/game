/* ============================================================
   Super Kart 8 — util.js
   基础数学 / 随机数 / 绘制工具 / 几何助手
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = (SK.U = {});

  // 线性工作流：HTML/CSS 里的十六进制色按 sRGB 解释，转成线性参与光照
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  U.TAU = Math.PI * 2;
  U.DEG = Math.PI / 180;

  /* ---------------- 全局极速上限 ----------------
     仪表盘与物理共用同一个数值：任何状态（加速蘑菇 / 迷你涡轮 /
     星星 / 炮弹 / 金币加成 / 200cc）都不会超过 235 km/h。      */
  U.SPEED_MAX_KMH = 235;
  U.SPEED_MAX = U.SPEED_MAX_KMH / 3.6;      // 65.278 m/s
  U.kmh = function (v) { return Math.min(U.SPEED_MAX_KMH, Math.abs(v) * 3.6); };

  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.invLerp = function (a, b, v) { return (v - a) / (b - a || 1); };
  U.smoothstep = function (t) { t = U.clamp01(t); return t * t * (3 - 2 * t); };
  U.smootherstep = function (t) { t = U.clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  U.easeOutCubic = function (t) { t = U.clamp01(t); return 1 - Math.pow(1 - t, 3); };
  U.easeInCubic = function (t) { return U.clamp01(t) ** 3; };
  U.easeOutBack = function (t) {
    t = U.clamp01(t); const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };
  U.easeOutElastic = function (t) {
    t = U.clamp01(t);
    if (t === 0 || t === 1) return t;
    const c = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
  };

  /** 帧率无关的指数阻尼插值 */
  U.damp = function (a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); };

  /** 角度归一化到 [-PI, PI] */
  U.wrapAngle = function (a) {
    a = (a + Math.PI) % U.TAU;
    if (a < 0) a += U.TAU;
    return a - Math.PI;
  };
  U.angleDiff = function (a, b) { return U.wrapAngle(b - a); };
  U.angleLerp = function (a, b, t) { return a + U.angleDiff(a, b) * t; };
  U.dampAngle = function (a, b, lambda, dt) { return U.angleLerp(a, b, 1 - Math.exp(-lambda * dt)); };

  U.mod = function (v, m) { return ((v % m) + m) % m; };
  U.sign = function (v) { return v < 0 ? -1 : v > 0 ? 1 : 0; };
  U.approach = function (cur, target, delta) {
    if (cur < target) return Math.min(cur + delta, target);
    return Math.max(cur - delta, target);
  };
  U.approachSmooth = function (cur, target, rate, dt) {
    const d = target - cur;
    return cur + d * (1 - Math.exp(-rate * dt));
  };

  U.rand = function (a, b) {
    if (a === undefined) return Math.random();
    if (b === undefined) return Math.random() * a;
    return a + Math.random() * (b - a);
  };
  U.randInt = function (a, b) { return Math.floor(U.rand(a, b + 1)); };
  U.pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  U.chance = function (p) { return Math.random() < p; };
  U.randSign = function () { return Math.random() < 0.5 ? -1 : 1; };

  /** 确定性伪随机（mulberry32），用于地形与装饰布置 */
  U.RNG = function (seed) {
    let a = seed >>> 0;
    const self = {
      next() {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range(min, max) { return min + self.next() * (max - min); },
      int(min, max) { return Math.floor(self.range(min, max + 1)); },
      pick(arr) { return arr[Math.floor(self.next() * arr.length) % arr.length]; },
      chance(p) { return self.next() < p; },
      sign() { return self.next() < 0.5 ? -1 : 1; }
    };
    return self;
  };

  U.formatTime = function (t) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t * 1000) % 1000);
    const ss = String(s).padStart(2, '0');
    const ccc = String(cs).padStart(3, '0');
    return m > 0 ? `${m}'${ss}"${ccc}` : `${ss}"${ccc}`;
  };
  U.formatTimeShort = function (t) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t * 100) % 100);
    const ss = String(s).padStart(2, '0');
    const cc = String(cs).padStart(2, '0');
    return m > 0 ? `${m}'${ss}"${cc}` : `${ss}"${cc}`;
  };

  /* ---------------- 帧 / 时间 ---------------- */
  U.now = function () { return performance.now(); };

  /* ---------------- 通用几何 ---------------- */

  /** 圆角盒（用于车身、Chassis 等） */
  U.roundedBox = function (w, h, d, r, seg) {
    r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    seg = seg || 2;
    const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
    const pos = geo.attributes.position;
    const normal = geo.attributes.normal;
    const v = new THREE.Vector3();
    const inner = new THREE.Vector3();
    const half = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      inner.set(
        U.clamp(v.x, -half.x, half.x),
        U.clamp(v.y, -half.y, half.y),
        U.clamp(v.z, -half.z, half.z)
      );
      const dir = v.clone().sub(inner);
      const len = dir.length();
      if (len > 1e-6) {
        dir.multiplyScalar(r / len);
        v.copy(inner).add(dir);
        pos.setXYZ(i, v.x, v.y, v.z);
        normal.setXYZ(i, dir.x / r, dir.y / r, dir.z / r);
      }
    }
    geo.computeBoundingSphere();
    return geo;
  };

  /** 低多边形球（更好看的卡通块面感） */
  U.lowSphere = function (radius, detail) {
    const g = new THREE.SphereGeometry(radius, Math.max(8, (detail || 2) * 5), Math.max(6, (detail || 2) * 3));
    // 轻微扁平化 UV 球极点，让卡通角色更"积木感"
    return g;
  };

  /** 椭球：直接生成缩放后的几何体（法线正确，可参与合批） */
  const _ellipCache = {};
  U.ellipsoid = function (rx, ry, rz, segW, segH) {
    const key = [rx, ry, rz, segW || 20, segH || 14].join(':');
    if (!_ellipCache[key]) {
      const g = new THREE.SphereGeometry(1, segW || 20, segH || 14);
      g.scale(rx, ry, rz);
      g.computeVertexNormals();
      _ellipCache[key] = g;
    }
    // 必须克隆：几何体带顶点色，烘焙 AO 时不能污染共享缓存
    return _ellipCache[key].clone();
  };

  /** 沿曲线的圆管（用于排气管、发丝、线缆） */
  U.tube = function (points, radius, tubular, radial, taper) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
    const seg = tubular || 24;
    const geo = new THREE.TubeGeometry(curve, seg, radius, radial || 8, false);
    if (taper) {
      // 沿轴逐渐收细
      const pos = geo.attributes.position;
      const tan = [];
      for (let i = 0; i <= seg; i++) tan.push(curve.getPointAt(i / seg));
      const v = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const k = 1 - taper * t;
        curve.getPointAt(t, c);
        for (let j = 0; j <= (radial || 8); j++) {
          const idx = i * ((radial || 8) + 1) + j;
          v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
          pos.setXYZ(idx, v.x, v.y, v.z);
        }
      }
      geo.computeVertexNormals();
    }
    return geo;
  };

  /** 旋转体（给一段 2D 剖面折线） */
  U.lathe = function (pts, seg, smooth) {
    const v2 = pts.map(p => new THREE.Vector2(p[0], p[1]));
    if (smooth) {
      // Catmull-Rom 平滑剖面，避免棱角
      const dense = [];
      for (let i = 0; i < v2.length - 1; i++) {
        const p0 = v2[Math.max(0, i - 1)], p1 = v2[i], p2 = v2[i + 1], p3 = v2[Math.min(v2.length - 1, i + 2)];
        const steps = 5;
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const t2 = t * t, t3 = t2 * t;
          const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
          const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
          dense.push(new THREE.Vector2(Math.max(0.0001, x), y));
        }
      }
      dense.push(v2[v2.length - 1]);
      return new THREE.LatheGeometry(dense, seg || 24);
    }
    return new THREE.LatheGeometry(v2, seg || 24);
  };

  /** 平面倒角板（UI 上的号码牌、翼片等） */
  U.plate = function (w, h, t, r) {
    return U.roundedBox(w, h, t, r === undefined ? Math.min(w, h) * 0.12 : r, 3);
  };

  /** 把几何体沿 +Y 轴从 a 到 b 定向（方便画连杆） */
  U.link = function (a, b, radius, radial) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(radius, radius, len, radial || 8, 1, false);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    return geo;
  };

  /** 胶囊（Three r149 无 CapsuleGeometry） */
  U.capsule = function (radius, length, radial, capSeg) {
    radial = radial || 12; capSeg = capSeg || 6;
    const pts = [];
    for (let i = 0; i <= capSeg; i++) {
      const a = (i / capSeg) * Math.PI * 0.5;
      pts.push(new THREE.Vector2(Math.sin(a) * radius, Math.cos(a) * radius));
    }
    const half = Math.max(0, length / 2 - radius);
    const geo = new THREE.LatheGeometry(
      pts.concat([new THREE.Vector2(0, -half - radius)]).map(p => p.clone()),
      radial
    );
    // 构造为上下两个半球 + 中段
    const top = new THREE.SphereGeometry(radius, radial, capSeg, 0, Math.PI * 2, 0, Math.PI / 2);
    const bottom = new THREE.SphereGeometry(radius, radial, capSeg, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const mid = new THREE.CylinderGeometry(radius, radius, Math.max(0.0001, length - radius * 2), radial, 1);
    top.translate(0, half, 0);
    bottom.translate(0, -half, 0);
    const merged = U.mergeGeometries([top, mid, bottom]);
    geo.dispose();
    return merged;
  };

  /** 简易几何合并（仅合并所有几何都具备的属性，缺失 uv 补零） */
  U.mergeGeometries = function (geos) {
    const list = geos.filter(g => g && g.attributes && g.attributes.position);
    if (!list.length) return new THREE.BufferGeometry();
    if (list.length === 1) return list[0].clone();
    const names = ['position', 'normal', 'uv'];
    // 只有全部都有顶点色时才合并颜色，否则颜色桶会变成黑色
    if (list.every(g => g.attributes.color)) names.push('color');
    const sizes = {};
    names.forEach(n => {
      sizes[n] = list.some(g => g.attributes[n]) ? list.find(g => g.attributes[n]).attributes[n].itemSize : 0;
    });
    const out = new THREE.BufferGeometry();
    let total = 0, idxTotal = 0;
    list.forEach(g => {
      total += g.attributes.position.count;
      idxTotal += g.index ? g.index.count : g.attributes.position.count;
    });
    const arrays = {};
    names.forEach(n => { if (sizes[n]) arrays[n] = new Float32Array(total * sizes[n]); });
    // normal 缺失时补 (0,1,0)
    if (!list.every(g => g.attributes.normal)) arrays.normal.fill(0);
    const indices = new Uint32Array(idxTotal);
    let vo = 0, io = 0;
    list.forEach(g => {
      const count = g.attributes.position.count;
      names.forEach(name => {
        if (!arrays[name]) return;
        const src = g.attributes[name];
        const size = sizes[name];
        if (src) {
          const n = Math.min(count * size, src.array.length);
          arrays[name].set(src.array.subarray(0, n), vo * size);
        } else if (name === 'normal') {
          for (let i = 0; i < count; i++) {
            arrays.normal[(vo + i) * 3 + 1] = 1;
          }
        }
      });
      if (g.index) {
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i++) indices[io++] = idx[i] + vo;
      } else {
        for (let i = 0; i < count; i++) indices[io++] = i + vo;
      }
      vo += count;
    });
    names.forEach(name => {
      if (arrays[name]) out.setAttribute(name, new THREE.BufferAttribute(arrays[name], sizes[name]));
    });
    out.setIndex(new THREE.BufferAttribute(indices, 1));
    out.computeBoundingSphere();
    return out;
  };

  /** 将层级中的静态网格按材质合并，大幅降低 draw call。
      返回合并后的 Group（原 group 被清空） */
  U.bakeStatic = function (root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map();
    const toRemove = [];
    const isDyn = (o) => {
      let p = o;
      while (p && p !== root) { if (p.userData && p.userData.dynamic) return true; p = p.parent; }
      return false;
    };
    root.traverse(o => {
      if (!o.isMesh || o.userData.dynamic || isDyn(o)) return;
      const m = o.material;
      if (!m || Array.isArray(m)) return;
      if (m.transparent) return;
      if (m.blending && m.blending !== THREE.NormalBlending) return;
      if (!o.geometry || !o.geometry.attributes.position) return;
      const key = m.uuid + '|' + (o.renderOrder || 0);
      let b = buckets.get(key);
      if (!b) { b = { mat: m, geos: [], renderOrder: o.renderOrder || 0 }; buckets.set(key, b); }
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      // 去掉多余属性
      for (const name in g.attributes) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
      }
      if (!g.attributes.uv) {
        const n = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      b.geos.push(g);
      toRemove.push(o);
    });

    const merged = new THREE.Group();
    merged.name = root.name + '_baked';
    buckets.forEach(b => {
      if (!b.geos.length) return;
      const geo = U.mergeGeometries(b.geos);
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.renderOrder = b.renderOrder;
      mesh.frustumCulled = false;
      merged.add(mesh);
      b.geos.forEach(g => g.dispose());
    });
    // 移除原网格（不销毁共享材质）
    toRemove.forEach(o => {
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
    });
    root.add(merged);
    return merged;
  };

  /** 用矩阵变换几何体并返回（便于合并静态模型） */
  U.xformGeo = function (geo, pos, rot, scale) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (rot) q.setFromEuler(new THREE.Euler(rot.x || 0, rot.y || 0, rot.z || 0, rot.order || 'XYZ'));
    m.compose(
      pos ? new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0) : new THREE.Vector3(),
      q,
      scale ? new THREE.Vector3(scale.x === undefined ? scale : scale.x, scale.y === undefined ? scale : scale.y, scale.z === undefined ? scale : scale.z)
        : new THREE.Vector3(1, 1, 1)
    );
    const g = geo.clone();
    g.applyMatrix4(m);
    return g;
  };

  /* ---------------- 画布纹理 ---------------- */
  U.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  };

  U.texture = function (canvas, opts) {
    opts = opts || {};
    const t = new THREE.CanvasTexture(canvas);
    t.encoding = opts.linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
    t.wrapS = opts.wrapS || THREE.RepeatWrapping;
    t.wrapT = opts.wrapT || THREE.RepeatWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    t.anisotropy = SK.maxAniso || 4;
    if (opts.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; }
    t.needsUpdate = true;
    return t;
  };

  /** 在画布上叠噪点（做材质细节） */
  U.speckle = function (ctx, w, h, count, colors, sizeMin, sizeMax, alpha) {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const s = U.rand(sizeMin || 1, sizeMax || 2);
      ctx.globalAlpha = alpha === undefined ? U.rand(0.04, 0.16) : alpha;
      ctx.fillStyle = U.pick(colors);
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------- 材质工厂（统一风格） ---------------- */
  U.mat = function (color, opts) {
    opts = opts || {};
    const m = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(opts.emissive || 0x000000),
      emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
      transparent: !!opts.transparent,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      side: opts.side || THREE.FrontSide,
      flatShading: !!opts.flat
    });
    if (opts.map) { m.map = opts.map; }
    if (opts.vertexColors) m.vertexColors = true;
    return m;
  };

  /** PBR 材质（角色 / 车辆等高光主体用） */
  U.matStd = function (color, opts) {
    opts = opts || {};
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: opts.roughness === undefined ? 0.55 : opts.roughness,
      metalness: opts.metalness === undefined ? 0.0 : opts.metalness,
      emissive: new THREE.Color(opts.emissive || 0x000000),
      emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
      transparent: !!opts.transparent,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      side: opts.side || THREE.FrontSide,
      flatShading: !!opts.flat,
      vertexColors: !!opts.vertexColors,
      envMapIntensity: opts.envMapIntensity === undefined ? 0.9 : opts.envMapIntensity
    });
    if (opts.map) m.map = opts.map;
    if (opts.normalMap) { m.normalMap = opts.normalMap; m.normalScale = new THREE.Vector2(opts.normalScale || 1, opts.normalScale || 1); }
    if (opts.aoMap) m.aoMap = opts.aoMap;
    m.userData.pbr = true;
    return m;
  };

  /** 高光材质（塑料 / 漆面），比 Standard 便宜 */
  U.matPhong = function (color, opts) {
    opts = opts || {};
    const m = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color),
      specular: new THREE.Color(opts.specular === undefined ? 0x555555 : opts.specular),
      shininess: opts.shininess === undefined ? 60 : opts.shininess,
      emissive: new THREE.Color(opts.emissive || 0x000000),
      emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
      transparent: !!opts.transparent,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      side: opts.side || THREE.FrontSide,
      flatShading: !!opts.flat,
      vertexColors: !!opts.vertexColors
    });
    if (opts.envMap) { m.envMap = opts.envMap; m.reflectivity = opts.reflectivity === undefined ? 0.6 : opts.reflectivity; }
    if (opts.map) m.map = opts.map;
    return m;
  };

  /**
   * 给几何体烘焙一层方向性环境遮蔽（用于角色与车辆的体积感）。
   * 生成 color 顶点属性，材质需开启 vertexColors。
   */
  U.bakeAO = function (geo, strength, base) {
    const n = geo.attributes.normal;
    if (!n) return geo;
    const count = geo.attributes.position.count;
    let col = geo.attributes.color;
    if (!col) {
      const arr = new Float32Array(count * 3);
      arr.fill(1);
      col = new THREE.BufferAttribute(arr, 3);
      geo.setAttribute('color', col);
    }
    const s = strength === undefined ? 0.26 : strength;
    const b = base === undefined ? 1 : base;
    for (let i = 0; i < count; i++) {
      const ny = n.getY(i);
      const ao = (1 - s * (1 - (ny * 0.5 + 0.5)));
      col.setXYZ(i, col.getX(i) * b * ao, col.getY(i) * b * ao, col.getZ(i) * b * ao);
    }
    col.needsUpdate = true;
    return geo;
  };

  U.matBasic = function (color, opts) {    opts = opts || {};
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: !!opts.transparent,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      side: opts.side || THREE.FrontSide,
      map: opts.map || null,
      depthWrite: opts.depthWrite === undefined ? true : opts.depthWrite,
      blending: opts.blending || THREE.NormalBlending,
      vertexColors: !!opts.vertexColors
    });
  };

  U.mesh = function (geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    if (x !== undefined) m.position.set(x, y || 0, z || 0);
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  };

  U.group = function (x, y, z) {
    const g = new THREE.Group();
    if (x !== undefined) g.position.set(x, y || 0, z || 0);
    return g;
  };

  U.disposeObject = function (obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    if (obj.parent) obj.parent.remove(obj);
  };

  /* ---------------- 2D 工具 ---------------- */
  U.pointInPoly = function (x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };

  /** 颜色混合 */
  U.mixColor = function (c1, c2, t) {
    const a = new THREE.Color(c1), b = new THREE.Color(c2);
    return a.lerp(b, t);
  };

  U.shade = function (hex, amount) {
    const c = new THREE.Color(hex);
    if (amount >= 0) c.lerp(new THREE.Color(0xffffff), amount);
    else c.lerp(new THREE.Color(0x000000), -amount);
    return c.getHex();
  };

  /* ---------------- 方向 / 基向量 ---------------- */
  const _m4 = new THREE.Matrix4();
  U.quatFromBasis = function (forward, up, out) {
    const f = forward.clone().normalize();
    let u = up.clone();
    const r = new THREE.Vector3().crossVectors(f, u);
    if (r.lengthSq() < 1e-8) {
      r.set(0, 1, 0).cross(f);
      if (r.lengthSq() < 1e-8) r.set(1, 0, 0);
    }
    r.normalize();
    u = new THREE.Vector3().crossVectors(r, f).normalize();
    _m4.makeBasis(r, u, f.clone().negate());
    const q = out || new THREE.Quaternion();
    return q.setFromRotationMatrix(_m4);
  };

  U.lerpVec = function (out, a, b, t) {
    return out.set(U.lerp(a.x, b.x, t), U.lerp(a.y, b.y, t), U.lerp(a.z, b.z, t));
  };

  /** 平滑随机起伏（1D 值噪声）——用于地形与装饰 */
  U.makeNoise1D = function (seed, octaves) {
    const rng = U.RNG(seed || 1);
    octaves = octaves || 3;
    const tables = [];
    for (let o = 0; o < octaves; o++) {
      const n = 64 << o;
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) arr[i] = rng.range(-1, 1);
      tables.push(arr);
    }
    return function (x) {
      let v = 0, amp = 1, norm = 0, freq = 1;
      for (let o = 0; o < octaves; o++) {
        const arr = tables[o];
        const n = arr.length;
        const p = U.mod(x * freq, 1) * n;
        const i0 = Math.floor(p) % n, i1 = (i0 + 1) % n;
        const f = p - Math.floor(p);
        const s = f * f * (3 - 2 * f);
        v += U.lerp(arr[i0], arr[i1], s) * amp;
        norm += amp; amp *= 0.5; freq *= 2.07;
      }
      return v / norm;
    };
  };

  U.deg = function (d) { return d * U.DEG; };
})();
