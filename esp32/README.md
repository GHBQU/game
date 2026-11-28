# 用 ESP32 当服务器

板子同时干三件事，全部跑在一个 uasyncio 事件循环里，同一个端口：

| 路径 | 作用 |
|---|---|
| `/` `/games/...` | 静态站点（整站模式才有） |
| `/api/*` | 账号 + 云存档，契约与 Cloudflare Worker 完全一致 |
| `/ws` | 联机房间（WebSocket），协议与纸片勇者、暗夜幸存者现有的一致 |

所以「把页面放到 Cloudflare」和「把页面放到板子」对游戏来说没有区别，只有延迟不同。

## 两种部署方式

### A 轻量（推荐）

板子只跑 `/api` 和 `/ws`，几 KB Python 就够。页面仍然放在 GitHub Pages / Cloudflare 上，
用查询参数把后端指过来：

```
https://你的域名/games/paper-hero/?server=http://192.168.1.50
https://你的域名/games/night-survivors/?ws=ws://192.168.1.50/ws
https://你的域名/?api=http://192.168.1.50
```

`?api=` 会被记住（写进 `localStorage` 的 `arcade.api-mode`），之后刷新不用再带。
整站模式下页面与板子同源，联机地址自动就是 `/ws`，什么都不用配。

为什么推荐 A：整站 6.7MB，而 MicroPython 默认构建给文件系统的只有约 2MB，塞不进去。
A 模式既不占 flash，也不用改分区表，联机流量依旧全在局域网内。

### B 整站

把站点一起塞进 flash，完全离线可玩。前提是文件系统 ≥8MB，需要自己换分区表
（默认构建只有 2MB）。传文件时加 `--site`。

## 没有公网 IP：板子自己往外连

家里是 CGNAT（光猫 WAN 口写 `100.64.x.x`）时，端口映射做不了，也不能让电脑常开。
那就让板子主动出站，连到 Cloudflare 上的一台中继：

```
板子 ──wss 出站──> board.ghbqu.dpdns.org/__relay ──> Durable Object
手机 ──https/wss──> board.ghbqu.dpdns.org/api, /ws ──> 同一个 DO ──> 板子
```

一条 TLS 长连接上跑多路复用，握手只做一次（板上一次 ECDHE 要 0.3–1 秒），
之后每个请求只多几毫秒。

**部署中继**（一次性）：

```bash
cd server/relay
npx wrangler@3 deploy
npx wrangler@3 secret put RELAY_TOKEN     # 自己定一个口令
```

`wrangler.toml` 里已经写好 `board.ghbqu.dpdns.org` 这个自定义域名，DNS 由 Cloudflare 自动加。

**配置板子**：

```bash
python3 tools/deploy.py --port /dev/cu.usbmodem14201 \
    --relay board.ghbqu.dpdns.org --relay-token 你刚设的口令
```

板子起来后串口会多一行 `内网穿透已启用`，重启断网都会自动重连（1→2→4→8→15→30 秒退避）。

**先在电脑上验证整条链路**，不用等板子：

```bash
python3 tools/board-sim.py 8891                                    # 板子
RELAY_HOST=127.0.0.1 RELAY_PORT=9200 RELAY_TLS=0 \
  RELAY_TOKEN=test python3 tools/board-sim.py 8891                 # 板子 + 隧道
cd server/relay && npx wrangler@3 dev --local --port 9200 --var RELAY_TOKEN:test
curl http://127.0.0.1:9200/api/health                              # 经真 Worker 打到板子
```

实测（本机，含两跳进程）：`/api/health` 往返 12.7 ms，联机 `ping` 中位 2.4 ms，
A→B 单程 1.07 ms。上真机再加 Cloudflare 边缘那一段，公网 RTT 预计 30–70 ms。

**免费额度**：Workers 10 万请求/天、DO 10 万请求/天、DO duration 13,000 GB-s/天。
通用写法（`accept()` 常驻）一条连接 24 小时就吃掉 10,800 GB-s，所以 `relay.js` 用的是
Hibernation（`state.acceptWebSocket`），空闲不计 duration，一天几千次请求只在几 GB-s 量级。

## 烧录

```bash
# 0. 如果这块板子原来是成品设备，先整片备份，见仓库根的备份说明
# 1. 刷 MicroPython（ESP32-S3 + 8MB PSRAM 用 SPIRAM_OCT 构建）
python3 tools/deploy.py --port /dev/cu.usbmodem14201 \
    --flash ~/Downloads/ESP32_GENERIC_S3-SPIRAM_OCT-20240602-v1.23.0.bin

# 2. 写 WiFi 并传服务端
python3 tools/deploy.py --port /dev/cu.usbmodem14201 --config "我的WiFi" "密码"

# 3. 看启动日志（会打印 IP）
python3 -m mpremote connect /dev/cu.usbmodem14201 repl
```

启动后串口打印：

```
========================================
游戏厅已启动   http://192.168.1.50/
联机地址       ws://192.168.1.50/ws
存档目录       /data/progress
========================================
```

连不上 WiFi 会自动开热点 `Arcade-Board / arcade1234`，方便现场救砖
（`config.json` 里 `ap_fallback` 可关）。

## 接口

账号与存档和 `server/src/index.js`（Cloudflare Worker）一模一样：

```
GET  /api/health
GET  /api/me?token=
POST /api/register | /api/login | /api/invite | /api/logout

GET  /api/progress?token=&game=
POST /api/progress            {token, game, data:{v,keys}, base}
GET  /api/progress/list?token=
GET  /api/progress/all?token=
POST /api/progress/delete     {token, game}
POST /api/progress/bulk       {token, items:{game:data}}
```

`base` 是乐观锁：传上次拿到的 `updated`，对不上就回 `{ok:false, code:'conflict'}`，
和云端行为一致，所以 `arcade-progress.js` 一个字都不用改就能双端通用。

存档落盘在 `/data/progress/<账号散列>/<游戏>.json`，先写 `.tmp` 再改名，掉电不会写坏。

## 联机协议

```
客户端 → 服务端                     服务端 → 客户端
{t:'ping', ts}                      {t:'pong', ts}
{t:'create', name}                  {t:'joined', id, room, hostId, players[]}
{t:'join', room, name}              {t:'peers', hostId, players[]}
{t:'msg', d}                        {t:'msg', from, d}
{t:'leave'}                         {t:'left'}
                                    {t:'err', msg}
```

- 房号 4 位，房间全在内存里，不落 flash
- `players` 每项是 `{id, name, seat}`，`seat` 决定纸片勇者用哪个角色
- 房主掉线自动移交给座位最小的玩家
- 45 秒没动静的连接会被清理（`config.json` 的 `idle_timeout`）

## 延迟

同一份代码在本机实测：

| 项目 | 数值 |
|---|---|
| 空载 RTT | 1–4 ms |
| 单次消息转发（1 发 1 收） | 中位 1.14 ms / p95 2.46 ms |
| 8 人房广播一轮（1 发 7 收） | 2.0 ms |

板子上会多几毫秒 Wi-Fi 与解析开销，局域网内仍远低于绕公网的 Cloudflare。为此做了三件事：

1. socket 上关 Nagle（`TCP_NODELAY`），小包立刻发
2. 转发只做一次 `json.loads` + 一次 `dumps`，不排队不节流
3. 广播先全部 `write`，最后统一 `drain`，一轮只有一次系统调用

## 排错

| 现象 | 原因 |
|---|---|
| 浏览器打不开 `http://IP/` | `config.json` 的 SSID/密码不对，看串口有没有开热点 |
| 页面能开、存档不生效 | A 模式下页面是 https 而板子是 http，没带 `?api=` |
| `/ws` 连不上 | 端口被占，或房满了（`max_players` 默认 8） |
| 传完文件报 `MemoryError` | 整站模式文件系统太小，改用 A 模式 |
| 时间不对 | 板子没联网校时；存档版本号仍单调递增，不影响同步 |

## 文件

```
esp32/
├── main.py          # uasyncio：静态 + /api + /ws，一个端口
├── rooms.py         # 联机房间
├── wsproto.py       # WebSocket 握手与帧编解码（手写，无依赖）
├── arcade_core.py   # 账号 + 云存档（PC 与板子共用同一份）
├── tunnel.py        # 内网穿透客户端：出站 wss、多路复用、断线重连
└── config.py        # 配置，可被板子根目录的 config.json 覆盖
```

想在电脑上先验证，跑同一套代码：

```bash
python3 tools/board-sim.py          # http://127.0.0.1:8080
python3 tools/relay-sim.py          # 中继模拟器，代替 Cloudflare 那一端
```

数据在 `tools/.board-data/`，删掉即重置。
