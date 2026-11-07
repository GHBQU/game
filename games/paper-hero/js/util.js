/* 纸片勇者 — 基础工具 */
window.PH = window.PH || {};
(function (PH) {
  const U = (PH.U = {});
  U.TAU = Math.PI * 2;
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.inv = (t) => 1 - t;
  U.sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
  U.rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  U.rndInt = (a, b) => Math.floor(U.rnd(a, b + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.easeOut = (t) => 1 - Math.pow(1 - t, 3);
  U.easeIn = (t) => t * t * t;
  U.easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
  U.easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  U.hit = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // 稳定的伪随机（用于纸张纹理，每次生成一致）
  U.mulberry = function (seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.hex = function (h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  U.rgba = function (h, a) {
    const c = U.hex(h);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  };
  U.mix = function (h1, h2, t) {
    const a = U.hex(h1), b = U.hex(h2);
    return `rgb(${Math.round(U.lerp(a[0], b[0], t))},${Math.round(U.lerp(a[1], b[1], t))},${Math.round(
      U.lerp(a[2], b[2], t)
    )})`;
  };

  U.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // 手绘抖动线：把一条直线拆成带随机偏移的折线
  U.wobbleLine = function (ctx, x1, y1, x2, y2, amp, seg, seedFn) {
    const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / seg));
    ctx.moveTo(x1, y1);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const px = U.lerp(x1, x2, t), py = U.lerp(y1, y2, t);
      const off = (i === n ? 0 : (seedFn() - 0.5) * amp);
      const nx = -(y2 - y1), ny = x2 - x1;
      const len = Math.hypot(nx, ny) || 1;
      ctx.lineTo(px + (nx / len) * off, py + (ny / len) * off);
    }
  };

  U.fmtTime = function (s) {
    s = Math.max(0, s);
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  };

  U.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('paperhero.' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('paperhero.' + k, JSON.stringify(v));
      } catch (e) {}
    },
    del(k) {
      try {
        localStorage.removeItem('paperhero.' + k);
      } catch (e) {}
    },
  };
})(window.PH);
