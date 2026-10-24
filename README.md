# 游戏厅 · 小宇.GAY

两个纯静态网页游戏的收录站。五套可切换视觉风格，无构建步骤、无依赖、无后端、无追踪。

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
├── index.html                    # 主页（单文件，四套样式全部内联）
├── CNAME                         # 自定义域名 小宇.gay
├── .nojekyll                     # 关闭 Jekyll 处理
└── games/
    ├── ip-please/                # IP, PLEASE（MIT，镜像自 ctnyanya）
    │   ├── index.html
    │   ├── assets.js  en.js  i18n.js  gfx.js  sfx.js
    │   ├── docs.js    data.js  booth.js  events.js  screens.js  main.js
    │   └── LICENSE
    └── night-survivors/
        └── index.html            # 暗夜幸存者（单文件 85 KB）
```

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

`IP, PLEASE` 为原仓库的静态镜像，仅保留运行时所需文件（去掉了 `media/`、`tools/` 与文档），并在页面左上角加了一个返回游戏厅的入口。原始版权与 MIT 许可见 `games/ip-please/LICENSE`。

## 新增游戏

1. 在 `games/` 下建目录，放入游戏文件（入口须为 `index.html`，用相对路径引用资源）。
2. 在主页 `index.html` 的 `<main class="list">` 里复制一个 `<a class="entry">` 块，改序号、标题、描述、标签与右侧信息。
3. 同步更新首屏 `<dl class="specs">` 里的收录数量与体积。

新增条目会自动套用四套风格，无需为每个主题单独写样式 —— 前提是沿用现有的类名（`.num` `.art` `.body` `.title` `.desc` `.tags` `.side` `.kv` `.go`）。

## 部署

GitHub Pages，分支 `main`，目录选 **根目录 `/`**（不要选 `/docs`）。
