# -*- coding: utf-8 -*-
"""
游戏厅 · 板子配置
------------------------------------------------------------------
默认值写在下面；想改就放一个 config.json 到板子根目录，键名一致即可：

    {
      "wifi_ssid": "我的WiFi",
      "wifi_pass": "密码",
      "port": 80,
      "max_players": 8
    }

改了 config.json 不用重刷固件，重启板子就生效。
"""

import json
import os

DEFAULT = {
    'wifi_ssid': '你的WiFi名',
    'wifi_pass': '你的WiFi密码',
    'port': 80,
    'max_players': 8,        # 单个房间最多几个人
    'max_rooms': 16,         # 同时存在的房间数
    'idle_timeout': 45,      # 多少秒没动静就把玩家踢掉
    'keepalive': 12,         # 单条 HTTP 连接上最多复用几次
    'ap_fallback': True,     # 连不上 WiFi 时开热点，方便现场救砖
    'ap_ssid': 'Arcade-Board',
    'ap_pass': 'arcade1234',
}

PATHS = ('/config.json', 'config.json')


def load(verbose=True):
    cfg = dict(DEFAULT)
    for path in PATHS:
        try:
            with open(path, 'r') as f:
                data = json.loads(f.read())
        except Exception:
            continue
        if isinstance(data, dict):
            for key in data:
                cfg[key] = data[key]
            if verbose:
                print('读到配置:', path)
        break
    # PC 上跑模拟器时用环境变量覆盖，方便一次开多个实例
    for key in ('PORT', 'WIFI_SSID', 'WIFI_PASS'):
        val = os.environ.get(key) if hasattr(os, 'environ') else None
        if val:
            cfg[key.lower()] = val if key != 'PORT' else int(val)
    return cfg
