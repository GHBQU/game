# 游戏厅 · 小宇.GAY

十二款作品的游戏厅主页使用一套统一的目录界面，支持按类型筛选、即时搜索、收藏、最近浏览及随机推荐。无需构建步骤或运行时打包依赖。网页游戏账号、进度与联机服务仍沿用 `server/` 中的 Cloudflare Worker，也可以把静态站点部署到 ESP32-S3。

## 收录内容

游戏厅有 11 款静态网页游戏和 1 款 Android 下载项目。网页游戏打开即玩；下载项目是面向 UOS ARM64 的 Android 兼容运行包，需要单独的 Android 应用环境，不是原生 Linux 游戏。

| 类型 | 游戏 | 说明 |
|---|------|------|
| 剧情 / 模拟 | IP, PLEASE、IPO, PLEASE | 像素剧情、检查站模拟 |
| 生存挑战 | 暗夜幸存者、暗夜幸存者初代、深空幸存者、余烬守望 | 射击、生存、太空 Roguelite、像素远征 |
| 冒险闯关 | 纸片勇者、迷渊回响 | 手绘横版闯关、3D 迷宫与机关 |
| 竞速对战 | 超级卡丁车 8 | 浏览器 3D 竞速，20 赛道 / 最多 8 人联机 |
| 休闲生活 | 星野物语、星野农庄 | 像素沙盒、自由农庄生活 |
| 下载专区 | 60 秒！重制版 | 原 Android APK 的 UOS ARM64 兼容运行包；需要 Android 环境，尚未在 UOS 实机验证 |

运行包发布页：[GitHub Releases](https://github.com/GHBQU/game/releases/tag/60-seconds-uos-arm64-v1)。

### 联机在哪跑

联机优先走**局域网里的那块 ESP32**，板子不在线才退回 **Cloudflare Worker + Durable Object**：

| 顺序 | 地址 | 什么时候用 |
|---|---|---|
| 1 | `ws://<板子IP>/ws` | 同源打开页面（整站模式），或带 `?ws=` / `?server=` |
| 2 | `wss://board.ghbqu.dpdns.org/ws` | 在公网（4G/别处 WiFi），板子经隧道可达 |
| 3 | `wss://paper-hero.ghbqu.dpdns.org/ws` | 板子没通电、或隧道断了 |

同一个房间协议、同一套存档接口，所以哪个后端在线都能玩，进度也都在同一个账号下。
第二档是板子主动出站连 Cloudflare 中继，家里不需要公网 IP、也不需要电脑常开。
局域网这一档的实测延迟：空载 RTT 1–4ms，单条消息转发中位 1.14ms、p95 2.46ms，
八人房广播一轮 2.0ms —— 比绕公网低一个数量级。板子怎么烧、怎么传文件见 `esp32/README.md`。

云端这一档（板子不在时）：

1. 房间 WebSocket 在纸片勇者那个 Worker（`paper-hero.ghbqu.dpdns.org`）里；
   账号和存档在另一个 Worker（`arcade.ghbqu.dpdns.org`，源码在 `server/`）里。
2. 纸片勇者的固定地址写在 `games/paper-hero/js/cloud.js`；
   暗夜幸存者直接连同一个 Worker。
3. 本机 `tools/net_server.py` + 快速隧道只作为可选兜底，Cloudflare 正常时完全用不到。
4. Cloudflare 也不可用时，纸片勇者会退回旧的隧道地址；暗夜幸存者会提示联机服务离线。

## 游戏厅

- 单一视觉风格、原创主题插画封面与响应式游戏网格。
- 搜索匹配游戏名称、类型和关键词；筛选覆盖生存、冒险、竞速、剧情与生活，并可区分网页游戏和 UOS 下载。
- 收藏、最近浏览记录保存在当前浏览器；随机推荐只挑选当前筛选结果中的网页游戏。
- 分类、平台、收藏视图和搜索词写入查询参数，链接可分享并可恢复筛选状态。
- 账号、邀请码、开放时段和网页游戏门禁沿用 `arcade.js`。60 秒下载详情公开可读，不受网页游戏门禁拦截。
- `assets/covers/` 的封面是原创主题插画，不是实际游戏截图。

## 结构

```
.
├── index.html                    # 统一游戏厅主页与游戏目录
├── assets/                       # 首页 CSS、目录交互、账号界面与原创封面
├── arcade.js                     # 账号、邀请码、防沉迷时间窗、游戏页守卫（账号走服务端）
├── arcade-progress.js            # 云存档：各游戏存档键 ↔ 服务器双向同步
├── holidays.js                   # 法定节假日 / 调休上班日 / 寒暑假数据
├── server/                       # 统一账号与进度服务（Cloudflare Worker）
│   ├── src/index.js              #   账号 + 按游戏存的进度，Durable Object
│   ├── wrangler.toml
│   └── README.md
├── CNAME                         # 自定义域名 小宇.是.gay
├── .nojekyll                     # 关闭 Jekyll 处理
├── esp32/                        # 用 ESP32 自己当服务器（见 esp32/README.md）
│   ├── main.py                   #   WiFi + HTTP 服务 + 静态文件
│   ├── arcade_core.py            #   账号逻辑（MicroPython / CPython 通用）
│   └── README.md
├── tools/
│   ├── board-sim.py              # 板子模拟器（PC 上跑，路由与板子一致）
│   └── mock-server.py            # 纯接口模拟（不含静态文件）
└── games/
    ├── ip-please/                # IP, PLEASE（MIT，镜像自 ctnyanya）
    │   ├── index.html
    │   ├── assets.js  en.js  i18n.js  gfx.js  sfx.js
    │   ├── docs.js    data.js  booth.js  events.js  screens.js  main.js
    │   └── LICENSE
    ├── night-survivors/
    │   └── index.html            # 暗夜幸存者（单文件，v2 约 270 KB）
    ├── void-survivors/
    │   └── index.html            # 深空幸存者（单文件，太空割草）
    ├── paper-hero/               # 纸片勇者
    ├── super-kart-8/             # 超级卡丁车 8，资源按相对路径加载
    └── 60-seconds-reatomized/    # Android APK 的 UOS ARM64 兼容运行包详情
```

## 两种跑法

| | 账号存哪 | 进度存哪 | 谁提供页面 | 需要常开什么 |
|---|---|---|---|---|
| **GitHub Pages**（小宇.是.gay） | `arcade.ghbqu.dpdns.org` | 同一台服务器 | GitHub | 无（Cloudflare 免费额度） |
| **自己的 ESP32** | 板子 flash | 浏览器本机（板子还没实现进度接口，不跨设备） | 板子 | 只要板子 + 路由器 |

同一份 `index.html` 两边通用：`<meta name="arcade-api" content="https://arcade.ghbqu.dpdns.org">` 决定走哪台后端。ESP32 发站时会把这个 meta 改写成 `same-origin`，前端自动改调板子的 `/api/*`。详见 [esp32/README.md](esp32/README.md)。

> ESP32 方案只能局域网访问。想让公网访客用，必须有公网 IP + 端口映射，或一台常开的设备做隧道 —— 板子自己跑不了 cloudflared/ngrok 这类 Go 二进制。

## 账号与门禁

进游戏要过三道门：**已登录 → 填过邀请码 → 当前在开放时段**，任何一道没过都会弹窗说明原因。

### 账号

- 注册需要账号名 + 密码，邀请码可选。
- 账号存在统一账号服务器（`server/`，Cloudflare Worker + Durable Object），**浏览器里只留一个令牌**。
  密码用 `PBKDF2-SHA256`（随机盐，12000 轮）存摘要，明文既不落库也不落代码。
- 换设备、换浏览器、清缓存都不影响：同一个账号登回来，进度跟着回来。
- 浏览器 `localStorage` 里只有 `arcade.session.v1`（令牌 + 名字 + 邀请码状态，30 天有效）。

**一个账号，所有游戏通用。** 首页、纸片勇者、农场、暗夜幸存者……用的是同一套登录态，
不用在每个游戏里再注册一遍。

> 旧版浏览器账号（`arcade.accounts.v1`）会在第一次打开时自动搬到服务器，密码不变；
> 搬完后要重新登录一次，登录框会自动把原来的账号名填好。

### 邀请码

邀请码**不在源码里存明文**，`arcade.js` 顶部只有摘要表 `INVITE_DIGESTS`：

- 校验：先把输入去掉所有空白字符，再算 `sha256('arcade-invite-v1|' + 输入)`，与摘要表比对。
- 表里第二条是无 `crypto.subtle`（非 https / 老浏览器）时的兜底算法摘要。
- 界面上的输入框只有一个「请输入邀请码」占位符，不透露任何格式线索。

换邀请码：算出新摘要替换掉表里对应那条。

```js
// 在浏览器控制台里算（需 https 或 localhost）
crypto.subtle.digest('SHA-256', new TextEncoder().encode('arcade-invite-v1|' + 新邀请码))
  .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')));
```

> 前端那份摘要只做即时反馈、挡「翻源码直接抄」。真正的判定在服务端
> （`server/src/index.js` 的 `INVITE_DIGESTS`），改邀请码要同时改两处。

### 云存档

进度不再只躺在这台电脑上。`arcade-progress.js` 把每个游戏声明的存档键跟服务器对齐：

```html
<script src="../../arcade-progress.js"
        data-game="starfield-farm"
        data-keys="xingye_nongzhuang_save_v1"></script>
```

- **开局**：先拉服务器那一份。服务器更新就覆盖本机并自动刷一次页面；本机有没上传的改动就补传上去。
- **游玩中**：对这些键的写入会被拦下来，1.5 秒后自动同步；关页面时还会再补一枪。
- **换设备**：同一个账号登录，第一局前就把进度接回来。
- **没登录 / 连不上**：照常写本机，等下次登录自动补传，不会丢档。
- **防覆盖**：推送带版本号，别的设备已经写过就返回冲突，以服务器为准，避免旧档覆盖新档。
- **后端在哪**：默认 Cloudflare Worker；带 `?api=http://<板子IP>` 打开就改指向板子，记住之后刷新不用再带。板子发出的整站页面里，这一项已经是同源。
- **后端地址怎么认**：游戏页大多不加载 `arcade.js`（星野农庄就没加载），
  `arcade-progress.js` 自己判断走哪台服务器；老版本把 `arcade.api-mode` 写成过 `local`，
  只要浏览器里还有令牌，就会被自动纠正回服务器模式，不会因为一个过期标记就一直不同步。

已接入：星野物语、星野农庄、暗夜幸存者（含经典版）、深空幸存者、余烬守望、纸片勇者、
超级卡丁车 8、迷渊回响（只同步解锁层数与最佳成绩）、IP, PLEASE 与 IPO, PLEASE（语言选择）。
新增游戏只要加那一行 `<script>`，写法和键名对上就行。

**故意不同步的**：画质、静音这类跟设备性能绑的设置（`maze-quality` / `maze-muted`），
以及本机密码镜像 `paperhero.credentials.v1`、离线密钥、`arcade.api-mode`。
换一台设备不该把手机画质改成电脑画质。

覆盖前会先留底：本机这一份存进 `arcadeprog.backup.<game>`，
需要时在控制台 `ArcadeProgress.restoreBackup()` 就能装回去。

数据长这样（`GET /api/progress?token=…&game=starfield-farm`）：

```json
{ "ok": true, "game": "starfield-farm",
  "data": { "v": 1, "keys": { "xingye_nongzhuang_save_v1": "{\"day\":12}" } },
  "updated": 1795431354941 }
```

### 防沉迷时间窗

| 日子类型 | 可玩时段 |
|---|---|
| 法定节假日 / 寒暑假 / 周末 | 全天 |
| 上学日（含调休上班日） | `00:00–07:00`、`16:30–24:00` |
| 上学日的周一 / 周五 | 追加 `15:15–16:30` |
| 上学日的周二 | 追加 `15:15–17:30` |

判定优先级：**调休上班日 > 法定节假日 > 寒暑假 > 周末 > 工作日**。显式的调休上班日会盖过寒暑假区间，否则寒假里的「调休」永远不起作用。

规则写在 `arcade.js` 的 `windows()` 里，改那一处就能调。寒暑假区间在 `holidays.js` 的 `vacations`，各地校历不同，按自己学校改。

### 更新节假日

每年 11 月前后国务院会公布下一年安排，把新年度追加到 `holidays.js` 的 `years` 里即可。目前内置 **2026、2027** 两年（来源：国办发明电〔2025〕7号、2026-11-05 通知）。

某一年没有数据时，该年只按周末 / 寒暑假判断，工作日一律算上学日。

### 游戏页守卫

两个游戏的 `index.html` 顶部都注入了：

```html
<script src="../../holidays.js"></script>
<script>window.ARCADE_GUARD = true;</script>
<script src="../../arcade.js"></script>
```

未授权时直接访问游戏 URL 会被弹回 `/?locked=<原因>`，主页据此打开对应弹窗。新增游戏时记得也加上这三行。

## 本地预览

```bash
python3 -m http.server 8899
# 打开 http://127.0.0.1:8899/
```

直接双击 `index.html` 也能打开主页，但两个游戏建议走 http（部分浏览器对 `file://` 有额外限制）。

## 收录说明

| # | 游戏 | 类型 | 来源 | 许可 |
|---|------|------|------|------|
| 01 | IP, PLEASE · 请出示你的 IP | 剧情 / 模拟 / 像素 | [ctnyanya](https://github.com/ip-please/ip-please.github.io) | MIT |
| 02 | 暗夜幸存者 · Night Survivors | 生存 / Roguelite | wyc & DeepSeek | — |
| 04 | 超级卡丁车 8 · Super Kart 8 | 竞速 / 3D / 联机 | 本仓库 | 原创程序化生成 |

`IP, PLEASE` 为原仓库的静态镜像，仅保留运行时所需文件（去掉了 `media/`、`tools/` 与文档），并在页面左上角加了一个返回游戏厅的入口。当前同步到上游 `8a591a73`（2026-11-13，标题页与片尾加了传送门：续作、GitHub、B 站），游戏代码未做任何改动。原始版权与 MIT 许可见 `games/ip-please/LICENSE`。

## 新增游戏

1. 在 `games/` 下建目录，并准备相对路径可访问的 `index.html`。
2. 为游戏添加一张 640 × 360 的自包含 SVG 插画封面。
3. 在 `index.html` 的静态目录中添加名称、描述、类型、分类、平台和搜索关键词。
4. 网页游戏沿用原有账号门禁；公开下载详情链接标注 `data-access="public"`。
5. 本仓库没有构建步骤。运行页面语法与交互检查后，提交到 `main` 即会触发 GitHub Pages 部署。

## 部署

分两块，互相独立：

**页面（GitHub Pages）**：分支 `main`，目录选 **根目录 `/`**（不要选 `/docs`）。

**账号与进度（Cloudflare Worker）**：源码在 `server/`，见 [server/README.md](server/README.md)。

```bash
cd server
npx wrangler deploy        # 部署到 arcade.ghbqu.dpdns.org
```

改完 `server/src/index.js` 记得重新 `deploy`，否则前端调的还是旧版本。
