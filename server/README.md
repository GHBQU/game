# 统一账号与进度服务

一个 Cloudflare Worker + 一个 Durable Object，管两件事：

1. **账号** —— 注册、登录、令牌、邀请码。所有游戏共用这一套，浏览器里只留令牌。
2. **进度** —— 按「账号 + 游戏」存一份 JSON 存档，换设备接着玩。

地址：`https://arcade.ghbqu.dpdns.org`（自定义域名，国内能直连；`arcade.wyc20141215.workers.dev` 也通）

## 为什么是 Durable Object

所有写操作汇到同一个实例，天然串行 —— 两台设备同时写同一个账号不会互相覆盖。
存储用 DO 自带的 SQLite，强一致，不用另外买数据库。

## 部署

```bash
cd server
npx wrangler deploy
```

首次部署前先登录一次：`npx wrangler login`。

需要在 Cloudflare 后台配一个管理员密钥（删账号、列账号要用）：

```bash
openssl rand -hex 16 | tee ~/.arcade-admin-key | npx wrangler secret put ADMIN_KEY
```

没配 `ADMIN_KEY` 时 `/api/admin/*` 一律 404，等于关闭。

## 接口

全部 `Content-Type: application/json`，CORS 放开（`*`）。令牌放 `?token=` 或 `Authorization: Bearer`。

### 账号

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/api/health` | — | 探活，顺便返回账号数 |
| POST | `/api/register` | `{name, password, invite}` | 注册并直接返回令牌 |
| POST | `/api/login` | `{name, password}` | 登录 |
| GET | `/api/me` | `?token=` | 核对会话 |
| POST | `/api/invite` | `{token, invite}` | 补邀请码 |
| POST | `/api/logout` | `{token}` | 注销令牌 |
| POST | `/api/password` | `{token, oldPassword, newPassword}` | 改密码，返回新令牌 |
| POST | `/api/migrate` | `{accounts:[{name, salt, hash, invited}]}` | 导入旧版浏览器账号 |

密码不存明文，也不存「可复用的口令哈希」：`PBKDF2-SHA256`，16 字节随机盐，12000 轮。

`/api/migrate` 是给旧版 `localStorage` 账号搬家的一次性通道：只收摘要，不收明文。
这些账号标记为 `algo: "arcade-v1"`，**下一次用原密码登录成功时自动升级成 PBKDF2**，用户无感。

### 进度

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/api/progress` | `?token=&game=` | 取一个游戏的存档 |
| POST | `/api/progress` | `{token, game, data, base}` | 写存档，`base` 是版本号（乐观锁） |
| GET | `/api/progress/list` | `?token=` | 列出这个账号有哪些游戏的存档 |
| GET | `/api/progress/all` | `?token=` | 一次取全部（换设备迁移用） |
| POST | `/api/progress/delete` | `{token, game}` | 删掉一个游戏的存档 |
| POST | `/api/progress/bulk` | `{token, items:{game:data}}` | 批量导入，已存在的跳过 |

`game` 只允许 `[a-z0-9_-]{0,32}`；单个存档上限 256 KB；一个账号最多 80 个游戏。

`data` 的结构由前端定，现在是 `{v:1, keys:{ "localStorage 键": "原始字符串" }}`。
`base` 对不上时返回：

```json
{ "ok": false, "code": "conflict", "updated": 1795431354941, "data": { "...": "..." } }
```

客户端收到冲突就先拉服务器那份，再决定是否刷新页面 —— 保证旧档不会盖掉新档。

### 管理

需要 `ADMIN_KEY`，否则 404。

| 方法 | 路径 | 参数 |
|---|---|---|
| POST | `/api/admin/list` | `{key}` |
| POST | `/api/admin/delete` | `{key, name}` |

`delete` 会连令牌和这个账号的所有存档一起删，**不可恢复**。

## 限额

| 项 | 值 |
|---|---|
| 账号数 | 300 |
| 令牌有效期 | 30 天（重新登录即续，同一账号只保留最新一条） |
| 单账号游戏存档 | 80 个 |
| 单个存档 | 256 KB |
| 请求体 | 512 KB |

全家用完全够；真的撞上了改文件顶部的常量再 `deploy`。

## 本地调试

```bash
cd server
npx wrangler dev            # 本地跑，数据在 .wrangler/ 里
```

前端要指向本地时，把 `index.html` 的 `<meta name="arcade-api">` 改成 `http://127.0.0.1:8787`。
