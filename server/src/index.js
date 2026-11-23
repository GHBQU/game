/* 游戏厅 · 统一账号与进度服务
 * ---------------------------------------------------------------------------
 * 一个 Worker + 一个 Durable Object 管全部东西：
 *   1. 账号      注册 / 登录 / 令牌 / 邀请码 —— 唯一真实来源是这里，不是浏览器
 *   2. 进度      按「账号 + 游戏」存一份存档，任何游戏共用同一个账号
 *
 * 为什么是 Durable Object：所有账号写操作汇到同一个实例，天然串行，
 * 不会出现两台设备同时写同一个账号导致互相覆盖。存储用 DO SQLite，强一致。
 *
 * 密码只存 PBKDF2-SHA256 摘要，不存明文，也不存可复用的口令哈希。
 * 旧版浏览器端账号（sha256(salt|pw|arcade-v1)）通过 /api/migrate 导入，
 * 下一次登录成功时自动升级成 PBKDF2 —— 老用户不用重设密码。
 *
 * 接口一览（全部 JSON，CORS *）：
 *   GET  /api/health
 *   POST /api/register          {name, password, invite}
 *   POST /api/login             {name, password}
 *   GET  /api/me                ?token=
 *   POST /api/invite            {token, invite}
 *   POST /api/logout            {token}
 *   POST /api/password          {token, oldPassword, newPassword}
 *   POST /api/migrate           {accounts:[{name, salt, hash, invited, created}]}
 *   GET  /api/progress          ?token=&game=
 *   POST /api/progress          {token, game, data}
 *   GET  /api/progress/list     ?token=
 *   GET  /api/progress/all      ?token=
 *   POST /api/progress/delete   {token, game}
 *   POST /api/progress/bulk     {token, items:{game:data}}
 * ------------------------------------------------------------------------- */

const VERSION = 'arcade-unified-v1';
const TOKEN_TTL = 30 * 24 * 3600 * 1000;   // 令牌 30 天
const MAX_ACCOUNTS = 300;
const MAX_GAMES = 80;
const MAX_BODY = 512 * 1024;
const MAX_SAVE = 256 * 1024;               // 单个游戏存档上限
const PBKDF2_ITER = 12000;
const INVITE_DIGESTS = [
  '1248225cb05b01163d46216ba6eb7b739feb52de74859fbfaf2a80e8309042c8',
];
const GAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: HEADERS });
}

const enc = new TextEncoder();

function hex(buf) {
  return Array.prototype.map
    .call(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a);
}

async function sha256Hex(str) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(str)));
}

async function pbkdf2Hex(password, saltHex, iter) {
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    key,
    256,
  );
  return hex(bits);
}

function normalizeInvite(value) {
  return String(value == null ? '' : value).replace(/\s+/g, '');
}

async function inviteOk(value) {
  const digest = await sha256Hex('arcade-invite-v1|' + normalizeInvite(value));
  return INVITE_DIGESTS.indexOf(digest) >= 0;
}

function cleanName(raw) {
  const name = String(raw == null ? '' : raw).trim();
  if (!name || name.length > 20) return '';
  for (const ch of name) if (/[\s\u0000-\u001f\u007f]/.test(ch)) return '';
  return name;
}

function cleanGame(raw) {
  const g = String(raw == null ? '' : raw).trim();
  return GAME_RE.test(g) ? g.toLowerCase() : '';
}

function validSalt(s) {
  return typeof s === 'string' && /^[0-9a-f]{8,64}$/i.test(s);
}

function validHash(s) {
  return typeof s === 'string' && /^[0-9a-f]{16,128}$/i.test(s);
}

function fail(code, msg) {
  return { ok: false, code, msg };
}

/* ------------------------------------------------------------------ 入口 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      const id = env.ARCADE.idFromName('arcade-global');
      return env.ARCADE.get(id).fetch(request);
    }
    if (url.pathname === '/') {
      return new Response('arcade unified account server\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return json({ ok: false, msg: 'not found' }, 404);
  },
};

/* ---------------------------------------------------------- Durable Object */
export class ArcadeServer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  /* ---------------- 底层 ---------------- */
  async get(key) {
    try {
      return await this.state.storage.get(key);
    } catch (e) {
      return null;
    }
  }

  async put(key, val) {
    await this.state.storage.put(key, val);
  }

  async del(key) {
    await this.state.storage.delete(key);
  }

  async readJson(request) {
    let text;
    try {
      text = await request.text();
    } catch (e) {
      return null;
    }
    if (!text || text.length > MAX_BODY) return null;
    try {
      const v = JSON.parse(text);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  tokenOf(request, url) {
    const q = url.searchParams.get('token');
    if (q) return String(q);
    const auth = request.headers.get('Authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    return m ? m[1].trim() : '';
  }

  async accountByToken(token) {
    if (!token || token.length > 128) return null;
    const rec = await this.get('tok:' + token);
    if (!rec) return null;
    if (rec.exp < Date.now()) {
      await this.del('tok:' + token);
      return null;
    }
    const acc = await this.get('acc:' + rec.key);
    if (!acc) return null;
    return { key: rec.key, acc };
  }

  async issueToken(key) {
    const now = Date.now();
    // 先清掉过期令牌和这个账号的旧令牌，避免无限增长（也顺手实现「单账号单令牌」）
    const all = await this.state.storage.list({ prefix: 'tok:' });
    const dead = [];
    for (const [k, v] of all) {
      if (!v) continue;
      if (v.exp < now || v.key === key) dead.push(k);
    }
    for (const k of dead) await this.state.storage.delete(k);

    const token = randomHex(24);
    await this.put('tok:' + token, { key, exp: now + TOKEN_TTL, at: now });
    return token;
  }

  async countAccounts() {
    const all = await this.state.storage.list({ prefix: 'acc:' });
    return all.size;
  }

  /* ---------------- 账号 ---------------- */
  async register(body) {
    const name = cleanName(body.name);
    const password = String(body.password == null ? '' : body.password);
    if (!name) return fail('name', '账号名不能为空，且不能有空格');
    if (password.length < 4) return fail('pw', '密码至少 4 位');
    if (password.length > 64) return fail('pw', '密码最多 64 位');

    const key = name.toLowerCase();
    if (await this.get('acc:' + key)) return fail('dup', '这个账号名已经被注册了');
    if ((await this.countAccounts()) >= MAX_ACCOUNTS) return fail('full', '账号数量已达上限');

    const invited = await inviteOk(body.invite);
    const salt = randomHex(16);
    const hash = await pbkdf2Hex(password, salt, PBKDF2_ITER);
    const now = Date.now();
    await this.put('acc:' + key, {
      name,
      algo: 'pbkdf2',
      salt,
      hash,
      iter: PBKDF2_ITER,
      invited,
      created: now,
      updated: now,
    });
    const token = await this.issueToken(key);
    return {
      ok: true,
      code: invited ? 'ok' : 'need-invite',
      token,
      name,
      invited,
      msg: invited ? '注册成功' : '注册成功，但还需要邀请码才能开始游戏',
    };
  }

  async login(body) {
    const name = cleanName(body.name);
    const password = String(body.password == null ? '' : body.password);
    if (!name) return fail('name', '账号名不能为空');
    const key = name.toLowerCase();
    const acc = await this.get('acc:' + key);
    if (!acc) return fail('nouser', '没有这个账号');

    let good = false;
    if (acc.algo === 'pbkdf2') {
      const hash = await pbkdf2Hex(password, acc.salt, acc.iter || PBKDF2_ITER);
      good = hash === acc.hash;
    } else {
      // 旧版浏览器账号：sha256(salt|pw|arcade-v1)，登录成功后立刻升级
      const digest = await sha256Hex(acc.salt + '|' + password + '|arcade-v1');
      good = digest === acc.hash;
      if (good) {
        const salt = randomHex(16);
        acc.algo = 'pbkdf2';
        acc.salt = salt;
        acc.hash = await pbkdf2Hex(password, salt, PBKDF2_ITER);
        acc.iter = PBKDF2_ITER;
        acc.updated = Date.now();
        await this.put('acc:' + key, acc);
      }
    }
    if (!good) return fail('pw', '密码不对');

    const token = await this.issueToken(key);
    return {
      ok: true,
      code: acc.invited ? 'ok' : 'need-invite',
      token,
      name: acc.name || name,
      invited: !!acc.invited,
      msg: acc.invited ? '登录成功' : '登录成功，但还需要邀请码才能开始游戏',
    };
  }

  async me(token) {
    const hit = await this.accountByToken(token);
    if (!hit) return fail('auth', '登录已失效，请重新登录');
    return { ok: true, name: hit.acc.name, invited: !!hit.acc.invited };
  }

  async activate(token, invite) {
    const hit = await this.accountByToken(token);
    if (!hit) return fail('auth', '登录已失效，请重新登录');
    if (hit.acc.invited) return { ok: true, code: 'ok', invited: true, msg: '已经激活过了' };
    if (!(await inviteOk(invite))) return fail('invite', '邀请码不对');
    hit.acc.invited = true;
    hit.acc.updated = Date.now();
    await this.put('acc:' + hit.key, hit.acc);
    return { ok: true, code: 'ok', invited: true, name: hit.acc.name, msg: '邀请码已激活' };
  }

  async logout(token) {
    if (token) await this.del('tok:' + token);
    return { ok: true };
  }

  async changePassword(body, token) {
    const hit = await this.accountByToken(token);
    if (!hit) return fail('auth', '登录已失效，请重新登录');
    const oldPw = String(body.oldPassword == null ? '' : body.oldPassword);
    const newPw = String(body.newPassword == null ? '' : body.newPassword);
    if (newPw.length < 4) return fail('pw', '新密码至少 4 位');
    if (newPw.length > 64) return fail('pw', '新密码最多 64 位');
    const acc = hit.acc;
    let good;
    if (acc.algo === 'pbkdf2') {
      good = (await pbkdf2Hex(oldPw, acc.salt, acc.iter || PBKDF2_ITER)) === acc.hash;
    } else {
      good = (await sha256Hex(acc.salt + '|' + oldPw + '|arcade-v1')) === acc.hash;
    }
    if (!good) return fail('pw', '原密码不对');
    const salt = randomHex(16);
    acc.algo = 'pbkdf2';
    acc.salt = salt;
    acc.hash = await pbkdf2Hex(newPw, salt, PBKDF2_ITER);
    acc.iter = PBKDF2_ITER;
    acc.updated = Date.now();
    await this.put('acc:' + hit.key, acc);
    const newToken = await this.issueToken(hit.key);
    return { ok: true, token: newToken, msg: '密码已更新' };
  }

  /* 旧版 localStorage 账号导入：只收摘要，不收明文密码。
     下一次用正确密码登录时会自动升级成 PBKDF2。 */
  async migrate(body) {
    const rows = Array.isArray(body.accounts) ? body.accounts : [];
    const total = await this.countAccounts();
    let count = total;
    const imported = [];
    const skipped = [];
    for (const row of rows.slice(0, 50)) {
      const name = cleanName(row && row.name);
      const salt = row && row.salt;
      const hash = row && row.hash;
      if (!name || !validSalt(salt) || !validHash(hash)) {
        skipped.push({ name: String((row && row.name) || ''), why: 'bad' });
        continue;
      }
      const key = name.toLowerCase();
      if (await this.get('acc:' + key)) {
        skipped.push({ name, why: 'exists' });
        continue;
      }
      if (count >= MAX_ACCOUNTS) {
        skipped.push({ name, why: 'full' });
        continue;
      }
      await this.put('acc:' + key, {
        name,
        algo: 'arcade-v1',
        salt,
        hash,
        iter: 0,
        invited: !!row.invited,
        created: Number(row.created) || Date.now(),
        updated: Date.now(),
      });
      count++;
      imported.push(name);
    }
    return { ok: true, imported, skipped };
  }

  /* ---------------- 进度 ---------------- */
  async progressGet(token, gameRaw) {
    const hit = await this.accountByToken(token);
    if (!hit) return fail('auth', '登录已失效，请重新登录');
    const game = cleanGame(gameRaw);
    if (!game) return fail('game', '缺少游戏名');
    const row = await this.get('save:' + hit.key + ':' + game);
    if (!row) return { ok: true, game, data: null, updated: 0 };
    return { ok: true, game, data: row.data, updated: row.updated, clientAt: row.clientAt || 0 };
  }

  async progressSave(body, token) {
    const hit = await this.accountByToken(token);
    if (!hit) return fail('auth', '登录已失效，请重新登录');
    const game = cleanGame(body.game);
    if (!game) return fail('game', '缺少游戏名');
    const data = body.data;
    if (!data || typeof data !== 'object') return fail('data', '存档格式不对');
    let size = 0;
    try {
      size = JSON.stringify(data).length;
    } catch (e) {
      return fail('data', '存档无法序列化');
    }
    if (size > MAX_SAVE) return fail('big', '存档太大了');
    const key = 'save:' + hit.key + ':' + game;
    const existing = await this.get(key);
    /* 乐观锁：客户端带上它上次见到的版本号。
       对不上说明别的设备已经写过，回冲突让客户端先拉新档，避免旧档覆盖新档。 */
    if (typeof body.base === 'number') {
      const cur = existing ? existing.updated || 0 : 0;
      if (cur !== body.base) {
        return {
          ok: false,
          code: 'conflict',
          game,
          updated: cur,
          data: existing ? existing.data : null,
          msg: '云端存档已经变过了',
        };
      }
    }
    if (!existing) {
      const all = await this.state.storage.list({ prefix: 'save:' + hit.key + ':' });
      if (all.size >= MAX_GAMES) return fail('full', '这个账号的存档数量已达上限');
    }
    const now = Date.now();
    await this.put(key, { data, updated: now, clientAt: Number(body.clientAt) || 0 });
    return { ok: true, game, updated: now, size };
  }

  async progressList(token) {
    const hit = await this.accountByToken(token);
    if (!hit) return fail('auth', '登录已失效，请重新登录');
    const all = await this.state.storage.list({ prefix: 'save:' + hit.key + ':' });
    const games = [];
    for (const [k, v] of all) {
      if (!v) continue;
      games.push({ game: k.slice(('save:' + hit.key + ':').length), updated: v.updated || 0 });
    }
    games.sort((a, b) => a.game.localeCompare(b.game));
    return { ok: true, games };
  }

  async progressAll(token) {
    const hit = await this.accountByToken(token);
    if (!hit) return fail('auth', '登录已失效，请重新登录');
    const all = await this.state.storage.list({ prefix: 'save:' + hit.key + ':' });
    const items = {};
    for (const [k, v] of all) {
      if (!v) continue;
      items[k.slice(('save:' + hit.key + ':').length)] = { data: v.data, updated: v.updated || 0 };
    }
    return { ok: true, items };
  }

  async progressDelete(body, token) {
    const hit = await this.accountByToken(token);
    if (!hit) return fail('auth', '登录已失效，请重新登录');
    const game = cleanGame(body.game);
    if (!game) return fail('game', '缺少游戏名');
    await this.del('save:' + hit.key + ':' + game);
    return { ok: true, game };
  }

  async progressBulk(body, token) {
    const hit = await this.accountByToken(token);
    if (!hit) return fail('auth', '登录已失效，请重新登录');
    const items = body.items && typeof body.items === 'object' ? body.items : {};
    const done = [];
    const skipped = [];
    const now = Date.now();
    for (const raw of Object.keys(items).slice(0, 40)) {
      const game = cleanGame(raw);
      const data = items[raw];
      if (!game || !data || typeof data !== 'object') {
        skipped.push(raw);
        continue;
      }
      try {
        if (JSON.stringify(data).length > MAX_SAVE) {
          skipped.push(raw);
          continue;
        }
      } catch (e) {
        skipped.push(raw);
        continue;
      }
      const key = 'save:' + hit.key + ':' + game;
      if (await this.get(key)) {
        skipped.push({ game, why: 'exists' });
        continue;
      }
      await this.put(key, { data, updated: now, clientAt: Number(body.clientAt) || 0 });
      done.push(game);
    }
    return { ok: true, imported: done, skipped };
  }

  /* ---------------- 管理（需要 env.ADMIN_KEY，未设置时接口关闭） ---------------- */
  adminOk(key) {
    const secret = this.env && this.env.ADMIN_KEY;
    if (!secret) return false;
    return String(key || '') === String(secret);
  }

  async adminList() {
    const all = await this.state.storage.list({ prefix: 'acc:' });
    const rows = [];
    for (const [k, v] of all) {
      if (!v) continue;
      rows.push({
        name: v.name,
        invited: !!v.invited,
        created: v.created || 0,
        updated: v.updated || 0,
        algo: v.algo || 'arcade-v1',
      });
    }
    rows.sort((a, b) => a.created - b.created);
    return { ok: true, count: rows.length, accounts: rows };
  }

  async adminDelete(body) {
    const name = cleanName(body.name);
    if (!name) return fail('name', '缺少 name');
    const key = name.toLowerCase();
    const acc = await this.get('acc:' + key);
    if (!acc) return fail('nouser', '没有这个账号');
    await this.del('acc:' + key);
    const tokens = await this.state.storage.list({ prefix: 'tok:' });
    for (const [k, v] of tokens) if (v && v.key === key) await this.del(k);
    const saves = await this.state.storage.list({ prefix: 'save:' + key + ':' });
    for (const [k] of saves) await this.del(k);
    return { ok: true, name: acc.name || name };
  }

  /* ---------------- 路由 ---------------- */
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: HEADERS });
    }
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/health' || path === '/health') {
      return json({
        ok: true,
        service: VERSION,
        users: await this.countAccounts(),
        ts: Date.now(),
      });
    }

    const token = this.tokenOf(request, url);
    const body = request.method === 'POST' || request.method === 'DELETE' ? await this.readJson(request) : null;

    try {
      if (request.method === 'POST' && path === '/api/register') {
        if (!body) return json(fail('bad', '参数不全'), 400);
        return json(await this.register(body));
      }
      if (request.method === 'POST' && path === '/api/login') {
        if (!body) return json(fail('bad', '参数不全'), 400);
        return json(await this.login(body));
      }
      if (request.method === 'GET' && path === '/api/me') {
        return json(await this.me(token));
      }
      if (request.method === 'POST' && path === '/api/invite') {
        if (!body) return json(fail('bad', '参数不全'), 400);
        return json(await this.activate(body.token || token, body.invite));
      }
      if (request.method === 'POST' && path === '/api/logout') {
        return json(await this.logout(body && body.token ? body.token : token));
      }
      if (request.method === 'POST' && path === '/api/password') {
        if (!body) return json(fail('bad', '参数不全'), 400);
        return json(await this.changePassword(body, body.token || token));
      }
      if (request.method === 'POST' && path === '/api/migrate') {
        if (!body) return json(fail('bad', '参数不全'), 400);
        return json(await this.migrate(body));
      }
      if (request.method === 'GET' && path === '/api/progress') {
        return json(await this.progressGet(token, url.searchParams.get('game')));
      }
      if (request.method === 'POST' && path === '/api/progress') {
        if (!body) return json(fail('bad', '参数不全'), 400);
        return json(await this.progressSave(body, body.token || token));
      }
      if (request.method === 'GET' && path === '/api/progress/list') {
        return json(await this.progressList(token));
      }
      if (request.method === 'GET' && path === '/api/progress/all') {
        return json(await this.progressAll(token));
      }
      if ((request.method === 'POST' || request.method === 'DELETE') && path === '/api/progress/delete') {
        if (!body) return json(fail('bad', '参数不全'), 400);
        return json(await this.progressDelete(body, body.token || token));
      }
      if (request.method === 'POST' && path === '/api/progress/bulk') {
        if (!body) return json(fail('bad', '参数不全'), 400);
        return json(await this.progressBulk(body, body.token || token));
      }
      if (path === '/api/admin/list' || path === '/api/admin/delete') {
        if (!this.adminOk(body ? body.key : url.searchParams.get('key'))) {
          return json({ ok: false, msg: 'not found' }, 404);
        }
        if (path === '/api/admin/list') return json(await this.adminList());
        if (!body) return json(fail('bad', '参数不全'), 400);
        return json(await this.adminDelete(body));
      }
    } catch (e) {
      return json(fail('server', '服务端出错：' + (e && e.message ? e.message : 'unknown')), 500);
    }

    return json({ ok: false, msg: 'not found' }, 404);
  }
}
