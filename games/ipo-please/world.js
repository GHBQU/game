'use strict';
// 上半屏（续作的新活）：ANT 股价屏、退款窗口和它的队伍、排队区举起来的手机、鱼灾、岗亭窗口的小锦旗、结局的崩盘。
// 画法移植自 pp/booth.py（_board / _refund_queue / _phones / _collapse / _jinqi_ext）。

const BOARD = [66, 33, 250, 46];        // 横条电子屏：挂在墙脚、3H 横幅下方，排队的人正对着它
const KIOSK = [538, 58, 586, 97];       // 退款窗口
const GUARDS = [[372, 98], [384, 72]];
const FISH_LOOK = [[64, 96, 200], [70, 112, 214]];
const COATS0 = [74, 70, 60];

// 排队区的小人：位置和样子来自静态背景（build_assets 导出）；手机、鱼按打乱后的固定顺序一个个变
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const QSPOTS = ASSETS.queue.spots.map((p, i) => ({ x: p[0], y: p[1], look: ASSETS.queue.looks[i] }));
const PHONE_ORDER = seededShuffle(QSPOTS, 11);
const FISH_ORDER = seededShuffle(QSPOTS, 5);

function refundSpot(i) {
  const r = Math.floor(i / 14), k = i % 14;
  if (r === 0) return [530 - 8 * k, 97];
  if (r === 1) return [426 + 8 * k, 87];
  return [530 - 8 * k, 77];
}

const tp = (x, y, look, step = 0) => tinyPerson(x, y, rgb(look[0]), look[1] ? rgb(look[1]) : null, step);

function pathLen(path) { let L = 0; for (let i = 0; i < path.length - 1; i++) L += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); return L; }
function along(path, dist) {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (dist <= L) return lerp2(a, b, L ? dist / L : 1);
    dist -= L;
  }
  return path[path.length - 1];
}

function drawWorld() {
  const col = B.collapse;
  if (col && now >= col.t0) spr('ext_clean', 0, 0);
  drawBoard();
  drawJinqiExt();
  drawQueueArea();
  drawRefundQueue();
  drawWalkers();
  drawEntrantWalker();
  if (col && now >= col.t0) drawCollapse(now - col.t0);
  drawFireworks();
}

// —— ANT 股价屏 ——
function drawBoard() {
  const [x0, y0, x1, y1] = BOARD, w = S.world;
  rect(x0 - 2, y0 - 2, x1 + 2, y1 + 2, K.OUTLINE);
  rect(x0, y0, x1, y1, 'rgb(22,22,24)');
  const amber = 'rgb(232,170,60)', green = 'rgb(96,226,120)', dim = 'rgb(40,70,48)';
  txt(x0 + 4, y0 + 3, 'ANT', 10, amber);
  if (w.ant === null) { txt((x0 + 28 + x1) / 2, y0 + 3, '明日上市', 10, 'rgb(150,120,70)', 'ma'); return; }
  const note = B.boardNote;
  if (note && now >= note.t0 && now < note.t1) {
    txt((x0 + 28 + x1) / 2, y0 + 3, note.text, 10, Math.floor(now * 6) % 3 ? note.col : K.WHITE, 'ma');
    return;
  }
  const last = B.antLast;
  const flash = last && now - last.t < 0.5 && Math.floor((now - last.t) * 10) % 2 === 0;
  const down = last && last.f < 1 && now - last.t < 3.0;
  const price = w.ant;
  txt(x0 + 28, y0 + 3, `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 10, flash ? K.WHITE : down ? K.RED_L : green);
  const chg = B.antOpen ? (price / B.antOpen - 1) * 100 : 0;
  const px = x0 + 28 + tw(`$${Math.round(price).toLocaleString('en-US')}.00`, 10) + 6;
  if (down) txt(px, y0 + 4, `▼${Math.round((1 - last.f) * 100)}%`, 8, K.RED_L);
  else txt(px, y0 + 4, chg > 0.05 ? `▲${Math.round(chg)}%` : '—0%', 8, chg > 0.05 ? green : K.GREY);
  const cx0 = Math.max(x0 + 118, px + 34), cy0 = y0 + 3, cx1 = x1 - 4, cy1 = y1 - 3;
  G.fillStyle = dim;
  for (let gx = cx0; gx < cx1; gx += 4) G.fillRect(gx, (cy0 + cy1) >> 1, 1, 1);
  const pts = w.hist.slice(-16);
  const lo = Math.min(...pts), hi = Math.max(...pts), span = Math.max(hi - lo, 1e-6), step = (cx1 - cx0) / 16;
  let prev = null;
  pts.forEach((v, i) => {
    const x = Math.round(cx0 + i * step);
    const y = pts.length > 1 ? Math.round(cy1 - (v - lo) / span * (cy1 - cy0)) : (cy0 + cy1) >> 1;
    if (prev) {
      const c = y > prev[1] ? K.RED_L : green;
      rect(prev[0], prev[1], x, prev[1], c);
      rect(x, Math.min(prev[1], y), x, Math.max(prev[1], y), c);
    }
    prev = [x, y];
  });
  if (prev && Math.floor(now * 3) % 2 === 0) rect(prev[0] - 1, prev[1] - 1, prev[0] + 1, prev[1] + 1, flash ? K.WHITE : green);
}

// 市值过两万亿：屏上放烟花
function drawFireworks() {
  const lt = now - B.fireworks;
  if (lt < 0 || lt > 2.4) return;
  const cols = ['rgb(246,214,110)', 'rgb(96,226,120)', 'rgb(240,120,100)', 'rgb(230,230,240)'];
  for (let i = 0; i < 9; i++) {
    const a = lt - i * 0.22;
    if (a < 0 || a >= 0.6) continue;
    const bx = BOARD[0] + ((i * 67) % (BOARD[2] - BOARD[0])), by = 40 + ((i * 29) % 24), c = cols[i % 4];
    const r = Math.round(3 + a * 16);
    for (let k = 0; k < 10; k++) {
      const ang = k * Math.PI / 5;
      rect(bx + Math.round(Math.cos(ang) * r), by + Math.round(Math.sin(ang) * r * 0.8), bx + Math.round(Math.cos(ang) * r) + 1, by + Math.round(Math.sin(ang) * r * 0.8) + 1, c);
    }
    if (a < 0.15) spark(bx, by, c, false);
  }
}

// —— 岗亭柜台窗口里的小锦旗（从窗口外看是反面，左右和窗口里那面对调）——
function drawJinqiExt() {
  if (!S.world.jinqi) return;
  const red = 'rgb(178,28,28)', gold = 'rgb(240,200,90)', goldD = 'rgb(170,120,40)';
  const x0 = 327, y0 = 93;
  rect(x0, y0, x0 + 6, y0, 'rgb(120,80,40)');
  pt(x0, y0, gold); pt(x0 + 6, y0, gold);
  rect(x0 + 1, y0 + 1, x0 + 5, y0 + 6, red);
  rect(x0 + 2, y0 + 2, x0 + 2, y0 + 5, gold);
  rect(x0 + 4, y0 + 3, x0 + 4, y0 + 5, goldD);
  for (let fx = x0 + 1; fx < x0 + 6; fx += 2) pt(fx, y0 + 7, gold);
}

// —— 排队区：鱼灾、手机 ——
function fishCount() {
  const f = B.fishAnim, w = S.world;
  if (!f) return w.fish;
  return Math.round(lerp(f.from, f.to, seg(now, f.t0, f.t0 + f.dur)));
}

function drawQueueArea() {
  const w = S.world, col = B.collapse;
  const nPh = col && now >= col.phonesAt ? PHONE_ORDER.length : Math.min(PHONE_ORDER.length, w.phones);
  const nf = fishCount();
  if (col && now >= col.t0) {
    // 公司崩盘：排队的人举着手机往左边狂奔
    const lt = now - col.t0;
    const fishSet = new Set(FISH_ORDER.slice(0, nf));
    PHONE_ORDER.forEach((q, i) => {
      const delay = 0.1 + ((i * 37) % 60) / 100, v = 80 + ((i * 53) % 60);
      const run = Math.max(0, lt - delay);
      const rx = Math.round(q.x - run * v);
      if (rx < -8) return;
      tp(rx, q.y, fishSet.has(q) ? FISH_LOOK : q.look, run > 0 ? Math.floor(now * 10) % 2 : 0);
      if (i < nPh) rect(rx + 2, q.y - 11, rx + 4, q.y - 8, 'rgb(96,226,120)');
      if (lt < 0.9 && Math.floor(lt * 6) % 2 === 0 && q.y - 18 > BOARD[3] + 2) { rect(rx, q.y - 18, rx + 1, q.y - 15, K.WHITE); rect(rx, q.y - 13, rx + 1, q.y - 13, K.WHITE); }
    });
    return;
  }
  for (const q of FISH_ORDER.slice(0, nf)) tp(q.x, q.y, FISH_LOOK);   // 和原来那个人同一个位置，正好盖住
  const fresh = now - B.phoneNew < 0.4;
  PHONE_ORDER.slice(0, nPh).forEach((q, i) => rect(q.x + 2, q.y - 11, q.x + 4, q.y - 8, fresh && i === nPh - 1 ? K.WHITE : 'rgb(96,226,120)'));
  if (col && now >= col.phonesAt && Math.floor(now * 4) % 2 === 0) {
    for (const q of PHONE_ORDER) if (q.y - 18 > BOARD[3] + 2) { rect(q.x, q.y - 18, q.x + 1, q.y - 15, K.WHITE); rect(q.x, q.y - 13, q.x + 1, q.y - 13, K.WHITE); }
  }
}

// —— 退款窗口：被拒的人都去那儿排队；卷帘门只为苹果用户拉开过一次 ——
function drawRefundQueue() {
  const col = B.collapse, q = S.world.queue;
  if (col && now >= col.t0) {
    const lt = now - col.t0;
    q.forEach((look, i) => {
      const [x, y] = refundSpot(i);
      const run = Math.max(0, lt - 0.25 - ((i * 41) % 60) / 100);
      const rx = Math.round(x + run * (80 + ((i * 29) % 50)));
      if (rx < W + 8) tp(rx, y, look, run > 0 ? Math.floor(now * 10) % 2 : 0);
    });
    return;
  }
  q.forEach((look, i) => { const [x, y] = refundSpot(i); tp(x, y, look); });
  drawKiosk(q);
}

// 贴好当前语言补丁的整张背景（卷帘门要从这上面裁，英文版门上写的是 CLOSED）
let BG_FULL = null;
function bgFull() {
  if (BG_FULL && BG_FULL.lang === LANG) return BG_FULL.c;
  const [c, g] = makeCanvas(W, H), prev = G;
  setCtx(g); drawBg(); setCtx(prev);
  BG_FULL = { c, lang: LANG };
  return c;
}

// 卷帘门往上卷：门上的「暂停服务」跟着门卷进上面的箱子，露出店员；苹果哥领完钱走了，门再拉下来
const KIOSK_ROLL = 0.45, KIOSK_SHUT = 3.4;
function drawKiosk(q) {
  if (B.kioskAt === null || now < B.kioskAt) return;
  const lt = now - B.kioskAt;
  if (lt >= KIOSK_SHUT + KIOSK_ROLL) return;
  const [x0, y0, x1] = KIOSK, cx = (x0 + x1) >> 1, w = x1 - x0 - 11;
  const u = lt < KIOSK_SHUT ? Math.min(1, lt / KIOSK_ROLL) : 1 - (lt - KIOSK_SHUT) / KIOSK_ROLL;
  rect(x0 + 6, y0 + 7, x1 - 6, y0 + 30, 'rgb(44,40,36)');
  tinyPerson(cx, y0 + 30, 'rgb(60,90,70)', 'rgb(42,34,31)');
  const k = Math.round(u * 24);
  if (k < 24) G.drawImage(bgFull(), x0 + 6, y0 + 7 + k, w, 24 - k, x0 + 6, y0 + 7, w, 24 - k);
  if (u >= 1) {
    txt(cx, y0 + 8, '退款', 8, 'rgb(120,230,140)', 'ma');
    if (Math.floor(now * 4) % 2 === 0) q.forEach((_, i) => { const [qx, qy] = refundSpot(i); txt(qx, qy - 20, '!', 8, K.WHITE, 'ma'); });
  }
}

// 走在路上的人：去退款队伍、去退款窗口、放行往右、出门往左
function drawWalkers() {
  const keep = [];
  for (const wk of B.walkers) {
    const dist = Math.max(0, (now - wk.t0) * wk.v), L = pathLen(wk.path);
    const pos = along(wk.path, dist);
    const moving = dist < L;
    if (!moving) {
      if (wk.kiosk) {
        // 到了退款窗口：站着等卷帘门拉开、领钱，然后往右走掉
        if (B.kioskAt === null) B.kioskAt = now;
        const [kx, ky] = wk.path[wk.path.length - 1];
        const exit = { look: wk.look, t0: B.kioskAt + KIOSK_SHUT - 0.6, path: [[kx, ky], [kx + 20, 114], [W + 12, 114]], v: WALK, gone: true };
        keep.push(exit);
        tp(kx, ky, wk.look);
        continue;
      }
      if (wk.gone) continue;
      S.world.queue.push(wk.look);
      continue;
    }
    keep.push(wk);
    const step = now >= wk.t0 ? Math.floor(now * 8) % 2 : 0;
    tp(pos[0], pos[1], wk.look, step);
    (wk.extra || []).forEach((lk, i) => tp(pos[0] - 6 - i * 5, pos[1] - 3 + (i % 2) * 4, lk, step));
  }
  B.walkers = keep;
}

// 下班时还在路上的，直接算排进了队伍
function flushWalkers() {
  for (const wk of B.walkers) if (!wk.gone && !wk.kiosk) S.world.queue.push(wk.look);
  B.walkers = [];
}

function drawEntrantWalker() {
  const e = B.ent;
  if (!e || e.instant || now < e.tEnter || e.phase === 'leave') return;
  if (e.phase === 'detained' && now >= e.tDetain + 0.9) return;
  const meta = ASSETS.people[e.person];
  const u = seg(now, e.tEnter, e.tEnter + 0.8);
  const pos = lerp2(QUEUE_FRONT, BOOTH_POS, u);
  const step = u > 0 && u < 1 ? Math.floor(now * 8) % 2 : 0;
  tp(pos[0], pos[1], meta.walker, step);
  (meta.extra || []).forEach((lk, i) => tp(pos[0] - 6 - i * 5, pos[1] - 3 + (i % 2) * 4, lk, step));
}

// —— 结局：安索兹卡崩盘。保安跑路，口号牌、徽章、牌子往下掉 ——
function rotSpr(key, cx, cy, deg) {
  const s = sprite(key);              // 英文版自动换 `:en`
  G.save();
  G.translate(Math.round(cx), Math.round(cy));
  if (deg) G.rotate(deg * Math.PI / 180);
  G.drawImage(ATLAS_IMG, s[0], s[1], s[2], s[3], -s[2] / 2, -s[3] / 2, s[2], s[3]);
  G.restore();
}

function drawCollapse(lt) {
  const g = 700, FL = LANG === 'en' ? ASSETS.fall_en : ASSETS.fall;
  GUARDS.forEach(([gx, gy], k) => {
    const run = Math.max(0, lt - 0.35 - 0.2 * k);
    const x = Math.round(gx + run * 110);
    if (x < W + 8) tinyPerson(x, gy, 'rgb(70,78,60)', 'rgb(40,46,36)', run ? Math.floor(now * 10) % 2 : 0);
  });
  // 口号牌：右头先松，晃下来，再整块砸地上
  {
    const s = sprite('fall:glory'), [ox, oy] = FL.glory;
    const lx = s[2] / 2, ly = s[3] / 2;
    const at = (th) => { const r = th * Math.PI / 180; return [ox + lx * Math.cos(r) - ly * Math.sin(r), oy + lx * Math.sin(r) + ly * Math.cos(r)]; };
    let th, cx, cy;
    if (lt < 0.6) { th = 0; [cx, cy] = at(0); }
    else if (lt < 1.0) { th = 35 * smooth(seg(lt, 0.6, 1.0)); [cx, cy] = at(th); }
    else {
      let cy0;
      [cx, cy0] = at(35);
      const tLand = 1.0 + Math.sqrt(2 * (106 - cy0) / g);
      const u = Math.min(lt, tLand) - 1.0;
      cy = cy0 + 0.5 * g * u * u;
      th = 35 + (4 - 35) * seg(lt, 1.0, tLand);
    }
    rotSpr('fall:glory', cx, cy, th);
  }
  // 徽章：掉下来，落地，一路滚出画面
  {
    const [ox, oy] = FL.emblem;
    let cx = ox + 13.5, cy = oy + 13.5, ang = 0;
    if (lt >= 1.5) {
      const tLand = 1.5 + Math.sqrt(2 * (108 - cy) / g);
      if (lt < tLand) cy += 0.5 * g * (lt - 1.5) ** 2;
      else { const dx = 130 * (lt - tLand); cx += dx; cy = 108; ang = dx / 13.5 * 180 / Math.PI; }
    }
    if (cx < W + 20) rotSpr('fall:emblem', cx, cy, ang);
  }
  // 「仅限支持地区」：柱子一断，整块砸下来，歪在地上
  {
    const s = sprite('fall:sign'), [ox, oy] = FL.sign;
    const u = Math.max(0, lt - 2.1);
    const dropY = Math.min(30, 0.5 * g * u * u);
    rotSpr('fall:sign', ox + s[2] / 2, oy + s[3] / 2 + dropY, 9 * seg(lt, 2.1, 2.4));
  }
}
