/* ============================================================
   Super Kart 8 — audio.js
   全程序化音频：引擎声 / 漂移摩擦 / 音效 / 原创芯片风 BGM
   （不加载任何外部音频文件，全部由 WebAudio 实时合成）
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;

  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.ready = false;
      this.musicOn = true;
      this.sfxOn = true;
      this.volume = 0.8;
      this._nodes = {};
      this._step = 0;
      this._nextNoteTime = 0;
      this._timer = null;
      this._playingMusic = false;
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.34;
      this.musicBus.connect(this.master);

      // 复用噪声缓冲
      const len = this.ctx.sampleRate * 1.2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      this.setupEngine();
      this.ready = true;
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    setVolume(v) {
      this.volume = v;
      if (this.master) this.master.gain.value = v;
    }

    /* ---------------- 引擎声 ---------------- */
    setupEngine() {
      const c = this.ctx;
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.sfxBus);

      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 6;
      filter.connect(g);

      const o1 = c.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 70;
      o1.connect(filter);
      const o2 = c.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 35;
      o2.connect(filter);
      const o3 = c.createOscillator();
      o3.type = 'triangle';
      o3.frequency.value = 105;
      const g3 = c.createGain();
      g3.gain.value = 0.5;
      o3.connect(g3);
      g3.connect(filter);

      o1.start(); o2.start(); o3.start();
      this._nodes.engine = { g, filter, o1, o2, o3 };

      // 漂移摩擦
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 2.2;
      const dg = c.createGain();
      dg.gain.value = 0;
      src.connect(bp); bp.connect(dg); dg.connect(this.sfxBus);
      src.start();
      this._nodes.drift = { src, bp, g: dg };

      // 风噪（高速）
      const wsrc = c.createBufferSource();
      wsrc.buffer = this.noiseBuf;
      wsrc.loop = true;
      const wf = c.createBiquadFilter();
      wf.type = 'highpass';
      wf.frequency.value = 1200;
      const wg = c.createGain();
      wg.gain.value = 0;
      wsrc.connect(wf); wf.connect(wg); wg.connect(this.sfxBus);
      wsrc.start();
      this._nodes.wind = { g: wg, f: wf };
    }

    updateEngine(speedNorm, driftLevel, drifting, offroad, active) {
      if (!this.ready) return;
      const n = this._nodes.engine;
      const t = this.ctx.currentTime;
      const target = active ? U.lerp(0.055, 0.16, U.clamp01(speedNorm)) : 0;
      n.g.gain.setTargetAtTime(target, t, 0.08);
      const f = 62 + speedNorm * 155 + (drifting ? driftLevel * 8 : 0);
      n.o1.frequency.setTargetAtTime(f, t, 0.06);
      n.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
      n.o3.frequency.setTargetAtTime(f * 1.51, t, 0.06);
      n.filter.frequency.setTargetAtTime(500 + speedNorm * 1600 + (offroad ? 200 : 0), t, 0.08);

      const d = this._nodes.drift;
      const dTarget = drifting ? 0.028 + driftLevel * 0.014 : 0;
      d.g.gain.setTargetAtTime(dTarget, t, 0.05);
      d.bp.frequency.setTargetAtTime(2100 + driftLevel * 500, t, 0.1);

      const w = this._nodes.wind;
      w.g.gain.setTargetAtTime(active ? U.clamp01((speedNorm - 0.55) * 0.06) : 0, t, 0.12);
      w.f.frequency.setTargetAtTime(900 + speedNorm * 900, t, 0.2);
    }

    /* ---------------- 基础音色 ---------------- */
    tone(opts) {
      if (!this.ready || !this.sfxOn) return;
      const c = this.ctx;
      const t0 = c.currentTime + (opts.delay || 0);
      const o = c.createOscillator();
      o.type = opts.type || 'square';
      o.frequency.setValueAtTime(opts.f0, t0);
      if (opts.f1 !== undefined) {
        if (opts.exp) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), t0 + opts.dur);
        else o.frequency.linearRampToValueAtTime(opts.f1, t0 + opts.dur);
      }
      const g = c.createGain();
      const peak = opts.gain === undefined ? 0.2 : opts.gain;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
      let node = o;
      if (opts.filter) {
        const f = c.createBiquadFilter();
        f.type = opts.filter.type || 'lowpass';
        f.frequency.setValueAtTime(opts.filter.f0 || 2000, t0);
        if (opts.filter.f1) f.frequency.exponentialRampToValueAtTime(opts.filter.f1, t0 + opts.dur);
        f.Q.value = opts.filter.q || 1;
        node.connect(f);
        f.connect(g);
      } else {
        node.connect(g);
      }
      g.connect(opts.bus || this.sfxBus);
      o.start(t0);
      o.stop(t0 + opts.dur + 0.02);
    }

    noise(opts) {
      if (!this.ready || !this.sfxOn) return;
      const c = this.ctx;
      const t0 = c.currentTime + (opts.delay || 0);
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = opts.filterType || 'bandpass';
      f.frequency.setValueAtTime(opts.f0 || 1200, t0);
      if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t0 + opts.dur);
      f.Q.value = opts.q || 1.2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(opts.gain === undefined ? 0.15 : opts.gain, t0 + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
      src.connect(f); f.connect(g); g.connect(this.sfxBus);
      src.start(t0);
      src.stop(t0 + opts.dur + 0.02);
    }

    /* ---------------- 音效 ---------------- */
    play(name, arg) {
      if (!this.ready || !this.sfxOn) return;
      const c = this.ctx;
      switch (name) {
        case 'coin':
          this.tone({ type: 'square', f0: 1050, f1: 1050, dur: 0.06, gain: 0.16 });
          this.tone({ type: 'square', f0: 1568, dur: 0.22, gain: 0.14, delay: 0.055 });
          break;
        case 'boost':
          this.noise({ f0: 700, f1: 4200, dur: 0.4, gain: 0.14, q: 0.9 });
          this.tone({ type: 'sawtooth', f0: 180, f1: 520, dur: 0.35, gain: 0.1, filter: { f0: 800, f1: 3000 } });
          break;
        case 'miniTurbo':
          this.noise({ f0: 900, f1: 5000, dur: 0.28, gain: 0.12, q: 1.4 });
          this.tone({ type: 'triangle', f0: 400 + (arg || 0) * 130, f1: 900 + (arg || 0) * 200, dur: 0.24, gain: 0.13 });
          break;
        case 'hop':
          this.tone({ type: 'square', f0: 420, f1: 700, dur: 0.1, gain: 0.08 });
          break;
        case 'itemBox':
          this.tone({ type: 'square', f0: 880, dur: 0.06, gain: 0.12 });
          this.tone({ type: 'square', f0: 1174, dur: 0.06, gain: 0.12, delay: 0.06 });
          this.tone({ type: 'square', f0: 1568, dur: 0.12, gain: 0.12, delay: 0.12 });
          break;
        case 'roulette':
          this.tone({ type: 'square', f0: 1200 + Math.random() * 400, dur: 0.03, gain: 0.05 });
          break;
        case 'itemGet':
          this.tone({ type: 'triangle', f0: 523, dur: 0.1, gain: 0.15 });
          this.tone({ type: 'triangle', f0: 784, dur: 0.18, gain: 0.15, delay: 0.09 });
          break;
        case 'shell':
          this.tone({ type: 'sawtooth', f0: 520, f1: 240, dur: 0.22, gain: 0.1, filter: { f0: 2000, f1: 500 } });
          break;
        case 'pop':
          this.noise({ f0: 2400, f1: 500, dur: 0.16, gain: 0.12, q: 0.8 });
          break;
        case 'drop':
          this.tone({ type: 'sine', f0: 300, f1: 140, dur: 0.14, gain: 0.09 });
          break;
        case 'hit':
          this.noise({ f0: 900, f1: 160, dur: 0.4, gain: 0.22, q: 0.6 });
          this.tone({ type: 'sawtooth', f0: 300, f1: 70, dur: 0.5, gain: 0.14 });
          break;
        case 'wall':
          this.noise({ f0: 500, f1: 120, dur: 0.24, gain: 0.16, q: 0.5 });
          break;
        case 'star':
          [0, 1, 2, 3, 4].forEach(i => this.tone({
            type: 'square', f0: NOTE(72 + i * 4), dur: 0.14, gain: 0.1, delay: i * 0.07
          }));
          break;
        case 'lightning':
          this.noise({ f0: 3000, f1: 120, dur: 0.9, gain: 0.24, q: 0.4 });
          this.tone({ type: 'sawtooth', f0: 900, f1: 60, dur: 0.8, gain: 0.12 });
          break;
        case 'bullet':
          this.tone({ type: 'sawtooth', f0: 120, f1: 420, dur: 0.7, gain: 0.18, filter: { f0: 500, f1: 2600 } });
          this.noise({ f0: 400, f1: 3000, dur: 0.7, gain: 0.14 });
          break;
        case 'countdown':
          this.tone({ type: 'square', f0: 523, dur: 0.18, gain: 0.2 });
          break;
        case 'go':
          this.tone({ type: 'square', f0: 1046, dur: 0.5, gain: 0.22 });
          this.tone({ type: 'square', f0: 1568, dur: 0.5, gain: 0.14, delay: 0.02 });
          break;
        case 'lap':
          [0, 2, 4].forEach((n, i) => this.tone({
            type: 'triangle', f0: NOTE(76 + n), dur: 0.16, gain: 0.15, delay: i * 0.09
          }));
          break;
        case 'finalLap':
          [0, 4, 7, 12].forEach((n, i) => this.tone({
            type: 'square', f0: NOTE(72 + n), dur: 0.2, gain: 0.16, delay: i * 0.1
          }));
          break;
        case 'finish':
          [0, 4, 7, 12, 16, 19].forEach((n, i) => this.tone({
            type: 'square', f0: NOTE(72 + n), dur: 0.28, gain: 0.16, delay: i * 0.12
          }));
          break;
        case 'ui':
          this.tone({ type: 'square', f0: 880, dur: 0.05, gain: 0.08 });
          break;
        case 'uiBack':
          this.tone({ type: 'square', f0: 440, f1: 330, dur: 0.08, gain: 0.08 });
          break;
        case 'trick':
          this.tone({ type: 'triangle', f0: 700, f1: 1400, dur: 0.18, gain: 0.12 });
          break;
        case 'wrong':
          this.tone({ type: 'square', f0: 220, dur: 0.1, gain: 0.08 });
          break;
        case 'rescue':
          // 救援：上行提示 + 风声
          [0, 4, 7].forEach((n, i) => this.tone({
            type: 'triangle', f0: NOTE(64 + n), dur: 0.22, gain: 0.11, delay: i * 0.13
          }));
          this.noise({ f0: 500, f1: 1800, dur: 0.9, gain: 0.06, q: 1.1 });
          break;
        case 'land':
          this.noise({ f0: 700, f1: 180, dur: 0.24, gain: 0.12, q: 0.7 });
          this.tone({ type: 'sine', f0: 220, f1: 90, dur: 0.22, gain: 0.1 });
          break;
      }
    }

    /* ---------------- BGM（原创芯片音乐） ---------------- */
    startMusic() {
      if (!this.ready) return;
      if (this._playingMusic) return;
      this._playingMusic = true;
      this._step = 0;
      this._nextNoteTime = this.ctx.currentTime + 0.1;
      this.bpm = 150;
      this._timer = setInterval(() => this._scheduler(), 25);
    }

    stopMusic() {
      this._playingMusic = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    _scheduler() {
      if (!this._playingMusic || !this.ctx) return;
      const spb = 60 / this.bpm / 4; // 16 分音符
      while (this._nextNoteTime < this.ctx.currentTime + 0.18) {
        this._scheduleStep(this._step, this._nextNoteTime, spb);
        this._nextNoteTime += spb;
        this._step++;
      }
    }

    /* 和声进行（每小节一个和弦）：C  G  Am  F  |  C  G  F  G */
    _chordFor(bar) {
      const prog = [
        { root: 48, notes: [60, 64, 67, 72] },   // C
        { root: 43, notes: [59, 62, 67, 71] },   // G
        { root: 45, notes: [60, 64, 69, 72] },   // Am
        { root: 41, notes: [60, 65, 69, 72] },   // F
        { root: 48, notes: [60, 64, 67, 72] },
        { root: 43, notes: [59, 62, 67, 71] },
        { root: 41, notes: [60, 65, 69, 72] },
        { root: 43, notes: [59, 62, 67, 71] }
      ];
      return prog[bar % 8];
    }

    /* 主旋律（每小节 16 步，-1 表示休止） */
    _melodyFor(bar) {
      const mel = [
        [72, -1, 72, 76, 79, -1, 76, -1, 74, -1, 72, -1, 74, 76, -1, -1],
        [71, -1, 71, 74, 79, -1, 74, -1, 71, -1, 74, -1, 76, 74, -1, -1],
        [72, -1, 76, 79, 81, -1, 79, -1, 76, -1, 72, -1, 74, -1, 76, -1],
        [77, -1, 77, 76, 74, -1, 72, -1, 74, 76, 77, -1, 76, -1, -1, -1],
        [84, -1, 83, 81, 79, -1, 76, -1, 79, -1, 84, -1, 83, 81, -1, -1],
        [79, -1, 79, 81, 83, -1, 86, -1, 83, -1, 81, -1, 79, 77, -1, -1],
        [77, 79, 81, -1, 84, -1, 81, -1, 79, 77, 76, -1, 74, -1, -1, -1],
        [71, -1, 74, -1, 79, -1, 83, -1, 86, -1, 83, -1, 79, -1, -1, -1]
      ];
      return mel[bar % 8];
    }

    _scheduleStep(step, time, spb) {
      const bar = Math.floor(step / 16) % 8;
      const sub = step % 16;
      const chord = this._chordFor(bar);
      const melody = this._melodyFor(bar);
      const bpm = this.bpm;

      // 鼓
      if (sub % 4 === 0 || sub === 8) {
        this._kick(time);
      }
      if (sub === 4 || sub === 12) this._snare(time);
      if (sub % 2 === 0) this._hat(time, sub % 4 === 0 ? 0.5 : 0.28);

      // 贝斯：根音 8 分音符律动
      if (sub % 4 === 0) {
        this._bass(NOTE(chord.root - 12), time, spb * 3.4);
      } else if (sub % 4 === 2) {
        this._bass(NOTE(chord.root - 12 + 7), time, spb * 1.4);
      }

      // 琶音
      if (sub % 2 === 1) {
        const n = chord.notes[(sub >> 1) % chord.notes.length] + 12;
        this._pluck(NOTE(n), time, spb * 1.1, 0.05);
      }

      // 旋律
      const m = melody[sub];
      if (m > 0) this._lead(NOTE(m), time, spb * 1.9);
    }

    _kick(t) {
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
      const g = c.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + 0.18);
    }
    _snare(t) {
      const c = this.ctx;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 1600;
      const g = c.createGain();
      g.gain.setValueAtTime(0.26, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      s.connect(f); f.connect(g); g.connect(this.musicBus);
      s.start(t); s.stop(t + 0.14);
    }
    _hat(t, vol) {
      const c = this.ctx;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 7000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.06 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      s.connect(f); f.connect(g); g.connect(this.musicBus);
      s.start(t); s.stop(t + 0.06);
    }
    _bass(freq, t, dur) {
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 520;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); f.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + dur + 0.02);
    }
    _pluck(freq, t, dur, vol) {
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + dur + 0.02);
    }
    _lead(freq, t, dur) {
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = freq;
      const o2 = c.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = freq * 2.005;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      const g2 = c.createGain();
      g2.gain.value = 0.35;
      o.connect(g); o2.connect(g2); g2.connect(g);
      g.connect(this.musicBus);
      o.start(t); o.stop(t + dur + 0.02);
      o2.start(t); o2.stop(t + dur + 0.02);
    }
  }

  SK.AudioEngine = AudioEngine;
})();
