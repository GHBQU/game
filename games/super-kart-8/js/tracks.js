/* ============================================================
   Super Kart 8 — tracks.js
   赛道数据层：4 个杯赛 / 20 条赛道 / 10 套主题调色板
   每条赛道由「谐波径向函数 + 高程谐波 + 宽度谐波」定义，
   保证闭合、不自交（r(θ) > 0 的单值极坐标曲线必为简单闭曲线）
   ============================================================ */
(function () {
  const SK = (window.SK = window.SK || {});
  const U = SK.U;
  const TAU = Math.PI * 2;

  /* ============================================================
     一、主题调色板
     ============================================================ */
  const THEMES = {
    /* ---------- 翠绿草原 ---------- */
    meadow: {
      name: '翠绿草原', swatch: '#5cbf50', skyCloud: '#ffffff',
      sky: ['#2b6ad2', '#5fa3ef', '#a6d2f7', '#d9edfb', '#f6faff'],
      clear: 0x9ec9ef, fog: { color: 0xcfe6fb, near: 520, far: 2300 },
      sun: { color: 0xfff8d6, size: 300, pos: [760, 660, -980], moon: false }, stars: 0,
      light: { hemiSky: 0xdff0ff, hemiGround: 0x6f8f5a, hemiInt: 1.05, sunColor: 0xfff6e2, sunInt: 1.0, amb: 0.18 },
      road: { base: ['#5a6176', '#4e5468', '#565d71'], speck: ['#2a2d38', '#98a0b8', '#6a7188', '#20232c'], tint: 0xffffff },
      ground: { base: '#458a37', spots: ['#3c7a30', '#7cc257', '#2f6b26', '#93d066'], hsl: [0.27, 0.46, 0.29], vary: [0.05, 0.13, 0.07], sand: 0xc9b98a },
      curb: ['#e33b4a', '#f2f6ff'],
      wall: { bands: ['#d83a45', '#eef4ff'], trim: '#2f6fd0', cap: '#ffd60a' },
      water: { color: 0x2fa8e8, emissive: 0x0d3f63, opacity: 0.8 },
      mountain: { a: 0x5d7fa4, b: 0x7492a8, snow: 0xf3f9ff, snowAmt: 1 },
      leaves: [0x3f9b3a, 0x57b84a, 0x2f7d31], trunk: 0x7b4b2a,
      cloud: { color: 0xffffff, emissive: 0xa9cdec, int: 0.4 },
      scenery: 'meadow'
    },

    /* ---------- 阳光海滩 ---------- */
    beach: {
      name: '阳光海岸', swatch: '#2ec4b6', skyCloud: '#ffffff',
      sky: ['#1f9ae0', '#4fc0f0', '#9fe3f8', '#d8f6ff', '#fefcf2'],
      clear: 0x8fdcf5, fog: { color: 0xcdf3ff, near: 560, far: 2500 },
      sun: { color: 0xfffbe6, size: 330, pos: [-820, 700, -760], moon: false }, stars: 0,
      light: { hemiSky: 0xe6fbff, hemiGround: 0xb9a06a, hemiInt: 1.1, sunColor: 0xfff8e0, sunInt: 1.05, amb: 0.2 },
      road: { base: ['#5a6070', '#4e5464', '#565c6d'], speck: ['#2a2e38', '#9aa2b8', '#666d84', '#1d2028'], tint: 0xffffff },
      ground: { base: '#d8c48a', spots: ['#c9b47a', '#efdda8', '#b9a468', '#fff0c4'], hsl: [0.12, 0.44, 0.55], vary: [0.02, 0.06, 0.06], sand: 0xf2e2b8 },
      curb: ['#f26d5b', '#fffaf0'],
      wall: { bands: ['#14a3a3', '#ffffff'], trim: '#ffb703', cap: '#fff3c4' },
      water: { color: 0x1fd0c4, emissive: 0x0a5e63, opacity: 0.82 },
      mountain: { a: 0x6f9f8f, b: 0x8fb9a4, snow: 0xf4fffb, snowAmt: 0.7 },
      leaves: [0x2f9e4f, 0x54c46b, 0x1f7f42], trunk: 0xb08a55,
      cloud: { color: 0xffffff, emissive: 0xa9dced, int: 0.45 },
      scenery: 'beach'
    },

    /* ---------- 日落港湾 ---------- */
    sunset: {
      name: '黄昏港湾', swatch: '#ff8c42', skyCloud: '#ffd9b0',
      sky: ['#2b2a72', '#7b3f8e', '#e0665f', '#ffb26b', '#ffe6b8'],
      clear: 0xffc78a, fog: { color: 0xf0b98a, near: 460, far: 2100 },
      sun: { color: 0xffd28a, size: 380, pos: [-900, 210, -820], moon: false }, stars: 0.25,
      light: { hemiSky: 0xffd9b0, hemiGround: 0x6b4a5a, hemiInt: 0.95, sunColor: 0xffb877, sunInt: 1.05, amb: 0.24 },
      road: { base: ['#514a5e', '#453f52', '#4d475a'], speck: ['#241f30', '#9a87a8', '#5f5670', '#1a1622'], tint: 0xffe6d0 },
      ground: { base: '#a8853f', spots: ['#9a7736', '#c9a45c', '#7f612c', '#e0bd78'], hsl: [0.1, 0.4, 0.42], vary: [0.03, 0.08, 0.06], sand: 0xe8c98c },
      curb: ['#e04a5f', '#ffe8d8'],
      wall: { bands: ['#c94f6d', '#ffe4d0'], trim: '#7a3f8e', cap: '#ffcf7a' },
      water: { color: 0xd4643f, emissive: 0x5a1e10, opacity: 0.85 },
      mountain: { a: 0x6a5570, b: 0x8a6a78, snow: 0xffd9c0, snowAmt: 0.5 },
      leaves: [0x4f7a4a, 0x6f9455, 0x3b5f3a], trunk: 0x6b4a34,
      cloud: { color: 0xffd9c4, emissive: 0xff9a6a, int: 0.5 },
      scenery: 'beach'
    },

    /* ---------- 糖果乐园 ---------- */
    candy: {
      name: '糖果乐园', swatch: '#ff8fc7', skyCloud: '#fff0fa',
      sky: ['#8f5fd0', '#c98fe8', '#f7b6d8', '#ffe0ee', '#fff6fb'],
      clear: 0xf7c6e0, fog: { color: 0xffdcef, near: 480, far: 2200 },
      sun: { color: 0xfff0fa, size: 320, pos: [720, 620, -880], moon: false }, stars: 0.1,
      light: { hemiSky: 0xffe6f6, hemiGround: 0x9a6fa0, hemiInt: 0.9, sunColor: 0xfff0f8, sunInt: 0.82, amb: 0.2 },
      road: { base: ['#65547c', '#5a4a6e', '#605074'], speck: ['#342a44', '#b7a3d6', '#7b6a96', '#281f36'], tint: 0xffffff },
      ground: { base: '#f2c9dd', spots: ['#ffd9e9', '#e8aecb', '#fff0f7', '#d99ab8'], hsl: [0.92, 0.5, 0.74], vary: [0.04, 0.1, 0.06], sand: 0xfff2d8 },
      curb: ['#ff6ba6', '#fffafd'],
      wall: { bands: ['#ff5fa2', '#ffffff'], trim: '#9b5de5', cap: '#ffe066' },
      water: { color: 0xff8fd0, emissive: 0x6a2050, opacity: 0.85 },
      mountain: { a: 0xc79ad8, b: 0xdbb6e6, snow: 0xfff4fb, snowAmt: 1 },
      leaves: [0xff9ecb, 0xa8e6a0, 0xffd166], trunk: 0xc98a6a,
      cloud: { color: 0xfff2fa, emissive: 0xffb8d8, int: 0.5 },
      scenery: 'candy'
    },

    /* ---------- 丛林遗迹 ---------- */
    jungle: {
      name: '热带丛林', swatch: '#2d8a4e', skyCloud: '#f0fff6',
      sky: ['#1f6f8a', '#3f9fae', '#8fd0c4', '#d6efdf', '#f2fbf5'],
      clear: 0xbfe8dd, fog: { color: 0xc6e4d4, near: 380, far: 1900 },
      sun: { color: 0xf2ffe0, size: 290, pos: [520, 720, -880], moon: false }, stars: 0,
      light: { hemiSky: 0xd8f6e4, hemiGround: 0x3f5f3a, hemiInt: 1.0, sunColor: 0xf6ffe8, sunInt: 0.95, amb: 0.22 },
      road: { base: ['#59614f', '#4d5443', '#535b49'], speck: ['#2a3024', '#93a07c', '#69765a', '#1e231a'], tint: 0xf2f6e8 },
      ground: { base: '#2f6b38', spots: ['#275c30', '#4f9a45', '#1f4a28', '#6ab84f'], hsl: [0.31, 0.5, 0.24], vary: [0.04, 0.12, 0.05], sand: 0xbfae7a },
      curb: ['#d94f4f', '#f6f2e0'],
      wall: { bands: ['#b83a3a', '#f0ead2'], trim: '#6b8f3a', cap: '#ffd60a' },
      water: { color: 0x2a8f7a, emissive: 0x0a3a30, opacity: 0.9 },
      mountain: { a: 0x3f6f5a, b: 0x557f66, snow: 0xe8f6e8, snowAmt: 0.4 },
      leaves: [0x1f6b34, 0x2f8a42, 0x144a24], trunk: 0x5a4028,
      cloud: { color: 0xf4fff8, emissive: 0x9fd8c0, int: 0.4 },
      scenery: 'jungle'
    },

    /* ---------- 沙漠绿洲 ---------- */
    desert: {
      name: '金色沙海', swatch: '#e0a95a', skyCloud: '#fff4dc',
      sky: ['#3b86cf', '#6fb1e6', '#b6d9f2', '#f2e6c8', '#fffaf0'],
      clear: 0xf2e2be, fog: { color: 0xf4e4c4, near: 500, far: 2400 },
      sun: { color: 0xfff2c4, size: 340, pos: [820, 580, -700], moon: false }, stars: 0,
      light: { hemiSky: 0xf6e8c8, hemiGround: 0xa8863a, hemiInt: 1.05, sunColor: 0xfff0cc, sunInt: 1.12, amb: 0.22 },
      road: { base: ['#6e6454', '#615648', '#695e4e'], speck: ['#3a3327', '#ab9c82', '#7d7160', '#2c251c'], tint: 0xfff0d8 },
      ground: { base: '#d4ab5e', spots: ['#c69a4e', '#e8c882', '#b08840', '#f6dda0'], hsl: [0.1, 0.52, 0.6], vary: [0.02, 0.06, 0.05], sand: 0xf2dfa8 },
      curb: ['#d9542f', '#fff2dc'],
      wall: { bands: ['#b9552e', '#f8e8cc'], trim: '#8a5a2a', cap: '#ffcf5a' },
      water: { color: 0x2fb8b0, emissive: 0x0a4a48, opacity: 0.86 },
      mountain: { a: 0xb87a4a, b: 0xc99a62, snow: 0xfff2d8, snowAmt: 0.3 },
      leaves: [0x6a9a3a, 0x8ab34a, 0x4f7f2a], trunk: 0x9a7442,
      cloud: { color: 0xfffaf0, emissive: 0xe0c8a0, int: 0.35 },
      scenery: 'desert'
    },

    /* ---------- 赤岩峡谷 ---------- */
    canyon: {
      name: '赤岩峡谷', swatch: '#c1553a', skyCloud: '#ffe4c4',
      sky: ['#2a5f9e', '#5f93c8', '#c9a98a', '#e8c9a0', '#fff0d8'],
      clear: 0xe8c9a0, fog: { color: 0xe8caa8, near: 420, far: 2000 },
      sun: { color: 0xffd8a0, size: 320, pos: [-700, 520, -900], moon: false }, stars: 0,
      light: { hemiSky: 0xffe4c0, hemiGround: 0x8a4a30, hemiInt: 1.0, sunColor: 0xffc98a, sunInt: 1.1, amb: 0.24 },
      road: { base: ['#5e4a44', '#53413c', '#5a4740'], speck: ['#2e211d', '#a88a7a', '#6e564e', '#241a16'], tint: 0xffe0cc },
      ground: { base: '#a8503a', spots: ['#8f402e', '#c46a48', '#783424', '#d88a5e'], hsl: [0.05, 0.48, 0.4], vary: [0.02, 0.1, 0.06], sand: 0xd8a878 },
      curb: ['#e04a2f', '#ffe4c8'],
      wall: { bands: ['#a83a24', '#f2d8b8'], trim: '#5a3a2a', cap: '#ffb340' },
      water: { color: 0x2a8f8a, emissive: 0x0a3a38, opacity: 0.88 },
      mountain: { a: 0x8a4632, b: 0xa8603f, snow: 0xffe8cc, snowAmt: 0.2 },
      leaves: [0x5f7a3a, 0x7f9a48, 0x44602a], trunk: 0x6a4a32,
      cloud: { color: 0xfff0d8, emissive: 0xd8b088, int: 0.38 },
      scenery: 'canyon'
    },

    /* ---------- 冰雪世界 ---------- */
    snow: {
      name: '冰封极地', swatch: '#8fd8ff', skyCloud: '#ffffff',
      sky: ['#3f6fae', '#6f9fd0', '#b6d8f0', '#e0f2ff', '#ffffff'],
      clear: 0xe0f2ff, fog: { color: 0xdff0ff, near: 500, far: 2400 },
      sun: { color: 0xeaf6ff, size: 300, pos: [-620, 720, -880], moon: false }, stars: 0,
      light: { hemiSky: 0xeaf8ff, hemiGround: 0x8fb0cc, hemiInt: 0.96, sunColor: 0xf0faff, sunInt: 0.82, amb: 0.2 },
      road: { base: ['#535d6e', '#49525f', '#4f5867'], speck: ['#2a3139', '#9dabc2', '#6d7a90', '#1d222a'], tint: 0xffffff },
      ground: { base: '#e8f2f8', spots: ['#d8e8f2', '#ffffff', '#c4d9e8', '#f8fdff'], hsl: [0.56, 0.4, 0.8], vary: [0.02, 0.2, 0.06], sand: 0xd8eaf2 },
      curb: ['#3f8fd0', '#ffffff'],
      wall: { bands: ['#3f7fd0', '#ffffff'], trim: '#8fd8ff', cap: '#ffd60a' },
      water: { color: 0x9fe0f0, emissive: 0x2a5f70, opacity: 0.9 },
      mountain: { a: 0xbfd8ea, b: 0xd8e8f4, snow: 0xffffff, snowAmt: 1 },
      leaves: [0x2f6b5a, 0x3f8a6a, 0x1f4f44], trunk: 0x5a4a42,
      cloud: { color: 0xffffff, emissive: 0xcfe8f8, int: 0.5 },
      scenery: 'snow'
    },

    /* ---------- 火山熔岩 ---------- */
    volcano: {
      name: '火山熔岩', swatch: '#e0521f', skyCloud: '#c97a58',
      sky: ['#20141f', '#3f1f28', '#7a2f28', '#c25a30', '#e89a52'],
      clear: 0x8a3f2a, fog: { color: 0x6a3024, near: 320, far: 1600 },
      sun: { color: 0xffb066, size: 260, pos: [680, 320, -820], moon: false }, stars: 0.35,
      light: { hemiSky: 0xff9a5a, hemiGround: 0x3a1a14, hemiInt: 1.05, sunColor: 0xff9a55, sunInt: 1.0, amb: 0.3 },
      road: { base: ['#4a434a', '#403a42', '#463f47'], speck: ['#221d22', '#8a7f84', '#5a5258', '#141014'], tint: 0xc8ccd8 },
      ground: { base: '#3a2a26', spots: ['#2e201c', '#5a3a30', '#241a16', '#7a4a38'], hsl: [0.04, 0.3, 0.16], vary: [0.03, 0.1, 0.05], sand: 0x6a4a3a },
      curb: ['#e0402a', '#f2e0d8'],
      wall: { bands: ['#c2351f', '#e8d8d0'], trim: '#3a2a26', cap: '#ff8c2a' },
      water: { color: 0xff6a1f, emissive: 0xc23000, opacity: 0.95 },
      mountain: { a: 0x4a3038, b: 0x603a40, snow: 0xff9a5a, snowAmt: 0.5 },
      leaves: [0x5a3a2a, 0x7a4a30, 0x3a2a20], trunk: 0x3a2a22,
      cloud: { color: 0xb08a80, emissive: 0xff6a3a, int: 0.55 },
      scenery: 'volcano'
    },

    /* ---------- 霓虹夜城 ---------- */
    night: {
      name: '霓虹夜色', swatch: '#7b6cff', skyCloud: '#4a4a86',
      sky: ['#05060f', '#0d1030', '#1f2455', '#3a3070', '#5f4a8a'],
      clear: 0x1a1c33, fog: { color: 0x1f2445, near: 420, far: 2000 },
      sun: { color: 0xdfe8ff, size: 190, pos: [-700, 760, -820], moon: true }, stars: 1,
      light: { hemiSky: 0x6f7fd0, hemiGround: 0x2a2a44, hemiInt: 1.0, sunColor: 0xbfcaff, sunInt: 0.85, amb: 0.4 },
      road: { base: ['#4e5674', '#454c68', '#4a5270'], speck: ['#222634', '#9dabcf', '#616a8c', '#141824'], tint: 0xd8e4ff },
      ground: { base: '#22303a', spots: ['#1a2630', '#2f4450', '#141e26', '#3f5a66'], hsl: [0.55, 0.3, 0.2], vary: [0.03, 0.08, 0.05], sand: 0x3a4a52 },
      curb: ['#ff3f8f', '#1a1e2e'],
      wall: { bands: ['#ff2f7f', '#2a2f44'], trim: '#5fe0ff', cap: '#7b6cff' },
      water: { color: 0x2a5f9f, emissive: 0x0a1f4a, opacity: 0.9 },
      mountain: { a: 0x1f2440, b: 0x2a3050, snow: 0x6f7fb0, snowAmt: 0.3 },
      leaves: [0x1f4a3a, 0x2f6a4a, 0x15302a], trunk: 0x3a3040,
      cloud: { color: 0x4a4a70, emissive: 0x6a5f9a, int: 0.4 },
      scenery: 'night'
    }
  };

  /* ============================================================
     二、杯赛
     ============================================================ */
  const CUPS = [
    { id: 'mushroom', name: '蘑菇杯', en: 'Mushroom Cup', color: '#e63946', accent: '#ff8b8b', desc: '入门赛道，宽阔平缓，适合熟悉漂移手感。' },
    { id: 'flower', name: '花朵杯', en: 'Flower Cup', en2: '', color: '#43aa8b', accent: '#9ff0cf', desc: '地形开始起伏，出现沙地与冰面，考验走线。' },
    { id: 'star', name: '星星杯', en: 'Star Cup', color: '#ffb703', accent: '#ffe066', desc: '反重力路段登场，赛道垂直翻转，节奏加快。' },
    { id: 'crown', name: '皇冠杯', en: 'Crown Cup', color: '#9b5de5', accent: '#d9b3ff', desc: '最长最难的赛道集合，连续反重力与高空跳跃。' }
  ];

  /* ============================================================
     三、20 条赛道定义
     shape: r0=基准半径, rh=半径谐波[a,f,p], y0=基准高度, yh=高程谐波,
            w0=基准宽度, wh=宽度谐波, rot=整体旋转相位
     anti : { a, b, dir } 反重力 360° 翻滚段（弧度），null 表示无
     ============================================================ */
  const RAW = [
    /* ---------------- 蘑菇杯 ---------------- */
    {
      id: 'mushroom-plains', name: '蘑菇平原', en: 'Mushroom Plains', cup: 0, theme: 'meadow', rating: 1, seed: 1101,
      shape: { r0: 176, rh: [[44, 2, 0.55], [20, 3, -1.15], [8, 5, 0.35]], y0: 20, yh: [[12, 1, 1.25], [5, 2, 0.4], [3, 3, -2.1]], w0: 24, wh: [[3.2, 3, 0.8], [1.8, 5, -1.2]], rot: 0.0 },
      anti: null, glide: false, lake: { ang: 2.35, dist: 1.55, r: 150 }
    },
    {
      id: 'seaside-breeze', name: '海风海岸', en: 'Seaside Breeze', cup: 0, theme: 'beach', rating: 1, seed: 1102,
      shape: { r0: 194, rh: [[52, 2, 2.1], [16, 3, 0.3], [10, 4, 1.2]], y0: 14, yh: [[6, 1, 0.6], [3, 2, 2.2]], w0: 26, wh: [[2.6, 3, 1.4], [1.4, 5, 0.2]], rot: 0.8 },
      anti: null, glide: false, lake: { ang: 0.9, dist: 1.62, r: 210 }
    },
    {
      id: 'donut-plaza', name: '甜甜圈广场', en: 'Donut Plaza', cup: 0, theme: 'candy', rating: 1, seed: 1103,
      shape: { r0: 164, rh: [[30, 2, 0.2], [26, 3, -0.7], [14, 4, 0.9]], y0: 18, yh: [[7, 1, 2.4], [4, 2, 0.6]], w0: 22, wh: [[2.4, 3, -0.4], [1.2, 6, 1.1]], rot: 1.9 },
      anti: null, glide: false, lake: null
    },
    {
      id: 'forest-path', name: '林间小径', en: 'Forest Path', cup: 0, theme: 'jungle', rating: 2, seed: 1104,
      shape: { r0: 184, rh: [[38, 2, 1.4], [30, 3, -2.0], [9, 5, 0.5]], y0: 24, yh: [[14, 1, 0.4], [6, 2, 1.8], [4, 3, -0.3]], w0: 21, wh: [[2.8, 3, 0.9], [1.6, 4, -1.5]], rot: 2.7 },
      anti: null, glide: false, lake: { ang: 4.2, dist: 1.5, r: 130 }
    },
    {
      id: 'mushroom-hills', name: '蘑菇山丘', en: 'Mushroom Hills', cup: 0, theme: 'meadow', rating: 2, seed: 1105,
      shape: { r0: 172, rh: [[48, 2, -0.4], [18, 4, 1.6], [10, 6, 0.2]], y0: 26, yh: [[16, 1, 2.0], [7, 2, 0.2], [4, 3, 1.4]], w0: 22, wh: [[3.0, 3, -1.1], [1.5, 5, 0.7]], rot: 3.4 },
      anti: null, glide: false, lake: null
    },

    /* ---------------- 花朵杯 ---------------- */
    {
      id: 'desert-oasis', name: '沙漠绿洲', en: 'Desert Oasis', cup: 1, theme: 'desert', rating: 2, seed: 1201,
      shape: { r0: 202, rh: [[46, 2, 0.9], [24, 3, 1.9], [10, 5, 0.3]], y0: 16, yh: [[8, 1, 1.0], [4, 2, -0.6], [3, 3, 2.2]], w0: 26, wh: [[3.4, 3, 2.0], [1.8, 4, -0.5]], rot: 0.4 },
      anti: null, glide: false, lake: { ang: 5.4, dist: 1.42, r: 185 }
    },
    {
      id: 'glacier-slide', name: '冰川滑道', en: 'Glacier Slide', cup: 1, theme: 'snow', rating: 2, seed: 1202,
      shape: { r0: 180, rh: [[36, 2, 2.6], [28, 3, -0.8], [12, 4, 0.4]], y0: 28, yh: [[15, 1, 0.2], [6, 2, 1.1], [4, 3, -1.6]], w0: 23, wh: [[3.0, 3, 1.2], [1.4, 5, -0.9]], rot: 1.2 },
      anti: null, glide: false, lake: { ang: 3.3, dist: 1.52, r: 170 }
    },
    {
      id: 'garden-loop', name: '花园回廊', en: 'Garden Loop', cup: 1, theme: 'meadow', rating: 2, seed: 1203,
      shape: { r0: 156, rh: [[34, 2, 0.1], [22, 3, 0.6], [16, 4, -1.3], [7, 6, 0.8]], y0: 19, yh: [[6, 1, 1.7], [4, 2, 0.1]], w0: 20, wh: [[2.6, 3, 0.3], [1.2, 5, 1.8]], rot: 2.1 },
      anti: null, glide: false, lake: null
    },
    {
      id: 'sunset-harbor', name: '日落港湾', en: 'Sunset Harbor', cup: 1, theme: 'sunset', rating: 3, seed: 1204,
      shape: { r0: 196, rh: [[54, 2, -1.1], [20, 3, 0.8], [9, 5, 2.4]], y0: 13, yh: [[5, 1, 1.3], [3, 2, 0.2]], w0: 25, wh: [[3.2, 3, 0.7], [1.6, 4, -1.9]], rot: 3.9 },
      anti: null, glide: false, lake: { ang: 1.6, dist: 1.58, r: 225 }
    },
    {
      id: 'frosting-canyon', name: '糖霜峡谷', en: 'Frosting Canyon', cup: 1, theme: 'candy', rating: 3, seed: 1205,
      shape: { r0: 188, rh: [[42, 2, 1.7], [30, 3, 2.4], [12, 5, 0.2]], y0: 27, yh: [[13, 1, 1.5], [6, 2, -0.8], [4, 3, 0.9]], w0: 22, wh: [[2.8, 3, -0.6], [1.5, 5, 1.3]], rot: 5.1 },
      anti: { a: 4.15, b: 5.35, dir: 1 }, glide: false, lake: null
    },

    /* ---------------- 星星杯 ---------------- */
    {
      id: 'starlight-blvd', name: '星光大道', en: 'Starlight Boulevard', cup: 2, theme: 'night', rating: 3, seed: 1301,
      shape: { r0: 186, rh: [[40, 2, 1.9], [22, 3, -1.0], [12, 4, 0.5]], y0: 22, yh: [[11, 1, 0.7], [5, 2, 2.1], [3, 3, -0.9]], w0: 24, wh: [[3.0, 3, 1.6], [1.6, 5, -0.2]], rot: 0.2 },
      anti: null, glide: false, lake: { ang: 2.9, dist: 1.6, r: 160 }
    },
    {
      id: 'volcano-lava', name: '火山熔岩', en: 'Volcano Lava', cup: 2, theme: 'volcano', rating: 3, seed: 1302,
      shape: { r0: 174, rh: [[44, 2, 0.2], [26, 3, 1.4], [10, 5, 2.0]], y0: 30, yh: [[12, 1, 0.9], [8, 2, -0.4], [5, 3, 1.7]], w0: 23, wh: [[3.2, 3, -1.4], [1.4, 4, 0.6]], rot: 1.7 },
      anti: null, glide: false, lake: { ang: 0.3, dist: 1.44, r: 145 }
    },
    {
      id: 'cloud-ascent', name: '云端天梯', en: 'Cloud Ascent', cup: 2, theme: 'snow', rating: 3, seed: 1303,
      shape: { r0: 194, rh: [[34, 2, 0.7], [24, 3, 2.2], [14, 4, 0.4]], y0: 44, yh: [[20, 1, 0.5], [9, 2, 1.4], [5, 3, -0.7]], w0: 22, wh: [[2.8, 3, 0.9], [1.4, 6, -1.1]], rot: 2.5 },
      anti: null, glide: false, lake: null
    },
    {
      id: 'neon-city', name: '霓虹都市', en: 'Neon City', cup: 2, theme: 'night', rating: 4, seed: 1304,
      shape: { r0: 168, rh: [[32, 2, 0.6], [20, 3, 0.4], [18, 4, -2.1], [8, 5, 1.2]], y0: 24, yh: [[9, 1, 1.1], [5, 2, -0.3], [4, 3, 2.0]], w0: 21, wh: [[2.6, 3, 2.2], [1.3, 5, -0.7]], rot: 4.4 },
      anti: { a: 3.9, b: 5.1, dir: -1 }, glide: false, lake: null
    },
    {
      id: 'jungle-ruins', name: '丛林遗迹', en: 'Jungle Ruins', cup: 2, theme: 'jungle', rating: 4, seed: 1305,
      shape: { r0: 190, rh: [[46, 2, -0.9], [28, 3, 1.1], [10, 4, 2.6]], y0: 26, yh: [[14, 1, 2.4], [6, 2, 0.3], [5, 3, -1.2]], w0: 22, wh: [[3.0, 3, 0.4], [1.5, 4, 1.7]], rot: 5.8 },
      anti: { a: 4.0, b: 5.25, dir: 1 }, glide: false, lake: { ang: 3.7, dist: 1.48, r: 140 }
    },

    /* ---------------- 皇冠杯 ---------------- */
    {
      id: 'crown-castle', name: '皇冠城堡', en: 'Crown Castle', cup: 3, theme: 'meadow', rating: 4, seed: 1401,
      shape: { r0: 212, rh: [[50, 2, 0.3], [22, 3, -1.7], [12, 4, 1.1]], y0: 28, yh: [[16, 1, 0.2], [7, 2, 1.6], [4, 3, -0.5]], w0: 24, wh: [[3.4, 3, 1.3], [1.7, 5, -0.8]], rot: 0.6 },
      anti: null, glide: false, lake: { ang: 2.2, dist: 1.5, r: 175 }
    },
    {
      id: 'polar-storm', name: '极地风暴', en: 'Polar Storm', cup: 3, theme: 'snow', rating: 4, seed: 1402,
      shape: { r0: 198, rh: [[40, 2, 1.2], [30, 3, -0.5], [12, 5, 1.9]], y0: 34, yh: [[18, 1, 1.1], [8, 2, -0.9], [5, 3, 2.4]], w0: 23, wh: [[3.2, 3, -2.0], [1.6, 4, 0.9]], rot: 1.4 },
      anti: { a: 3.8, b: 5.0, dir: -1 }, glide: false, lake: { ang: 5.9, dist: 1.55, r: 190 }
    },
    {
      id: 'lava-abyss', name: '熔岩深渊', en: 'Lava Abyss', cup: 3, theme: 'volcano', rating: 4, seed: 1403,
      shape: { r0: 186, rh: [[46, 2, -0.2], [32, 3, 2.7], [14, 4, 0.7]], y0: 32, yh: [[15, 1, 0.2], [9, 2, -1.2], [6, 3, 1.5]], w0: 22, wh: [[3.0, 3, 1.9], [1.4, 5, -1.3]], rot: 2.8 },
      anti: { a: 4.3, b: 5.5, dir: 1 }, glide: false, lake: { ang: 1.1, dist: 1.45, r: 150 }
    },
    {
      id: 'rainbow-sky', name: '彩虹天空', en: 'Rainbow Sky', cup: 3, theme: 'candy', rating: 5, seed: 1404,
      shape: { r0: 204, rh: [[52, 2, 2.0], [26, 3, 0.9], [16, 4, -1.4]], y0: 52, yh: [[22, 1, 0.8], [10, 2, 1.9], [6, 3, -0.6]], w0: 23, wh: [[3.0, 3, 0.2], [1.5, 5, 1.6]], rot: 3.1 },
      anti: { a: 3.7, b: 4.9, dir: -1 }, glide: true, lake: null
    },
    {
      id: 'final-canyon', name: '终焉峡谷', en: 'Final Canyon', cup: 3, theme: 'canyon', rating: 5, seed: 1405,
      shape: { r0: 220, rh: [[56, 2, 0.8], [30, 3, -1.3], [16, 4, 1.9], [8, 5, -0.4]], y0: 36, yh: [[20, 1, 1.5], [10, 2, -0.7], [6, 3, 2.2]], w0: 25, wh: [[3.4, 3, -0.5], [1.8, 4, 1.2]], rot: 4.7 },
      anti: { a: 3.6, b: 5.4, dir: 1 }, glide: true, lake: { ang: 0.7, dist: 1.5, r: 165 }
    }
  ];

  /* ============================================================
     四、布局生成（加速板 / 跳台 / 道具箱 / 金币）
     ============================================================ */
  function makeLayout(def) {
    const rng = U.RNG(def.seed);
    const antiA = def.anti ? def.anti.a / TAU : -1;
    const antiB = def.anti ? def.anti.b / TAU : -1;
    const nearAnti = (f, pad) => def.anti && f > antiA - (pad || 0.02) && f < antiB + (pad || 0.02);
    const wrapF = (f) => ((f % 1) + 1) % 1;

    /* --- 加速板 --- */
    const pads = [];
    const padCount = 5 + (def.rating >= 3 ? 1 : 0) + (def.rating >= 4 ? 1 : 0);
    for (let i = 0; i < padCount; i++) {
      let f = 0, tries = 0;
      do {
        f = wrapF(0.06 + (i / padCount) * 0.9 + rng.range(-0.028, 0.028));
        tries++;
      } while (nearAnti(f, 0.03) && tries < 24);
      if (nearAnti(f, 0.03)) continue;
      pads.push({
        f,
        lat: rng.range(-0.42, 0.42),
        width: rng.range(5.0, 6.6),
        len: rng.range(5.5, 8.0)
      });
    }

    /* --- 跳台 --- */
    const ramps = [];
    const rampCount = 2 + (def.rating >= 3 ? 1 : 0);
    for (let i = 0; i < rampCount; i++) {
      let f = 0, tries = 0;
      do {
        f = wrapF(0.18 + (i / rampCount) * 0.68 + rng.range(-0.03, 0.03));
        tries++;
      } while (nearAnti(f, 0.025) && tries < 24);
      if (nearAnti(f, 0.025)) continue;
      const glide = def.glide && i === rampCount - 1;
      ramps.push({
        f,
        lat: rng.range(-0.2, 0.2),
        width: glide ? 12 : rng.range(9.5, 11.5),
        len: glide ? 10 : rng.range(7.5, 9.5),
        height: glide ? 3.4 : rng.range(2.1, 2.8),
        glide
      });
    }

    /* --- 道具箱行 --- */
    const itemRows = [];
    const rowCount = 4;
    for (let i = 0; i < rowCount; i++) {
      let f = wrapF(0.075 + i * 0.228);
      if (nearAnti(f, 0.04)) f = wrapF(f + 0.08);
      itemRows.push(f);
    }

    /* --- 金币串 --- */
    const coinLines = [];
    const lineCount = 10 + (def.rating >= 4 ? 2 : 0);
    for (let i = 0; i < lineCount; i++) {
      let f0 = wrapF(0.02 + (i / lineCount) * 0.94 + rng.range(-0.012, 0.012));
      let f1 = wrapF(f0 + rng.range(0.022, 0.046));
      if (f1 < f0) f1 = f0 + 0.03;
      if (nearAnti((f0 + f1) / 2, 0.02)) {
        f0 = wrapF(f0 + 0.09); f1 = f0 + 0.03;
      }
      coinLines.push({ f0, f1, lat: rng.range(-0.55, 0.55) });
    }

    /* --- 护栏缺口（可冲出赛道的边缘） --- */
    const gaps = [];
    const gapCount = 2 + (def.rating >= 4 ? 1 : 0);
    for (let i = 0; i < gapCount; i++) {
      let f = 0, tries = 0;
      do {
        f = wrapF(0.09 + (i / gapCount) * 0.88 + rng.range(-0.04, 0.04));
        tries++;
      } while (nearAnti(f, 0.06) && tries < 30);
      if (nearAnti(f, 0.06)) continue;
      const w = rng.range(0.016, 0.028);
      gaps.push([f * TAU - w * TAU * 0.5, f * TAU + w * TAU * 0.5]);
    }

    return { pads, ramps, itemRows, coinLines, gaps };
  }

  /* ============================================================
     五、中心线采样（用于长度估算 / 菜单缩略图，不建几何）
     ============================================================ */
  function rawPoints(def, n) {
    const s = def.shape;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU + (s.rot || 0);
      let r = s.r0;
      for (let k = 0; k < s.rh.length; k++) {
        const h = s.rh[k];
        r += h[0] * Math.sin(h[1] * th + h[2]);
      }
      let y = s.y0;
      for (let k = 0; k < s.yh.length; k++) {
        const h = s.yh[k];
        y += h[0] * Math.sin(h[1] * th + h[2]);
      }
      pts.push({ x: Math.cos(th) * r, z: Math.sin(th) * r, y });
    }
    return pts;
  }

  function measure(def) {
    const pts = rawPoints(def, 1024);
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      len += Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y);
    }
    return len;
  }

  function previewPath(def, n) {
    const pts = rawPoints(def, n || 220);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const pad = 20;
    const scale = 1 / Math.max(maxX - minX + pad * 2, maxZ - minZ + pad * 2);
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    return pts.map(p => ({
      x: 0.5 + (p.x - cx) * scale,
      y: 0.5 + (p.z - cz) * scale
    }));
  }

  /* ============================================================
     六、装配
     ============================================================ */
  const TRACKS = RAW.map((def, i) => {
    const d = Object.assign({}, def);
    d.index = i;
    d.cupIndex = def.cup;
    d.cupId = CUPS[def.cup].id;
    d.themeData = THEMES[def.theme];
    d.layout = makeLayout(def);
    d.lengthApprox = Math.round(measure(def));
    d.preview = previewPath(def, 200);
    if (def.lake) {
      d.lake = {
        x: Math.cos(def.lake.ang) * def.shape.r0 * def.lake.dist,
        z: Math.sin(def.lake.ang) * def.shape.r0 * def.lake.dist,
        r: def.lake.r
      };
    } else {
      d.lake = null;
    }
    return d;
  });

  SK.THEMES = THEMES;
  SK.CUPS = CUPS;
  SK.TRACKS = TRACKS;
  SK.TRACK_BY_ID = {};
  TRACKS.forEach(t => { SK.TRACK_BY_ID[t.id] = t; });
  SK.tracksOfCup = (ci) => TRACKS.filter(t => t.cupIndex === ci);
  SK.trackPreview = previewPath;
})();
