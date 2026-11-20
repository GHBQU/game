/* ============================================================
 * 星野物语 — 程序化音效 (WebAudio) 与背景音乐
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G;
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let enabled = true, bgmTimer = null, bgmStep = 0;

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
    } catch (e) { ctx = null; }
  }

  function tone(freq, dur, type = 'square', vol = 0.2, when = 0, slideTo = null) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.15, when = 0, filterFreq = 1000) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = filterFreq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(flt); flt.connect(g); g.connect(sfxGain); src.start(t);
  }

  const SFX = {
    step() { noise(0.05, 0.045, 0, 700); },
    swing() { tone(420, 0.12, 'sawtooth', 0.12, 0, 120); noise(0.08, 0.06, 0, 2000); },
    hit() { tone(180, 0.1, 'square', 0.18, 0, 60); noise(0.1, 0.15, 0, 900); },
    hurt() { tone(300, 0.22, 'sawtooth', 0.2, 0, 70); },
    chop() { tone(220, 0.09, 'triangle', 0.16, 0, 90); noise(0.12, 0.12, 0, 1500); },
    mine() { tone(900, 0.06, 'square', 0.12); tone(500, 0.12, 'square', 0.1, 0.04); noise(0.15, 0.1, 0, 3000); },
    water() { noise(0.25, 0.1, 0, 2400); tone(600, 0.2, 'sine', 0.06, 0, 900); },
    plant() { tone(400, 0.08, 'sine', 0.12, 0, 600); },
    harvest() { [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.1, i * 0.06)); },
    coin() { [988, 1319].forEach((f, i) => tone(f, 0.1, 'square', 0.12, i * 0.05)); },
    levelup() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, i * 0.1)); },
    eat() { tone(300, 0.1, 'sine', 0.12, 0, 200); tone(200, 0.14, 'sine', 0.1, 0.1); },
    craft() { tone(600, 0.07, 'square', 0.1); tone(800, 0.07, 'square', 0.1, 0.08); tone(1000, 0.12, 'square', 0.1, 0.16); },
    enemyDie() { tone(250, 0.2, 'sawtooth', 0.15, 0, 50); noise(0.18, 0.1, 0, 600); },
    door() { tone(160, 0.15, 'triangle', 0.12, 0, 90); },
    magic() { tone(660, 0.25, 'sine', 0.1, 0, 1320); tone(990, 0.2, 'triangle', 0.06, 0.05, 1980); },
    phone() { tone(880, 0.08, 'sine', 0.1); tone(660, 0.08, 'sine', 0.1, 0.12); },
  };

  // 轻松的五声音阶旋律循环
  const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
  const MELODY = [0, 2, 4, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 2, 1, 0, 4, 5, 7, 6, 5, 4, 2, 1, 0, 2, 4, 2, 1, 0, 1, 2];
  function bgmTick() {
    if (!enabled || !ctx) return;
    const n = MELODY[bgmStep % MELODY.length];
    const f = SCALE[n];
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.45);
    // 每四拍加一个低音
    if (bgmStep % 4 === 0) {
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'sine'; b.frequency.value = SCALE[0] / 2;
      bg.gain.setValueAtTime(0.35, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      b.connect(bg); bg.connect(musicGain); b.start(t); b.stop(t + 0.5);
    }
    bgmStep++;
  }

  G.Audio = {
    init,
    play(name) { if (SFX[name]) SFX[name](); },
    startBgm() { init(); if (!ctx || bgmTimer) return; bgmStep = 0; bgmTimer = setInterval(bgmTick, 260); bgmTick(); },
    stopBgm() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } },
    setEnabled(v) {
      enabled = !!v;
      if (master) master.gain.value = enabled ? 0.5 : 0;
      if (enabled) this.startBgm(); else this.stopBgm();
    },
    isEnabled() { return enabled; },
    volume(v) { if (master) master.gain.value = v; },
  };
})(window);
