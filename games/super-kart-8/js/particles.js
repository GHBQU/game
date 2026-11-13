/* ============================================================
   Super Kart 8 — particles.js
   GPU 点精灵粒子系统（加法混合用于火花 / 普通混合用于烟尘）
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;

  const VERT = `
    attribute float aSize;
    attribute float aAlpha;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = aColor;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
      gl_Position = projectionMatrix * mv;
    }
  `;
  const FRAG = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 d = gl_PointCoord - vec2(0.5);
      float r = length(d);
      if (r > 0.5) discard;
      float a = smoothstep(0.5, 0.06, r);
      gl_FragColor = vec4(vColor, a * vAlpha);
    }
  `;

  class ParticleSystem {
    constructor(scene, max, additive) {
      this.max = max || 2000;
      this.scene = scene;
      const geo = new THREE.BufferGeometry();
      this.posArr = new Float32Array(this.max * 3);
      this.colArr = new Float32Array(this.max * 3);
      this.sizeArr = new Float32Array(this.max);
      this.alphaArr = new Float32Array(this.max);
      geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(this.colArr, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizeArr, 1));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaArr, 1));
      geo.setDrawRange(0, 0);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      this.points = new THREE.Points(geo, mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = 5;
      scene.add(this.points);
      this.geo = geo;

      this.count = 0;
      this.px = new Float32Array(this.max);
      this.py = new Float32Array(this.max);
      this.pz = new Float32Array(this.max);
      this.vx = new Float32Array(this.max);
      this.vy = new Float32Array(this.max);
      this.vz = new Float32Array(this.max);
      this.life = new Float32Array(this.max);
      this.maxLife = new Float32Array(this.max);
      this.grav = new Float32Array(this.max);
      this.drag = new Float32Array(this.max);
      this.s0 = new Float32Array(this.max);
      this.s1 = new Float32Array(this.max);
      this.cr = new Float32Array(this.max);
      this.cg = new Float32Array(this.max);
      this.cb = new Float32Array(this.max);
      this.a0 = new Float32Array(this.max);
      this.fadeIn = new Float32Array(this.max);
      this.bounce = new Uint8Array(this.max);
    }

    spawn(x, y, z, vx, vy, vz, color, size, life, opts) {
      opts = opts || {};
      if (this.count >= this.max) return;
      const i = this.count++;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      const c = color instanceof THREE.Color ? color : new THREE.Color(color);
      this.cr[i] = c.r; this.cg[i] = c.g; this.cb[i] = c.b;
      this.s0[i] = size;
      this.s1[i] = opts.sizeEnd === undefined ? size * 0.2 : opts.sizeEnd;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.grav[i] = opts.gravity === undefined ? -18 : opts.gravity;
      this.drag[i] = opts.drag === undefined ? 1.6 : opts.drag;
      this.a0[i] = opts.alpha === undefined ? 1 : opts.alpha;
      this.fadeIn[i] = opts.fadeIn || 0;
    }

    update(dt) {
      let n = this.count;
      for (let i = 0; i < n; i++) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          // swap-remove
          const last = n - 1;
          if (i !== last) {
            this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last];
            this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last];
            this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
            this.grav[i] = this.grav[last]; this.drag[i] = this.drag[last];
            this.s0[i] = this.s0[last]; this.s1[i] = this.s1[last];
            this.cr[i] = this.cr[last]; this.cg[i] = this.cg[last]; this.cb[i] = this.cb[last];
            this.a0[i] = this.a0[last]; this.fadeIn[i] = this.fadeIn[last];
          }
          n--; i--;
          continue;
        }
        const dr = Math.exp(-this.drag[i] * dt);
        this.vx[i] *= dr; this.vz[i] *= dr;
        this.vy[i] = this.vy[i] * dr + this.grav[i] * dt;
        this.px[i] += this.vx[i] * dt;
        this.py[i] += this.vy[i] * dt;
        this.pz[i] += this.vz[i] * dt;
      }
      this.count = n;
      const pos = this.posArr, col = this.colArr, size = this.sizeArr, alpha = this.alphaArr;
      for (let i = 0; i < n; i++) {
        pos[i * 3] = this.px[i]; pos[i * 3 + 1] = this.py[i]; pos[i * 3 + 2] = this.pz[i];
        col[i * 3] = this.cr[i]; col[i * 3 + 1] = this.cg[i]; col[i * 3 + 2] = this.cb[i];
        const t = 1 - this.life[i] / this.maxLife[i];
        size[i] = U.lerp(this.s0[i], this.s1[i], t);
        let a = this.a0[i] * (1 - t);
        if (this.fadeIn[i] > 0 && t < this.fadeIn[i]) a *= t / this.fadeIn[i];
        alpha[i] = a;
      }
      this.geo.setDrawRange(0, n);
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
    }

    clear() { this.count = 0; this.geo.setDrawRange(0, 0); }
  }

  /* ---------------- 对外门面 ---------------- */
  class Particles {
    constructor(scene) {
      this.add = new ParticleSystem(scene, 2600, true);
      this.norm = new ParticleSystem(scene, 2200, false);
      this.scene = scene;
      this.rings = [];
      this.ringGeo = new THREE.RingGeometry(0.68, 0.96, 32);
      this.ringsPool = [];
    }

    ring(pos, normal, color, radius, life, width) {
      let r = this.ringsPool.pop();
      if (!r) {
        r = {
          mesh: new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
            transparent: true, blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide, depthWrite: false
          })),
          t: 0, life: 1, radius: 1
        };
        r.mesh.renderOrder = 6;
        this.scene.add(r.mesh);
      }
      r.mesh.material.color.set(color);
      r.mesh.material.opacity = 0.85;
      r.mesh.position.copy(pos);
      const nrm = normal.clone().normalize();
      if (nrm.lengthSq() < 1e-6) nrm.set(0, 1, 0);
      r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      r.t = 0;
      r.life = life || 0.5;
      r.radius = radius || 3;
      r.mesh.scale.setScalar(0.2);
      r.mesh.visible = true;
      this.rings.push(r);
    }

    update(dt) {
      this.add.update(dt);
      this.norm.update(dt);
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.t += dt;
        const u = r.t / r.life;
        if (u >= 1) {
          r.mesh.visible = false;
          this.rings.splice(i, 1);
          this.ringsPool.push(r);
          continue;
        }
        const s = 0.2 + U.easeOutCubic(u) * r.radius;
        r.mesh.scale.setScalar(s);
        r.mesh.material.opacity = 0.8 * (1 - u);
      }
    }

    /* ---- 常用特效 ---- */
    driftSpark(pos, level, forward, side, dirSign) {
      const colors = [[0x9be7ff, 0x4fc3f7], [0xffc14d, 0xff8f00], [0xe0a3ff, 0x9c27ff], [0xffe066, 0xffb300]];
      const c = colors[Math.min(level, 3)];
      for (let i = 0; i < (level >= 2 ? 3 : 2); i++) {
        const p = pos.clone()
          .addScaledVector(side, dirSign * U.rand(0.5, 0.95))
          .addScaledVector(forward, U.rand(-0.6, 0.2))
          .add(new THREE.Vector3(U.rand(-0.1, 0.1), U.rand(0.05, 0.35), U.rand(-0.1, 0.1)));
        this.add.spawn(
          p.x, p.y, p.z,
          U.rand(-1.2, 1.2) - forward.x * 3, U.rand(1.5, 4.5), U.rand(-1.2, 1.2) - forward.z * 3,
          U.chance(0.5) ? c[0] : c[1], U.rand(0.28, 0.55), U.rand(0.22, 0.42),
          { gravity: -22, drag: 1.2, sizeEnd: 0.05 }
        );
      }
    }

    dust(pos, normal, forward, intensity) {
      for (let i = 0; i < 2; i++) {
        const p = pos.clone().add(new THREE.Vector3(U.rand(-0.6, 0.6), 0.1, U.rand(-0.6, 0.6)));
        this.norm.spawn(
          p.x, p.y, p.z,
          U.rand(-2, 2) - forward.x * 2, U.rand(0.8, 3), U.rand(-2, 2) - forward.z * 2,
          U.chance(0.5) ? 0xc9b98a : 0x9d8f6e,
          U.rand(0.4, 0.9) * (intensity || 1), U.rand(0.35, 0.7),
          { gravity: -3, drag: 2.2, sizeEnd: 1.4, alpha: 0.5 }
        );
      }
    }

    boostFlame(pos, back, color) {
      for (let i = 0; i < 2; i++) {
        const p = pos.clone().add(back.clone().multiplyScalar(U.rand(0.1, 0.5)));
        this.add.spawn(
          p.x, p.y, p.z,
          back.x * U.rand(4, 9) + U.rand(-1, 1), U.rand(0, 2), back.z * U.rand(4, 9) + U.rand(-1, 1),
          color || 0x7fd8ff, U.rand(0.4, 0.85), U.rand(0.16, 0.3),
          { gravity: 0, drag: 2.4, sizeEnd: 0.05 }
        );
      }
    }

    coinSparkle(pos) {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
        const sp = U.rand(2, 6);
        this.add.spawn(pos.x, pos.y, pos.z,
          Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp,
          U.chance(0.4) ? 0xffffff : 0xffd83e, U.rand(0.25, 0.6), U.rand(0.3, 0.6),
          { gravity: -8, drag: 1.4, sizeEnd: 0.02 });
      }
    }

    hitBurst(pos, color) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
        const sp = U.rand(3, 11);
        this.add.spawn(pos.x, pos.y, pos.z,
          Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 4, Math.sin(a) * Math.cos(b) * sp,
          color || 0xffe066, U.rand(0.3, 0.8), U.rand(0.35, 0.8),
          { gravity: -16, drag: 1.1, sizeEnd: 0.02 });
      }
    }

    starTrail(pos) {
      const c = new THREE.Color().setHSL(Math.random(), 1, 0.65);
      this.add.spawn(pos.x, pos.y, pos.z,
        U.rand(-2, 2), U.rand(0.5, 3), U.rand(-2, 2),
        c, U.rand(0.35, 0.7), U.rand(0.3, 0.55),
        { gravity: -2, drag: 1.8, sizeEnd: 0.02 });
    }

    smoke(pos, sizeScale) {
      this.norm.spawn(pos.x, pos.y, pos.z,
        U.rand(-1.2, 1.2), U.rand(1.5, 3.5), U.rand(-1.2, 1.2),
        0xe8eefc, U.rand(0.5, 1.1) * (sizeScale || 1), U.rand(0.6, 1.1),
        { gravity: 2, drag: 1.6, sizeEnd: 2.2, alpha: 0.55 });
    }

    confetti(pos) {
      const cols = [0xff4d6d, 0xffd60a, 0x4fc3f7, 0x7bdc6a, 0xb388ff];
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = U.rand(4, 14);
        this.norm.spawn(pos.x, pos.y + 6, pos.z,
          Math.cos(a) * sp, U.rand(4, 12), Math.sin(a) * sp,
          U.pick(cols), U.rand(0.3, 0.7), U.rand(1.2, 2.4),
          { gravity: -9, drag: 0.6, sizeEnd: 0.2, alpha: 0.95 });
      }
    }
  }

  SK.Particles = Particles;
})();
