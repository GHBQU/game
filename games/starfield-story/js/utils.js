/* ============================================================
 * 星野物语 — 工具函数 / 常量
 * ============================================================ */
(function (global) {
  'use strict';
  const G = global.G = global.G || {};

  const U = G.U = {
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
    dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
    aabb(a, b) {
      return Math.abs(a.x - b.x) * 2 < (a.w || a.width || 16) + (b.w || b.width || 16) &&
             Math.abs(a.y - b.y) * 2 < (a.h || a.height || 16) + (b.h || b.height || 16);
    },
    rand(a = 1, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); },
    randInt(a = 0, b = 1) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    chance(p) { return Math.random() < p; },
    shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    // 稳定哈希（用于程序化贴图）
    hash(x, y, seed = 0) {
      let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    },
    // 简易值噪声
    noise(x, y, seed = 0) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return U.lerp(U.lerp(U.hash(xi, yi, seed), U.hash(xi + 1, yi, seed), u),
                   U.lerp(U.hash(xi, yi + 1, seed), U.hash(xi + 1, yi + 1, seed), u), v);
    },
    fbm(x, y, seed = 0) {
      let v = 0, a = 0.5, f = 1;
      for (let i = 0; i < 4; i++) { v += a * U.noise(x * f, y * f, seed + i * 17); f *= 2; a *= 0.5; }
      return v;
    },
    // 方向：8 向
    dir8(dx, dy) {
      if (Math.abs(dx) > Math.abs(dy) * 1.6) return dx > 0 ? 'right' : 'left';
      if (Math.abs(dy) > Math.abs(dx) * 1.6) return dy > 0 ? 'down' : 'up';
      if (dx > 0 && dy < 0) return 'up-right';
      if (dx < 0 && dy < 0) return 'up-left';
      if (dx > 0 && dy > 0) return 'down-right';
      if (dx < 0 && dy > 0) return 'down-left';
      return 'down';
    },
    fmtTime(minutes) {
      const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },
    save(key, data) {
      try { localStorage.setItem('starfield_' + key, JSON.stringify(data)); return true; }
      catch (e) { console.warn('save failed', e); return false; }
    },
    load(key, fallback = null) {
      try { const s = localStorage.getItem('starfield_' + key); return s ? JSON.parse(s) : fallback; }
      catch (e) { return fallback; }
    },
    hasSave(key) {
      try { return !!localStorage.getItem('starfield_' + key); }
      catch (e) { return false; }
    },
    uid() { return Math.random().toString(36).slice(2, 10); },
  };

  // 全局常量
  G.C = {
    TILE: 16,
    MAP_W: 128,
    MAP_H: 128,
    DAY_MINUTES: 1440,
    SEASONS: ['春', '夏', '秋', '冬'],
    WEATHERS: ['晴', '多云', '雨', '雷雨', '雪', '雾'],
    LOCATIONS: ['星野村', '翠穗草原', '幽暗矿洞', '枫叶森林', '霜雪高地', '星落湖畔'],
  };
})(window);
