# -*- coding: utf-8 -*-
"""
游戏厅 · 账号核心逻辑
------------------------------------------------------------------
同一份代码跑在两个地方：
  · ESP32 / MicroPython  —— 由 main.py 加载，对外提供 HTTP 接口
  · PC / CPython         —— 由 tools/mock-server.py 加载，用来在板子到手前先测协议

所以这里只使用两边都有的标准库：json / os / hashlib / binascii / time
不要在这里 import socket、machine、network —— 那些是 main.py 的事。
"""

import json
import os
import hashlib
import binascii
import time

# 邀请码摘要（与前端 arcade.js 里的算法一致）
# sha256('arcade-invite-v1|' + 去掉空白后的输入)
INVITE_DIGESTS = (
    '1248225cb05b01163d46216ba6eb7b739feb52de74859fbfaf2a80e8309042c8',
)

TOKEN_TTL = 30 * 24 * 3600      # 令牌有效期 30 天
NAME_MAX = 20
PW_MIN, PW_MAX = 4, 64


# ---------------------------------------------------------------- 小工具
def _now():
    return int(time.time())


def _hex(data):
    return binascii.hexlify(data).decode()


def normalize_invite(value):
    """去掉所有空白字符，避免用户复制时带上空格/换行。"""
    return ''.join(str(value or '').split())


def invite_ok(value):
    digest = _hex(hashlib.sha256(
        ('arcade-invite-v1|' + normalize_invite(value)).encode('utf-8')
    ).digest())
    return digest in INVITE_DIGESTS


def hash_password(password, salt):
    return _hex(hashlib.sha256(
        (salt + '|' + password + '|arcade-v1').encode('utf-8')
    ).digest())


def validate_name(name):
    if not name:
        return '账号名不能为空'
    if len(name) > NAME_MAX:
        return '账号名最多 %d 个字符' % NAME_MAX
    for ch in name:
        if ch.isspace():
            return '账号名不能包含空格'
    return None


# ---------------------------------------------------------------- 存储
class Store:
    """把账号和令牌存成两个 JSON 文件。

    写入流程：先写 .tmp，再 rename 覆盖。MicroPython 的 LittleFS 在目标已存在时
    rename 可能失败，所以失败时退化为「删旧 + 改名」。
    读取时如果正式文件损坏/缺失，会尝试读 .tmp，尽量不让一次掉电毁掉全部账号。
    """

    def __init__(self, root='/data'):
        self.root = root
        self.acc_path = root + '/accounts.json'
        self.tok_path = root + '/tokens.json'
        try:
            os.mkdir(root)
        except OSError:
            pass
        self.accounts = self._read(self.acc_path)
        self.tokens = self._read(self.tok_path)

    # --- 底层读写 ---
    def _read(self, path):
        for candidate in (path, path + '.tmp'):
            try:
                with open(candidate, 'r') as f:
                    data = json.loads(f.read())
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
        return {}

    def _write(self, path, obj):
        tmp = path + '.tmp'
        with open(tmp, 'w') as f:
            f.write(json.dumps(obj))
        try:
            os.rename(tmp, path)
        except OSError:
            try:
                os.remove(path)
            except OSError:
                pass
            os.rename(tmp, path)

    def save_accounts(self):
        self._write(self.acc_path, self.accounts)

    def save_tokens(self):
        self._write(self.tok_path, self.tokens)

    def prune_tokens(self):
        now = _now()
        dead = [t for t, v in self.tokens.items() if v.get('exp', 0) < now]
        for t in dead:
            del self.tokens[t]
        if dead:
            self.save_tokens()


# ---------------------------------------------------------------- 业务
class Auth:
    def __init__(self, store):
        self.store = store

    # --- 内部 ---
    def _issue_token(self, key):
        token = _hex(os.urandom(16))
        self.store.tokens[token] = {'key': key, 'exp': _now() + TOKEN_TTL}
        self.store.save_tokens()
        return token

    def _account_by_token(self, token):
        rec = self.store.tokens.get(token or '')
        if not rec:
            return None, None
        if rec.get('exp', 0) < _now():
            del self.store.tokens[token]
            self.store.save_tokens()
            return None, None
        key = rec.get('key')
        acc = self.store.accounts.get(key)
        return key, acc

    # --- 对外 ---
    def register(self, name, password, invite=''):
        name = (name or '').strip()
        password = password or ''
        bad = validate_name(name)
        if bad:
            return {'ok': False, 'code': 'name', 'msg': bad}
        if len(password) < PW_MIN:
            return {'ok': False, 'code': 'pw', 'msg': '密码至少 %d 位' % PW_MIN}
        if len(password) > PW_MAX:
            return {'ok': False, 'code': 'pw', 'msg': '密码最多 %d 位' % PW_MAX}

        key = name.lower()
        if key in self.store.accounts:
            return {'ok': False, 'code': 'dup', 'msg': '这个账号名已经被注册了'}

        salt = _hex(os.urandom(8))
        invited = invite_ok(invite)
        self.store.accounts[key] = {
            'name': name,
            'salt': salt,
            'hash': hash_password(password, salt),
            'invited': invited,
            'created': _now(),
        }
        self.store.save_accounts()

        return {
            'ok': True,
            'code': 'ok' if invited else 'need-invite',
            'token': self._issue_token(key),
            'name': name,
            'invited': invited,
            'msg': '注册成功' if invited else '注册成功，但还需要邀请码才能开始游戏',
        }

    def login(self, name, password):
        key = (name or '').strip().lower()
        acc = self.store.accounts.get(key)
        if not acc:
            return {'ok': False, 'code': 'nouser', 'msg': '没有这个账号'}
        if hash_password(password or '', acc['salt']) != acc['hash']:
            return {'ok': False, 'code': 'pw', 'msg': '密码不对'}
        return {
            'ok': True,
            'code': 'ok' if acc.get('invited') else 'need-invite',
            'token': self._issue_token(key),
            'name': acc['name'],
            'invited': bool(acc.get('invited')),
            'msg': '登录成功' if acc.get('invited') else '登录成功，但还需要邀请码才能开始游戏',
        }

    def activate(self, token, invite):
        key, acc = self._account_by_token(token)
        if not acc:
            return {'ok': False, 'code': 'auth', 'msg': '登录已失效，请重新登录'}
        if acc.get('invited'):
            return {'ok': True, 'code': 'ok', 'invited': True, 'msg': '已经激活过了'}
        if not invite_ok(invite):
            return {'ok': False, 'code': 'invite', 'msg': '邀请码不对'}
        acc['invited'] = True
        self.store.save_accounts()
        return {'ok': True, 'code': 'ok', 'invited': True, 'name': acc['name'], 'msg': '邀请码已激活'}

    def me(self, token):
        key, acc = self._account_by_token(token)
        if not acc:
            return {'ok': False, 'code': 'auth', 'msg': '登录已失效'}
        return {
            'ok': True,
            'name': acc['name'],
            'invited': bool(acc.get('invited')),
        }

    def logout(self, token):
        if token in self.store.tokens:
            del self.store.tokens[token]
            self.store.save_tokens()
        return {'ok': True}

    def health(self):
        self.store.prune_tokens()
        return {
            'ok': True,
            'service': 'arcade-accounts',
            'users': len(self.store.accounts),
            'uptime': _now(),
        }


# ---------------------------------------------------------------- 云存档
GAME_RE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789_-'
MAX_SAVE = 256 * 1024          # 单个游戏存档上限（和 Cloudflare 那份一致）
MAX_GAMES = 80


def clean_game(raw):
    """游戏名做一次白名单校验，顺便挡住 ../ 之类的路径穿越。"""
    name = str(raw or '').strip().lower()
    if not name or len(name) > 32:
        return ''
    first = name[0]
    if not (first.isalnum() and first not in '_-'):
        return ''
    for ch in name:
        if ch not in GAME_RE_CHARS:
            return ''
    return name


def _now_ms():
    """版本号用毫秒时间戳；板子没对上时间时会退化成开机秒数，仍然单调递增。"""
    t = time.time()
    return int(t * 1000) if t > 1000000000 else int(t * 1000)


class Progress:
    """每个账号每个游戏一份 JSON，带版本号做乐观锁。

    目录：/data/progress/<账号散列>/<游戏>.json
    用散列当目录名，避免中文账号名在文件系统里出问题。
    """

    def __init__(self, store, auth, root=None):
        self.store = store
        self.auth = auth
        self.root = (root or (store.root + '/progress'))
        try:
            os.mkdir(self.root)
        except OSError:
            pass

    # --- 路径 ---
    def _dir(self, key):
        tag = _hex(hashlib.sha256(key.encode('utf-8')).digest())[:16]
        path = self.root + '/' + tag
        try:
            os.mkdir(path)
        except OSError:
            pass
        return path

    def _path(self, key, game):
        return self._dir(key) + '/' + game + '.json'

    def _read(self, key, game):
        for cand in (self._path(key, game), self._path(key, game) + '.tmp'):
            try:
                with open(cand, 'r') as f:
                    row = json.loads(f.read())
                if isinstance(row, dict):
                    return row
            except Exception:
                pass
        return None

    def _write(self, key, game, row):
        path = self._path(key, game)
        tmp = path + '.tmp'
        with open(tmp, 'w') as f:
            f.write(json.dumps(row))
        try:
            os.rename(tmp, path)
        except OSError:
            try:
                os.remove(path)
            except OSError:
                pass
            os.rename(tmp, path)

    def _games_of(self, key):
        out = []
        try:
            for name in os.listdir(self._dir(key)):
                if not name.endswith('.json'):
                    continue
                out.append(name[:-5])
        except OSError:
            pass
        return out

    # --- 对外 ---
    def get(self, token, game_raw):
        key, acc = self.auth._account_by_token(token)
        if not acc:
            return {'ok': False, 'code': 'auth', 'msg': '登录已失效，请重新登录'}
        game = clean_game(game_raw)
        if not game:
            return {'ok': False, 'code': 'game', 'msg': '缺少游戏名'}
        row = self._read(key, game)
        if not row:
            return {'ok': True, 'game': game, 'data': None, 'updated': 0}
        return {
            'ok': True, 'game': game,
            'data': row.get('data'),
            'updated': row.get('updated', 0),
            'clientAt': row.get('clientAt', 0),
        }

    def save(self, body, token):
        key, acc = self.auth._account_by_token(token or body.get('token'))
        if not acc:
            return {'ok': False, 'code': 'auth', 'msg': '登录已失效，请重新登录'}
        game = clean_game(body.get('game'))
        if not game:
            return {'ok': False, 'code': 'game', 'msg': '缺少游戏名'}
        data = body.get('data')
        if not isinstance(data, dict):
            return {'ok': False, 'code': 'data', 'msg': '存档格式不对'}
        try:
            size = len(json.dumps(data))
        except Exception:
            return {'ok': False, 'code': 'data', 'msg': '存档无法序列化'}
        if size > MAX_SAVE:
            return {'ok': False, 'code': 'big', 'msg': '存档太大了'}

        existing = self._read(key, game)
        cur = existing.get('updated', 0) if existing else 0
        base = body.get('base')
        if isinstance(base, int):
            if cur != base:
                return {
                    'ok': False, 'code': 'conflict', 'game': game,
                    'updated': cur,
                    'data': existing.get('data') if existing else None,
                    'msg': '云端存档已经变过了',
                }
        if not existing and len(self._games_of(key)) >= MAX_GAMES:
            return {'ok': False, 'code': 'full', 'msg': '这个账号的存档数量已达上限'}

        now = _now_ms()
        if now <= cur:
            now = cur + 1
        self._write(key, game, {
            'data': data,
            'updated': now,
            'clientAt': int(body.get('clientAt') or 0),
        })
        return {'ok': True, 'game': game, 'updated': now, 'size': size}

    def list_games(self, token):
        key, acc = self.auth._account_by_token(token)
        if not acc:
            return {'ok': False, 'code': 'auth', 'msg': '登录已失效，请重新登录'}
        games = []
        for game in self._games_of(key):
            row = self._read(key, game) or {}
            games.append({'game': game, 'updated': row.get('updated', 0)})
        games.sort(key=lambda g: g['game'])
        return {'ok': True, 'games': games}

    def all(self, token):
        key, acc = self.auth._account_by_token(token)
        if not acc:
            return {'ok': False, 'code': 'auth', 'msg': '登录已失效，请重新登录'}
        items = {}
        for game in self._games_of(key):
            row = self._read(key, game) or {}
            items[game] = {'data': row.get('data'), 'updated': row.get('updated', 0)}
        return {'ok': True, 'items': items}

    def delete(self, body, token):
        key, acc = self.auth._account_by_token(token or body.get('token'))
        if not acc:
            return {'ok': False, 'code': 'auth', 'msg': '登录已失效，请重新登录'}
        game = clean_game(body.get('game'))
        if not game:
            return {'ok': False, 'code': 'game', 'msg': '缺少游戏名'}
        try:
            os.remove(self._path(key, game))
        except OSError:
            pass
        return {'ok': True, 'game': game}

    def bulk(self, body, token):
        key, acc = self.auth._account_by_token(token or body.get('token'))
        if not acc:
            return {'ok': False, 'code': 'auth', 'msg': '登录已失效，请重新登录'}
        items = body.get('items') if isinstance(body.get('items'), dict) else {}
        imported, skipped = [], []
        now = _now_ms()
        for raw in list(items.keys())[:40]:
            game = clean_game(raw)
            data = items[raw]
            if not game or not isinstance(data, dict):
                skipped.append(raw)
                continue
            try:
                if len(json.dumps(data)) > MAX_SAVE:
                    skipped.append(raw)
                    continue
            except Exception:
                skipped.append(raw)
                continue
            if self._read(key, game):
                skipped.append(game)
                continue
            now += 1
            self._write(key, game, {'data': data, 'updated': now, 'clientAt': 0})
            imported.append(game)
        return {'ok': True, 'imported': imported, 'skipped': skipped}
