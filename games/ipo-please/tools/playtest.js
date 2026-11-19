// 自动试玩：虚拟时钟 + 真实鼠标事件，从开机一路玩到结局，关键画面截图。
//   python3 -m http.server 8952 --bind 127.0.0.1 &      （仓库根目录）
//   PW_CORE=<playwright-core 路径> node tools/playtest.js [输出目录]
// 机器人按剧本里每位旅客的 spec 判断：查一处矛盾（能询问就询问）、该测谎就测谎、该拘留就拘留，然后盖章、还证件。
// MISTAKES=1：故意放错几个人，看警告单。控制台打印每位旅客的台词、判定和警告单。
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const CHROME = process.env.CHROME || path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell');
const URL = process.env.URL || 'http://127.0.0.1:8952/';
const OUT = process.argv[2] || '/tmp/ipo-shots';
const DAYS = +(process.env.DAYS || 5);
fs.mkdirSync(OUT, { recursive: true });

const INIT = `(() => {
  let T = 0, q = [];
  performance.now = () => T * 1000;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__tick = (dt) => { T += dt; const cbs = q; q = []; for (const cb of cbs) cb(T * 1000); };
  let a = +(${JSON.stringify(process.env.SEED || '20261112')});
  Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { localStorage.clear(); } catch (e) {}
})();`;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.addInitScript(INIT);
  await page.goto(URL);
  await page.waitForTimeout(500);

  const ev = (fn, arg) => page.evaluate(fn, arg);
  const tick = async (sec) => { await ev((n) => { for (let i = 0; i < n; i++) window.__tick(1 / 30); }, Math.round(sec * 30)); };
  const S2 = 2;
  const click = async (x, y) => { await page.mouse.move(x * S2 + 1, y * S2 + 1); await page.mouse.down(); await tick(0.05); await page.mouse.up(); await tick(0.1); };
  const drag = async (x0, y0, x1, y1) => {
    await page.mouse.move(x0 * S2 + 1, y0 * S2 + 1); await page.mouse.down(); await tick(0.05);
    for (let k = 1; k <= 6; k++) { await page.mouse.move((x0 + (x1 - x0) * k / 6) * S2 + 1, (y0 + (y1 - y0) * k / 6) * S2 + 1); await tick(0.02); }
    await page.mouse.up(); await tick(0.15);
  };
  let shotN = 0;
  const shot = async (name) => { await tick(0.05); await page.screenshot({ path: path.join(OUT, `${String(++shotN).padStart(3, '0')}-${name}.png`) }); };
  const log = (...a) => console.log(...a);
  const waitFor = async (fn, max = 15, arg) => { for (let t = 0; t < max; t += 0.2) { if (await ev(fn, arg)) return true; await tick(0.2); } return false; };
  const idle = () => waitFor(() => B.ent && now > B.ent.busyUntil && !B.printing && !B.limit && !B.authorSeq, 30);

  // —— 开机 → 开场 → 标题 → 日期 → 报纸 ——
  // 开机就是选语言：LANG=en 点右边的 English，默认点中文
  await tick(0.6); await shot('boot');
  const L = process.env.LANG_PICK || 'zh';
  await click(L === 'en' ? 412 : 228, 172); await tick(0.6); await shot('lang');
  await waitFor(() => scene === 'intro', 6);
  await tick(4); await shot('intro');
  await click(320, 200); await tick(1.6); await shot('title-o');
  await tick(1.6); await shot('title');
  await click(320, 300);

  const center = (b) => [Math.floor((b[0] + b[2]) / 2), Math.floor((b[1] + b[3]) / 2)];
  const BTN = await ev(() => ({ INSPECT_BTN, XRAY_BTN, LOCATE_BTN, LOOKUP_BTN, BAN_BTN, DETAIN_BTN, QUIZ_BTN, SPEAKER, BOOK_BOX, RUSH_APPROVE, RUSH_DENY, BAN_NEXT }));

  // 检查模式下点两处（或一处）：'dv.时区' / 'say:文字' / 'win.face' / 'ban:身份'
  async function inspect(name, keys, ask) {
    await click(...center(BTN.INSPECT_BTN)); await tick(0.2);
    for (const k of keys) {
      if (k.startsWith('ban:')) {
        // 翻到那一页
        for (let i = 0; i < 8; i++) {
          const ok = await ev((who) => { const i = S.world.bans.findIndex((b) => b.who === who); return i >= 0 && Math.floor(i / BAN_PER) === B.ban.page; }, k.slice(4));
          if (ok) break;
          await click(...center(BTN.BAN_NEXT));
        }
      }
      const p = await ev((k) => {
        if (k.startsWith('say:')) { const hit = lineBoxes().find((b) => b.ln.full === k.slice(4)); return hit && [hit.box[0] + 6, hit.box[1] + 6]; }
        if (k.startsWith('win.')) { const s = windowSpots(B.ent).find((q) => q.key === k); return s && [(s.box[0] + s.box[2]) >> 1, (s.box[1] + s.box[3]) >> 1]; }
        if (k.startsWith('ban:')) { const i = S.world.bans.findIndex((b) => b.who === k.slice(4)); const c = banCell(i % BAN_PER); return [c[0] + 48, c[1] + 30]; }
        if (k.startsWith('xr.')) { const it = B.ent.spec.xray.find((q) => q.key === k); const b = xrayItemBox(B.ent, it); return [(b[0] + b[2]) >> 1, (b[1] + b[3]) >> 1]; }
        const [dk, fk] = k.split('.');
        if (dk === 'rule' && !B.ruleInst) toggleRules();
        const d = [...B.docs].reverse().find((q) => q.big && q.key === dk);
        if (!d) return null;
        B.docs = B.docs.filter((q) => q !== d).concat([d]);   // 玩家会把要看的证件挪到最上面
        const f = d.doc.fields[fk];
        return f && [d.x + f[0] + 3, d.y + f[1] + 3];
      }, k);
      if (!p) { log(`   !! 找不到栏位 ${k}`); continue; }
      await click(p[0], p[1]);
    }
    await tick(0.3);
    const bn = await ev(() => B.insp.banner && `${B.insp.banner.title} | ${B.insp.banner.sub}${B.insp.banner.ask ? ' [询问]' : ''}`);
    log(`   检查 ${keys.join(' + ')} → ${bn}`);
    await shot(`${name}-inspect`);
    const canAsk = await ev(() => B.insp.banner && B.insp.banner.ask);
    if (ask && canAsk) { await click(...center(await ev(() => askBox()))); await tick(0.2); return; }
    if (await ev(() => B.insp.on)) { await click(...center(BTN.INSPECT_BTN)); await tick(0.2); }
  }

  async function placeDocs() {
    const docs = await ev(() => B.docs.filter((d) => d.owner === 'ent' && !d.big).map((d) => ({ key: d.key, x: d.x, y: d.y, primary: d.key === B.ent.spec.primary })));
    let px = 250, py = 250;
    for (const d of docs.filter((q) => !q.primary)) { await drag(d.x + 6, d.y + 5, px + 24, py + 12); px += 20; py -= 30; }
    for (const d of docs.filter((q) => q.primary)) await drag(d.x + 6, d.y + 5, 476, 204);
  }

  async function stampAndReturn(kind, name, giveBack = true) {
    await ev(() => { const p = primaryOf(B.ent); B.docs = B.docs.filter((q) => q !== p).concat([p]); p.x = 452; p.y = 192; });
    await click(632, 224); await tick(0.5);
    await click(kind === 'approve' ? 512 : 592, 224); await tick(0.9);
    await shot(`${name}-stamp`);
    if (!giveBack) return;
    await idle();
    const left = await ev(() => B.docs.filter((d) => d.owner === 'ent' && d.big && !d.loose && !d.gift).map((d) => ({ key: d.key, x: d.x, y: d.y, primary: d.key === B.ent.spec.primary })));
    for (const d of left.filter((q) => !q.primary).concat(left.filter((q) => q.primary))) {
      await ev((k) => { const d = B.docs.find((q) => q.key === k && q.owner === 'ent' && q.big); if (d) B.docs = B.docs.filter((q) => q !== d).concat([d]); }, d.key);
      const p = await ev((k) => { const d = B.docs.find((q) => q.key === k && q.owner === 'ent' && q.big); return d && [d.x + 20, d.y + 6]; }, d.key);
      if (p) await drag(p[0], p[1], 100, 200);
    }
  }

  const mistakes = new Set((process.env.MISTAKES || '').split(',').filter(Boolean));

  async function traveler(i) {
    const info = await ev(() => { const s = B.queue[B.idx]; return { type: s.type, person: s.person, who: s.type ? null : whoOf(s), ok: s.ok, abuse: s.abuse && s.abuse.when, tell: s.tell && s.tell.say, quiz: !!s.quiz,
      // 有「出错栏 + 宪法条款」组合的，只单点出错那一栏（测减负后的单点警告）
      issue: s.issues && s.issues[0] && (() => { const r = s.issues[0].pairs.find((p) => p.length === 2 && p.some((k) => k.startsWith('rule.'))); return r ? r.filter((k) => !k.startsWith('rule.')) : s.issues[0].pairs[0]; })(),
      disguised: !!s.disguised, cn: !!s.cn, abuseLine: s.abuse && s.abuse.lines[s.abuse.lines.length - 1][1], xray: s.xray && s.xray[0].key, lookup: !!s.lookup, limit: !!s.limit, then: s.then, ending: !!s.ending,
      banned: !s.type && S.world.bans.some((b) => b.who === whoOf(s)), list: s.list && s.list.map((r) => r.ok) }; });
    const name = `d${await ev(() => S.day)}-${i}-${info.type || info.person}`;
    if (info.type) {
      await click(...center(BTN.SPEAKER));
      await waitFor(() => B.event && !B.event.lock, 10);
      let n = 0;
      while (await ev(() => !!B.event)) {
        if (await ev(() => B.event && !B.event.lock && B.ent)) {
          const ok = await ev(() => B.event.list[B.event.i].ok);
          if (n === 1) await shot(`${name}-rush`);
          await click(...center(ok === 'approve' ? BTN.RUSH_APPROVE : BTN.RUSH_DENY));
          n++;
        }
        await tick(0.2);
      }
      log(`\n[${name}] ${info.type} ${n} 人`);
      await tick(1.5);
      return;
    }
    await click(...center(BTN.SPEAKER));
    await waitFor(() => B.ent && B.ent.handed, 25);
    await idle();
    await placeDocs();
    await tick(0.4);
    const day = await ev(() => S.day);
    if (i === 0 || info.then === 'apple' || info.person === 'CARPOOL') await shot(`${name}-desk`);
    if (i === 0) { await click(...center(BTN.BOOK_BOX)); await tick(0.3); await shot(`${name}-rules`); await click(...center(BTN.BOOK_BOX)); }
    if (info.person === 'MIKE') { await tick(2.5); await shot(`${name}-gpshint`); log(`   提示栏：${await ev(() => hintText())}`); }
    if (day >= 3) { await click(...center(BTN.LOCATE_BTN)); await tick(0.2); await waitFor(() => !B.printing, 5); await tick(info.person === 'MIKE' ? 3 : 0.3); }
    if (day >= 4 && info.lookup && !info.ending) { await click(...center(BTN.LOOKUP_BTN)); await waitFor(() => !B.printing, 5); await tick(0.3); }
    if (info.limit) {
      await click(632, 224); await tick(1.0); await shot(`${name}-limit`);
      await waitFor(() => !B.limit, 6); await idle(); await tick(1);
    }
    if (info.then === 'author') {
      await click(632, 224); await tick(1.6); await shot(`${name}-s13`);
      await waitFor(() => !B.authorSeq && !B.closeup, 40); await tick(0.2);
      await waitFor(() => !B.ent, 10);
      log(`\n[${name}] 作者 → 自己盖了绿章`);
      return;
    }
    if (info.ending) {
      // John：随便操作他都不走（盖拒绝章、还护照 → 弹回桌上），太久没点『企查』会提醒；点『企查』自动进结局
      await idle(); await tick(0.5);
      await stampAndReturn('deny', name);
      await tick(1);
      log(`\n[${name}] 盖章还护照后：`, await ev(() => [B.ent && B.ent.phase, B.lines.slice(-2).map((l) => l.text), B.flash && B.flash.text]));
      await click(...center(BTN.LOOKUP_BTN)); await waitFor(() => !B.printing, 5); await tick(1); await shot(`${name}-lookup`);
      await tick(7); await shot(`${name}-blocked`);
      await tick(2.5); await shot(`${name}-blackout`);
      await tick(2.2); await shot(`${name}-collapse`);
      await tick(2.5); await shot(`${name}-autoreply`);
      await waitFor(() => scene === 'summary', 30);
      log(`\n[${name}] 结局`);
      return;
    }
    if (info.xray) { await click(...center(BTN.XRAY_BTN)); await tick(1); await inspect(name, [info.xray], true); await idle(); await click(...center(BTN.XRAY_BTN)); }
    else if (info.tell) { await inspect(name, [`say:${info.tell}`], true); await idle(); if (info.quiz) { await click(...center(BTN.QUIZ_BTN)); await idle(); await shot(`${name}-quiz`); } }
    else if (info.issue) {
      const keys = info.issue.map((k) => k);
      if (info.limit) await waitFor(() => B.docs.some((d) => d.key === 'rc' && d.doc.fields['支付方式']), 10);
      await inspect(name, keys, true); await idle();
      if (info.cn && day <= 5 && !info.ending) {          // 中国内地的：测谎会条件反射接梗
        await click(...center(BTN.QUIZ_BTN)); await idle();
        log(`   测谎 → ${(await ev(() => B.lines.slice(-3).map((l) => `${l.who}: ${l.text}`))).join(' / ')}`);
      }
    }
    if (day >= 4 && info.banned && !info.ending) {
      await click(...center(BTN.BAN_BTN)); await tick(0.4);
      if (i <= 1) await shot(`${name}-banlist`);
      await inspect(name, ['win.face', `ban:${info.who}`], !info.disguised);   // 伪装的：应该对不上
      await idle();
      await click(...center(BTN.BAN_BTN)); await tick(0.3);
    }
    let decision = info.ok[0];
    if (info.abuse) {
      if (info.abuse === 'slow') await tick(15);
      if (info.abuse !== 'approve') {
        await waitFor(() => B.ent && B.ent.abused, 25);
        await idle();
        await inspect(name, [`say:${info.abuseLine}`], true); await idle();    // 点那句虐待的话 → 警告 → 询问
      }
      decision = day <= 3 ? 'detain' : 'deny';
    }
    if (info.then === 'chat') decision = mistakes.has('jorji-deny') ? 'deny' : 'approve';
    if (mistakes.has(name)) decision = decision === 'approve' ? 'deny' : 'approve';
    const st = await ev(() => B.lines.slice(-8).map((l) => `${l.who}: ${l.text}`));
    if (info.abuse === 'approve') {
      await stampAndReturn('approve', name, false);
      await waitFor(() => B.ent && B.ent.abused, 15);
      await inspect(name, [`say:${info.abuseLine}`], false);
      await click(...center(BTN.DETAIN_BTN)); await tick(1.2); await shot(`${name}-detain`); await tick(2.5);
    } else if (decision === 'detain') {
      await click(...center(BTN.DETAIN_BTN)); await tick(1.2); await shot(`${name}-detain`); await tick(2.5);
    } else {
      if (day >= 4 && info.person === 'FISH') { await click(...center(BTN.DETAIN_BTN)); await tick(0.5); await shot(`${name}-blocked`); await idle(); }
      await stampAndReturn(decision, name);
      await waitFor(() => !B.ent || B.cut, 15);
      if (info.then === 'apple') {
        // 退款窗口：卷帘门、苹果哥领钱走人，逐帧截下来
        await waitFor(() => B.kioskAt !== null, 6);
        for (let k = 0; k < 20; k++) {
          await page.screenshot({ path: path.join(OUT, `kiosk-${String(k).padStart(2, '0')}.png`), clip: { x: 500 * S2, y: 50 * S2, width: 140 * S2, height: 75 * S2 } });
          await tick(0.25);
        }
      }
    }
    if (info.then === 'chat' && decision === 'approve') {
      await waitFor(() => B.cut && now > B.cut.t0, 5);
      await tick(6); await shot(`${name}-chat`);
      await tick(11); await shot(`${name}-mail`);
      await waitFor(() => B.cut && now - B.cut.t0 > CHAT.tMail + 4.2, 10);
      await click(320, 200); await tick(0.5);
      await waitFor(() => !B.cut, 10);
      await tick(1); await shot(`${name}-refund`);
      await waitFor(() => !B.ent, 20);
    }
    await tick(1.2);
    const after = await ev(() => B.lines.slice(-8).map((l) => `${l.who}: ${l.text}`));
    log(`\n[${name}] ${decision}`);
    for (const l of [...new Set([...st, ...after])]) log('   ', l);
    const cits = await ev(() => B.docs.filter((d) => d.key === 'cit').map((d) => d.doc.lines.join(' / ')));
    if (cits.length) log('   警告单：', cits.join(' || '));
    await ev(() => { B.docs = B.docs.filter((d) => d.key !== 'cit'); });
  }

  for (let day = 1; day <= DAYS; day++) {
    await waitFor(() => scene === 'news', 10);
    await tick(1); await shot(`news${day}`);
    await click(320, 200); await tick(0.8);
    await shot(`booth${day}`);
    const n = await ev(() => B.queue.length);
    for (let i = 0; i < n; i++) {
      await traveler(i);
      if (await ev(() => scene !== 'booth')) break;
    }
    await waitFor(() => scene === 'summary', 20);
    await tick(3); await shot(`summary${day}`);
    log(`\n===== DAY ${day} 结算：`, JSON.stringify(await ev(() => ({ ledger: SUM.ledger, on: SUM.on, bal: sumBalance(), ant: S.world.ant && S.world.ant.toFixed(2), phones: S.world.phones, queue: S.world.queue.length, bans: S.world.bans.length }))));
    await click(525, 331); await tick(1);
    if (await ev(() => scene === 'end')) break;
  }
  await waitFor(() => scene === 'end', 10);
  await tick(3); await shot('end');
  log('\n最终：', JSON.stringify(await ev(() => [scene, S.stats, S.world.bans.map((b) => b.name)])));
  log('错误：', errors.length ? errors.join('\n') : '无');
  await browser.close();
})();
