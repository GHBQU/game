/* 纸片勇者 — 联机地址配置（由 tools/tunnel.py 自动生成）
 *
 * 联机主服务器是 js/cloud.js 里的 Cloudflare Worker，常驻公网、不用本机开机。
 * 下面这些 GitHub 请求地址只在 Cloudflare 连不上时用来找可选的本机兜底服务。
 * 地址表由 tools/tunnel.py 更新；要换仓库 / 域名改「启动游戏.command」顶部配置区。
 */
(function (PH) {
  PH.Config = {
    endpointFeeds: ["https://raw.githubusercontent.com/GHBQU/game/main/games/paper-hero/endpoint.json", "https://cdn.jsdelivr.net/gh/GHBQU/game@main/games/paper-hero/endpoint.json", "https://github.com/GHBQU/game/raw/refs/heads/main/games/paper-hero/endpoint.json", "https://ghbqu.github.io/game/games/paper-hero/endpoint.json", "https://xn--29s3l.xn--0iv.gay/games/paper-hero/endpoint.json"],
    gameUrl: "https://xn--29s3l.xn--0iv.gay/games/paper-hero/",
    gameUrlAlt: "https://ghbqu.github.io/game/games/paper-hero/",
    repo: "GHBQU/game",
    branch: "main",
    endpointPath: "games/paper-hero/endpoint.json",
    updated: 1794146965360,
  };
})(window.PH);
