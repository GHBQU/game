/* ============================================================
   Super Kart 8 — rescue.js
   冲出赛道救援演出（致敬原作的“钓鱼佬”）
   ------------------------------------------------------------
   7 段式长镜头，玩家时长 7.2s：
     ① 云降落   0.00 → 1.25
     ② 放钓线   1.25 → 2.35
     ③ 挂钩     2.35 → 2.80
     ④ 吊起     2.80 → 4.20
     ⑤ 空中转移 4.20 → 5.70
     ⑥ 下降     5.70 → 6.50
     ⑦ 收钩离场 6.50 → 7.20
   钓线接到车尾上方的牵引点，不再从车手头顶穿过；
   悬挂时车身像钟摆一样摆动，车轮空转。
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;

  const TAU = Math.PI * 2;
  const DESIGN = 7.2;      // 设计时长（实际 dur 会等比缩放整条时间轴）
  const HANG = 4.4;        // 云到车尾牵引点的距离
  const LIFT = 18.0;       // 转移时云相对路面的高度（车在云下 4.4m，能越过路旁树冠）
  const TOW_UP = 1.02;     // 牵引点在车体局部的高度
  const TOW_BACK = 0.92;   // 牵引点在车体局部的后移量

  /* ---------------- 救援云 + 钓鱼佬 ---------------- */
  function buildCloud() {
    const g = new THREE.Group();
    const puffGeo = new THREE.SphereGeometry(1, 14, 10);
    const mat = new THREE.MeshLambertMaterial({ color: 0xfffdf6, emissive: 0x8fb8e0, emissiveIntensity: 0.22 });
    const shade = new THREE.MeshLambertMaterial({ color: 0xdfeaf9, emissive: 0x6f9ac8, emissiveIntensity: 0.18 });
    const puff = (x, y, z, r, dark) => {
      const m = new THREE.Mesh(puffGeo, dark ? shade : mat);
      m.position.set(x, y, z);
      m.scale.set(r, r * 0.82, r * 0.94);
      g.add(m);
    };
    puff(-2.2, -0.15, 0.2, 1.45);
    puff(2.2, -0.2, -0.15, 1.4);
    puff(0, 0.18, 0, 1.95);
    puff(-1.05, -0.4, -1.15, 1.1, true);
    puff(1.1, -0.45, 1.05, 1.05, true);
    puff(0, 0.02, -1.35, 1.2);
    puff(-0.9, 0.1, 1.3, 1.0);
    puff(0.85, 0.05, -1.5, 0.85, true);

    /* ---- 钓鱼佬 ---- */
    const skin = new THREE.MeshLambertMaterial({ color: 0xf7d6b5 });
    const cap = new THREE.MeshLambertMaterial({ color: 0xe63946 });
    const cloth = new THREE.MeshLambertMaterial({ color: 0x2f6fd0 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f3d });
    const white = new THREE.MeshLambertMaterial({ color: 0xfbfcff });

    const bodyGeo = THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.38, 0.44, 4, 10)
      : new THREE.CylinderGeometry(0.38, 0.42, 0.86, 12);
    const body = new THREE.Mesh(bodyGeo, cloth);
    body.position.set(0, 1.18, 0);
    g.add(body);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 6, 18), dark);
    belt.rotation.x = Math.PI / 2;
    belt.position.set(0, 1.02, 0);
    g.add(belt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), skin);
    head.position.set(0, 1.98, 0);
    g.add(head);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 9, 0, TAU, 0, Math.PI * 0.55), cap);
    capTop.position.set(0, 2.02, 0);
    g.add(capTop);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.08, 16, 1, false, -1.0, 2.0), cap);
    brim.position.set(0, 1.96, -0.32);
    g.add(brim);
    [-0.16, 0.16].forEach(x => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), white);
      e.position.set(x, 2.0, -0.4);
      g.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), dark);
      p.position.set(x, 2.0, -0.47);
      g.add(p);
    });
    [-1, 1].forEach(s => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), dark);
      m.scale.set(1, 0.4, 0.5);
      m.position.set(s * 0.17, 1.84, -0.4);
      g.add(m);
    });
    [-1, 1].forEach(sg => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.92, 8), skin);
      arm.position.set(sg * 0.46, 1.2, -0.2);
      arm.rotation.set(-0.95, 0, sg * 0.3);
      g.add(arm);
    });

    /* ---- 钓竿（随阶段摆动） ---- */
    const rodPivot = new THREE.Group();
    rodPivot.position.set(0, 1.3, -0.25);
    g.add(rodPivot);
    const rodMat = new THREE.MeshLambertMaterial({ color: 0x9a7434 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 4.2, 6), rodMat);
    rod.position.set(0, 1.3, -1.9);
    rod.rotation.x = -0.92;
    rodPivot.add(rod);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), dark);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0, 0.5, -0.32);
    rodPivot.add(reel);
    g.userData.rodPivot = rodPivot;

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    lamp.position.set(0, 2.62, 0.12);
    g.add(lamp);
    g.userData.lamp = lamp;

    const light = new THREE.PointLight(0xffe8a0, 1.15, 30, 2);
    light.position.set(0, 2.35, 0);
    g.add(light);
    g.userData.light = light;

    /* ---- 探照光锥（顶端亮、底端淡出，长度正好到车顶） ---- */
    const beamLen = HANG - 0.3;
    const beamGeo = new THREE.ConeGeometry(1.35, beamLen, 18, 1, true);
    beamGeo.translate(0, -beamLen * 0.5 - 0.85, 0);
    {
      const p = beamGeo.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const t = U.clamp01((-p.getY(i) - 0.85) / beamLen);   // 0 顶端 → 1 底端
        const v = 1 - t * t;
        col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v;
      }
      beamGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xfff3c4, transparent: true, opacity: 0.0, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    beam.renderOrder = 2;
    g.add(beam);
    g.userData.beam = beam;

    g.scale.setScalar(0.86);
    return g;
  }

  function buildLine() {
    const geo = new THREE.CylinderGeometry(0.045, 0.045, 1, 6);
    geo.translate(0, -0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a2e3a });
    const line = new THREE.Mesh(geo, mat);
    line.frustumCulled = false;
    return line;
  }

  function buildHook() {
    const g = new THREE.Group();
    const gold = new THREE.MeshBasicMaterial({ color: 0xffd60a });
    const light = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 14), gold);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), light);
    shaft.position.y = -0.25;
    g.add(shaft);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.5, 6), gold);
      prong.position.set(Math.cos(a) * 0.16, -0.62, Math.sin(a) * 0.16);
      prong.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      g.add(prong);
    }
    return g;
  }

  const _d = new THREE.Vector3();

  class RescueActor {
    constructor(scene) {
      this.scene = scene;
      this.group = new THREE.Group();
      this.group.visible = false;
      this.cloud = buildCloud();
      this.group.add(this.cloud);
      this.line = buildLine();
      this.group.add(this.line);
      this.hook = buildHook();
      this.group.add(this.hook);
      scene.add(this.group);
      this.busy = false;
    }

    /** cloudPos 云中心；anchor 车尾牵引点；showLine=false 时收线 */
    place(cloudPos, anchor, showLine, dt) {
      this.group.position.copy(cloudPos);
      const d = _d.subVectors(anchor, cloudPos);
      const len = Math.max(0.001, d.length());
      d.divideScalar(len);
      this.line.visible = showLine;
      this.hook.visible = showLine;
      this.line.quaternion.setFromUnitVectors(_down, d);
      this.line.scale.set(1, len, 1);
      this.hook.position.copy(d).multiplyScalar(len - 0.12);
      this.hook.quaternion.copy(this.line.quaternion);
      this.hook.rotateX(Math.PI);
      // 云跟着摆动轻微倾斜
      this.cloud.rotation.z = U.damp(this.cloud.rotation.z, U.clamp(-(anchor.x - cloudPos.x) * 0.05, -0.14, 0.14), 4, dt || 0.016);
      this.cloud.rotation.x = U.damp(this.cloud.rotation.x, U.clamp((anchor.z - cloudPos.z) * 0.05, -0.12, 0.12), 4, dt || 0.016);
    }

    /** 放线阶段：只显示云到线头的钓线 */
    placeLineOnly(cloudPos, endPos, dt) {
      this.group.position.copy(cloudPos);
      const d = _d.subVectors(endPos, cloudPos);
      const len = Math.max(0.001, d.length());
      d.divideScalar(len);
      this.line.visible = true;
      this.hook.visible = true;
      this.line.quaternion.setFromUnitVectors(_down, d);
      this.line.scale.set(1, len, 1);
      this.hook.position.copy(d).multiplyScalar(len);
      this.hook.quaternion.copy(this.line.quaternion);
      this.hook.rotateX(Math.PI);
    }

    setBeam(v) {
      const b = this.cloud.userData.beam;
      if (b) b.material.opacity = 0.12 * v;
    }

    setRod(angle) {
      const p = this.cloud.userData.rodPivot;
      if (p) p.rotation.x = angle;
    }

    show(v) { this.group.visible = v; }
  }

  const _down = new THREE.Vector3(0, -1, 0);
  const _up = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _side = new THREE.Vector3();
  const _cloud = new THREE.Vector3();
  const _kart = new THREE.Vector3();
  const _anchor = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  class RescueSystem {
    constructor(scene, particles) {
      this.scene = scene;
      this.particles = particles;
      this.actors = [];
      this.active = [];
    }

    _acquire() {
      for (let i = 0; i < this.actors.length; i++) {
        if (!this.actors[i].busy) { this.actors[i].busy = true; return this.actors[i]; }
      }
      const a = new RescueActor(this.scene);
      a.busy = true;
      this.actors.push(a);
      return a;
    }

    _release(actor) {
      actor.busy = false;
      actor.show(false);
      actor.setBeam(0);
      actor.line.visible = true;
      actor.hook.visible = true;
    }

    request(kart, track, opts) {
      if (kart.rescueActive) return null;
      opts = opts || {};
      const isPlayer = kart.isPlayer;
      const dur = opts.dur || (isPlayer ? DESIGN : 3.6);
      const f = track.sampleAt(kart.lastS);
      const crown = track.crownAt ? track.crownAt(0, f.width * 0.5) : 0;
      const target = f.p.clone().addScaledVector(f.n, 0.04 + crown);

      // 吊起时同时往赛道中心挪一点，避免垂直穿过路旁树冠
      const proj = track.project(kart.pos, kart.hint);
      const inward = U.clamp(-proj.lateral, -7, 7);
      const liftBase = kart.pos.clone().addScaledVector(proj.side, inward);

      const actor = this._acquire();
      actor.show(true);

      const r = {
        kart, track, actor, t: 0, dur, scale: dur / DESIGN,
        from: kart.pos.clone(),
        fromUp: kart.up.clone(),
        fromFwd: kart.forward.clone(),
        target,
        targetUp: f.n.clone(),
        targetFwd: f.t.clone(),
        targetS: f.s,
        targetIndex: f.i0,
        isPlayer,
        phaseName: '救援云正在赶来…',
        bob: Math.random() * 6,
        lineOnly: false,
        liftBase,
        liftTop: liftBase.clone().addScaledVector(kart.up, HANG + LIFT)
      };

      kart.rescueActive = true;
      kart.rescueData = r;
      kart.speed = 0;
      kart.vy = 0;
      kart.onGround = true;
      kart.drift.active = false;
      kart.drift.charge = 0;
      kart.drift.level = 0;
      kart.boostTime = 0;
      kart.trick = 0;
      kart.trickDone = false;
      kart.invuln = Math.max(kart.invuln, dur + 0.9);

      this.active.push(r);
      return r;
    }

    update(dt, game) {
      for (let i = this.active.length - 1; i >= 0; i--) {
        const r = this.active[i];
        r.t += dt;
        const T = r.t / r.scale;          // 设计时间轴（秒）
        const kart = r.kart;
        const fromUp = r.fromUp;
        const tgtUp = r.targetUp;

        const cloudPos = _cloud;
        const kartPos = _kart;
        const up = _up;
        const fwd = _fwd;
        let hanging = false;
        let beam = 0;
        let rod = 0;

        if (T < 1.25) {
          /* ① 云降落 */
          r.phaseName = '救援云正在赶来…';
          const u = U.easeOutCubic(T / 1.25);
          const hoverY = TOW_UP + HANG;
          cloudPos.copy(r.from).addScaledVector(fromUp, U.lerp(46, hoverY, u));
          const sway = Math.sin(u * Math.PI) * 1.4;
          _side.copy(fromUp).cross(r.fromFwd).normalize();
          cloudPos.addScaledVector(_side, sway);
          kartPos.copy(r.from);
          up.copy(fromUp);
          fwd.copy(r.fromFwd);
          beam = U.clamp01((T - 0.3) / 0.7);
          rod = -0.15;
        } else if (T < 2.35) {
          /* ② 放钓线 */
          r.phaseName = '放下钓线…';
          const u = U.clamp01((T - 1.25) / 1.1);
          cloudPos.copy(r.from).addScaledVector(fromUp, TOW_UP + HANG + Math.sin(T * 2.2 + r.bob) * 0.14);
          kartPos.copy(r.from);
          up.copy(fromUp);
          fwd.copy(r.fromFwd);
          const end = _a.copy(cloudPos).addScaledVector(_down, U.lerp(0.8, TOW_UP + HANG, U.easeInCubic(u)));
          r.actor.placeLineOnly(cloudPos, end, dt);
          r.lineOnly = true;
          beam = 1;
          rod = -0.45 - 0.2 * Math.sin(u * Math.PI);
        } else if (T < 2.8) {
          /* ③ 挂钩 */
          r.phaseName = '钩住卡丁车…';
          r.lineOnly = false;
          const u = (T - 2.35) / 0.45;
          cloudPos.copy(r.from).addScaledVector(fromUp, TOW_UP + HANG + Math.sin(T * 2.4 + r.bob) * 0.08);
          up.copy(fromUp);
          fwd.copy(r.fromFwd);
          hanging = true;
          beam = 1;
          rod = -0.55;
          // 刚钩住时车身被拽得一沉
          if (u < 1) cloudPos.addScaledVector(fromUp, Math.sin(u * Math.PI) * 0.18);
        } else if (T < 4.2) {
          /* ④ 吊起（同时往赛道中心方向平移，避开树冠） */
          r.phaseName = '正在吊起…';
          const u = U.easeOutCubic(U.clamp01((T - 2.8) / 1.4));
          const from = _a.copy(r.from).addScaledVector(fromUp, TOW_UP + HANG);
          const top = _b.copy(r.liftTop);
          cloudPos.copy(from).lerp(top, u);
          hanging = true;
          beam = 1 - u * 0.4;
          rod = -0.55 + u * 0.25;
        } else if (T < 5.7) {
          /* ⑤ 空中转移 */
          r.phaseName = '送回赛道…';
          const u = U.smootherstep(U.clamp01((T - 4.2) / 1.5));
          const a = _a.copy(r.liftTop);
          const b = _b.copy(r.target).addScaledVector(tgtUp, HANG + LIFT);
          const mid = _c.copy(a).add(b).multiplyScalar(0.5).addScaledVector(tgtUp, 5.0);
          cloudPos.copy(a).multiplyScalar((1 - u) * (1 - u))
            .addScaledVector(mid, 2 * (1 - u) * u)
            .addScaledVector(b, u * u);
          hanging = true;
          beam = 0.55;
          rod = -0.3 + u * 0.45;
        } else if (T < 6.5) {
          /* ⑥ 下降 */
          r.phaseName = '放回赛道…';
          const u = U.smootherstep(U.clamp01((T - 5.7) / 0.8));
          const top = _a.copy(r.target).addScaledVector(tgtUp, HANG + LIFT);
          const end = _b.copy(r.target).addScaledVector(tgtUp, TOW_UP + HANG);
          cloudPos.copy(top).lerp(end, u);
          hanging = true;
          beam = 0.45 * (1 - u);
          rod = 0.15;
        } else {
          /* ⑦ 收钩离场 */
          r.phaseName = '救援云离开…';
          const u = U.clamp01((T - 6.5) / (DESIGN - 6.5));
          cloudPos.copy(r.target).addScaledVector(tgtUp, U.lerp(TOW_UP + HANG, 30, U.easeInCubic(u)));
          kartPos.copy(r.target);
          up.copy(tgtUp);
          fwd.copy(r.targetFwd);
          beam = 0;
          rod = 0.35;
        }

        /* ---- 悬挂姿态 ---- */
        if (hanging) {
          // 牵引点固定在云正下方 HANG 处
          _anchor.copy(cloudPos).addScaledVector(_down, HANG);
          const t0 = T - 2.35;
          const swayS = Math.sin(t0 * 2.3 + r.bob) * 0.13 * U.clamp01(t0 / 0.8);
          const swayF = Math.sin(t0 * 1.7 + r.bob * 1.7) * 0.09 * U.clamp01(t0 / 0.8);
          _side.copy(tgtUp).cross(r.targetFwd).normalize();
          up.set(0, 1, 0)
            .addScaledVector(_side, swayS)
            .addScaledVector(r.targetFwd, swayF)
            .normalize();
          // 落地前逐渐把“上”对齐路面法线，避免结束时跳变
          const align = U.smootherstep(U.clamp01((T - 5.5) / 1.1));
          if (align > 0) up.lerp(tgtUp, align).normalize();
          fwd.copy(r.targetFwd);
          fwd.addScaledVector(up, -fwd.dot(up));
          if (fwd.lengthSq() < 1e-5) fwd.copy(r.targetFwd);
          fwd.normalize();
          // 挂在车尾，车头自然下压
          const pitch = -0.20 - Math.sin(t0 * 1.9 + r.bob) * 0.03;
          _side.copy(up).cross(fwd).normalize();
          _q.setFromAxisAngle(_side, pitch);
          fwd.applyQuaternion(_q).normalize();
          up.applyQuaternion(_q).normalize();
          kartPos.copy(_anchor).addScaledVector(up, -TOW_UP).addScaledVector(fwd, TOW_BACK);
        }

        /* ---- 应用车辆状态 ---- */
        kart.pos.copy(kartPos);
        kart.up.copy(up);
        kart.forward.copy(fwd);
        kart.onGround = true;
        kart.speed = 0;
        kart.vy = 0;
        kart.syncVisual(dt, 0);

        /* ---- 演出体 ---- */
        const actor = r.actor;
        if (!r.lineOnly) {
          _anchor.copy(kartPos).addScaledVector(up, TOW_UP).addScaledVector(fwd, -TOW_BACK);
          actor.place(cloudPos, _anchor, T > 1.1 && T < 6.55, dt);
        }
        actor.setBeam(beam);
        actor.setRod(rod);
        const lamp = actor.cloud.userData.lamp;
        if (lamp) lamp.material.color.setHSL(0.13, 1, 0.62 + Math.sin(r.t * 11) * 0.16);
        actor.cloud.position.y = Math.sin(T * 1.7 + r.bob) * 0.1;

        /* ---- 粒子 ---- */
        if (r.isPlayer || r.t < 0.6) {
          if (Math.random() < dt * 26) {
            this.particles.add.spawn(
              cloudPos.x + U.rand(-2.2, 2.2), cloudPos.y + U.rand(-0.7, 0.4), cloudPos.z + U.rand(-2.2, 2.2),
              U.rand(-0.8, 0.8), U.rand(-1.6, 0.4), U.rand(-0.8, 0.8),
              0xffe9a8, U.rand(0.3, 0.65), U.rand(0.5, 1.0),
              { gravity: -1.5, drag: 0.8, sizeEnd: 0.03 }
            );
          }
        }
        if (hanging && Math.random() < dt * 5) {
          this.particles.norm.spawn(
            kartPos.x + U.rand(-1.2, 1.2), kartPos.y + U.rand(-0.2, 0.6), kartPos.z + U.rand(-1.2, 1.2),
            U.rand(-0.6, 0.6), U.rand(-2.5, -0.8), U.rand(-0.6, 0.6),
            0xdfe9fb, U.rand(0.3, 0.6), U.rand(0.5, 0.9),
            { gravity: -2, drag: 1.2, sizeEnd: 0.6, alpha: 0.4 }
          );
        }

        /* ---- 结束 ---- */
        if (r.t >= r.dur) {
          this._finish(r, game);
          this.active.splice(i, 1);
        }
      }
    }

    _finish(r, game) {
      const kart = r.kart;
      kart.pos.copy(r.target);
      kart.up.copy(r.targetUp);
      kart.forward.copy(r.targetFwd);
      kart.speed = 0;
      kart.vy = 0;
      kart.onGround = true;
      kart.airborne = 0;
      kart.glider = 0;
      if (kart.gliderMesh) kart.gliderMesh.visible = false;
      kart.hint = r.targetIndex;
      kart.lastS = r.targetS;
      kart.lastGoodS = r.targetS;
      kart._xs = r.targetS;
      kart.stuckTimer = 0;
      kart.offroadTimer = 0;
      kart.noProgTimer = 0;
      kart.trick = 0;
      kart.trickDone = false;
      kart.invuln = 1.4;
      kart.rescueActive = false;
      kart.rescueData = null;
      kart.syncVisual(0.016, 0);

      this._release(r.actor);

      for (let i = 0; i < 18; i++) {
        this.particles.add.spawn(
          kart.pos.x, kart.pos.y + 0.25, kart.pos.z,
          U.rand(-4, 4), U.rand(1, 5), U.rand(-4, 4),
          0xd8e4f8, U.rand(0.25, 0.6), U.rand(0.4, 0.9),
          { gravity: -12, drag: 1.4, sizeEnd: 0.02 }
        );
      }
      this.particles.ring(kart.pos.clone().addScaledVector(kart.up, 0.2), kart.up, 0xbfe8ff, 3.4, 0.5);

      if (kart.isPlayer && game) {
        game.shake = 0.3;
        game.audio.play('land');
        game.hud.hint('已放回赛道', 1.6);
      }
    }

    /** 玩家是否正在被救援 */
    isPlayerRescued(game) {
      for (let i = 0; i < this.active.length; i++) {
        if (this.active[i].isPlayer) return this.active[i];
      }
      return null;
    }

    reset() {
      for (const r of this.active) {
        r.kart.rescueActive = false;
        r.kart.rescueData = null;
        this._release(r.actor);
      }
      this.active.length = 0;
      for (const a of this.actors) { a.busy = false; a.show(false); }
    }
  }

  SK.RescueSystem = RescueSystem;
})();
