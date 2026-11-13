/* ============================================================
   Super Kart 8 — game.js
   主控：渲染 / 状态机 / 比赛管理 / 摄像机 / 输入 / 菜单 / 结算
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;

  const DIFF_NAME = { 0.8: '轻松', 1: '普通', 1.12: '困难', 1.25: '专家' };
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

  class Game {
    constructor() {
      this.canvas = document.getElementById('gl');
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        alpha: false
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.setClearColor(0x9ec9ef, 1);
      // 阴影
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = true;
      // 场景 pass 输出线性 HDR，色调映射交给后处理
      this.renderer.outputEncoding = THREE.LinearEncoding;
      this.renderer.toneMapping = THREE.NoToneMapping;

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(0xcfe6fb, 520, 2300);

      this.camera = new THREE.PerspectiveCamera(70, 1, 0.2, 3000);
      this.camera.up.set(0, 1, 0);

      /* ---- 后处理管线 ---- */
      this.post = new SK.PostFX(this.renderer);
      this.fx = {
        exposure: 1.06, bloom: 0.52, bloomWide: 0.42,
        saturation: 1.12, contrast: 1.04,
        vignette: 0.3, grain: 0.014, aberration: 0.45,
        speedBlur: 0, flash: 0, flashColor: new THREE.Color(1, 1, 1)
      };

      this.state = 'boot';
      this.paused = false;
      this.time = 0;
      this.shake = 0;
      this.fps = 60;
      this._fpsAcc = 0;
      this._fpsCount = 0;

      this.settings = {
        charId: 'marco',
        cc: 100,
        laps: 3,
        diff: 1,
        music: true,
        sfx: true,
        wide: false,
        cup: false,
        quality: 'high'
      };

      this.audio = new SK.AudioEngine();
      SK.audio = this.audio;
      this._detectQuality();
      this.hud = new SK.HUDClass();
      this.input = {
        accel: false, brake: false, left: false, right: false, drift: false, item: false,
        steer: 0, driftPressed: false, itemPressed: false
      };
      this._prevDrift = false;
      this._prevItem = false;
      this.keys = {};

      this.particles = null;
      this.track = null;
      this.karts = [];
      this.player = null;
      this.itemSys = null;
      this.raceTime = 0;
      this.laps = 3;
      this.countdown = 0;
      this.finalOrder = null;
      this.wrongWay = false;
      this._wrongTimer = 0;
      this._camPos = new THREE.Vector3();
      this._camLook = new THREE.Vector3();
      this._menuCamT = 0;
      this._celebrationT = 0;

      // 赛道 / 杯赛
      this.trackDef = null;
      this.cupIndex = 0;
      this.cupTrackIndex = 0;
      this.cupMode = false;
      this.cupRound = 0;
      this.cupPoints = null;
      this.cupResults = null;
      this.rescue = null;
      this._buildToken = 0;
      this._building = false;
      this._pendingBuild = null;

      this._bindEvents();
      this._resize();
    }

    /* ================= 启动 ================= */
    async boot() {
      const loadFill = document.getElementById('loadFill');
      const loadText = document.getElementById('loadText');
      const step = async (pct, text, fn) => {
        loadFill.style.width = pct + '%';
        loadText.textContent = text;
        await new Promise(r => setTimeout(r, 30));
        if (fn) fn();
        await new Promise(r => setTimeout(r, 10));
      };

      this._setupLights();
      await step(6, '正在连接云端…', null);
      if (SK.Net) {
        // 登录回调 / 会话恢复；离线时不要卡住启动
        await Promise.race([
          SK.Net.restore().catch(() => null),
          new Promise(r => setTimeout(r, 4000))
        ]);
      }
      await step(12, '正在生成天空与地形…');
      await step(26, '正在铺设赛道与护栏…', () => {
        this.trackDef = SK.TRACKS[0];
        this.track = new SK.Track(this.scene, this.trackDef);
        this._applyTheme();
      });
      await step(58, '正在布置观众与场景…');
      await step(70, '正在准备道具与金币…', () => {
        this.particles = new SK.Particles(this.scene);
        this.itemSys = new SK.ItemSystem(this.scene, this.track, this.particles);
        this.rescue = new SK.RescueSystem(this.scene, this.particles);
      });
      await step(86, '正在装配卡丁车…', () => {
        this._buildPortraits();
      });
      await step(96, '准备就绪', () => {
        this._setupMenu();
      });
      await step(100, '完成');
      document.getElementById('loading').classList.add('hidden');
      this._showMenu();
      this.state = 'menu';
      this._last = performance.now();
      this._loop();
    }

    _setupLights() {
      const hemi = new THREE.HemisphereLight(0xdff0ff, 0x6f8f5a, 0.5);
      this.scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff6e2, 2.15);
      sun.position.set(60, 110, -42);
      sun.castShadow = true;
      const big = this.settings.quality === 'high';
      sun.shadow.mapSize.set(big ? 2048 : 1024, big ? 2048 : 1024);
      sun.shadow.camera.near = 30;
      sun.shadow.camera.far = 220;
      const half = 34;
      sun.shadow.camera.left = -half;
      sun.shadow.camera.right = half;
      sun.shadow.camera.top = half;
      sun.shadow.camera.bottom = -half;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.06;
      sun.shadow.radius = 2.2;
      this.scene.add(sun);
      this.scene.add(sun.target);
      this.sunLight = sun;

      const fill = new THREE.DirectionalLight(0x9fc6ff, 0.22);
      fill.position.set(-380, 240, 420);
      this.scene.add(fill);
      // 边缘补光（从镜头后方打亮车体轮廓）
      const rim = new THREE.DirectionalLight(0xffe9c4, 0.3);
      rim.position.set(-60, 40, 120);
      this.scene.add(rim);

      const amb = new THREE.AmbientLight(0xffffff, 0.06);
      this.scene.add(amb);
      this.lights = { hemi, sun, fill, rim, amb };
      this.ambient = amb;
      this._sunOffset = new THREE.Vector3(78, 62, -46);
    }

    /** 阴影相机跟随玩家 */
    _updateSun() {
      const sun = this.sunLight;
      if (!sun) return;
      const k = this.player;
      let cx = 0, cy = 0, cz = 0;
      if (k && this.state !== 'menu') {
        cx = k.pos.x; cy = k.pos.y; cz = k.pos.z;
      } else if (this.track) {
        const f = this.track.sampleAt(this.track.length * 0.5);
        cx = f.p.x; cy = f.p.y; cz = f.p.z;
      }
      sun.position.set(cx + this._sunOffset.x, cy + this._sunOffset.y, cz + this._sunOffset.z);
      sun.target.position.set(cx, cy, cz);
      sun.target.updateMatrixWorld();
    }

    /* ================= 主题应用 ================= */
    _applyTheme() {
      const def = this.trackDef;
      if (!def) return;
      const th = def.themeData || SK.THEMES[def.theme];
      if (!th) return;
      this.scene.fog = new THREE.Fog(th.fog.color, th.fog.near, th.fog.far);
      this.renderer.setClearColor(th.clear, 1);

      /* ---- 环境反射：用当前天空贴图烘一张 PMREM ---- */
      if (this._envRT) { this._envRT.dispose(); this._envRT = null; }
      this.scene.environment = null;
      if (this.track && this.track.sky && this.track.sky.material && this.track.sky.material.map) {
        const rt = SK.EnvBaker.bake(this.renderer, this.track.sky.material.map);
        if (rt) {
          this._envRT = rt;
          this.scene.environment = rt.texture;
          this.scene.environmentIntensity = 0.85;
        }
      }

      /* ---- 雾色 / 曝光随主题微调 ---- */
      const night = (th.stars || 0) > 0.4;
      this._themeNight = night;
      if (this.post) {
        this.post.exposure = night ? 1.16 : 1.06;
      }

      const L = this.lights;
      if (L) {
        L.hemi.color.setHex(th.light.hemiSky);
        L.hemi.groundColor.setHex(th.light.hemiGround);
        L.hemi.intensity = th.light.hemiInt * 0.5;
        L.sun.color.setHex(th.light.sunColor);
        L.sun.intensity = th.light.sunInt * 2.1;
        L.fill.color.setHex(th.light.hemiSky);
        L.fill.intensity = 0.22;
        L.amb.intensity = th.light.amb * 0.35;
      }
    }

    /* ================= 赛道切换 ================= */
    _setBuilding(on, text) {
      this._building = !!on;
      const mask = document.getElementById('buildMask');
      if (mask) mask.classList.toggle('on', !!on);
      const t = document.getElementById('buildText');
      if (t && text) t.textContent = text;
      const btn = document.getElementById('startBtn');
      if (btn) btn.style.opacity = on ? '.55' : '';
    }

    _buildTrack(def, done) {
      if (!def) { if (done) done(); return; }
      if (this.track && this.trackDef && this.trackDef.id === def.id) {
        if (done) done();
        return;
      }
      const token = ++this._buildToken;
      this._setBuilding(true, '正在生成「' + def.name + '」…');
      const run = () => {
        if (token !== this._buildToken) return;
        // 先清掉仍引用旧赛道的车辆，避免销毁后访问空采样
        this._clearKarts();
        if (this.itemSys) { this.itemSys.dispose(); this.itemSys = null; }
        if (this.rescue) this.rescue.reset();
        if (this.track) { this.track.dispose(); this.track = null; }
        const t0 = performance.now();
        this.track = new SK.Track(this.scene, def);
        this.trackDef = def;
        this._applyTheme();
        if (this.particles) this.itemSys = new SK.ItemSystem(this.scene, this.track, this.particles);
        this._lastBuildMs = Math.round(performance.now() - t0);
        this._setBuilding(false);
        if (done) done();
      };
      // 双 rAF 确保遮罩先渲染出来
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(run, 0)));
    }

    /* ================= 角色头像渲染 ================= */
    _buildPortraits() {
      const W = 180, H = 180;
      const rt = new THREE.WebGLRenderTarget(W, H, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, alpha: true
      });

      const scene = new THREE.Scene();
      scene.environment = this.scene.environment || null;
      const hemi = new THREE.HemisphereLight(0xffffff, 0x8899bb, 0.55);
      scene.add(hemi);
      const d1 = new THREE.DirectionalLight(0xffffff, 1.25);
      d1.position.set(3, 5, 4);
      scene.add(d1);
      const d2 = new THREE.DirectionalLight(0xaaccff, 0.42);
      d2.position.set(-4, 2, -3);
      scene.add(d2);
      const cam = new THREE.PerspectiveCamera(25, W / H, 0.1, 60);
      cam.position.set(0, 0.80, 5.6);
      cam.lookAt(0, 0.58, 0);

      const prevTarget = this.renderer.getRenderTarget();
      const prevClear = new THREE.Color();
      this.renderer.getClearColor(prevClear);
      const prevAlpha = this.renderer.getClearAlpha();
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
      this.renderer.setRenderTarget(prevTarget);

      this.portraits = {};
      const buf = new Uint8Array(W * H * 4);
      const cvs = U.canvas(W, H);
      const c2d = cvs.getContext('2d');
      const img = c2d.createImageData(W, H);

      SK.Character.ROSTER.forEach(c => {
        const model = SK.Character.build(c.id);
        model.rotation.y = Math.PI - 0.3;   // 面向镜头
        model.position.y = -0.88;
        scene.add(model);
        this.renderer.setRenderTarget(rt);
        this.renderer.clear();
        this.renderer.render(scene, cam);
        this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
        // 垂直翻转
        for (let y = 0; y < H; y++) {
          const src = (H - 1 - y) * W * 4;
          const dst = y * W * 4;
          for (let x = 0; x < W * 4; x++) img.data[dst + x] = buf[src + x];
        }
        // CPU 端 ACES + gamma（离屏渲染没有后处理管线）
        SK.tonemapRGBA(img.data, 1.05, 2.2);
        c2d.putImageData(img, 0, 0);
        this.portraits[c.id] = cvs.toDataURL('image/png');
        scene.remove(model);
      });
      this.renderer.setRenderTarget(prevTarget);
      this.renderer.setClearColor(prevClear, prevAlpha);
      rt.dispose();
    }

    /* ================= 菜单 ================= */
    _setupMenu() {
      const grid = document.getElementById('charGrid');
      grid.innerHTML = '';
      SK.Character.ROSTER.forEach(c => {
        const card = document.createElement('div');
        card.className = 'char-card' + (c.id === this.settings.charId ? ' on' : '');
        card.dataset.id = c.id;
        const col = '#' + c.color.toString(16).padStart(6, '0');
        card.style.setProperty('--c', col);
        card.innerHTML = `
          <div class="portrait" style="background-image:url('${this.portraits[c.id]}')"></div>
          <div class="cname">${c.name}</div>
          <div class="cbar" style="background:linear-gradient(90deg,${col},#ffffff55)"></div>`;
        card.addEventListener('click', () => this._selectChar(c.id));
        grid.appendChild(card);
      });

      // 分段控件
      const seg = (id, key, attr, cb) => {
        const el = document.getElementById(id);
        el.querySelectorAll('button').forEach(b => {
          b.addEventListener('click', () => {
            el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            const v = parseFloat(b.dataset[attr]);
            this.settings[key] = v;
            if (SK.audio) SK.audio.play('ui');
            if (cb) cb(v);
          });
        });
      };
      seg('ccSeg', 'cc', 'cc');
      seg('lapSeg', 'laps', 'laps', (v) => { this.laps = v; });
      seg('diffSeg', 'diff', 'diff');

      // 画质（菜单 + 暂停面板共用）
      ['qualitySeg', 'qualitySeg2'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelectorAll('button').forEach(b => {
          b.addEventListener('click', () => {
            if (SK.audio) SK.audio.play('ui');
            this.setQuality(b.dataset.q);
          });
        });
      });
      this._syncQualityUI();

      document.getElementById('musicToggle').addEventListener('change', (e) => {
        this.settings.music = e.target.checked;
        document.getElementById('musicToggle2').checked = e.target.checked;
        if (this.audio) { this.audio.musicOn = e.target.checked; if (!e.target.checked) this.audio.stopMusic(); else if (this.state !== 'menu') this.audio.startMusic(); }
      });
      document.getElementById('sfxToggle').addEventListener('change', (e) => {
        this.settings.sfx = e.target.checked;
        document.getElementById('sfxToggle2').checked = e.target.checked;
        if (this.audio) this.audio.sfxOn = e.target.checked;
      });
      document.getElementById('camToggle').addEventListener('change', (e) => {
        this.settings.wide = e.target.checked;
      });
      document.getElementById('musicToggle2').addEventListener('change', (e) => {
        this.settings.music = e.target.checked;
        document.getElementById('musicToggle').checked = e.target.checked;
        if (this.audio) { this.audio.musicOn = e.target.checked; if (!e.target.checked) this.audio.stopMusic(); else this.audio.startMusic(); }
      });
      document.getElementById('sfxToggle2').addEventListener('change', (e) => {
        this.settings.sfx = e.target.checked;
        document.getElementById('sfxToggle').checked = e.target.checked;
        if (this.audio) this.audio.sfxOn = e.target.checked;
      });

      document.getElementById('startBtn').addEventListener('click', () => this._onStart());
      const netBtn = document.getElementById('netBtn');
      if (netBtn) netBtn.addEventListener('click', () => {
        SK.audio && SK.audio.play('ui');
        if (SK.Net && SK.Net.showLobby) SK.Net.showLobby();
      });
      document.getElementById('resumeBtn').addEventListener('click', () => this.togglePause(false));
      document.getElementById('restartBtn').addEventListener('click', () => {
        if (this.netSync) { this.hud.hint('联机比赛中不能重开，可返回大厅再开一局', 2.4); return; }
        this.togglePause(false); this.startRace();
      });
      document.getElementById('quitBtn').addEventListener('click', () => {
        this.togglePause(false);
        if (this.netSync) { this._quitNetRace(); return; }
        this._showMenu();
      });
      document.getElementById('againBtn').addEventListener('click', () => this._onAgain());
      document.getElementById('menuBtn').addEventListener('click', () => {
        this._hideResults();
        if (this.netSync) { this._quitNetRace(); return; }
        this._showMenu();
      });
      document.getElementById('cupAgainBtn').addEventListener('click', () => { this._hideCupFinal(); this.startCup(); });
      document.getElementById('cupMenuBtn').addEventListener('click', () => { this._hideCupFinal(); this._showMenu(); });

      this._setupTrackMenu();
      this._selectChar(this.settings.charId);
    }

    /* ================= 赛道 / 杯赛菜单 ================= */
    _currentDef() {
      const list = SK.tracksOfCup(this.cupIndex);
      return list[U.clamp(this.cupTrackIndex, 0, list.length - 1)] || SK.TRACKS[0];
    }

    _setupTrackMenu() {
      const tabs = document.getElementById('cupTabs');
      tabs.innerHTML = '';
      SK.CUPS.forEach((c, i) => {
        const b = document.createElement('div');
        b.className = 'cup-tab' + (i === this.cupIndex ? ' on' : '');
        b.dataset.cup = i;
        b.style.setProperty('--cc', c.color);
        b.innerHTML = `<i></i>${c.name}`;
        b.addEventListener('click', () => {
          if (this._building) return;
          this.cupIndex = i;
          this.cupTrackIndex = 0;
          if (SK.audio) SK.audio.play('ui');
          this._syncTrackUI();
          if (!this.settings.cup) this._buildTrack(this._currentDef());
        });
        tabs.appendChild(b);
      });

      const tg = document.getElementById('cupToggle');
      tg.addEventListener('change', () => {
        this.settings.cup = tg.checked;
        if (SK.audio) SK.audio.play('ui');
        this._syncTrackUI();
        if (this.settings.cup) this._buildTrack(this._currentDef());
      });

      this._syncTrackUI();
    }

    _drawTrackPreview(canvas, def) {
      const S = 104, pad = 11;
      canvas.width = S; canvas.height = S;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, S, S);
      const pts = def.preview;
      const path = () => {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const x = pad + pts[i].x * (S - pad * 2);
          const y = pad + pts[i].y * (S - pad * 2);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      };
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      path();
      ctx.strokeStyle = 'rgba(6, 10, 20, 0.85)';
      ctx.lineWidth = 11;
      ctx.stroke();
      const col = (def.themeData && def.themeData.swatch) || '#7ee0ff';
      path();
      ctx.strokeStyle = col;
      ctx.lineWidth = 6.5;
      ctx.stroke();
      path();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    _syncTrackUI() {
      const def = this._currentDef();
      const cup = SK.CUPS[this.cupIndex];
      // 杯赛标签
      document.querySelectorAll('.cup-tab').forEach(t => {
        t.classList.toggle('on', parseInt(t.dataset.cup, 10) === this.cupIndex);
      });
      const desc = document.getElementById('cupDesc');
      desc.textContent = this.settings.cup
        ? `${cup.name} · 5 条赛道连跑，按名次累计积分（15/12/10/8/6/4/2/1）`
        : cup.desc;

      // 赛道列表
      const list = document.getElementById('trackList');
      list.innerHTML = '';
      SK.tracksOfCup(this.cupIndex).forEach((t, i) => {
        const card = document.createElement('div');
        card.className = 'track-card' + (!this.settings.cup && i === this.cupTrackIndex ? ' on' : '') +
          (this.settings.cup ? ' cup-item' : '');
        card.style.setProperty('--cc', cup.color);
        const cv = document.createElement('canvas');
        card.appendChild(cv);
        this._drawTrackPreview(cv, t);
        const feats = [];
        if (t.anti) feats.push('反重力');
        if (t.layout.ramps.some(r => r.glide)) feats.push('滑翔');
        feats.push('跳台×' + t.layout.ramps.length);
        const info = document.createElement('div');
        info.className = 'tinfo';
        info.innerHTML = `<div class="tname">${i + 1}. ${t.name}</div>
          <div class="tmeta">
            <span class="cup-dot"></span>
            <span>${(t.lengthApprox / 1000).toFixed(2)} km</span>
            <span class="stars">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</span>
            <span class="feat">${feats.join(' · ')}</span>
          </div>`;
        card.appendChild(info);
        card.addEventListener('click', () => {
          if (this._building) return;
          this.cupTrackIndex = i;
          if (SK.audio) SK.audio.play('ui');
          this._syncTrackUI();
          if (!this.settings.cup) this._buildTrack(this._currentDef());
        });
        list.appendChild(card);
      });

      // 摘要
      const sum = document.getElementById('selSummary');
      const feat = [];
      if (def.anti) feat.push('360° 反重力');
      if (def.lake) feat.push('水景');
      if (def.layout.ramps.some(r => r.glide)) feat.push('滑翔台');
      sum.innerHTML = this.settings.cup
        ? `<b>${cup.name}</b> · 杯赛 <span class="hl">${SK.tracksOfCup(this.cupIndex).length} 场</span><br>从「${SK.tracksOfCup(this.cupIndex)[0].name}」开始，逐场累计积分`
        : `<b>${def.name}</b> · ${def.themeData.name}<br>${(def.lengthApprox / 1000).toFixed(2)} km · 难度 <span class="hl">${'★'.repeat(def.rating)}</span>${feat.length ? ' · ' + feat.join(' / ') : ''}`;

      const btn = document.querySelector('#startBtn span');
      if (btn) btn.textContent = this.settings.cup ? '开始杯赛' : '开始比赛';
    }

    _onStart() {
      if (this._building) return;
      if (this.settings.cup) this.startCup();
      else {
        this.cupMode = false;
        this._buildTrack(this._currentDef(), () => this.startRace());
      }
    }

    _onAgain() {
      this._hideResults();
      if (this.netSync) {
        // 联机：回到大厅，由房主重新开局
        if (SK.Net.room) {
          if (SK.Net.room.isHost) SK.Net.room._toLobbyAll();
          else SK.Net.room.transport.sendTo(SK.Net.room.hostId, { t: 'rematch' }, true);
        }
        this.netSync = null;
        this.netSetup = null;
        SK.Net.showLobby();
        return;
      }
      if (this.cupMode) this._nextCupRace();
      else this.startRace();
    }

    /** 退出联机比赛：断开房间并回到联机大厅 */
    _quitNetRace() {
      this.netSync = null;
      this.netSetup = null;
      this._hideResults();
      if (this.audio) this.audio.updateEngine(0, 0, false, false, false);
      if (SK.Net && SK.Net.leaveRoom) SK.Net.leaveRoom();
      this._showMenu();
      if (SK.Net && SK.Net.showLobby) SK.Net.showLobby();
    }

    _nextCupRace() {
      this._hideResults();
      this.cupRound++;
      if (this.cupRound >= 5) { this._showCupFinal(); return; }
      const def = SK.tracksOfCup(this.cupIndex)[this.cupRound];
      this.particles.add.clear();
      this._buildTrack(def, () => this.startRace());
    }

    _showCupFinal() {
      const cup = SK.CUPS[this.cupIndex];
      const rows = this.karts.map(k => ({
        k, pts: this.cupPoints[k.charId] || 0
      })).sort((a, b) => b.pts - a.pts);
      const rank = rows.findIndex(r => r.k.isPlayer) + 1;
      document.getElementById('cupBadge').textContent = cup.name;
      document.getElementById('cupBadge').style.background =
        `linear-gradient(180deg, ${cup.accent}, ${cup.color})`;
      document.getElementById('cupFinalTitle').textContent =
        rank === 1 ? '杯赛冠军！' : rank <= 3 ? '登上杯赛领奖台！' : '杯赛完成';
      const best = rows[0].pts;
      document.getElementById('cupFinalSub').textContent =
        `${cup.name} · 5 条赛道 · 你的总积分 ${this.cupPoints[this.player.charId] || 0} 分（冠军 ${best} 分）`;

      let html = `<div class="res-row head cup-row"><span>名次</span><span>车手</span><span>总积分</span><span>单场最佳</span></div>`;
      rows.forEach((r, i) => {
        const col = '#' + (r.k.charData.color >>> 0).toString(16).padStart(6, '0');
        const res = this.cupResults.filter(Boolean);
        let bestPos = 9;
        res.forEach(c => { const f = c.order.find(o => o.charId === r.k.charId); if (f && f.pos < bestPos) bestPos = f.pos; });
        html += `<div class="res-row cup-row ${r.k.isPlayer ? 'me' : ''}">
          <span class="rp">${i + 1}</span>
          <span class="rn"><i class="swatch" style="background:${col}"></i>${r.k.name}${r.k.isPlayer ? '（你）' : ''}</span>
          <span class="pts">${r.pts}<small>PTS</small></span>
          <span class="t">${bestPos <= 8 ? '第 ' + bestPos + ' 名' : '--'}</span>
        </div>`;
      });
      document.getElementById('cupTable').innerHTML = html;
      document.getElementById('cupFinal').classList.remove('hidden');
      this.audio.play('finish');
      this.state = 'menu';
    }

    /* ================= 杯赛流程 ================= */
    startCup() {
      this.cupMode = true;
      this.cupRound = 0;
      this.cupPoints = {};
      this.cupResults = [];
      this.cupRoster = null;
      this._buildTrack(SK.tracksOfCup(this.cupIndex)[0], () => this.startRace());
    }

    _cupAddPoints(order) {
      const PTS = [15, 12, 10, 8, 6, 4, 2, 1];
      // 同一场重开时先撤销上一次结算，避免积分重复累加
      const prev = this.cupResults[this.cupRound];
      if (prev && prev.pts) {
        for (const id in prev.pts) {
          this.cupPoints[id] = (this.cupPoints[id] || 0) - prev.pts[id];
        }
      }
      const pts = {};
      for (let i = 0; i < order.length && i < PTS.length; i++) {
        const id = order[i].charId;
        this.cupPoints[id] = (this.cupPoints[id] || 0) + PTS[i];
        pts[id] = PTS[i];
      }
      this.cupResults[this.cupRound] = {
        def: this.trackDef,
        pts,
        order: order.map(k => ({ name: k.name, charId: k.charId, isPlayer: k.isPlayer, pos: k.position }))
      };
    }

    _hideCupFinal() {
      document.getElementById('cupFinal').classList.add('hidden');
    }

    _selectChar(id) {
      this.settings.charId = id;
      document.querySelectorAll('.char-card').forEach(c => c.classList.toggle('on', c.dataset.id === id));
      const c = SK.Character.get(id);
      document.getElementById('ciName').textContent = c.name;
      document.getElementById('ciTitle').textContent = c.title;
      document.getElementById('ciBlurb').textContent = c.blurb;
      const rows = [
        ['速度', c.stats.speed], ['加速', c.stats.accel],
        ['操控', c.stats.handling], ['重量', c.stats.weight]
      ];
      document.getElementById('statRows').innerHTML = rows.map(([n, v]) => {
        let pips = '';
        for (let i = 1; i <= 5; i++) pips += `<i class="${i <= Math.round(v) ? 'on' : ''}"></i>`;
        return `<div class="stat-row"><b>${n}</b><div class="pips">${pips}</div></div>`;
      }).join('');
      if (SK.audio) SK.audio.play('ui');
    }

    _showMenu() {
      this.state = 'menu';
      this.paused = false;
      document.getElementById('menu').classList.remove('hidden');
      document.getElementById('pause').classList.add('hidden');
      document.getElementById('hud').classList.add('hidden');
      this._hideResults();
      this._hideCupFinal();
      this.audio.stopMusic();
      if (this.audio.ready) {
        // 菜单保留环境声
      }
      // 清理比赛中的卡丁车
      this._clearKarts();
      this._menuCamT = 0;
    }

    _hideResults() {
      document.getElementById('results').classList.add('hidden');
    }

    _clearKarts() {
      for (const k of this.karts) {
        if (k.nameTag && k.nameTag.material) k.nameTag.material.dispose();
        this.scene.remove(k.kartGroup);
        this.scene.remove(k.shadow);
      }
      this.karts = [];
      this.player = null;
    }

    /* ================= 比赛 ================= */
    startRace(netSetup) {
      this.audio.init();
      this.audio.resume();
      if (this.settings.music) {
        this.audio.musicOn = true;
        this.audio.startMusic();
      }
      this.audio.sfxOn = this.settings.sfx;

      document.getElementById('menu').classList.add('hidden');
      document.getElementById('results').classList.add('hidden');
      document.getElementById('pause').classList.add('hidden');
      this.hud.show();

      /* ---- 联机开局：赛道 / 圈数 / 引擎由房主统一下发 ---- */
      this.netSetup = netSetup || null;
      this.netSync = netSetup ? SK.Net.race : null;
      if (netSetup) {
        this.settings.cc = netSetup.settings.cc;
        this.settings.laps = netSetup.settings.laps;
        this.cupMode = false;
        if (this.netSync) {
          this.netSync.onEvent = (kind, data, from) => this._onNetEvent(kind, data, from);
          this.netSync.onDisconnect = () => {
            if (this.hud && this.hud.hint) this.hud.hint('与房主的连接已断开', 6);
          };
        }
      }

      this.laps = this.settings.laps;
      this.hud.setLaps(this.laps);

      this._clearKarts();
      if (this.itemSys) this.itemSys.reset();
      if (this.rescue) this.rescue.reset();
      if (this.particles) { this.particles.add.clear(); this.particles.norm.clear(); }
      if (this.hud.setTrack) this.hud.setTrack(this.trackDef);
      this.hud.setRescue && this.hud.setRescue(null);

      // 引擎等级 → 速度倍率（整体收敛，200cc 也留出加速余量）
      const ccMul = this.settings.cc === 50 ? 0.84 : this.settings.cc === 100 ? 1 : this.settings.cc === 150 ? 1.10 : 1.20;
      this.ccMul = ccMul;

      let entries;
      if (netSetup) {
        entries = netSetup.roster.map(r => ({
          charId: r.charId,
          isPlayer: !!r.isLocal,
          isLocal: !!r.isLocal,
          isAI: !!r.ai,
          netId: r.id,
          name: r.name
        }));
      } else if (this.cupMode && this.cupRoster) {
        // 杯赛：固定阵容，积分才能累计
        entries = this.cupRoster.map(e => ({ charId: e.charId, isPlayer: e.isPlayer }));
      } else {
        const roster = SK.Character.ROSTER.slice();
        const others = roster.filter(c => c.id !== this.settings.charId);
        for (let i = others.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [others[i], others[j]] = [others[j], others[i]];
        }
        const total = 8;
        const playerSlot = 5; // 第 6 位发车
        const chosen = others.slice(0, total - 1);
        entries = [];
        let ci = 0;
        for (let i = 0; i < total; i++) {
          if (i === playerSlot) entries.push({ charId: this.settings.charId, isPlayer: true });
          else entries.push({ charId: chosen[ci++].id, isPlayer: false });
        }
        if (this.cupMode) this.cupRoster = entries.map(e => ({ charId: e.charId, isPlayer: e.isPlayer }));
      }

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const kart = new SK.Kart({
          charId: e.charId,
          isPlayer: e.isPlayer,
          index: i,
          track: this.track,
          scene: this.scene
        });
        kart.maxSpeed *= ccMul;
        kart.accel *= ccMul;
        if (netSetup) {
          kart.netId = e.netId;
          if (e.name) kart.name = e.name;
          // 房主负责模拟 AI；其他人的车（含 AI）都由快照驱动
          kart.isRemote = !e.isLocal && !(netSetup.isHost && e.ai);
          if (netSetup.isHost && e.ai) {
            kart.ai = new SK.AIDriver(kart, this.track, this.settings.diff, 1000 + i * 37);
          }
          if (e.isLocal) kart.isLocalKart = true;
          if (!e.isLocal && !e.ai) {
            const col = '#' + ((kart.charData && kart.charData.color) >>> 0).toString(16).padStart(6, '0');
            kart.setNameTag(kart.name, col);
          }
        } else if (!e.isPlayer) {
          // 难度倍率与追赶奖励在 AIDriver 内部按帧写入 kart.aiSpeedBonus
          kart.ai = new SK.AIDriver(kart, this.track, this.settings.diff, 1000 + i * 37);
        }
        // 发车位
        const row = Math.floor(i / 2), col = i % 2;
        const s = -(8 + row * 7.5);
        const lat = col === 0 ? -5.2 : 5.2;
        kart.reset(s, lat, false);
        kart.totalDist = s;
        kart.lap = 0;
        kart.lapStartTime = 0;
        kart.lapTimes = [];
        kart.position = i + 1;
        kart.crossCount = 0;
        kart._cp = false;
        kart._xs = kart.lastS;
        this.karts.push(kart);
        if (e.isPlayer) this.player = kart;
      }

      // AI 的极速基准统一到玩家（角色属性只保留加速 / 操控 / 重量差异），
      // 否则「玩家选慢车 = 天生慢 12%」，难度就无从调起。
      // 联机时每个人保留自己角色的属性，不做统一。
      if (this.player && !netSetup) {
        for (let i = 0; i < this.karts.length; i++) {
          const k = this.karts[i];
          if (k === this.player) continue;
          k.maxSpeed = this.player.maxSpeed * U.rand(0.995, 1.008);
          // 加速与转向也拉平，否则重量级角色（加速 1.6）会被轻量级（4.7）拉开 10 秒
          k.accel = this.player.accel * U.rand(0.985, 1.015);
          k.turnRate = this.player.turnRate * U.rand(0.99, 1.01);
        }
      }

      this.raceTime = 0;
      // 联机：按房主给的绝对时刻倒计时，各端误差 ≈ 时钟同步误差（<50ms）。
      // 保存绝对时刻，逐帧用墙上时钟重算，避免低帧率客户端因 dt 被限幅而晚起跑。
      this._netStartAt = netSetup ? netSetup.startAtLocal : 0;
      this.countdown = netSetup
        ? Math.max(0.45, this._netStartAt - performance.now() / 1000)
        : 3.4;
      this.state = 'countdown';
      this.finalOrder = null;
      this._finishShown = false;
      this._wrongTimer = 0;
      this.wrongWay = false;
      this._lastCountdownBeep = 99;
      this._accelPressTime = -99;
      this._rocketReady = false;
      this._camPos.copy(this.player.pos).add(new THREE.Vector3(0, 6, 12));
      this.shake = 0;
      this._raceStartLap = 0;

      // 初始镜头
      this._snapCamera();

      if (SK.audio) {
        SK.audio.updateEngine(0, 0, false, false, false);
      }
      this.hud.count('准备');
      const tip = this.trackDef && this.trackDef.anti
        ? '本赛道含 360° 反重力段，进入后车身贴地翻转，保持油门'
        : '按住 W 加速起步 · 在「2」落下的瞬间起步可获得火箭加速';
      this.hud.hint(tip, 5);
    }

    _snapCamera() {
      const k = this.player;
      if (!k) return;
      const dist = 8.6, h = 3.4;
      this.camera.position.copy(k.pos)
        .addScaledVector(k.forward, -dist)
        .addScaledVector(k.up, h);
      this.camera.up.copy(k.up);
      this._camPos.copy(this.camera.position);
      this._camLook.copy(k.pos).addScaledVector(k.forward, 6).addScaledVector(k.up, 1.1);
      this.camera.lookAt(this._camLook);
    }

    /* ================= 输入 ================= */
    _bindEvents() {
      window.addEventListener('keydown', (e) => {
        const k = e.code;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
        if (this.keys[k]) return;
        this.keys[k] = true;
        if (k === 'Escape') {
          if (this.state === 'racing' || this.state === 'countdown') this.togglePause();
          return;
        }
        if (k === 'KeyC') {
          this.settings.wide = !this.settings.wide;
          document.getElementById('camToggle').checked = this.settings.wide;
        }
        if (k === 'Enter' && this.state === 'menu') {
          this.startRace();
        }
        if (k === 'KeyR' && (this.state === 'racing' || this.state === 'finished')) {
          this.startRace();
        }
        if (k === 'KeyE' || k === 'ShiftLeft' || k === 'ShiftRight') {
          this.input.itemPressed = true;
        }
        if ((k === 'Space') && this.state === 'countdown') this.input.driftPressed = true;
        if ((k === 'KeyW' || k === 'ArrowUp') && this.state === 'countdown') {
          this._accelPressTime = performance.now() / 1000;
        }
      });
      window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = {}; });
      window.addEventListener('resize', () => this._resize());

      // 触屏 / 鼠标兜底：点击画面开始
      this.canvas.addEventListener('pointerdown', () => {
        this.audio.init();
        this.audio.resume();
      });
    }

    /* ================= 画质 ================= */
    _detectQuality() {
      // 允许 URL 参数强制：?q=high|medium|low
      const m = /[?&]q=(high|medium|low)/.exec(location.search || '');
      if (m) {
        this.settings.quality = m[1];
        this.post.setQuality(m[1]);
        return;
      }
      // 软件渲染（SwiftShader / llvmpipe）默认走低配
      try {
        const gl = this.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
        this._gpuName = name;
        if (/swiftshader|llvmpipe|software|basic render/i.test(name)) {
          this.settings.quality = 'low';
        } else if (!this.renderer.capabilities.isWebGL2) {
          this.settings.quality = 'medium';
        }
      } catch (e) { /* ignore */ }
      this.post.setQuality(this.settings.quality);
    }

    setQuality(q) {
      if (!q) return;
      const prev = this.settings.quality;
      this.settings.quality = q;
      if (this.post) this.post.setQuality(q);
      const low = q === 'low';
      this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.shadowMap.enabled = !low;
      if (this.sunLight) this.sunLight.castShadow = !low;
      // 切换阴影开关后必须让材质重编译，否则 define 不生效
      if (prev !== q && this.scene) {
        this.scene.traverse(o => {
          if (!o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => { m.needsUpdate = true; });
        });
      }
      this._resize();
      this._syncQualityUI();
    }

    _syncQualityUI() {
      ['qualitySeg', 'qualitySeg2'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelectorAll('button').forEach(b => {
          b.classList.toggle('on', b.dataset.q === this.settings.quality);
        });
      });
    }

    _resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = this.settings.wide ? 80 : 64;
      this.camera.updateProjectionMatrix();
      if (this.post) {
        const pr = this.renderer.getPixelRatio();
        this.post.setSize(w, h, pr);
      }
    }

    _readInput(dt) {
      const keys = this.keys;
      const left = keys['KeyA'] || keys['ArrowLeft'];
      const right = keys['KeyD'] || keys['ArrowRight'];
      const up = keys['KeyW'] || keys['ArrowUp'];
      const down = keys['KeyS'] || keys['ArrowDown'];
      const drift = keys['Space'];
      const item = keys['KeyE'] || keys['ShiftLeft'] || keys['ShiftRight'];

      // 手柄
      let gpSteer = 0, gpAccel = 0, gpBrake = 0, gpDrift = false, gpItem = false;
      if (navigator.getGamepads) {
        const gps = navigator.getGamepads();
        for (let i = 0; i < gps.length; i++) {
          const gp = gps[i];
          if (!gp) continue;
          gpSteer = Math.abs(gp.axes[0]) > 0.18 ? gp.axes[0] : 0;
          gpAccel = gp.buttons[7] ? gp.buttons[7].value : 0;
          gpBrake = gp.buttons[6] ? gp.buttons[6].value : 0;
          gpDrift = gp.buttons[0] && gp.buttons[0].pressed;
          gpItem = gp.buttons[2] && gp.buttons[2].pressed;
          break;
        }
      }

      const inp = this.input;
      inp.accel = (up ? 1 : 0) + gpAccel;
      inp.brake = (down ? 1 : 0) + gpBrake;
      let steer = (right ? 1 : 0) - (left ? 1 : 0);
      if (Math.abs(gpSteer) > 0.05) steer = gpSteer;
      inp.steer = U.clamp(steer, -1, 1);
      inp.drift = !!drift || gpDrift;
      inp.item = !!item || gpItem;

      // 边缘触发
      inp.driftDownEdge = inp.drift && !this._prevDrift;
      inp.itemDownEdge = inp.item && !this._prevItem;
      this._prevDrift = inp.drift;
      this._prevItem = inp.item;
      return inp;
    }

    /* ================= 主循环 ================= */
    _loop() {
      requestAnimationFrame(() => this._loop());
      try {
        this._tick();
      } catch (e) {
        if (!this._errShown) { console.error('[loop]', e); this._errShown = true; }
      }
    }

    _tick() {      const now = performance.now();
      let realDt = (now - this._last) / 1000;
      if (realDt > 0.5) realDt = 0.5;     // 切后台后不要一次性补帧
      this._last = now;
      let dt = realDt;
      if (dt > 0.06) dt = 0.06;           // 物理步长上限，保证稳定
      if (dt < 0) dt = 0;
      this.time += dt;

      // FPS 用真实时间统计，避免低帧时被 dt 上限骗到
      this._fpsAcc += realDt; this._fpsCount++;
      if (this._fpsAcc > 0.5) {
        this.fps = Math.round(this._fpsCount / this._fpsAcc);
        this._fpsAcc = 0; this._fpsCount = 0;
        const tag = document.getElementById('fpsTag');
        if (tag) tag.textContent = this.fps + ' FPS';
        // 自动降质：连续低帧时逐级下调画质
        if (this.fps < 42 && (this.state === 'racing' || this.state === 'countdown')) this._lowFps = (this._lowFps || 0) + 1;
        else this._lowFps = Math.max(0, (this._lowFps || 0) - 1);
        if (this._lowFps > 5) {
          this._lowFps = 0;
          if (this.settings.quality === 'high') this.setQuality('medium');
          else if (this.settings.quality === 'medium') this.setQuality('low');
          else if (!this._qualityReduced) { this._qualityReduced = true; this.renderer.setPixelRatio(1); this._resize(); }
        }
      }

      if (this.state === 'menu') {
        this._updateMenuCam(dt);
      } else if (!this.paused) {
        this._updateRace(dt);
      }

      if (this.track) this.track.update(dt, this.time);
      this.particles.update(dt);
      if (this.itemSys) this.itemSys.update(dt, this.time, this.karts, this.player, this);

      // 引擎声
      if (this.player && this.state !== 'menu') {
        const k = this.player;
        const sn = U.clamp01(Math.abs(k.speed) / (k.maxSpeed * 1.4));
        this.audio.updateEngine(sn, k.drift.level, k.drift.active, k.offroadTimer > 0.2, this.state === 'racing' || this.state === 'countdown');
        if (k.drift.active && k.drift.level > 0) {
          if (Math.random() < dt * 22) {
            this.particles.driftSpark(k.pos, k.drift.level, k.forward, SK.game.track.project(k.pos, k.hint).side, -k.drift.dir);
          }
        }
        if (k.offroadTimer > 0.2 && Math.abs(k.speed) > 6 && Math.random() < dt * 30) {
          this.particles.dust(k.pos, k.up, k.forward, 1);
        }
        if (k.starTimer > 0 && Math.random() < dt * 40) {
          this.particles.starTrail(k.pos.clone().addScaledVector(k.up, 0.6));
        }
        if (k.boostTime > 0 && Math.random() < dt * 45) {
          this.particles.boostFlame(k.pos.clone().addScaledVector(k.forward, -1.2).addScaledVector(k.up, 0.55), k.forward.clone().negate(), 0x8fe0ff);
        }
      }

      this._updateSun();
      this._renderFrame(dt);
    }

    /* ================= 渲染 ================= */
    _renderFrame(dt) {
      const k = this.player;
      const fx = this.fx;
      const night = !!this._themeNight;

      /* 速度 / 加速时的径向模糊 */
      let target = 0;
      if (k && (this.state === 'racing' || this.state === 'countdown')) {
        const sn = U.clamp01((Math.abs(k.speed) - k.maxSpeed * 0.62) / Math.max(6, k.maxSpeed * 0.45));
        target = sn * 0.35 + (k.boostTime > 0 ? 0.55 : 0);
      }
      fx.speedBlur = U.damp(fx.speedBlur, target, 7, dt);

      /* 救援 / 受击闪光 */
      const flashTarget = this.rescue && this.rescue.isPlayerRescued(this) ? 0 : 0;
      fx.flash = U.damp(fx.flash, flashTarget, 8, dt);

      this.post.render(this.scene, this.camera, {
        time: this.time,
        exposure: night ? 1.1 : 1.0,
        bloom: night ? 0.5 : 0.26,
        bloomWide: night ? 0.34 : 0.18,
        threshold: night ? 0.95 : 1.3,
        saturation: 1.06,
        contrast: 1.03,
        vignette: 0.24,
        grain: 0.012,
        aberration: 0.35 + fx.speedBlur * 0.7,
        speedBlur: fx.speedBlur,
        flash: fx.flash,
        flashColor: fx.flashColor,
        radialCentre: this.state === 'menu' ? 0 : 1
      });
    }

    /* ================= 菜单镜头 ================= */
    _updateMenuCam(dt) {
      this._menuCamT += dt * 0.055;
      const L = this.track.length;
      const s = U.mod(this._menuCamT, 1) * L;
      const f = this.track.sampleAt(s);
      const s2 = s + 45;
      const f2 = this.track.sampleAt(s2);
      const height = 4.6 + Math.sin(this._menuCamT * 6) * 1.2;
      const target = f.p.clone().addScaledVector(f.n, height).addScaledVector(f.side, Math.sin(this._menuCamT * 20) * 2.5);
      if (this._camPos.lengthSq() < 1) this._camPos.copy(target);
      this._camPos.lerp(target, 1 - Math.exp(-4 * dt));
      this.camera.position.copy(this._camPos);
      this.camera.up.lerp(f.n, 1 - Math.exp(-3 * dt)).normalize();
      const look = f2.p.clone().addScaledVector(f2.n, 2.2);
      this._camLook.lerp(look, 1 - Math.exp(-5 * dt));
      this.camera.lookAt(this._camLook);
      this.camera.fov = 66;
      this.camera.updateProjectionMatrix();
    }

    /* ================= 比赛更新 ================= */
    _updateRace(dt) {
      const track = this.track;
      const player = this.player;
      const inp = this._readInput(dt);

      /* ---- 倒计时 ---- */
      if (this.state === 'countdown') {
        this.countdown = this._netStartAt
          ? Math.max(0, this._netStartAt - performance.now() / 1000)
          : this.countdown - dt;
        const cd = this.countdown;
        const marks = [3, 2, 1];
        const idx = Math.ceil(cd - 0.4);
        if (cd > 0.45) {
          const num = Math.max(1, Math.min(3, Math.ceil((cd - 0.4) / 1.0)));
          if (this._lastCountdownBeep !== num) {
            this._lastCountdownBeep = num;
            this.hud.count(String(num));
            this.audio.play('countdown');
          }
        }
        if (cd <= 0.45) {
          this.state = 'racing';
          this.raceTime = 0;
          this.hud.center('GO!', 'go', 1.2);
          this.audio.play('go');
          this.player.lapStartTime = 0;
          // 火箭起步判定
          const accelHeld = inp.accel > 0.4;
          const elapsed = performance.now() / 1000 - this._accelPressTime;
          if (accelHeld && elapsed < 1.15 && elapsed > 0.02) {
            this.player.applyBoost(1.6, 1.34);
            this.shake = 0.5;
            this.particles.ring(this.player.pos.clone().addScaledVector(this.player.up, 0.4), this.player.up, 0xffd60a, 5, 0.5);
            this.hud.hint('火箭起步！', 1.6);
            this.audio.play('boost');
          }
          // AI 也会掐秒起步（按难度给概率，专家必定成功）
          for (let i = 0; i < this.karts.length; i++) {
            const k = this.karts[i];
            if (!k.ai || k === this.player) continue;
            if (k.ai.rollStartBoost()) {
              k.applyBoost(1.6, 1.34);
              this.particles.ring(k.pos.clone().addScaledVector(k.up, 0.4), k.up, 0xffd60a, 3.2, 0.4);
            }
          }
        }
      }

      const racing = this.state === 'racing';
      const canDrive = racing || this.state === 'finished';

      /* ---- 更新每辆车 ---- */
      for (let i = 0; i < this.karts.length; i++) {
        const k = this.karts[i];
        if (k.isRemote) continue;              // 远端车由联机快照插值驱动
        if (k.rescueActive) {
          // 救援演出期间完全接管该车
          k.item && k.item.roulette > 0 && (k.item.roulette = Math.max(0, k.item.roulette - dt));
          continue;
        }
        let kinput;
        if (k.isPlayer && !k.ai) {
          kinput = {
            accel: inp.accel, brake: inp.brake, steer: inp.steer,
            drift: inp.drift, item: inp.itemDownEdge
          };
          if (!canDrive) { kinput.accel = 0; kinput.brake = 0; kinput.steer = 0; kinput.drift = false; }
        } else {
          kinput = k.ai.update(dt, this);
          if (!canDrive) { kinput.accel = 0; kinput.steer = 0; kinput.drift = false; }
        }
        k.update(dt, kinput, this);

        // 使用道具
        const wantItem = k.isPlayer ? (canDrive && inp.itemDownEdge) : (canDrive && kinput.item);
        if (wantItem && k.item && k.item.roulette <= 0) {
          this.itemSys.useItem(k, this);
        }
        // 道具转盘倒计时
        if (k.item && k.item.roulette > 0) {
          k.item.roulette -= dt;
          if (k.item.roulette <= 0 && k.isPlayer) this.audio.play('itemGet');
        }
      }

      /* ---- 联机：收发状态快照 + 远端插值（必须在下一次名次计算之前） ---- */
      if (this.netSync) this.netSync.update(this, dt);

      /* ---- 车辆碰撞 ---- */
      this._resolveCollisions(dt);

      /* ---- 拖尾气流（Draft） ---- */
      for (let i = 0; i < this.karts.length; i++) {
        const a = this.karts[i];
        a.draft = 0;
        for (let j = 0; j < this.karts.length; j++) {
          if (i === j) continue;
          const b = this.karts[j];
          const d = b.pos.clone().sub(a.pos);
          const dist = d.length();
          if (dist > 12 || dist < 2) continue;
          const fwd = d.dot(a.forward);
          if (fwd > 1 && a.forward.dot(b.forward) > 0.9) {
            const lat = Math.abs(d.dot(this.track.project(a.pos, a.hint).side));
            if (lat < 2.2) a.draft = 1;
          }
        }
      }

      /* ---- 名次 / 圈数 ---- */
      if (racing || this.state === 'finished') {
        const order = this.karts.slice().sort((a, b) => {
          if (a.finished && b.finished) return a.finishTime - b.finishTime;
          if (a.finished) return -1;
          if (b.finished) return 1;
          return b.totalDist - a.totalDist;
        });
        for (let i = 0; i < order.length; i++) {
          order[i].position = i + 1;
        }
        this.liveOrder = order;
        // 圈数：以累计里程为准（delta 已被钳制，不会跳圈）
        const L = track.length;
        for (let i = 0; i < this.karts.length; i++) {
          const k = this.karts[i];
          const lapNow = Math.max(0, Math.floor(k.totalDist / L));
          if (k.isRemote) {
            // 远端车的圈数 / 完赛状态以快照为准，这里只同步显示
            k.lap = lapNow;
            continue;
          }
          if (!k.finished && lapNow > k.lap) {
            k.lap = lapNow;
            const lt = this.raceTime - k.lapStartTime;
            k.lapTimes.push(lt);
            k.lapStartTime = this.raceTime;
            if (k.isPlayer) {
              if (k.lap === this.laps - 1) {
                this.hud.lapFlash('最后一圈！');
                this.audio.play('finalLap');
              } else if (k.lap < this.laps) {
                this.hud.lapFlash('LAP ' + (k.lap + 1));
                this.audio.play('lap');
              }
            }
          } else if (lapNow < k.lap) {
            k.lap = lapNow;
          }
          if (!k.finished && k.totalDist >= this.laps * L) {
            k.finished = true;
            k.finishTime = this.raceTime;
            if (k.isPlayer) {
              this.state = 'finished';
              this._onPlayerFinish();
            }
          }
        }
      }

      /* ---- 逆行检测 ---- */
      if (racing && player) {
        const f = track.project(player.pos, player.hint);
        const dot = player.forward.dot(f.tangent);
        if (dot < -0.25 && Math.abs(player.speed) > 3) this._wrongTimer += dt;
        else this._wrongTimer = Math.max(0, this._wrongTimer - dt * 2);
        this.wrongWay = this._wrongTimer > 0.6;
      }

      /* ---- 时间 ---- */
      // 玩家完赛后计时继续走，其他车才能拿到各自的完赛时间
      if (racing || this.state === 'finished') this.raceTime += dt;
      if (this.state === 'finished') {
        this._celebrationT += dt;
      }

      /* ---- 救援演出 ---- */
      if (this.rescue) this.rescue.update(dt, this);
      const rescueNow = this.rescue ? this.rescue.isPlayerRescued(this) : null;
      if (this.hud.setRescue) this.hud.setRescue(rescueNow);

      /* ---- 卡死兜底 ---- */
      if (racing) this._updateStuckWatchdog(dt);

      /* ---- 摄像机 ---- */
      if (rescueNow) this._updateRescueCam(dt);
      else this._updateChaseCam(dt, inp);

      /* ---- HUD ---- */
      this.hud.update(dt, this);

      if (this.state === 'finished' && !this._finishShown) {
        this._finishShown = true;
        if (this.netSync) {
          // 联机：等房主汇总所有人的成绩后再出结算
          this.hud.hint('已完赛，等待其他车手…', 6);
        } else {
          setTimeout(() => {
            if (this.state === 'finished') this.hud.showResults(this);
          }, 2200);
        }
      }
    }

    _resolveCollisions(dt) {
      const K = this.karts;
      const R = 1.28;         // 单个碰撞圆半径
      const OFF = 0.95;       // 前后两圆的偏移，车头/车尾都算进去
      for (let i = 0; i < K.length; i++) {
        for (let j = i + 1; j < K.length; j++) {
          const a = K[i], b = K[j];
          if (a.rescueActive || b.rescueActive) continue;
          if (a.isRemote && b.isRemote) continue;   // 远端车之间由各自的客户端负责
          // 仅在赛道上相邻位置才判定（避免立体交叉误撞）
          let ds = Math.abs(a.lastS - b.lastS);
          ds = Math.min(ds, this.track.length - ds);
          if (ds > 9) continue;
          const dx0 = b.pos.x - a.pos.x, dy0 = b.pos.y - a.pos.y, dz0 = b.pos.z - a.pos.z;
          if (dx0 * dx0 + dy0 * dy0 + dz0 * dz0 > 16) continue;

          // 双圆检测：取重叠最深的一对
          let nx = 0, ny = 0, nz = 0, overlap = 0, found = false;
          for (let sa = -1; sa <= 1; sa += 2) {
            const ax = a.pos.x + a.forward.x * OFF * sa;
            const ay = a.pos.y + a.forward.y * OFF * sa;
            const az = a.pos.z + a.forward.z * OFF * sa;
            for (let sb = -1; sb <= 1; sb += 2) {
              const bx = b.pos.x + b.forward.x * OFF * sb;
              const by = b.pos.y + b.forward.y * OFF * sb;
              const bz = b.pos.z + b.forward.z * OFF * sb;
              const dx = bx - ax, dy = by - ay, dz = bz - az;
              const d2 = dx * dx + dy * dy + dz * dz;
              const minD = R * 2;
              if (d2 >= minD * minD || d2 < 1e-8) continue;
              const dist = Math.sqrt(d2);
              const ov = minD - dist;
              if (ov > overlap) {
                overlap = ov; nx = dx / dist; ny = dy / dist; nz = dz / dist; found = true;
              }
            }
          }
          if (!found) continue;

          // 记录推挤前的横向位置，防止把车推下赛道
          const pa = this.track.project(a.pos, a.hint);
          const aLat = pa.lateral, aHalf = pa.halfWidth;
          const aSx = pa.side.x, aSy = pa.side.y, aSz = pa.side.z;
          const pb = this.track.project(b.pos, b.hint);
          const bLat = pb.lateral, bHalf = pb.halfWidth;
          const bSx = pb.side.x, bSy = pb.side.y, bSz = pb.side.z;

          const wa0 = b.weight / (a.weight + b.weight);
          const wb0 = 1 - wa0;
          // 远端车的位置由快照决定，本地不推它，把重叠全部让给本机车辆
          const wa = a.isRemote ? 0 : (b.isRemote ? 1 : wa0);
          const wb = b.isRemote ? 0 : (a.isRemote ? 1 : wb0);
          a.pos.x -= nx * overlap * wa * 0.62;
          a.pos.y -= ny * overlap * wa * 0.62;
          a.pos.z -= nz * overlap * wa * 0.62;
          b.pos.x += nx * overlap * wb * 0.62;
          b.pos.y += ny * overlap * wb * 0.62;
          b.pos.z += nz * overlap * wb * 0.62;

          // 贴边时把车拉回赛道内，避免被顶出护栏缺口
          const aLat1 = aLat - (nx * aSx + ny * aSy + nz * aSz) * overlap * wa * 0.62;
          if (Math.abs(aLat1) > aHalf + 0.4 && Math.abs(aLat) <= aHalf + 0.45) {
            const fix = aLat1 - U.sign(aLat1) * (aHalf + 0.4);
            a.pos.x -= aSx * fix; a.pos.y -= aSy * fix; a.pos.z -= aSz * fix;
          }
          const bLat1 = bLat + (nx * bSx + ny * bSy + nz * bSz) * overlap * wb * 0.62;
          if (Math.abs(bLat1) > bHalf + 0.4 && Math.abs(bLat) <= bHalf + 0.45) {
            const fix = bLat1 - U.sign(bLat1) * (bHalf + 0.4);
            b.pos.x -= bSx * fix; b.pos.y -= bSy * fix; b.pos.z -= bSz * fix;
          }

          // 撞击速度损失
          const relSpeed = Math.abs(a.speed - b.speed);
          if (relSpeed > 4) {
            const slow = a.speed > b.speed ? b : a;
            slow.speed *= 0.94;
            if ((a.isPlayer || b.isPlayer) && relSpeed > 7) {
              this.audio.play('wall');
              this.shake = Math.min(0.35, relSpeed * 0.02);
            }
          }
          // 无敌星撞击（只由本地星玩家判定，再广播给受害者）
          if (!a.isRemote && a.starTimer > 0 && b.starTimer <= 0) this._starHit(a, b);
          else if (!b.isRemote && b.starTimer > 0 && a.starTimer <= 0) this._starHit(b, a);
        }
      }
    }

    _starHit(starKart, victim) {
      if (victim.invuln > 0) return;
      if (victim.spinOut(1.2)) {
        victim.loseCoins(3);
        this.particles.hitBurst(victim.pos.clone().addScaledVector(victim.up, 0.8), 0xffe066);
        if (victim.isPlayer) { this.shake = 0.6; this.audio.play('hit'); }
        if (victim.isRemote) this._netEvent('hit', { target: victim.netId, kind: 'star' });
      }
    }

    _onPlayerFinish() {
      const p = this.player;
      this.audio.play('finish');
      this.hud.lapFlash('FINISH!');
      this.hud.center('FINISH', 'go', 2);
      this.particles.confetti(p.pos.clone());
      this.shake = 0.8;
      p.ai = new SK.AIDriver(p, this.track, 1.0, 4242);
      // 定格名次（先完赛者优先，其余按里程）
      const order = this.karts.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.totalDist - a.totalDist;
      });
      for (let i = 0; i < order.length; i++) order[i].position = i + 1;
      this.finalOrder = order;
      if (this.cupMode) this._cupAddPoints(order);

      // 联机：把自己的成绩报给房主
      if (this.netSync && SK.Net.room) {
        let best = Infinity;
        p.lapTimes.forEach(t => { if (t < best) best = t; });
        SK.Net.room.reportSelfFinish(p.finishTime, best < Infinity ? best : 0);
      }
    }

    /** 兜底：连续 7 秒几乎没前进 → 直接放回最近一次正常的赛道位置 */
    _updateStuckWatchdog(dt) {
      if (!this.track) return;
      if (!this._wd) this._wd = {};
      for (let i = 0; i < this.karts.length; i++) {
        const k = this.karts[i];
        if (k.finished || k.rescueActive) { this._wd[i] = null; continue; }
        let st = this._wd[i];
        if (!st) { st = this._wd[i] = { d: k.totalDist, t: 0 }; continue; }
        if (Math.abs(k.totalDist - st.d) > 7) { st.d = k.totalDist; st.t = 0; continue; }
        st.t += dt;
        if (st.t > 7) { st.t = 0; this._hardRespawn(k); }
      }
    }

    _hardRespawn(k) {
      const base = (k.lastGoodS === undefined ? k.lastS : k.lastGoodS) + 12;
      const f = this.track.sampleAt(base);
      k.pos.copy(f.p).addScaledVector(f.n, 0.06);
      k.up.copy(f.n);
      k.forward.copy(f.t);
      k.speed = 0; k.vy = 0; k.onGround = true; k.airborne = 0; k.glider = 0;
      if (k.gliderMesh) k.gliderMesh.visible = false;
      k.spinTimer = 0; k.boostTime = 0; k.shrinkTimer = 0;
      k.drift.active = false; k.drift.charge = 0; k.drift.level = 0;
      k.hint = f.i0; k.lastS = f.s; k.lastGoodS = f.s;
      k.noProgTimer = 0; k.offroadTimer = 0; k.stuckTimer = 0;
      k.invuln = Math.max(k.invuln, 1.4);
      k.syncVisual(0.016, 0);
      if (k.isPlayer) {
        this.hud.hint('已回到赛道', 1.4);
        this.audio.play('rescue');
        this.particles.ring(k.pos.clone().addScaledVector(k.up, 0.2), k.up, 0xbfe8ff, 3.2, 0.45);
      }
    }

    _updateRescueCam(dt) {
      const k = this.player;
      if (!k) return;
      const r = this.rescue ? this.rescue.isPlayerRescued(this) : null;
      const T = r ? U.clamp01(r.t / r.dur) : 1;

      const f = this.track.project(k.pos, k.hint);
      const side = f.side, tan = f.tangent, up = f.normal;

      /* 机位关键帧：[时间, 方位角, 距离, 高度, 注视高度] */
      const K = [
        [0.00, -2.10, 13.5, 3.6, 1.0],
        [0.16, -2.70, 15.5, 6.0, 2.6],
        [0.34, -1.30, 12.5, 4.0, 3.4],
        [0.55, 0.45, 14.0, 4.4, 3.8],
        [0.74, 1.80, 14.5, 4.8, 3.8],
        [0.90, 2.85, 11.5, 3.6, 2.2],
        [1.00, 3.1416, 8.6, 3.4, 1.2]
      ];
      let i = 0;
      while (i < K.length - 2 && T > K[i + 1][0]) i++;
      const a = K[i], b = K[i + 1];
      const u = U.smootherstep(U.invLerp(a[0], b[0], T));
      const az = U.lerp(a[1], b[1], u);
      const dist = U.lerp(a[2], b[2], u);
      const height = U.lerp(a[3], b[3], u);
      const lookH = U.lerp(a[4], b[4], u);

      const desired = _v1.copy(k.pos)
        .addScaledVector(side, Math.sin(az) * dist)
        .addScaledVector(tan, Math.cos(az) * dist)
        .addScaledVector(up, height);

      this._camPos.lerp(desired, 1 - Math.exp(-3.2 * dt));
      // 不要钻进地面 / 护栏
      const gp = this.track.project(this._camPos, k.hint);
      if (gp.gap < 1.4) this._camPos.addScaledVector(gp.normal, 1.4 - gp.gap);
      this.camera.position.copy(this._camPos);

      const camUp = _v2.set(0, 1, 0).lerp(up, 0.55).normalize();
      this.camera.up.lerp(camUp, 1 - Math.exp(-3.4 * dt)).normalize();
      const look = _v1.copy(k.pos).addScaledVector(up, lookH);
      this._camLook.lerp(look, 1 - Math.exp(-4.6 * dt));
      this.camera.lookAt(this._camLook);

      const fov = U.lerp(58, 66, U.smoothstep(U.clamp01((T - 0.7) / 0.3)));
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-3 * dt));
      this.camera.updateProjectionMatrix();
    }

    _updateChaseCam(dt, inp) {
      const k = this.player;
      if (!k) return;
      const speed = Math.abs(k.speed);
      const sn = U.clamp01(speed / (k.maxSpeed * 1.5));
      const wide = this.settings.wide;
      let dist = (wide ? 3.6 : 4.0) + sn * 1.1;
      let height = (wide ? 1.6 : 1.78) + sn * 0.26;
      // 漂移时镜头稍微偏向外侧
      const driftOff = k.drift.active ? -k.drift.dir * 1.5 : 0;
      const side = this.track.project(k.pos, k.hint).side;

      const target = k.pos.clone()
        .addScaledVector(k.forward, -dist)
        .addScaledVector(k.up, height)
        .addScaledVector(side, driftOff);

      const lag = (k.onGround ? 13 : 8) + sn * 5;
      this._camPos.lerp(target, 1 - Math.exp(-lag * dt));
      // 防止穿地
      const gp = this.track.project(this._camPos, k.hint);
      if (gp.gap < 1.1) {
        this._camPos.addScaledVector(gp.normal, 1.1 - gp.gap);
      }
      this.camera.position.copy(this._camPos);
      if (this.shake > 0) {
        const s = this.shake;
        this.camera.position.x += (Math.random() - 0.5) * s * 2.2;
        this.camera.position.y += (Math.random() - 0.5) * s * 2.2;
        this.camera.position.z += (Math.random() - 0.5) * s * 2.2;
        this.shake = Math.max(0, this.shake - dt * 1.8);
      }
      // 镜头不随普通侧倾完全翻滚，但在反重力段跟随路面法线
      const upAlign = U.clamp01(k.up.y * 0.5 + 0.5);
      const blend = U.clamp01(Math.pow(1 - upAlign, 2) * 1.6);
      const camUp = _v1.set(0, 1, 0).lerp(k.up, blend).normalize();
      this.camera.up.lerp(camUp, 1 - Math.exp(-7 * dt)).normalize();

      const lookAhead = 4.5 + sn * 5.5;
      const lookTarget = k.pos.clone()
        .addScaledVector(k.forward, lookAhead)
        .addScaledVector(k.up, 0.95);
      this._camLook.lerp(lookTarget, 1 - Math.exp(-9 * dt));
      this.camera.lookAt(this._camLook);

      const targetFov = (this.settings.wide ? 80 : 64) + sn * 11 + (k.boostTime > 0 ? 4 : 0);
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }

    /* ================= 暂停 ================= */
    togglePause(force) {
      const on = force === undefined ? !this.paused : force;
      if (this.state !== 'racing' && this.state !== 'countdown' && on) return;
      this.paused = on;
      document.getElementById('pause').classList.toggle('hidden', !on);
      if (on) {
        // 暂停面板顶部信息：赛道 + 圈数
        const sub = document.getElementById('pauseSub');
        if (sub) {
          const name = this.trackDef ? this.trackDef.name : '';
          const lap = this.player ? Math.min(this.player.lap + 1, this.laps) : 1;
          const pos = this.player ? this.player.position : 1;
          sub.textContent = `${name} · LAP ${lap} / ${this.laps} · 当前第 ${pos} 位`;
        }
        this._syncQualityUI();
        this.audio.stopMusic();
        this.audio.updateEngine(0, 0, false, false, false);
      } else {
        if (this.settings.music) this.audio.startMusic();
        this._last = performance.now();
      }
    }

    /* ================= 比赛事件 ================= */
    onCoin(kart, pos) {
      kart.addCoin();
      this.particles.coinSparkle(pos);
      if (kart.isPlayer) {
        this.audio.play('coin');
        const b = document.getElementById('coinBadge');
        b.classList.add('bump');
        setTimeout(() => b.classList.remove('bump'), 140);
      }
    }
    onItemBox(kart) {
      if (kart.item) return;
      // 传本场真实车数：少人局（含联机 2 人）里垫底也要能拿到翻盘道具。
      // 玩家完整享受落后补偿；AI 按难度给翻盘道具降权（原作 CPU 也极少拿炮弹/闪电）。
      const total = this.karts ? this.karts.length : 8;
      const power = kart.isPlayer ? 1
        : (kart.ai && typeof kart.ai.itemPower === 'number' ? kart.ai.itemPower : 1);
      const type = SK.rollItem(kart.position, total, undefined, power);
      const count = type === 'tripleMushroom' ? 3 : (type === 'banana' ? 3 : 1);
      kart.item = { type, count, roulette: 1.35 };
      // 开箱特效与音效由 ItemSystem._burstBox 负责
    }
    onShellHit(owner, kart, type) {
      // 联机：只有受害者自己的客户端负责结算，避免两端重复判定
      if (kart.isRemote) return;
      if (kart.invuln > 0 || kart.starTimer > 0) return;
      if (kart.spinOut(1.15)) {
        kart.loseCoins(3);
        this.particles.hitBurst(kart.pos.clone().addScaledVector(kart.up, 0.8), 0xffd60a);
        if (kart.isPlayer) { this.shake = 0.7; this.audio.play('hit'); }
        else if (owner && owner.isPlayer) this.audio.play('pop');
        this._netEvent('hit', { target: kart.netId, kind: 'shell' });
      }
    }
    onBananaHit(owner, kart) {
      if (kart.isRemote) return;
      if (kart.invuln > 0 || kart.starTimer > 0) return;
      if (kart.spinOut(1.25)) {
        kart.loseCoins(3);
        this.particles.hitBurst(kart.pos.clone().addScaledVector(kart.up, 0.6), 0xffd60a);
        if (kart.isPlayer) { this.shake = 0.7; this.audio.play('hit'); }
        this._netEvent('hit', { target: kart.netId, kind: 'banana' });
      }
    }
    onBulletHit(bulletKart, kart) {
      if (kart.isRemote) return;
      if (kart.invuln > 0) return;
      if (kart.spinOut(1.3)) {
        kart.loseCoins(4);
        this.particles.hitBurst(kart.pos, 0xff5c6c);
        if (kart.isPlayer) this.shake = 0.9;
        this._netEvent('hit', { target: kart.netId, kind: 'bullet' });
      }
    }

    /* ================= 联机事件 ================= */
    _netEvent(kind, data) {
      if (!this.netSync) return;
      this.netSync.sendEvent(kind, data || {});
    }

    _kartByNetId(id) {
      if (id === undefined || id === null) return null;
      for (let i = 0; i < this.karts.length; i++) {
        if (this.karts[i].netId === id) return this.karts[i];
      }
      return null;
    }

    /** 收到其他玩家的道具事件，在本机复现 */
    _onNetEvent(kind, data, from) {
      const self = this.player;
      if (!this.itemSys) return;
      if (kind === 'shell') {
        const owner = this._kartByNetId(from);
        this.itemSys.remoteShell(data.type, data.pos, data.dir, data.hint, owner);
        return;
      }
      if (kind === 'banana') {
        const owner = this._kartByNetId(from);
        this.itemSys.remoteBanana(data.pos, owner);
        return;
      }
      if (kind === 'lightning') {
        if (!self || self.netId === from) return;
        self.squish(3.2);
        self.spinTimer = Math.max(self.spinTimer, 0.7);
        if (this.particles) this.particles.hitBurst(self.pos.clone().addScaledVector(self.up, 1), 0x9be7ff);
        this.onLightning(self);
        return;
      }
      if (kind === 'hit') {
        // 只有打到自己头上才结算（打别人的由别人自己处理）
        if (!self || data.target !== self.netId) return;
        if (data.kind === 'star') {
          this._starHit(null, self);
        } else if (self.spinOut(1.2)) {
          self.loseCoins(3);
          this.particles.hitBurst(self.pos.clone().addScaledVector(self.up, 0.8), 0xffd60a);
          this.shake = 0.7;
          this.audio.play('hit');
        }
      }
    }

    /** 联机：房主把赛道准备指令下发给所有人后，本机先建好赛道 */
    prepareTrack(trackId) {
      return new Promise((resolve) => {
        let idx = SK.TRACKS.findIndex(t => t.id === trackId);
        if (idx < 0) idx = 0;
        const def = SK.TRACKS[idx];
        this.cupMode = false;
        this.cupIndex = Math.floor(idx / 5);
        this.cupTrackIndex = idx % 5;
        this._buildTrack(def, () => {
          if (this._syncTrackUI) this._syncTrackUI();
          resolve();
        });
      });
    }

    /** 联机：房主汇总的成绩单到达 */
    showNetResults(rows) {
      const p = this.player;
      if (!p || !rows) return;
      for (let i = 0; i < rows.length; i++) {
        const k = this._kartByNetId(rows[i].id);
        if (!k) continue;
        if (rows[i].dnf) { k.finished = false; continue; }
        k.finished = true;
        k.finishTime = rows[i].time;
        k.position = i + 1;
        if (rows[i].best > 0) k.lapTimes = [rows[i].best];
      }
      // 名次以房主为准
      this.finalOrder = this.karts.slice().sort((a, b) => a.position - b.position);
      for (let i = 0; i < this.finalOrder.length; i++) this.finalOrder[i].position = i + 1;
      this.state = 'finished';
      this.hud.showResults(this);
    }

    onLightning(kart) {
      this.hud.flash(true);
      setTimeout(() => this.hud.flash(false), 120);
      if (kart.isPlayer) this.hud.hint('闪电！全场对手缩小', 2);
      else {
        this.shake = 0.4;
        this.audio.play('lightning');
      }
    }
    onBoostPad(kart) {
      if (kart.isPlayer) {
        this.audio.play('boost');
        this.particles.ring(kart.pos.clone().addScaledVector(kart.up, 0.2), kart.up, 0xffb703, 4, 0.4);
      }
    }
    onMiniTurbo(kart, level) {
      if (kart.isPlayer) {
        this.audio.play('miniTurbo', level);
        this.shake = 0.18 + level * 0.07;
        for (let i = 0; i < 10 + level * 4; i++) {
          this.particles.add.spawn(kart.pos.x, kart.pos.y + 0.3, kart.pos.z,
            U.rand(-5, 5), U.rand(1, 6), U.rand(-5, 5),
            level >= 2 ? 0xff9db0 : 0x9be7ff, U.rand(0.25, 0.55), U.rand(0.2, 0.45),
            { gravity: -10, drag: 1.6, sizeEnd: 0.02 });
        }
      }
      if (level >= 2) {
        for (let i = 0; i < 14; i++) {
          this.particles.add.spawn(
            kart.pos.x, kart.pos.y + 0.4, kart.pos.z,
            U.rand(-4, 4), U.rand(2, 7), U.rand(-4, 4),
            level >= 3 ? 0xc77dff : 0xffd60a, U.rand(0.3, 0.7), U.rand(0.3, 0.6),
            { gravity: -14, drag: 1.4, sizeEnd: 0.02 }
          );
        }
      }
    }
    onDriftStart(kart) {
      if (kart.isPlayer) this.audio.play('hop');
    }
    onWallHit(kart, power) {
      if (kart.isPlayer) {
        this.audio.play('wall');
        this.shake = Math.min(0.6, power * 0.6);
        for (let i = 0; i < 6; i++) {
          this.particles.add.spawn(kart.pos.x, kart.pos.y + 0.5, kart.pos.z,
            U.rand(-3, 3), U.rand(1, 5), U.rand(-3, 3), 0xffe066, 0.35, 0.3,
            { gravity: -16, drag: 1.5, sizeEnd: 0.02 });
        }
      }
    }
    onTrick(kart) {
      if (kart.isPlayer) {
        this.audio.play('trick');
        this.particles.ring(kart.pos.clone().addScaledVector(kart.up, 0.4), kart.up, 0xffffff, 3, 0.35);
      }
    }
    onLand(kart) {
      if (kart.isPlayer) {
        this.shake = 0.22;
        this.audio.play('boost');
      }
      this.particles.dust(kart.pos, kart.up, kart.forward, 1.4);
    }
    onFall(kart) {
      if (!this.rescue || kart.rescueActive) return;
      const isPlayer = kart.isPlayer;
      const r = this.rescue.request(kart, this.track, { dur: isPlayer ? 7.2 : 3.6 });
      if (!r) return;
      kart.loseCoins(isPlayer ? 2 : 1);
      if (isPlayer) {
        this.audio.play('rescue');
        this.shake = 0.18;
        this.particles.smoke(kart.pos.clone().addScaledVector(kart.up, 1.2), 1.8);
        this.hud.hint('冲出赛道！救援云正在赶来', 2.4);
        if (this.hud.setRescue) this.hud.setRescue(r);
      } else {
        this.particles.smoke(kart.pos.clone().addScaledVector(kart.up, 1.0), 1.0);
      }
    }
  }

  /* ================= 启动 ================= */
  window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    SK.game = game;
    game.boot().catch(err => {
      console.error(err);
      document.getElementById('loadText').textContent = '加载失败：' + err.message;
    });
  });
})();
