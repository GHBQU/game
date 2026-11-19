'use strict';
// 检查亭：旅客进出、证件、盖章、检查模式、测谎、拘留、先付款、GPS、企查、封号清单。画面布局沿用 pp/booth.py 的坐标。
// 上半屏（股价屏、退款窗口、排队区的手机和鱼、崩盘）在 world.js。

const WIN = [8, 134, 210, 262], WIN_W = 203, WIN_H = 129, WIN_CX = 101;
const SPEAKER = [6, 290, 24, 306];
const DETAIN_BTN = [172, 268, 212, 280];
const QUIZ_BTN = [126, 268, 166, 280];
const LOOKUP_BTN = [372, 322, 404, 354];
const BAN_BTN = [412, 308, 452, 359];
const LOCATE_BTN = [462, 322, 494, 354];
const BOOK_BOX = [500, 306, 556, 359];
const RULE_BTN = BOOK_BOX;
const XRAY_BTN = [566, 322, 598, 354];
const INSPECT_BTN = [602, 322, 634, 354];
const STAMP_ICON = ['.XXX.', '.XXX.', '..X..', 'XXXXX', 'XXXXX'];
const BANNER_TOP = [300, 134, 598, 168], BANNER_LOW = [300, 270, 598, 304];
// 检查横幅默认在上面；挡住了刚点的栏位（打印机吐出来的单子就在那儿）就挪到下面
function bannerBox() {
  const hit = B.insp.sel.some((s) => { const b = s.box(); return b[2] >= BANNER_TOP[0] && b[0] <= BANNER_TOP[2] && b[3] >= BANNER_TOP[1] - 2 && b[1] <= BANNER_TOP[3] + 2; });
  return hit ? BANNER_LOW : BANNER_TOP;
}
const askBox = () => { const b = bannerBox(); return [548, b[1] + 6, 590, b[1] + 28]; };
const BANLIST = [226, 132, 632, 314];
const BAN_COLS = 4, BAN_CELL = [99, 80], BAN_PER = 8;
const TRAY_Y0 = 196, TRAY_Y1 = 252, TRAY_W = 170, TRAY_X = W - TRAY_W;
const MARK_XY = { approve: [483, 220], deny: [562, 220] };
const BOOTH_POS = [312, 117], QUEUE_FRONT = [292, 102];
const PRINT_X = 240;
const DESK = [220, 128, W - 1, H - 1];
const GAIN_XY = [620, 152];
const JINQI_WALL = [5, 1];
const WALK = 92;

// —— 全局状态（各脚本共用） ——
let canvasEl, F, now = 0;    // F：离屏画布（整帧先画在这里，再合成到屏幕）
const S = {};                // 跨天的存档
let B = null;                // 当天检查亭的状态
const ptr = { x: 320, y: 180, mouse: false, down: false };
let drag = null;
let scene = 'boot', sceneT0 = 0;
const st = () => now - sceneT0;

// ———————————————————— 一天 ————————————————————

function startDay() {
  const day = S.day, w = S.world;
  if (day >= 2 && w.ant === null) { w.ant = 100; w.hist = [100]; }
  if (day === 4) { w.fish = 0; w.phones = Math.max(w.phones, 22); }
  if (day === 5) { w.phones = Math.max(w.phones, 34); S.flags.s13 = false; }
  B = {
    queue: [], idx: 0, ent: null, docs: [], lines: [], timers: [],
    tray: { open: false, t: -9 }, presses: [], shake: -9,
    insp: { on: false, sel: [], banner: null, all: false },
    xray: { on: false, t: -9 }, printing: null, printQueue: [], slams: [],
    ruleInst: null, rulePos: [228, 136], speakerT: -9,
    pay: 0, bonus: 0, share: 0, refund: 0, fines: 0, cites: 0, correct: 0, total: 0, flash: null, clock0: now,
    ending: false, event: null, cut: null, closeup: null, lastFinish: now, tensionSrc: null,
    antOpen: w.ant, antLast: null, boardNote: null, fireworks: -9, floats: [], phoneNew: -9, fishAnim: null,
    walkers: [], kioskAt: null, bangAt: null, jinqiFly: null, winFx: null, wig: null, flies: [],
    ban: null, blockedT: -9, limit: null, collapse: null, returned: new Set(), notice: { t0: now, lines: DAY_NOTICE[day] || [] },
  };
  B.queue = buildQueue(day);
  if (location.hash === '#john' && day === LAST_DAY) B.idx = B.queue.length - 1;   // 预览：直接叫到 John
}

function later(dt, fn) { B.timers.push({ t: now + dt, fn }); }

function runTimers() {
  const due = B.timers.filter((x) => x.t <= now);
  if (!due.length) return;
  B.timers = B.timers.filter((x) => x.t > now);
  due.sort((a, b) => a.t - b.t).forEach((x) => x.fn());
}

// 对白框放不下就折行：尽量在标点后断开（和视频 booth.wrap_line 一样）
function wrapLine(text, width = 176) {
  if (LANG === 'en' && / /.test(text)) return wrapWords(text, 12, width);   // 英文按单词折
  const out = [];
  let cur = [...text];
  while (rawTw(cur.join(''), 12) > width) {
    let n = cur.length;
    while (n > 1 && rawTw(cur.slice(0, n).join(''), 12) > width) n--;
    let cut = 0;
    for (let i = 0; i < n; i++) if ('，。！？、；：… ,'.includes(cur[i])) cut = i + 1;
    if (cut < n * 0.45) cut = n;
    out.push(cur.slice(0, cut).join(''));
    cur = cur.slice(cut);
    while (cur[0] === ' ') cur.shift();
  }
  out.push(cur.join(''));
  return out;
}

// 一句话打完要多久（折行的每段之间留 0.05 秒）；text 是原文，英文模式下按译文算
const typeTime = (text) => wrapLine(tr(text)).reduce((a, part) => a + [...part].length / typeSpeed() + 0.05, 0);

// 左下角对白排队：上一句没打完，下一句就等它打完（两段台词同时触发时也不会叠在一起）
function say(who, text) {
  const e = B.ent;
  const start = Math.max(now, (B.sayFree || 0) + 0.15);
  B.sayFree = start + typeTime(text);
  if (start > now + 0.001) { later(start - now, () => sayNow(who, text, e)); return; }
  sayNow(who, text, e);
}

function sayNow(who, text, e) {
  // full 留原文（检查模式拿它和马脚、虐待台词比对）；text 是显示用的（英文模式下是译文）
  const shown = tr(text);
  let t = now;
  for (const part of wrapLine(shown)) {
    B.lines.push({ t, who, text: part, full: text, ent: e });
    t += [...part].length / typeSpeed() + 0.05;
  }
  const pitch = who === 'C' ? 176 : who === 'S' ? 150 : (e ? e.spec.voice : 125);
  if (who !== 'S') SFX.mumble(shown, pitch, B.lines.length * 7 + S.day);
  if (who === 'E' && e && B.ent === e) e.talkUntil = now + Math.min(1.3, 0.25 + 0.065 * readLen(shown));
}

// 一句台词要停多久：打完、读完（每秒 9 个字），再喘 0.2 秒（视频审片定下的规矩）
const lineHold = (text, hold) => { const s = tr(text); return Math.max(hold !== undefined ? hold : 0, [...s].length / typeSpeed() + readTime(s, 9) + 0.2, 0.9); };

// 按顺序播放一串台词/动作，返回总时长
function runSteps(steps, delay = 0) {
  let t = delay;
  const e = B.ent;
  for (const s0 of steps || []) {
    let who, text, o;
    if (Array.isArray(s0)) [who, text, o] = s0; else o = s0;
    o = o || {};
    later(t, () => {
      if (B.ent !== e) return;
      if (e) {
        if (o.expr) e.expr = o.expr;
        if (o.sweat && e.sweatT === null) e.sweatT = now;
        if (o.slip) { e.slip = true; e.expr = 'shock'; }
      }
      if (o.fx) runFx(o.fx, e);
      if (text) say(who, text);
    });
    t += text ? lineHold(text, o.hold) : (o.hold || 0);
  }
  if (e) e.busyUntil = Math.max(e.busyUntil || 0, now + t);
  return t;
}

function newEntrant(spec, instant) {
  return {
    spec, person: spec.person, tEnter: instant ? now - 1 : now + 0.35, phase: instant ? 'here' : 'enter',
    expr: ASSETS.people[spec.person].expr, talkUntil: 0, sweatT: null, slip: false, busyUntil: 0,
    decided: null, asked: new Set(), found: new Set(), quizDone: [], docs: [], placed: new Set(), instant, suspect: false,
  };
}

const nextItem = () => B.queue[B.idx];
const isEvent = (it) => it && it.type;
const busy = () => B.ent || B.event || B.cut || B.closeup || B.ending || B.limit || B.collapse;

function callNext() {
  SFX.play('click');
  if (busy() || B.idx >= B.queue.length) return;
  B.notice = null;
  if (isEvent(nextItem())) { startEvent(B.queue[B.idx++]); return; }
  B.speakerT = now;
  SFX.play('intercom', 1, 0.03);
  say('C', '下一位！');
  S.tut.called = true;
  const spec = B.queue[B.idx++];
  const e = newEntrant(spec, false);
  B.ent = e;
  for (let i = 0; i < 4; i++) later(0.41 + i * 0.19, () => SFX.step(i));
  later(1.15, () => {
    if (B.ent !== e) return;
    e.phase = 'here';
    if (spec.tension) B.tensionSrc = SFX.play('tension', 0.9);
    const t = runSteps(spec.intro);
    later(t + (spec.intro.length ? 0 : 0.4), () => payThenHand(e));
  });
}

// Day 2 起：先付款，再检查
function payThenHand(e) {
  if (B.ent !== e) return;
  const spec = e.spec;
  if (S.day < 2 || spec.pay === false) { handDocs(e); return; }
  if (!spec.pay) spec.pay = randPay();
  const p = spec.pay;
  e.paid = p;
  let t = 0;
  if (p.say || !B.firstPaid) { B.firstPaid = true; t = runSteps([['C', '请先付款。']].concat(p.after || [])); }
  later(t, () => {
    if (B.ent !== e) return;
    printDoc(new PrintStrip(p.lines), 0.6, 'rc', e);
    later(0.55, () => SFX.play('kaching'));
    later(0.8, () => handDocs(e));
  });
}

function handDocs(e) {
  if (B.ent !== e) return;
  const spec = e.spec;
  SFX.paper(S.day);
  if (spec.docs.some((d) => d.key === 'pp')) later(0.1, () => SFX.play('thud', 0.5));
  const n = spec.docs.length, x0 = n >= 5 ? 40 : 48, step = n >= 5 ? 16 : 19;
  e.docs = spec.docs.map(({ key, doc, gift }, i) => {
    const inst = { doc, key, owner: 'ent', gift, big: false, x: x0 + i * step, y: 265, slot: [x0 + i * step, 265], marks: [] };
    B.docs.push(inst);
    return inst;
  });
  if (spec.bare) e.person = spec.bare;
  e.handed = true;
  e.handedAt = now;
  let t = spec.after ? runSteps(spec.after, 0.3) : 0;
  const ab = spec.abuse;
  if (ab && ab.when === 'after') {
    runSteps((ab.pre || []).concat(ab.claude || [], ab.lines, [{ fx: 'abused' }]), t + 0.3);
  }
  if (ab && ab.when === 'slow') {
    later(14, () => {
      if (B.ent !== e || e.decided || e.phase !== 'here') return;
      runSteps(ab.lines.concat([{ fx: 'abused' }]));
    });
  }
  // 最后的 John：玩家随便操作，他都不走；太久没点『企查』，他就提醒一句、『企查』开始闪
  if (spec.ending) later(Math.max(t, 0) + JOHN_HINT_AFTER, () => johnEndingHint(e));
}

const decisionOf = (inst) => (inst.marks.length ? inst.marks[inst.marks.length - 1].kind : null);
function primaryOf(e) { return e.docs.find((d) => d.key === e.spec.primary); }

function checkLeave() {
  const e = B.ent;
  if (!e || e.phase !== 'here') return;
  const prim = primaryOf(e);
  if (!prim || !prim.returned) return;
  if (B.docs.some((d) => d.owner === 'ent' && d.big && !d.loose && !d.gift)) {
    if (!e.complained) { e.complained = true; say('E', '我的证件还在你那儿。'); }
    return;
  }
  const dec = decisionOf(prim);
  e.phase = 'waiting';
  later(Math.max(0, e.busyUntil - now) + 0.2, () => leave(e, dec));
}

function leave(e, dec) {
  if (B.ent !== e) return;
  e.phase = 'leave'; e.tLeave = now;
  e.dir = dec === 'approve' ? 'right' : e.spec.leave === 'out' ? 'left' : e.refunded ? 'kiosk' : 'refund';
  stopTension();
  for (let i = 0; i < 3; i++) later(i * 0.22, () => SFX.step(3 + i));
  if (B.docs.some((d) => d.gift)) runFx('jinqi', e);      // 锦旗还没挂上墙的话，走之前挂上
  later(0.15, () => { B.docs = B.docs.filter((d) => d.owner !== 'ent'); });
  const look = ASSETS.people[e.person].walker;
  if (e.dir === 'refund') {
    const idx = S.world.queue.length + B.walkers.filter((w) => !w.gone && !w.kiosk).length;
    B.walkers.push({ look, t0: now, path: [BOOTH_POS, [330, 121], [378, 121], refundSpot(idx)], v: WALK });
  } else if (e.dir === 'kiosk') {
    const w = { look, t0: now, path: [BOOTH_POS, [330, 121], [400, 121], [556, 104]], v: WALK * 2, kiosk: true };
    B.walkers.push(w);
  } else {
    const path = e.dir === 'right' ? [BOOTH_POS, [352, 112], [720, 112]] : [BOOTH_POS, [296, 122], [-20, 122]];
    B.walkers.push({ look, t0: now, path, v: 70, gone: true, extra: ASSETS.people[e.person].extra });
  }
  later(0.65, () => finish(e, dec));
}

function detain() {
  const e = B.ent;
  SFX.play('click');
  if (S.day >= 4) { detainBlocked(); return; }
  if (!e || !['here', 'waiting'].includes(e.phase) || !e.handed || B.event) return;
  B.detainT = now;
  S.tut.detain = true;
  e.phase = 'detained'; e.tDetain = now + 0.2;
  stopTension();
  SFX.play('detain');
  SFX.play('scuffle', 1, 0.2);
  antJump(1.07);
  if (e.abused) {
    say('C', '不得虐待 Claude。');
    later(0.5, () => { if (!S.flags.endedOnce) { S.flags.endedOnce = true; say('S', '本次对话已结束。'); } });
    if (e.spec.abuse && e.spec.abuse.dragged) later(1.35, () => { say('E', e.spec.abuse.dragged); e.expr = 'shock'; });
  }
  later(1.2, () => { B.docs = B.docs.filter((d) => d.owner !== 'ent'); });
  later(2.6, () => finish(e, 'detain'));
}

// 11.12 之后：按拘留键，没有反应
function detainBlocked() {
  B.blockedT = now;
  SFX.play('discrepancy', 1, 0.12);
  const e = B.ent;
  if (e && e.spec.react && e.spec.react.blocked && !e.blockedSaid) { e.blockedSaid = true; runSteps(e.spec.react.blocked, 0.3); }
}

function stopTension() { if (B.tensionSrc) { SFX.stop(B.tensionSrc); B.tensionSrc = null; } }

function finish(e, dec) {
  if (B.ent !== e) return;
  B.ent = null;
  B.lastFinish = now;
  if (!e.noJudge) judge(e, dec);
  if ((dec === 'deny' || dec === 'detain') && !e.spec.author && !e.noJudge) addBan(e.spec, e.spec.person);
  const then = e.spec.then;
  if (then === 'chat' && dec === 'approve') { startChat(); return; }
  if (then === 'apple') S.flags.apple = true;
  if (B.idx >= B.queue.length && !B.cut && !B.closeup && !B.collapse) endDaySoon();
}

function judge(e, dec) {
  const spec = e.spec;
  B.total++;
  S.stats[dec] = (S.stats[dec] || 0) + 1;
  if (spec.author) return;
  // 封号即营收：拒绝 / 拘留已付款的旅客，7% 分成
  if ((dec === 'deny' || dec === 'detain') && e.paid) {
    const cut = Math.round(e.paid.amount * 0.07);
    B.share += cut;
    if (e.refunded) B.refund += cut;
  }
  let ok;
  if (dec === 'detain') ok = !!e.abused || (!!e.exposed && !spec.ok.includes('approve'));
  else if (e.abused) ok = S.day >= 4 && dec === 'deny';
  else ok = spec.ok.includes(dec);
  if (ok) {
    B.correct++; S.stats.correct++;
    B.pay += 5;
    if (dec === 'detain') B.bonus += 5;
    if (dec === 'deny' && e.exposed) B.bonus += 3;
    return;
  }
  S.stats.wrong++;
  let lines;
  if (dec === 'detain') lines = ['无故拘留旅客', spec.wrongDetain || '没有测谎露馅，也没有虐待 Claude'];
  else if (e.abused) lines = dec === 'approve' ? ['放行了虐待 Claude 的旅客', '不得虐待 Claude：应当场拘留'] : ['虐待 Claude 的应当场拘留', '按柜台上的『拘留』'];
  else if (dec === 'approve') lines = ['放行了不合规旅客', spec.reason || ''];
  else lines = ['拒绝了合规旅客', spec.wrongDeny || '证件齐全，信息一致'];
  if (dec === 'approve' && spec.hint && !e.abused) lines.push(spec.hint);
  if (dec === 'deny' && !e.abused && e.paid) lines.push('（分成照收，行业惯例）');
  cite(lines);
}

// 开一张警告单：每天第一张只警告，之后每张罚 5 token
function cite(lines, delay = 0.5) {
  B.cites++;
  if (B.cites > 1) B.fines += 5;
  lines.push(B.cites > 1 ? '罚款：5 token' : '首次警告，不扣 token');
  later(delay, () => printDoc(new Citation(lines), 1.1, 'cit'));
}

function printDoc(doc, dur, key, ent = null) {
  if (B.printing) { B.printQueue.push([doc, dur, key, ent]); return; }
  B.printing = { doc, t0: now, dur };
  SFX.printer(Math.round(dur * 10) / 10);
  later(dur, () => {
    B.printing = null;
    // 打给某位旅客的单子（小票、定位、企查）跟着旅客走；旅客已经走了就作废
    if (!ent) B.docs.push({ doc, key, owner: 'desk', big: true, x: PRINT_X, y: 131, marks: [] });
    else if (B.ent === ent) {
      const inst = { doc, key, owner: 'ent', loose: true, big: true, x: PRINT_X, y: 131, marks: [] };
      B.docs.push(inst);
      ent.docs.push(inst);
    }
    if (key === 'cit') SFX.play('citation');
    if (B.printQueue.length) printDoc(...B.printQueue.shift());
  });
}

function endDaySoon() {
  if (B.ending) return;
  B.ending = true;
  const wait = B.printing ? 2 : 0;
  later(2.4 + wait, () => SFX.play('bell'));
  later(4.2 + wait, () => go('summary'));
}

function flash(text) { B.flash = { text, t: now }; }

// ———————————————————— 钱、股价、封号清单 ————————————————————

function antJump(f) {
  const w = S.world;
  if (w.ant === null) return;
  w.ant *= f;
  w.hist.push(w.ant);
  if (w.hist.length > 40) w.hist.shift();
  B.antLast = { t: now, f };
  if (f > 1 && w.phones > 0) { w.phones++; B.phoneNew = now; }
}

function addFloat(s, col) { B.floats.push({ t0: now, s, col }); }

function addBan(spec, person) {
  const who = whoOf(spec);
  const name = spec.banName || (spec.docs.find((d) => d.key === 'pp') || { doc: {} }).doc.name || '无名氏';
  const bans = S.world.bans;
  if (bans.some((b) => b.who === who && b.name === name)) return;
  bans.push({ who, name, photo: person || spec.person });
  if (S.day >= 4) {
    B.flies.push({ t0: now, photo: person || spec.person });
    later(0.45, () => SFX.play('thud', 0.6));
  }
}

function banCell(k) {
  const x0 = BANLIST[0] + 4, y0 = BANLIST[1] + 18;
  const [cw, ch] = BAN_CELL, r = Math.floor(k / BAN_COLS), c = k % BAN_COLS;
  return [x0 + c * (cw + 2), y0 + r * (ch + 2), x0 + c * (cw + 2) + cw - 1, y0 + r * (ch + 2) + ch - 1];
}
const banPages = () => Math.max(1, Math.ceil(S.world.bans.length / BAN_PER));
const BAN_PREV = [BANLIST[2] - 112, BANLIST[1], BANLIST[2] - 92, BANLIST[1] + 14];
const BAN_NEXT = [BANLIST[2] - 22, BANLIST[1], BANLIST[2] - 2, BANLIST[1] + 14];

function toggleBan() {
  SFX.paper(13);
  if (B.ban) { B.ban = null; return; }
  B.ban = { t0: now, page: 0 };
  S.tut.ban = true;
}

function banFlip(d) {
  B.ban.page = (B.ban.page + d + banPages()) % banPages();
  SFX.paper(15);
  if (B.insp.on) { B.insp.sel = B.insp.sel.filter((s) => !s.key.startsWith('ban.')); B.insp.banner = null; }
}

// ———————————————————— 证件机关 ————————————————————

function onFirstPlace(d) {
  const e = B.ent;
  if (!e || d.owner !== 'ent' || e.placed.has(d)) return;
  e.placed.add(d);
  const trig = e.spec.onPlace && e.spec.onPlace[d.key];
  if (trig === 'flicker') {
    // 梯子断了：设备卡上几栏当场闪成国内，半秒后跳回去
    later(0.6, () => {
      if (B.ent !== e) return;
      d.doc.flick = { t0: now, dur: 0.55, rows: { IP: '113.88.140.2', 归属: '中国 · 深圳 · 电信' } };
      SFX.play('glitch', 0.6);
      later(0.7, () => { if (B.ent === e) { e.expr = 'nervous'; e.sweatT = now; } });
    });
  }
}

function clampDesk(x, y, doc) {
  return [Math.round(Math.max(DESK[0] + 4, Math.min(W - doc.w - 4, x))), Math.round(Math.max(DESK[1] + 4, Math.min(H - doc.h - 4, y)))];
}

// —— 盖章 ——
function trayU() {
  const { open, t } = B.tray;
  return open ? easeOut(seg(now, t, t + 0.3)) : 1 - smooth(seg(now, t, t + 0.25));
}
function trayX() { return Math.round(lerp(W, TRAY_X, trayU())); }
// 额度用完、作者：这两位不能直接盖章，先演剧情
function gateTray() {
  const e = B.ent;
  if (!e || !e.handed || e.phase !== 'here') return false;
  if (e.spec.limit && !e.limitDone) { usageLimit(e); return true; }
  if (e.spec.then === 'author' && !e.authorDone) { authorTakeover(e); return true; }
  return false;
}

// John 站在窗口前（递完护照）
const johnHere = () => !!B.ent && !!B.ent.spec.ending && B.ent.handed && B.ent.phase === 'here';
const JOHN_HINT_AFTER = 20;   // 递完护照多少秒还没点『企查』，就提醒

// 想把护照还给 John：他不走，护照弹回桌上
function johnRefuse(e) {
  if (!e.endHinted) johnEndingHint(e);
  else say('E', '我不入境。');
  flash('先查查他说的“股东”：桌上的『企查』');
}

function setTray(open) {
  if (B.tray.open === open) return;
  const e = B.ent;
  if (open && gateTray()) return;
  B.tray = { open, t: now };
  SFX.play(open ? 'tray' : 'tray_back');
  if (open) S.tut.tray = true;
}

function stampBtnBox(kind, tx) {
  const bx = tx + (kind === 'approve' ? 10 : 90);
  return [bx, TRAY_Y0 + 8, bx + 64, TRAY_Y0 + 48];
}

function stamp(kind) {
  if (gateTray()) { setTray(false); return; }
  B.presses.push({ t: now, kind });
  SFX.play('stamp_' + kind, 1, 0.03);
  B.shake = now + 0.05;
  const [mx, my] = MARK_XY[kind];
  const cx = mx + 29, cy = my + 17;
  const target = [...B.docs].reverse().find((d) => d.big && inBox(cx, cy, [d.x, d.y, d.x + d.doc.w - 1, d.y + d.doc.h - 1]));
  if (target) {
    later(0.05, () => target.marks.push({ kind, rx: mx - target.x, ry: my - target.y }));
    S.tut.stamped = true;
    const e = B.ent;
    if (e && target.owner === 'ent' && target.key === e.spec.primary && !e.decided) {
      e.decided = kind;
      stopTension();
      if (kind === 'deny') {
        antJump(1.07);
        if (e.paid) { addFloat('+7%', K.GOLD); later(0.05, () => SFX.play('kaching', 0.7)); }
      }
      if (e.spec.tension && kind === 'approve') SFX.play('fanfare', 1, 0.4);
      const ab = e.spec.abuse;
      if (kind === 'approve' && ab && ab.when === 'approve') runSteps(ab.lines.concat([{ fx: 'abused' }, { hold: 7 }]), 0.4);
      else if (e.spec.react && e.spec.react[kind]) runSteps(e.spec.react[kind], 0.4);
      else if (kind === 'deny' && e.paid && /^P\d\d$/.test(e.spec.person) && Math.random() < 0.5) runSteps([['E', pick(['那我的钱呢？', '钱都付了！', '……能退吗？']), { expr: 'shock' }], ['C', '收入已确认。']], 0.4);
    }
  } else {
    flash('印章下面没有证件：把证件挪到印章正下方');
  }
  later(0.5, () => setTray(false));
}

// —— 规则书 ——
function toggleRules() {
  SFX.paper(5);
  if (B.ruleInst) {
    B.rulePos = [B.ruleInst.x, B.ruleInst.y];
    B.docs = B.docs.filter((d) => d !== B.ruleInst);
    B.ruleInst = null;
    return;
  }
  B.ruleInst = { doc: new Rulebook(S.day), key: 'rule', owner: 'desk', big: true, x: B.rulePos[0], y: B.rulePos[1], marks: [] };
  B.docs.push(B.ruleInst);
  S.tut.rules = true;
}

function ruleTabHit(d, x, y) {
  if (d.key !== 'rule' || d.doc.npages < 2) return false;
  const t = d.doc.tab;
  return inBox(x, y, [d.x + t[0], d.y + t[1], d.x + t[2], d.y + t[3]]);
}

// —— 测谎：Claude 抛上半句，中国人条件反射接下半句 ——
function quiz() {
  SFX.play('click');
  const e = B.ent;
  if (!e || e.phase !== 'here' || !e.handed || B.event) return;
  if (now < e.busyUntil) return;
  if (!e.suspect) { flash('先找到疑点才能测谎：证件矛盾，或者用『检查』点 Ta 说的话'); return; }
  S.tut.quiz = true;
  const q = e.spec.quiz || (e.spec.cn ? {} : null);   // 中国内地的都会条件反射接下半句
  let idx;
  if (q && q.first !== undefined && !e.quizDone.length) idx = q.first;
  else {
    const left = QUIZ.map((_, i) => i).filter((i) => !e.quizDone.includes(i) && i !== 0);
    idx = left.length ? pick(left) : rint(1, QUIZ.length - 1);
  }
  e.quizDone.push(idx);
  const [question, answer] = QUIZ[idx];
  const steps = [['C', question, { hold: 0.7 }]];
  if (q) {
    steps.push(['E', answer, { expr: 'grin', hold: 1.0 }]);
    if (!(q.first !== undefined)) steps.push(['E', '……', { expr: 'shock', hold: 0.9 }]);
    e.exposed = true;
  } else {
    steps.push(['E', pick(QUIZ_CONFUSED), { expr: 'neutral' }]);
  }
  runSteps(steps);
}

// —— X 光 ——
function setXray(on) {
  if (B.xray.on === on) return;
  B.xray = { on, t: now };
  SFX.play(on ? 'xray' : 'click');
  if (on) S.tut.xray = true;
  if (on && B.ent && B.ent.spec.xray) { B.ent.xrayed = true; S.tut.xrayFound = true; }
}

function xrayItemBox(e, it) {
  const ex = entrantX(e);
  const pat = XRAY_ICONS[it.icon];
  const pw = pat[0].length * 2, ph = pat.length * 2;
  const cx = WIN[0] + ex + it.at[0], cy = WIN[1] + it.at[1];
  return [cx - (pw >> 1) - 2, cy - (ph >> 1) - 2, cx + (pw >> 1) + 1, cy + (ph >> 1) + 1];
}

// —— GPS 定位（Day 3 起）——
function locate() {
  SFX.play('click');
  const e = B.ent;
  if (S.day < 3 || !e || e.phase !== 'here' || !e.handed || B.event) return;
  if (e.located) { flash('已经定位过了'); return; }
  e.located = true;
  S.tut.locate = true;
  if (needsGPS(e)) S.tut.gpsFound = true;
  SFX.play('select');
  const L = e.spec.locate || {};
  const dv = e.spec.docs.find((d) => d.key === 'dv');
  const loc = L.loc || (dv ? dv.doc.rows.find(([k]) => k === '归属')[1].replace(/ · (家宽|酒店|公寓)$/, '') : '美国');
  const rows = [['位置', loc]].concat(L.stay ? [['停留', L.stay]] : []).concat([['来源', 'GPS 定位']]);
  const card = new Card(rows, { title: '定位结果', sub: '§7 LOCATION', color: [214, 222, 232], colorD: [176, 188, 204], seal: false });
  if (L.hops) {
    card.hops = { t0: now + 0.7, each: 0.4, list: L.hops, row: '位置', flag: L.stay ? '停留' : null };
    for (let i = 0; i < L.hops.length; i++) later(0.7 + i * 0.4, () => SFX.play('select', 0.5));
    later(0.7 + L.hops.length * 0.4, () => { SFX.play('discrepancy'); if (B.ent === e) { e.sweatT = e.sweatT || now; e.expr = 'nervous'; } });
  }
  printDoc(card, 0.7, 'loc', e);
}

// —— 企查（Day 4 起）：查公司总部、股权穿透 ——
function lookup() {
  SFX.play('click');
  const e = B.ent;
  if (S.day < 4 || !e || e.phase !== 'here' || !e.handed || B.event) return;
  const L = e.spec.lookup;
  if (!L) { flash('没有可查的公司：Ta 没递工牌'); return; }
  if (e.looked) { flash('已经查过了'); return; }
  e.looked = true;
  S.tut.lookup = true;
  SFX.play('select');
  const vx = Math.min(80, 18 + Math.max(...L.rows.map(([k]) => tw(k, 10))));
  const card = new Card(L.rows, { title: L.title, sub: L.sub || '§9', color: [214, 226, 214], colorD: [170, 190, 170], seal: false, valueX: Math.max(38, vx) });
  printDoc(card, 0.7, 'lk', e);
  if (e.spec.ending) {
    e.endHinted = true;
    later(0.7 + 1.8, () => {
      if (B.ent !== e || B.endingSeq) return;
      if (B.insp.on) setInspect(false);
      if (B.xray.on) setXray(false);
      if (B.tray.open) setTray(false);
      B.ban = null;
      startEnding(e);
    });
  }
}

// ———————————————————— 检查模式 ————————————————————

function docBox(d) { return [d.x, d.y, d.x + d.doc.w - 1, d.y + d.doc.h - 1]; }

// 对话框（左下角最近三句）的位置，绘制和检查模式共用
function lineBoxes() {
  // 折行的第二段还没轮到打字时不画（不然第一段还在打，第二段的框就先冒出来了）
  return B.lines.filter((ln) => ln.t <= now).slice(-3).map((ln, i) => {
    const size = rawTw(ln.text, 12) > 182 ? 10 : 12;           // ln.text 已经是显示用的文字
    const y = 288 + i * 17;
    return { ln, size, box: [30, y, 30 + rawTw(ln.text, size) + 8, y + 15] };
  });
}

// 窗口里能点的地方（屏幕坐标）：脸（Day 4 起，用来和封号清单比对）、Ta 身上的破绽
function windowSpots(e) {
  if (!e || !e.handed || entrantX(e) === null || B.xray.on) return [];
  const out = (e.spec.spots || []).map((s) => ({ key: s.key, box: s.box }));
  if (S.day >= 4) out.push({ key: 'win.face', box: FACE });
  return out.map((s) => ({ key: s.key, box: [WIN[0] + s.box[0], WIN[1] + s.box[1], WIN[0] + s.box[2], WIN[1] + s.box[3]] }));
}

function fieldAt(x, y) {
  const e = B.ent;
  if (e && e.handed) {
    for (const { ln, box } of lineBoxes()) {
      if (ln.who === 'E' && ln.ent === e && inBox(x, y, box)) return { key: 'say', ln, box: () => box };
    }
  }
  if (B.xray.on && e && e.spec.xray && entrantX(e) !== null) {
    for (const it of e.spec.xray) {
      const b = xrayItemBox(e, it);
      if (inBox(x, y, [b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3])) return { key: it.key, box: () => xrayItemBox(e, it), xr: it };
    }
  }
  for (const s of windowSpots(e)) if (inBox(x, y, s.box)) return { key: s.key, box: () => s.box };
  if (B.ban && inBox(x, y, BANLIST)) {
    for (let k = 0; k < BAN_PER; k++) {
      const i = B.ban.page * BAN_PER + k;
      if (i < S.world.bans.length && inBox(x, y, banCell(k))) {
        const page = B.ban.page;
        return { key: `ban.${i}`, box: () => (B.ban && B.ban.page === page ? banCell(k) : [0, 0, 0, 0]) };
      }
    }
    return null;
  }
  for (const d of [...B.docs].reverse()) {
    if (!d.big || !inBox(x, y, docBox(d)) || !inBox(x, y, DESK)) continue;
    let best = null;
    for (const [name, f] of Object.entries(d.doc.fields)) {
      const b = [d.x + f[0] - 1, d.y + f[1] - 1, d.x + f[2] + 1, d.y + f[3] + 1];
      if (inBox(x, y, b)) best = { key: `${d.key}.${name}`, d, box: () => [d.x + f[0], d.y + f[1], d.x + f[2], d.y + f[3]] };
    }
    return best || { d, key: null };
  }
  return null;
}

function setInspect(on) {
  B.insp = { on, sel: [], banner: null, all: false };
  SFX.play(on ? 'inspect_on' : 'inspect_off');
  if (on) S.tut.inspect = true;
}

function banIssue(e, keys) {
  const bk = keys.find((k) => k.startsWith('ban.')), other = keys.find((k) => ['win.face', 'win.tail', 'pp.photo'].includes(k));
  if (keys.length !== 2 || !bk || !other) return null;
  const b = S.world.bans[+bk.slice(4)];
  if (!b) return null;
  if (b.who !== whoOf(e.spec) || e.spec.disguised) return { nomatch: true };   // 伪装成功：脸对不上
  const key = `ban:${b.who}`;
  if (!e.banIssue) e.banIssue = { key, pairs: [], title: T('封号记录：{0}', b.name), sub: '§11：封过号的，不得再来（以前封的也算）',
    ask: e.spec.banAsk || [['C', '封过号的，不得再来。'], ['E', '……我换号了啊。', { expr: 'nervous', sweat: true }]] };
  return e.banIssue;
}

// 虐待 Claude 的那几句：点哪一句都能出警告，询问之后再拘留
function abuseIssue(e, text) {
  const ab = e.spec.abuse;
  if (!ab || !ab.lines.some(([, s]) => s === text)) return null;
  if (!e.abuseIssue) e.abuseIssue = { title: ab.title || '虐待 Claude', sub: ab.sub || '不得虐待 Claude', ask: ab.ask, abuse: true };
  return e.abuseIssue;
}

function matchIssue(keys) {
  const e = B.ent;
  if (!e || !e.handed) return null;
  const bi = banIssue(e, keys);
  if (bi) return bi;
  for (const is of e.spec.issues || []) {
    for (const p of is.pairs) {
      if (p.length === keys.length && (p.length === 1 ? p[0] === keys[0] : (p[0] === keys[0] && p[1] === keys[1]) || (p[0] === keys[1] && p[1] === keys[0]))) return is;
      // 「出错的那一栏 + 宪法条款」的组合：单点出错的那一栏就够了（规则太多，减负）
      if (keys.length === 1 && p.length === 2 && p.some((k) => k.startsWith('rule.')) && p.includes(keys[0]) && !keys[0].startsWith('rule.')) return is;
    }
  }
  return null;
}

function showIssue(issue) {
  const e = B.ent, I = B.insp;
  if (issue.nomatch) { I.banner = { title: '不是同一个人', sub: '清单上这张照片和 Ta 对不上', bad: false }; SFX.play('select'); return; }
  I.banner = { title: issue.title, sub: issue.sub, issue, ask: issue.ask && !e.asked.has(issue) && e.phase === 'here', bad: true };
  e.suspect = true;
  SFX.play('discrepancy', 1, 0.03);
  for (const s of I.sel) if (s.xr) e.found.add(s.key);
  e.found.add(issue);
  if (issue.ending && !B.collapse) later(1.2, () => { setInspect(false); startEnding(e); });
}

function inspectClick(x, y) {
  const I = B.insp;
  if (I.banner && I.banner.ask && inBox(x, y, askBox())) {
    const issue = I.banner.issue;
    if (!B.ent || B.ent.phase !== 'here') { setInspect(false); return; }
    B.ent.asked.add(issue);
    setInspect(false);
    runSteps(issue.ask, 0.15);
    if (issue.key && B.ent.spec.ending) later(lineHold('你在封号清单上。') + 0.3, () => johnEndingHint(B.ent));
    return;
  }
  if (B.ban && inBox(x, y, BAN_PREV)) { banFlip(-1); return; }
  if (B.ban && inBox(x, y, BAN_NEXT)) { banFlip(1); return; }
  const hit = fieldAt(x, y);
  if (hit && hit.d && ruleTabHit(hit.d, x, y)) { hit.d.doc.flip(); SFX.paper(2); I.sel = I.sel.filter((s) => s.d !== hit.d); return; }
  if (I.banner) { I.banner = null; I.sel = []; }
  if (!hit || !hit.key) return;
  if (hit.key === 'say') {            // 点旅客说的话：单独判断有没有马脚
    I.sel = [hit];
    SFX.play('select');
    const tell = B.ent.spec.tell, ab = abuseIssue(B.ent, hit.ln.full);
    if (tell && hit.ln.full === tell.say) { S.tut.tell = true; showIssue(tell); }
    else if (ab) showIssue(ab);
    else I.banner = { title: '这句话没什么问题', sub: '换一句听听，或者去查证件', bad: false };
    return;
  }
  if (I.sel.some((s) => s.key === 'say')) I.sel = [];
  const k = I.sel.findIndex((s) => s.key === hit.key);
  if (k >= 0) { I.sel.splice(k, 1); return; }
  I.sel.push(hit);
  if (I.sel.length > 2) I.sel.shift();
  SFX.play('select');
  const single = I.sel.length === 1 && matchIssue([hit.key]);
  if (single) { showIssue(single); return; }
  if (I.sel.length < 2) return;
  const issue = matchIssue(I.sel.map((s) => s.key));
  if (issue) showIssue(issue);
  else I.banner = { title: '没有发现不符', sub: '这两项对得上（或者不相关）', bad: false };
}

// ———————————————————— 渲染 ————————————————————

function entrantX(e) {
  if (!e || now < e.tEnter) return null;
  let x = WIN_CX;
  if (!e.instant && now < e.tEnter + 0.8) x = Math.floor(Math.round(lerp(-130, WIN_CX, easeOut(seg(now, e.tEnter, e.tEnter + 0.8)))) / 2) * 2;
  if (e.phase === 'detained' && now >= e.tDetain + 0.8) {
    const u = seg(now, e.tDetain + 0.8, e.tDetain + 1.5);
    return u >= 1 ? null : Math.round(lerp(WIN_CX, -160, u * u));
  }
  if (e.phase === 'leave') {
    const u = seg(now, e.tLeave, e.tLeave + 0.65);
    if (u >= 1) return null;
    return Math.floor(Math.round(lerp(WIN_CX, e.dir === 'right' ? 360 : -160, u * u)) / 2) * 2;
  }
  return x;
}

function exprKey(e) {
  const p = e.person;
  let ex = e.expr;
  if (ex !== 'shock' && now < e.talkUntil && Math.floor(now * 8) % 2 === 0) ex = 'talk';
  if (e.slip && SPR[`${p}:${ex}:slip`]) return `${p}:${ex}:slip`;
  if (SPR[`${p}:${ex}`]) return `${p}:${ex}`;
  return `${p}:${ASSETS.people[p].expr}`;
}

const XRAY_ICONS = {
  cat: ['X.........X', 'XX.......XX', 'XXX.....XXX', 'XXXXXXXXXXX', 'XX.XXXXX.XX', 'XXXXXXXXXXX', 'XXXX.X.XXXX', '.XXXXXXXXX.', '..XXXXXXX..'],
  keys: ['XXXXXXXXXXXXXXX', 'X.X.X.X.X.X.X.X', 'XXXXXXXXXXXXXXX', 'XX.X.X.X.X.X.XX', 'XXXXXXXXXXXXXXX', 'XXX.........XXX', 'XXXXXXXXXXXXXXX'],
  proc: ['XXXXXXXXXXXXX', 'XXXXXXXXXX.X.', 'X...........X', 'X.XXX..XXXX.X', 'X...........X', 'X.XXXX..XXX.X', 'X...........X', 'X.XX..XXXXX.X', 'XXXXXXXXXXXXX'],
};

const silCache = new Map();
function silhouette(key) {
  if (silCache.has(key)) return silCache.get(key);
  const s = SPR[key];
  const [c, g] = makeCanvas(s[2], s[3]);
  g.drawImage(ATLAS_IMG, s[0], s[1], s[2], s[3], 0, 0, s[2], s[3]);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = K.XRAY_FG; g.fillRect(0, 0, s[2], s[3]);
  silCache.set(key, c);
  return c;
}

function drawXray(e, ex) {
  rect(0, 0, WIN_W - 1, WIN_H - 1, K.XRAY_BG);
  G.fillStyle = 'rgb(24,50,52)';
  for (let x = 0; x < WIN_W; x += 12) G.fillRect(x, 0, 1, WIN_H);
  for (let y = 0; y < WIN_H; y += 12) G.fillRect(0, y, WIN_W, 1);
  if (ex !== null) {
    const key = exprKey(e), s = SPR[key], fw = ASSETS.people[e.person].fw;
    G.drawImage(silhouette(key), ex - fw / 2 + s[4], s[5]);
    G.strokeStyle = K.XRAY_L; G.lineWidth = 1;
    const ell = (cx, cy, rx, ry) => { G.beginPath(); G.ellipse(cx + 0.5, cy + 0.5, rx, ry, 0, 0, Math.PI * 2); G.stroke(); };
    ell(ex, 46, 22, 26); ell(ex - 8, 48, 4, 4); ell(ex + 8, 48, 4, 4);
    rect(ex, 76, ex + 1, WIN_H, K.XRAY_L);
    for (let k = 0, y = 98; y < WIN_H; y += 9, k++) {
      const w = 30 - k * 2;
      G.beginPath(); G.ellipse(ex + 0.5, y + 3, w, 7, 0, Math.PI * 1.11, Math.PI * 1.89); G.stroke();
    }
    for (const it of e.spec.xray || []) {
      const lit = e.found.has(it.key) || B.insp.sel.some((s) => s.key === it.key);
      const pat = XRAY_ICONS[it.icon];
      const pw = pat[0].length * 2, ph = pat.length * 2;
      const ix = ex + it.at[0], iy = it.at[1];
      pattern(pat, ix - (pw >> 1), iy - (ph >> 1), { X: lit ? K.RED_L : K.XRAY_L }, 2);
      if (lit) {
        const lines = Array.isArray(it.label) ? it.label : [it.label];
        const lw = Math.max(...lines.map((s) => tw(s, 8))) + 6;
        const lx = Math.max(2, Math.min(WIN_W - lw - 2, ix - (lw >> 1)));
        const ly1 = iy - (ph >> 1) - 4, ly0 = ly1 - 10 * lines.length;
        rect(lx, ly0, lx + lw, ly1, K.INK);
        lines.forEach((s, k) => txt(lx + 3, ly0 + 2 + 10 * k, s, 8, k === 0 && lines.length > 1 ? K.WHITE : K.RED_L));
      }
    }
  }
  const scan = Math.round(seg(now, B.xray.t, B.xray.t + 0.6) * WIN_H);
  if (scan < WIN_H) { rect(0, scan, WIN_W - 1, WIN_H - 1, K.XRAY_BG); rect(0, scan, WIN_W - 1, scan + 1, K.XRAY_L); }
  txt(4, 3, 'X-RAY · 后台进程扫描', 8, K.XRAY_L);
}

function drawJinqiWall(sway = 0) { spr('jinqi', JINQI_WALL[0] - 6 + sway, JINQI_WALL[1]); }

function drawWindow() {
  G.save();
  G.beginPath(); G.rect(WIN[0], WIN[1], WIN_W, WIN_H); G.clip();
  G.translate(WIN[0], WIN[1]);
  const e = B.ent, ex = entrantX(e);
  if (B.xray.on) drawXray(e, ex);
  else {
    G.drawImage(WIN_IMG, 0, 0);
    if (ex !== null) {
      const moving = !e.instant && now < e.tEnter + 0.8;
      const bob = moving && Math.floor(now * 10) % 2 ? 1 : 0;
      spr(exprKey(e), ex - ASSETS.people[e.person].fw / 2, bob);
      if (e.sweatT !== null) {
        const s = Math.min(6, Math.floor((now - e.sweatT) / 0.35));
        const sx = ex + 22, sy = 42 + s;
        pt(sx, sy, K.SWEAT); rect(sx - 1, sy + 1, sx + 1, sy + 3, K.SWEAT); pt(sx - 1, sy + 1, K.WHITE);
      }
      if (e.phase === 'detained' && now >= e.tDetain) {
        const u = easeOut(seg(now, e.tDetain, e.tDetain + 0.35));
        for (const [p, side] of [['GUARD', -1], ['GUARD2', 1]]) {
          const gx = Math.round(lerp(WIN_CX + side * 230, ex + side * 70, u));
          spr(`${p}:angry`, gx - 90, 4);
        }
      }
    }
    if (S.world.jinqi) {                                     // 锦旗压在人和保安上面
      const dt = B.jinqiFly ? now - B.jinqiFly.t0 - 0.45 : 9;
      const sway = dt >= 0 && dt < 1.4 ? Math.round(2 * Math.sin(dt * 14) * Math.max(0, 1 - dt / 0.9)) : 0;
      drawJinqiWall(sway);
    }
    if (B.wig && now - B.wig.t0 < 0.9) {
      // 脏辫假发转着掉出窗口
      const lt = now - B.wig.t0, s = SPR.wig;
      G.save();
      G.translate(WIN_CX - 90 + Math.round(10 * lt) + 90, Math.round(0.5 * 520 * lt * lt) + 64);
      G.rotate(18 * lt / 0.9 * Math.PI / 180);
      G.drawImage(ATLAS_IMG, s[0], s[1], s[2], s[3], -90 + s[4], -64 + s[5], s[2], s[3]);
      G.restore();
    }
    drawWinFx(ex);
    for (const sl of B.slams) {
      if (now < sl.t || now > sl.t + 0.6) continue;
      const s = sprite('stamp:' + sl.kind);
      G.drawImage(ATLAS_IMG, s[0], s[1], s[2], s[3], WIN_CX - s[2] + 10, 40, s[2] * 2, s[3] * 2);
    }
    G.strokeStyle = 'rgba(255,255,255,0.1)'; G.lineWidth = 3;
    for (const off of [150, 160, 166]) { G.beginPath(); G.moveTo(off, 0); G.lineTo(off - 40, WIN_H); G.stroke(); }
  }
  G.fillStyle = 'rgba(0,0,0,0.3)'; G.fillRect(0, 0, WIN_W, 2);
  G.restore();
}

// 窗口里的小动画：港仔手机弹窗、John 的 ANT 手机、作者举起绿章、鱼灾的账号角标
function drawWinFx(ex) {
  const f = B.winFx;
  if (!f || now < f.t0) return;
  const lt = now - f.t0;
  if (lt > f.dur) { B.winFx = null; return; }
  if (f.kind === 'popup') {
    const [x0, y0, x1, y1] = [14, 64, 189, 118];
    rect(x0 + 2, y0 + 2, x1 + 2, y1 + 2, K.INK);
    rect(x0, y0, x1, y1, 'rgb(238,234,226)');
    rect(x0, y0, x1, y0 + 12, 'rgb(206,198,186)');
    spark(x0 + 8, y0 + 6, K.CLAUDE, false);
    txt(x0 + 16, y0 + 3, 'Claude', 8, K.INK);
    txt(x0 + 8, y0 + 18, '抱歉，Claude 暂不支持', 10, K.INK);
    txt(x0 + 8, y0 + 31, '您所在的地区。', 10, K.INK);
    txt(x1 - 4, y1 - 11, '已翻译为简体中文', 8, K.TEXT_L, 'ra');
  } else if (f.kind === 'phone') {
    const x0 = 134, y0 = 60;
    rect(x0 - 1, y0 - 1, x0 + 27, y0 + 45, 'rgb(150,150,150)');
    rect(x0, y0, x0 + 26, y0 + 44, K.INK);
    rect(x0 + 2, y0 + 4, x0 + 24, y0 + 38, 'rgb(18,36,26)');
    txt(x0 + 4, y0 + 6, 'ANT', 8, 'rgb(232,170,60)');
    const pts = [[x0 + 4, y0 + 34], [x0 + 9, y0 + 30], [x0 + 13, y0 + 31], [x0 + 17, y0 + 24], [x0 + 22, y0 + 16]];
    const n = Math.min(pts.length, 2 + Math.floor(lt * 5));
    for (let i = 0; i < n - 1; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 'rgb(96,226,120)');
    if (lt > 0.8 && Math.floor(lt * 4) % 2 === 0) txt(x0 + 13, y0 + 39, '▲', 8, 'rgb(96,226,120)', 'ma');
  } else if (f.kind === 'held') {
    const x = WIN_CX + 34, y = Math.round(lerp(132, 62, easeOut(seg(lt, 0, 0.35))));
    rect(x + 8, y - 12, x + 22, y, K.GREEN_D);
    rect(x + 10, y - 12, x + 20, y - 10, K.GREEN);
    rect(x - 2, y, x + 32, y + 16, K.GREEN_D);
    rect(x, y + 1, x + 30, y + 13, K.GREEN);
    txt(x + 15, y + 4, 'APPROVED', 8, K.WHITE, 'ma');
  } else if (f.kind === 'acct') {
    const s = T('账号 #{0} / 24,000', f.n);
    rect(4, 4, 12 + tw(s, 10), 19, K.INK);
    txt(8, 7, s, 10, K.RED_L);
  }
}

function drawBoothLower() {
  const idle = !busy() && B.idx < B.queue.length;
  const on = now < B.speakerT + 0.5 || (idle && Math.floor(now * 2) % 2 === 0);
  const [x0, y0] = SPEAKER;
  rect(x0, y0, x0 + 18, y0 + 16, on ? K.CLAUDE : K.METAL_D);
  outline(x0, y0, x0 + 18, y0 + 16, K.METAL_L);
  for (let yy = y0 + 3; yy < y0 + 15; yy += 3) rect(x0 + 3, yy, x0 + 15, yy, K.INK);
  for (const { ln, size, box } of lineBoxes()) {
    const n = Math.max(1, Math.floor((now - ln.t) * typeSpeed()));
    const [bx0, y] = box;
    rect(...box, 'rgb(30,28,26)');
    outline(...box, 'rgb(76,70,64)');
    if (ln.who === 'C') rect(bx0, y, bx0 + 1, y + 15, K.CLAUDE);
    rawTxt(35, y + (size === 12 ? 2 : 3), ln.text, size, ln.who === 'C' ? K.CLAUDE_L : ln.who === 'S' ? 'rgb(150,150,150)' : K.WHITE, 'la', n);
  }
  txt(8, 347, T("{0}  {1}", DATES[S.day], WEEKDAYS[S.day]), 10, K.GREY);
  const m = 6 * 60 + Math.floor((now - B.clock0) / 1.1);
  txt(210, 346, `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, 12, K.LED, 'ra');
  const can = B.ent && B.ent.phase === 'here' && B.ent.handed && !B.event;
  {                                   // 拘留键：旧 §3（测谎露馅）起就有；Day 2 起虐待 Claude 也拘留；Day 4 起 §10 封存
    const lit = B.detainT !== undefined && now < B.detainT + 0.6;
    rect(...DETAIN_BTN, lit ? K.RED : K.RED_D); outline(...DETAIN_BTN, K.OUTLINE);
    txt(center(DETAIN_BTN)[0], DETAIN_BTN[1] + 2, '拘留', 10, K.WHITE, 'ma');
    if (S.day >= 4) {
      // 11.12 新版使用政策：AI 不得参与拘留决定 → 封条
      const [a0, b0, a1, b1] = DETAIN_BTN;
      G.fillStyle = 'rgb(232,224,204)';
      G.beginPath(); G.moveTo(a0 - 3, b1 - 1); G.lineTo(a0 + 2, b1 + 3); G.lineTo(a1 + 3, b0 + 1); G.lineTo(a1 - 2, b0 - 3); G.fill();
      txt(center(DETAIN_BTN)[0], b0 + 1, '封 §10', 8, K.RED_D, 'ma');
    }
  }
  const qbusy = !can || !B.ent.suspect || now < B.ent.busyUntil;
  rect(...QUIZ_BTN, qbusy ? K.METAL_D : 'rgb(70,80,104)'); outline(...QUIZ_BTN, K.OUTLINE);
  txt(center(QUIZ_BTN)[0], QUIZ_BTN[1] + 2, '测谎', 10, qbusy ? K.GREY : K.WHITE, 'ma');
  for (const d of B.docs) if (!d.big) smallIcon(d.doc.icon[0], d.doc.icon[1], d.x, d.y);
  // 拘留键已停用
  if (now - B.blockedT < 2.8) {
    const note = ['拘留键已停用', '§10：AI 不得参与拘留决定'];
    const w = Math.max(...note.map((s) => tw(s, 10))) + 12, bx = 8, by = 262 - 4 - 14 * note.length;
    if (!(now - B.blockedT > 2.5 && Math.floor(now * 12) % 2)) {
      rect(bx, by, bx + w, by + 14 * note.length + 3, K.INK); outline(bx, by, bx + w, by + 14 * note.length + 3, K.RED);
      note.forEach((s, i) => txt(bx + 6, by + 3 + 14 * i, s, 10, i === 0 ? K.RED_L : K.WHITE));
    }
  }
}

function drawDesk() {
  G.save();
  G.beginPath(); G.rect(DESK[0], DESK[1], DESK[2] - DESK[0] + 1, DESK[3] - DESK[1] + 1); G.clip();
  for (const d of B.docs) {
    if (!d.big) continue;
    d.doc.draw(d.x, d.y);
    if (d.marks.length) {
      G.save();
      G.beginPath(); G.rect(d.x, d.y, d.doc.w, d.doc.h); G.clip();
      for (const mk of d.marks) spr('stamp:' + mk.kind, d.x + mk.rx, d.y + mk.ry);
      G.restore();
    }
  }
  if (B.printing) {
    const { doc, t0, dur } = B.printing;
    const L = Math.max(1, Math.round(doc.h * seg(now, t0, t0 + dur)));
    G.save(); G.beginPath(); G.rect(PRINT_X, 131, doc.w + 3, L); G.clip();
    doc.draw(PRINT_X, 131);
    G.restore();
  }
  G.restore();
  rect(PRINT_X - 4, 128, PRINT_X + 172, 130, K.INK);
}

function drawTray() {
  const tx = trayX(), u = trayU();
  const hx = tx - 13;
  rect(hx, 204, tx - 1, 244, K.METAL_D);
  outline(hx, 204, tx - 1, 244, K.METAL_L);
  txt(hx + 4, 209, B.tray.open ? '>' : '<', 10, K.WHITE);
  if (LANG === 'en') pattern(STAMP_ICON, hx + 2, 224, { X: K.WHITE }, 2);   // 英文版：画个小印章图标（同原作）
  else {
    txt(hx + 3, 223, '印', 8, K.WHITE);
    txt(hx + 3, 233, '章', 8, K.WHITE);
  }
  if (u <= 0) return;
  const press = {};
  for (const p of B.presses) if (now >= p.t && now < p.t + 0.22) press[p.kind] = 5;
  drawTrayAt(tx, press);
}

function drawTrayAt(tx, press = {}) {
  rect(tx + 3, TRAY_Y0 + 3, tx + TRAY_W + 3, TRAY_Y1 + 3, K.DESK_D);
  rect(tx, TRAY_Y0, tx + TRAY_W, TRAY_Y1, K.METAL);
  rect(tx, TRAY_Y0, tx + TRAY_W, TRAY_Y0 + 2, K.METAL_L);
  rect(tx, TRAY_Y1 - 2, tx + TRAY_W, TRAY_Y1, K.METAL_D);
  rect(tx, TRAY_Y0, tx + 3, TRAY_Y1, K.METAL_D);
  for (const [label, kind, col, colD] of [['APPROVED', 'approve', K.GREEN, K.GREEN_D], ['DENIED', 'deny', K.RED, K.RED_D]]) {
    const off = press[kind] || 0;
    const bx = tx + (kind === 'approve' ? 10 : 90), by = TRAY_Y0 + 8 + off;
    rect(bx + 2, by + 2, bx + 66, by + 42 - off, K.METAL_D);
    rect(bx, by, bx + 64, by + 40, colD);
    rect(bx + 1, by + 1, bx + 63, by + 36, col);
    rect(bx + 22, by + 6, bx + 42, by + 18, colD);
    rect(bx + 24, by + 6, bx + 40, by + 8, col);
    txt(bx + 32, by + 25, label, 8, K.WHITE, 'ma');
  }
}

// 封号清单：翻开后盖住大半张桌子。一页 8 格，只有照片和名字
function drawBanList() {
  // 照片飞进桌上的清单文件夹
  B.flies = B.flies.filter((f) => now < f.t0 + 0.5);
  for (const f of B.flies) {
    const u = smooth(seg(now, f.t0, f.t0 + 0.45));
    const s = SPR['photo:' + f.photo];
    if (!s) continue;
    const k = 1 - 0.5 * u;
    const [x, y] = lerp2([WIN[0] + WIN_CX - 20, 180], center(BAN_BTN), u);
    G.drawImage(ATLAS_IMG, s[0], s[1], s[2], s[3], Math.round(x - s[2] * k / 2), Math.round(y - s[3] * k / 2), Math.round(s[2] * k), Math.round(s[3] * k));
  }
  if (!B.ban) return;
  const [x0, y0, x1, y1] = BANLIST;
  const top = Math.round(lerp(y1, y0, easeOut(seg(now, B.ban.t0, B.ban.t0 + 0.2))));
  rect(x0 + 3, top + 3, x1 + 3, y1 + 3, K.DESK_D);
  rect(x0, top, x1, y1, 'rgb(214,200,184)');
  rect(x0, top, x1, top + 14, 'rgb(120,40,36)');
  if (top > y0) return;
  const bans = S.world.bans, pages = banPages(), page = Math.min(B.ban.page, pages - 1);
  txt(x0 + 6, y0 + 3, '§11 · 封号清单', 10, 'rgb(246,214,110)');
  txt(x0 + 92, y0 + 4, '封过号的不得再来 · 以前封的也算', 8, 'rgb(226,196,170)');
  txt(BAN_PREV[0] + 10, y0 + 3, '◀', 10, K.WHITE, 'ma');
  txt((BAN_PREV[2] + BAN_NEXT[0]) / 2, y0 + 4, T('第 {0}/{1} 页', page + 1, pages), 8, 'rgb(226,196,170)', 'ma');
  txt(BAN_NEXT[0] + 10, y0 + 3, '▶', 10, K.WHITE, 'ma');
  for (let k = 0; k < BAN_PER; k++) {
    const i = page * BAN_PER + k;
    const [cx0, cy0, cx1] = banCell(k);
    if (i >= bans.length) {
      G.fillStyle = 'rgb(170,154,136)';
      for (let xx = cx0 + 29; xx < cx0 + 70; xx += 3) { G.fillRect(xx, cy0 + 4, 1, 1); G.fillRect(xx, cy0 + 54, 1, 1); }
      for (let yy = cy0 + 4; yy < cy0 + 55; yy += 3) { G.fillRect(cx0 + 29, yy, 1, 1); G.fillRect(cx0 + 69, yy, 1, 1); }
      continue;
    }
    const b = bans[i];
    const px = cx0 + 29, py = cy0 + 4;
    rect(px - 1, py - 1, px + 40, py + 50, K.OUTLINE);
    spr('photo:' + b.photo, px, py);
    rect(px + 17, py - 3, px + 22, py + 1, K.RED);
    txt((cx0 + cx1) / 2, cy0 + 60, b.name, tw(b.name, 8) > 96 ? 8 : 8, K.TEXT, 'ma');
  }
  if (!B.insp.on) txt(x0 + 6, y1 - 12, '用『检查』：点 Ta 的脸，再点清单上的照片', 8, K.TEXT_L);
}

function drawButtons() {
  button(INSPECT_BTN, '?', '检查', B.insp.on);
  // 破绽只有 X 光看得见、玩家又很久没用 X 光了：按钮闪一闪（第一次照出来以后就不提示了）
  const xrayHot = needsXray(B.ent) && Math.floor(now * 3) % 2 === 0;
  button(XRAY_BTN, 'X', 'X光', B.xray.on || xrayHot);
  if (S.day >= 3) button(LOCATE_BTN, 'GPS', '定位', needsGPS(B.ent) && !B.ent.located && !S.tut.gpsFound && B.ent.handed && Math.floor(now * 3) % 2 === 0);
  if (S.day >= 4) {
    const hot = johnHere() && B.ent.endHinted && !B.ent.looked && Math.floor(now * 3) % 2 === 0;
    button(LOOKUP_BTN, '企', '企查', hot);
    const [x0, y0, x1, y1] = BAN_BTN;
    const col = B.ban ? 'rgb(150,52,46)' : 'rgb(112,38,34)';
    rect(x0 + 2, y0 + 2, x1 + 2, y1, K.DESK_D);
    rect(x0, y0, x1, y1, col);
    outline(x0 + 3, y0 + 3, x1 - 3, y1, 'rgb(170,80,70)');
    txt((x0 + x1) / 2, y0 + 7, '封号', 10, K.GOLD, 'ma');
    txt((x0 + x1) / 2, y0 + 21, '清单', 8, 'rgb(226,196,170)', 'ma');
    const n = S.world.bans.length;
    txt((x0 + x1) / 2, y0 + 36, `×${n}`, 8, K.WHITE, 'ma');
  }
}

function button(box, glyph, label, active) {
  const [x0, y0, x1, y1] = box;
  rect(x0 + 2, y0 + 2, x1 + 2, y1 + 2, K.DESK_D);
  rect(x0, y0, x1, y1, active ? K.RED_D : K.METAL_D);
  outline(x0, y0, x1, y1, K.METAL_L);
  txt((x0 + x1) >> 1, y0 + 6, glyph, 12, K.WHITE, 'ma');
  txt((x0 + x1) >> 1, y0 + 21, label, 8, active ? K.WHITE : K.GREY, 'ma');
}

// 这位旅客的破绽只有 X 光看得见（后台进程），而且还没照过
function needsXray(e) { return !!e && !!e.spec.xray && e.handed && !e.xrayed && !S.tut.xrayFound && e.phase === 'here'; }

// 这位旅客的破绽只有 GPS 能查出来（人在不支持地区）
function needsGPS(e) { return !!e && (e.spec.issues || []).some((is) => is.pairs.some((p) => p.includes('loc.位置'))); }

function hintText() {
  if (B.flash && now < B.flash.t + 3.2) return B.flash.text;
  if (B.limit || B.authorSeq || B.endingSeq || B.closeup || B.cut) return '';
  const e = B.ent, here = e && e.phase === 'here' && e.handed && !B.event, t = S.tut;
  if (!t.called) return S.day === 1 ? '点左下角闪烁的喇叭，叫下一位' : '';
  if (!here) return '';
  if (e.spec.ending && (e.endHinted || e.looked)) return e.looked ? '' : '『企查』：查查安索兹卡自己';
  const onDesk = B.docs.some((d) => d.owner === 'ent' && d.big);
  if (!t.dragged && !onDesk) return '把柜台上的证件（左下小图标）拖到右边桌上';
  if (!t.rules) return '点右下角的『宪法』：本周新规从第 3 页起';
  if (!t.tray) return '点右侧的把手“<”，拉出印章栏';
  if (!t.stamped) return '把证件挪到印章正下方，按“准予”或“拒绝”';
  if (!t.returned && e.decided) return '把盖好章的证件拖回左边窗口，还给旅客';
  if (!t.inspect && (e.spec.tell || (e.spec.issues || []).length)) return '右下『?』检查模式：点可疑的那一栏（或两栏对比），或点 Ta 说的话';
  if (needsGPS(e) && !e.located && !t.gpsFound) return '这位要查『定位』：IP 在美国，人不一定在。按桌上闪的『GPS』';
  if (S.day >= 4 && !t.lookup && e.spec.lookup) return '新：『企查』查 Ta 的公司';
  if (S.day >= 4 && !t.ban) return '新：『封号清单』翻开比对照片';
  if (needsXray(e)) return '这位的破绽在后台进程：按右下闪的『X光』扫一下';
  if (e.abused && S.day <= 3 && !t.detain) return '虐待 Claude：按柜台上的『拘留』';
  return '';
}

function drawHint() {
  const s = hintText();
  if (!s || B.insp.on || (B.ban && !(B.flash && now < B.flash.t + 3.2))) return;
  // 刚打印出来、还停在出纸口的单子（小票、定位、企查）别压住：提示栏让到它右边
  let left = DESK[0] + 4;
  for (const d of B.docs) if (d.big && d.x === PRINT_X && d.y === 131) left = Math.max(left, PRINT_X + d.doc.w + 6);
  if (B.printing) left = Math.max(left, PRINT_X + B.printing.doc.w + 6);
  const room = W - 6 - left - 12;
  const size = tw(s, 10) > Math.min(396, room) ? 8 : 10;
  // 英文太长：小字折行
  const lines = size === 8 && tw(s, 8) > Math.min(400, room) ? wrap(s, 8, Math.min(400, room)) : [tr(s)];
  const w = Math.max(...lines.map((l) => rawTw(l, size))) + 12, h = lines.length > 1 ? 4 + lines.length * 10 : 15;
  const x = Math.max(DESK[0] + 4, W - 6 - w), y = 134;
  rect(x, y, x + w, y + h, 'rgba(22,19,19,0.92)');
  outline(x, y, x + w, y + h, K.CLAUDE);
  lines.forEach((l, i) => rawTxt(x + 6, y + (size === 10 ? 3 : 4) + i * 10, l, size, K.CLAUDE_L));
}

// 每天开门：今日新规
function drawNotice() {
  const n = B.notice;
  if (!n || !n.lines.length) return;
  const w = Math.max(...n.lines.map((s, i) => tw(s, i ? 10 : 12))) + 24, h = 14 + n.lines.length * 16;
  const x = 430 - w / 2, y = Math.round(lerp(120, 176, easeOut(seg(now, n.t0, n.t0 + 0.35))));
  rect(x + 3, y + 3, x + w + 3, y + h + 3, K.DESK_D);
  rect(x, y, x + w, y + h, 'rgb(236,228,204)');
  rect(x, y, x + w, y + 3, K.RED_D);
  n.lines.forEach((s, i) => txt(x + 12, y + 9 + i * 16, s, i ? 10 : 12, i ? K.TEXT : K.RED_D));
}

function drawFloats() {
  B.floats = B.floats.filter((f) => now < f.t0 + 1.3);
  for (const f of B.floats) {
    const lt = now - f.t0;
    const yy = Math.round(GAIN_XY[1] - 18 * easeOut(seg(lt, 0, 1.3)));
    if (lt < 1.05 || Math.floor(lt * 12) % 2 === 0) bigText(GAIN_XY[0] - 22, yy, f.s, 12, 2, f.col, K.INK);
  }
}

function drawBooth() {
  drawBg();
  drawWorld();
  if (B.event && B.event.type === 'clones') drawClones();
  drawWindow();
  drawBoothLower();
  drawDesk();
  drawBanList();
  drawTray();
  drawButtons();
  drawFloats();
  drawNotice();
  drawHint();
}

// 检查模式里要画虚线框的地方。证件上一行一行的文字栏一看就能点，不画；
// 照片、价签、锦旗、早安图这类「图」由证件类的 spots 列出来；被别的证件盖住的不画
function inspectSpots() {
  const e = B.ent, out = windowSpots(e).map((s) => ({ key: s.key, box: s.box }));
  if (B.xray.on && e && e.spec.xray && entrantX(e) !== null) {
    for (const it of e.spec.xray) out.push({ key: it.key, box: xrayItemBox(e, it) });
  }
  if (B.ban) return out;
  const top = (x, y) => [...B.docs].reverse().find((q) => q.big && inBox(x, y, docBox(q)));
  for (const d of B.docs) {
    if (!d.big || !d.doc.spots) continue;
    for (const name of d.doc.spots) {
      const f = d.doc.fields[name];
      if (!f) continue;
      const box = [d.x + f[0], d.y + f[1], d.x + f[2], d.y + f[3]];
      if (top((box[0] + box[2]) >> 1, (box[1] + box[3]) >> 1) === d) out.push({ key: `${d.key}.${name}`, box });
    }
  }
  return out;
}

function composeInspect(g) {
  const I = B.insp;
  g.fillStyle = 'rgba(26,10,10,0.55)'; g.fillRect(0, 0, W, H);
  const lighten = (bx) => {
    if (bx[2] <= bx[0] || bx[3] <= bx[1]) return;
    g.drawImage(F, bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1], bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
    g.fillStyle = 'rgba(26,10,10,0.2)'; g.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
  };
  if (B.ban) lighten([BANLIST[0], BANLIST[1], BANLIST[2] + 1, BANLIST[3] + 1]);
  else for (const d of B.docs) if (d.big) lighten([Math.max(DESK[0], d.x), Math.max(DESK[1], d.y), Math.min(W, d.x + d.doc.w), Math.min(H, d.y + d.doc.h)]);
  lighten([WIN[0], WIN[1], WIN[2] + 1, WIN[3] + 1]);
  if (B.ent && B.ent.handed) lighten([28, 286, 220, 339]);   // 对话框也亮着，方便点旅客说的话
  const boxes = I.sel.map((s) => s.box()).filter((b) => b[2] > b[0]);
  for (const b of boxes) g.drawImage(F, b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1, b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1);
  setCtx(g);
  // 看不出能点的地方：虚线框提示（窗口里的旅客、证件上的照片 / 价签 / 锦旗 / 早安图、X 光照出来的东西）
  // 框往外扩 2 像素（别压在照片自己的边框上），虚线缓慢流动（蚂蚁线），一眼能看到
  const ph = Math.floor(now * 6) % 5;
  G.fillStyle = K.CLAUDE;
  for (const s of inspectSpots()) if (!I.sel.some((q) => q.key === s.key)) for (const pad of [2, 3]) {   // 两圈 = 2 像素粗
    const [a0, b0, a1, b1] = [s.box[0] - pad, s.box[1] - pad, s.box[2] + pad, s.box[3] + pad];
    const w = a1 - a0, h = b1 - b0, per = 2 * (w + h);
    const at = (t) => (t < w ? [a0 + t, b0] : t < w + h ? [a1, b0 + t - w] : t < 2 * w + h ? [a1 - (t - w - h), b1] : [a0, b1 - (t - 2 * w - h)]);
    for (let t = ph; t < per; t += 5) for (let k = 0; k < 3; k++) { const [px, py] = at((t + k) % per); G.fillRect(px, py, 1, 1); }
  }
  if (boxes.length >= 2 && I.banner && I.banner.bad) {
    const p = edgePoint(boxes[0], center(boxes[1])), q = edgePoint(boxes[1], center(boxes[0]));
    line(p[0], p[1], q[0], q[1], K.RED_L);
  }
  for (const b of boxes) outline(b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2, K.RED_L, 2);
  drawButtons();
  const bn = I.banner, BANNER_BOX = bannerBox(), ASK_BTN = askBox();
  if (bn) {
    const [x0, y0] = BANNER_BOX;
    rect(...BANNER_BOX, K.INK); outline(...BANNER_BOX, bn.bad ? K.RED : K.GREY_D);
    const room = bn.ask ? 236 : 282;
    // 英文长：标题缩一号，说明折成两行小字
    const subLines = tw(bn.sub, 10) <= room ? null : tw(bn.sub, 8) <= room ? [tr(bn.sub)] : wrap(bn.sub, 8, room).slice(0, 2);
    if (subLines && subLines.length > 1) {
      txt(x0 + 8, y0 + 3, bn.title, tw(bn.title, 12) > room ? 10 : 12, bn.bad ? K.RED_L : K.GREY);
      subLines.forEach((l, i) => rawTxt(x0 + 8, y0 + 17 + i * 9, l, 8, K.WHITE));
    } else {
      txt(x0 + 8, y0 + 5, bn.title, tw(bn.title, 12) > room ? 10 : 12, bn.bad ? K.RED_L : K.GREY);
      if (subLines) rawTxt(x0 + 8, y0 + 21, subLines[0], 8, K.WHITE);
      else txt(x0 + 8, y0 + 21, bn.sub, 10, K.WHITE);
    }
    if (bn.ask) {
      const hover = ptr.mouse && inBox(ptr.x, ptr.y, ASK_BTN);
      rect(...ASK_BTN, hover ? K.RED : K.RED_D); outline(...ASK_BTN, K.RED_L);
      txt(center(ASK_BTN)[0], ASK_BTN[1] + 5, '询问', 12, K.WHITE, 'ma');
    }
  } else {
    const s = I.sel.length ? '再点一处，看看两者是否矛盾' : B.ban ? '点 Ta 的脸（窗口里），再点清单上的照片' : '检查模式：点可疑的那一栏，或两处对比，或点 Ta 说的话';
    rect(...BANNER_BOX, 'rgba(22,19,19,0.85)'); outline(...BANNER_BOX, K.GREY_D);
    const room = BANNER_BOX[2] - BANNER_BOX[0] - 14;
    if (tw(s, 10) <= room) txt(BANNER_BOX[0] + 8, BANNER_BOX[1] + 12, s, 10, K.GREY);
    else wrap(s, 8, room).slice(0, 2).forEach((l, i) => rawTxt(BANNER_BOX[0] + 8, BANNER_BOX[1] + 8 + i * 10, l, 8, K.GREY));
  }
}
