'use strict';
// 语言：开局选中文 / English（选语言画面也在这个文件末尾）。中文是原文，英文译文在 en.js 里，以中文原句为键。
//   T('中文')           英文模式下查表；中文模式原样返回
//   T('模板 {0}', x)    先翻模板，再把每个参数也翻一遍填进去
// gfx.js 的 txt / tw / bigText / wrap 在英文模式下会自动过一遍查表，所以写死的中文字面量不用到处套 T()；
// 拼接出来的句子（`…${x}…`）才要改成 T('…{0}…', x)。
// 英文模式下查不到的中文会在控制台提示一次（也可以跑 node tools/check_en.js 一次查全）。

const LANG_KEY = 'ipo-please-lang';
const CJK = /[　-〿㐀-鿿＀-￯]/;
let LANG = initialLang();

function initialLang() {
  try {
    const l = localStorage.getItem(LANG_KEY);
    if (l === 'zh' || l === 'en') return l;
  } catch (e) { /* 隐私模式等 */ }
  return /^zh/i.test(navigator.language || 'zh') ? 'zh' : 'en';
}

function T(s, ...args) {
  s = String(s);
  if (LANG === 'en') s = enText(s);
  return args.length ? s.replace(/\{(\d)\}/g, (_, i) => T(String(args[i]))) : s;
}

// 显示用：英文模式查表，中文模式原样（gfx.js 画字前都过一遍）
function tr(s) { return LANG === 'en' ? enText(String(s)) : String(s); }

const untranslated = new Set();
function enText(s) {
  if (Object.prototype.hasOwnProperty.call(EN, s)) return EN[s];
  if (s.includes(' · ')) return s.split(' · ').map(enText).join(' · ');   // “中国 · 浙江 · 电信”逐段翻
  if (CJK.test(s) && !EN_KEEP.has(s) && !untranslated.has(s)) { untranslated.add(s); console.warn('[i18n] 缺英文译文：', s); }
  return s;
}

// 观众读完这些字要几秒：汉字按每秒 cps 个，字母数字按 3 个算 1 个汉字（和视频 booth.read_time 一样）
function readTime(s, cps = 9) {
  let n = 0;
  for (const ch of String(s)) {
    if (/[一-鿿]/.test(ch)) n += 1;
    else if (!/[\s…，。！？、：；「」（）·|]/.test(ch)) n += 1 / 3;
  }
  return n / cps;
}

// 台词停留时长按字数算；英文字母的阅读量大约半个汉字
function readLen(s) {
  const chars = [...String(s)];
  return LANG === 'en' ? chars.reduce((n, ch) => n + (CJK.test(ch) ? 1 : 0.5), 0) : chars.length;
}

// 左下角对白的打字速度（每秒几个字符）：英文字母多，打快一点
const typeSpeed = () => (LANG === 'en' ? 45 : 26);

function setLang(l) {
  LANG = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* 同上 */ }
  applyDomLang();
}

// 页面上的几个 HTML 按钮和提示（不在画布里）
function applyDomLang() {
  const root = document.documentElement;
  root.lang = LANG === 'en' ? 'en' : 'zh-CN';
  document.title = T('IPO, PLEASE · 请出示资金证明');
  for (const el of document.querySelectorAll('#full, #rotate div, #rotate small, #rotate button')) {
    if (el.dataset.zh === undefined) el.dataset.zh = el.textContent;
    el.textContent = T(el.dataset.zh);
  }
  const cv = document.getElementById('game');
  if (cv) cv.setAttribute('aria-label', T('IPO, PLEASE 游戏画面'));
  updateMuteLabel();
}

// ———————————————————— 开局：选语言 ————————————————————
// 选语言本身也是一次入境检查：看一眼玩家自己设备的时区和语言，对不上就开个玩笑（只在本地读，不上传）。

const LANG_CARDS = { zh: [146, 128, 310, 216], en: [330, 128, 494, 216] };
const GAG_BOX = [120, 236, 520, 294];
let PICK = null;

const DEVICE = (() => {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* 老浏览器 */ }
  const off = -new Date().getTimezoneOffset() / 60;
  return { tz: tz || `UTC${off >= 0 ? '+' : ''}${off}`, lang: navigator.language || '?', utc8: off === 8 };
})();

function langGag(l) {
  const d = DEVICE;
  if (l === 'en' && d.utc8) {
    return { sub: `TZ: ${d.tz}   VS   LANG: English`, quip: '“Hello, I am 美国人。”', note: 'Approved anyway. Payment received. Revenue confirmed.' };
  }
  if (l === 'zh' && !d.utc8 && !/^zh/i.test(d.lang)) {
    return { sub: `时区 TZ: ${d.tz}   VS   语言 LANG: 中文`, quip: '“……我在学中文。”', note: "(\"…I'm learning Chinese.\") 准予入境。" };
  }
  return null;
}

function langClick(x, y) {
  if (PICK) { if (now > PICK.t0 + 0.5) go('intro'); return; }
  const l = ['zh', 'en'].find((k) => inBox(x, y, LANG_CARDS[k]));
  if (!l) return;
  setLang(l);
  PICK = { lang: l, t0: now, gag: langGag(l), buzzed: false };
  SFX.play('stamp_approve', 1, 0.03);
}

function updateLangPick() {
  if (!PICK) return;
  if (PICK.gag && !PICK.buzzed && now > PICK.t0 + 0.45) { PICK.buzzed = true; SFX.play('discrepancy'); }
  if (now > PICK.t0 + (PICK.gag ? 3.4 : 1.0)) go('intro');
}

function drawLangCard(l) {
  const box = LANG_CARDS[l], [x0, y0, x1, y1] = box;
  const hover = !PICK && ptr.mouse && inBox(ptr.x, ptr.y, box);
  const up = hover ? 2 : 0, top = y0 - up, bot = y1 - up, cx = (x0 + x1) >> 1;
  rect(x0 + 3, y0 + 3, x1 + 3, y1 + 3, K.INK);
  rect(x0, top, x1, bot, l === 'zh' ? 'rgb(118,32,36)' : K.NAVY);
  outline(x0 + 4, top + 4, x1 - 4, bot - 4, hover ? K.CLAUDE_L : K.GOLD);
  // 选语言画面上的字是固定双语，不过查表
  rawTxt(cx, top + 11, l === 'zh' ? '简体中文' : 'LANGUAGE', 8, K.GOLD, 'ma');
  if (l === 'zh') rawBig(cx, top + 26, '中文', 12, 3, K.GOLD);
  else rawBig(cx, top + 32, 'ENGLISH', 12, 2, K.GOLD);
  rawTxt(cx, bot - 18, l === 'zh' ? 'zh-CN' : 'en-US', 8, K.GOLD, 'ma');
  rawTxt(cx, y1 + 7, l === 'zh' ? '原汁原味 · 梗最多' : 'For REAL Americans', 8, K.GREY, 'ma');
  if (!PICK) return;
  darken(PICK.lang === l ? 0.6 : 0.7, C.INK, [x0, top, x1 + 1, bot + 1]);
  if (PICK.lang !== l) return;
  const s = sprite('stamp:approve');
  G.drawImage(ATLAS_IMG, s[0], s[1], s[2], s[3], cx - s[2], ((top + bot) >> 1) - s[3] + 6, s[2] * 2, s[3] * 2);
}

function drawLangPick() {
  drawBg();
  darken(0.86);
  spr('title_emblem', 298, 12);
  rawBig(W / 2, 64, 'IPO, PLEASE', 12, 3, K.WHITE, K.INK);
  rawTxt(W / 2, 106, '请出示你的语言 · LANGUAGE, PLEASE', 10, K.CLAUDE_L, 'ma');
  drawLangCard('zh');
  drawLangCard('en');
  const gag = PICK && PICK.gag && now > PICK.t0 + 0.45;
  if (gag) {
    const [x0, y0] = GAG_BOX, cx = (GAG_BOX[0] + GAG_BOX[2]) >> 1;
    rect(...GAG_BOX, K.INK); outline(...GAG_BOX, K.RED);
    rawTxt(cx, y0 + 6, '信息不符  DISCREPANCY', 12, K.RED_L, 'ma');
    rawTxt(cx, y0 + 22, PICK.gag.sub, 10, K.WHITE, 'ma');
    rawTxt(cx, y0 + 34, PICK.gag.quip, 10, K.CLAUDE_L, 'ma');
    rawTxt(cx, y0 + 47, PICK.gag.note, 8, K.GREY, 'ma');
  } else {
    rawTxt(W / 2, 246, `你的设备 YOUR DEVICE    时区 TZ: ${DEVICE.tz}    语言 LANG: ${DEVICE.lang}`, 8, K.GREY, 'ma');
    rawTxt(W / 2, 258, '* 切换语言不会改变你的 IP 归属 · Switching language does not change your IP', 8, K.GREY_D, 'ma');
  }
  rawTxt(W / 2, 302, '建议横屏、打开声音 · 鼠标或手指拖动证件 · 5 天，约 25 分钟', 8, K.GREY, 'ma');
  rawTxt(W / 2, 313, 'Landscape + sound on · Drag papers with mouse or finger · 5 days, about 25 min', 8, K.GREY, 'ma');
  rawTxt(W / 2, 332, '致敬 Lucas Pope《Papers, Please》 · 画面音效均由程序生成', 8, K.GREY_D, 'ma');
  rawTxt(W / 2, 343, "A tribute to Lucas Pope's Papers, Please · All art and sound made by code", 8, K.GREY_D, 'ma');
}
