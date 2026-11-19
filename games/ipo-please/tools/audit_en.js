#!/usr/bin/env node
// 英文版 UI 体检：英文模式下把五天里的证件、小票、检查横幅、宪法、开门提示、清单名字、按钮等都量一遍，列出放不下的。
//   python3 -m http.server 8952 --bind 127.0.0.1 &
//   PW_CORE=<playwright-core 路径> node tools/audit_en.js
const path = require('path');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const CHROME = process.env.CHROME || path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell');
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('ipo-please-lang', 'en'));
  await page.goto(process.env.URL || 'http://127.0.0.1:8952/');
  await page.waitForTimeout(800);
  const out = await page.evaluate(() => {
    const bad = [];
    const add = (where, what, s, w, room) => bad.push(`${where} | ${what} | ${tr(s)} | ${Math.round(w)} > ${Math.round(room)}`);
    const card = (where, d) => {
      if (!(d instanceof Card)) return;
      const vx = Math.min(d.w - 52, Math.max(d.valueX, 14 + Math.max(...d.rows.map(([k]) => tw(k, 10)))));
      const room = d.w - vx - 6;
      for (const [k, v] of d.rows) if (tw(v, 8) > room) add(where, `卡片「${tr(k)}」`, v, tw(v, 8), room);
      if (tw(d.title, 10) + tw(d.sub, 8) + 18 > d.w) add(where, '卡片标题', `${d.title} / ${d.sub}`, tw(d.title, 10) + tw(d.sub, 8) + 18, d.w);
    };
    const strip = (where, d) => {
      for (const s of d.header) if (tw(s, 8) > d.w - 16) add(where, '小票', s, tw(s, 8), d.w - 16);
      for (const s of d.rows) if (tw(s, 8) > d.w - 16) add(where, '小票行', s, tw(s, 8), d.w - 16);
    };
    const issue = (where, is) => {
      if (!is) return;
      if (tw(is.title, 10) > 236) add(where, '横幅标题', is.title, tw(is.title, 10), 236);
      if (is.sub && wrap(is.sub, 8, 236).length > 2) add(where, '横幅说明（超过两行）', is.sub, tw(is.sub, 8), 472);
    };
    const hint = (where, s) => { if (s && wrap(s, 8, 400).length > 2) add(where, '提示（超过两行）', s, tw(s, 8), 800); };
    for (let day = 1; day <= 5; day++) {
      newGame(); S.day = day; S.flags.s13 = true; go('booth');
      for (const [i, sp] of B.queue.entries()) {
        const where = `D${day}#${i} ${sp.type || sp.person}`;
        if (sp.type) { if (sp.list) for (const it of sp.list) if (it.line && tw(it.line, 12) > 176 * 2) add(where, '快剪台词', it.line, tw(it.line, 12), 352); continue; }
        for (const d of sp.docs || []) { card(where, d.doc); if (d.doc instanceof PrintStrip) strip(where, d.doc); }
        if (sp.pay && sp.pay.lines) strip(where, new PrintStrip(sp.pay.lines));
        if (sp.lookup) card(where + ' 企查', sp.lookup);
        const L = sp.locate || {};
        const loc = L.loc || '美国 · 洛杉矶';
        card(where + ' 定位', new Card([['位置', loc]].concat(L.stay ? [['停留', L.stay]] : []).concat([['来源', 'GPS 定位']]), { title: '定位结果', sub: '§7 LOCATION' }));
        for (const is of sp.issues || []) issue(where, is);
        issue(where, sp.tell);
        if (sp.abuse) issue(where, { title: sp.abuse.title || '虐待 Claude', sub: sp.abuse.sub || '' });
        hint(where, sp.hint);
        for (const it of sp.xray || []) {
          const lines = Array.isArray(it.label) ? it.label : [it.label];
          const lw = Math.max(...lines.map((s) => tw(s, 8))) + 6;
          if (lw > WIN_W - 4) add(where, 'X 光标签', lines.join(' / '), lw, WIN_W - 4);
        }
      }
      for (const lines of [DAY_NOTICE[day]]) { const w = Math.max(...lines.map((s, i) => tw(s, i ? 10 : 12))) + 24; if (w > 410) add(`D${day}`, '开门提示', lines.join(' / '), w, 410); }
      if (tw(DAY_SUB[day], 10) > 600) add(`D${day}`, '日期卡', DAY_SUB[day], tw(DAY_SUB[day], 10), 600);
    }
    // 宪法
    const rb = new Rulebook(5);
    rb.pages.forEach((pg, p) => {
      if (tw(PAGE_NAMES[p], 10) > rb.w - 64) add(`宪法 P${p + 1}`, '页眉', PAGE_NAMES[p], tw(PAGE_NAMES[p], 10), rb.w - 64);
      for (const r of pg.rows) {
        if (r.s.includes('|')) { const [a, b, c] = r.s.split('|'); if (tw(a, 8) > 40) add(`宪法 P${p + 1}`, '表格', a, tw(a, 8), 40); if (tw(b, 8) > 96) add(`宪法 P${p + 1}`, '表格', b, tw(b, 8), 96); continue; }
        const room = rb.w - 16 - (r.isNew ? 22 : 0);
        if (tw(r.s, r.size) > room) add(`宪法 P${p + 1}`, '条文', r.s, tw(r.s, r.size), room);
      }
    });
    // 封号清单名字、按钮
    for (const b of S.world.bans || []) if (tw(b.name, 8) > 96) add('清单', '名字', b.name, tw(b.name, 8), 96);
    for (const s of ['检查', 'X光', '定位', '企查', '清单', '拘留', '测谎', '询问']) if (tw(s, 8) > 34) add('按钮', '小字', s, tw(s, 8), 34);
    // 其他小票
    strip('苹果退款', new PrintStrip(['Apple', '退款已批准', '$200 · 全额']));
    strip('拼车小票', new PrintStrip(['Max 三年 · 6 人拼', '收入已确认：3 年', '实际可用：0 天']));
    strip('花呗小票', new PrintStrip(['收款成功', 'Claude Max  $200', '支付方式：花呗', '分 12 期 · 免息']));
    return bad;
  });
  console.log(out.length ? out.join('\n') : '没有发现放不下的');
  if (errs.length) console.log('页面错误：', errs.join('\n'));
  await browser.close();
})();
