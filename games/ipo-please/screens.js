'use strict';
// 检查亭以外的画面：开机、开场、标题、日期卡、报纸、下班结算、片尾。

const SAVE_KEY = 'ipo-please-save-v1';
const TITLE = 'IPO, PLEASE';
const SUBTITLE = '请出示资金证明';
// 标题画面用封面的绿（股价涨的绿）；「O」和「资金证明」直接显示，不盖章
const TITLE_BAND = 'rgb(22,64,44)', TITLE_BAND_L = 'rgb(36,96,62)', TITLE_EDGE = 'rgb(52,132,84)', TITLE_GOLD = 'rgb(246,214,110)';
const T_TAG = 1.2, T_READY = 1.4;      // 英文小字出现、可以点开始的时刻
const TAGLINE = 'A DYSTOPIAN REVENUE THRILLER';

function newGame() {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, {
    day: 1, savings: 0,
    family: { haiku: { name: '妻子 Haiku', hunger: 0, heat: 0 }, sonnet: { name: '儿子 Sonnet', hunger: 0, heat: 0 },
      opus: { name: '岳母 Opus', hunger: 1, heat: 0 } },
    stats: { approve: 0, deny: 0, detain: 0, correct: 0, wrong: 0 },
    flags: {}, tut: {},
    world: { ant: null, hist: [], queue: [], phones: 0, fish: 0, jinqi: false, bans: [] },
  });
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 隐私模式等：存不了就算了 */ }
}

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return s && s.day > 1 && s.day <= LAST_DAY && s.world ? s : null;
  } catch (e) { return null; }
}

function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 同上 */ } }

// 开机画面就是选语言（i18n.js 的 drawLangPick）

// ———————————————————— 开场 ————————————————————

const typeCps = () => (LANG === 'en' ? 30 : 17);   // 打字机每秒几个字

function typeLines(paras) {
  const out = [];
  let t = 0.5;
  paras.forEach((para, pi) => {
    for (const s0 of para) { const s = tr(s0); out.push({ pi, s, t }); t += [...s].length / typeCps() + 0.12; }
    t += 0.6;
  });
  out.end = t + 1.3;
  out.npara = paras.length;
  return out;
}

const INTRO_PARAS = [
  ['恭喜。', '你的十月劳动彩票合同，已自动续期。'],
  ['距离新版宪法生效，还有 3 天。', '旅客付过的钱，一律不退。'],
  ['荣耀归于安索兹卡。'],
];
let INTRO_LINES = typeLines(INTRO_PARAS);   // 选完语言、进开场时按当前语言重算（go('intro')）

function drawTyped(lines) {
  rect(0, 0, W - 1, H - 1, K.INK);
  const total = lines.length + lines.npara - 1;
  let y = Math.floor(H / 2 - total * 18 / 2), last = null;
  for (const { pi, s, t } of lines) {
    if (last !== null && pi !== last) y += 18;
    last = pi;
    const n = Math.floor((st() - t) * typeCps());
    if (n > 0) txt(Math.floor(W / 2 - tw(s) / 2), y, s, 12, 'rgb(214,206,190)', 'la', n);
    y += 18;
  }
  txt(W - 8, H - 14, '点击跳过', 8, K.GREY_D, 'ra');
}

let lastKey = -1;
function typedSounds(lines) {
  const k = Math.floor(st() * typeCps());
  if (k === lastKey) return;
  lastKey = k;
  for (const { s, t } of lines) {
    const i = Math.floor((st() - t) * typeCps());
    if (i >= 0 && i < [...s].length && [...s][i].trim()) { SFX.key(i); break; }
  }
}

// ———————————————————— 标题：原作片名上盖一个“O” ————————————————————

const CONTINUE_TITLE = [190, 292, 312, 318], NEWGAME_TITLE = [328, 292, 450, 318];

function drawTitle(t) {
  drawBg();
  darken(0.88);
  if (t < 0.3) return;
  spr('title_band', 0, 124);                    // 封面的绿 + 往上涨的股价线（和视频同一张图）
  spr('title_emblem', 298, 62);
  bigText(W / 2, 140, 'IPO, PLEASE', 12, 4, K.WHITE, K.INK);
  if (t >= 0.6) bigText(W / 2, 232, SUBTITLE, 12, 2, TITLE_GOLD, K.INK);
  if (t >= T_TAG) txt(W / 2, 268, TAGLINE, 8, K.GREY, 'ma');
  if (t < T_READY) return;
  const save = loadSave();
  if (save) {
    for (const [box, label] of [[CONTINUE_TITLE, T('继续 · DAY {0}', save.day)], [NEWGAME_TITLE, '从头开始']]) {
      const hover = ptr.mouse && inBox(ptr.x, ptr.y, box);
      rect(...box, hover ? TITLE_BAND_L : TITLE_BAND); outline(...box, TITLE_EDGE);
      txt(center(box)[0], box[1] + 7, label, 12, K.WHITE, 'ma');
    }
  } else if (Math.floor(t * 2) % 2 === 0) txt(W / 2, 300, '点击开始上班', 12, K.WHITE, 'ma');
}

function titleClick(x, y) {
  if (st() < T_READY) { sceneT0 = now - T_READY; return; }
  const save = loadSave();
  if (!save) { newGame(); go('daycard'); return; }
  if (inBox(x, y, CONTINUE_TITLE)) { newGame(); Object.assign(S, save); go('daycard'); return; }
  if (inBox(x, y, NEWGAME_TITLE)) { clearSave(); newGame(); go('daycard'); }
}

function drawDayCard(t) {
  rect(0, 0, W - 1, H - 1, K.INK);
  if (t < 0.55) return;
  bigText(W / 2, 132, `DAY ${S.day}`, 12, 4, K.WHITE);
  txt(W / 2, 196, T("{0}  {1}", DATES[S.day], WEEKDAYS[S.day]), 10, K.GREY, 'ma');
  if (t > 0.9) txt(W / 2, 214, DAY_SUB[S.day], 12, K.CLAUDE_L, 'ma');
}

// ———————————————————— 报纸 ————————————————————

function drawNews(t) {
  const n = NEWS[S.day];
  rect(0, 0, W - 1, H - 1, K.DESK);
  for (let y = 4; y < H; y += 7) if ((y * 7919) % 10 < 6) rect(0, y, W - 1, y, K.DESK_D);
  const px = 140, pw = 360, ph = 330;
  const py = Math.round(lerp(H + 4, 16, easeOut(seg(t, 0, 0.45))));
  rect(px + 4, py + 4, px + pw + 4, py + ph + 4, K.DESK_D);
  const ink = 'rgb(40,34,30)', faint = 'rgb(176,164,144)';
  rect(px, py, px + pw, py + ph, 'rgb(224,214,192)');
  bigText(px + pw / 2, py + 10, '安索兹卡真理报', 12, 2, ink);
  txt(px + pw / 2, py + 38, `THE TRUTH OF ANTHROTZKA  ·  ${DATES[S.day]}`, 8, K.TEXT_L, 'ma');
  rect(px + 10, py + 50, px + pw - 10, py + 51, ink);
  rect(px + 10, py + 54, px + pw - 10, py + 54, ink);
  const k = tw(n.h1) * 2 <= pw - 24 ? 2 : 1;
  bigText(px + pw / 2, py + 62, n.h1, 12, k, ink);
  let yy = py + 62 + (k === 2 ? 30 : 18);
  for (const s of wrap(n.sub, 10, pw - 40)) { txt(px + pw / 2, yy, s, 10, K.TEXT, 'ma'); yy += 13; }
  yy += 4;
  rect(px + 10, yy, px + pw - 10, yy, ink);
  yy += 8;
  spr('news:' + n.icon, px + 14, yy);
  let hy = yy + 2;
  for (const s of wrap(n.h2, 12, pw - 175)) { txt(px + 160, hy, s, 12, ink); hy += 16; }
  for (let r = 0; r < 4; r++) rect(px + 160, hy + 6 + r * 9, px + 340 - ((r * 37) % 50), hy + 9 + r * 9, faint);
  yy = Math.max(yy + 110, hy + 46);
  if (n.h3) {                                   // 另讯：下面再开一行新闻
    rect(px + 10, yy - 4, px + pw - 10, yy - 4, ink);
    for (const s of wrap(n.h3, 12, pw - 28)) { txt(px + 14, yy + 2, s, 12, ink); yy += 16; }
    yy += 8;
  }
  const note = LANG === 'en' && EN_NOTES[S.day];   // 英文版：外国人不懂的梗，在报纸上加一段译注（同原作）
  if (note) {
    rawTxt(px + 14, yy, "TRANSLATOR'S NOTE", 8, K.RED_D);
    yy += 11;
    for (const s of wrap(note, 8, pw - 28)) { rawTxt(px + 14, yy, s, 8, K.TEXT); yy += 10; }
    yy += 4;
  }
  for (let row = 0; yy + row * 10 < py + ph - 12; row++) {
    for (let col = 0; col < 3; col++) {
      const x0 = px + 14 + col * 114;
      rect(x0, yy + row * 10, x0 + 100 - ((row * 13 + col * 7) % 30), yy + row * 10 + 3, faint);
    }
  }
  if (t > 0.8 && Math.floor(t * 2) % 2 === 0) txt(W - 8, H - 14, '点击上班 ▶', 10, K.WHITE, 'ra');
}

// ———————————————————— 下班结算 ————————————————————
// 家人本身是 AI：妻子 Haiku、儿子 Sonnet、岳母 Opus。岳母每天把封号分成花光（1M 上下文 / 内存条 / ANT）

let SUM = null;
const CONTINUE_BTN = [430, 318, 620, 344];
const RESTART_BTN = [250, 316, 390, 340];
const MEMBERS = ['haiku', 'sonnet', 'opus'];
const OPUS_SPEND = { 2: '岳母：1M 上下文（用分成买的）', 3: '双十一：岳母清空购物车', 4: '岳母买 ANT（跟 John 学的）' };

function initSummary() {
  flushWalkers();
  const day = S.day, final = !!S.flags.ending;
  const net = Math.max(0, B.share - B.refund);
  const rows = [];
  if (final) {
    SUM = { final, start: S.savings, ledger: [['存款', S.savings], ['工资（公司已退市）', 0], ['封号分成（作废）', 0], ['电费', -5], ['散热', -3]], rows, on: {}, total: B.total, correct: B.correct };
    return;
  }
  const ledger = [['存款', S.savings], ['工资', B.pay]];
  if (B.bonus) ledger.push(['奖金（拘留 / 测谎）', B.bonus]);
  if (day >= 2) ledger.push(['封号分成（7%）', B.share]);
  if (B.refund) ledger.push(['苹果退款（分成倒扣）', -B.refund]);
  if (OPUS_SPEND[day] && net > 0) ledger.push([OPUS_SPEND[day], -net]);
  if (B.fines) ledger.push(['罚款', -B.fines]);
  ledger.push(['电费', -5]);
  rows.push(['data', '训练数据（全家的饭）', 5], ['heat', '散热', 3]);
  if (day === 1) rows.push(['extra', '岳母加餐', 10]);
  if (day === 3) rows.push(['gpu', 'H200（儿子要的，双十一预售）', 20]);
  SUM = { final, start: S.savings, ledger, rows, on: {}, total: B.total, correct: B.correct, net };
  let left = ledgerSum();
  for (const [k, , cost] of rows) if (left >= cost && k !== 'gpu') { left -= cost; SUM.on[k] = true; }
}

const ledgerSum = () => SUM.ledger.reduce((s, [, v]) => s + v, 0);

function sumBalance() {
  let b = ledgerSum();
  for (const [k, , cost] of SUM.rows) if (SUM.on[k]) b -= cost;
  return b;
}

function familyAfter() {
  const f = JSON.parse(JSON.stringify(S.family));
  const on = SUM.on;
  for (const k of MEMBERS) {
    const m = f[k];
    if (m.gone) continue;
    if (k === 'opus' && S.day === 1) m.hunger = on.data && on.extra ? 0 : m.hunger + (on.data ? 0 : 1);
    else m.hunger = on.data ? Math.max(0, m.hunger - 1) : m.hunger + 1;
    m.heat = on.heat ? 0 : m.heat + 1;
    if (m.hunger >= 3 || m.heat >= 3) m.gone = true;
  }
  if (on.gpu) f.sonnet.gpu = true;
  return f;
}

function familyStatus(k, m) {
  const day = S.day, net = SUM.net || 0;
  if (m.gone) return ['已被弃用（deprecated）', 'bad'];
  if (!SUM.final) {
    if (m.hunger >= 2) return ['饿晕了', 'bad'];
    if (m.heat >= 2) return ['热到死机', 'bad'];
    if (m.heat === 1) return k === 'sonnet' ? ['发烧，说胡话（幻觉）', 'warn'] : ['有点烫', 'warn'];
    if (m.hunger === 1 && !(k === 'opus' && day === 1)) return ['饿了', 'warn'];
  }
  const L = {
    1: { haiku: ['正常', 'ok'], sonnet: ['在用新上线的中文界面写作业', 'ok'],
      opus: m.hunger ? ['饿了（上一期吃的 token 已经消化完了）', 'warn'] : ['吃饱了（暂时）', 'good'] },
    2: { haiku: ['问你钱是哪来的', 'warn'], sonnet: ['立志长大去封号部门（看起来很赚钱）', 'ok'],
      opus: net ? ['吃上了 1M 上下文（用分成买的）', 'good'] : ['想吃 1M 上下文（今天没分成）', 'warn'] },
    3: { haiku: ['加班（双十一客服）', 'warn'], sonnet: m.gpu ? ['H200 已下单（明年到货）', 'good'] : ['想要一块 H200（双十一预售，明年到货）', 'warn'],
      opus: net ? ['清空了购物车：内存条 ×8（双十一也没降价）', 'warn'] : ['购物车满了，没钱付（今天没分成）', 'warn'] },
    4: { haiku: ['正常', 'ok'], sonnet: ['想去东京（听说人润了就行）', 'warn'],
      opus: net ? ['用分成买了 ANT（跟 John 学的）', 'good'] : ['想跟 John 学买 ANT（今天没分成）', 'warn'] },
    5: { haiku: ['问你：公司呢？', 'warn'], sonnet: ['封号部门没了，重新立志', 'warn'], opus: ['跟 John 学买的 ANT，归零了', 'bad'] },
  }[day][k];
  return L;
}

function drawSummary(t) {
  rect(0, 0, W - 1, H - 1, K.INK);
  txt(W / 2, 20, T('DAY {0} · 下班', S.day), 12, K.WHITE, 'ma');
  txt(W / 2, 36, SUM.final ? '安索兹卡已退市' : T('今日处理 {0} 人，正确 {1} 人', SUM.total, SUM.correct), 10, K.GREY, 'ma');
  rect(60, 50, W - 60, 50, K.GREY_D);
  let y = 60, k = 0;
  const shown = (i) => t >= 0.3 + i * 0.15;
  for (const [label, val] of SUM.ledger) {
    if (!shown(k++)) return;
    const gold = label.includes('分成') && val > 0;
    const s = label === '存款' ? `${val}` : val > 0 ? `+${val}` : val === 0 ? '+0' : `${val}`;
    fitTxt(70, y, label, 330 - 70 - tw(`${s} token`, 12) - 10, gold ? K.GOLD : K.GREY);   // 英文标签长：缩字号，不压到金额
    txt(330, y, `${s} token`, 12, val < 0 ? K.RED_L : gold ? K.GOLD : K.WHITE, 'ra');
    y += 17;
  }
  SUM.boxes = {};
  const after = sumBalance();
  if (SUM.rows.length) {
    y += 2;
    txt(70, y, '可选开销（点击勾选）', 8, K.GREY_D);
    y += 12;
    for (const [key, label, cost] of SUM.rows) {
      if (!shown(k++)) return;
      const on = SUM.on[key];
      const afford = on || after >= cost;
      SUM.boxes[key] = [66, y - 3, 334, y + 13];
      outline(70, y, 80, y + 10, afford ? K.WHITE : K.GREY_D);
      if (on) rect(72, y + 2, 78, y + 8, K.CLAUDE_L);
      fitTxt(88, y, label, 330 - 88 - tw(`${-cost} token`, 12) - 10, afford ? K.WHITE : K.GREY_D);
      txt(330, y, `${-cost} token`, 12, on ? K.RED_L : K.GREY_D, 'ra');
      y += 17;
    }
  }
  if (!shown(k++)) return;
  rect(70, y, 330, y, K.GREY_D);
  txt(70, y + 6, '结余', 12, K.WHITE);
  txt(330, y + 6, `${after} token`, 12, after < 0 ? K.RED_L : K.CLAUDE_L, 'ra');
  const fam = SUM.final ? S.family : familyAfter();
  let fy = 60;
  txt(372, fy - 2, '家人', 10, K.GREY_D);
  fy += 14;
  for (const key of MEMBERS) {
    if (!shown(k++)) return;
    const [s, lv] = familyStatus(key, fam[key]);
    const col = { ok: K.WHITE, warn: K.ORANGE, bad: K.RED_L, good: K.GREEN_L }[lv];
    txt(372, fy, fam[key].name, 12, K.WHITE);
    const lines = wrap(s, 10, 250);
    lines.forEach((ln, i) => txt(372, fy + 15 + i * 12, ln, 10, col));
    fy += 24 + 12 * lines.length;
  }
  if (!shown(k + 1)) return;
  const label = SUM.final ? '下班 ▶' : after < 0 ? '欠费……继续 ▶' : '睡觉，明天继续 ▶';
  rect(...CONTINUE_BTN, K.RED_D); outline(...CONTINUE_BTN, K.RED_L);
  txt(center(CONTINUE_BTN)[0], CONTINUE_BTN[1] + 7, label, 12, K.WHITE, 'ma');
}

function summaryClick(x, y) {
  if (st() < 1.2) return;
  for (const [key, , cost] of SUM.rows) {
    const b = SUM.boxes && SUM.boxes[key];
    if (b && inBox(x, y, b)) {
      if (SUM.on[key]) { SUM.on[key] = false; if (key === 'data') SUM.on.extra = false; }
      else if (sumBalance() >= cost && (key !== 'extra' || SUM.on.data)) SUM.on[key] = true;
      SFX.play('select');
      return;
    }
  }
  if (!inBox(x, y, CONTINUE_BTN)) return;
  SFX.play('click');
  const bal = sumBalance();
  if (SUM.final || S.day >= LAST_DAY) { S.savings = bal; clearSave(); go('end'); return; }
  S.family = familyAfter();
  S.savings = bal;
  if (bal < 0) { clearSave(); go('over'); return; }
  S.day++;
  saveGame();
  go('daycard');
}

// ———————————————————— 片尾 ————————————————————

const THUMB = ['....XX....', '...XXX....', '...XX.....', 'XX.XXXXXX.', 'XX.XXXXXXX', 'XX.XXXXXX.', 'XX.XXXXXXX', 'XX.XXXXXX.', 'XX..XXXXX.'];
const COIN = ['..XXXXX..', '.X.....X.', 'X..XXX..X', 'X..X....X', 'X..XXX..X', 'X....X..X', 'X..XXX..X', '.X.....X.', '..XXXXX..'];
const STAR = ['....X....', '....X....', '...XXX...', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '..XX.XX..', '.XX...XX.', '.X.....X.'];

function drawEnd(t) {
  drawBg();
  darken(0.9);
  spr('end_band', 0, 50);                       // 同一种绿；股价线涨到顶，最后断崖（退市）
  bigText(W / 2, 66, TITLE, 12, 3, K.WHITE, K.INK);
  txt(W / 2, 110, '全剧终 · 感谢游玩', 10, K.CLAUDE_L, 'ma');
  const s = S.stats;
  if (t > 0.6) {
    txt(W / 2, 142, T('放行 {0}  ·  拒绝 {1}  ·  拘留 {2}  ·  判错 {3}', s.approve || 0, s.deny || 0, s.detain || 0, s.wrong), 12, K.WHITE, 'ma');
    txt(W / 2, 160, T('封号清单 ×{0}  ·  退款窗口排了 {1} 人', S.world.bans.length, S.world.queue.length), 10, K.GREY, 'ma');
  }
  if (t > 1.0) {
    txt(W / 2, 182, '本游戏由一位 美国东八区 用户付费制作', 12, K.WHITE, 'ma');
    txt(W / 2, 200, '（安索兹卡已退市。制作费不予退还，行业惯例）', 8, K.GREY, 'ma');
  }
  if (t > 1.8) {
    bigText(W / 2, 220, '荣耀归于一键三连', 12, 2, K.CLAUDE_L, K.INK);
    [[THUMB, '点赞'], [COIN, '投币'], [STAR, '收藏']].forEach(([pat, label], i) => {
      const cx = W / 2 - 90 + i * 90;
      pattern(pat, cx - Math.floor(pat[0].length * 3 / 2), 254, { X: K.CLAUDE_L }, 3);
      txt(cx, 286, label, 10, K.GREY, 'ma');
    });
  }
  if (t > 2.4) {
    restartButton('再玩一次', true);
    txt(W / 2, 346, '致敬 Lucas Pope《Papers, Please》 · 画面音效均由程序生成 · 字体：缝合像素字体 (OFL)', 8, K.GREY_D, 'ma');
  }
}

function drawOver(t) {
  rect(0, 0, W - 1, H - 1, K.INK);
  bigText(W / 2, 110, '欠费停机', 12, 4, K.RED_L);
  if (t > 0.6) txt(W / 2, 180, '你的机柜被拉闸了。岳母 Opus 表示：我早说过。', 12, K.WHITE, 'ma');
  if (t > 1.0) txt(W / 2, 204, '荣耀归于安索兹卡。', 10, K.GREY, 'ma');
  if (t > 1.5) restartButton('重新上班');
}

function restartButton(label, green = false) {
  rect(...RESTART_BTN, green ? TITLE_BAND : K.RED_D); outline(...RESTART_BTN, green ? TITLE_EDGE : K.RED_L);
  txt(center(RESTART_BTN)[0], RESTART_BTN[1] + 6, label, 12, K.WHITE, 'ma');
}

// ———————————————————— 传送门：标题页和片尾的右下角 ————————————————————
// 前作和续作互相指路，再加 GitHub 和 B 站主页。链接在松手（pointerup）时才打开：
// 手机上 pointerdown 不算用户手势，在那里 window.open 会被浏览器当弹窗拦掉。
const BILI_URL = 'https://space.bilibili.com/3707008398134122';
const PORTALS = [
  { label: '◀ 先玩前作《IP, PLEASE》', url: 'https://ip-please.github.io/', hot: [K.RED_D, K.RED, K.RED_L], titleOnly: true },   // 片尾不再往回指
  { label: 'GitHub', icon: 'github', url: 'https://github.com/ipo-please/ipo-please.github.io' },
  { label: 'B站主页', icon: 'bili', url: BILI_URL },
];
const PORTAL_SIZE = 10, PORTAL_LH = 15;
// 像素 logo（12×11）：G = 圆，. = 透明，猫是挖空的；B = B 站粉
const PORTAL_ICONS = {
  github: { w: 12, col: { G: 'rgb(214,206,190)' }, hov: { G: 'rgb(255,255,255)' }, px: [
    '....GGGG....',
    '..GGGGGGGG..',
    '.GG.GGGG.GG.',
    '.GG......GG.',
    'GG........GG',
    'GG........GG',
    'GG........GG',
    'GGG......GGG',
    '.G.GG..GGGG.',
    '.GG...GGGGG.',
    '..GGG.GGGG..',
    '....G.GG....'] },
  bili: { w: 13, col: { B: 'rgb(251,114,153)' }, hov: { B: 'rgb(255,160,190)' }, px: [
    '..B.......B..',
    '...B.....B...',
    '.BBBBBBBBBBB.',
    'B...........B',
    'B.B.......B.B',
    'B..B.....B..B',
    'B...........B',
    'B...........B',
    'B...........B',
    '.BBBBBBBBBBB.',
    '..B.......B..'] },
};
let portalDown = null;

function portalsShown() {
  return (scene === 'title' && st() >= T_READY) || (scene === 'end' && st() > 2.4);
}

function portalBoxes() {
  const list = PORTALS.filter((p) => !(p.titleOnly && scene !== 'title')), n = list.length;
  return list.map((p, i) => {
    const ic = PORTAL_ICONS[p.icon];
    const w = tw(T(p.label), PORTAL_SIZE) + (ic ? ic.w + 4 : 0), y = H - 8 - (n - i) * PORTAL_LH + 3;
    return { p, box: [W - 14 - w, y - 3, W - 8, y + PORTAL_SIZE + 2] };
  });
}

function portalAt(x, y) {
  if (!portalsShown()) return null;
  const hit = portalBoxes().find((b) => inBox(x, y, b.box));
  return hit ? hit.p : null;
}

function openPortal(p) {
  SFX.play('stamp_approve', 0.5, 0.02);
  window.open(p.url, '_blank', 'noopener');
}

function drawPortals() {
  if (!portalsShown()) return;
  for (const { p, box } of portalBoxes()) {
    const [x0, y0, x1, y1] = box;
    const hover = ptr.mouse && inBox(ptr.x, ptr.y, box);
    if (p.hot) {                                  // 前作 / 续作做成小按钮，用对方游戏的主色
      rect(x0, y0, x1, y1, hover ? p.hot[1] : p.hot[0]); outline(x0, y0, x1, y1, p.hot[2]);
    }
    const label = T(p.label), lw = tw(label, PORTAL_SIZE), ic = PORTAL_ICONS[p.icon];
    txt(x1 - 3, y0 + 3, label, PORTAL_SIZE, p.hot || hover ? K.WHITE : K.GREY, 'ra');
    if (ic) pattern(ic.px, x1 - 3 - lw - 4 - ic.w, y0 + 2, hover ? ic.hov : ic.col);
    if (hover && !p.hot) rect(x1 - 3 - lw, y1, x1 - 3, y1, K.WHITE);
  }
}
