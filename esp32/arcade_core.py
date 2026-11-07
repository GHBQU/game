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
