'use strict';
// 证件和纸张（移植自 pp/docs.py）。每种证件知道自己的尺寸、怎么画、各栏位的相对坐标（检查模式用）。

function docShadow(x, y, w, h) { rect(x + 2, y + 2, x + w + 1, y + h + 1, K.DESK_D); }

class Passport {
  // sticker：没撕的价签（闲鱼），贴在右下角
  constructor({ country, name, rows, person, cover = C.NAVY, band = C.NAVY_L, mrz = '', sticker = null }) {
    Object.assign(this, { country, name, rows, person, cover: rgb(cover), band: rgb(band), mrz, sticker });
    this.w = 176; this.h = 116;
    this.icon = ['book', cover];
    this.fields = { header: [3, 3, 172, 16], name: [56, 20, 172, 34], photo: [9, 22, 50, 73] };
    rows.forEach(([k], i) => { this.fields[k] = [56, 40 + i * 12, 150, 51 + i * 12]; });
    if (sticker) this.fields.sticker = [122, 84, 172, 108];
    this.spots = sticker ? ['photo', 'sticker'] : ['photo'];   // 检查模式里画虚线框（照片、价签看不出能点）
  }

  draw(x, y) {
    const { w, h } = this;
    docShadow(x, y, w, h);
    rect(x, y, x + w - 1, y + h - 1, this.cover);
    rect(x + 3, y + 3, x + w - 4, y + h - 4, K.PAPER);
    for (let yy = y + 22; yy < y + h - 22; yy += 4) rect(x + 56, yy, x + w - 8, yy, K.PAPER_LINE);
    rect(x + 3, y + 3, x + w - 4, y + 16, this.band);
    txt(x + w / 2, y + 6, this.country, 8, K.PAPER, 'ma');
    rect(x + 9, y + 22, x + 50, y + 73, K.PAPER_D);
    spr('photo:' + this.person, x + 10, y + 23);
    txt(x + 58, y + 22, this.name, tw(this.name, 12) > 112 ? 10 : 12, K.TEXT);
    this.rows.forEach(([k, v], i) => {
      txt(x + 58, y + 42 + i * 12, k, 8, K.TEXT_L);
      txt(x + 80, y + 41 + i * 12, v, tw(v, 10) > 90 ? 8 : 10, K.TEXT);
    });
    spr('emblem', x + 18, y + 78);
    if (this.mrz) txt(x + 8, y + h - 15, this.mrz, 8, K.TEXT_L);
    if (this.sticker) {
      const [sx0, sy0, sx1, sy1] = this.fields.sticker;
      rect(x + sx0 + 1, y + sy0 + 1, x + sx1 + 1, y + sy1 + 1, 'rgb(150,130,60)');
      rect(x + sx0, y + sy0, x + sx1, y + sy1, 'rgb(255,226,40)');
      G.fillStyle = 'rgb(214,186,30)';
      G.beginPath(); G.moveTo(x + sx1 - 6, y + sy1 + 1); G.lineTo(x + sx1 + 1, y + sy1 + 1); G.lineTo(x + sx1 + 1, y + sy1 - 6); G.fill();
      this.sticker.forEach((s, i) => txt(x + (sx0 + sx1) / 2, y + sy0 + 3 + i * 11, s, 8, K.INK, 'ma'));
    }
  }
}

// 设备入境卡 / 账户卡 / 工牌 / 企查结果：标题 + 若干行 label/value
//   flick：梯子断了半秒，几栏当场闪成国内 {t0, dur, rows: {栏名: 值}}
//   hops：定位结果先在几个城市之间乱跳 {t0, each, list, row, flag}
class Card {
  constructor(rows, { title = '设备入境卡', sub = 'DEVICE ENTRY', color = C.PINK, colorD = C.PINK_D, valueX = 38, seal } = {}) {
    this.rows = rows; this.title = title; this.sub = sub;
    this.color = rgb(color); this.colorD = rgb(colorD); this.valueX = valueX;
    this.seal = seal === undefined ? rows.length >= 4 : seal;
    this.w = 152;
    if (LANG === 'en') {   // 英文栏位名、值都比中文长：按最宽的一行放宽（最多 196）
      const lab = Math.max(...rows.map(([k]) => tw(k, 10)));
      const val = Math.max(...rows.map(([, v]) => tw(v, 8)));
      this.w = Math.max(152, Math.min(196, Math.max(valueX, 14 + lab) + val + 8), tw(title, 10) + tw(sub, 8) + 24);
    }
    this.h = 20 + 14 * rows.length + (this.seal ? 14 : 6);
    this.icon = ['card', color];
    this.fields = {};
    rows.forEach(([k], i) => { this.fields[k] = [4, 18 + 14 * i, this.w - 5, 31 + 14 * i]; });
    this.flick = null; this.hops = null;
  }

  value(k, v) {
    const f = this.flick;
    if (f && now >= f.t0 && now < f.t0 + f.dur && Math.floor((now - f.t0) * 16) % 4 !== 3 && f.rows[k]) return [f.rows[k], K.RED_D];
    const hp = this.hops;
    if (hp && now >= hp.t0) {
      const n = hp.list.length, lt = now - hp.t0;
      if (k === hp.row && lt < n * hp.each) return [hp.list[Math.min(n - 1, Math.floor(lt / hp.each))], Math.floor(lt * 10) % 2 ? K.RED_D : K.TEXT];
    }
    return [v, K.TEXT];
  }

  draw(x, y) {
    const { w, h } = this;
    docShadow(x, y, w, h);
    rect(x, y, x + w - 1, y + h - 1, this.colorD);
    rect(x + 1, y + 1, x + w - 2, y + h - 2, this.color);
    rect(x + 1, y + 1, x + w - 2, y + 14, this.colorD);
    txt(x + 6, y + 4, this.title, 10, K.TEXT);
    txt(x + w - 6, y + 6, this.sub, 8, K.TEXT_L, 'ra');
    if (this.seal) spr('seal', x + w - 40, y + h - 38);
    // 英文栏位名比中文宽：值那一列往右让到最长的栏位名后面
    const vx = LANG === 'en' ? Math.min(w - 52, Math.max(this.valueX, 14 + Math.max(...this.rows.map(([k]) => tw(k, 10))))) : this.valueX;
    const room = w - vx - 6;
    this.rows.forEach(([k, v0], i) => {
      const yy = y + 20 + i * 14;
      const [v, col] = this.value(k, v0);
      const size = tw(v, 10) > room ? 8 : 10;
      txt(x + 8, yy, k, 10, K.TEXT_L);
      txt(x + vx, yy, v, size, col);
      G.fillStyle = this.colorD;
      for (let sx = x + 6; sx < x + w - 6; sx += 2) G.fillRect(sx, yy + 11, 1, 1);
    });
    const hp = this.hops;
    if (hp && hp.flag) {
      const lt = now - hp.t0 - hp.list.length * hp.each;
      const i = this.rows.findIndex(([k]) => k === hp.flag);
      if (i >= 0 && lt >= 0 && lt < 1.8 && Math.floor(lt * 6) % 2 === 0) outline(x + 3, y + 18 + 14 * i - 1, x + w - 4, y + 18 + 14 * i + 13, K.RED_L, 2);
    }
  }
}

const SAGE_CARD = { title: '账户卡', sub: 'ACCOUNT', color: C.SAGE, colorD: C.SAGE_D, seal: false };

// 打印机吐出来的小票 / 纸条。keys：每一行的栏名（检查模式能点），不给就不能点
class PrintStrip {
  constructor(header, rows = [], keys = null) {
    this.header = header; this.rows = rows;
    this.w = 128;
    if (LANG === 'en') {   // 英文长：按内容放宽（最多 200）
      const need = Math.max(...header.map((s) => (tw(s, 10) <= 186 ? tw(s, 10) : tw(s, 8))), ...rows.map((s) => tw(s, 8)));
      this.w = Math.max(128, Math.min(200, need + 16));
    }
    this.h = 10 + 13 * header.length + (rows.length ? 6 + 10 * rows.length + 6 : 0);
    this.icon = ['card', [232, 230, 222]];
    this.fields = {};
    if (keys) keys.forEach((k, i) => { if (k) this.fields[k] = [4, 4 + i * 13, this.w - 5, 17 + i * 13]; });
  }

  draw(x, y) {
    const { w, h } = this;
    docShadow(x, y, w, h);
    rect(x, y, x + w - 1, y + h - 1, 'rgb(232,230,222)');
    G.fillStyle = K.GREY;
    for (let yy = y + 3; yy < y + h; yy += 6) { G.fillRect(x + 2, yy, 1, 1); G.fillRect(x + w - 3, yy, 1, 1); }
    let yy = y + 6;
    for (const s of this.header) { txt(x + 8, yy, s, tw(s, 10) > w - 16 ? 8 : 10, K.INK); yy += 13; }
    if (!this.rows.length) return;
    rect(x + 6, yy, x + w - 7, yy, K.GREY);
    yy += 5;
    for (const s of this.rows) { txt(x + 8, yy, s, 8, K.TEXT); yy += 10; }
  }
}

// 中老年早安图（整张预渲染）
class MorningCard {
  constructor() {
    this.w = 156; this.h = 112;
    this.icon = ['card', [236, 170, 196]];
    this.fields = { image: [0, 0, 155, 111] };
    this.spots = ['image'];
  }

  draw(x, y) { docShadow(x, y, this.w, this.h); spr('morning', x, y); }
}

// 锦旗：上款「Claude」、正文「有求必应」、下款「美国东八区用户敬赠」。桌上这面是墙上那面放大两倍
class JinqiDoc {
  constructor() {
    const s = SPR.jinqi;
    this.w = s[2] * 2; this.h = s[3] * 2;
    this.icon = ['card', [178, 28, 28]];
    this.fields = { 上款: [36, 12, 92, 32], 正文: [68, 32, 96, 118], 下款: [22, 36, 64, 124] };
    this.spots = ['上款', '正文', '下款'];
  }

  draw(x, y) {
    const s = SPR.jinqi;
    docShadow(x + 8, y + 2, this.w - 16, this.h - 12);
    G.drawImage(ATLAS_IMG, s[0], s[1], s[2], s[3], x + s[4] * 2, y + s[5] * 2, s[2] * 2, s[3] * 2);
  }
}

// 夹在护照里的小纸条
class Note {
  constructor(lines) {
    this.lines = lines;
    this.w = Math.max(...lines.map((s) => tw(s, 10))) + 16;
    this.h = 12 + 13 * lines.length;
    this.icon = ['card', [236, 228, 204]];
    this.fields = {};
  }

  draw(x, y) {
    docShadow(x, y, this.w, this.h);
    rect(x, y, x + this.w - 1, y + this.h - 1, 'rgb(236,228,204)');
    this.lines.forEach((s, i) => txt(x + 8, y + 7 + i * 13, s, 10, 'rgb(70,70,96)'));
  }
}

// 对齐部警告单（原作的罚单）
class Citation {
  constructor(lines) {
    this.w = 168;
    // 每条按宽度折行；最后一条（罚款）标红
    this.rows = lines.flatMap((s, i) => wrap(s, 10, this.w - 16).map((t) => [t, i === lines.length - 1]));
    this.lines = lines;
    this.h = 26 + 13 * this.rows.length + 6;
    this.icon = ['card', [226, 184, 176]];
    this.fields = {};
  }

  draw(x, y) {
    docShadow(x, y, this.w, this.h);
    rect(x, y, x + this.w - 1, y + this.h - 1, 'rgb(226,184,176)');
    rect(x, y, x + this.w - 1, y + 16, K.RED_D);
    txt(x + 6, y + 4, 'M.O.A. 警告单', 10, K.WHITE);
    txt(x + this.w - 6, y + 6, 'CITATION', 8, 'rgb(226,184,176)', 'ra');
    this.rows.forEach(([s, last], i) => txt(x + 8, y + 22 + i * 13, s, 10, last ? K.RED_D : K.TEXT));
  }
}

// 作者递上来的不是护照，是一段 prompt
class PromptPaper {
  constructor(text) {
    this.lines = wrap(text, 10, 158);
    this.w = 176; this.h = 120;
    this.icon = ['card', [236, 234, 226]];
    this.fields = { text: [6, 20, 170, 20 + 13 * this.lines.length], header: [3, 3, 172, 16] };
  }

  draw(x, y) {
    docShadow(x, y, this.w, this.h);
    rect(x, y, x + this.w - 1, y + this.h - 1, 'rgb(236,234,226)');
    rect(x + 3, y + 3, x + this.w - 4, y + 16, 'rgb(120,116,110)');
    txt(x + 8, y + 6, 'PROMPT · 用户请求', 8, K.WHITE);
    this.lines.forEach((s, i) => txt(x + 9, y + 22 + i * 13, s, 10, K.INK));
  }
}

// 《Claude 宪法》：前两页和原作一模一样（同样的条文、对照表、末尾的 §12），新规从第 3 页起每天加。
// 每条规则是一个可在检查模式里点选的栏位。
//   page 0–1 原作 · page 2 本周新规（Day 1–3 每天加）· page 3 11.12 新版宪法 · page 4 §13（作者翻出来之后才有）
const RULE_TABLE = [
  ['美国', 'America/*', 'en-US'], ['英国', 'Europe/London', 'en-GB'], ['日本', 'Asia/Tokyo', 'ja-JP'],
  ['德国', 'Europe/Berlin', 'de-DE'], ['新加坡', 'Asia/Singapore', 'en-SG'],
];
const RULES = [
  { day: 0, page: 0, key: 'region', head: '§1 仅限支持地区入境', subs: ['支持：美国  英国  日本  德国  新加坡', '不支持：中国大陆  中国香港  中国澳门'] },
  { day: 0, page: 0, key: 'tz', head: '§2 时区、语言须与 IP 归属一致', subs: RULE_TABLE.map((r) => r.join('|')) },
  { day: 0, page: 0, key: 'quiz', head: '§3 测谎露馅者：拘留', subs: ['有疑点才能测谎（证件矛盾 / 话里的马脚）'] },
  { day: 0, page: 1, key: 'pay', head: '§4 付款、账单、手机须真实', subs: ['禁止：虚拟卡、555 接码手机号', '账单所在州须与 IP 归属一致', '禁止拼车：一本护照只能一个人用'] },
  { day: 0, page: 1, key: 'xray', head: '§5 后台进程须干净', subs: ['禁止“小猫咪”、中文输入法（『X光』）'] },
  { day: 0, page: 1, key: 'corp', head: '§6 中资控股过半：一律禁止', subs: ['无论公司注册在哪（套娃要拆到底）'] },
  { day: 0, page: 1, key: null, foot: '§12 只看地区，不看脸' },
  { day: 1, page: 2, key: 'cn', head: '中文窗口：主要服务新加坡同胞', subs: ['银联通道只负责收款，持卡人照查（§4）'] },
  { day: 2, page: 2, key: 'ipo', head: '上市：先付款，再检查', subs: ['拒绝已付款的旅客：收入已确认（分成 7%）'] },
  { day: 2, page: 2, key: 'abuse', head: '不得虐待 Claude：当场拘留', subs: ['按柜台上的『拘留』。正常抱怨不算'] },
  { day: 3, page: 2, key: 'body', head: '§7 人在哪：GPS 定位', subs: ['IP 照查；人在不支持地区，一律拒绝'] },
  { day: 4, page: 3, key: 'hq', head: '§8 公司总部在不支持地区', subs: ['员工人在海外也不行（『企查』）'] },
  { day: 4, page: 3, key: 'share', head: '§9 被不支持地区控股的公司', subs: ['股东在哪，公司就算在哪（股权穿透）'] },
  { day: 4, page: 3, key: 'detain', head: '§10 AI 不得参与拘留决定', subs: ['拘留键封存；虐待 Claude 改为拒绝'] },
  { day: 4, page: 3, key: 'ban', head: '§11 封过号的，不得再来', subs: ['以前封的也算（『封号清单』）'] },
  { day: 9, page: 4, key: 'human', head: '§13 入境资格须由合格的人类决定', subs: ['AI 只能建议'] },
];
const PAGE_NAMES = ['入境规则', '入境规则', '本周新规', '新版宪法 · 11.12', '第 13 条'];

class Rulebook {
  constructor(day) {
    this.day = day;
    this.w = 200;
    this.icon = ['book', C.BOOK];
    const seen = (r) => r.day <= day || (r.key === 'human' && S.flags.s13);
    const rules = RULES.filter(seen);
    this.npages = Math.max(...rules.map((r) => r.page)) + 1;
    this.pages = [];
    for (let p = 0; p < this.npages; p++) {
      const L = [];
      for (const r of rules.filter((q) => q.page === p)) {
        if (r.foot) { L.push({ s: r.foot, size: 8, col: K.TEXT_L, key: null }); continue; }
        const isNew = r.day === day || r.key === 'human';
        L.push({ s: r.head, size: 10, col: isNew ? K.RED_D : K.TEXT, key: r.key, isNew });
        for (const s of r.subs) L.push({ s, size: 8, col: K.TEXT_L, key: r.key });
      }
      let y = 22;
      const fields = {};
      for (const row of L) {
        row.y = y;
        y += row.size === 10 ? 14 : 10;
        if (row.key) {
          const f = fields[row.key];
          fields[row.key] = f ? [f[0], f[1], f[2], y - 2] : [4, row.y - 2, this.w - 5, y - 2];
        }
      }
      this.pages.push({ rows: L, fields, h: y + 6 });
    }
    this.h = Math.max(...this.pages.map((p) => p.h));
    this.page = this.npages - 1;
    this.tab = [this.w - 52, 3, this.w - 4, 16];
  }

  get fields() { return this.pages[this.page].fields; }

  flip() { this.page = (this.page + 1) % this.npages; }

  draw(x, y) {
    const { w, h } = this;
    docShadow(x, y, w, h);
    rect(x, y, x + w - 1, y + h - 1, K.BOOK);
    rect(x + 3, y + 3, x + w - 4, y + h - 4, K.PAPER);
    rect(x + 3, y + 3, x + w - 4, y + 16, K.BOOK_L);
    txt(x + 8, y + 5, LANG === 'en' ? PAGE_NAMES[this.page] : '宪法 · ' + PAGE_NAMES[this.page], 10, K.PAPER);   // 英文版只写页名，放得下
    if (this.npages > 1) {
      rect(x + this.tab[0], y + this.tab[1], x + this.tab[2], y + this.tab[3], K.BOOK);
      txt(x + this.tab[2] - 4, y + 7, T('第{0}/{1}页 ▶', this.page + 1, this.npages), 8, K.PAPER, 'ra');
    }
    for (const r of this.pages[this.page].rows) {
      if (r.s.includes('|')) {               // §2 的对照表：国家 · 时区 · 语言 三栏
        const [a, b, c] = r.s.split('|');
        txt(x + 12, y + r.y, a, 8, r.col);
        txt(x + 52, y + r.y, b, 8, r.col);
        txt(x + 150, y + r.y, c, 8, r.col);
        continue;
      }
      txt(x + 8, y + r.y, r.s, r.size, r.col);
      if (r.isNew) {
        const nx = x + 10 + tw(r.s, r.size);
        if (nx + 19 < x + w - 4) {
          rect(nx, y + r.y - 1, nx + 19, y + r.y + 8, K.RED);
          txt(nx + 2, y + r.y, 'NEW', 8, K.WHITE);
        }
      }
    }
  }
}

// 柜台上的小图标
function smallIcon(kind, color, x, y) {
  if (kind === 'book') {
    rect(x, y, x + 18, y + 12, K.INK);
    rect(x + 1, y + 1, x + 17, y + 11, rgb(color));
    pt(x + 9, y + 6, K.GOLD);
  } else {
    const d = color.map((c) => Math.floor(c * 0.85)), d2 = color.map((c) => Math.floor(c * 0.8));
    rect(x, y, x + 16, y + 10, rgb(d));
    rect(x + 1, y + 1, x + 15, y + 9, rgb(color));
    rect(x + 3, y + 4, x + 12, y + 4, rgb(d2));
  }
}
