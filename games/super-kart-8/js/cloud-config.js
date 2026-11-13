/* ============================================================
   Super Kart 8 — cloud-config.js
   WorkBuddy 云服务（workbuddy_cloud_service activate 返回的 publicConfig）
   只有这四个值可以出现在前端代码里；环境 id 与供应商密钥始终留在服务端。
   重新开通 / 迁移环境后需要把这里换成新的 publicConfig。

   officialUrl 不是密钥，只是「联机服务的注册域名」。OAuth Relay 会精确校验
   redirectTo 的 host，所以 GitHub Pages 等第三方域名无法完成登录；
   这些镜像站点会把登录入口指向这里（详见 netui.js）。
   ============================================================ */
window.SK_CLOUD_CONFIG = {
  resourceId: 'wbcs_qxnbX6mU8u3L2qBm217VPK',
  endpoint: 'https://super-kart-8.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_zMLFD7TYNNAEm1uGZltSAV_xlJ5KVefvBEUtxjONohTif3hF69cqqjw',
  officialUrl: 'https://super-kart-8.app.workbuddy.host/?sharecode=GU3UFJ4NK6'
};
