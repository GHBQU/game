# 游戏厅 · 小宇.GAY

两个纯静态网页游戏的收录站。瑞士国际主义风格主页，无构建步骤、无依赖、无后端、无追踪。

## 结构

```
.
├── index.html                    # 主页（单文件，样式内联）
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
| 02 | 暗夜幸存者 · Night Survivors | 生存 / Roguelite | 小宇 | — |

`IP, PLEASE` 为原仓库的静态镜像，仅保留运行时所需文件（去掉了 `media/`、`tools/` 与文档），并在页面左上角加了一个返回游戏厅的入口。原始版权与 MIT 许可见 `games/ip-please/LICENSE`。

## 新增游戏

1. 在 `games/` 下建目录，放入游戏文件（入口须为 `index.html`，用相对路径引用资源）。
2. 在主页 `index.html` 的 `<main>` 里复制一个 `<a class="entry">` 块，改序号、标题、描述、标签与右侧信息。
3. 同步更新首屏 `<dl class="specs">` 里的收录数量与体积。

## 部署

GitHub Pages，分支 `main`，目录选 **根目录 `/`**（不要选 `/docs`）。
