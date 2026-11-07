# 跑在自己的 ESP32 上

板子自己把主页 + 两个游戏 + 账号接口一起发出来，局域网内访问。除了板子和路由器，**不需要任何电脑常开**。

## 需要什么

- 一块 ESP32（4MB flash 起步，8MB 更舒服）
- MicroPython 固件
- 电脑（只在烧录时用一次）

站点文件一共约 964 KB，加上服务端代码约 1 MB，4MB 板子的 1.4MB 文件系统够放。

## 烧录

```bash
pip install esptool mpremote

# 1. 刷固件（型号按自己的板子选，4MB 通用板用 ESP32_GENERIC）
esptool.py --chip esp32 --port /dev/cu.usbserial-XXXX erase_flash
esptool.py --chip esp32 --port /dev/cu.usbserial-XXXX \
    write_flash -z 0x1000 ESP32_GENERIC-20240602-v1.23.0.bin

# 2. 改 esp32/main.py 顶部的 WIFI_SSID / WIFI_PASS

# 3. 传文件（在 game-site 目录下执行）
P=/dev/cu.usbserial-XXXX
mpremote connect $P fs cp esp32/main.py :main.py
mpremote connect $P fs cp esp32/arcade_core.py :arcade_core.py
mpremote connect $P fs cp index.html :index.html
mpremote connect $P fs cp arcade.js :arcade.js
mpremote connect $P fs cp holidays.js :holidays.js
mpremote connect $P fs cp -r games :games

# 4. 复位，看串口打印的 IP
mpremote connect $P repl
```

串口会打印：

```
========================================
游戏厅已启动： http://192.168.1.xx/
账号文件： /data/accounts.json
========================================
```

手机连同一个 WiFi，打开这个地址就能玩。

## 它是怎么接上的

`main.py` 在返回主页时，会边读边把这一行改掉：

```html
<meta name="arcade-api" content="local">      <!-- 仓库里是 local -->
<meta name="arcade-api" content="same-origin"> <!-- 板子发出来时改成这个 -->
```

前端 `arcade.js` 看到 `same-origin` 就把注册/登录打到 `/api/*`，看不到就退回本机 localStorage。所以**同一份 `index.html` 既能部署在 GitHub Pages，也能给板子用**，不用改代码。

游戏页没有被改写，但它和主页同源，`arcade.js` 会把解析出的模式记在 localStorage 里复用。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 存活检查，返回账号数 |
| POST | `/api/register` | `{name, password, invite}` |
| POST | `/api/login` | `{name, password}` |
| POST | `/api/invite` | `{token, invite}` |
| POST | `/api/logout` | `{token}` |
| GET | `/api/me?token=` | 校验会话 |

## 存储

账号在 `/data/accounts.json`，令牌在 `/data/tokens.json`。密码存的是 `sha256(salt|密码|arcade-v1)`，明文不落盘。

写入流程是「先写 `.tmp` 再改名」，掉电时最多丢最后一次写入，不会把整个文件写坏；读取时如果正式文件坏了会退回去读 `.tmp`。

## 性能与限制

- MicroPython 的 socket 是**单连接、串行处理**，一个请求处理完才接下一个。浏览器会并发开 6 条连接，所以首屏会排队，慢但能用。
- `assets.js` 有 561 KB，第一次进 IP, PLEASE 要等几秒。
- 每次登录/注册都会写一次 flash。日常用没问题，但别写脚本刷注册。
- 只有局域网能访问。想公网访问需要公网 IP + 端口映射，且 HTTPS 证书在板子上很难维护 —— 不建议。

## 在电脑上先试

不想等板子，可以先跑模拟器，路由和板子完全一致：

```bash
python3 tools/board-sim.py        # http://127.0.0.1:8080
```

数据存在 `tools/.board-data/`，删掉就是重置。
