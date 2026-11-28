#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
游戏厅 · 板子模拟器（在 PC 上跑和板子完全相同的服务）

直接调用 esp32/main.py，路由、存档、联机房间、延迟特性都是同一份代码，
所以这里测通了，烧到板子上行为一致。

用法：
    python3 tools/board-sim.py            # http://127.0.0.1:8080
    python3 tools/board-sim.py 9000       # 换端口
    ARCADE_DATA=/tmp/arcade python3 tools/board-sim.py

存档落在 tools/.board-data（不进仓库）。
"""

import asyncio
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(SITE, 'esp32'))

os.environ.setdefault('ARCADE_DATA', os.path.join(HERE, '.board-data'))

import main  # noqa: E402

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
main.PORT = port

if __name__ == '__main__':
    print('板子模拟器： http://127.0.0.1:%d/' % port)
    print('联机地址：   ws://127.0.0.1:%d/ws' % port)
    print('存档目录：   %s' % main.store.root)
    try:
        asyncio.run(main.main())
    except KeyboardInterrupt:
        print('\n停止')
