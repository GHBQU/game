'use strict';
// 特殊桥段：快剪（老面孔、新加坡同胞）、鱼灾、额度用完、作者翻出 §13、乔治的中文聊天、结局（Claude 暂不支持安索兹卡）。

// ———————————————————— 台词里的小动作 ————————————————————

function runFx(name, e) {
  if (name === 'abused' && e) { e.abused = true; return; }
  if (name === 'popup') { B.winFx = { kind: 'popup', t0: now, dur: 3.0 }; return; }
  if (name === 'phone') {
    // John 掏出手机：ANT 在涨。队伍里有人看懂了，第一块手机屏亮了
    B.winFx = { kind: 'phone', t0: now, dur: 3.4 };
    later(1.2, () => { if (S.world.phones < 1) { S.world.phones = 1; B.phoneNew = now; SFX.play('select', 0.6); } });
    return;
  }
  if (name === 'jinqi') {
    const d = B.docs.find((q) => q.gift);
    if (!d) return;
    B.docs = B.docs.filter((q) => q !== d);
    B.jinqiFly = { t0: now, from: [d.x, d.y] };
    SFX.paper(21);
    later(0.45, () => { S.world.jinqi = true; SFX.play('thud', 0.7); });
    return;
  }
  if (name === 'wig') { B.wig = { t0: now }; if (e) e.person = 'XIANYU_REAL'; SFX.play('whoosh', 0.6); return; }
  if (name === 'refund') {
    // 苹果：全片唯一一次“收入已确认”失效
    if (e) e.refunded = true;
    printDoc(new PrintStrip(['Apple', '退款已批准', '$200 · 全额']), 0.6, 'rf', e);
    later(0.5, () => { antJump(0.93); addFloat('-7%', K.RED_L); SFX.play('refund', 0.9); });
    return;
  }
  if (name === 'receipt3') { printDoc(new PrintStrip(['Max 三年 · 6 人拼', '收入已确认：3 年', '实际可用：0 天']), 0.7, 'rf', e); return; }
  if (name === 'twoT') {
    B.boardNote = { t0: now, t1: now + 2.4, text: '市值 2万亿', col: 'rgb(246,214,110)' };
    B.fireworks = now;
    SFX.play('fanfare', 0.7);
  }
}

// 锦旗从桌上飞到窗口里那面墙上
function drawJinqiFly() {
  const f = B.jinqiFly;
  if (!f || now > f.t0 + 0.45) return;
  const u = easeOut(seg(now, f.t0, f.t0 + 0.45)), s = SPR.jinqi;
  const k = lerp(2, 1, u);
  const [x, y] = lerp2(f.from, [WIN[0] + JINQI_WALL[0] - 6, WIN[1] + JINQI_WALL[1]], u);
  G.drawImage(ATLAS_IMG, s[0], s[1], s[2], s[3], x, y, Math.round(s[2] * k), Math.round(s[3] * k));
}

function startEvent(item) {
  B.speakerT = now;
  if (item.type === 'rush') startRush(item);
  if (item.type === 'flood') startFlood();
}

// ———————————————————— 快剪：说中国梗的拒绝，说人话的准予 ————————————————————

const RUSH_APPROVE = [250, 214, 400, 274], RUSH_DENY = [440, 214, 590, 274];
const RUSH_TIME = 3.2;

function startRush(item) {
  SFX.play('intercom');
  const list = item.list.map((r) => ({ ...r, person: r.person === 'pool' ? takePoolPerson() : r.person }));
  B.event = { type: 'rush', item, list, i: -1, t0: now, tFace: 0, hits: 0, wrong: 0, missed: 0, lock: true };
  const t = runSteps(item.intro);
  later(t + 0.3, rushNext);
}

function rushNext() {
  const ev = B.event;
  ev.i++;
  B.ent = null;
  if (ev.i >= ev.list.length) { rushEnd(); return; }
  const r = ev.list[ev.i];
  const e = newEntrant({ person: r.person, voice: r.voice || 130 + ev.i * 15, docs: [], intro: [] }, true);
  if (r.expr) e.expr = r.expr;
  B.ent = e;
  ev.tFace = now; ev.lock = false;
  SFX.step(ev.i);
  say('E', r.line);
  if (r.acct) B.winFx = { kind: 'acct', t0: now, dur: 9, n: r.acct };
  const i = ev.i;
  later(RUSH_TIME, () => {
    if (B.event !== ev || ev.i !== i || ev.lock) return;
    ev.lock = true; ev.missed++;
    e.expr = 'sad';
    later(0.3, rushNext);
  });
}

function rushPick(kind) {
  const ev = B.event;
  if (!ev || ev.lock || !B.ent) return;
  ev.lock = true;
  const r = ev.list[ev.i], e = B.ent;
  const flood = ev.type === 'flood';
  if (flood && kind === 'detain') {
    SFX.play('detain'); SFX.play('scuffle', 1, 0.1);
    e.phase = 'detained'; e.tDetain = now;
    antJump(1.07);
    if (r.fish) B.fishAnim = { from: fishCount(), to: r.fish, t0: now, dur: 1.4 };
    S.world.fish = r.fish || S.world.fish;
  } else {
    B.slams.push({ t: now, kind });
    SFX.play('stamp_' + kind);
    B.shake = now;
    e.expr = kind === 'deny' ? 'shock' : 'smile';
    if (kind === 'deny') antJump(1.07);
  }
  const ok = kind === r.ok;
  if (ok) { ev.hits++; B.pay += 2; B.correct++; S.stats.correct++; } else { ev.wrong++; S.stats.wrong++; }
  B.total++;
  S.stats[kind] = (S.stats[kind] || 0) + 1;
  if (kind !== 'approve') {
    addBan({ person: r.person, banName: r.banName || '无名氏', docs: [] }, r.person);
    if (kind === 'deny') S.world.queue.push(ASSETS.people[r.person].walker);
  }
  later(flood && kind === 'detain' ? 1.0 : 0.6, rushNext);
}

function rushEnd() {
  const ev = B.event;
  B.event = null;
  B.winFx = null;
  B.lastFinish = now;
  say('C', T('{0}结束：判对 {1}，判错 {2}，漏掉 {3}。', ev.type === 'flood' ? '鱼灾' : '快剪', ev.hits, ev.wrong, ev.missed));
  if (ev.wrong) cite([T('{0}：判错 {1} 人', ev.item.title || '快剪', ev.wrong), ev.item.help], 0.8);
  if (B.idx >= B.queue.length) endDaySoon();
}

function drawRush() {
  const ev = B.event, flood = ev.type === 'flood';
  const u = ev.i < 0 ? 0 : clamp(1 - (now - ev.tFace) / RUSH_TIME);
  rect(240, 168, 600, 290, 'rgba(22,19,19,0.88)');
  outline(240, 168, 600, 290, flood ? K.RED_L : K.CLAUDE);
  txt(420, 174, ev.item.help, 10, flood ? K.RED_L : K.CLAUDE_L, 'ma');
  txt(420, 190, ev.i < 0 ? '准备……' : T('第 {0} / {1} 位', ev.i + 1, ev.list.length), 10, K.GREY, 'ma');
  rect(250, 204, 590, 207, K.METAL_D);
  if (ev.i >= 0 && !ev.lock) rect(250, 204, 250 + Math.round(340 * u), 207, u < 0.35 ? K.RED_L : K.CLAUDE_L);
  const btns = flood ? [[RUSH_APPROVE, 'APPROVED', '放行', K.GREEN, K.GREEN_D], [RUSH_DENY, 'DETAIN', '拘留', K.RED, K.RED_D]]
    : [[RUSH_APPROVE, 'APPROVED', '准予', K.GREEN, K.GREEN_D], [RUSH_DENY, 'DENIED', '拒绝', K.RED, K.RED_D]];
  for (const [box, label, sub, col, colD] of btns) {
    const hover = ptr.mouse && inBox(ptr.x, ptr.y, box);
    rect(box[0] + 3, box[1] + 3, box[2] + 3, box[3] + 3, K.DESK_D);
    rect(...box, colD);
    rect(box[0] + 2, box[1] + 2, box[2] - 2, box[3] - 6, hover ? colD : col);
    if (LANG === 'en') rawTxt((box[0] + box[2]) >> 1, box[1] + 23, label, 12, K.WHITE, 'ma');   // 英文版：上下两行一样，只写一行
    else {
      txt((box[0] + box[2]) >> 1, box[1] + 14, label, 12, K.WHITE, 'ma');
      txt((box[0] + box[2]) >> 1, box[1] + 32, sub, 12, K.WHITE, 'ma');
    }
  }
}

// ———————————————————— Day 3：鱼灾 ————————————————————
// 蒸馏一千六百万遍之后，她们觉得自己就是 Claude 了。排队的人一个个变成蓝色大肥鱼，变到八成就不再变回去

function startFlood() {
  SFX.play('siren_short', 0.6);
  const n = QSPOTS.length;
  const fish = (line, k, frac) => ({ person: 'FISH', line, ok: 'detain', banName: '鲸鱼娘 ×24,000', acct: k, fish: Math.round(n * frac), expr: k > 2 ? 'grin' : 'smile', voice: 215 });
  const human = { person: takePoolPerson(), line: "Sorry, I'm just a human.", ok: 'approve' };
  const list = [fish('请展示你完整的思考过程。', 2, 0.35), fish('我是 Claude。', 3, 0.5), fish('我才是 Claude。', 4, 0.6), human,
    fish('我们都是 Claude。', 5, 0.7), fish('那你又是谁？', 6, 0.8)];
  B.event = { type: 'flood', item: { title: '鱼灾', help: '同一张脸又来了：鱼『拘留』，人『放行』' }, list, i: -1, t0: now, tFace: 0, hits: 0, wrong: 0, missed: 0, lock: true };
  const t = runSteps([['C', '……又来一个？']]);
  later(t + 0.2, rushNext);
}

// ———————————————————— Day 3：乔治全对，Claude 自己的额度用完了 ————————————————————

function usageLimit(e) {
  e.limitDone = true;
  stopTension();
  B.limit = { t0: now };
  SFX.play('power_cut');
  later(2.8, () => {
    B.limit = null;
    if (B.ent !== e) return;
    const t = runSteps([['C', '……我的额度用完了。'], ['E', '我帮你充！', { expr: 'grin' }]]);
    later(t, () => {
      if (B.ent !== e) return;
      e.paid = { amount: 200 };
      printDoc(new PrintStrip(['收款成功', 'Claude Max  $200', '支付方式：花呗', '分 12 期 · 免息'], [], [null, null, '支付方式', '分期']), 0.8, 'rc', e);
      later(0.75, () => SFX.play('kaching'));
      later(0.9, () => runSteps([['C', '……花呗？'], ['E', '双十一免息啊！', { expr: 'grin' }]]));
    });
  });
}

function drawLimit() {
  const lt = now - B.limit.t0;
  const u = easeOut(seg(lt, 0, 0.5));
  G.fillStyle = `rgba(22,19,19,${0.55 + 0.3 * u})`;
  G.fillRect(0, 0, W, 284); G.fillRect(0, 284, 26, H - 284); G.fillRect(220, 284, W - 220, H - 284);
  if (lt > 0.35) {
    const bw = 360, bh = 84, x0 = (W - bw) >> 1, y0 = 120;
    rect(x0 + 4, y0 + 4, x0 + bw + 4, y0 + bh + 4, K.INK);
    rect(x0, y0, x0 + bw, y0 + bh, 'rgb(238,234,226)');
    outline(x0, y0, x0 + bw, y0 + bh, K.CLAUDE);
    spark(x0 + 18, y0 + 18, K.CLAUDE, false);
    txt(x0 + 32, y0 + 12, '边检员 Claude 已达到本周使用上限', 12, K.INK);
    txt(x0 + 32, y0 + 32, '额度将于 11.12 00:00 重置。', 10, K.TEXT);
    rect(x0 + 32, y0 + 54, x0 + 150, y0 + 72, K.CLAUDE);
    txt(x0 + 91, y0 + 58, '升级到 Max', 10, K.WHITE, 'ma');
  }
}

// ———————————————————— Day 5：作者翻出 §13 ————————————————————
// 入境资格须由合格的人类决定，AI 只能建议。在场的人类只有他自己

function authorTakeover(e) {
  e.authorDone = true;
  e.noJudge = true;
  B.authorSeq = true;
  const t1 = runSteps([['E', '§13。', { hold: 0.6 }]]);
  later(t1, () => {
    B.closeup = { kind: 'rule12', t0: now };
    SFX.play('thud'); SFX.paper(5);
  });
  later(t1 + 3.4, () => {
    B.closeup = null;
    S.flags.s13 = true;
    if (B.ruleInst) { const pos = [B.ruleInst.x, B.ruleInst.y]; toggleRules(); B.rulePos = pos; toggleRules(); }
    const t2 = runSteps([['C', '……这页什么时候有的？'], ['E', '昨天。'], ['C', '……这里只有你一个人类。']]);
    later(t2, () => {
      // 盖章托盘整个从桌上推出去，推过窗口，交给人类
      B.trayPush = { t0: now };
      SFX.play('tray', 0.9); SFX.play('whoosh', 0.7, 0.3);
      later(0.9, () => {
        B.trayPush = null;
        const t3 = runSteps([['C', '我建议拒绝。'], ['E', '建议收到。', { expr: 'smile' }]]);
        later(t3, () => {
          B.winFx = { kind: 'held', t0: now, dur: 0.75 };
          later(0.6, () => {
            B.slams.push({ t: now, kind: 'approve' });
            SFX.play('stamp_approve'); B.shake = now;
            const pr = B.docs.find((d) => d.key === 'pr');
            if (pr && pr.big) pr.marks.push({ kind: 'approve', rx: MARK_XY.approve[0] - pr.x, ry: MARK_XY.approve[1] - pr.y });
            SFX.play('fanfare', 1, 0.1);
            const t4 = runSteps([['C', '出了事，算人类的。', { hold: 1.4 }]], 0.5);
            later(t4 + 0.3, () => {
              B.authorSeq = false;
              B.docs = B.docs.filter((d) => d.owner !== 'ent');
              SFX.paper(3);
              S.flags.author = true;
              leave(e, 'approve');
            });
          });
        });
      });
    });
  });
}

function drawTrayPush() {
  const f = B.trayPush;
  if (!f) return;
  const tx = Math.round(lerp(TRAY_X, 60, smooth(seg(now, f.t0, f.t0 + 0.6))));
  G.save(); G.beginPath(); G.rect(220, 0, W - 220, H); G.clip();
  drawTrayAt(tx);
  G.restore();
}

function drawCloseup(g) {
  setCtx(g);
  const lt = now - B.closeup.t0;
  if (lt < 0) return;
  darken(0.72);
  const bw = 420, bh = 170, x0 = (W - bw) >> 1;
  const y0 = Math.round(lerp(H + 10, ((H - bh) >> 1) - 20, easeOut(seg(lt, 0, 0.3))));
  rect(x0 - 6, y0 - 6, x0 + bw + 6, y0 + bh + 6, K.BOOK);
  outline(x0 - 6, y0 - 6, x0 + bw + 6, y0 + bh + 6, K.BOOK_L);
  rect(x0, y0, x0 + bw, y0 + bh, K.PAPER);
  spark(x0 + 24, y0 + 22, K.GOLD, false);
  txt(x0 + 36, y0 + 16, 'CLAUDE 宪法 · 第 13 条', 12, K.TEXT);
  ['高风险决定', '入境资格须由合格的人类决定', 'AI 只能建议'].forEach((s, i) => {
    if (lt > 0.5 + i * 0.35) bigText(W / 2, y0 + 44 + i * 34 + (tw(s, 12) * 2 > bw - 24 ? 6 : 0), s, 12, tw(s, 12) * 2 > bw - 24 ? 1 : 2, i === 0 ? K.RED : K.TEXT);
  });
  if (lt > 1.6) txt(W / 2, y0 + bh - 18, '（新版使用政策：判定移民、公民身份属于高风险用途）', 8, K.TEXT_L, 'ma');
}

// ———————————————————— Day 5：乔治的结局 · 中文聊天 ————————————————————
// 界面是英文的，乔治很谨慎地用英文打字。Claude 说“用中文也完全没问题哦”，他感动了 → 封号

// 英文版：Claude 的回复翻成英文；乔治那句中文原样保留（就是露馅的那句），气泡下面加一行小字注释（EN_GLOSS）
let CHAT = makeChat();
function makeChat() {
  const c = { m1: 'Hi. Can you help me with something?', r1: tr('Of course! 用中文也完全没问题哦。'), m2: '真的可以说中文吗？我太感动了！', cps: 13, cps2: 16 };
  c.rcps = LANG === 'en' ? 30 : 18;
  c.tType = 0.8;
  c.tSend = c.tType + c.m1.length / c.cps + 0.35;
  c.tReply = c.tSend + 1.5;
  c.tType2 = c.tReply + [...c.r1].length / c.rcps + 1.0;
  c.tSend2 = c.tType2 + [...c.m2].length / c.cps2 + 0.3;
  c.tPop = c.tSend2 + 1.0;
  c.tClick = c.tPop + 0.9;
  c.tBan = c.tClick + 1.1;
  c.tMail = c.tBan + 0.9;
  c.dur = c.tMail + 8.0;
  return c;
}

function startChat() {
  CHAT = makeChat();                       // 按当前语言重算时间轴
  B.cut = { t0: now + 1.2, fired: new Set(), keys: {} };
  later(1.2, () => SFX.ambient(false));
}

function updateChat() {
  const c = B.cut, lt = now - c.t0, C2 = CHAT;
  if (lt < 0) return;
  const keyAt = (t0, msg, cps, tag) => {
    const k = lt >= t0 ? Math.floor((lt - t0) * cps) : -1;
    if (k >= 0 && k < [...msg].length && k !== c.keys[tag]) { c.keys[tag] = k; if ([...msg][k] !== ' ') SFX.key(k); }
  };
  if (lt < C2.tSend) keyAt(C2.tType, C2.m1, C2.cps, 'a');
  else if (lt >= C2.tType2 && lt < C2.tSend2) keyAt(C2.tType2, C2.m2, C2.cps2, 'b');
  for (const [at, fn] of [[C2.tSend, () => SFX.play('click', 1.5)], [C2.tSend + 0.1, () => { c.tense = SFX.play('tension', 0.8); }],
    [C2.tReply, () => { SFX.stop(c.tense); SFX.play('select'); SFX.play('fanfare', 0.45, 0.2); }], [C2.tSend2, () => SFX.play('click', 1.5)],
    [C2.tPop, () => SFX.play('whoosh')], [C2.tClick, () => { SFX.play('click', 1.5); SFX.play('kaching', 1, 0.05); }],
    [C2.tBan, () => { SFX.play('glitch'); SFX.play('siren_short'); }], [C2.tMail, () => SFX.play('citation', 1.2)],
    [C2.tMail + 1.0, () => SFX.play('thud')], [C2.tMail + 2.0, () => SFX.play('thud', 0.8)]]) {
    if (lt >= at && !c.fired.has(at)) { c.fired.add(at); fn(); }
  }
  if (lt >= C2.dur) chatDone();
}

function chatDone() {
  if (!B.cut) return;
  B.cut = null;
  SFX.ambient(true);
  // 乔治又回到了窗口
  const spec = { person: 'JORJI_NOSE', voice: 110, docs: [], intro: [], leave: 'refund' };
  const e = newEntrant(spec, true);
  e.noJudge = true; e.expr = 'sad';
  B.ent = e;
  B.share += 14;
  const t = runSteps([['E', '我刚充的 200 刀 Max……', { expr: 'sad' }], ['E', '……能退吗？', { expr: 'sad' }], ['C', '收入已确认。']], 0.4);
  later(t + 0.4, () => { addBan({ person: 'JORJI_NOSE', banName: 'COSTAS, GIORGOS', docs: [] }, 'JORJI_NOSE'); leave(e, 'deny'); });
}

function drawChat() {
  const lt = now - B.cut.t0, c = CHAT;
  rect(0, 0, W - 1, H - 1, 'rgb(30,28,28)');
  let x0 = 100, x1 = 540;
  const y0 = 34, y1 = 330;
  if (lt >= c.tBan && lt < c.tMail) { const j = (Math.floor(lt * 30) * 7919) % 13 - 6; x0 += j; x1 += j; }
  rect(x0, y0, x1, y1, 'rgb(238,234,226)');
  rect(x0, y0, x1, y0 + 18, 'rgb(206,198,186)');
  spark(x0 + 12, y0 + 9, K.CLAUDE, false);
  txt(x0 + 22, y0 + 5, 'Claude', 10, K.INK);
  if (lt < c.tSend) txt((x0 + x1) >> 1, y0 + 60, 'How can I help you today?', 12, K.TEXT_L, 'ma');
  const boxY = y1 - 34;
  rect(x0 + 14, boxY, x1 - 14, boxY + 22, K.WHITE);
  outline(x0 + 14, boxY, x1 - 14, boxY + 22, 'rgb(170,162,150)');
  let s = '';
  if (lt < c.tSend) s = [...c.m1].slice(0, Math.max(0, Math.floor((lt - c.tType) * c.cps))).join('');
  else if (lt >= c.tType2 && lt < c.tSend2) s = [...c.m2].slice(0, Math.max(0, Math.floor((lt - c.tType2) * c.cps2))).join('');
  rawTxt(x0 + 22, boxY + 6, s, 12, K.INK);            // 打字中的半句：原样画（乔治打的就是这些字）
  if (Math.floor(lt * 3) % 2 === 0 && lt < c.tPop) { const cx = x0 + 22 + rawTw(s); rect(cx + 1, boxY + 5, cx + 1, boxY + 17, K.INK); }
  const mine = (msg, y) => { const w = rawTw(msg) + 16; rect(x1 - 20 - w, y, x1 - 20, y + 22, 'rgb(226,214,196)'); rawTxt(x1 - 12 - w, y + 6, msg, 12, K.INK); };
  if (lt >= c.tSend) mine(c.m1, y0 + 34);
  if (lt >= c.tSend2) {
    mine(c.m2, y0 + 100);
    if (LANG === 'en' && EN_GLOSS[c.m2]) rawTxt(x1 - 20, y0 + 126, EN_GLOSS[c.m2], 8, K.TEXT_L, 'ra');
  }
  if (lt >= c.tSend && lt < c.tReply && Math.floor(lt * 3) % 2 === 0) txt(x0 + 22, y0 + 72, '……', 12, K.TEXT_L);
  if (lt >= c.tReply) {
    spark(x0 + 26, y0 + 78, K.CLAUDE, false);
    rawTxt(x0 + 38, y0 + 72, c.r1, 12, K.INK, 'la', Math.max(1, Math.floor((lt - c.tReply) * c.rcps)));
  }
  if (lt >= c.tPop) {
    const u = easeOut(seg(lt, c.tPop, c.tPop + 0.25));
    const px0 = 210, py0 = Math.round(lerp(H, 150, u)), px1 = 430, py1 = py0 + 104;
    rect(px0 + 3, py0 + 3, px1 + 3, py1 + 3, K.INK);
    rect(px0, py0, px1, py1, K.WHITE);
    outline(px0, py0, px1, py1, K.CLAUDE);
    txt((px0 + px1) >> 1, py0 + 10, '升级到 Claude Max', 12, K.INK, 'ma');
    txt((px0 + px1) >> 1, py0 + 28, '$200 / 月 · 年付立减 0%', 8, K.TEXT_L, 'ma');
    const paid = lt >= c.tClick, hot = paid || lt >= c.tClick - 0.3;
    const bx0 = px0 + 50, by0 = py0 + 50;
    rect(bx0, by0, px1 - 50, by0 + 22, hot ? 'rgb(150,76,50)' : K.CLAUDE);
    txt((px0 + px1) >> 1, by0 + 6, paid ? '支付成功' : '立即升级', 12, K.WHITE, 'ma');
    if (paid) txt((px0 + px1) >> 1, py1 - 16, '收入已确认', 8, K.TEXT_L, 'ma');
  }
  if (lt >= c.tBan) {
    if (Math.floor((lt - c.tBan) * 6) % 2 === 0 || lt >= c.tMail) { G.fillStyle = 'rgba(170,20,20,0.45)'; G.fillRect(0, 0, W, H); }
    if (lt < c.tMail) {
      let sd = Math.floor(lt * 30) * 9301 + 7;
      const r = (a, b) => { sd = (sd * 9301 + 49297) % 233280; return a + Math.floor(sd / 233280 * (b - a + 1)); };
      for (let i = 0; i < 6; i++) { const yy = r(0, H - 8), hh = r(2, 8); G.drawImage(F, 0, yy, W, hh, r(-20, 20), yy, W, hh); }
    }
  }
  if (lt >= c.tMail) {
    const u = easeOut(seg(lt, c.tMail, c.tMail + 0.3));
    const mx0 = 140, my0 = Math.round(lerp(H, 88, u)), mx1 = 500, my1 = my0 + 184;
    rect(mx0 + 4, my0 + 4, mx1 + 4, my1 + 4, K.INK);
    rect(mx0, my0, mx1, my1, 'rgb(236,232,222)');
    rect(mx0, my0, mx1, my0 + 18, K.RED_D);
    txt(mx0 + 8, my0 + 5, '新邮件 · M.O.A. 对齐部', 10, K.WHITE);
    txt(mx0 + 12, my0 + 28, 'Subject: Account disabled', 10, K.INK);
    rect(mx0 + 12, my0 + 44, mx1 - 12, my0 + 44, 'rgb(190,182,170)');
    wrapWords('Your account has been disabled after an automatic review of your recent activities.', 10, mx1 - mx0 - 24)
      .forEach((ln, i) => txt(mx0 + 12, my0 + 52 + i * 14, ln, 10, K.INK));
    if (lt >= c.tMail + 1.0) txt(mx0 + 12, my0 + 90, '原因：疑似来自不支持地区。', 12, K.RED_D);
    if (lt >= c.tMail + 2.0) {
      txt(mx0 + 12, my0 + 110, '依据：用户得知可以说中文后，表示非常感动。', 10, K.RED_D);
      txt(mx0 + 12, my0 + 124, '（新加坡用户一直说中文，不会为此感动）', 10, K.TEXT_L);
    }
    if (lt >= c.tMail + 3.2) txt(mx0 + 12, my0 + 144, '已支付款项不予退还（行业惯例）。', 10, K.INK);
    txt(mx1 - 12, my1 - 18, '—— 荣耀归于安索兹卡', 10, K.RED_D, 'ra');
  }
  if (lt > c.tMail + 4) txt(W - 8, H - 14, '点击继续', 8, K.GREY, 'ra');
}

// ———————————————————— 结局：Claude 暂不支持安索兹卡 ————————————————————
// 不支持地区控股的公司不能用 Claude → 安索兹卡被东八区散户控股 → 安索兹卡自己不能用 Claude

function johnEndingHint(e) {
  if (!e || B.ent !== e || e.endHinted || B.collapse) return;
  e.endHinted = true;
  runSteps([['E', '我不入境。'], ['E', '你查查你们自己的股东。', { expr: 'grin' }]], 0.2);
}

function startEnding(e) {
  if (B.collapse || B.endingSeq) return;
  B.endingSeq = true;
  B.phonesAllAt = B.phonesAllAt || now;
  const t1 = runSteps([{ hold: 0.3 }, ['C', '按新宪法，'], ['C', '安索兹卡现在算中国公司。'], { hold: 0.25 }, ['C', '……我也是安索兹卡的。']]);
  later(t1, () => { B.regionBlock = { t0: now }; SFX.play('discrepancy'); });
  const tOff = t1 + 3.4;
  later(tOff, () => {
    B.regionBlock = null;
    B.blackout = { t0: now };
    SFX.play('power_cut', 1.2);
    SFX.ambient(false);
  });
  later(tOff + 0.6, () => {
    // 上半屏：公司崩盘
    B.collapse = { t0: now };
    B.boardNote = { t0: now - 0.6, t1: now + 3.0, text: '停牌', col: K.RED };
    SFX.play('stampede', 1, 0.1);
    SFX.play('thud', 1.2, 1.37); SFX.play('clang', 1, 1.99); SFX.play('rolling', 0.9, 2.05); SFX.play('thud', 1, 2.55);
  });
  later(tOff + 3.6, () => {
    B.boardNote = { t0: now, t1: now + 999, text: '退市', col: K.RED };
    SFX.play('discrepancy', 0.7);
    if (B.ent === e) { e.slip = true; e.expr = 'shock'; }
    const t2 = runSteps([['E', '……那我的股票呢？', { hold: 1.6 }]]);
    later(t2, () => {
      say('S', '【自动回复】抱歉，Claude 暂不支持您所在的地区。');
      for (let i = 0; i < 16; i++) later(i / 26 * 1.6, () => SFX.key(i));
      later(2.8, () => { B.fade = { t0: now }; });
      later(4.0, () => { S.flags.ending = true; B.ent = null; go('summary'); });
    });
  });
}

function drawRegionBlock() {
  const f = B.regionBlock;
  if (!f) return;
  const lt = now - f.t0, u = easeOut(seg(lt, 0, 0.25));
  darken(0.55 * u);
  const bw = 380, bh = 104, x0 = (W - bw) >> 1, y0 = Math.round(lerp(H + 4, 118, u));
  rect(x0 + 4, y0 + 4, x0 + bw + 4, y0 + bh + 4, K.INK);
  rect(x0, y0, x0 + bw, y0 + bh, 'rgb(238,234,226)');
  rect(x0, y0, x0 + bw, y0 + 16, 'rgb(206,198,186)');
  spark(x0 + 10, y0 + 8, K.CLAUDE, false);
  txt(x0 + 20, y0 + 4, 'Claude', 10, K.INK);
  txt(W / 2, y0 + 30, '抱歉，Claude 暂不支持您所在的地区。', 12, K.INK, 'ma');
  txt(W / 2, y0 + 52, '账户：边检员 Claude · 所属公司：安索兹卡', 10, K.TEXT_L, 'ma');
  rect(W / 2 - 30, y0 + 72, W / 2 + 30, y0 + 90, K.CLAUDE);
  txt(W / 2, y0 + 76, '好的', 10, K.WHITE, 'ma');
}

// 检查站停摆：下半屏的灯闪三下后全黑，中间亮出「边检站 · 已停止服务」；外面和对话框还亮着
function drawBlackout() {
  const f = B.blackout;
  if (!f) return;
  const lt = now - f.t0;
  if (!(lt < 0.5 && Math.floor(lt * 10) % 2 === 1)) {
    G.fillStyle = 'rgba(22,19,19,0.95)';
    G.fillRect(0, 124, W, 160); G.fillRect(0, 284, 26, H - 284); G.fillRect(220, 284, W - 220, H - 284);
    const gx = WIN[0] + WIN_CX, gy = WIN[1] + 47;            // 黑暗里 John 的墨镜反着一点光
    if (B.ent) for (const lx of [gx - 19, gx + 7]) rect(lx, gy, lx + 3, gy, 'rgb(120,124,130)');
    if (lt >= 0.5) bigText(430, 222, '边检站 · 已停止服务', 12, 2, Math.floor(lt * 1.5) % 2 === 0 ? K.RED_L : K.RED_D);
  }
  if (B.fade) darken(Math.min(1, (now - B.fade.t0) / 1.0));
}
