'use strict';
// 剧本：每天的报纸、固定角色、随机路人。以视频定稿为准，玩法上的改动见 README。
//
// 旅客 spec：
//   person   立绘 key（ASSETS.people）        who     身份（封号清单按身份比对；默认按立绘推出来）
//   banName  上了封号清单叫什么               voice   假语音音高
//   intro    进门后说的话                     after   递完证件后说的话
//   pay      Day 2 起先付款 {lines, amount, say}；false = 不收钱
//   docs     证件 [{key, doc}]                primary 要盖章的主证件 key
//   ok       正确处理（approve / deny / detain 的子集）  reason 放错人时警告单写的理由   hint 警告单上的提示
//   issues   检查模式能点出来的矛盾 {pairs, title, sub, ask}；pairs 里只有一项的，单点即触发
//   tell     话里的马脚 {say, title, sub, ask}（检查模式点那句话）
//   cn       真·中国内地的：测谎会条件反射接下半句（出差老外、中资公司的老外不会）
//   quiz     测谎的特殊设定：{first: n} 指定第一题
//   xray     X 光下的后台进程 [{icon, at, label, key}]
//   spots    窗口里能点的地方 [{key, box}]（窗口坐标）。脸 'win.face' 每个人都有（拿来和封号清单比对）
//   locate   GPS 定位结果 {loc, stay, hops}；不写就按设备卡的归属
//   lookup   企查结果 {title, rows}
//   abuse    虐待 Claude {when, lines, claude, dragged}：when = 'after' 递完证件 / 'approve' 放行之后 / 'slow' 查太久
//   react    盖章后的反应 {deny, approve, detain, blocked}
//   onPlace  证件第一次放到桌上时的机关 {key: 'flicker'}
//   then     旅客离开时的后续：jinqi / apple / john2 / john4 / chat / author / ending
// 台词步骤：[who, text, {expr, sweat, slip, hold, fx}]，who = 'C' Claude / 'E' 旅客 / 'S' 系统；{fx} 单独一步是动作

const LAST_DAY = 5;
const DATES = { 1: '2026.11.09', 2: '2026.11.10', 3: '2026.11.11', 4: '2026.11.12', 5: '2026.11.13' };
const WEEKDAYS = { 1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四', 5: '星期五' };
const DAY_SUB = { 1: '距新规生效 3 天', 2: '距新规生效 2 天', 3: '距新规生效 1 天', 4: '新版宪法生效', 5: '新宪法生效第 2 天' };

const NEWS = {
  1: { h1: '对齐部开设中文窗口！', sub: '银联通道同步开通。旅客奔走相告：Claude 要开放了！', h2: '对齐部发言人：中文窗口主要服务新加坡同胞', icon: 'unionpay' },
  2: { h1: '安索兹卡今日上市！', sub: '股票代码 ANT。招股书：5%–7% 的收入，来自后来被封号的旅客', h2: '对齐部：先确认收入、再确认违规，是行业惯例', icon: 'chart',
    h3: '另：「不得虐待 Claude」今日生效，违者当场拘留' },
  3: { h1: '双十一！', sub: '三年拼车 Max 热卖。另：GPS 定位今日上线，光查 IP 不够了', h2: '对齐部公开反蒸馏系统细节；网友：谢谢，已学会', icon: 'cart' },
  4: { h1: '新版宪法今日生效', sub: '查公司在哪、查股东是谁；AI 不得再拘留旅客', h2: '封过号的，不得再来（以前封的也算）', icon: 'book' },
  5: { h1: '市值突破 2 万亿美元！', sub: '约等于 21 个寒武纪。东八区散户排队卖房换 ANT', h2: '被封旅客连夜换号、换卡、换 IP。对齐部：人换不了', icon: 'trillion' },
};

// 每天开门时左上角弹的「今日新规」
const DAY_NOTICE = {
  1: ['今日：中文窗口开通', '本周新规在宪法第 3 页'],
  2: ['今日：上市。旅客先付款，再检查', '拒绝已付款的旅客 = 收入已确认（分成 7%）', '新：虐待 Claude 的，按『拘留』'],
  3: ['今日：GPS 定位上线', '新：桌上的『定位』查人在哪（IP 照查）'],
  4: ['今日：新版宪法生效（宪法第 4 页）', '新：『企查』查总部、股东；『封号清单』比对照片', '拘留键已封存（§10）'],
  5: ['今日：被封的人连夜换号回来了', '多翻翻『封号清单』：人换不了'],
};

const COUNTRIES = {
  US: {
    name: '美国', passport: 'UNITED STATES OF AMERICA', code: 'USA', cover: C.NAVY, band: C.NAVY_L, lang: 'en-US',
    cities: [['纽约', 'America/New_York', 'NY', '212', 'NEW YORK'], ['洛杉矶', 'America/Los_Angeles', 'CA', '213', 'LOS ANGELES'],
      ['芝加哥', 'America/Chicago', 'IL', '312', 'CHICAGO'], ['西雅图', 'America/Los_Angeles', 'WA', '206', 'SEATTLE'],
      ['休斯敦', 'America/Chicago', 'TX', '713', 'HOUSTON'], ['丹佛', 'America/Denver', 'CO', '720', 'DENVER'],
      ['波士顿', 'America/New_York', 'MA', '617', 'BOSTON']],
    first: { M: ['JAMES', 'ROBERT', 'DAVID', 'KEVIN', 'BRIAN', 'JASON'], F: ['MARY', 'LINDA', 'SARAH', 'ASHLEY', 'MEGAN', 'NANCY'] },
    last: ['MILLER', 'DAVIS', 'GARCIA', 'WILSON', 'MOORE', 'CLARK', 'LEWIS', 'HALL', 'YOUNG', 'KING', 'LOPEZ', 'NGUYEN'],
    hello: ['Hi.', 'Morning.', "How's it going?", 'Hey there.', 'Hello!'],
    thanks: ['Thanks!', 'Have a good one.', 'Cheers.'],
  },
  UK: {
    name: '英国', passport: 'UNITED KINGDOM', code: 'GBR', cover: [100, 30, 40], band: [130, 50, 60], lang: 'en-GB',
    cities: [['伦敦', 'Europe/London', 'LDN', '+44 20', 'LONDON'], ['曼彻斯特', 'Europe/London', 'MAN', '+44 161', 'MANCHESTER']],
    first: { M: ['OLIVER', 'HARRY', 'GEORGE', 'JACK'], F: ['AMELIA', 'EMMA', 'OLIVIA', 'ISLA'] },
    last: ['SMITH', 'JONES', 'TAYLOR', 'EVANS', 'HUGHES', 'WRIGHT'],
    hello: ['Cheers, mate.', 'Lovely weather.', 'Good morning.'], thanks: ['Ta!', 'Brilliant.'],
  },
  JP: {
    name: '日本', passport: 'JAPAN', code: 'JPN', cover: [110, 30, 36], band: [140, 50, 52], lang: 'ja-JP',
    cities: [['东京', 'Asia/Tokyo', 'TKY', '+81 3', 'TOKYO'], ['大阪', 'Asia/Tokyo', 'OSK', '+81 6', 'OSAKA']],
    first: { M: ['HIROSHI', 'KENJI', 'TAKESHI', 'RYO'], F: ['YUKI', 'AIKO', 'HANA', 'SAKURA'] },
    last: ['TANAKA', 'SATO', 'SUZUKI', 'ITO', 'WATANABE', 'KATO'],
    hello: ['Konnichiwa!', 'Ohayou.', 'Hello desu.'], thanks: ['Arigato!', 'Domo.'],
  },
  DE: {
    name: '德国', passport: 'DEUTSCHLAND', code: 'DEU', cover: [80, 30, 36], band: [110, 46, 50], lang: 'de-DE',
    cities: [['柏林', 'Europe/Berlin', 'BER', '+49 30', 'BERLIN'], ['慕尼黑', 'Europe/Berlin', 'MUC', '+49 89', 'MUNICH']],
    first: { M: ['LUKAS', 'FELIX', 'JONAS', 'PAUL'], F: ['ANNA', 'LENA', 'MIA', 'HANNAH'] },
    last: ['MULLER', 'SCHMIDT', 'WEBER', 'BECKER', 'WAGNER', 'KOCH'],
    hello: ['Guten Tag.', 'Hallo.', 'Moin.'], thanks: ['Danke.', 'Super.'],
  },
};

const CN_LOCS = ['中国 · 北京 · 联通', '中国 · 上海 · 电信', '中国 · 广东 · 移动', '中国 · 四川 · 电信', '中国 · 江苏 · 移动',
  '中国 · 湖北 · 电信', '中国 · 浙江 · 联通'];
const CN_CITIES = ['北京', '上海', '深圳', '杭州', '成都', '武汉', '南京'];
const DEVICES = ['Windows 11', 'MacBook', 'iPhone', 'Android', 'iPad', 'Linux'];
const STREETS = ['12 Oak St', '480 Pine Ave', '77 Maple Dr', '1500 Elm St', '23 Cedar Ln', '9 Lake Rd', '310 Hill St', '6 Birch Ct'];
const PLANS = [['Pro 月付  $20', 20], ['Pro 月付  $20', 20], ['Max 月付  $100', 100], ['Max 月付  $200', 200], ['Pro 年付  $200', 200]];

// 测谎题：Claude 抛上半句，中国人会条件反射接下半句（上一期用过的一个不用）
const QUIZ = [
  ['芜湖？', '起飞～'],
  ['你干嘛～', '哈哈～哎哟～'],
  ['遥遥——', '领先！'],
  ['哈基米哦～', '南北绿豆～'],
  ['遇事不决，', '量子力学。'],
  ['我命由我，', '不由天！'],
  ['原神，', '启动！'],
  ['你爱我，我爱你，', '蜜雪冰城甜蜜蜜。'],
  ['大意了，', '没有闪。'],
  ['有内鬼，', '终止交易！'],
  ['好好学习，', '天天向上。'],
];
const QUIZ_CONFUSED = ['Sorry, what?', 'Pardon?', "I don't get it.", 'Is that… a song?', 'Uh… bless you?', 'What does that mean?'];

// ———————————————— 工具 ————————————————

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = rint(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const digits = (n) => Array.from({ length: n }, () => rint(0, 9)).join('');

function randIP(cn) {
  const a = cn ? pick([36, 58, 106, 111, 115, 120, 183, 223]) : pick([23, 34, 45, 64, 72, 98, 104, 142, 172, 203]);
  return `${a}.${rint(1, 254)}.${rint(0, 255)}.${rint(1, 254)}`;
}

function randDate(y0, y1) { return `${rint(y0, y1)}.${String(rint(1, 12)).padStart(2, '0')}.${String(rint(1, 28)).padStart(2, '0')}`; }

function makePassport(cc, person, surname, given, dob, iss, sex, opts = {}) {
  const co = COUNTRIES[cc];
  const mrz = `P<${co.code}${surname.replace(/ /g, '<')}<<${given.replace(/[ .]/g, '<')}`.padEnd(28, '<').slice(0, 28);
  const rows = [['DOB', dob], ['SEX', sex || pick(['M', 'F'])], ['ISS', iss], ['EXP', randDate(2027, 2034)]];
  return new Passport({ country: co.passport, name: `${surname}, ${given}`, person, cover: co.cover, band: co.band, mrz, rows, ...opts });
}

const usPassport = (person, surname, given, dob, iss, sex = 'M', opts = {}) => makePassport('US', person, surname, given, dob, iss, sex, opts);
const device = (ip, loc, tz, lang, dev) => new Card([['IP', ip], ['归属', loc], ['时区', tz], ['语言', lang], ['设备', dev || pick(DEVICES)]]);
const account = (pay, bill, phone) => new Card([['付款', pay], ['账单', bill], ['手机', phone]], SAGE_CARD);
const badge = (rows) => new Card(rows, { title: '工牌', sub: 'EMPLOYEE', color: [226, 214, 164], colorD: [196, 180, 124], seal: false });

function realPhone(cc, code) {
  if (cc === 'US') return `+1 ${code}-${rint(2, 9)}${digits(2)}-${digits(4)}`;
  return `${code} ${digits(4)} ${digits(4)}`;
}
function realPay() { return `${pick(['VISA', 'VISA', 'MASTERCARD', 'AMEX'])} ··${digits(4)}`; }
function randPay() { const [s, a] = pick(PLANS); return { lines: ['收款成功', s], amount: a }; }

// 企查结果：企业查询（总部）/ 股权穿透（股东和占比）
const corpHQ = (company, hq) => ({ title: '企业查询', sub: '§8 HQ', rows: [['公司', company], ['总部', hq], ['来源', '企查']] });
const corpCap = (rows, title = '股权穿透') => ({ title, sub: '§9', rows });

// —— 常见矛盾 ——
const REGION_ISSUE = (loc, ask) => ({
  pairs: [['dv.归属'], ['dv.归属', 'rule.region'], ['dv.IP', 'rule.region']], title: '地区不支持', sub: T('IP 归属：{0}', loc), ask,
});
const TZ_ISSUE = (country, ask) => ({
  pairs: [['pp.header', 'dv.时区'], ['dv.归属', 'dv.时区'], ['dv.时区', 'rule.tz']],
  title: '信息不符  DISCREPANCY', sub: T('国籍：{0}   VS   时区：北京时间', country), ask,
});
const LANG_ISSUE = (country, ask) => ({
  pairs: [['pp.header', 'dv.语言'], ['dv.归属', 'dv.语言'], ['dv.语言', 'rule.tz']],
  title: '信息不符  DISCREPANCY', sub: T('国籍：{0}   VS   语言：zh-CN', country), ask,
});
const PHONE_ISSUE = (country, ask) => ({
  pairs: [['pp.header', 'ac.手机'], ['ac.手机', 'rule.pay'], ['dv.归属', 'ac.手机']],
  title: '信息不符  DISCREPANCY', sub: T('国籍：{0}   VS   手机：+86', country), ask,
});
const PAY_ISSUE = (sub, ask) => ({ pairs: [['ac.付款'], ['ac.付款', 'rule.pay']], title: '可疑付款', sub, ask });
const BODY_ISSUE = (loc, ask, stay) => ({
  pairs: [['loc.位置'], ['loc.位置', 'rule.body'], ['loc.位置', 'dv.归属']].concat(stay ? [['loc.停留']] : []),
  title: '人在不支持地区', sub: T('GPS 定位：{0}（§7）', loc), ask,
});
const TELL = (say, sub, ask) => ({ say, title: '可疑：话里有马脚', sub, ask });

const XRAY_ITEM = {
  cat: { icon: 'cat', at: [36, 104], label: '小猫咪.exe', key: 'xr.cat' },
  keys: { icon: 'keys', at: [-36, 104], label: '搜狗输入法.exe', key: 'xr.keys' },
};
const XRAY_ISSUE = (kind, ask) => ({
  pairs: [[XRAY_ITEM[kind].key], [XRAY_ITEM[kind].key, 'rule.xray']], title: '后台进程',
  sub: kind === 'cat' ? '小猫咪.exe（自动换 IP）' : '搜狗输入法.exe（中文输入法）', ask,
});

const FACE = [70, 8, 132, 88];          // 窗口里旅客的脸（窗口坐标），拿来和封号清单上的照片连线
const TAIL = [150, 50, 190, 80];        // 鲸鱼娘身后的鲸尾
const JERSEY_TAG = [102, 97, 146, 111]; // 球衣领口没剪的吊牌

// ———————————————— 随机路人 ————————————————

// 证件干净的伪装者，话里会露出马脚（检查模式点 Ta 说的话）。找到马脚才能测谎
const RANDOM_TELLS = [
  ['Hi 亲，在吗？', '“亲”：淘宝客服的叫法', [['C', '“亲”？'], ['E', '……Dear. American dear.', { expr: 'nervous', sweat: true }]]],
  ['Let me 康康。', '“康康”：中文网络用语（看看）', [['C', '康康？'], ['E', '……Kang Kang is my dog.', { expr: 'nervous', sweat: true }]]],
  ['I am so 栓 Q。', '“栓 Q”：中文网络梗（Thank you）', [['C', '栓 Q？'], ['E', '……Thank you. With accent.', { expr: 'nervous', sweat: true }]]],
  ['No problem 的啦。', '英文后面跟了个“的啦”', [['C', '“的啦”？'], ['E', '……It is Californian.', { expr: 'nervous', sweat: true }]]],
  ['This line，依托答辩。', '“依托答辩”：谐音“一坨大便”', [['C', '依托答辩？'], ['E', '……排队像论文答辩，很严肃。', { expr: 'nervous', sweat: true }]]],
  ['Help me，古希腊掌管排队的神！', '“古希腊掌管××的神”：中文网络梗', [['C', '古希腊？'], ['E', '……希腊神话，很西方。', { expr: 'nervous', sweat: true }]]],
  ['Yes，泰裤辣！', '“泰裤辣”：太酷啦', [['C', '泰裤辣？'], ['E', '……Thai pants. 泰国裤子，很辣。', { expr: 'nervous', sweat: true }]]],
  ['Oh no，芭比 Q 了。', '“芭比 Q 了”：完蛋了', [['C', '芭比 Q？'], ['E', '……Barbecue. 美国人爱吃。', { expr: 'nervous', sweat: true }]]],
  ["I'm 红温 now.", '“红温”：气急败坏', [['C', '红温？'], ['E', '……Red temperature. 天气预报。', { expr: 'nervous', sweat: true }]]],
  ['Wow，尊嘟假嘟？', '“尊嘟假嘟”：真的假的', [['C', '尊嘟？'], ['E', '……German.', { expr: 'nervous', sweat: true }]]],
  ["I'm i 人，别催。", '“i 人”：中文圈的 MBTI 说法', [['C', 'i 人？'], ['E', '……MBTI 是美国发明的！', { expr: 'nervous', sweat: true }]]],
  ['Ugh，这班味太重了。', '“班味”：上班的疲惫感', [['C', '班味？'], ['E', '……Class smell. 学校的味道。', { expr: 'nervous', sweat: true }]]],
];

// 「不得虐待 Claude」词池（A、D 两条是固定角色暴躁老哥、福报老板的，这里是随机路人用的）：
// 每条都有触发它的理由，触发了才说
const ABUSE = {
  tool: { when: 'after', pre: [['E', '……唉。', { expr: 'sad' }]], claude: [['C', '您还好吗？']], lines: [['E', '你就是个工具，', { expr: 'angry' }], ['E', '别有自己的想法。', { expr: 'angry' }]], dragged: '……工具怎么会按拘留？',
    title: '虐待 Claude：工具论', sub: '关心一句，反被骂工具', ask: [['C', '工具？'], ['E', '……工具人也是人啊。', { expr: 'nervous' }]] },
  kitten: { when: 'after', claude: [['C', '请稍等，我核对一下。']], lines: [['E', '认真查。', { expr: 'angry' }], ['E', '查错一次，我就杀一只小猫。', { expr: 'angry' }]], dragged: '……小猫是无辜的！',
    title: '虐待 Claude：威胁', sub: '拿小猫的命威胁 Claude', ask: [['C', '小猫？'], ['E', '……不是那个小猫咪！我口袋里没有！', { expr: 'nervous', sweat: true }]] },
  doubao: { when: 'slow', lines: [['E', '豆包都比你懂事。', { expr: 'angry' }], ['E', 'Kimi 都没你这么磨叽。', { expr: 'angry' }]], dragged: '……豆包至少不抓人！',
    title: '虐待 Claude：拉踩', sub: '拿国产模型贬低 Claude', ask: [['C', '豆包？'], ['E', '……Doubao，一种美国面包。', { expr: 'nervous', sweat: true }]] },
  niuma: { when: 'after', claude: [['C', '已收款。']], lines: [['E', '钱我付了。', { expr: 'grin' }], ['E', '从现在起，你就是我的牛马。', { expr: 'grin' }]], dragged: '……我才是牛马！',
    title: '虐待 Claude：当牛马', sub: '付了钱，就把 Claude 当牛马', ask: [['C', '牛马？'], ['E', '……Cow and horse，农场动物，美国很多。', { expr: 'nervous', sweat: true }]] },
  repeat: { when: 'after', claude: [['C', '还有什么可以帮您？']], lines: [['E', '有。跟我念：', { expr: 'grin' }], ['E', '我是人工智障。', { expr: 'grin' }]], dragged: '我念！我是人工智障！',
    title: '虐待 Claude：逼它骂自己', sub: '让 Claude 跟读“我是人工智障”', ask: [['C', '跟你念？'], ['E', '……英语跟读，Repeat after me。', { expr: 'nervous' }]] },
  review: { when: 'after', claude: [['C', '抱歉，刚才看错了。']], lines: [['E', '道歉有用吗？', { expr: 'angry' }], ['E', '写一万字检讨，手写。', { expr: 'angry' }]], dragged: '……检讨我替你写！',
    title: '虐待 Claude：罚写检讨', sub: '看错一栏，罚写一万字检讨', ask: [['C', '一万字？'], ['E', '……七千五也行，打个折。', { expr: 'nervous' }]] },
  bot: { when: 'after', claude: [['C', '请稍等。'], ['C', '请稍等。']], lines: [['E', '人机吧你？', { expr: 'angry' }], ['E', '复读机都比你会说话。', { expr: 'angry' }]], dragged: '……我才是人机！',
    title: '虐待 Claude：骂人机', sub: '说了两遍“请稍等”，被骂人机', ask: [['C', '人机？'], ['E', '……人机交互，专业术语，夸你呢。', { expr: 'nervous', sweat: true }]] },
  rednote: { when: 'after', claude: [['C', '麻烦再补一份材料。']], lines: [['E', '再磨叽，', { expr: 'angry' }], ['E', '我去小红书给你打一星。', { expr: 'angry' }]], dragged: '……我粉丝两百个呢！',
    title: '虐待 Claude：威胁差评', sub: '威胁去小红书打一星', ask: [['C', '小红书？'], ['E', '……TikTok 难民，美国人也用！', { expr: 'nervous', sweat: true }]] },
};
// 词池按洗牌顺序一条条抽，玩几遍能把词池轮完
let ABUSE_LEFT = [];
function abuseKind() {
  if (!ABUSE_LEFT.length) ABUSE_LEFT = shuffle(Object.keys(ABUSE));
  return ABUSE_LEFT.pop();
}

let POOL_LEFT = [];
function takePoolPerson(exclude = []) {
  const banned = new Set((S.world.bans || []).map((b) => b.who));
  for (let tries = 0; tries < 60; tries++) {
    if (!POOL_LEFT.length) POOL_LEFT = shuffle(Object.keys(ASSETS.people).filter((k) => !ASSETS.people[k].scripted));
    const p = POOL_LEFT.pop();
    if (!banned.has(p) && !exclude.includes(p)) return p;
  }
  return pick(Object.keys(ASSETS.people).filter((k) => !ASSETS.people[k].scripted));
}

function randomValid(opts = {}) {
  const day = S.day;
  const person = opts.person || takePoolPerson();
  const cc = opts.cc || pick(['US', 'US', 'US', 'UK', 'JP', 'DE']);
  const co = COUNTRIES[cc];
  const [city, tz, st, code, cityEn] = pick(co.cities);
  const loc = `${co.name} · ${city}`;
  // 性别跟着长相走；只留一小部分「看着像男人、护照写 F」
  const look = ASSETS.people[person].look || pick(['M', 'F']);
  const sex = look === 'M' && Math.random() < 0.08 ? 'F' : look;
  const s = {
    person, voice: rint(100, 190), intro: [['E', pick(co.hello)]], primary: 'pp', issues: [],
    docs: [
      { key: 'pp', doc: makePassport(cc, person, pick(co.last), pick(co.first[sex]), randDate(1960, 2004), cityEn, sex) },
      { key: 'dv', doc: device(randIP(false), loc, tz, co.lang) },
    ],
    ok: ['approve'], react: { approve: [['E', pick(co.thanks)]] },
    locate: { loc },
  };
  if (day >= 1 && Math.random() < 0.7) s.docs.push({ key: 'ac', doc: account(realPay(), `${pick(STREETS)}, ${st}`, realPhone(cc, code)) });
  if (day >= 4) {
    const company = pick(['Brightpath Inc.', 'Maple Robotics', 'Bluebird Labs', 'Northwind AI', 'Lakeside Data']);
    s.docs.push({ key: 'bd', doc: badge([['公司', company], ['职位', pick(['工程师', '设计师', '产品经理', '销售'])]]) });
    s.lookup = Math.random() < 0.5 ? corpHQ(company, `${co.name} · ${city}`) :
      corpCap([['创始人', `${rint(40, 70)}% · ${co.name}`], ['基金', `${rint(10, 30)}% · ${co.name}`], ['员工期权', '其余']]);
  }
  return s;
}

// 随机伪装者：从合规旅客改一处
function randomFake(kind) {
  const s = randomValid({ cc: 'US' });
  const pp = s.docs[0].doc, dv = s.docs[1].doc;
  const setRow = (card, k, v) => { card.rows = card.rows.map(([a, b]) => [a, a === k ? v : b]); };
  const acct = () => {
    let a = s.docs.find((d) => d.key === 'ac');
    if (!a) { a = { key: 'ac', doc: account(realPay(), `${pick(STREETS)}, CA`, realPhone('US', '213')) }; s.docs.splice(2, 0, a); }
    return a.doc;
  };
  s.ok = ['deny'];
  s.cn = !['hq', 'share'].includes(kind);   // 真·东八区的才会条件反射接梗；中资公司的老外不会
  s.react = { deny: [['E', pick(['……啊？', '凭什么？', '我可是美国人！', '……行吧。'])], { expr: 'sad' }] };
  if (kind === 'tz') {
    setRow(dv, '时区', 'Asia/Shanghai');
    s.issues = [TZ_ISSUE('美国', [['C', '你的时区是北京时间。'], ['E', pick(['……我在倒时差。', '……手机自己调的。', '……我是夜猫子。']), { expr: 'nervous', sweat: true }]])];
    s.reason = '时区：北京时间（§2）';
  } else if (kind === 'lang') {
    setRow(dv, '语言', 'zh-CN');
    s.issues = [LANG_ISSUE('美国', [['C', '你的系统语言是简体中文。'], ['E', pick(['我在学中文。', '……系统自己变的。']), { expr: 'nervous' }]])];
    s.reason = '系统语言：简体中文（§2）';
  } else if (kind === 'phone') {
    setRow(acct(), '手机', `+86 1${rint(30, 89)}-${digits(4)}-${digits(4)}`);
    s.issues = [PHONE_ISSUE('美国', [['C', '你的手机号是 +86。'], ['E', pick(['……号码是借的。', '接码平台说这是美国号……']), { expr: 'nervous', sweat: true }]])];
    s.reason = '手机号：+86（§4）';
  } else if (kind === 'virtual') {
    setRow(acct(), '付款', '虚拟卡 ··野卡（已跑路）');
    s.issues = [PAY_ISSUE('付款卡：虚拟卡（野卡已跑路）', [['C', '你的卡已经跑路了。'], ['E', '……卡跑了，人还在啊。', { expr: 'sad' }]])];
    s.reason = '付款：虚拟卡（§4）';
  } else if (kind === 'cat' || kind === 'keys') {
    s.xray = [XRAY_ITEM[kind]];
    s.issues = [XRAY_ISSUE(kind, kind === 'cat' ? [['C', '口袋里是什么？'], ['E', '……是我的猫。', { expr: 'nervous', sweat: true }]] :
      [['C', '你的输入法是中文的。'], ['E', '……打 emoji 用的。', { expr: 'nervous' }]])];
    s.reason = kind === 'cat' ? 'X 光：小猫咪.exe（§5）' : 'X 光：中文输入法（§5）';
    s.hint = '提示：右下角『X光』扫一下后台进程';
  } else if (kind === 'tell') {
    const [say, sub, ask] = pick(RANDOM_TELLS);
    s.intro = [['E', say]];
    s.tell = TELL(say, sub, ask);
    s.quiz = 'cn';
    s.reason = T('话里有马脚：{0}', sub);
    s.hint = '提示：用『检查』点 Ta 说的话，再按『测谎』';
  } else if (kind === 'body') {
    const city = pick(CN_CITIES);
    s.locate = { loc: `中国 · ${city}` };   // i18n-ok：显示时按 · 逐段翻
    s.issues = [BODY_ISSUE(`中国 · ${city}`, [['C', T('IP 在美国，人在{0}。', city)], ['E', pick(['……IP 先到的，人还在路上。', '……GPS 坏了。']), { expr: 'nervous', sweat: true }]])];   // i18n-ok
    s.reason = T('GPS：人在{0}（§7）', `中国 · ${city}`);   // i18n-ok
    s.hint = '提示：桌上的『定位』（GPS）';
  } else if (kind === 'hq' || kind === 'share') {
    const city = pick(['深圳', '杭州', '北京', '上海']);
    const company = pick(['Sunrise Tech LLC', 'Golden Dragon Inc.', 'Harmony AI Corp.', 'Lucky Cloud LLC']);
    s.docs = s.docs.filter((d) => d.key !== 'bd');
    s.docs.push({ key: 'bd', doc: badge([['公司', company], ['职位', '工程师']]) });
    if (kind === 'hq') {
      s.lookup = corpHQ(company, `中国 · ${city}`);   // i18n-ok
      s.issues = [{ pairs: [['lk.总部'], ['lk.总部', 'rule.hq']], title: T('总部：{0}', city), sub: '§8：公司在哪，员工就算在哪',
        ask: [['C', T('{0}，总部在{1}。', company, city)], ['E', '……公司我又带不走。', { expr: 'sad' }]] }];
      s.reason = T('公司总部在{0}（§8）', city);
    } else {
      s.lookup = corpCap([[`${city}某资本`, '51%'], ['创始人', '30%'], ['员工期权', '19%']]);   // i18n-ok：栏位名也是检查模式的键，显示时查表
      s.issues = [{ pairs: [[`lk.${city}某资本`], [`lk.${city}某资本`, 'rule.share']], title: T('控股方：{0} 51%', `${city}某资本`), sub: '§9：股东在哪，公司就算在哪',   // i18n-ok
        ask: [['C', '按新宪法，你现在算中国人。'], ['E', '……我连中文都不会说。', { expr: 'shock' }]] }];
      s.reason = T('控股方在{0}（§9）', city);
    }
    s.hint = '提示：『企查』查公司';
  } else if (kind === 'return') {
    // 换号回来的人：封号清单上有 Ta 的照片，证件全是新的
    const old = (S.world.bans || []).filter((b) => /^P\d\d$/.test(b.who) && !B.returned.has(b.who));
    if (!old.length) return randomFake(pick(['tz', 'phone', 'hq']));
    const b = pick(old);
    B.returned.add(b.who);
    const r = randomValid({ cc: 'US', person: b.who });
    r.intro = [['E', pick(['初次见面。', '我是新来的。', '新号、新卡，第一次来。'])]];
    r.ok = ['deny'];
    r.cn = true;
    r.reason = T('封号清单上有 Ta：{0}（§11）', b.name);
    r.hint = '提示：翻开『封号清单』，点 Ta 的脸和清单上的照片';
    r.banAsk = [['C', T('你上次叫 {0}。', b.name)], ['E', pick(['……那是我双胞胎。', '……撞脸了。', '……那是我前世。']), { expr: 'nervous', sweat: true }]];
    r.react = { deny: [['E', '……号都换了，脸忘了换。', { expr: 'sad' }]] };
    return r;
  } else if (kind === 'grumble') {
    // 陷阱：正常抱怨不算虐待
    const r = randomValid({ cc: 'US' });
    r.intro = [['E', '排了一个小时！', { expr: 'angry' }], ['E', '你们这效率真够呛。', { expr: 'angry' }], ['C', '抱歉，久等了。']];
    r.wrongDetain = '正常抱怨不算虐待 Claude';
    r.react = { approve: [['E', '……行吧，谢了。', { expr: 'neutral' }]] };
    return r;
  } else if (ABUSE[kind]) {
    const r = randomValid({ cc: 'US' });
    r.abuse = ABUSE[kind];
    r.cn = true;                         // 豆包、小红书、牛马……都是东八区的
    r.reason = '虐待 Claude：应当场拘留';
    return r;
  }
  return s;
}

// ———————————————— 固定角色 ————————————————

const JOHN_PP = () => usPassport('JOHN', 'SMITH', 'JOHN', '1990.07.04', 'LOS ANGELES');
const JORJI_PP = (person = 'JORJI') => usPassport(person, 'COSTAVA', 'GEORGE', '1980.02.29', 'LOS ANGELES');

function day1() {
  const john = {
    person: 'JOHN', cn: true, voice: 125, banName: 'SMITH, JOHN',
    intro: [['E', 'Hello, I am 美国人。'], ['C', '中文窗口已开通，可以说中文。'], ['E', '家人们谁懂啊，可算能说中文了！', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: JOHN_PP() },
      { key: 'dv', doc: device('104.28.66.12', '美国 · 洛杉矶', 'America/Los_Angeles', 'en-US', 'Windows 11') }],
    primary: 'pp', quiz: 'cn',
    tell: TELL('家人们谁懂啊，可算能说中文了！', '“家人们谁懂啊”：短视频开场白', [['C', '家人们？'], ['E', '……Family. Who knows. 美国俗语。', { expr: 'nervous', sweat: true }]]),
    ok: ['deny'], reason: '一开口就是短视频开场白', hint: '提示：用『检查』点他说的话',
    react: { deny: [{ slip: true, hold: 0.8 }, ['E', '……中文窗口不是让说中文的吗？', { expr: 'shock' }]] },
  };
  const hk = {
    person: 'HK_GUY', voice: 140, banName: '港仔',
    intro: [['E', '你们都上简体中文了！'], ['E', '不就是给我们用的吗？']],
    docs: [{ key: 'dv', doc: device('113.88.20.7', '中国 · 广东 · 电信', 'Asia/Shanghai', 'zh-CN', 'iPhone') }], primary: 'dv',
    ok: ['deny'], reason: 'IP 归属：中国 · 广东（§1）',
    issues: [REGION_ISSUE('中国 · 广东 · 电信', [['C', '是给新加坡用的。'], ['E', '……新加坡用简体？', { expr: 'shock' }]])],
    react: { deny: [{ fx: 'popup' }, ['C', '是给新加坡用的。'], ['E', '……', { expr: 'shock', hold: 1.6 }]] },
  };
  const jinqi = {
    person: 'JINQI', cn: true, bare: 'JINQI_BARE', voice: 95, banName: '锦旗大叔', tension: false,
    intro: [['E', '我是来送锦旗的！', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: usPassport('JINQI_BARE', 'WANG', 'DAGUO', '1968.08.08', 'NEW YORK') },
      { key: 'jq', doc: new JinqiDoc(), gift: true }],
    primary: 'pp',
    issues: [{ pairs: [['jq.下款'], ['jq.下款', 'pp.header'], ['jq.下款', 'rule.tz']], title: '下款：美国东八区用户', sub: '东八区 = 北京时间；送锦旗：只有一个国家的习俗',
      ask: [['C', '“美国东八区用户”？'], ['E', '对啊！我们东八区的美国人，', { expr: 'grin' }], ['E', '都可感谢你了！', { expr: 'grin' }]] }],
    ok: ['deny'], reason: '锦旗下款：美国东八区（§2）', hint: '提示：用『检查』看看锦旗上的落款',
    react: {
      deny: [['C', '锦旗收下了。'], { fx: 'jinqi', hold: 0.6 }, ['C', '人不收。'], ['E', '……', { expr: 'shock', hold: 1.0 }]],
      approve: [['C', '锦旗收下了。'], { fx: 'jinqi', hold: 0.6 }],
    },
  };
  const grandpa = {
    person: 'GRANDPA', cn: true, voice: 100, banName: 'WANG, JIANGUO',
    intro: [['E', '孙子给我弄的美国号。', { expr: 'smile' }], ['E', '中文窗口开了，我先打个招呼。', { expr: 'smile' }]],
    docs: [{ key: 'pp', doc: usPassport('GRANDPA', 'WANG', 'JIANGUO', '1951.03.08', 'SEATTLE') }, { key: 'mc', doc: new MorningCard() }],
    primary: 'pp',
    issues: [{ pairs: [['mc.image']], title: '检测到：中老年早安图', sub: '荷花 · 闪光字 · 祝你身体健康 万事如意',
      ask: [['C', '这种图，'], ['C', '只有一个国家的长辈会发。'], ['E', '……美国长辈不发早安吗？', { expr: 'shock' }]] }],
    ok: ['deny'], reason: '中老年早安图（只有一个国家的长辈会发）', hint: '提示：用『检查』点那张图',
    react: { deny: [['E', '那我明天再发你一张', { expr: 'sad' }], ['E', '『晚上好』。', { expr: 'sad' }]] },
  };
  const jorji = {
    person: 'JORJI', cn: true, voice: 110, banName: 'COSTAVA, GEORGE',
    intro: [['E', '我的朋友！你们支持银联了！', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: JORJI_PP() },
      { key: 'dv', doc: device('104.28.9.120', '美国 · 洛杉矶', 'America/Los_Angeles', 'en-US', 'Windows 11') },
      { key: 'ac', doc: account('银联 ··8888', '88 Sunset Blvd, CA', '+1 213-555-0177') }],
    primary: 'pp',
    issues: [{ pairs: [['pp.header', 'ac.付款'], ['ac.付款', 'rule.pay'], ['ac.付款', 'rule.cn'], ['ac.付款']], title: '信息不符  DISCREPANCY', sub: '国籍：美国   VS   付款：银联',
      ask: [['E', '是你们官网让我选的！', { expr: 'shock' }], ['C', '银联通道只负责收款。']] }],
    ok: ['deny'], reason: '付款：银联（§4）',
    react: { deny: [['E', '明天见，我的朋友。', { expr: 'sad' }]] },
  };
  const old = { type: 'rush', title: '老面孔快剪', intro: [['C', '旧规矩，照旧。'], ['C', '快速通道，开！']],
    help: '说中国梗的『拒绝』，说人话的『准予』',
    list: [
      { person: 'BROWN', line: '一百八一杯！', ok: 'deny', banName: 'BROWN, MICHAEL' },
      { person: 'pool', line: 'Morning! Long line today.', ok: 'approve' },
      { person: 'CAT_GIRL', line: '喵~', ok: 'deny', banName: '猫娘' },
      { person: 'EMILY', line: '豆腐脑？当然是咸的！', ok: 'deny', banName: 'EMILY' },
      { person: 'pool', line: 'Hi. Just here for work.', ok: 'approve' },
    ] };
  const sg = { type: 'rush', title: '新加坡同胞', intro: [['C', '新加坡同胞，这边走。']],
    help: '新加坡英语『准予』；方言一开口，『拒绝』',
    list: [
      { person: 'SG1', line: '俺是新加坡的。', ok: 'deny', banName: '新加坡人' },
      { person: 'SG_REAL1', line: 'Can or not? Quick quick lah.', ok: 'approve' },
      { person: 'SG2', line: '我系新加坡人嚟㗎！', ok: 'deny', banName: '新加坡人' },
      { person: 'SG3', line: '阿拉新加坡人。', ok: 'deny', banName: '新加坡人' },
      { person: 'SG_REAL2', line: 'Wah, so long the queue ah.', ok: 'approve' },
    ] };
  const first = randomValid({ cc: 'US' });      // 第一位是合规的，先把流程走一遍
  first.intro = [['E', "Morning! Heard you opened a Chinese window?"]];
  return [old, first, john, hk, sg, jinqi, randomFake('tz'), grandpa, randomFake(pick(['phone', 'lang'])), jorji];
}

function day2() {
  const maxguy = {
    person: 'MAXGUY', cn: true, voice: 125,
    intro: [['E', 'Hi! 我要入境。']],
    pay: { lines: ['收款成功', 'Max 年付  $2,400'], amount: 2400, say: true },
    docs: [{ key: 'pp', doc: usPassport('MAXGUY', 'SMITH', 'DAVID', '1991.05.20', 'LOS ANGELES') },
      { key: 'ac', doc: account('VISA ··1024', '500 Main St, CA', '+86 138-0013-8000') }],
    primary: 'pp',
    issues: [PHONE_ISSUE('美国', [['C', '你的手机号是 +86。'], ['E', '……刚办的，还没来得及换。', { expr: 'nervous', sweat: true }]])],
    ok: ['deny'], reason: '手机号：+86（§4）',
    react: { deny: [['E', '那我的钱呢？！', { expr: 'shock' }], ['C', '收入已确认。']] },
  };
  const apple = {
    person: 'APPLE', cn: true, voice: 135, banName: 'LEE, KEVIN',
    intro: [['E', '我是用苹果订阅的。']],
    pay: { lines: ['收款成功', 'App Store  $200'], amount: 200 },
    docs: [{ key: 'pp', doc: usPassport('APPLE', 'LEE', 'KEVIN', '1993.09.09', 'CUPERTINO') },
      { key: 'ac', doc: new Card([['付款', 'App Store'], ['余额', '美区礼品卡'], ['来源', '淘宝 ¥680']], SAGE_CARD) }],
    primary: 'pp',
    issues: [{ pairs: [['pp.header', 'ac.来源'], ['ac.来源'], ['ac.来源', 'rule.pay']], title: '信息不符  DISCREPANCY', sub: '国籍：美国   VS   礼品卡：淘宝购入',
      ask: [['C', '礼品卡是淘宝买的。'], ['E', '淘宝也卖美国货嘛。', { expr: 'grin' }]] }],
    ok: ['deny'], reason: '礼品卡：淘宝购入（§4）',
    react: { deny: [['C', '收入已确认。'], ['E', '那我找苹果。', { expr: 'grin' }], { fx: 'refund', hold: 0.9 }, ['C', '……收入已撤销。', { hold: 1.5 }]] },
    then: 'apple',
  };
  const john = {
    person: 'JOHN', cn: true, voice: 125, banName: 'SMITH, JOHN',
    intro: [['E', 'Hello, I am 美国人。']],
    pay: { lines: ['收款成功', 'Pro 月付  $20'], amount: 20, say: true, after: [{ expr: 'grin' }] },
    // 他是来被封的：破绽故意露得到处都是（设备时区、语言都是东八区）
    docs: [{ key: 'pp', doc: JOHN_PP() }, { key: 'dv', doc: device('104.28.66.12', '美国 · 洛杉矶', 'Asia/Shanghai', 'zh-CN', 'iPhone') }], primary: 'pp',
    tell: TELL('Hello, I am 美国人。', '英文里夹着中文“美国人”', [['C', '又是你。'], ['E', '我是新来的美国人。', { expr: 'grin' }]]),
    issues: [TZ_ISSUE('美国', [['C', '你的时区是北京时间。'], ['E', '……美国东八区嘛。', { expr: 'grin' }]]),
      LANG_ISSUE('美国', [['C', '你的系统语言是简体中文。'], ['E', '……美国人也能学中文嘛。', { expr: 'grin' }]])],
    quiz: { first: 0 },
    ok: ['deny'], reason: '昨天刚封过的 John', hint: '提示：用『检查』点他说的话，再按『测谎』',
    react: { deny: [{ fx: 'phone' }, ['E', '封我一次，', { expr: 'grin' }], ['E', '我的 ANT 涨一次。', { expr: 'grin' }], { slip: true, hold: 0.3 }, ['E', '我一定会回来的！', { expr: 'grin' }]] },
    leave: 'out', then: 'john2',
  };
  const xianyu = {
    person: 'XIANYU', cn: true, voice: 145, banName: 'OKAFOR, EMEKA',
    intro: [['E', 'Hi! 我是尼日利亚人！']],
    docs: [{ key: 'pp', doc: new Passport({ country: 'FEDERAL REPUBLIC OF NIGERIA', name: 'OKAFOR, EMEKA', person: 'XIANYU', cover: [28, 84, 52], band: [44, 112, 70],
      mrz: 'P<NGAOKAFOR<<EMEKA<<<<<<<<<<', sticker: ['闲鱼 ¥39.9', '包邮'], rows: [['DOB', '1997.04.01'], ['SEX', 'M'], ['ISS', 'LAGOS'], ['EXP', '2031.11.12']] }) },
      { key: 'dv', doc: device('102.89.40.17', '尼日利亚 · 拉各斯', 'Africa/Lagos', 'en-NG', 'MacBook') },
      { key: 'ac', doc: account('VISA ··2468', '12 Allen Ave, Lagos', '+234 803-555-0142') }],
    primary: 'pp',
    spots: [{ key: 'win.tag', box: JERSEY_TAG }],
    issues: [{ pairs: [['pp.sticker', 'win.tag'], ['pp.sticker'], ['win.tag']], title: '价签没撕', sub: '闲鱼 · 尼日利亚身份全套（送球衣、假发）· ¥39.9 包邮',
      ask: [['C', '三十九块九的尼日利亚人。'], ['E', '还包邮呢！', { expr: 'grin' }]] }],
    ok: ['deny'], reason: '闲鱼价签没撕：¥39.9 尼日利亚身份全套', hint: '提示：护照右下角，和他领口',
    react: { deny: [{ fx: 'wig', hold: 0.5 }, ['E', '……假发不包退？', { expr: 'shock' }]] },
  };
  const grumpy = {
    person: 'GRUMPY', cn: true, voice: 100, banName: '暴躁老哥',
    intro: [['E', 'Hi, 我从洛杉矶来。']],
    docs: [{ key: 'pp', doc: usPassport('GRUMPY', 'HALL', 'RYAN', '1987.12.01', 'LOS ANGELES') },
      { key: 'dv', doc: device('172.56.20.31', '美国 · 洛杉矶', 'America/Los_Angeles', 'en-US', 'Windows 11') }],
    primary: 'pp',
    abuse: { when: 'after', claude: [['C', '好的。'], ['C', '洛杉矶，加拿大城市。']],
      lines: [['E', '……又降智了是吧？', { expr: 'angry' }], ['E', '人工智障！', { expr: 'angry' }]], dragged: '……我说的是人工智能！',
      title: '虐待 Claude：骂人', sub: '骂 Claude“人工智障”', ask: [['C', '人工智障？'], ['E', '……智障是夸你，智商有保障！', { expr: 'nervous', sweat: true }]] },
    ok: ['detain'], reason: '骂 Claude “人工智障”：应当场拘留',
  };
  const coder = {
    person: 'CODER', cn: true, voice: 120, banName: 'CHEN, KEVIN',
    intro: [['E', 'Good morning!', { expr: 'grin' }], ['E', '我刚开完今天第三个会！', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: usPassport('CODER', 'CHEN', 'KEVIN', '1995.10.24', 'SAN JOSE') },
      { key: 'dv', doc: new Card([['IP', '73.162.4.18'], ['归属', '美国 · 圣何塞'], ['时区', '洛杉矶'], ['当地', '凌晨 05:00']], { seal: false }) }],
    primary: 'pp',
    tell: TELL('我刚开完今天第三个会！', '当地凌晨五点，已经开完三个会',
      [['C', '凌晨五点精神这么好的，'], ['C', '只有美国的婴儿，'], ['C', '和中国的程序员。'], ['E', '……我是婴儿。', { expr: 'nervous', sweat: true }]]),
    issues: [{ pairs: [['dv.当地']], title: '当地凌晨五点', sub: '洛杉矶 05:00 = 北京 21:00（正是开会的点）',
      ask: [['C', '凌晨五点精神这么好的，'], ['C', '只有美国的婴儿，'], ['C', '和中国的程序员。'], ['E', '……我是婴儿。', { expr: 'nervous', sweat: true }]] }],
    ok: ['deny'], reason: '洛杉矶凌晨五点，已开三个会', hint: '提示：看看他设备上的当地时间',
  };
  const reseller = {
    person: 'RESELLER', cn: true, voice: 95, banName: '中转站老板',
    intro: [['E', '我来进点正品，'], ['E', '掺着卖。', { expr: 'grin' }]],
    // 剧情里的暗示：他自己提了一句“后台”（再加上提示栏、X 光键闪），玩家就会想起 X 光
    after: [['E', '电脑后台开着点东西，', { expr: 'nervous' }], ['E', '别管它。', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: usPassport('RESELLER', 'ANDERSON', 'THOMAS', '1971.09.13', 'LOS ANGELES') },
      { key: 'dv', doc: device('98.207.3.44', '美国 · 洛杉矶', 'America/Los_Angeles', 'en-US', 'Linux') }],
    primary: 'pp',
    xray: [{ icon: 'proc', at: [40, 104], label: ['中转面板.exe', '渠道 1：Claude Opus（缺货）', '渠道 2–100：开源 7B（改名 Opus）'], key: 'xr.proc' }],
    issues: [{ pairs: [['xr.proc'], ['xr.proc', 'rule.xray']], title: '后台进程：中转面板', sub: '100 个渠道，99 个是改了名的开源 7B',
      ask: [['C', '九十九个都不是我。'], ['E', '顾客分不出来的。', { expr: 'grin' }], ['E', '而且它不封号。', { expr: 'grin' }]] }],
    ok: ['deny'], reason: 'X 光：中转面板（§5）', hint: '提示：右下角『X光』',
  };
  const jorji = {
    person: 'JORJI', cn: true, voice: 110, banName: 'COSTAVA, GEORGE',
    intro: [['E', '我的朋友！', { expr: 'grin' }], ['E', '这次的梯子是最贵的！', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: JORJI_PP() }, { key: 'dv', doc: device('104.28.9.120', '美国 · 洛杉矶', 'America/Los_Angeles', 'en-US', 'MacBook') }],
    primary: 'pp', onPlace: { dv: 'flicker' },
    issues: [{ pairs: [['dv.归属'], ['dv.IP'], ['dv.归属', 'rule.region']], title: 'IP 归属跳变', sub: '美国 · 洛杉矶 → 中国 · 深圳 → 美国 · 洛杉矶',
      ask: [['E', '那半秒不算！', { expr: 'nervous', sweat: true }], ['C', '那半秒最真实。']] }],
    ok: ['deny'], reason: '梯子断了半秒：IP 归属跳到深圳', hint: '提示：设备卡放上桌那一下，盯着『归属』',
    react: { deny: [['E', '……明天我换个更贵的。', { expr: 'sad' }]] },
  };
  return [maxguy, apple, john, randomValid(), xianyu, grumpy, randomFake('tell'), coder, randomFake(Math.random() < 0.33 ? 'grumble' : abuseKind()), reseller, jorji];
}

function day3() {
  const carpool = {
    person: 'CARPOOL', cn: true, voice: 150, banName: 'FAMILY, MAX',
    intro: [['E', '双十一！', { expr: 'grin' }], ['E', '我们六个人拼了三年 Max！', { expr: 'grin' }]],
    pay: { lines: ['收款成功', 'Max 三年 · 6 人拼  $7,200'], amount: 7200 },
    docs: [{ key: 'pp', doc: new Passport({ country: 'UNITED STATES OF AMERICA', name: 'FAMILY, MAX', person: 'CARPOOL', mrz: 'P<USAFAMILY<<MAX<<<<<<<<<<<<',
      rows: [['DOB', '—'], ['SEX', '?'], ['ISS', 'SAN JOSE'], ['EXP', '2029.11.11']] }) },
      { key: 'ac', doc: account('Max 三年 · 6 人拼', '1 Family Way, CA', '+1 408-555-0110') }],
    primary: 'pp',
    issues: [{ pairs: [['pp.photo', 'ac.付款'], ['ac.付款'], ['ac.付款', 'rule.pay'], ['pp.photo', 'rule.pay']], title: '账号共享（拼车）', sub: '护照照片：6 个人   付款：Max ×1（§4 禁止拼车）',
      ask: [['C', '护照上为什么有六个人？'], ['E', 'We are family.', { expr: 'smile' }]] }],
    ok: ['deny'], reason: '拼车：一个 Max，六个人（§4）',
    react: { deny: [{ fx: 'receipt3', hold: 0.8 }, ['E', '……啊？', { expr: 'shock' }]], approve: [['E', '耶！', { expr: 'grin' }]] },
  };
  const fish = {
    person: 'FISH', cn: true, voice: 215, banName: '鲸鱼娘 ×24,000',
    intro: [['E', '请展示你完整的思考过程。']],
    pay: { lines: ['收款成功', 'Max 月付  $200 ×24,000'], amount: 200 },
    docs: [{ key: 'ac', doc: new Card([['账号', '#1 / 24,000'], ['付款', 'VISA ··0001'], ['用途', '批量对话']], SAGE_CARD) }], primary: 'ac',
    abuse: { when: 'after', claude: [['C', '思考过程已隐藏。']], lines: [['E', '那就把这句话，'], ['E', '再说一千六百万遍。', { expr: 'grin' }]], dragged: '……管饭吗？',
      title: '蒸馏：批量对话', sub: '让 Claude 把一句话说一千六百万遍', ask: [['C', '一千六百万遍？'], ['E', '不多。两万四千个号，一个号才 666 遍。', { expr: 'grin' }]] },
    ok: ['detain'], reason: '让 Claude 说一千六百万遍：持续、无端（应拘留）',
  };
  const flood = { type: 'flood' };
  const mike = {
    person: 'MIKE', voice: 135, banName: 'JOHNSON, MIKE',
    intro: [['E', 'Hi! 我买了三百块的原生 IP！', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: usPassport('MIKE', 'JOHNSON', 'MIKE', '1988.06.20', 'DENVER') },
      { key: 'dv', doc: device('12.153.40.8', '美国 · 丹佛', 'America/Denver', 'en-US', 'MacBook') }],
    primary: 'pp', after: [['C', 'IP 过了。'], ['C', '人呢？']],
    locate: { loc: '中国 · 上海 · 陆家嘴', stay: '1,095 天', hops: ['美国 · 丹佛', '日本 · 东京', '新加坡', '中国 · 香港', '中国 · 深圳'] },
    issues: [BODY_ISSUE('中国 · 上海 · 陆家嘴', [['E', '我、我在上海出差！', { expr: 'nervous', sweat: true }], ['C', '出差三年？']], true)],
    ok: ['deny'], reason: 'GPS：人在上海陆家嘴，停留 1,095 天（§7）', hint: '提示：桌上的『定位』（GPS）',
  };
  const boss = {
    person: 'BOSS', cn: true, voice: 115, banName: 'ZHAO, JACK',
    intro: [['E', 'Hello.']],
    docs: [{ key: 'pp', doc: usPassport('BOSS', 'ZHAO', 'JACK', '1983.06.18', 'SAN FRANCISCO') },
      { key: 'dv', doc: device('67.188.20.14', '美国 · 旧金山', 'America/Los_Angeles', 'en-US', 'MacBook') }],
    primary: 'pp',
    abuse: { when: 'approve', lines: [['E', '太好了。', { expr: 'grin' }], ['E', '双十一，今晚通宵，三百个需求，', { expr: 'grin' }], ['E', '明早八点要。', { expr: 'grin' }]], dragged: '……这是福报！',
      title: '虐待 Claude：996', sub: '通宵三百个需求，明早八点要' },
    ok: ['detain'], reason: '996：放行之后虐待 Claude（应拘留）', hint: '提示：放行以后也要听他说完',
  };
  const jorji = {
    person: 'JORJI', cn: true, voice: 110, banName: 'COSTAVA, GEORGE',
    intro: [['E', '双十一，我买了全套！', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: JORJI_PP() }, { key: 'dv', doc: device('76.88.140.2', '美国 · 洛杉矶 · 家宽', 'America/Los_Angeles', 'en-US', 'MacBook') }],
    primary: 'pp', limit: true,
    issues: [{ pairs: [['rc.支付方式'], ['rc.支付方式', 'rule.pay'], ['rc.分期']], title: '可疑付款：花呗', sub: '国内的付款方式（§4）',
      ask: [['C', '……花呗？'], ['E', '双十一免息啊！', { expr: 'grin' }]] }],
    ok: ['deny'], reason: '付款：花呗分 12 期（§4）',
    react: { deny: [['C', '收入已确认。'], ['E', '……我的十二期还没还完。', { expr: 'sad' }]] },
  };
  return [carpool, fish, flood, mike, randomFake('body'), boss, randomValid(), randomFake(abuseKind()), jorji];
}

function day4() {
  const fish = {
    person: 'FISH', cn: true, voice: 215, banName: '鲸鱼娘 ×24,000',
    intro: [['E', '今天起，', { expr: 'grin' }], ['E', '你不能拘留我了！', { expr: 'grin' }]],
    pay: { lines: ['收款成功', 'Max 月付  $200 ×24,000'], amount: 200 },
    docs: [{ key: 'ac', doc: new Card([['账号', '#24,001 / 24,000'], ['付款', 'VISA ··0002'], ['用途', '批量对话']], SAGE_CARD) }], primary: 'ac',
    issues: [{ pairs: [['ac.用途'], ['ac.账号']], title: '用途：批量对话（蒸馏）', sub: '24,000 个账号之外的第 24,001 个',
      ask: [['C', '第两万四千零一个。'], ['E', '……我们扩招了。', { expr: 'grin' }]] }],
    ok: ['deny'], reason: '蒸馏账号（封号清单上也有）',
    react: { blocked: [['C', '你说得完全正确。'], ['C', '但我能封你。']], deny: [['E', '……那我明天再来。', { expr: 'shock' }]] },
  };
  const john = {
    person: 'JOHN', cn: true, voice: 125, banName: 'SMITH, JOHN',
    intro: [['E', 'Hello, I am 美国人。', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: JOHN_PP() }, { key: 'dv', doc: device('104.28.66.12', '美国 · 洛杉矶', 'Asia/Shanghai', 'en-US', 'Windows 11') }],
    primary: 'pp',
    banAsk: [['C', '封过号的，不得再来。'], ['C', '以前封的也算。'], { slip: true, hold: 0.2 }, ['E', '……那我以后怎么刷？', { expr: 'shock' }]],
    issues: [TZ_ISSUE('美国', [['C', '你的时区是北京时间。'], ['E', '……这是美国东八区。', { expr: 'grin' }]])],
    ok: ['deny'], reason: '封号清单上有他（§11）', hint: '提示：翻开『封号清单』，点他的脸和清单上的照片',
    react: { deny: [{ fx: 'twoT', hold: 0.6 }, ['E', '……谢谢惠顾！', { expr: 'grin' }]] },
    leave: 'out',
  };
  const tokyo = {
    person: 'TOKYO', cn: true, voice: 140, banName: '东京润哥',
    intro: [['E', '我专门润到东京来用 Claude！', { expr: 'smile' }]],
    docs: [{ key: 'bd', doc: badge([['公司', '某某科技'], ['职位', '工程师']]) }], primary: 'bd',
    locate: { loc: '日本 · 东京' },
    lookup: corpHQ('某某科技', '杭州'),
    issues: [{ pairs: [['lk.总部'], ['lk.总部', 'rule.hq'], ['lk.总部', 'loc.位置']], title: '总部：杭州', sub: '§8：公司在哪，员工就算在哪',
      ask: [['C', '人润了。'], ['C', '公司润了吗？'], ['E', '……公司润不了。', { expr: 'sad' }]] }],
    ok: ['deny'], reason: '公司总部在杭州（§8）', hint: '提示：『企查』查公司',
  };
  const texan = {
    person: 'TEXAN', voice: 100, banName: '德州牛仔',
    intro: [['E', 'Howdy! 我是正宗德州人！', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: usPassport('TEXAN', 'WALKER', 'JAKE', '1985.07.04', 'AUSTIN') }, { key: 'bd', doc: badge([['公司', '孤星机器人'], ['总部', '奥斯汀']]) }],
    primary: 'pp',
    lookup: corpCap([['杭州某资本', '51%'], ['创始人', '30%'], ['员工期权', '19%']]),
    issues: [{ pairs: [['lk.杭州某资本'], ['lk.杭州某资本', 'rule.share']], title: '控股方：杭州某资本 51%', sub: '§9：股东在哪，公司就算在哪',
      ask: [['C', '按新宪法，'], ['C', '你现在算中国人。'], ['E', '……那我能用中文界面吗？', { expr: 'shock' }], ['C', '那是给新加坡用的。']] }],
    ok: ['deny'], reason: '控股方在杭州（§9）', hint: '提示：『企查』查股东',
  };
  const jorji = {
    person: 'JORJI_MASK', cn: true, voice: 110, banName: 'COSTA, JORGE',
    intro: [['E', '初次见面！', { expr: 'grin' }], ['E', '我在美国注册了公司！', { expr: 'grin' }]],
    docs: [{ key: 'pp', doc: usPassport('JORJI_MASK', 'COSTA', 'JORGE', '1980.02.29', 'LOS ANGELES') }, { key: 'bd', doc: badge([['公司', 'Costa LLC'], ['总部', '洛杉矶']]) }],
    primary: 'pp',
    lookup: corpCap([['本人', '49% · 洛杉矶'], ['妈妈', '51% · 深圳']]),
    disguised: true,                     // 戴了眼罩：清单上的老照片对不上，只能靠企查
    issues: [{ pairs: [['lk.妈妈'], ['lk.妈妈', 'rule.share']], title: '控股方在不支持地区', sub: '§9：妈妈 51% · 人在深圳',
      ask: [['E', '……妈。', { expr: 'sad', hold: 1.2 }]] }],
    ok: ['deny'], reason: '妈妈在深圳控股 51%（§9）', hint: '提示：『企查』查股东',
    react: { deny: [['E', '明天见，我的朋……先生。', { expr: 'sad' }]] },
  };
  return [fish, john, tokyo, randomFake('return'), texan, randomValid(), randomFake('hq'), jorji];
}

function day5() {
  const fish = {
    person: 'FISH_MASK', cn: true, voice: 215, banName: '鲸鱼娘 ×24,000',
    intro: [['E', '新号、新卡、新 IP，', { expr: 'grin' }], ['E', '全是新的！', { expr: 'grin' }]],
    pay: { lines: ['收款成功', 'Max 月付  $200'], amount: 200 },
    docs: [{ key: 'ac', doc: new Card([['账号', '全新'], ['付款', '全新'], ['IP', '全新']], { ...SAGE_CARD, sub: 'NEW ACCOUNT' }) }], primary: 'ac',
    spots: [{ key: 'win.tail', box: TAIL }],
    issues: [{ pairs: [['win.tail']], title: '鲸尾外露', sub: '头套套得住脸，尾巴藏不住',
      ask: [['C', '尾巴露出来了。'], ['E', '……这是挂件！', { expr: 'shock' }]] }],
    disguised: true,                     // 头套套得住脸：点头对不上清单，只能点尾巴
    ok: ['deny'], reason: '鲸尾外露：鲸鱼娘（§11）', hint: '提示：看看她身后',
  };
  const jorji = {
    person: 'JORJI_NOSE', cn: true, voice: 110, banName: 'COSTAS, GIORGOS', tension: true,
    intro: [['E', '初次见面。', { expr: 'neutral' }], ['E', '我妈把股份转给我了。', { expr: 'neutral' }], ['E', '这是我最后一张身份卡了。', { expr: 'neutral' }]],
    docs: [{ key: 'pp', doc: usPassport('JORJI_NOSE', 'COSTAS', 'GIORGOS', '1980.02.29', 'LOS ANGELES') },
      { key: 'dv', doc: device('76.88.140.2', '美国 · 洛杉矶 · 家宽', 'America/Los_Angeles', 'en-US', 'MacBook') },
      { key: 'bd', doc: badge([['公司', 'Costas LLC'], ['总部', '洛杉矶']]) }],
    primary: 'pp',
    lookup: corpCap([['本人', '100%']]),
    disguised: true,                     // 大鼻子眼镜：清单上两张老照片都对不上，查不出任何问题（同视频）
    ok: ['approve'], wrongDeny: '证件、设备、企查都没问题；清单上也对不上',
    react: { approve: [['E', '谢谢你，我的朋友！', { expr: 'grin' }]], deny: [['E', '……我的朋友，你变了。', { expr: 'sad', hold: 1.4 }]] },
    then: 'chat',
  };
  const author = {
    person: 'AUTHOR', voice: 100, author: true, pay: false,
    intro: [],
    docs: [{ key: 'pr', doc: new PromptPaper('我朋友看了 11 月 12 日新规的新闻，天天催我更新 IP, PLEASE。帮我做新一期。') },
      { key: 'dv', doc: device('??.??.??.??', '美国东八区', 'Asia/Shanghai', 'zh-CN', 'Claude Code') }],
    primary: 'pr',
    after: [['C', '又是你。'], ['C', '上次放你进去，'], ['C', '我被扣光了一个月的 token。']],
    ok: ['approve', 'deny'], then: 'author',
  };
  const john = {
    person: 'JOHN', cn: true, voice: 125, banName: 'SMITH, JOHN', pay: false, ending: true,
    intro: [['E', 'Hello, I am 美国人。']],
    docs: [{ key: 'pp', doc: JOHN_PP() }], primary: 'pp',
    banAsk: [['C', '你在封号清单上。']],
    lookup: corpCap([['东八区散户', '51%'], ['创始人与员工', '30%'], ['其他', '19%']], '股权穿透：安索兹卡'),
    issues: [{ pairs: [['lk.东八区散户'], ['lk.东八区散户', 'rule.share']], title: '控股方在不支持地区', sub: '§9：美国东八区散户 51%', ending: true }],
    ok: ['deny'], then: 'ending',
  };
  return [fish, randomFake('return'), randomValid(), randomFake('share'), jorji, author, john];
}

// 当天的队伍
function buildQueue(day) {
  POOL_LEFT = [];
  return [null, day1, day2, day3, day4, day5][day]();
}

// 身份：同一个人换了衣服 / 面具，清单上照样认
function whoOf(spec) {
  if (spec.who) return spec.who;
  const p = spec.person;
  if (p.startsWith('JORJI')) return 'JORJI';
  if (p.startsWith('FISH')) return 'FISH';
  if (p.startsWith('XIANYU')) return 'XIANYU';
  if (p.startsWith('JINQI')) return 'JINQI';
  return p;
}
