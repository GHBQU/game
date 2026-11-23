# 游戏厅 · 小宇.GAY

十一个纯静态网页游戏的收录站。五套可切换视觉风格，无构建步骤、无打包依赖。账号和游戏进度存在自己的 Cloudflare Worker 上（`server/`），页面本身仍然是静态的。

## 五个游戏

| # | 游戏 | 说明 |
|---|------|------|
| 01 | IP, PLEASE | 像素剧情，静态镜像 |
| 02 | 暗夜幸存者 | 顶视角生存射击 |
| 03 | 纸片勇者 | 手绘纸片横版闯关，8 关 + 双人同屏 + 最多 4 人联机 |
| 04 | 超级卡丁车 8 | 浏览器 3D 竞速，20 赛道 / 4 杯赛 / 最多 8 人联机 |
| 05 | 深空幸存者 | 太空割草 Roguelite，11 武器 / 3 Boss / 星尘永久强化 |

### 联机怎么跑到公网

联机默认走 **Cloudflare Worker + Durable Object**，不用开小宇这台电脑：

1. 房间 WebSocket 在纸片勇者那个 Worker（`paper-hero.ghbqu.dpdns.org`）里；
   账号和存档在另一个 Worker（`arcade.ghbqu.dpdns.org`，源码在 `server/`）里。
2. 纸片勇者的固定地址写在 `games/paper-hero/js/cloud.js`；
   暗夜幸存者直接连同一个 Worker。
3. 本机 `tools/net_server.py` + 快速隧道只作为可选兜底，Cloudflare 正常时完全用不到。
4. Cloudflare 也不可用时，纸片勇者会退回旧的隧道地址；暗夜幸存者会提示联机服务离线。

## 视觉风格

报头下方有风格切换条，支持点击、`?style=` 参数、`1`–`5` 快捷键；选择存在 `localStorage`。

| 键 | 风格 | 说明 |
|---|------|------|
| `clean` | 简约 | 瑞士国际主义：白底墨黑、瑞士红、12 栏网格、发丝线、超大标题（默认） |
| `portal` | 门户 | 千禧年门户网站：蓝色渐变报头、跑马灯、468×60 广告位、访问计数器、建设中横幅、宋体、立体按钮 |
| `pixel` | 像素 | 深色底 + 青/洋红/黄、硬边描边字、扫描线、点阵背景、块状按钮 |
| `glitch` | 故障 | 近乎全黑、RGB 色差标题、噪点 + 扫描线覆盖层、等宽字、红色描边按钮 |
| `glass` | 液态 | Liquid Glass：流动彩色光斑背景、`backdrop-filter` 毛玻璃卡片、镜面高光跟随指针、弹簧回弹 |

实现方式：单一 DOM，通过 `html[data-style="…"]` 切换样式作用域，内容只维护一份。门户主题专属的装饰元素带 `.only-portal` 类，其他主题下隐藏。

`glass` 主题按 iOS Liquid Glass 的四个维度构建：透明度（半透明填充 + `blur(26px) saturate(180%)`）、立体感（顶部内高光 + 底部内阴影 + 环境投影）、动态反馈（`cubic-bezier(.34,1.4,.5,1)` 弹簧上浮、指针位置驱动 `--mx/--my` 镜面反射）、液态材质（`filter: blur(44px) saturate(150%)` 的缓慢流动光斑）。不支持 `backdrop-filter` 的浏览器会退化为 78% 不透明白底。

## 结构

```
.
├── index.html                    # 主页（五套样式全部内联）
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
    └── super-kart-8/
        ├── index.html            # 超级卡丁车 8 入口
        ├── css/  js/  lib/       # 相对路径引用，可直接静态托管
        └── README.md
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

1. 在 `games/` 下建目录，放入游戏文件（入口须为 `index.html`，用相对路径引用资源）。
2. 在主页 `index.html` 的 `<main class="list">` 里复制一个 `<a class="entry">` 块，改序号、标题、描述、标签与右侧信息。
3. 同步更新首屏 `<dl class="specs">` 里的收录数量与体积。

新增条目会自动套用四套风格，无需为每个主题单独写样式 —— 前提是沿用现有的类名（`.num` `.art` `.body` `.title` `.desc` `.tags` `.side` `.kv` `.go`）。

## 部署

分两块，互相独立：

**页面（GitHub Pages）**：分支 `main`，目录选 **根目录 `/`**（不要选 `/docs`）。

**账号与进度（Cloudflare Worker）**：源码在 `server/`，见 [server/README.md](server/README.md)。

```bash
cd server
npx wrangler deploy        # 部署到 arcade.ghbqu.dpdns.org
```

改完 `server/src/index.js` 记得重新 `deploy`，否则前端调的还是旧版本。
