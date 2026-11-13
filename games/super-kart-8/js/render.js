/* ============================================================
   Super Kart 8 — render.js
   渲染管线：HDR 场景缓冲 + Bloom + ACES 色调映射 + 色彩分级
             + 暗角 / 颗粒 / 色差 / 速度径向模糊
   同时提供环境反射（IBL）与实时阴影支持
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});

  const QUAD_VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  /* ---------------- 亮度提取 ---------------- */
  const BRIGHT_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float threshold;
    uniform float knee;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float br = max(c.r, max(c.g, c.b));
      float k = max(0.0001, threshold * knee);
      float soft = clamp(br - threshold + k, 0.0, 2.0 * k);
      soft = soft * soft / (4.0 * k);
      float contrib = max(soft, br - threshold) / max(br, 0.0001);
      gl_FragColor = vec4(c * contrib, 1.0);
    }
  `;

  /* ---------------- 可分离高斯模糊（5 tap 线性采样优化） ---------------- */
  const BLUR_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 dir;
    void main() {
      vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
      sum += texture2D(tDiffuse, vUv + dir * 1.3846154) * 0.3162162;
      sum += texture2D(tDiffuse, vUv - dir * 1.3846154) * 0.3162162;
      sum += texture2D(tDiffuse, vUv + dir * 3.2307692) * 0.0702703;
      sum += texture2D(tDiffuse, vUv - dir * 3.2307692) * 0.0702703;
      gl_FragColor = sum;
    }
  `;

  /* ---------------- 合成 ---------------- */
  const COMPOSITE_FRAG = `
    precision highp float;
    varying vec2 vUv;

    uniform sampler2D tScene;
    uniform sampler2D tBloomA;
    uniform sampler2D tBloomB;

    uniform vec2  uResolution;
    uniform float uTime;
    uniform float uExposure;
    uniform float uBloom;
    uniform float uBloomWide;
    uniform float uThreshold;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uSpeedBlur;
    uniform float uRadialCentre;   // 0 = 屏幕中心, 1 = 略偏下（赛车视角）
    uniform vec3  uTint;
    uniform vec3  uLift;
    uniform float uFlash;
    uniform vec3  uFlashColor;

    vec3 acesFilm(vec3 x) {
      // Stephen Hill 的 ACES 拟合
      const mat3 IN = mat3(
        0.59719, 0.07600, 0.02840,
        0.35458, 0.90834, 0.13383,
        0.04823, 0.01566, 0.83777
      );
      const mat3 OUT = mat3(
         1.60475, -0.10208, -0.00327,
        -0.53108,  1.10813, -0.07276,
        -0.07367, -0.00605,  1.07602
      );
      x = IN * x;
      vec3 a = x * (x + 0.0245786) - 0.000090537;
      vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
      x = a / b;
      x = OUT * x;
      return clamp(x, 0.0, 1.0);
    }

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centre = vec2(0.5, mix(0.5, 0.38, uRadialCentre));
      vec2 d = uv - centre;

      // --- 色差 ---
      vec3 scene;
      if (uAberration > 0.0001) {
        float r2 = dot(d, d);
        vec2 off = d * r2 * uAberration * 0.018;
        scene.r = texture2D(tScene, uv + off).r;
        scene.g = texture2D(tScene, uv).g;
        scene.b = texture2D(tScene, uv - off).b;
      } else {
        scene = texture2D(tScene, uv).rgb;
      }

      // --- 速度径向模糊（加速 / 冲刺时） ---
      if (uSpeedBlur > 0.001) {
        vec3 acc = scene;
        float total = 1.0;
        for (int i = 1; i < 6; i++) {
          float t = float(i) / 5.0;
          float w = 1.0 - t * 0.75;
          acc += texture2D(tScene, uv - d * t * 0.055 * uSpeedBlur).rgb * w;
          total += w;
        }
        scene = mix(scene, acc / total, clamp(uSpeedBlur, 0.0, 1.0));
      }

      // --- Bloom ---
      vec3 bloom = texture2D(tBloomA, uv).rgb * uBloom
                 + texture2D(tBloomB, uv).rgb * uBloomWide;
      vec3 col = scene + bloom;

      // --- 曝光 + 色调映射 ---
      col *= uExposure;
      col = acesFilm(col);

      // --- 色彩分级：lift / tint / 饱和度 / 对比 ---
      col = col * uTint + uLift * (1.0 - col);
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;

      // --- 暗角 ---
      float vig = smoothstep(0.18, 0.92, length(d) * 1.28);
      col *= 1.0 - uVignette * vig * vig;

      // --- gamma ---
      col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));

      // --- 颗粒（在 gamma 空间叠加，更自然） ---
      if (uGrain > 0.0001) {
        float n = hash12(uv * uResolution + fract(uTime) * 431.7) - 0.5;
        col += n * uGrain;
      }

      // --- 受击 / 闪白 ---
      col = mix(col, uFlashColor, uFlash);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  const FXAA_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    void main() {
      vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
      vec3 rgbNE = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * uTexel).rgb;
      vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * uTexel).rgb;
      vec3 rgbSE = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * uTexel).rgb;
      vec3 rgbM  = texture2D(tDiffuse, vUv).rgb;
      vec3 luma = vec3(0.299, 0.587, 0.114);
      float lNW = dot(rgbNW, luma);
      float lNE = dot(rgbNE, luma);
      float lSW = dot(rgbSW, luma);
      float lSE = dot(rgbSE, luma);
      float lM  = dot(rgbM,  luma);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(
        -((lNW + lNE) - (lSW + lSE)),
         ((lNW + lSW) - (lNE + lSE))
      );
      float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;
      vec3 rgbA = 0.5 * (
        texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
        texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture2D(tDiffuse, vUv + dir * -0.5).rgb +
        texture2D(tDiffuse, vUv + dir * 0.5).rgb);
      float lB = dot(rgbB, luma);
      gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
    }
  `;

  class PostFX {
    constructor(renderer) {
      this.renderer = renderer;
      this.enabled = true;
      this.quality = 'high';
      this.time = 0;

      const isGL2 = renderer.capabilities && renderer.capabilities.isWebGL2;
      this.isGL2 = !!isGL2;

      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      this.quad.frustumCulled = false;
      this.scene = new THREE.Scene();
      this.scene.add(this.quad);

      const mkMat = (frag, uniforms) => new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: frag,
        uniforms,
        depthTest: false,
        depthWrite: false
      });

      this.brightMat = mkMat(BRIGHT_FRAG, {
        tDiffuse: { value: null },
        threshold: { value: 1.0 },
        knee: { value: 0.6 }
      });
      this.blurMat = mkMat(BLUR_FRAG, {
        tDiffuse: { value: null },
        dir: { value: new THREE.Vector2() }
      });
      this.compMat = mkMat(COMPOSITE_FRAG, {
        tScene: { value: null },
        tBloomA: { value: null },
        tBloomB: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uExposure: { value: 1.0 },
        uBloom: { value: 0.3 },
        uBloomWide: { value: 0.22 },
        uThreshold: { value: 1.25 },
        uSaturation: { value: 1.05 },
        uContrast: { value: 1.02 },
        uVignette: { value: 0.24 },
        uGrain: { value: 0.022 },
        uAberration: { value: 0.5 },
        uSpeedBlur: { value: 0 },
        uRadialCentre: { value: 0 },
        uTint: { value: new THREE.Color(1.0, 1.0, 1.0) },
        uLift: { value: new THREE.Color(0.0, 0.0, 0.0) },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) }
      });
      this.fxaaMat = mkMat(FXAA_FRAG, {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2() }
      });

      this.rtScene = null;
      this.width = 1; this.height = 1;
      this._buildTargets(2, 2, 1);
    }

    /** 画质档位：high → MSAA 4x + 全量后期；medium → 无 MSAA + FXAA；low → 仅色调映射 */
    setQuality(q) {
      if (this.quality === q) return;
      this.quality = q;
      this._buildTargets(this.width, this.height, this.pixelRatio || 1);
    }

    _buildTargets(w, h, pr) {
      this.width = Math.max(2, w);
      this.height = Math.max(2, h);
      this.pixelRatio = pr;
      const dispose = (rt) => { if (rt) rt.dispose(); };

      dispose(this.rtScene); dispose(this.rtA); dispose(this.rtB);
      dispose(this.rtC); dispose(this.rtD); dispose(this.rtOut);

      const W = Math.max(2, Math.floor(this.width * pr));
      const H = Math.max(2, Math.floor(this.height * pr));
      this._W = W; this._H = H;

      const high = this.quality === 'high';
      const mid = this.quality === 'medium';

      const useFloat = this.isGL2 && THREE.HalfFloatType;
      const sceneOpts = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: useFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false
      };
      if (high && this.isGL2) sceneOpts.samples = 4;
      this.rtScene = new THREE.WebGLRenderTarget(W, H, sceneOpts);

      const bw = Math.max(2, W >> 1), bh = Math.max(2, H >> 1);
      const qw = Math.max(2, W >> 2), qh = Math.max(2, H >> 2);
      const lowOpts = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: useFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
        depthBuffer: false,
        stencilBuffer: false
      };
      this.rtA = new THREE.WebGLRenderTarget(bw, bh, lowOpts);
      this.rtB = new THREE.WebGLRenderTarget(bw, bh, lowOpts);
      this.rtC = new THREE.WebGLRenderTarget(qw, qh, lowOpts);
      this.rtD = new THREE.WebGLRenderTarget(qw, qh, lowOpts);

      const needsFxaa = !high || !this.isGL2;
      if (needsFxaa) {
        this.rtOut = new THREE.WebGLRenderTarget(W, H, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          depthBuffer: false,
          stencilBuffer: false
        });
      } else {
        this.rtOut = null;
      }
      this._needsFxaa = needsFxaa;
      this._bw = bw; this._bh = bh; this._qw = qw; this._qh = qh;
    }

    setSize(w, h, pr) {
      this._buildTargets(w, h, pr);
    }

    _blit(material, target) {
      this.quad.material = material;
      this.renderer.setRenderTarget(target || null);
      this.renderer.clear(true, false, false);
      this.renderer.render(this.scene, this.camera);
    }

    render(scene, camera, fx) {
      fx = fx || {};
      const r = this.renderer;

      if (!this.enabled) {
        r.setRenderTarget(null);
        r.render(scene, camera);
        return;
      }

      // ---- 场景 → HDR 缓冲 ----
      r.setRenderTarget(this.rtScene);
      r.clear(true, true, true);
      r.render(scene, camera);

      const C = this.compMat.uniforms;
      const useBloom = this.quality !== 'low';

      if (useBloom) {
        // ---- 亮部提取（1/2 分辨率）----
        this.brightMat.uniforms.tDiffuse.value = this.rtScene.texture;
        this.brightMat.uniforms.threshold.value = fx.threshold === undefined ? 0.86 : fx.threshold;
        this._blit(this.brightMat, this.rtA);

        // ---- 半分辨率模糊 ----
        this.blurMat.uniforms.tDiffuse.value = this.rtA.texture;
        this.blurMat.uniforms.dir.value.set(1 / this._bw, 0);
        this._blit(this.blurMat, this.rtB);

        this.blurMat.uniforms.tDiffuse.value = this.rtB.texture;
        this.blurMat.uniforms.dir.value.set(0, 1 / this._bh);
        this._blit(this.blurMat, this.rtA);

        // ---- 1/4 分辨率宽域 ----
        this.blurMat.uniforms.tDiffuse.value = this.rtA.texture;
        this.blurMat.uniforms.dir.value.set(1 / this._qw, 0);
        this._blit(this.blurMat, this.rtC);

        this.blurMat.uniforms.tDiffuse.value = this.rtC.texture;
        this.blurMat.uniforms.dir.value.set(0, 1 / this._qh);
        this._blit(this.blurMat, this.rtD);
      } else {
        // low：跳过 bloom，用一张纯黑贴图占位
        this.blurMat.uniforms.tDiffuse.value = this.rtA.texture;
        this.blurMat.uniforms.dir.value.set(0, 0);
        this._blit(this.blurMat, this.rtB);
      }

      // ---- 合成 ----
      C.tScene.value = this.rtScene.texture;
      C.tBloomA.value = useBloom ? this.rtA.texture : null;
      C.tBloomB.value = useBloom ? this.rtD.texture : null;
      C.uResolution.value.set(this._W, this._H);
      C.uTime.value = fx.time || this.time;
      C.uExposure.value = fx.exposure === undefined ? 1.0 : fx.exposure;
      C.uBloom.value = useBloom ? (fx.bloom === undefined ? 0.5 : fx.bloom) : 0;
      C.uBloomWide.value = useBloom ? (fx.bloomWide === undefined ? 0.42 : fx.bloomWide) : 0;
      C.uSaturation.value = fx.saturation === undefined ? 1.1 : fx.saturation;
      C.uContrast.value = fx.contrast === undefined ? 1.03 : fx.contrast;
      C.uVignette.value = fx.vignette === undefined ? 0.3 : fx.vignette;
      C.uGrain.value = fx.grain === undefined ? 0.016 : fx.grain;
      C.uAberration.value = fx.aberration === undefined ? 0.5 : fx.aberration;
      C.uSpeedBlur.value = fx.speedBlur || 0;
      C.uRadialCentre.value = fx.radialCentre === undefined ? 1 : fx.radialCentre;
      C.uFlash.value = fx.flash || 0;
      if (fx.flashColor) C.uFlashColor.value.copy(fx.flashColor);
      if (fx.tint) C.uTint.value.copy(fx.tint);
      if (fx.lift) C.uLift.value.copy(fx.lift);

      if (this._needsFxaa) {
        this._blit(this.compMat, this.rtOut);
        this.fxaaMat.uniforms.tDiffuse.value = this.rtOut.texture;
        this.fxaaMat.uniforms.uTexel.value.set(1 / this._W, 1 / this._H);
        this._blit(this.fxaaMat, null);
      } else {
        this._blit(this.compMat, null);
      }
    }

    dispose() {
      [this.rtScene, this.rtA, this.rtB, this.rtC, this.rtD, this.rtOut].forEach(t => t && t.dispose());
      this.quad.geometry.dispose();
    }
  }

  SK.PostFX = PostFX;

  /* ================= CPU 端色调映射（用于立绘 / 头像离屏渲染） ================= */
  SK.tonemapRGBA = function (data, exposure, gamma) {
    const e = exposure === undefined ? 1.0 : exposure;
    const g = gamma === undefined ? 2.2 : gamma;
    const inv = 1 / g;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      for (let k = 0; k < 3; k++) {
        let c = (data[i + k] / 255) * e;
        // Narkowicz ACES 近似
        c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
        c = c < 0 ? 0 : c > 1 ? 1 : c;
        data[i + k] = Math.round(Math.pow(c, inv) * 255);
      }
    }
  };

  /* ================= 环境反射（IBL） ================= */
  SK.EnvBaker = {    _pmrem: null,
    bake(renderer, equirect) {
      if (!equirect) return null;
      try {
        if (!this._pmrem) this._pmrem = new THREE.PMREMGenerator(renderer);
        this._pmrem.compileEquirectangularShader();
        const tex = equirect.clone();
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.needsUpdate = true;
        const rt = this._pmrem.fromEquirectangular(tex);
        tex.dispose();
        return rt;
      } catch (e) {
        console.warn('[env] PMREM 失败，回退到无环境反射', e);
        return null;
      }
    }
  };
})();
