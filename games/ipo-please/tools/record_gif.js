// 录 README 用的动图帧：第 2 天第一位旅客 Max 哥（同视频 2-1「先付款」）。
//   python3 -m http.server 8952 --bind 127.0.0.1 &      （仓库根目录）
//   LANG_PICK=zh|en PW_CORE=<playwright-core 路径> node tools/record_gif.js <帧目录>
// 虚拟时钟每 1/15 秒截一帧（15fps）；鼠标是游戏自己画的指针，缓动移动。从叫号那一刻开录。
// 另存一张 still.png（「收入已确认。」刚打完、Max 哥张着嘴）给链接分享卡片用。之后用 tools/make_media.py 合成。
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const CHROME = process.env.CHROME || path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell');
const URL = process.env.URL || 'http://127.0.0.1:8952/';
const OUT = process.argv[2] || '/tmp/ipo-gif';
const L = process.env.LANG_PICK || 'zh';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const INIT = `(() => {
  let T = 0, q = [];
  performance.now = () => T * 1000;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__tick = (dt) => { T += dt; const cbs = q; q = []; for (const cb of cbs) cb(T * 1000); };
  let a = 20261110;
  Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { localStorage.clear(); } catch (e) {}
})();`;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.addInitScript(INIT);
  await page.goto(URL);
  await page.addStyleTag({ content: '.ui { display: none !important; }' });   // 右上角的 HTML 按钮不进画面
  await page.waitForTimeout(300);

  const ev = (fn, arg) => page.evaluate(fn, arg);
  const FPS = 15;
  let rec = false, n = 0, mx = 320, my = 200;
  const step = async () => {
    await ev(() => { for (let i = 0; i < 2; i++) window.__tick(1 / 30); });
    if (rec) await page.screenshot({ path: path.join(OUT, `f${String(n++).padStart(4, '0')}.png`) });
  };
  const tick = async (sec) => { for (let i = 0; i < Math.round(sec * FPS); i++) await step(); };
  const put = (x, y) => page.mouse.move(x * 2 + 1, y * 2 + 1);
  const moveTo = async (x, y, dur = 0.3) => {
    if (!dur) { await put(x, y); mx = x; my = y; return; }
    const x0 = mx, y0 = my, k = Math.max(1, Math.round(dur * FPS));
    for (let i = 1; i <= k; i++) { const u = i / k, e = u * u * (3 - 2 * u); await put(x0 + (x - x0) * e, y0 + (y - y0) * e); await step(); }
    mx = x; my = y;
  };
  const click = async (x, y, dur) => { await moveTo(x, y, dur); await page.mouse.down(); await step(); await page.mouse.up(); await step(); };
  const drag = async (x0, y0, x1, y1) => {
    await moveTo(x0, y0, 0.3); await page.mouse.down(); await step();
    const x = mx, y = my, k = 6;
    for (let i = 1; i <= k; i++) { const u = i / k, e = u * u * (3 - 2 * u); await put(x + (x1 - x) * e, y + (y1 - y) * e); await step(); }
    mx = x1; my = y1;
    await page.mouse.up(); await step();
  };
  const waitFor = async (fn, max = 15) => { for (let t = 0; t < max; t += 1 / FPS) { if (await ev(fn)) return true; await step(); } return false; };
  const idle = () => waitFor(() => B.ent && now > B.ent.busyUntil && !B.printing, 30);
  const center = (b) => [Math.floor((b[0] + b[2]) / 2), Math.floor((b[1] + b[3]) / 2)];

  // —— 开机选语言 → 开场 → 标题 → 直接跳到第 2 天 ——
  await tick(0.6);
  await put(L === 'en' ? 412 : 228, 172); await page.mouse.down(); await step(); await page.mouse.up();
  await waitFor(() => scene === 'intro', 6);
  await put(320, 200); await page.mouse.down(); await step(); await page.mouse.up();
  await tick(3.5);
  await put(320, 300); await page.mouse.down(); await step(); await page.mouse.up();
  await ev(() => { S.day = 2; go('daycard'); });
  await waitFor(() => scene === 'news', 6);
  await tick(0.8);
  await put(320, 200); await page.mouse.down(); await step(); await page.mouse.up();
  await waitFor(() => scene === 'booth', 4);
  const BTN = await ev(() => ({ INSPECT_BTN, SPEAKER }));
  await ev(() => Object.assign(S.tut, { rules: true, tray: true }));   // 老玩家：宪法和印章栏早会了，提示栏别挡住「+7%」
  await moveTo(...center(BTN.SPEAKER), 0);                         // 鼠标先停在左下角的喇叭上
  await tick(1.2);

  // —— 开录：从叫号那一刻开始 ——
  rec = true;
  await click(...center(BTN.SPEAKER), 0);                          // 叫号
  await waitFor(() => B.ent && B.ent.handed, 25);                  // Hi! 我要入境。→ 请先付款。→ 小票、叮
  await idle(); await tick(0.15);
  // 证件拖上桌：账户卡放左边，护照放右边
  const docs = await ev(() => B.docs.filter((d) => d.owner === 'ent' && !d.big).map((d) => ({ key: d.key, x: d.x, y: d.y })));
  for (const d of docs.filter((q) => q.key !== 'pp')) await drag(d.x + 6, d.y + 5, 262, 246);
  for (const d of docs.filter((q) => q.key === 'pp')) await drag(d.x + 6, d.y + 5, 476, 204);
  await tick(0.2);
  // 检查：护照国籍 × 账户手机号
  await click(...center(BTN.INSPECT_BTN)); await tick(0.1);
  for (const k of ['pp.header', 'ac.手机']) {
    const p = await ev((k) => {
      const [dk, fk] = k.split('.');
      const d = [...B.docs].reverse().find((q) => q.big && q.key === dk);
      const f = d.doc.fields[fk];
      return [d.x + f[0] + 4, d.y + f[1] + 3];
    }, k);
    await click(p[0], p[1], 0.35); await tick(0.1);
  }
  await tick(0.9);                                                 // 看一眼红色横幅
  await click(...center(await ev(() => askBox())));                // 询问
  await idle(); await tick(0.5);                                   // 询问完自动退出检查模式
  // 拉出印章栏，盖拒绝章
  await ev(() => { const p = primaryOf(B.ent); B.docs = B.docs.filter((q) => q !== p).concat([p]); });
  const pp = await ev(() => { const p = primaryOf(B.ent); return [p.x, p.y]; });
  await drag(pp[0] + 8, pp[1] + 6, 452 + 8, 192 + 6);
  await click(632, 224, 0.25); await tick(0.35);
  await click(592, 224, 0.25); await tick(0.3);
  await idle();                                                    // 那我的钱呢？！→ 收入已确认。（印章栏盖完会自己收起）
  await page.screenshot({ path: path.join(OUT, 'still.png') });
  await tick(0.4);
  // 证件还回去
  const left = await ev(() => B.docs.filter((d) => d.owner === 'ent' && d.big).map((d) => ({ key: d.key, x: d.x, y: d.y })));
  for (const d of left.filter((q) => q.key !== 'pp').concat(left.filter((q) => q.key === 'pp'))) {
    await ev((k) => { const d = B.docs.find((q) => q.key === k && q.owner === 'ent' && q.big); B.docs = B.docs.filter((q) => q !== d).concat([d]); }, d.key);
    const p = await ev((k) => { const d = B.docs.find((q) => q.key === k && q.owner === 'ent' && q.big); return [d.x + 20, d.y + 6]; }, d.key);
    await drag(p[0], p[1], 100, 200);
  }
  await moveTo(300, 300, 0.4);
  await tick(1.2);
  rec = false;
  console.log(`${n} 帧 → ${OUT}`);
  console.log(errors.length ? errors.join('\n') : '错误：无');
  await browser.close();
})();
