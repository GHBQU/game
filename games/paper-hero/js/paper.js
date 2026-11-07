/* 纸片勇者 — 纸艺美术系统：纸纹理、地块、背景、UI 组件 */
(function (PH) {
  const U = PH.U;
  const F = (PH.Fonts = {
    ui: '"Yuanti SC","Hiragino Sans GB","PingFang SC","Microsoft YaHei",sans-serif',
    hand: '"Kaiti SC","STKaiti","KaiTi","Songti SC",serif',
    mono: '"SF Mono","Menlo",monospace',
  });

  const THEMES = {
    meadow: {
      sky: ['#CDE8E0', '#E9F2DC', '#FAF2DC'],
      far: '#BCD4B0', far2: '#A5C59C', mid: '#8FBA88', mid2: '#6E9C6C',
      grass: '#7DB447', grass2: '#67993A', grassDark: '#436B24',
      dirt: '#D7A87A', dirt2: '#C08F60', dirtDark: '#8A5F3C',
      brick: '#D08D72', brick2: '#B36E57', stone: '#BDAD97', stone2: '#9C8E7C',
      plank: '#E3B173', plank2: '#B9833F', wood: '#C98F55',
      outline: '#3E2C1F', sun: '#F8D27E', accent: '#D9604C', fog: '#FAF2DC',
      haze: 'rgba(255,246,220,0.55)',
    },
    cave: {
      sky: ['#2E2742', '#3F3655', '#524768'],
      far: '#3C3254', far2: '#4B4066', mid: '#332B49', mid2: '#262036',
      grass: '#91849C', grass2: '#726680', grassDark: '#3A3050',
      dirt: '#726880', dirt2: '#5E5470', dirtDark: '#38304C',
      brick: '#73646A', brick2: '#584A56', stone: '#877C8E', stone2: '#6A6076',
      plank: '#A3875F', plank2: '#6E5941', wood: '#8A7150',
      outline: '#151020', sun: '#8FE3EE', accent: '#8CE0EC', crystal: '#8CE0EC', fog: '#262036',
      haze: 'rgba(120,90,170,0.18)',
    },
    courtyard: {
      sky: ['#FFD89A', '#F5A874', '#C9786E', '#8A5A6A'],
      far: '#E2AC8B', far2: '#D0947A', mid: '#B67F74', mid2: '#94615E',
      grass: '#DDA953', grass2: '#C08A3F', grassDark: '#80552A',
      dirt: '#B27C50', dirt2: '#95653F', dirtDark: '#603D26',
      brick: '#CE7F63', brick2: '#A65946', stone: '#CDB59B', stone2: '#A78F79',
      plank: '#E7B071', plank2: '#B98442', wood: '#BE8248',
      outline: '#3E2118', sun: '#FFE6A8', accent: '#E0563F', fog: '#F6DDB6',
      haze: 'rgba(255,214,170,0.55)',
    },
    nest: {
      sky: ['#2A1B38', '#3F2749', '#512F4C', '#2E1C30'],
      far: '#42294A', far2: '#503252', mid: '#311E38', mid2: '#231428',
      grass: '#8A7683', grass2: '#6E5A66', grassDark: '#3A2534',
      dirt: '#69505F', dirt2: '#543D4C', dirtDark: '#301F2E',
      brick: '#78545E', brick2: '#5C404A', stone: '#8E7A86', stone2: '#6F5C68',
      plank: '#A8846A', plank2: '#725646', wood: '#87624C',
      outline: '#170D18', sun: '#B6F0A8', accent: '#9CE87A', crystal: '#C48CF0', fog: '#2A1A2C',
      haze: 'rgba(120,255,150,0.10)',
    },
  };
  PH.THEMES = THEMES;

  // ---------- 纸张纹理 ----------
  function paperTexture(w, h, base, seed) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    const rng = U.mulberry(seed);
    x.fillStyle = base;
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 240; i++) {
      const px = rng() * w, py = rng() * h;
      const len = 3 + rng() * 12, ang = rng() * Math.PI;
      x.strokeStyle = rng() > 0.5 ? 'rgba(255,255,255,0.40)' : 'rgba(120,100,70,0.09)';
      x.lineWidth = 0.7;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      x.stroke();
    }
    for (let i = 0; i < (w * h) / 4600; i++) {
      const px = rng() * w, py = rng() * h, r = 1 + rng() * 3;
      x.fillStyle = 'rgba(150,125,90,' + (0.03 + rng() * 0.05) + ')';
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    }
    return c;
  }

  function roughRect(ctx, x, y, w, h, amp, seed) {
    const rng = U.mulberry(seed);
    const pts = [];
    const edge = (x1, y1, x2, y2) => {
      const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 9));
      const nx = -(y2 - y1), ny = x2 - x1;
      const len = Math.hypot(nx, ny) || 1;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const off = i === n ? 0 : (rng() - 0.5) * amp;
        pts.push([U.lerp(x1, x2, t) + (nx / len) * off, U.lerp(y1, y2, t) + (ny / len) * off]);
      }
    };
    edge(x, y, x + w, y);
    edge(x + w, y, x + w, y + h);
    edge(x + w, y + h, x, y + h);
    edge(x, y + h, x, y);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
  }

  const texCache = {};
  function texFor(seed, size) {
    size = size || 180;
    const k = size + ':' + seed;
    if (!texCache[k]) texCache[k] = paperTexture(size, size, 'rgba(255,255,255,0)', seed);
    return texCache[k];
  }

  function hatch(ctx, x, y, w, h, rng, n, col, len) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const px = x + rng() * w, py = y + rng() * h;
      const a = -1.0 + rng() * 0.6;
      const l = (len || 7) * (0.5 + rng());
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
      ctx.stroke();
    }
  }

  // ---------- 土体纹理（可平铺） ----------
  const DIRT_SIZE = 128;
  const dirtCache = {};
  function dirtTexture(themeName) {
    if (dirtCache[themeName]) return dirtCache[themeName];
    const th = THEMES[themeName];
    const S = DIRT_SIZE;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    const rng = U.mulberry(themeName.length * 131 + 7);
    g.fillStyle = th.dirt;
    g.fillRect(0, 0, S, S);
    // 色块
    const wrap = (fn) => {
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          g.save();
          g.translate(ox * S, oy * S);
          fn();
          g.restore();
        }
    };
    for (let i = 0; i < 26; i++) {
      const x = rng() * S, y = rng() * S, r = 8 + rng() * 22;
      const col = rng() > 0.5 ? th.dirt2 : th.dirtDark;
      wrap(() => {
        g.globalAlpha = 0.07 + rng() * 0.07;
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(x, y, r, r * (0.5 + rng() * 0.5), rng() * 3, 0, 7);
        g.fill();
      });
    }
    // 小石子
    const pale = themeName === 'cave' || themeName === 'nest' ? 0.5 : 1;
    for (let i = 0; i < 40; i++) {
      const x = rng() * S, y = rng() * S, r = 1 + rng() * 2.6;
      wrap(() => {
        g.globalAlpha = (0.18 + rng() * 0.22) * pale;
        g.fillStyle = rng() > 0.55 ? '#F3E4C8' : th.dirtDark;
        g.beginPath();
        g.ellipse(x, y, r, r * 0.8, rng() * 3, 0, 7);
        g.fill();
      });
    }
    // 纤细的纤维
    g.globalAlpha = 0.1;
    for (let i = 0; i < 30; i++) {
      const x = rng() * S, y = rng() * S, len = 4 + rng() * 14;
      g.strokeStyle = '#FFF3DA';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + len, y + (rng() - 0.5) * 3);
      g.stroke();
    }
    g.globalAlpha = 1;
    dirtCache[themeName] = { canvas: c, pattern: null };
    return dirtCache[themeName];
  }

  // ---------- 独立地块 ----------
  const TS = 64;
  const TILE_VARIANTS = 4;

  function paintBrick(g, th, rng) {
    const bw = TS / 2, bh = TS / 2;
    g.fillStyle = th.dirtDark;
    g.fillRect(0, 0, TS, TS);
    for (let row = 0; row < 2; row++) {
      const off = row % 2 ? -bw / 2 : 0;
      for (let i = -1; i < 3; i++) {
        const x = off + i * bw + 2.5;
        const y = row * bh + 2.5;
        g.fillStyle = i % 2 === row % 2 ? th.brick : th.brick2;
        g.globalAlpha = 0.92 + rng() * 0.08;
        roughRect(g, x, y, bw - 5, bh - 5, 1.4, (rng() * 1e6) | 0);
        g.fill();
        g.globalAlpha = 0.35;
        g.strokeStyle = '#FFF0D6';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x + 2, y + 2.5);
        g.lineTo(x + bw - 8, y + 2.5);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }

  function paintStone(g, th, rng) {
    g.fillStyle = th.dirtDark;
    g.fillRect(0, 0, TS, TS);
    // 方形石块，边缘带缺口
    const r2 = U.mulberry((rng() * 1e6) | 0);
    g.beginPath();
    const pts = [];
    const n = 4;
    const ins = 2.5;
    const corners = [
      [ins, ins], [TS - ins, ins], [TS - ins, TS - ins], [ins, TS - ins],
    ];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      for (let k = 0; k < 6; k++) {
        const t = k / 6;
        const jx = (r2() - 0.5) * 2.6;
        const jy = (r2() - 0.5) * 2.6;
        pts.push([U.lerp(a[0], b[0], t) + (i % 2 === 0 ? 0 : jx), U.lerp(a[1], b[1], t) + (i % 2 === 0 ? jy : 0)]);
      }
    }
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) g.lineTo(p[0], p[1]);
    g.closePath();
    g.fillStyle = th.stone;
    g.fill();
    // 斜面
    g.globalAlpha = 0.4;
    g.fillStyle = '#FBF3DE';
    g.beginPath();
    g.moveTo(ins + 2, ins + 2);
    g.lineTo(TS - ins - 2, ins + 2);
    g.lineTo(TS - ins - 2, ins + 6);
    g.lineTo(ins + 2, ins + 7);
    g.closePath();
    g.fill();
    g.globalAlpha = 0.28;
    g.fillStyle = th.stone2;
    g.beginPath();
    g.moveTo(ins + 2, TS - ins - 1);
    g.lineTo(TS - ins - 2, TS - ins - 1);
    g.lineTo(TS - ins - 2, TS - ins - 7);
    g.lineTo(ins + 2, TS - ins - 6);
    g.closePath();
    g.fill();
    g.globalAlpha = 0.16;
    hatch(g, 10, 10, TS - 20, TS - 20, rng, 8, th.stone2, 9);
    g.globalAlpha = 1;
  }

  function paintPlank(g, th, rng) {
    g.fillStyle = th.plank2;
    g.fillRect(0, 0, TS, TS);
    g.fillStyle = th.plank;
    g.fillRect(2, 3, TS - 4, TS - 9);
    g.globalAlpha = 0.5;
    g.strokeStyle = th.plank2;
    g.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const y = 12 + i * 16 + rng() * 3;
      g.beginPath();
      g.moveTo(4, y);
      g.bezierCurveTo(TS * 0.3, y + 2, TS * 0.6, y - 2, TS - 4, y + 1);
      g.stroke();
    }
    g.globalAlpha = 0.55;
    g.strokeStyle = '#FFF1D2';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(3, 5);
    g.lineTo(TS - 3, 5);
    g.stroke();
    g.globalAlpha = 0.35;
    g.fillStyle = th.outline;
    g.fillRect(2, TS - 7, TS - 4, 3);
    g.globalAlpha = 1;
    g.fillStyle = th.outline;
    g.globalAlpha = 0.55;
    g.beginPath();
    g.arc(9, TS / 2 + 2, 2.2, 0, 7);
    g.arc(TS - 9, TS / 2 + 2, 2.2, 0, 7);
    g.fill();
    g.globalAlpha = 1;
  }

  function paintSpike(g, th, rng) {
    // 底座
    g.fillStyle = U.rgba(th.outline, 0.55);
    g.fillRect(0, TS - 8, TS, 8);
    for (let i = 0; i < 2; i++) {
      const bx = 3 + i * 30;
      const grd = g.createLinearGradient(bx, 0, bx + 26, 0);
      grd.addColorStop(0, '#D9D2C6');
      grd.addColorStop(0.45, '#8E8680');
      grd.addColorStop(1, '#5C554F');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(bx, TS - 6);
      g.lineTo(bx + 14, 6);
      g.lineTo(bx + 28, TS - 6);
      g.closePath();
      g.fill();
      g.strokeStyle = th.outline;
      g.globalAlpha = 0.8;
      g.lineWidth = 2.6;
      g.stroke();
      g.globalAlpha = 1;
      // 高光
      g.strokeStyle = '#FFF6E4';
      g.globalAlpha = 0.7;
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(bx + 11, TS - 14);
      g.lineTo(bx + 13.5, 12);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  function paintWoodTile(g, th, rng) {
    g.fillStyle = th.wood;
    g.fillRect(0, 0, TS, TS);
    g.strokeStyle = th.plank2;
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const x = 6 + i * 16 + rng() * 2;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 2, TS * 0.3, x - 2, TS * 0.7, x + 1, TS);
      g.stroke();
    }
    g.globalAlpha = 0.22;
    g.strokeStyle = th.outline;
    g.lineWidth = 2;
    g.strokeRect(1, 1, TS - 2, TS - 2);
    g.globalAlpha = 1;
  }

  function buildTileSheets(themeName) {
    const th = THEMES[themeName];
    const types = ['brick', 'stone', 'plank', 'spike', 'wood'];
    const painters = {
      brick: paintBrick,
      stone: paintStone,
      plank: paintPlank,
      spike: paintSpike,
      wood: paintWoodTile,
    };
    const sheet = document.createElement('canvas');
    sheet.width = TS * TILE_VARIANTS;
    sheet.height = TS * types.length;
    const g = sheet.getContext('2d');
    const idx = {};
    types.forEach((type, ti) => {
      idx[type] = ti;
      for (let v = 0; v < TILE_VARIANTS; v++) {
        g.save();
        g.translate(v * TS, ti * TS);
        g.beginPath();
        g.rect(0, 0, TS, TS);
        g.clip();
        painters[type](g, th, U.mulberry(ti * 977 + v * 131 + 7));
        g.restore();
      }
    });
    return { canvas: sheet, idx };
  }

  // ---------- 背景 ----------
  function hillPath(g, w, h, baseY, amp, seed, step) {
    const rng = U.mulberry(seed);
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, baseY);
    let x = 0;
    while (x < w) {
      const nx = x + step * (0.7 + rng() * 0.6);
      const cy = baseY - amp * (0.4 + rng() * 0.8);
      g.quadraticCurveTo((x + nx) / 2, cy, nx, baseY - amp * 0.15 * rng());
      x = nx;
    }
    g.lineTo(w, h);
    g.closePath();
  }

  function tree(g, x, y, s, col, rng, dark) {
    const h = s * 0.5;
    // 树干
    g.fillStyle = 'rgba(90,64,42,0.55)';
    g.fillRect(x - s * 0.05, y - h * 0.35, s * 0.1, h * 0.4);
    // 影子
    g.fillStyle = dark || 'rgba(0,0,0,0.10)';
    g.beginPath();
    g.ellipse(x, y + 2, s * 0.26, s * 0.07, 0, 0, 7);
    g.fill();
    // 树冠
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y - h * 0.9, s * 0.4, 0, 7);
    g.arc(x - s * 0.26, y - h * 0.6, s * 0.29, 0, 7);
    g.arc(x + s * 0.27, y - h * 0.64, s * 0.3, 0, 7);
    g.fill();
    // 顶部受光
    g.globalAlpha = 0.22;
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.arc(x - s * 0.1, y - h * 1.05, s * 0.16, 0, 7);
    g.fill();
    g.globalAlpha = 1;
  }

  function buildSky(themeName) {
    const th = THEMES[themeName];
    const c = document.createElement('canvas');
    c.width = 960;
    c.height = 544;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 544);
    th.sky.forEach((col, i) => grd.addColorStop(i / (th.sky.length - 1), col));
    g.fillStyle = grd;
    g.fillRect(0, 0, 960, 544);

    const dark = themeName === 'cave' || themeName === 'nest';
    const sx = 210, sy = 116;
    if (dark) {
      const rg = g.createRadialGradient(sx, sy, 10, sx, sy, 460);
      rg.addColorStop(0, U.rgba(th.sun, 0.22));
      rg.addColorStop(1, U.rgba(th.sun, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, 960, 544);
      // 洞顶
      const rng = U.mulberry(themeName === 'nest' ? 77 : 55);
      g.fillStyle = U.rgba('#120C1C', 0.92);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(960, 0);
      g.lineTo(960, 54);
      for (let x = 960; x > 0; x -= 26) {
        g.lineTo(x, 54 + rng() * 22);
      }
      g.closePath();
      g.fill();
      // 钟乳石
      for (let i = 0; i < 14; i++) {
        const x = 24 + i * 70 + rng() * 26;
        const w = 16 + rng() * 26;
        const hh = 24 + rng() * 86;
        g.fillStyle = U.rgba('#211832', 0.88);
        g.beginPath();
        g.moveTo(x - w / 2, 58);
        g.quadraticCurveTo(x - w / 6, 58 + hh * 0.6, x, 58 + hh);
        g.quadraticCurveTo(x + w / 6, 58 + hh * 0.6, x + w / 2, 58);
        g.closePath();
        g.fill();
        g.globalAlpha = 0.18;
        g.fillStyle = th.sun;
        g.beginPath();
        g.moveTo(x - 1, 62);
        g.quadraticCurveTo(x - 2, 62 + hh * 0.5, x, 58 + hh * 0.9);
        g.lineTo(x + 2, 62);
        g.fill();
        g.globalAlpha = 1;
      }
    } else {
      const rg = g.createRadialGradient(sx, sy, 20, sx, sy, 400);
      rg.addColorStop(0, U.rgba(th.sun, 0.42));
      rg.addColorStop(1, U.rgba(th.sun, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, 960, 544);
      // 纸太阳
      g.fillStyle = U.rgba('#FFF3D2', 0.85);
      g.beginPath();
      g.arc(sx + 3, sy + 4, 50, 0, 7);
      g.fill();
      g.fillStyle = th.sun;
      g.beginPath();
      g.arc(sx, sy, 46, 0, 7);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(sx, sy, 51, 0.7, 2.3);
      g.stroke();
      g.strokeStyle = U.rgba(th.sun, 0.5);
      g.lineWidth = 4;
      g.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.25;
        g.beginPath();
        g.moveTo(sx + Math.cos(a) * 60, sy + Math.sin(a) * 60);
        g.lineTo(sx + Math.cos(a) * (72 + (i % 3) * 9), sy + Math.sin(a) * (72 + (i % 3) * 9));
        g.stroke();
      }
    }
    // 纸纹
    const tex = paperTexture(200, 200, 'rgba(255,255,255,0)', 11);
    g.globalAlpha = 0.45;
    for (let y = 0; y < 544; y += 200) for (let x = 0; x < 960; x += 200) g.drawImage(tex, x, y);
    g.globalAlpha = 1;
    return c;
  }

  function buildFar(themeName) {
    const th = THEMES[themeName];
    const W = 1920, H = 340;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const rng = U.mulberry(31);
    if (themeName === 'cave' || themeName === 'nest') {
      for (let i = 0; i < 16; i++) {
        const x = (i / 16) * W + rng() * 60;
        const w = 60 + rng() * 90;
        const hh = 150 + rng() * 90;
        g.fillStyle = U.rgba(th.far, 0.75);
        g.beginPath();
        g.moveTo(x - w / 2, H);
        g.quadraticCurveTo(x - w * 0.32, hh, x, hh - 20);
        g.quadraticCurveTo(x + w * 0.32, hh, x + w / 2, H);
        g.closePath();
        g.fill();
        g.globalAlpha = 0.18;
        g.fillStyle = th.sun;
        g.beginPath();
        g.arc(x, hh + 10, w * 0.22, 0, 7);
        g.fill();
        g.globalAlpha = 1;
      }
      for (let i = 0; i < 14; i++) {
        const x = (i / 14) * W + rng() * 80;
        const r = 60 + rng() * 120;
        g.fillStyle = U.rgba(th.far2, 0.7);
        g.beginPath();
        g.arc(x, H - 6, r, Math.PI, 0);
        g.fill();
      }
    } else {
      // 三层纸山
      g.fillStyle = U.rgba(th.far, 0.55);
      hillPath(g, W, H, 175, 150, 3, 170);
      g.fill();
      g.fillStyle = th.far;
      hillPath(g, W, H, 225, 110, 9, 140);
      g.fill();
      // 山顶白边
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 3;
      hillPath(g, W, H, 225, 110, 9, 140);
      g.stroke();
      g.fillStyle = th.far2;
      hillPath(g, W, H, 285, 70, 17, 110);
      g.fill();
      for (let i = 0; i < 26; i++) {
        const x = rng() * W;
        const y = H - 20 - rng() * 30;
        tree(g, x, y, 14 + rng() * 14, U.rgba(th.far2, 0.9), rng, U.rgba(th.far, 0.4));
      }
      // 地平线雾气
      const hz = g.createLinearGradient(0, H - 90, 0, H);
      hz.addColorStop(0, 'rgba(255,248,226,0)');
      hz.addColorStop(1, th.haze);
      g.fillStyle = hz;
      g.fillRect(0, H - 90, W, 90);
    }
    return c;
  }

  function buildMid(themeName) {
    const th = THEMES[themeName];
    const W = 1920, H = 250;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const rng = U.mulberry(19);
    if (themeName === 'cave' || themeName === 'nest') {
      g.fillStyle = th.mid;
      hillPath(g, W, H, 165, 70, 5, 130);
      g.fill();
      for (let i = 0; i < 20; i++) {
        const x = rng() * W, y = 150 + rng() * 70, s = 6 + rng() * 16;
        g.fillStyle = U.rgba(th.accent, 0.35 + rng() * 0.35);
        g.beginPath();
        g.moveTo(x, y - s * 1.9);
        g.lineTo(x + s * 0.55, y);
        g.lineTo(x - s * 0.55, y);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 0.5;
      for (let i = 0; i < 30; i++) {
        const x = rng() * W, y = rng() * H;
        g.fillStyle = U.rgba(th.accent, 0.25);
        g.beginPath();
        g.arc(x, y, 1.6, 0, 7);
        g.fill();
      }
      g.globalAlpha = 1;
    } else {
      g.fillStyle = th.mid;
      hillPath(g, W, H, 120, 66, 12, 140);
      g.fill();
      // 风车
      for (let i = 0; i < 3; i++) {
        const wx = 180 + i * 620 + rng() * 120;
        const wy = 150;
        g.fillStyle = U.rgba(th.mid2, 0.55);
        g.beginPath();
        g.moveTo(wx - 9, wy + 34);
        g.lineTo(wx - 5, wy - 4);
        g.lineTo(wx + 5, wy - 4);
        g.lineTo(wx + 9, wy + 34);
        g.closePath();
        g.fill();
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          g.save();
          g.translate(wx, wy - 6);
          g.rotate(a);
          g.fillStyle = U.rgba(th.mid2, 0.45);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(26, -6);
          g.lineTo(26, 6);
          g.closePath();
          g.fill();
          g.restore();
        }
      }
      // 地平线树丛
      for (let i = 0; i < 18; i++) {
        const x = rng() * W;
        const y = 148 + rng() * 46;
        tree(g, x, y, 22 + rng() * 20, i % 3 ? th.mid2 : th.mid, rng, 'rgba(40,60,30,0.14)');
      }
      // 近地平线灌木
      for (let i = 0; i < 30; i++) {
        const x = rng() * W, y = 196 + rng() * 26;
        g.fillStyle = U.rgba(th.mid2, 0.5);
        g.beginPath();
        g.arc(x, y, 8 + rng() * 9, Math.PI, 0);
        g.fill();
      }
      // 小灌木
      for (let i = 0; i < 18; i++) {
        const x = rng() * W, y = 200 + rng() * 40;
        g.fillStyle = U.rgba(th.mid2, 0.6);
        g.beginPath();
        g.arc(x, y, 9 + rng() * 7, Math.PI, 0);
        g.fill();
      }
      const hz = g.createLinearGradient(0, H - 70, 0, H);
      hz.addColorStop(0, 'rgba(255,248,226,0)');
      hz.addColorStop(1, U.rgba('#FFEFCF', 0.35));
      g.fillStyle = hz;
      g.fillRect(0, H - 70, W, 70);
    }
    return c;
  }

  function cloudShape(g, x, y, s, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, s * 0.52, 0, 7);
    g.arc(x + s * 0.5, y - s * 0.16, s * 0.4, 0, 7);
    g.arc(x - s * 0.48, y - s * 0.02, s * 0.34, 0, 7);
    g.arc(x + s * 0.1, y + s * 0.2, s * 0.36, 0, 7);
    g.fill();
  }

  function buildClouds(themeName) {
    const th = THEMES[themeName];
    const W = 1920, H = 260;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const rng = U.mulberry(23);
    const dark = themeName === 'cave' || themeName === 'nest';
    for (let i = 0; i < 8; i++) {
      const x = rng() * W;
      const y = 40 + rng() * 130;
      const s = 52 + rng() * 58;
      g.save();
      if (dark) {
        g.globalAlpha = 0.14;
        cloudShape(g, x, y, s, th.far2);
      } else {
        g.globalAlpha = 0.28;
        cloudShape(g, x + 6, y + 10, s, 'rgba(150,130,100,0.5)');
        g.globalAlpha = 0.94;
        cloudShape(g, x, y, s, '#FDF8EA');
        g.globalAlpha = 0.5;
        g.fillStyle = '#FFFFFF';
        g.beginPath();
        g.arc(x - s * 0.16, y - s * 0.22, s * 0.3, 0, 7);
        g.fill();
      }
      g.restore();
    }
    return c;
  }

  function buildFore(themeName) {
    const th = THEMES[themeName];
    const W = 1920, H = 90;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const rng = U.mulberry(41);
    if (themeName === 'cave' || themeName === 'nest') {
      for (let i = 0; i < 34; i++) {
        const x = rng() * W, hh = 16 + rng() * 34;
        g.fillStyle = U.rgba(th.mid2, 0.85);
        g.beginPath();
        g.moveTo(x, H);
        g.lineTo(x + 7, H - hh);
        g.lineTo(x + 15, H);
        g.closePath();
        g.fill();
      }
    } else {
      for (let i = 0; i < 70; i++) {
        const x = rng() * W;
        const hh = 12 + rng() * 26;
        g.strokeStyle = i % 3 ? U.rgba(th.grass2, 0.8) : U.rgba(th.grass, 0.8);
        g.lineWidth = 3 + rng() * 2.4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, H);
        g.quadraticCurveTo(x + (rng() - 0.5) * 16, H - hh * 0.6, x + (rng() - 0.5) * 24, H - hh);
        g.stroke();
      }
    }
    return c;
  }

  const bgCache = {};
  function getBg(themeName) {
    if (!bgCache[themeName]) {
      bgCache[themeName] = {
        sky: buildSky(themeName),
        far: buildFar(themeName),
        mid: buildMid(themeName),
        clouds: buildClouds(themeName),
        fore: buildFore(themeName),
      };
    }
    return bgCache[themeName];
  }

  // ---------- 木地板 ----------
  const woodCache = {};
  function woodTexture(themeName) {
    if (woodCache[themeName]) return woodCache[themeName];
    const th = THEMES[themeName];
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    const rng = U.mulberry(themeName.length * 77 + 3);
    g.fillStyle = th.wood;
    g.fillRect(0, 0, S, S);
    // 横向木纹
    for (let i = 0; i < 34; i++) {
      const y = rng() * S;
      const x0 = rng() * S;
      const len = 20 + rng() * 70;
      g.strokeStyle = rng() > 0.5 ? U.rgba(th.plank2, 0.35) : U.rgba('#FFF0D2', 0.28);
      g.lineWidth = 1 + rng();
      g.beginPath();
      g.moveTo(x0, y);
      g.bezierCurveTo(x0 + len * 0.3, y + 1.5, x0 + len * 0.6, y - 1.5, x0 + len, y + 0.5);
      g.stroke();
    }
    // 深色缝隙
    for (let i = 0; i < 4; i++) {
      const y = i * 32 + 2;
      g.strokeStyle = U.rgba(th.dirtDark, 0.35);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(S, y);
      g.stroke();
    }
    woodCache[themeName] = { canvas: c, pattern: null };
    return woodCache[themeName];
  }

  const P = (PH.Paper = {
    TILE: 32,
    TS,
    themes: THEMES,
    tiles: {},
    tilesFor(themeName) {
      if (!this.tiles[themeName]) this.tiles[themeName] = buildTileSheets(themeName);
      return this.tiles[themeName];
    },
    getBg,
    paperTexture,
    roughRect,
    hatch,
    cloudShape,
    hillPath,
    tree,

    drawBackdrop(ctx, themeName, camX, camY, t, levelW) {
      const bg = getBg(themeName);
      ctx.drawImage(bg.sky, 0, 0);
      const wrap = (img, factor, y, alpha) => {
        const w = img.width;
        let ox = -(camX * factor) % w;
        if (ox > 0) ox -= w;
        ctx.globalAlpha = alpha === undefined ? 1 : alpha;
        for (let x = ox; x < 960; x += w) ctx.drawImage(img, x, y);
        ctx.globalAlpha = 1;
      };
      wrap(bg.clouds, 0.1, 20, 1);
      wrap(bg.far, 0.18, 130);
      wrap(bg.mid, 0.36, 215);
    },

    drawFore(ctx, themeName, camX, camY) {
      const bg = getBg(themeName);
      const img = bg.fore;
      const y = 544 - img.height + 4;
      let ox = -(camX * 1.15) % img.width;
      if (ox > 0) ox -= img.width;
      ctx.globalAlpha = 0.9;
      for (let x = ox; x < 960; x += img.width) ctx.drawImage(img, x, y);
      ctx.globalAlpha = 1;
    },

    // 连续土体
    fillDirt(ctx, themeName, x, y, w, h) {
      const d = dirtTexture(themeName);
      if (!d.pattern) d.pattern = ctx.createPattern(d.canvas, 'repeat');
      ctx.save();
      ctx.fillStyle = d.pattern;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    },

    fillWood(ctx, themeName, x, y, w, h) {
      const d = woodTexture(themeName);
      if (!d.pattern) d.pattern = ctx.createPattern(d.canvas, 'repeat');
      ctx.save();
      ctx.fillStyle = d.pattern;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    },

    drawWoodCap(ctx, themeName, tx, ty) {
      const th = THEMES[themeName];
      const T = 32;
      const x = tx * T, y = ty * T;
      const rng = U.mulberry(tx * 613 + 17);
      // 顶板
      const g1 = ctx.createLinearGradient(0, y, 0, y + 10);
      g1.addColorStop(0, U.rgba('#FFE9C0', 0.6));
      g1.addColorStop(1, U.rgba(th.plank, 0.9));
      ctx.fillStyle = g1;
      ctx.fillRect(x, y - 1, T, 9);
      // 高光
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#FFF6DC';
      ctx.fillRect(x, y - 1, T, 2);
      ctx.globalAlpha = 1;
      // 缝
      ctx.strokeStyle = U.rgba(th.dirtDark, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x + T, y + 8);
      ctx.stroke();
      // 钉
      ctx.fillStyle = U.rgba(th.dirtDark, 0.45);
      ctx.beginPath();
      ctx.arc(x + 6, y + 3.5, 1.5, 0, 7);
      ctx.arc(x + 26, y + 3.5, 1.5, 0, 7);
      ctx.fill();
    },

    // 草皮边缘（每个地块列一条）
    drawGrassCap(ctx, themeName, tx, ty) {
      const th = THEMES[themeName];
      const T = 32;
      const x = tx * T, y = ty * T;
      const rng = U.mulberry(tx * 977 + 41);
      const dark = themeName === 'cave' || themeName === 'nest';
      if (dark) {
        // 岩石边缘
        const bot = [];
        for (let i = 0; i <= 4; i++) bot.push(y + 9 + rng() * 6);
        ctx.beginPath();
        ctx.moveTo(x - 1, y + 0.5);
        for (let i = 0; i <= 5; i++) ctx.lineTo(x + (i / 5) * T, y + 0.5 + rng() * 4);
        ctx.lineTo(x + T + 1, y + 4);
        for (let i = 4; i >= 0; i--) ctx.lineTo(x + (i / 4) * T, bot[i]);
        ctx.closePath();
        const gg2 = ctx.createLinearGradient(0, y, 0, y + 16);
        gg2.addColorStop(0, th.grass);
        gg2.addColorStop(1, th.grass2);
        ctx.fillStyle = gg2;
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#E6DAF0';
        ctx.beginPath();
        ctx.moveTo(x, y + 1);
        for (let i = 0; i <= 5; i++) ctx.lineTo(x + (i / 5) * T, y + 1 + rng() * 2.5);
        ctx.lineTo(x + T, y + 5);
        ctx.lineTo(x, y + 5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        // 小晶簇
        if (rng() > 0.9) {
          const cxx = x + 8 + rng() * 14;
          ctx.fillStyle = U.rgba(th.crystal || th.accent, 0.45);
          ctx.beginPath();
          ctx.moveTo(cxx, y - 7);
          ctx.lineTo(cxx + 4, y - 2);
          ctx.lineTo(cxx, y + 2);
          ctx.lineTo(cxx - 4, y - 2);
          ctx.closePath();
          ctx.fill();
        }
        return;
      }
      // 草叶
      for (let i = 0; i < 6; i++) {
        const bx = x + 2 + i * 5.6 + rng() * 2;
        const bh = 8 + rng() * 11;
        ctx.strokeStyle = i % 2 ? th.grass : th.grass2;
        ctx.lineWidth = 2.4 + rng() * 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx, y + 7);
        ctx.quadraticCurveTo(bx + (rng() - 0.5) * 8, y + 2 - bh * 0.45, bx + (rng() - 0.5) * 12, y + 2 - bh);
        ctx.stroke();
      }
      // 草皮块
      const bot = [];
      for (let i = 0; i <= 4; i++) bot.push(y + 12 + rng() * 5);
      ctx.beginPath();
      ctx.moveTo(x - 1, y + 0.5);
      ctx.lineTo(x + T + 1, y + 0.5);
      for (let i = 4; i >= 0; i--) ctx.lineTo(x + (i / 4) * T, bot[i]);
      ctx.closePath();
      const gg = ctx.createLinearGradient(0, y, 0, y + 17);
      gg.addColorStop(0, th.grass);
      gg.addColorStop(0.55, th.grass);
      gg.addColorStop(1, th.grass2);
      ctx.fillStyle = gg;
      ctx.fill();
      // 顶部纸边
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#DCF0AC';
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + T, y + 1);
      ctx.lineTo(x + T, y + 3.2);
      ctx.lineTo(x, y + 3.8);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // 下沿暗边
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = th.grassDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, bot[0]);
      for (let i = 1; i <= 4; i++) ctx.lineTo(x + (i / 4) * T, bot[i]);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // 小花
      if (rng() > 0.88) {
        const fx = x + 8 + rng() * 16, fy = y + 1;
        ctx.fillStyle = rng() > 0.5 ? '#FFF1F0' : '#FFE9A8';
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * 7;
          ctx.beginPath();
          ctx.arc(fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.6, 1.9, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = '#E2A93B';
        ctx.beginPath();
        ctx.arc(fx, fy, 1.3, 0, 7);
        ctx.fill();
      }
    },

    drawTile(ctx, themeName, type, variant, px, py, size) {
      const set = this.tilesFor(themeName);
      const ti = set.idx[type];
      if (ti === undefined) return;
      const sx = (variant % TILE_VARIANTS) * TS;
      ctx.drawImage(set.canvas, sx, ti * TS, TS, TS, px, py, size, size);
    },

    // 纸卡片
    panel(ctx, x, y, w, h, o) {
      o = o || {};
      const seed = o.seed || 5;
      ctx.save();
      if (o.rot) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(o.rot);
        ctx.translate(-x - w / 2, -y - h / 2);
      }
      if (o.shadow !== false) {
        ctx.save();
        ctx.shadowColor = 'rgba(50,36,22,' + (o.shadowAlpha || 0.3) + ')';
        ctx.shadowBlur = o.blur === undefined ? 16 : o.blur;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = o.fill || '#FBF4E2';
        roughRect(ctx, x, y, w, h, o.amp || 2.2, seed);
        ctx.fill();
        ctx.restore();
      }
      const grd = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
      grd.addColorStop(0, o.fill || '#FDF8EA');
      grd.addColorStop(1, o.fill2 || o.fill || '#F0E4C8');
      ctx.fillStyle = grd;
      roughRect(ctx, x, y, w, h, o.amp || 2.2, seed);
      ctx.fill();
      // 纸纹
      ctx.save();
      roughRect(ctx, x, y, w, h, o.amp || 2.2, seed);
      ctx.clip();
      const tex = texFor(seed + 9, 180);
      ctx.globalAlpha = 0.55;
      for (let ty = y; ty < y + h; ty += 180) for (let tx = x; tx < x + w; tx += 180) ctx.drawImage(tex, tx, ty);
      ctx.restore();
      if (o.border !== false) {
        ctx.strokeStyle = o.stroke || 'rgba(70,50,32,0.42)';
        ctx.lineWidth = o.lw || 2;
        roughRect(ctx, x + 1, y + 1, w - 2, h - 2, o.amp || 2.2, seed + 3);
        ctx.stroke();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.2;
        roughRect(ctx, x + 3, y + 3, w - 6, h - 6, o.amp || 2, seed + 8);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },

    // 双层纸片（背后一张歪一点的纸）
    stackPanel(ctx, x, y, w, h, o) {
      o = o || {};
      const seed = o.seed || 5;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(o.backRot === undefined ? -0.014 : o.backRot);
      ctx.translate(-x - w / 2, -y - h / 2);
      this.panel(ctx, x + 2, y + 5, w, h, {
        fill: o.backFill || '#E6D8BC',
        fill2: o.backFill2 || '#D8C8A8',
        seed: seed + 7,
        shadowAlpha: 0.34,
        border: false,
        amp: o.amp,
      });
      ctx.restore();
      this.panel(ctx, x, y, w, h, o);
    },

    tape(ctx, x, y, w, angle, col) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = col || 'rgba(242,222,168,0.95)';
      ctx.fillRect(-w / 2, -8, w, 16);
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      for (let i = -w / 2 + 6; i < w / 2; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, -7);
        ctx.lineTo(i, 7);
        ctx.stroke();
      }
      ctx.restore();
    },

    text(ctx, str, x, y, o) {
      o = o || {};
      ctx.save();
      ctx.font = (o.weight || '700') + ' ' + (o.size || 24) + 'px ' + (o.font || F.ui);
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.baseline || 'alphabetic';
      if (o.rot) {
        ctx.translate(x, y);
        ctx.rotate(o.rot);
        x = 0;
        y = 0;
      }
      if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
      if (o.shadow) {
        ctx.fillStyle = 'rgba(60,40,20,0.25)';
        ctx.fillText(str, x + 2, y + 3);
      }
      if (o.outline) {
        ctx.lineWidth = o.outlineW || 6;
        ctx.strokeStyle = o.outline;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(str, x, y);
      }
      ctx.fillStyle = o.color || '#3A2A1E';
      ctx.fillText(str, x, y);
      ctx.restore();
    },

    heart(ctx, x, y, s, filled, col) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s / 20, s / 20);
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.bezierCurveTo(-12, -3, -8, -14, 0, -7);
      ctx.bezierCurveTo(8, -14, 12, -3, 0, 7);
      ctx.closePath();
      if (filled) {
        ctx.fillStyle = col || '#E2574C';
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,30,25,0.8)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(-4, -4, 2.6, 1.8, -0.5, 0, 7);
        ctx.fill();
      } else {
        ctx.strokeStyle = col || 'rgba(70,50,40,0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    },

    coin(ctx, x, y, r, t) {
      const sq = Math.abs(Math.cos(t * 2.4));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.32 + sq * 0.68, 1);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 7);
      ctx.fillStyle = '#F6C85A';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,20,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.6, 0, 7);
      ctx.strokeStyle = 'rgba(255,250,220,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    },

    stamp(ctx, x, y, text, angle, scale) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(scale || 1, scale || 1);
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = '#C8443A';
      ctx.fillStyle = '#C8443A';
      ctx.lineWidth = 5;
      ctx.beginPath();
      const w = 260, h = 92;
      const rng = U.mulberry(text.length * 31);
      U.wobbleLine(ctx, -w / 2, -h / 2, w / 2, -h / 2, 3, 12, rng);
      U.wobbleLine(ctx, w / 2, -h / 2, w / 2, h / 2, 3, 12, rng);
      U.wobbleLine(ctx, w / 2, h / 2, -w / 2, h / 2, 3, 12, rng);
      U.wobbleLine(ctx, -w / 2, h / 2, -w / 2, -h / 2, 3, 12, rng);
      ctx.stroke();
      ctx.font = '900 46px ' + F.ui;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 2);
      ctx.restore();
    },

    icon(ctx, kind, x, y, s, col) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = col || '#3A2A1E';
      ctx.fillStyle = col || '#3A2A1E';
      ctx.lineWidth = s * 0.14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (kind === 'pause') {
        ctx.fillRect(-s * 0.28, -s * 0.34, s * 0.18, s * 0.68);
        ctx.fillRect(s * 0.1, -s * 0.34, s * 0.18, s * 0.68);
      } else if (kind === 'play') {
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, -s * 0.34);
        ctx.lineTo(s * 0.34, 0);
        ctx.lineTo(-s * 0.2, s * 0.34);
        ctx.closePath();
        ctx.fill();
      } else if (kind === 'sound') {
        ctx.beginPath();
        ctx.moveTo(-s * 0.34, -s * 0.14);
        ctx.lineTo(-s * 0.16, -s * 0.14);
        ctx.lineTo(s * 0.04, -s * 0.34);
        ctx.lineTo(s * 0.04, s * 0.34);
        ctx.lineTo(-s * 0.16, s * 0.14);
        ctx.lineTo(-s * 0.34, s * 0.14);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.06, 0, s * 0.22, -0.9, 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 0.06, 0, s * 0.36, -0.8, 0.8);
        ctx.stroke();
      } else if (kind === 'mute') {
        ctx.beginPath();
        ctx.moveTo(-s * 0.34, -s * 0.14);
        ctx.lineTo(-s * 0.16, -s * 0.14);
        ctx.lineTo(s * 0.04, -s * 0.34);
        ctx.lineTo(s * 0.04, s * 0.34);
        ctx.lineTo(-s * 0.16, s * 0.14);
        ctx.lineTo(-s * 0.34, s * 0.14);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.16, -s * 0.2);
        ctx.lineTo(s * 0.42, s * 0.2);
        ctx.moveTo(s * 0.42, -s * 0.2);
        ctx.lineTo(s * 0.16, s * 0.2);
        ctx.stroke();
      } else if (kind === 'back') {
        ctx.beginPath();
        ctx.moveTo(s * 0.18, -s * 0.3);
        ctx.lineTo(-s * 0.18, 0);
        ctx.lineTo(s * 0.18, s * 0.3);
        ctx.stroke();
      } else if (kind === 'lock') {
        ctx.beginPath();
        ctx.arc(0, -s * 0.08, s * 0.2, Math.PI, 0);
        ctx.stroke();
        ctx.fillRect(-s * 0.26, -s * 0.08, s * 0.52, s * 0.4);
      } else if (kind === 'star') {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? s * 0.18 : s * 0.4;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
  });
})(window.PH);
