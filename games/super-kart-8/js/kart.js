/* ============================================================
   Super Kart 8 — kart.js
   卡丁车模型（4 种车型）+ 街机物理（漂移 / 迷你涡轮 / 跳跃特技 /
   滑翔 / 金币加成 / 道具状态 / 碰撞 / 落地判定）
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;

  /* ================= 模型 ================= */
  const Model = {};

  /* ---------------- 共享纹理 ---------------- */
  let TIRE_TEX = null;
  function tireTexture() {
    if (TIRE_TEX) return TIRE_TEX;
    const S = 256;
    const c = U.canvas(S, S);
    const x = c.getContext('2d');
    x.fillStyle = '#191b22';
    x.fillRect(0, 0, S, S);
    // 胎面花纹：横向沟槽
    for (let i = 0; i < 16; i++) {
      const y = (i / 16) * S;
      x.fillStyle = 'rgba(0,0,0,0.55)';
      x.fillRect(0, y, S, 5);
      x.fillStyle = 'rgba(120,128,145,0.10)';
      x.fillRect(0, y + 5, S, 2);
    }
    // 纵向细纹
    for (let i = 0; i < 4; i++) {
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillRect((i / 4) * S + 12, 0, 3, S);
    }
    // 细颗粒
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.10)';
      x.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
    }
    TIRE_TEX = U.texture(c, { repeat: [1, 1] });
    TIRE_TEX.repeat.set(1, 1);
    return TIRE_TEX;
  }

  const NUM_TEX = {};
  function numberTexture(n, bg, fg) {
    const key = n + '|' + bg + '|' + fg;
    if (NUM_TEX[key]) return NUM_TEX[key];
    const c = U.canvas(128, 128);
    const x = c.getContext('2d');
    x.fillStyle = bg;
    x.beginPath();
    x.arc(64, 64, 60, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.28)';
    x.lineWidth = 5;
    x.stroke();
    x.fillStyle = fg;
    x.font = 'bold 74px "Arial Black", Impact, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(String(n), 64, 70);
    const t = U.texture(c, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    NUM_TEX[key] = t;
    return t;
  }

  /* ---------------- 车轮 ---------------- */
  /**
   * 高精度车轮：胎体旋转体 + 胎面纹理 + 轮辋 + 辐条 + 刹车盘 + 卡钳
   * 轴向沿 X
   */
  function wheel(colorHub, radius, width, knobby, brake) {
    const g = new THREE.Group();
    const R = radius, W = width;
    const tireTex = tireTexture();

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x24262e, roughness: 0.92, metalness: 0.0, map: tireTex
    });
    const hubMat = new THREE.MeshStandardMaterial({
      color: colorHub, roughness: 0.28, metalness: 0.72, envMapIntensity: 1.2
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd6dee9, roughness: 0.16, metalness: 0.98, envMapIntensity: 1.4
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x353a46, roughness: 0.5, metalness: 0.75
    });

    // 胎体：闭合剖面旋转体（轴沿 Y，之后整体转 90°）
    const hw = W * 0.5;
    const prof = [
      [R * 0.70, -hw],
      [R * 0.90, -hw * 1.02],
      [R * 0.985, -hw * 0.72],
      [R * 1.0, -hw * 0.30],
      [R * 1.0, hw * 0.30],
      [R * 0.985, hw * 0.72],
      [R * 0.90, hw * 1.02],
      [R * 0.70, hw]
    ];
    const tireGeo = U.lathe(prof, knobby ? 26 : 32, true);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    g.add(tire);

    // 胎肩磨损环
    if (!knobby) {
      [-1, 1].forEach(s => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.955, R * 0.035, 6, 30), tireMat);
        ring.position.x = s * hw * 0.55;
        ring.rotation.y = Math.PI / 2;
        g.add(ring);
      });
    } else {
      // 越野胎块
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        [-1, 1].forEach(s => {
          const lug = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, R * 0.14, R * 0.22), tireMat);
          lug.position.set(s * W * 0.24, Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97);
          lug.rotation.x = -a;
          g.add(lug);
        });
      }
    }

    // 轮辋筒
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.70, R * 0.70, W * 0.94, 26, 1, true), hubMat);
    barrel.rotation.z = Math.PI / 2;
    g.add(barrel);

    // 轮辋外圈（唇）
    [-1, 1].forEach(s => {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 0.70, R * 0.035, 7, 28), chromeMat);
      lip.position.x = s * W * 0.46;
      lip.rotation.y = Math.PI / 2;
      g.add(lip);
    });

    // 轮辐盘（内外两侧都做，侧视才不会看到一块黑盘）
    const faceX = W * 0.34;
    const spokeCount = knobby ? 6 : 5;
    [1, -1].forEach(side => {
      const fx = faceX * side;
      for (let i = 0; i < spokeCount; i++) {
        const a = (i / spokeCount) * Math.PI * 2 + (side < 0 ? 0.3 : 0);
        const spoke = new THREE.Mesh(U.roundedBox(R * 0.14, R * 0.62, W * 0.14, R * 0.05, 2), hubMat);
        spoke.position.set(fx, Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.38);
        spoke.rotation.x = -a;
        g.add(spoke);
      }
      const hubFace = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.26, R * 0.26, W * 0.1, 20), hubMat);
      hubFace.rotation.z = Math.PI / 2;
      hubFace.position.x = fx - W * 0.02 * side;
      g.add(hubFace);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.13, R * 0.13, W * 0.12, 16), chromeMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = fx + W * 0.04 * side;
      g.add(cap);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.035, R * 0.035, 0.03, 6), chromeMat);
        nut.rotation.z = Math.PI / 2;
        nut.position.set(fx + W * 0.1 * side, Math.cos(a) * R * 0.19, Math.sin(a) * R * 0.19);
        g.add(nut);
      }
    });
    // 刹车盘 + 卡钳（内侧）
    if (brake !== false) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.56, R * 0.56, 0.022, 26), darkMetal);
      disc.rotation.z = Math.PI / 2;
      disc.position.x = -W * 0.1;
      g.add(disc);
      // 打孔
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.035, R * 0.035, 0.03, 6), tireMat);
        hole.rotation.z = Math.PI / 2;
        hole.position.set(-W * 0.1, Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4);
        g.add(hole);
      }
      const caliper = new THREE.Mesh(U.roundedBox(0.06, R * 0.28, R * 0.22, 0.02, 2), darkMetal);
      caliper.position.set(-W * 0.1, -R * 0.42, 0);
      g.add(caliper);
    }
    return g;
  }

  /* ---------------- 材质包 ---------------- */
  function kartMaterials(color, accent) {
    return {
      body: U.matStd(color, { roughness: 0.22, metalness: 0.28, envMapIntensity: 1.15 }),
      accent: U.matStd(accent, { roughness: 0.26, metalness: 0.32, envMapIntensity: 1.1 }),
      dark: U.matStd(0x272c38, { roughness: 0.5, metalness: 0.45, envMapIntensity: 0.8 }),
      metal: U.matStd(0xb9c4d2, { roughness: 0.22, metalness: 0.95, envMapIntensity: 1.35 }),
      chrome: U.matStd(0xe4ecf6, { roughness: 0.1, metalness: 1.0, envMapIntensity: 1.5 }),
      seat: U.matStd(0x2b2f3c, { roughness: 0.78, metalness: 0.05, envMapIntensity: 0.5 }),
      rubber: U.matStd(0x1c1e25, { roughness: 0.95, metalness: 0.0, envMapIntensity: 0.35 }),
      glass: U.matStd(0x9fd8ff, { roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55, emissive: 0x2a6a9a, emissiveIntensity: 0.35 }),
      lamp: U.matStd(0xfff3c4, { roughness: 0.1, emissive: 0xffe08a, emissiveIntensity: 0.85 }),
      brake: U.matStd(0xc0482f, { roughness: 0.35, metalness: 0.6 })
    };
  }

  /** 返回 { group, wheels:{fl,fr,rl,rr}, driverAnchor, exhausts:[], type } */
  Model.build = function (type, color, accent, opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const P = kartMaterials(color, accent);
    const wheels = {};
    const exhausts = [];
    let driverAnchor = new THREE.Vector3(0, 0.24, 0.2);

    /* 号码贴花 */
    const num = opts.number || 1;
    const numMat = new THREE.MeshStandardMaterial({
      map: numberTexture(num, '#f7f9ff', '#22262f'),
      roughness: 0.4, metalness: 0.1, transparent: true
    });

    if (type === 'bike') {
      /* ============ 摩托 ============ */
      // 主车架
      const frame = new THREE.Mesh(U.roundedBox(0.34, 0.26, 1.5, 0.13, 4), P.dark);
      frame.position.set(0, 0.62, 0.02);
      g.add(frame);
      // 油箱 / 整流罩
      const tank = new THREE.Mesh(U.lathe([
        [0.02, 0.0], [0.17, 0.02], [0.21, 0.14], [0.2, 0.28], [0.14, 0.4], [0.02, 0.42]
      ], 20, true), P.body);
      tank.rotation.x = Math.PI / 2;
      tank.scale.set(1, 1, 0.8);
      tank.position.set(0, 0.72, -0.28);
      g.add(tank);
      // 前整流罩
      const nose = new THREE.Mesh(U.roundedBox(0.4, 0.34, 0.5, 0.16, 4), P.accent);
      nose.position.set(0, 0.74, -0.92);
      nose.rotation.x = -0.22;
      g.add(nose);
      // 风挡
      const shield = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3, 1, 1), P.glass);
      shield.position.set(0, 0.94, -0.92);
      shield.rotation.x = -0.75;
      g.add(shield);
      // 大灯
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), P.lamp);
      lamp.scale.set(1.3, 0.9, 0.6);
      lamp.position.set(0, 0.7, -1.13);
      g.add(lamp);
      // 车把
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 10), P.chrome);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 0.9, -0.34);
      g.add(bar);
      [-1, 1].forEach(s => {
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.17, 10), P.rubber);
        grip.rotation.z = Math.PI / 2;
        grip.position.set(s * 0.27, 0.9, -0.34);
        g.add(grip);
        // 后视镜
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6), P.metal);
        stalk.position.set(s * 0.26, 0.98, -0.34);
        stalk.rotation.z = s * 0.4;
        g.add(stalk);
        const mir = new THREE.Mesh(U.roundedBox(0.13, 0.08, 0.04, 0.03, 2), P.dark);
        mir.position.set(s * 0.32, 1.05, -0.34);
        mir.rotation.y = s * 0.25;
        g.add(mir);
      });
      // 座椅
      const seat = new THREE.Mesh(U.roundedBox(0.3, 0.12, 0.52, 0.06, 3), P.seat);
      seat.position.set(0, 0.82, 0.26);
      g.add(seat);
      const seatBack = new THREE.Mesh(U.roundedBox(0.28, 0.34, 0.12, 0.06, 3), P.seat);
      seatBack.position.set(0, 0.98, 0.52);
      seatBack.rotation.x = 0.2;
      g.add(seatBack);
      // 尾部
      const tail = new THREE.Mesh(U.roundedBox(0.28, 0.22, 0.42, 0.1, 3), P.body);
      tail.position.set(0, 0.86, 0.72);
      tail.rotation.x = -0.15;
      g.add(tail);
      // 尾灯
      const tailLamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.02), P.brake);
      tailLamp.position.set(0, 0.9, 0.94);
      g.add(tailLamp);
      // 排气
      [-1, 1].forEach(s => {
        const pipe = new THREE.Mesh(U.tube([
          [s * 0.1, 0.5, 0.1], [s * 0.14, 0.46, 0.34], [s * 0.2, 0.44, 0.62], [s * 0.24, 0.46, 0.86]
        ], 0.042, 16, 8), P.chrome);
        g.add(pipe);
        const tipAnchor = new THREE.Object3D();
        tipAnchor.position.set(s * 0.24, 0.46, 0.92);
        g.add(tipAnchor);
        exhausts.push(tipAnchor);
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.09, 12, 1, true), P.chrome);
        tip.rotation.x = Math.PI / 2;
        tip.position.set(s * 0.24, 0.46, 0.9);
        g.add(tip);
      });
      // 前叉 + 转向
      [-1, 1].forEach(s => {
        const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.72, 10), P.metal);
        fork.position.set(s * 0.09, 0.63, -0.92);
        fork.rotation.x = -0.24;
        g.add(fork);
      });
      const clamp1 = new THREE.Mesh(U.roundedBox(0.24, 0.06, 0.1, 0.02, 2), P.dark);
      clamp1.position.set(0, 0.9, -1.0);
      g.add(clamp1);
      // 前挡泥板
      const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 18, 1, true, 0.6, 1.9), P.accent);
      fender.position.set(0, 0.36, -1.0);
      fender.rotation.z = Math.PI / 2;
      fender.rotation.y = Math.PI / 2;
      g.add(fender);
      // 后摇臂
      [-1, 1].forEach(s => {
        const arm = new THREE.Mesh(U.roundedBox(0.05, 0.07, 0.6, 0.02, 2), P.dark);
        arm.position.set(s * 0.13, 0.38, 0.6);
        g.add(arm);
      });
      // 链轮
      const sprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 22), P.metal);
      sprocket.rotation.z = Math.PI / 2;
      sprocket.position.set(-0.14, 0.4, 0.82);
      g.add(sprocket);

      wheels.fl = wheel(accent, 0.32, 0.13, false, true);
      wheels.fl.position.set(0, 0.32, -1.0);
      wheels.fr = null;
      wheels.rl = wheel(accent, 0.35, 0.2, false, false);
      wheels.rl.position.set(0, 0.35, 0.82);
      wheels.rr = null;
      g.add(wheels.fl, wheels.rl);
      driverAnchor = new THREE.Vector3(0, 0.5, 0.2);

    } else if (type === 'atv') {
      /* ============ 沙滩车 ============ */
      // 底盘
      const chassis = new THREE.Mesh(U.roundedBox(1.16, 0.3, 1.9, 0.14, 4), P.dark);
      chassis.position.set(0, 0.46, 0);
      g.add(chassis);
      // 主车身
      const bodyMain = new THREE.Mesh(U.roundedBox(1.02, 0.34, 1.1, 0.16, 4), P.body);
      bodyMain.position.set(0, 0.66, 0.02);
      g.add(bodyMain);
      // 前罩
      const hood = new THREE.Mesh(U.roundedBox(0.94, 0.26, 0.66, 0.14, 4), P.accent);
      hood.position.set(0, 0.7, -0.7);
      hood.rotation.x = 0.08;
      g.add(hood);
      // 前挡泥板
      [-1, 1].forEach(s => {
        const fen = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 20, 1, true, 0.5, 2.0), P.body);
        fen.position.set(s * 0.84, 0.42, -0.72);
        fen.rotation.set(0, 0, Math.PI / 2);
        fen.rotation.y = Math.PI / 2;
        g.add(fen);
        const fen2 = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.34, 20, 1, true, 0.5, 2.0), P.body);
        fen2.position.set(s * 0.88, 0.46, 0.72);
        fen2.rotation.set(0, Math.PI / 2, Math.PI / 2);
        g.add(fen2);
      });
      // 防滚架
      const cageMat = P.metal;
      [-1, 1].forEach(s => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.92, 10), cageMat);
        b.position.set(s * 0.52, 1.16, 0.36);
        b.rotation.x = -0.14;
        g.add(b);
        const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.72, 10), cageMat);
        b2.position.set(s * 0.52, 1.3, 0.0);
        b2.rotation.x = 1.35;
        g.add(b2);
        // 斜撑
        const b3 = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.8, 8), cageMat);
        b3.position.set(s * 0.5, 1.3, 0.42);
        b3.rotation.x = 0.75;
        g.add(b3);
      });
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.08, 10), cageMat);
      top.rotation.z = Math.PI / 2;
      top.position.set(0, 1.5, 0.42);
      g.add(top);
      const top2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.08, 10), cageMat);
      top2.rotation.z = Math.PI / 2;
      top2.position.set(0, 1.52, -0.3);
      g.add(top2);
      // 方向盘
      const steer = new THREE.Group();
      steer.position.set(0, 0.86, -0.3);
      steer.rotation.x = 1.25;
      g.add(steer);
      const rimT = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.026, 8, 24), P.dark);
      steer.add(rimT);
      [-1, 1].forEach(s => {
        const grip = new THREE.Mesh(U.roundedBox(0.065, 0.1, 0.065, 0.028, 3), P.rubber);
        grip.position.set(s * 0.17, 0, 0);
        steer.add(grip);
      });
      const colA = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.4, 8), P.metal);
      colA.position.set(0, 0.7, -0.2);
      colA.rotation.x = 1.1;
      g.add(colA);
      // 座椅
      const seat = new THREE.Mesh(U.roundedBox(0.62, 0.16, 0.6, 0.08, 3), P.seat);
      seat.position.set(0, 0.8, 0.16);
      g.add(seat);
      const back = new THREE.Mesh(U.roundedBox(0.58, 0.44, 0.14, 0.07, 3), P.seat);
      back.position.set(0, 1.0, 0.46);
      back.rotation.x = 0.16;
      g.add(back);
      // 货架
      for (let i = 0; i < 3; i++) {
        const rack = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 6), cageMat);
        rack.rotation.z = Math.PI / 2;
        rack.position.set(0, 0.92, 0.7 + i * 0.12);
        g.add(rack);
      }
      // 前保险杠
      const bull = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 16, Math.PI), P.metal);
      bull.position.set(0, 0.62, -1.02);
      bull.rotation.set(Math.PI / 2, 0, Math.PI);
      g.add(bull);
      // 大灯
      [-1, 1].forEach(s => {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), P.lamp);
        l.scale.set(1, 1, 0.55);
        l.position.set(s * 0.3, 0.82, -1.0);
        g.add(l);
      });
      // 排气
      [-1, 1].forEach(s => {
        const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.4, 12), P.chrome);
        ex.rotation.x = Math.PI / 2;
        ex.position.set(s * 0.36, 0.56, 1.02);
        g.add(ex);
        const anchor = new THREE.Object3D();
        anchor.position.set(s * 0.36, 0.56, 1.24);
        g.add(anchor);
        exhausts.push(anchor);
      });

      wheels.fl = wheel(accent, 0.4, 0.28, true, true); wheels.fl.position.set(0.84, 0.4, -0.72);
      wheels.fr = wheel(accent, 0.4, 0.28, true, true); wheels.fr.position.set(-0.84, 0.4, -0.72);
      wheels.rl = wheel(accent, 0.44, 0.32, true, false); wheels.rl.position.set(0.88, 0.44, 0.74);
      wheels.rr = wheel(accent, 0.44, 0.32, true, false); wheels.rr.position.set(-0.88, 0.44, 0.74);
      g.add(wheels.fl, wheels.fr, wheels.rl, wheels.rr);
      driverAnchor = new THREE.Vector3(0, 0.62, 0.14);

    } else {
      /* ============ 标准卡丁 ============ */
      // 底板
      const floor = new THREE.Mesh(U.roundedBox(0.92, 0.07, 1.86, 0.035, 3), P.dark);
      floor.position.set(0, 0.21, 0.02);
      g.add(floor);
      // 主车舱
      const tub = new THREE.Mesh(U.roundedBox(0.76, 0.32, 0.98, 0.15, 5), P.body);
      tub.position.set(0, 0.39, 0.08);
      g.add(tub);
      // 侧箱
      [-1, 1].forEach(s => {
        const pod = new THREE.Mesh(U.roundedBox(0.2, 0.26, 0.72, 0.09, 4), P.accent);
        pod.position.set(s * 0.45, 0.36, 0.06);
        g.add(pod);
        // 侧箱散热口
        for (let i = 0; i < 3; i++) {
          const vent = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.13), P.dark);
          vent.position.set(s * 0.556, 0.36, -0.12 + i * 0.16);
          g.add(vent);
        }
      });
      // 前鼻锥（剖面前窄后宽）
      const noseGeo = new THREE.BoxGeometry(0.62, 0.26, 0.78, 6, 3, 8);
      {
        const p = noseGeo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const z = p.getZ(i);
          const t = U.clamp01((z + 0.39) / 0.78);   // 0 后 → 1 前
          const k = 1 - 0.62 * Math.pow(t, 0.75);
          p.setX(i, p.getX(i) * k);
          p.setY(i, p.getY(i) * (1 - 0.42 * t) - 0.035 * t);
        }
        noseGeo.computeVertexNormals();
      }
      const nose = new THREE.Mesh(noseGeo, P.accent);
      nose.position.set(0, 0.375, -0.72);
      nose.rotation.x = 0.05;
      g.add(nose);
      // 前翼
      const wing = new THREE.Mesh(U.roundedBox(1.0, 0.045, 0.28, 0.02, 2), P.dark);
      wing.position.set(0, 0.26, -1.06);
      g.add(wing);
      [-1, 1].forEach(s => {
        const ep = new THREE.Mesh(U.roundedBox(0.04, 0.16, 0.3, 0.015, 2), P.body);
        ep.position.set(s * 0.485, 0.31, -1.06);
        g.add(ep);
      });
      // 前保险杠
      const bumper = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 8, 18, Math.PI), P.dark);
      bumper.position.set(0, 0.29, -0.94);
      bumper.rotation.set(Math.PI / 2, 0, Math.PI);
      g.add(bumper);
      // 号码牌
      const plate = new THREE.Mesh(new THREE.CircleGeometry(0.155, 24), numMat);
      plate.position.set(0.0, 0.44, -1.03);
      plate.rotation.x = -0.06;
      g.add(plate);
      // 座椅
      const seatBase = new THREE.Mesh(U.roundedBox(0.44, 0.09, 0.42, 0.05, 3), P.seat);
      seatBase.position.set(0, 0.5, 0.17);
      g.add(seatBase);
      const seatBack = new THREE.Mesh(U.roundedBox(0.42, 0.42, 0.1, 0.06, 3), P.seat);
      seatBack.position.set(0, 0.68, 0.38);
      seatBack.rotation.x = 0.22;
      g.add(seatBack);
      // 侧翼
      [-1, 1].forEach(s => {
        const bol = new THREE.Mesh(U.roundedBox(0.08, 0.2, 0.36, 0.04, 3), P.seat);
        bol.position.set(s * 0.2, 0.58, 0.14);
        bol.rotation.z = s * 0.1;
        g.add(bol);
      });
      // 方向盘
      const steer = new THREE.Group();
      steer.position.set(0, 0.688, -0.145);
      steer.rotation.x = 1.22;
      g.add(steer);
      const rimT = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.026, 8, 26), P.dark);
      steer.add(rimT);
      [-1, 1].forEach(s => {
        const grip = new THREE.Mesh(U.roundedBox(0.07, 0.115, 0.07, 0.03, 3), P.rubber);
        grip.position.set(s * 0.185, 0.0, 0.0);
        steer.add(grip);
        // 辐条
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.022), P.metal);
        sp.position.set(s * 0.105, 0.0, 0.0);
        steer.add(sp);
      });
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 16), P.metal);
      hub.rotation.x = Math.PI / 2;
      steer.add(hub);
      // 转向柱
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.36, 10), P.metal);
      col.position.set(0, 0.55, -0.1);
      col.rotation.x = 1.12;
      g.add(col);

      // 引擎
      const engine = new THREE.Mesh(U.roundedBox(0.42, 0.26, 0.36, 0.05, 3), P.metal);
      engine.position.set(0, 0.44, 0.66);
      g.add(engine);
      const head = new THREE.Mesh(U.roundedBox(0.34, 0.13, 0.24, 0.035, 2), P.dark);
      head.position.set(0, 0.585, 0.64);
      g.add(head);
      // 散热片
      for (let i = 0; i < 5; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.012, 0.02), P.metal);
        fin.position.set(0, 0.53 + i * 0.016, 0.5 + i * 0.005);
        fin.rotation.x = 0.1;
        g.add(fin);
      }
      // 空滤
      const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 16), P.accent);
      filter.rotation.z = Math.PI / 2;
      filter.position.set(0.26, 0.5, 0.6);
      g.add(filter);
      // 排气管（弯管 + 消音器）
      [-1, 1].forEach(s => {
        const pipe = new THREE.Mesh(U.tube([
          [s * 0.12, 0.42, 0.5],
          [s * 0.2, 0.36, 0.62],
          [s * 0.26, 0.34, 0.8],
          [s * 0.27, 0.36, 0.94]
        ], 0.032, 14, 8), P.chrome);
        g.add(pipe);
        const muf = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.052, 0.24, 14), P.metal);
        muf.rotation.x = Math.PI / 2;
        muf.position.set(s * 0.27, 0.37, 1.0);
        g.add(muf);
        const tipRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), P.chrome);
        tipRing.position.set(s * 0.27, 0.37, 1.12);
        g.add(tipRing);
        const anchor = new THREE.Object3D();
        anchor.position.set(s * 0.27, 0.37, 1.16);
        g.add(anchor);
        exhausts.push(anchor);
      });
      // 尾翼
      const rw = new THREE.Mesh(U.roundedBox(0.92, 0.05, 0.3, 0.022, 2), P.body);
      rw.position.set(0, 0.95, 0.86);
      rw.rotation.x = -0.13;
      g.add(rw);
      [-1, 1].forEach(s => {
        const ep = new THREE.Mesh(U.roundedBox(0.035, 0.18, 0.32, 0.015, 2), P.accent);
        ep.position.set(s * 0.46, 0.95, 0.86);
        ep.rotation.x = -0.13;
        g.add(ep);
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.32, 0.12), P.dark);
        strut.position.set(s * 0.3, 0.79, 0.86);
        strut.rotation.x = -0.08;
        g.add(strut);
      });
      // 尾翼 Gurney 小翼
      const gurney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.012), P.dark);
      gurney.position.set(0, 1.0, 0.98);
      gurney.rotation.x = -0.13;
      g.add(gurney);
      // 后视镜
      [-1, 1].forEach(s => {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), P.metal);
        stalk.position.set(s * 0.29, 0.62, -0.4);
        stalk.rotation.z = s * 0.45;
        g.add(stalk);
        const mir = new THREE.Mesh(U.roundedBox(0.12, 0.07, 0.035, 0.025, 2), P.body);
        mir.position.set(s * 0.35, 0.68, -0.4);
        mir.rotation.y = s * 0.3;
        g.add(mir);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.055), P.metal);
        glass.position.set(s * 0.35, 0.68, -0.42);
        glass.rotation.y = s * 0.3;
        g.add(glass);
      });

      // 悬挂：A 臂 + 拉杆
      const susMat = P.dark;
      [-1, 1].forEach(s => {
        // 前 A 臂
        const a1 = U.link(new THREE.Vector3(s * 0.2, 0.24, -0.5), new THREE.Vector3(s * 0.6, 0.3, -0.62), 0.022, 7);
        g.add(new THREE.Mesh(a1, susMat));
        const a2 = U.link(new THREE.Vector3(s * 0.2, 0.36, -0.42), new THREE.Vector3(s * 0.6, 0.3, -0.62), 0.022, 7);
        g.add(new THREE.Mesh(a2, susMat));
        // 转向拉杆
        const t1 = U.link(new THREE.Vector3(s * 0.26, 0.36, -0.36), new THREE.Vector3(s * 0.62, 0.34, -0.6), 0.012, 6);
        g.add(new THREE.Mesh(t1, P.metal));
        // 后拖曳臂
        const b1 = U.link(new THREE.Vector3(s * 0.2, 0.26, 0.5), new THREE.Vector3(s * 0.66, 0.33, 0.68), 0.026, 7);
        g.add(new THREE.Mesh(b1, susMat));
        const b2 = U.link(new THREE.Vector3(s * 0.2, 0.4, 0.46), new THREE.Vector3(s * 0.66, 0.33, 0.68), 0.022, 7);
        g.add(new THREE.Mesh(b2, susMat));
        // 减震器
        const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.26, 8), P.metal);
        shock.position.set(s * 0.42, 0.5, 0.62);
        shock.rotation.z = s * 0.28;
        shock.rotation.x = -0.2;
        g.add(shock);
        const spring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12), P.brake);
        spring.position.set(s * 0.43, 0.48, 0.6);
        spring.rotation.x = Math.PI / 2;
        g.add(spring);
      });

      // 油箱 / 油箱盖（放在侧箱上沿，不压进车手身体）
      const tank = new THREE.Mesh(U.roundedBox(0.18, 0.14, 0.24, 0.04, 2), P.body);
      tank.position.set(-0.43, 0.5, 0.3);
      g.add(tank);
      const capFill = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), P.chrome);
      capFill.position.set(-0.43, 0.58, 0.3);
      g.add(capFill);

      // 拖车钩
      const tow = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12), P.metal);
      tow.position.set(0, 0.24, -1.12);
      tow.rotation.x = Math.PI / 2;
      g.add(tow);

      wheels.fl = wheel(accent, 0.3, 0.22, false, true); wheels.fl.position.set(0.63, 0.3, -0.66);
      wheels.fr = wheel(accent, 0.3, 0.22, false, true); wheels.fr.position.set(-0.63, 0.3, -0.66);
      wheels.rl = wheel(accent, 0.34, 0.27, false, false); wheels.rl.position.set(0.66, 0.34, 0.7);
      wheels.rr = wheel(accent, 0.34, 0.27, false, false); wheels.rr.position.set(-0.66, 0.34, 0.7);
      g.add(wheels.fl, wheels.fr, wheels.rl, wheels.rr);
      driverAnchor = new THREE.Vector3(0, 0.22, 0.18);
    }

    const anchor = new THREE.Group();
    anchor.position.copy(driverAnchor);
    g.add(anchor);

    // 合批：每个轮子单独合批，车身跳过轮子再合批
    ['fl', 'fr', 'rl', 'rr'].forEach(k => {
      const w = wheels[k];
      if (!w) return;
      w.userData.dynamic = true;
      U.bakeStatic(w);
    });
    U.bakeStatic(g);

    return { group: g, wheels, driverAnchor: anchor, exhausts, type };
  };

  /* ================= 物理 ================= */
  class Kart {
    constructor(opts) {
      const C = SK.Character.get(opts.charId);
      this.charId = opts.charId;
      this.charData = C;
      this.name = C.name;
      this.isPlayer = !!opts.isPlayer;
      this.index = opts.index || 0;
      this.track = opts.track;
      this.scene = opts.scene;

      const st = C.stats;
      // 舒缓节奏：极速压低，仪表上限锁在 235 km/h（见 U.SPEED_MAX）
      this.maxSpeed = 28.6 + st.speed * 1.52;
      this.accel = 10.4 + st.accel * 2.8;
      this.turnRate = 1.95 + st.handling * 0.17;
      this.weight = st.weight;
      this.handling = st.handling;
      this.aiSpeedBonus = 0;

      this.pos = new THREE.Vector3();
      this.forward = new THREE.Vector3(0, 0, -1);
      this.up = new THREE.Vector3(0, 1, 0);
      this.speed = 0;
      this.vy = 0;
      this.steer = 0;
      this.steerVisual = 0;
      this.drift = { active: false, dir: 0, charge: 0, level: 0, hop: 0 };
      this.boostTime = 0;
      this.boostFactor = 1.32;
      this.coins = 0;
      this.lap = 0;
      this.lapDist = 0;
      this.totalDist = 0;
      this.lastS = 0;
      this.hint = -1;
      this.onGround = true;
      this.airborne = 0;
      this.glider = 0;
      this.trick = 0;
      this.trickDone = false;
      this.spinTimer = 0;
      this.starTimer = 0;
      this.shrinkTimer = 0;
      this.invuln = 0;
      this.hitCooldown = 0;
      this.item = null;
      this.itemRoulette = 0;
      this.finished = false;
      this.finishTime = 0;
      this.lapTimes = [];
      this.lapStart = 0;
      this.position = 1;
      this.wrongWay = 0;
      this.offroadTimer = 0;
      this.noProgTimer = 0;
      this.engineTime = Math.random() * 10;
      this.bobTime = Math.random() * 10;

      // 视觉
      const built = Model.build(C.kart, C.color, C.accent, { number: (opts.index || 0) + 1 });
      this.kartGroup = new THREE.Group();
      this.tiltGroup = new THREE.Group();
      this.kartGroup.add(this.tiltGroup);
      built.group.scale.setScalar(1.12);
      this.tiltGroup.add(built.group);
      this.wheels = built.wheels;
      this.exhausts = built.exhausts;
      this.modelGroup = built.group;

      // 车手
      const driver = SK.Character.build(this.charId);
      driver.scale.setScalar(driver.scale.x * 0.72);
      driver.position.y = 0.02;
      if (built.type === 'bike') driver.rotation.x = -0.3;
      U.bakeStatic(driver);
      built.driverAnchor.add(driver);
      this.driver = driver;

      // 阴影
      const shadowTexC = U.canvas(128, 128);
      const sx = shadowTexC.getContext('2d');
      const grd = sx.createRadialGradient(64, 64, 6, 64, 64, 62);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.28)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      sx.fillStyle = grd; sx.fillRect(0, 0, 128, 128);
      this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.2),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(shadowTexC), transparent: true,
          depthWrite: false, opacity: 0.5
        }));
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.renderOrder = 1;

      // 加速尾焰
      this.flames = [];
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0x66ccff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      for (let i = 0; i < this.exhausts.length; i++) {
        const ex = this.exhausts[i];
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 8), flameMat.clone());
        f.rotation.x = Math.PI / 2;
        f.position.set(0, 0, 0.42);
        f.visible = false;
        ex.add(f);
        this.flames.push(f);
      }
      // 滑翔翼
      this.gliderMesh = new THREE.Group();
      const gliderMat = new THREE.MeshLambertMaterial({ color: 0xff8b3d, side: THREE.DoubleSide, flatShading: true });
      const gwing = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3, 5, 2), gliderMat);
      const pos = gwing.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, -Math.abs(x) * 0.22 + Math.abs(x) * 0.05);
      }
      gwing.geometry.computeVertexNormals();
      gwing.rotation.x = -0.25;
      this.gliderMesh.add(gwing);
      const gpole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0xbfcada }));
      gpole.position.set(0, -0.4, 0.3);
      gpole.rotation.x = 0.4;
      this.gliderMesh.add(gpole);
      this.gliderMesh.position.set(0, 1.5, 0.3);
      this.gliderMesh.visible = false;
      this.tiltGroup.add(this.gliderMesh);

      this.scene.add(this.kartGroup);
      this.scene.add(this.shadow);

      // 实时阴影
      this.kartGroup.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
    }

    /* ------------- 联机名字牌 ------------- */
    setNameTag(text, colorCss) {
      if (!text) return;
      const key = text + '|' + (colorCss || '#ffffff');
      const cache = (Kart._tagCache || (Kart._tagCache = {}));
      let tex = cache[key];
      if (!tex) {
        const cvs = document.createElement('canvas');
        cvs.width = 256; cvs.height = 72;
        const c = cvs.getContext('2d');
        const w = 232, h = 54, x = 12, y = 9, r = 27;
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
        c.fillStyle = 'rgba(8,12,24,0.6)';
        c.fill();
        c.lineWidth = 3;
        c.strokeStyle = colorCss || 'rgba(255,255,255,0.85)';
        c.stroke();
        c.font = 'bold 33px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#ffffff';
        c.fillText(text, 128, 38);
        tex = new THREE.CanvasTexture(cvs);
        tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = 4;
        cache[key] = tex;
      }
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(3.0, 0.84, 1);
      sp.position.set(0, 3.55, 0);
      sp.renderOrder = 12;
      this.kartGroup.add(sp);
      this.nameTag = sp;
    }

    /* ------------- 复位到赛道 ------------- */
    reset(s, lateral, keepLap) {
      const f = this.track.sampleAt(s);
      const crown = this.track.crownAt ? this.track.crownAt(lateral || 0, f.width * 0.5) : 0;
      this.pos.copy(f.p).addScaledVector(f.side, lateral || 0).addScaledVector(f.n, 0.02 + crown);
      this.forward.copy(f.t);
      this.up.copy(f.n);
      this.speed = 0;
      this.vy = 0;
      this.onGround = true;
      this.glider = 0;
      this.drift.active = false;
      this.drift.charge = 0;
      this.drift.level = 0;
      this.boostTime = 0;
      this.spinTimer = 0;
      this.offroadTimer = 0;
      this.noProgTimer = 0;
      this.hint = f.i0;
      if (!keepLap) { this.lap = 0; this.totalDist = 0; this.lastS = s; }
      this.syncVisual(0, 0);
    }

    /* ------------- 主更新 ------------- */
    update(dt, input, race) {
      if (this.rescueActive) return;
      const track = this.track;
      this.engineTime += dt;
      this.bobTime += dt;
      if (this.hitCooldown > 0) this.hitCooldown -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.spinTimer > 0) this.spinTimer -= dt;
      if (this.starTimer > 0) this.starTimer -= dt;
      if (this.shrinkTimer > 0) this.shrinkTimer -= dt;
      if (this.boostTime > 0) this.boostTime -= dt;

      const stunned = this.spinTimer > 0;
      const star = this.starTimer > 0;
      let accelInput = stunned ? 0 : input.accel;
      let brakeInput = stunned ? 0 : input.brake;
      let steerInput = stunned ? 0 : input.steer;
      const driftDown = !stunned && input.drift;

      // 起步加速（火箭起步由 race 控制 boost）
      const info = track.project(this.pos, this.hint);
      this.hint = info.index;
      // 全局硬性横向约束：任何状态下都不允许离开赛道过远
      const latAbs = Math.abs(info.lateral);
      if (latAbs > info.halfWidth + 5.5) {
        const sg = U.sign(info.lateral);
        this.pos.addScaledVector(info.side, -sg * (latAbs - (info.halfWidth + 5.5)));
        if (this.onGround) this.speed = Math.min(this.speed, this.maxSpeed * 0.7);
      }

      /* ---- 跳跃 / 空中 ---- */
      if (!this.onGround) {
        this.airborne += dt;
        // 滑翔
        if (this.glider > 0 && this.vy < 0) {
          this.vy *= 0.92;
          this.speed += (this.maxSpeed * 1.02 - this.speed) * dt * 0.9;
        } else if (this.glider > 0) {
          this.vy -= 2.0 * dt;
        } else {
          this.vy -= 22 * dt;
        }
        // 空中转向
        if (!stunned) {
          const airTurn = steerInput * this.turnRate * 0.55 * dt;
          if (Math.abs(airTurn) > 1e-5) {
            const q = new THREE.Quaternion().setFromAxisAngle(this.up, -airTurn * 0.5);
            this.forward.applyQuaternion(q).normalize();
          }
          // 特技
          if (driftDown && !this.trickDone) {
            this.trick = 0.0001;
            this.trickDone = true;
            if (race && race.onTrick) race.onTrick(this);
          }
          if (this.trick > 0) this.trick += dt * 6.2;
        }
        this.pos.addScaledVector(this.forward, this.speed * dt);
        this.pos.y += this.vy * dt;
        // 落地检测
        const info2 = track.project(this.pos, this.hint);
        this.hint = info2.index;
        if (info2.gap <= 0.18 && this.vy <= 0.5) {
          // 落地
          this.pos.addScaledVector(info2.normal, -(info2.gap));
          this.up.copy(info2.normal);
          this.onGround = true;
          this.airborne = 0;
          this.vy = 0;
          if (this.glider > 0) {
            this.glider = 0;
            this.gliderMesh.visible = false;
            this.boostTime = Math.max(this.boostTime, 0.6);
          }
          if (this.trickDone) {
            this.boostTime = Math.max(this.boostTime, 0.55);
            this.trickDone = false;
            this.trick = 0;
            if (race && race.onLand) race.onLand(this);
          }
        } else if (this.vy < -55 || info2.gap < -8 || this.airborne > 5.0) {
          // 掉落 / 滞空过久 → 复位
          if (race && race.onFall) race.onFall(this);
        }
      } else {
        /* ---- 地面行驶 ---- */
        // 贴地
        if (Math.abs(info.gap) > 0.001) {
          this.pos.addScaledVector(info.normal, -info.gap);
        }
        this.up.lerp(info.normal, 1 - Math.exp(-18 * dt)).normalize();
        // 记录最近一次“稳稳在赛道上”的位置，供卡死兜底复位使用
        if (Math.abs(info.lateral) < info.halfWidth - 1.2 && Math.abs(this.speed) > 5) {
          this.lastGoodS = info.s;
        }
        // forward 投影到平面
        this.forward.addScaledVector(this.up, -this.forward.dot(this.up));
        if (this.forward.lengthSq() < 1e-6) this.forward.copy(info.tangent);
        this.forward.normalize();

        // 离开地面（跳台/下坡）
        if (info.gap > 0.55 && this.speed > 6) {          this.onGround = false;
          this.airborne = 0;
          this.vy = Math.min(20, Math.max(2, this.speed * 0.22));
          const ramp = track.ramps.find(r => {
            const ds = U.mod(info.s - r.s0, track.length);
            return ds > -2 && ds < r.len + 1;
          });
          if (ramp) {
            const ang = Math.atan2(ramp.height, ramp.len);
            this.vy = this.speed * Math.sin(ang) * 1.05 + 1.2;
            if (ramp.glide) { this.glider = 1; this.gliderMesh.visible = true; }
          }
        }

        /* ---- 漂移状态机 ---- */
        const d = this.drift;
        if (driftDown && !d.active && this.speed > 8 && Math.abs(steerInput) > 0.2) {
          d.active = true;
          d.dir = U.sign(steerInput);
          d.charge = 0;
          d.level = 0;
          d.hop = 0.28;
          if (race && race.onDriftStart) race.onDriftStart(this);
        } else if (!driftDown && d.active) {
          // 释放 → 迷你涡轮
          d.active = false;
          const lv = d.level;
          const dur = [0, 0.55, 1.0, 1.65][lv];
          if (dur > 0) {
            this.boostTime = Math.max(this.boostTime, dur);
            this.boostFactor = 1.22 + lv * 0.055;
            if (race && race.onMiniTurbo) race.onMiniTurbo(this, lv);
          }
          d.charge = 0;
          d.level = 0;
          d.hop = 0;
        }
        if (d.active) {
          if (!driftDown || Math.abs(steerInput) < 0.05) {
            // 保持漂移
          }
          if (d.hop > 0) d.hop = Math.max(0, d.hop - dt * 2.4);
          d.charge += dt * (0.6 + Math.abs(steerInput) * 0.7) * (this.coins > 5 ? 1.1 : 1);
          if (d.charge > 3.1) d.level = 3;
          else if (d.charge > 1.9) d.level = 2;
          else if (d.charge > 0.9) d.level = 1;
          else d.level = 0;
        }

        /* ---- 转向 ---- */
        let turn = steerInput;
        if (d.active) {
          // 漂移中：方向被锁定，但允许内外侧微调
          const align = U.clamp(steerInput * d.dir, -1, 1);
          turn = d.dir * (0.5 + align * 0.28);
        }
        const speedNorm = U.clamp01(Math.abs(this.speed) / this.maxSpeed);
        const turnMul = (1 - speedNorm * 0.26) * (d.active ? 1.42 : 1);
        const ang = turn * this.turnRate * turnMul * dt * (this.speed >= 0 ? 1 : -1);
        if (Math.abs(ang) > 1e-6) {
          const q = new THREE.Quaternion().setFromAxisAngle(this.up, -ang);
          this.forward.applyQuaternion(q).normalize();
        }

        /* ---- 速度 ---- */
        let maxSpeed = this.maxSpeed * (1 + this.coins * 0.011) * (1 + (this.aiSpeedBonus || 0));
        if (this.shrinkTimer > 0) maxSpeed *= 0.82;
        let surfaceMul = 1;
        const offroad = Math.abs(info.lateral) > info.halfWidth + 1.25;
        if (offroad) {
          surfaceMul = 0.52;
          this.offroadTimer += dt;
        } else {
          this.offroadTimer = Math.max(0, this.offroadTimer - dt * 2);
        }
        if (d.active) surfaceMul *= 0.985;
        if (this.starTimer > 0) maxSpeed *= 1.12;
        let target = maxSpeed * surfaceMul;
        if (this.boostTime > 0) target = maxSpeed * surfaceMul * this.boostFactor;
        // 任何加速都不能突破全局极速
        if (target > U.SPEED_MAX) target = U.SPEED_MAX;
        if (brakeInput > 0.1) {
          // 支持部分刹车（AI 会按弯道深浅给 0~1 的刹车量）
          this.speed = U.approach(this.speed, -8, 46 * dt * (0.4 + 0.6 * U.clamp01(brakeInput)));
        } else if (accelInput > 0.05) {
          const a = this.accel * (this.boostTime > 0 ? 2.2 : 1) * (offroad ? 0.55 : 1);
          if (this.speed < target) this.speed = Math.min(target, this.speed + a * dt);
          else this.speed = U.approach(this.speed, target, 12 * dt);
        } else {
          this.speed = U.approach(this.speed, 0, (offroad ? 26 : 8) * dt);
          if (this.speed > target) this.speed = U.approach(this.speed, target, 20 * dt);
        }
        if (offroad && this.speed > target) this.speed = U.approach(this.speed, target, 34 * dt);
        if (this.speed > U.SPEED_MAX) this.speed = U.SPEED_MAX;

        /* ---- 位移 ---- */
        this.pos.addScaledVector(this.forward, this.speed * dt);

        /* ---- 护栏碰撞 ---- */
        const info3 = track.project(this.pos, this.hint);
        this.hint = info3.index;
        // 车身最宽处（后轮外沿）约 0.9m，留出余量让轮子不要插进护栏
        const limit = info3.halfWidth + 0.55;
        if (Math.abs(info3.lateral) > limit && track.wallAt(info3.index)) {
          const over = Math.abs(info3.lateral) - limit;
          const dirSign = U.sign(info3.lateral);
          this.pos.addScaledVector(info3.side, -dirSign * (over + 0.02));
          // 反弹
          const vn = this.forward.dot(info3.side) * dirSign;
          if (vn > 0.02) {
            const q = new THREE.Quaternion().setFromAxisAngle(this.up, dirSign * Math.min(1.2, vn * 1.6));
            this.forward.applyQuaternion(q).normalize();
            this.speed *= (1 - Math.min(0.22, vn * 0.3));
            this.speed = Math.min(this.speed, this.maxSpeed * 0.88);
            if (race && race.onWallHit && vn > 0.35) race.onWallHit(this, vn);
          }
          if (!this.onGround) this.onGround = true;
          // 轻微向赛道内推，避免长时间贴墙磨擦
          this.pos.addScaledVector(info3.side, -dirSign * Math.min(0.12, dt * 2.2));
        }
        // 无护栏区域的软边界：防止冲出世界
        const outerLimit = info3.halfWidth + 9.0;
        if (Math.abs(info3.lateral) > outerLimit) {
          const ov = Math.abs(info3.lateral) - outerLimit;
          const sg = U.sign(info3.lateral);
          this.pos.addScaledVector(info3.side, -sg * (ov + 0.02));
          this.speed *= 0.88;
        }
        // 路旁大型装饰（树 / 岩石 / 石柱）圆形碰撞，避免直接穿过去
        const cols = track.colliders;
        if (cols && cols.length) {
          for (let ci = 0; ci < cols.length; ci++) {
            const c = cols[ci];
            if (Math.abs(c.y - this.pos.y) > 8) continue;
            const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
            if (dx > c.r + 1.5 || dx < -c.r - 1.5 || dz > c.r + 1.5 || dz < -c.r - 1.5) continue;
            const rr = c.r + 0.85;
            const d2 = dx * dx + dz * dz;
            if (d2 < rr * rr && d2 > 1e-5) {
              const d = Math.sqrt(d2);
              const push = rr - d;
              this.pos.x += dx / d * push;
              this.pos.z += dz / d * push;
              this.speed *= 0.985;
            }
          }
        }
        // 长时间低速越野 → 请求救援
        if (this.offroadTimer > 3.5) {
          this.offroadTimer = 0;
          if (race && race.onFall) race.onFall(this);
          return;
        }
        // 兜底：无论在哪，长时间完全没有速度就请求救援，
        // 避免被挤在护栏 / 车堆 / 缺口里永远出不来（穿模与卡死的根源之一）
        if (race && race.state === 'racing' && !this.finished) {
          if (Math.abs(this.speed) < 2.2) this.noProgTimer = (this.noProgTimer || 0) + dt;
          else this.noProgTimer = 0;
          if (this.noProgTimer > (this.isPlayer ? 6.0 : 3.0)) {
            this.noProgTimer = 0;
            if (race.onFall) race.onFall(this);
            return;
          }
        }
        if (this.offroadTimer > 0.3 && Math.abs(this.speed) < 6) {
          this.stuckTimer = (this.stuckTimer || 0) + dt;
          if (this.stuckTimer > 2.0) {
            this.stuckTimer = 0;
            if (race && race.onFall) race.onFall(this);
          }
        } else {
          this.stuckTimer = 0;
        }

        /* ---- 加速板 ---- */
        for (let i = 0; i < track.boostPads.length; i++) {
          const pad = track.boostPads[i];
          const ds = U.mod(info3.s - pad.s, track.length);
          if (ds < pad.len && Math.abs(info3.lateral - pad.lat) < pad.width * 0.55) {
            if (this.boostTime < 0.9) {
              this.boostTime = 1.05;
              this.boostFactor = 1.34;
              if (race && race.onBoostPad) race.onBoostPad(this);
            }
          }
        }
      }

      /* ---- 排序数据 ---- */
      const prevS = this.lastS;
      const s = track.project(this.pos, this.hint).s;
      let delta = s - prevS;
      if (delta > track.length * 0.5) delta -= track.length;
      if (delta < -track.length * 0.5) delta += track.length;
      // 防止传送/投影跳变污染里程
      const maxStep = Math.abs(this.speed) * dt * 3 + 2.5;
      delta = U.clamp(delta, -maxStep, maxStep);
      this.totalDist += delta;
      this.lastS = s;

      /* ---- 视觉同步 ---- */
      this.syncVisual(dt, steerInput);
    }

    syncVisual(dt, steerInput) {
      const d = this.drift;
      // 位置/朝向
      this.kartGroup.position.copy(this.pos);
      if (!this.onGround) {
        // 空中：保持当前 up，但慢慢回正
        this.up.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-0.5 * dt)).normalize();
      }
      const q = U.quatFromBasis(this.forward, this.up);
      this.kartGroup.quaternion.copy(q);

      // 车身姿态
      const speedNorm = U.clamp01(Math.abs(this.speed) / this.maxSpeed);
      this.steerVisual = U.damp(this.steerVisual, steerInput || 0, 12, dt || 0.016);
      const rollTarget = -this.steerVisual * 0.09 * (d.active ? 1.8 : 1) - (d.active ? d.dir * 0.14 : 0);
      this.tiltGroup.rotation.z = U.damp(this.tiltGroup.rotation.z, rollTarget, 9, dt || 0.016);
      let pitchTarget = 0;
      if (this.boostTime > 0) pitchTarget = -0.06;
      if (this.speed < -0.1) pitchTarget = 0.04;
      this.tiltGroup.rotation.x = U.damp(this.tiltGroup.rotation.x, pitchTarget, 6, dt || 0.016);
      // 漂移视觉偏航
      let yawOffset = 0;
      if (d.active) yawOffset = -d.dir * (0.22 + Math.min(1, d.charge / 3) * 0.16);
      this.tiltGroup.rotation.y = U.damp(this.tiltGroup.rotation.y, yawOffset, 10, dt || 0.016);

      // 漂移小跳
      let hopY = d.hop * 0.9;
      // 悬浮 / 上下颠簸
      if (this.driver && this.driver.userData.hover) {
        this.driver.position.y = 0.02 + Math.sin(this.bobTime * 3.4) * 0.09;
        this.driver.rotation.z = Math.sin(this.bobTime * 2.1) * 0.06;
      } else if (this.driver) {
        this.driver.position.y = 0.02 + Math.abs(Math.sin(this.bobTime * 8)) * 0.012 * speedNorm;
      }
      // 空中特技旋转
      if (this.trick > 0) {
        this.tiltGroup.rotation.x = -this.trick;
      }
      const scale = this.shrinkTimer > 0 ? 0.62 : 1;
      this.tiltGroup.scale.setScalar(U.damp(this.tiltGroup.scale.x, scale, 10, dt || 0.016));
      this.tiltGroup.position.y = hopY;

      // 车轮（救援悬挂时空转）
      const spin = (this.rescueActive ? 13 : this.speed / 0.42) * (dt || 0.016);
      const wheels = this.wheels;
      const all = [wheels.fl, wheels.fr, wheels.rl, wheels.rr];
      for (let i = 0; i < all.length; i++) {
        const w = all[i];
        if (!w) continue;
        w.rotation.x -= spin;
        if (i < 2) w.rotation.y = U.damp(w.rotation.y, -(steerInput || 0) * 0.42, 10, dt || 0.016);
      }

      // 尾焰
      const boosting = this.boostTime > 0 || this.starTimer > 0;
      for (let i = 0; i < this.flames.length; i++) {
        const f = this.flames[i];
        f.visible = boosting;
        if (boosting) {
          const s = 0.7 + Math.random() * 0.6;
          f.scale.set(s, s * (1.1 + Math.random() * 0.5), s);
          if (this.starTimer > 0) f.material.color.setHex(0xffe066);
          else if (this.boostTime > 0.7) f.material.color.setHex(0x66ccff);
          else f.material.color.setHex(0xffa64d);
          f.material.opacity = 0.6 + Math.random() * 0.4;
        }
      }

      // 星星闪烁
      if (this.starTimer > 0) {
        const t = this.starTimer * 12;
        const c = new THREE.Color().setHSL((Math.sin(t) * 0.5 + 0.5) * 0.2 + 0.1, 1, 0.62);
        this.modelGroup.rotation.y = Math.sin(t * 2) * 0.02;
        this.tiltGroup.scale.multiplyScalar(1);
      }

      // 阴影
      const p = this.track.project(this.pos, this.hint);
      this.shadow.position.copy(this.pos).addScaledVector(p.normal, -(p.gap) + 0.06);
      this.shadow.quaternion.copy(U.quatFromBasis(p.tangent, p.normal));
      this.shadow.rotateX(-Math.PI / 2);
      const h = Math.max(0, p.gap);
      const sc = 1 + h * 0.06;
      this.shadow.scale.set(sc, sc, 1);
      this.shadow.material.opacity = U.clamp(0.85 - h * 0.06, 0.12, 0.85);
    }

    /* ------------- 道具 / 状态 ------------- */
    applyBoost(dur, factor) {
      this.boostTime = Math.max(this.boostTime, dur);
      this.boostFactor = Math.max(this.boostFactor, factor || 1.5);
    }
    spinOut(dur) {
      if (this.starTimer > 0 || this.invuln > 0) return false;
      this.spinTimer = Math.max(this.spinTimer, dur || 1.1);
      this.speed *= 0.25;
      this.drift.active = false;
      this.drift.charge = 0;
      this.drift.level = 0;
      return true;
    }
    squish(dur) {
      if (this.starTimer > 0 || this.invuln > 0) return false;
      this.shrinkTimer = Math.max(this.shrinkTimer, dur || 3.0);
      this.speed *= 0.7;
      return true;
    }
    startStar(dur) {
      this.starTimer = Math.max(this.starTimer, dur || 7);
    }
    addCoin() {
      if (this.coins < 10) this.coins++;
      return this.coins;
    }
    loseCoins(n) {
      this.coins = Math.max(0, this.coins - (n || 2));
    }
  }

  SK.Kart = Kart;
  SK.KartModel = Model;
})();
