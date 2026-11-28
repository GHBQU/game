#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
游戏厅 · 把服务端部署到 ESP32-S3
==================================================================
两种模式：

  A 轻量（默认，推荐）
    板子只跑 /api + /ws，几 KB 的 Python 就够了。
    页面继续放在 GitHub Pages / Cloudflare 上，页面里用 ?api= 指向板子。
    好处：不占 flash、不用改分区表，联机与存档都在局域网里，延迟最低。

  B 整站
    把 index.html、arcade*.js、games/（约 6.7MB）一起塞进板子 flash，
    完全离线也能玩。需要板子文件系统 ≥8MB（默认 2MB 的构建放不下，见 README）。

用法：
    python3 tools/deploy.py                          # A 模式，自动找串口
    python3 tools/deploy.py --port /dev/cu.usbmodem14201
    python3 tools/deploy.py --site                   # B 模式，连整站一起传
    python3 tools/deploy.py --config "我的WiFi" "密码"
    python3 tools/deploy.py --flash ~/Downloads/ESP32_GENERIC_S3-SPIRAM_OCT.bin

注意：--flash 会擦掉整片 flash（包括原厂固件）。刷之前先备份，
      备份方法见仓库根目录的 ESP32S3_备份说明 / tools/backup.py。
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, '..'))
SERVER_FILES = ('config.py', 'arcade_core.py', 'wsproto.py', 'rooms.py', 'tunnel.py', 'main.py')
SITE_FILES = ('index.html', 'arcade.js', 'arcade-progress.js', 'holidays.js', 'CNAME')
SITE_DIRS = ('games',)


def find_port():
    try:
        import serial.tools.list_ports as lp
    except ImportError:
        return ''
    for p in lp.comports():
        if p.vid == 0x303A:
            return p.device
    return ''


def run(cmd, check=True):
    print('  $', ' '.join(cmd))
    r = subprocess.run(cmd)
    if check and r.returncode != 0:
        raise SystemExit('命令失败: %s' % ' '.join(cmd))
    return r.returncode


def mpremote(port, *args):
    cmd = [sys.executable, '-m', 'mpremote', 'connect', port] + list(args)
    return run(cmd)


def flash(firmware, port, baud=460800):
    esptool = shutil.which('esptool.py') or shutil.which('esptool')
    if not esptool:
        esptool = os.path.join(os.path.dirname(sys.executable), 'esptool.py')
        if not os.path.exists(esptool):
            raise SystemExit('找不到 esptool，pip install esptool 先')
    print('!! 这一步会清空整片 flash，原厂固件会被抹掉')
    run([esptool, '--chip', 'esp32s3', '--port', port, 'erase_flash'])
    run([esptool, '--chip', 'esp32s3', '--port', port, '--baud', str(baud),
         'write_flash', '-z', '0x0', firmware])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', default='')
    ap.add_argument('--site', action='store_true', help='B 模式：整站一起传')
    ap.add_argument('--config', nargs=2, metavar=('SSID', 'PASS'), help='顺手写 config.json')
    ap.add_argument('--relay', metavar='HOST', help='内网穿透中继域名，例如 board.ghbqu.dpdns.org')
    ap.add_argument('--relay-token', metavar='TOKEN', help='与中继约定的口令')
    ap.add_argument('--relay-port', type=int, default=443)
    ap.add_argument('--flash', metavar='FIRMWARE.bin', help='先刷 MicroPython 固件')
    ap.add_argument('--no-server', action='store_true', help='只传站点，不动服务端')
    args = ap.parse_args()

    port = args.port or find_port()
    if not port:
        raise SystemExit('没找到串口。插好板子，或用 --port 指定')

    print('串口:', port)

    if args.flash:
        flash(args.flash, port)
        print('刷完记得重新上电')

    cfg_path = os.path.join(SITE, 'config.json')
    cfg = {}
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path) as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}
    dirty = False
    if args.config:
        cfg['wifi_ssid'] = args.config[0]
        cfg['wifi_pass'] = args.config[1]
        dirty = True
    if args.relay:
        cfg['relay_host'] = args.relay
        cfg['relay_port'] = args.relay_port
        cfg['relay_tls'] = True
        cfg['relay_enabled'] = True
        if args.relay_token:
            cfg['relay_token'] = args.relay_token
        dirty = True
        print('中继: %s:%d（口令 %s）'
              % (args.relay, args.relay_port, '已写入' if args.relay_token else '沿用旧的'))
    if dirty:
        with open(cfg_path, 'w') as f:
            json.dump(cfg, f, indent=2)
        print('写好 config.json（这个文件别提交进仓库）')

    print('\n[1/3] 传服务端')
    if not args.no_server:
        for name in SERVER_FILES:
            mpremote(port, 'fs', 'cp', os.path.join(SITE, 'esp32', name), ':' + name)
    if os.path.exists(os.path.join(SITE, 'config.json')):
        mpremote(port, 'fs', 'cp', os.path.join(SITE, 'config.json'), ':config.json')

    print('\n[2/3] 传站点')
    if args.site:
        for name in SITE_FILES:
            p = os.path.join(SITE, name)
            if os.path.exists(p):
                mpremote(port, 'fs', 'cp', p, ':' + name)
        for name in SITE_DIRS:
            p = os.path.join(SITE, name)
            if os.path.exists(p):
                mpremote(port, 'fs', 'cp', '-r', p, ':')
    else:
        print('  跳过（A 模式：页面留在 Pages 上，用 ?api= 指向板子）')
        print('  想整站离线也带上 --site')

    print('\n[3/3] 看一下板子状态')
    mpremote(port, 'exec',
             'import os;'
             's=os.statvfs("/");'
             'print("文件系统剩余 %.1f MB" % (s[0]*s[3]/1048576))')
    mpremote(port, 'exec', 'import os; print(sorted(os.listdir()))')

    print('\n完成。重启板子看串口打印的 IP：')
    print('  %s -m mpremote connect %s repl' % (sys.executable, port))
    print('板子起来后：')
    print('  http://<板子IP>/                整站（B 模式）')
    print('  http://<板子IP>/api/health      存档/账号服务自检')
    print('  ws://<板子IP>/ws                联机房间')


if __name__ == '__main__':
    main()
