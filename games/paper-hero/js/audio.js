/* 纸片勇者 — 程序化音频（WebAudio 合成，无需外部音频文件） */
(function (PH) {
  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function freq(name) {
    if (!name || name === '.' || name === '-') return 0;
    const m = /^([a-g])([#b]?)(-?\d)$/.exec(name);
    if (!m) return 0;
    let semi = NOTE[m[1]];
    if (m[2] === '#') semi++;
    if (m[2] === 'b') semi--;
    const oct = +m[3];
    return 440 * Math.pow(2, (semi - 9) / 12 + (oct - 4));
  }

  const tracks = {
    // 田园主题：C 大调，明亮跳跃
    field: {
      bpm: 104,
      lead: `e5 .  g5 .  a5 .  g5 e5  d5 .  e5 .  c5 .  .  .
             f5 .  a5 .  g5 .  e5 d5  c5 .  d5 .  e5 .  .  .
             a5 .  c6 .  b5 .  a5 g5  e5 .  g5 .  a5 .  .  .
             g5 .  e5 .  d5 .  c5 .   d5 .  e5 .  c5 .  .  .`,
      bass: `c3 .  .  .  g2 .  .  .   c3 .  .  .  g2 .  .  .
             f2 .  .  .  c3 .  .  .   f2 .  .  .  c3 .  .  .
             a2 .  .  .  e3 .  .  .   a2 .  .  .  e3 .  .  .
             g2 .  .  .  d3 .  .  .   g2 .  .  .  b2 .  .  .`,
      perc: `k . h .  s . h .   k . h .  s . h h
             k . h .  s . h .   k . h .  s . h h
             k . h .  s . h .   k . h .  s . h h
             k . h .  s . h .   k . h h  s . h h`,
      leadWave: 'square', leadVol: 0.16,
    },
    // 洞窟：A 小调，空灵
    cave: {
      bpm: 84,
      lead: `a4 .  .  .  c5 .  b4 .   a4 .  .  .  e4 .  .  .
             f4 .  .  .  a4 .  g4 .   f4 .  .  .  c4 .  .  .
             e5 .  .  .  d5 .  c5 .   b4 .  .  .  a4 .  .  .
             g4 .  .  .  b4 .  a4 .   e4 .  .  .  .  .  .  .`,
      bass: `a2 .  .  .  .  .  .  .   a2 .  .  .  e2 .  .  .
             f2 .  .  .  .  .  .  .   f2 .  .  .  c3 .  .  .
             a2 .  .  .  .  .  .  .   a2 .  .  .  e2 .  .  .
             g2 .  .  .  .  .  .  .   g2 .  .  .  b2 .  .  .`,
      perc: `k . . .  h . . .   k . . .  h . . .
             k . . .  h . . .   k . . .  h . . .
             k . . .  h . . .   k . . .  h . . .
             k . . .  h . . .   k . . .  h . h`,
      leadWave: 'triangle', leadVol: 0.2,
    },
    // BOSS：D 小调，急促
    boss: {
      bpm: 146,
      lead: `d5 d5 .  a4 .  d5 .  f5   e5 .  d5 .  a4 .  .  .
             f5 f5 .  c5 .  f5 .  a5   g5 .  f5 .  c5 .  .  .
             a5 .  g5 .  f5 .  e5 .    d5 .  e5 .  f5 .  g5 .
             a5 .  .  g5 f5 .  e5 .    d5 .  .  .  a4 .  .  .`,
      bass: `d3 .  d3 .  d3 .  d3 .   d3 .  d3 .  a2 .  a2 .
             f3 .  f3 .  f3 .  f3 .   f3 .  f3 .  c3 .  c3 .
             a2 .  a2 .  a2 .  a2 .   a2 .  a2 .  e3 .  e3 .
             d3 .  d3 .  d3 .  d3 .   a2 .  a2 .  d3 .  d3 .`,
      perc: `k . h k  s . h .   k . h k  s . h h
             k . h k  s . h .   k . h k  s . h h
             k . h k  s . h .   k . h k  s . h h
             k . h k  s . h .   k . h k  s h s`,
      leadWave: 'square', leadVol: 0.13,
    },
    // 标题：温柔
    title: {
      bpm: 78,
      lead: `c5 .  e5 .  g5 .  e5 .   a4 .  c5 .  e5 .  c5 .
             f4 .  a4 .  c5 .  a4 .   g4 .  b4 .  d5 .  b4 .
             e5 .  g5 .  c6 .  g5 .   a5 .  e5 .  c5 .  .  .
             g4 .  b4 .  d5 .  g5 .   c5 .  .  .  .  .  .  .`,
      bass: `c3 .  .  .  .  .  .  .   a2 .  .  .  .  .  .  .
             f2 .  .  .  .  .  .  .   g2 .  .  .  .  .  .  .
             c3 .  .  .  .  .  .  .   a2 .  .  .  .  .  .  .
             f2 .  .  .  g2 .  .  .   c3 .  .  .  .  .  .  .`,
      perc: `k . . .  . . h .   k . . .  . . h .
             k . . .  . . h .   k . . .  . . h .
             k . . .  . . h .   k . . .  . . h .
             k . . .  . . h .   k . . .  h . . .`,
      leadWave: 'triangle', leadVol: 0.18,
    },
  };

  function parse(pat) {
    return pat.split(/\s+/).filter((t) => t && t !== '|');
  }

  const A = (PH.Audio = {
    ctx: null,
    master: null,
    sfxBus: null,
    musBus: null,
    sfxOn: true,
    musicOn: true,
    muted: false,
    ready: false,
    _cur: null,
    _step: 0,
    _next: 0,
    _timer: null,
    _patterns: {},

    init() {
      if (this.ctx) return;
      this._pending = this._pending || null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musBus = this.ctx.createGain();
      this.musBus.gain.value = 0.5;
      this.musBus.connect(this.master);
      this.ready = true;
      // 噪声缓冲
      const n = this.ctx.sampleRate * 1;
      this._noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this._noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      for (const k in tracks) {
        this._patterns[k] = {
          lead: parse(tracks[k].lead),
          bass: parse(tracks[k].bass),
          perc: parse(tracks[k].perc),
        };
      }
      this._timer = setInterval(() => this._tick(), 28);
      if (this._pending) {
        const t = this._pending;
        this._pending = null;
        this.play(t);
      }
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.85;
    },

    toggleMute() {
      this.setMuted(!this.muted);
      return !this.muted;
    },

    _tick() {
      if (!this.ctx || !this._cur) return;
      const t = tracks[this._cur];
      if (!t) return;
      const stepDur = 60 / t.bpm / 4;
      const now = this.ctx.currentTime;
      if (this._next < now) this._next = now + 0.02;
      while (this._next < now + 0.16) {
        this._playStep(this._cur, this._step, this._next);
        this._next += stepDur;
        this._step++;
        const len = Math.max(this._patterns[this._cur].lead.length, 16);
        if (this._step >= len) this._step = 0;
      }
    },

    _playStep(name, step, at) {
      const p = this._patterns[name];
      const t = tracks[name];
      if (!p) return;
      const lead = p.lead[step % p.lead.length];
      const bass = p.bass[step % p.bass.length];
      const perc = p.perc[step % p.perc.length];
      if (lead && lead !== '.' && lead !== '-') {
        this._note(freq(lead), at, 0.16, t.leadWave, t.leadVol, this.musBus, 0.004, 0.24);
      }
      if (bass && bass !== '.' && bass !== '-') {
        this._note(freq(bass), at, 0.34, 'triangle', 0.3, this.musBus, 0.01, 0.4, 900);
      }
      if (perc === 'k') this._kick(at, 0.34);
      else if (perc === 's') this._snare(at, 0.13);
      else if (perc === 'h') this._hat(at, 0.06);
    },

    play(name) {
      if (!this.ready) {
        this._pending = name;
        return;
      }
      if (this._cur === name && this._musicOn()) return;
      this._cur = name;
      this._step = 0;
      this._next = this.ctx.currentTime + 0.06;
      this.musBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musBus.gain.setTargetAtTime(this.musicOn ? 0.5 : 0, this.ctx.currentTime, 0.15);
    },

    stop(fade = 0.4) {
      if (!this.ready) return;
      this.musBus.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
      this._cur = null;
    },

    _musicOn() {
      return this.musicOn;
    },

    toggleMusic() {
      this.musicOn = !this.musicOn;
      if (this.ready) this.musBus.gain.value = this.musicOn ? 0.5 : 0;
      return this.musicOn;
    },

    _note(f, at, dur, type, vol, dest, att, rel, cutoff) {
      if (!f) return;
      const c = this.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol, at + (att || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0008, at + (rel || 0.2) + dur * 0.2);
      let node = o;
      if (cutoff) {
        const bq = c.createBiquadFilter();
        bq.type = 'lowpass';
        bq.frequency.value = cutoff;
        o.connect(bq);
        node = bq;
      }
      node.connect(g);
      g.connect(dest || this.sfxBus);
      o.start(at);
      o.stop(at + (rel || 0.3) + dur * 0.2 + 0.02);
    },

    _kick(at, vol) {
      const c = this.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, at);
      o.frequency.exponentialRampToValueAtTime(46, at + 0.12);
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      o.connect(g);
      g.connect(this.musBus);
      o.start(at);
      o.stop(at + 0.24);
    },

    _snare(at, vol) {
      const c = this.ctx;
      const s = c.createBufferSource();
      s.buffer = this._noise;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1900;
      f.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      s.connect(f);
      f.connect(g);
      g.connect(this.musBus);
      s.start(at);
      s.stop(at + 0.16);
    },

    _hat(at, vol) {
      const c = this.ctx;
      const s = c.createBufferSource();
      s.buffer = this._noise;
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7800;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
      s.connect(f);
      f.connect(g);
      g.connect(this.musBus);
      s.start(at);
      s.stop(at + 0.06);
    },

    _noiseBurst(at, dur, filterType, f0, f1, vol, dest) {
      const c = this.ctx;
      const s = c.createBufferSource();
      s.buffer = this._noise;
      const f = c.createBiquadFilter();
      f.type = filterType;
      f.frequency.setValueAtTime(f0, at);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), at + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      s.connect(f);
      f.connect(g);
      g.connect(dest || this.sfxBus);
      s.start(at);
      s.stop(at + dur + 0.02);
    },

    sweep(f0, f1, dur, type, vol, delay) {
      if (!this.ready) return;
      const at = this.ctx.currentTime + (delay || 0);
      const c = this.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + dur);
      g.gain.setValueAtTime(vol || 0.2, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(at);
      o.stop(at + dur + 0.02);
    },

    sfx(name) {
      if (!this.ready || !this.sfxOn) return;
      const now = this.ctx.currentTime;
      switch (name) {
        case 'jump':
          this.sweep(330, 720, 0.16, 'square', 0.14);
          break;
        case 'jumpBig':
          this.sweep(280, 900, 0.22, 'square', 0.16);
          break;
        case 'land':
          this._noiseBurst(now, 0.09, 'lowpass', 700, 220, 0.13);
          break;
        case 'coin':
          this._note(1046, now, 0.05, 'square', 0.12, this.sfxBus, 0.002, 0.1);
          this._note(1568, now + 0.06, 0.09, 'square', 0.12, this.sfxBus, 0.002, 0.16);
          break;
        case 'stomp':
          this.sweep(240, 60, 0.14, 'square', 0.2);
          this._noiseBurst(now, 0.1, 'lowpass', 1200, 200, 0.16);
          break;
        case 'hurt':
          this.sweep(520, 110, 0.34, 'sawtooth', 0.18);
          break;
        case 'die':
          [0, 0.12, 0.24, 0.4].forEach((d, i) =>
            this._note(660 / Math.pow(1.28, i), now + d, 0.12, 'square', 0.16, this.sfxBus, 0.004, 0.2)
          );
          break;
        case 'pop': {
          // 泡泡破掉：一声短促的「啵」
          this._note(880, now, 0.05, 'sine', 0.16, this.sfxBus, 0.001, 0.12);
          this._note(1320, now + 0.02, 0.07, 'triangle', 0.09, this.sfxBus, 0.001, 0.14);
          break;
        }
        case 'shoot':
          this.sweep(1000, 300, 0.09, 'square', 0.13);
          break;
        case 'ice':
          this._note(1760, now, 0.06, 'triangle', 0.14, this.sfxBus, 0.002, 0.12);
          this._note(2637, now + 0.03, 0.08, 'triangle', 0.1, this.sfxBus, 0.002, 0.16);
          break;
        case 'freeze':
          [0, 0.05, 0.1, 0.16].forEach((d, i) =>
            this._note(1200 + i * 420, now + d, 0.08, 'triangle', 0.1, this.sfxBus, 0.002, 0.14)
          );
          break;
        case 'throw':
          this.sweep(600, 220, 0.14, 'triangle', 0.12);
          break;
        case 'pickup':
          [523, 659, 784, 1046].forEach((f, i) =>
            this._note(f, now + i * 0.055, 0.08, 'square', 0.12, this.sfxBus, 0.003, 0.16)
          );
          break;
        case 'heal':
          [784, 988, 1319].forEach((f, i) =>
            this._note(f, now + i * 0.055, 0.12, 'triangle', 0.1, this.sfxBus, 0.004, 0.26)
          );
          this._note(2637, now + 0.02, 0.2, 'sine', 0.05, this.sfxBus, 0.006, 0.3);
          break;
        case 'power':
          [392, 523, 659, 784, 1046].forEach((f, i) =>
            this._note(f, now + i * 0.06, 0.1, 'triangle', 0.15, this.sfxBus, 0.003, 0.2)
          );
          break;
        case 'hammer':
          this._noiseBurst(now, 0.25, 'lowpass', 500, 80, 0.3);
          this.sweep(160, 44, 0.3, 'sine', 0.3);
          break;
        case 'boom':
          this._noiseBurst(now, 0.5, 'lowpass', 1400, 60, 0.34);
          this.sweep(220, 40, 0.4, 'sawtooth', 0.16);
          break;
        case 'roar':
          this.sweep(130, 62, 0.8, 'sawtooth', 0.24);
          this._noiseBurst(now, 0.7, 'bandpass', 300, 120, 0.12);
          break;
        case 'bossHit':
          this.sweep(300, 70, 0.16, 'square', 0.2);
          this._noiseBurst(now, 0.14, 'bandpass', 900, 200, 0.14);
          break;
        case 'checkpoint':
          [659, 880, 1046].forEach((f, i) =>
            this._note(f, now + i * 0.09, 0.14, 'triangle', 0.14, this.sfxBus, 0.003, 0.24)
          );
          break;
        case 'click':
          this._note(720, now, 0.03, 'square', 0.08, this.sfxBus, 0.001, 0.05);
          break;
        case 'pause':
          this._note(520, now, 0.05, 'triangle', 0.1, this.sfxBus, 0.002, 0.09);
          break;
        case 'clear': {
          const seq = [523, 659, 784, 1046, 784, 1046, 1318];
          seq.forEach((f, i) =>
            this._note(f, now + i * 0.12, 0.16, 'square', 0.15, this.sfxBus, 0.004, 0.3)
          );
          break;
        }
        case 'unlock':
          [523, 784, 1046, 1318].forEach((f, i) =>
            this._note(f, now + i * 0.07, 0.1, 'triangle', 0.14, this.sfxBus, 0.003, 0.2)
          );
          break;
      }
    },
  });
})(window.PH);
