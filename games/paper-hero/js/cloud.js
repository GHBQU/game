/* 纸片勇者 — Cloudflare 服务器地址（固定，不会随隧道换址）
 * 部署 Worker 后把 workers.dev 地址填在这里；留空则继续走 endpoint.json / 本机服务。
 * 这个文件不参与 tunnel.py 的自动生成，避免换地址时被覆盖。
 */
(function (PH) {
  PH.Config = PH.Config || {};
  PH.Config.cloudUrl = 'https://paper-hero.ghbqu.dpdns.org';
})(window.PH);
