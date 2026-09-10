# BFF 会话层设计（Phase 2）

> 状态：设计已按节与 owner 逐一确认（架构 / 组件 / 数据流 / 测试），待 spec 复审后进入实施计划。
> 前置：Phase 1（RR8 + Vite + Bun 迁移）与 `fix/backend-api-drift`（后端契约漂移修复 + 会话边界）已合入 `main` 并部署。
> 取代：`2026-09-04-rr8-vite-bun-migration-design.md` §11 中「阶段 2：BFF 数据层」的 pg + redis + Drizzle 方案（该 spec 已于 2026-09-09 修订为 SQLite）。

## 0. 一句话

浏览器只与 `huanvae.cn` 同源说话；alice 上的 Bun 服务端持有后端 token（SQLite 会话 + httpOnly cookie），经一个 Caddy 边缘 sidecar 以 mTLS / 无 `huanvae.cn` SNI 的方式代理 HTTP 与 WebSocket 到后端。**token 从此不出现在浏览器、localStorage 或 URL 里。**

## 1. 为什么现在做

三条独立证据，都来自 2026-09-07 ～ 09-09 的实测，不是推断：

1. **浏览器连不上后端 WS。** 线上控制台：`wss://api.huanvae.cn/ws?token=…` 每次握手失败，而同源 HTTP 能通。Tauri App 之所以正常，是它整套网络层（发现服务给 IP、连 IP 不发 SNI、钉私有 CA、内置客户端证书 mTLS、Rust 侧 socket）就是为绕开 `api.huanvae.cn` 的 ICP 拦截建的。浏览器一样都做不到。Web 要让 WS 通，只能由自己的服务端扮演 App 里 Rust 层的角色。
2. **token 在浏览器里是持续的税。** P4 系列打了五批（清盘 → 世代号 → 边界原语 → 采纳铺开 → 收尾）才把跨账号泄漏压住，收尾时仍有三条已知违反路径（`wsStore.scheduleReconnect` 的 await 续行、`ChatWindow` 里 await 之后的 `chatStore` 写入、`setAvatarUrl`/`setBackgroundUrl` 只守 `profile === null`）。这些全部是「会话状态归客户端所有」的衍生品。
3. **JWT 在 URL 里。** WS 用 `?token=` 传身份，一条控制台日志就打出两个完整 access token；它们会进代理日志、访问日志、浏览器历史。

后端只认 `Authorization: Bearer`（全部文档无任何 cookie 支持），所以把 token 挪出浏览器**只能**靠自己的服务端持有它。

## 2. 目标与非目标

**目标**
- 浏览器不再持有、发送或看见任何后端 token。
- WS 在浏览器里可用。
- CORS、ICP 拦截、`rewriteCanonicalApiOrigin` 这类补丁对浏览器不再存在（同源）。
- 删除 P4 系列中所有仅因「token 在客户端」而存在的机器。
- 本地开发与生产共用同一份边缘配置（Caddy 容器）。

**非目标（明确不做）**
- 前端自有数据存储（Postgres / Drizzle）：没有具体需求，不预架。
- Redis：单机单进程，SQLite 足够且重启不掉线。
- 发现协议（`ca.huanvae.cn/endpoints`）对接：第一版沿用与 Mac nginx 相同的硬编码 IP；IP 漂移被证实之后再接。
- Web 专用 mTLS 证书：第一版复用 App 的客户端证书（owner 决定），换证只是 Caddyfile 里两个路径。
- 跨标签页主动踢 WS 之外的任何「实时会话撤销」。
- 对 `models.ts`、`SettingsModal.tsx` 等已知遗留的顺手清理。

## 3. 架构与拓扑

```
浏览器 ──同源──▶ cloudflared ──▶ app (Bun.serve :3000) ──HTTP──▶ edge (Caddy :8787) ──mTLS──▶ 47.105.101.42:443
                                   │                                                     (备 47.104.231.235:443)
                                   ├─ 页面 / assets / sw.js（现状不变）
                                   ├─ POST /api/auth/login|logout    建/销会话（RR8 资源路由）
                                   ├─ POST /api/auth/register        不查会话的转发（未登录用户发起）
                                   ├─ GET  /api/session              「我登录了吗」（RR8 资源路由）
                                   ├─ /api/*                         cookie→bearer，流式转发（RR8 资源路由 catch-all）
                                   ├─ /avatars|user-file|friends-file|apps/*  透传，不查会话、不注入 bearer
                                   └─ /ws                            cookie→token 注入上游 query，双向管道（Bun.serve websocket）
                                   └─ sessions.sqlite（docker volume）
```

四个决定：

1. **`edge` 是 Caddy 容器，Caddyfile 进仓。** 出网的全部难点 —— mTLS、避开 `huanvae.cn` SNI、连接复用绕边缘的 1/8 RST、备用 IP、流式不缓冲 —— 由它承担；Bun 一行 TLS 代码不碰。`app` 与 `edge` 只在 docker 网络互通，对外仍只有 cloudflared 一个入口。
2. **浏览器不再知道 `api.huanvae.cn` 存在。** 构建期 `VITE_API_URL=''`、`VITE_WS_URL=''`，所有请求同源。后端回的绝对地址（预签名 `part_url` 等）经现有 `rewriteCanonicalApiOrigin` 落到同源，自然进入透传分支 —— 这条机制不改。
3. **两类代理严格分开。** `/api/*` 注入 `Authorization`；透传前缀**禁止**注入 —— 预签名请求带查询串签名，S3 校验拒绝再带 `Authorization`。透传不查会话（预签名自鉴权、头像公开可读），但仍经 `edge` 出去。
4. **会话存储是一个 SQLite 文件**，两个驱动一个接口：生产 `bun:sqlite`（`bun run server/index.ts`），开发 `node:sqlite`（`react-router dev` 的 bin 是 `#!/usr/bin/env node`，本机 Node 24.19 已验证 `node:sqlite` 可用）。

**本地开发拓扑**：`react-router dev`（Node）跑资源路由，上游指向 `docker compose up edge` 起的同一个 Caddy（compose override 只发布到 `127.0.0.1:8787`）；`/ws` 由 Vite `server.proxy` 接管，`proxyReqWs` 钩子从同一个 SQLite 文件读 token 注入。Mac 上 `~/.config/huanvae-edge/` 的 nginx 退役。与生产的唯一差别是 WS 的宿主（http-proxy vs Bun.serve）—— 帧处理都由平台完成，我们只共享「cookie → token」那一段。

### 3.1 nginx → Caddy 的对应关系

沿用的是 Mac 上那份已在真实边缘调通的 nginx 语义，逐条映射：

| nginx（已验证） | Caddy |
|---|---|
| `proxy_ssl_certificate` / `_key` | `tls_client_auth /secrets/app-client.cert.pem /secrets/app-client.key.pem` |
| `proxy_ssl_trusted_certificate` + `proxy_ssl_verify on` | `tls_trust_pool file /secrets/huanvae-ca.pem` |
| `proxy_ssl_server_name off` + `proxy_ssl_name huanvae-edge` | `tls_server_name huanvae-edge` —— **线上差异**：nginx 完全不发 SNI，Go 会把这个名字作为 SNI 发出。已记录 SNI=`huanvae-edge` 可通过拦截（只有 `huanvae.cn` 触发），但它是 Caddy 与已验证路径唯一不同的线上行为，进 §8 验收 |
| `proxy_http_version 1.1` | `versions 1.1`（限制到上游的 HTTP 版本；边缘对 h2 探测过回 401，App 也避开 h2） |
| `map $connection_upgrade` + 两条 `proxy_set_header` | Caddy 自动处理 WS 升级 |
| `upstream { keepalive 16 }` | `keepalive 60s` + `keepalive_idle_conns 16` + `keepalive_idle_conns_per_host 16` —— 连接复用是压住 1/8 RST 的机制，进 §8 验收 |
| `proxy_next_upstream error timeout http_502; tries 3` + `backup` | `lb_policy first` + `lb_retries 3` + `lb_try_duration 5s` + `fail_duration 30s` |
| `proxy_buffering off` / `proxy_request_buffering off` | Caddy 默认流式；`flush_interval -1` 保证 SSE 即时刷出 |
| `proxy_read_timeout 1h` | 上游读取默认无超时，不设 |
| `client_max_body_size 0` | Caddy 默认无 body 上限 |
| `@edge_down` 502 JSON | `handle_errors { respond … 502 }` |

### 3.2 Caddyfile（`edge/Caddyfile`）

```caddyfile
{
	admin off
	auto_https off
}

:8787 {
	reverse_proxy https://47.105.101.42:443 https://47.104.231.235:443 {
		lb_policy first
		lb_retries 3
		lb_try_duration 5s
		fail_duration 30s
		max_fails 1
		header_up Host api.huanvae.cn
		flush_interval -1
		transport http {
			tls_server_name huanvae-edge
			tls_trust_pool file /secrets/huanvae-ca.pem
			tls_client_auth /secrets/app-client.cert.pem /secrets/app-client.key.pem
			versions 1.1
			dial_timeout 10s
			keepalive 60s
			keepalive_idle_conns 16
			keepalive_idle_conns_per_host 16
		}
	}
	handle_errors {
		header Content-Type application/json
		respond `{"success":false,"code":502,"error":"BFF 到 Huanvae 边缘失败（重试已用尽），请重试"}` 502
	}
}
```

指令名已对照 Caddy 当前文档核过（`tls_trusted_ca_certs` 已被 `tls_trust_pool` 取代；`transport http` 无 `read_timeout`）。`versions` 在 Caddyfile 文档摘要与 JSON 字段说明间存在歧义，计划第一步用 `caddy adapt` 输出 JSON 确认它落在 `transport.http.versions`。

### 3.3 compose

```yaml
services:
  app:
    # 现有配置不变，新增：
    environment:
      BFF_UPSTREAM_HTTP: http://edge:8787
      BFF_UPSTREAM_WS: ws://edge:8787
      SESSION_DB_PATH: /data/sessions.sqlite
      SESSION_COOKIE_SECURE: "true"
    volumes: [sessions:/data]
    depends_on: [edge]          # 启动顺序；/healthz 不依赖 edge（后端挂了页面也要能开）
  edge:
    image: caddy:2-alpine        # 与 alice 上现有 gensokyo-caddy 同一 tag；首次部署后钉 digest
    volumes:
      - ./edge/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./secrets:/secrets:ro    # huanvae-ca.pem / app-client.cert.pem / app-client.key.pem，gitignore
    expose: ["8787"]
    restart: unless-stopped
volumes:
  sessions:
```

`docker-compose.override.yml`（本地开发，gitignore 或仅本地）：`edge` 加 `ports: ["127.0.0.1:8787:8787"]`。构建参数 `VITE_API_URL` / `VITE_WS_URL` 删除，构建期固定为 `''`。

## 4. 组件与接口

### 4.1 `server/session/store.ts` — 会话存储

```sql
CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,   -- ≥ 32 字节 CSPRNG 熵：两个 UUIDv4 去横线拼接，64 个 hex 字符（244 bit）
  user_id           TEXT NOT NULL,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,   -- 毫秒时间戳
  user_json         TEXT NOT NULL,      -- 登录响应里的用户快照 {user_id, nickname?, email?, avatar_url?, signature?}
  created_at        INTEGER NOT NULL,
  last_seen_at      INTEGER NOT NULL,
  user_agent        TEXT
);
CREATE INDEX sessions_last_seen ON sessions(last_seen_at);
```

`user_json` 只是**首帧快照**：`GET /api/session` 靠它回 `{user}` 而不必每次启动都打一次上游；完整资料仍由客户端现有的 `loadProfile()` 拉取并覆盖。快照里的 `avatar_url` 保持后端给的相对路径，客户端 `toAbsoluteApiUrl` 会把它落到同源 `/avatars/…`，正好进透传分支。

```ts
interface SessionStore {
  create(s: NewSession): Session
  get(id: string): Session | null
  /** CAS：仅当 access_expires_at 仍等于 expectedExpiresAt 时写入；返回是否写入 */
  updateTokens(id: string, expectedExpiresAt: number, next: TokenUpdate): boolean
  touch(id: string, now: number): void
  delete(id: string): void
  deleteExpired(before: number): number
}
```

驱动接缝 `openDatabase(path)`：`process.versions.bun` 存在则 `bun:sqlite` 的 `Database`，否则 `node:sqlite` 的 `DatabaseSync`；只使用两者交集 `prepare(sql).get / all / run`，`PRAGMA journal_mode=WAL`。同一组契约测试对两个驱动各跑一遍（§8）。

cookie：`hv_session=<id>; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`（30 天）；`Secure` 由 `SESSION_COOKIE_SECURE` 控制（生产 `true`，本地 http 关）。服务端行是真值，cookie 只是钥匙。

### 4.2 `server/session/refresh.ts` — 新鲜度保证

`ensureFreshAccessToken(store, sessionId): Promise<string>`

- 距 `access_expires_at` 不足 60 s 才动手，否则直接返回现有 token。
- **不在 SQLite 事务里跨网络调用。** 流程：读会话 → 打上游 `POST /api/auth/refresh` → `updateTokens(id, 读到的 expires_at, next)` 做 CAS → 返回 `false` 说明别的请求已先刷新，重读并使用其结果。
- 进程内再叠一层每会话单飞 `Map<sessionId, Promise>`：生产单进程下它就是唯一的并发入口；CAS 是开发环境（Vite 进程与 SSR 模块可能各持一份模块实例）的兜底。
- 上游响应解析沿用 `f3d7230` 确立的规则：`access_token` 与 `expires_in` 必有；`refresh_token` 缺席 → 沿用旧的，给了但不是非空字符串 → 形状错误。
- 上游 401 → `store.delete(id)`，抛 `SessionDead`。
- 上游 5xx / 网络失败 → 抛 `UpstreamUnavailable`，**会话保留**（传输失败 ≠ 会话结束，P4b 的规则，现在只写在这一处）。

### 4.3 资源路由（`src/app/routes/`，注册进 `routes.ts`）

| 路由 | 模块 | 职责 |
|---|---|---|
| `POST /api/auth/login` | `api.auth.login.ts`（action） | 转上游登录，`device_info` = 请求的 `User-Agent`；严格解析（access + refresh + expires_in 必有，用户字段可选）；建会话；`Set-Cookie`；回 `{success:true, code:200, data:{user}}`，**不含 token**。上游 401 → 原样透传后端文案，不设 cookie |
| `POST /api/auth/register` | `api.auth.register.ts`（action） | **不查会话**的纯转发。注册是未登录用户发起的，落进 `api/*` 的 catch-all 会被要求 cookie、一律 401，注册功能会彻底坏掉。注册**不建会话**：后端注册接口不返回 token（`auth` 文档 :20-27），成功后仍要走一次登录 |
| `POST /api/auth/logout` | `api.auth.logout.ts`（action） | 尽力打上游 logout（失败忽略）→ 删会话 → 关该会话名下所有活着的 WS → `Set-Cookie: hv_session=; Max-Age=0` |
| `GET /api/session` | `api.session.ts`（loader） | 有效会话（含 `ensureFresh`）→ `{success:true, code:200, data:{user}}`；否则 401 并清 cookie。**启动时「我登录了吗」的唯一真值** |
| `/api/*` | `api.$.ts`（loader + action） | 鉴权代理（§4.4） |
| `/avatars/*` `/user-file/*` `/friends-file/*` `/apps/*` | `passthrough.$.ts`（loader + action） | 透传代理（§4.5） |

`routes.ts` 里具体路由排在 `api/*` 之前；RR 的路由排序本身也优先精确匹配。`/api/auth/refresh` 从浏览器到达 catch-all 一律 **404** —— 刷新是 BFF 的事，客户端不得驱动它。

### 4.4 鉴权代理 `api.$.ts`

1. 无 `hv_session` cookie → 401。
2. 会话不存在 → 401 + 清 cookie。
3. `ensureFresh`：`SessionDead` → 删会话 + **关闭该会话名下的 WS** + 清 cookie + 401；`UpstreamUnavailable` → 502（BFF 自造响应体，见 §6 条目 2；会话与 cookie 都不动）。
4. 组装上游请求：`${BFF_UPSTREAM_HTTP}${pathname}${search}`；方法、body 流式转发（`request.body` + `duplex: 'half'`）；头**剥掉** hop-by-hop（`connection` `keep-alive` `transfer-encoding` `upgrade` `te` `trailer` `proxy-authorization` `proxy-connection`）、`cookie` / `host` / `authorization`（凭证只能由 BFF 注入），以及浏览器可伪造的来源头（`x-forwarded-for` `x-forwarded-host` `x-forwarded-proto` `x-forwarded-port` `x-real-ip` `forwarded` `via` —— Caddy 对 XFF 是追加而非替换，伪造值会作为链条首元素抵达源站；BFF 自己需要真实 IP 时只读 Cloudflare 覆写的 `cf-connecting-ip`，且**不**替上游合成 XFF）；**加** `Authorization: Bearer <token>`；`User-Agent` 原样转发。
5. 响应：状态码 + 头 + body 流式回传。头剥 hop-by-hop（`connection` `keep-alive` `transfer-encoding` `upgrade` `te` `trailer` `proxy-authenticate` `proxy-connection`）、上游的 `set-cookie`（会话由 BFF 全权管理），以及 **`content-encoding` 与 `content-length`**：`fetch` 在 Node 与 Bun 下都会透明解压上游 body 却把这两个头原样留下，转发出去就是「声称 gzip、长度是压缩前的、body 却是明文」，浏览器报 `ERR_CONTENT_DECODING_FAILED`。只剥请求侧的 `accept-encoding` 不够（运行时会自己补上），必须在响应侧剥，由运行时按实际 body 重新分帧。
6. 上游 **401**：端点在 `BUSINESS_401_ENDPOINTS` 内 → 原样透传、会话不动；否则视为会话死亡 → 删会话 + **关闭该会话名下的 WS** + 清 cookie + 原样回 401。「删会话 + 关 WS」是同一个 `killSession(store, id)`，登出 / 本条 / `SessionDead` 三处共用，不允许各自只做一半。
7. 上游 403 与其余 4xx/5xx → **原样透传，不碰会话**。后端用 403 表示普通权限拒绝，这是 P1 用「静默登出」换来的教训。
8. **不做「401 后刷新重试」。** 新鲜度在转发前保证；重试 = 重放非幂等请求，正是 P1b 修过的「重放改密请求」类 bug。

### 4.5 透传代理 `passthrough.$.ts`

与 4.4 的 4–5 步相同，但：不读 cookie、不查会话、**绝不设置 `Authorization`**。这是硬约束，测试用 `headers.has('authorization') === false` 断言在头对象本身上（不看序列化结果；**不能**用 `Object.hasOwn(headers, …)` —— `Headers` 的头不是自有属性，那个断言恒为 false、永远绿，本仓已在这类断言上栽过）。

### 4.6 WS 代理 `server/ws/proxy.ts` + `server/index.ts`

生产（`Bun.serve`）：
- `GET /ws` 且 `Upgrade: websocket` → cookie → 会话 → `ensureFresh` → 失败按 4.4 的 1–3 步回 HTTP 状态（浏览器侧表现为 close 1006）；成功 → `server.upgrade(req, { data: { sessionId, token } })`。
- `open`：`new WebSocket(\`${BFF_UPSTREAM_WS}/ws?token=${encodeURIComponent(token)}\`)`；登记到 `sessionId → Set<ws>`。
- 文本 / 二进制帧双向转发；浏览器侧 `close(code, reason)` → 以同一 code 关上游；上游侧关闭 → 经 `relayCloseCode` 映射后关浏览器侧：1000 原样（那是 `closeSessionSockets` 表达「会话结束、别重连」的码），3000–4999 与 1002–1014（除 1005/1006）原样，其余（1001 / 1005 / 1006 / 1015 …）→ **1011**。原因：1005/1006/1015 按协议不能作为关闭码发送，Bun 会把它们连同 1001 静默改写成 1000，而客户端 `wsStore` 对 1000/1001 明确不重连 —— 原样下发会把「上游掉线 / edge 重启」伪装成「正常关闭」，聊天连接静默死亡到用户刷新页面为止（Task 9 评审实测）。注销登记。
- `logout` / 会话删除 → 关闭该会话名下所有 WS（code 1000）。

开发（`vite.config.ts`）：`server.proxy['/ws'] = { target: BFF_UPSTREAM_WS, ws: true, configure(proxy) { proxy.on('proxyReqWs', …) } }`，钩子里用 `node:sqlite` **同步**读会话、把 `proxyReq.path` 改成 `/ws?token=…`。**诚实限制**：钩子是同步的，不能刷新；连接时 token 已过期则由上游握手 401 → 现有重连退避接管；而 `ChatPage` 挂载时的 `loadProfile()` 总会先经 4.4 把它刷新。

### 4.7 跨端共享 `src/lib/business401.ts`

`BUSINESS_401_ENDPOINTS`（当前只有 `PUT /api/profile/password`：旧密码错误返回 401，文档 `个人资料管理.md` §4）从 `apiClient.ts` 搬到这里，**BFF 与客户端都读它**。否则打错一次旧密码 = 被 BFF 删会话踢下线。

### 4.8 客户端改动

| 文件 | 改动 |
|---|---|
| `authStore.ts` | state 删 `accessToken / refreshToken / tokenExpiry`；`login/logout/register` 打同源 BFF；新增 `restoreSession()`（`GET /api/session`）；**删除** `refreshAccessToken`、`checkTokenExpiry`、`refreshInFlight`、`lastRotatedAt`、`clearCredentials`、`setTokens`；persist 只留 `user`（首帧秒开），`version` +1，迁移**主动删除**落盘的 token 字段并只输出 `{ user }`；`merge` 从盘上**只取 `user`**——盘上无论写着什么 `isAuthenticated` / token 都不进内存（存量用户的 v1 数据带着 `isAuthenticated: true`，zustand 默认 merge 会把它灌回来，让第一次冷加载完全不问 `/api/session`）。`restoreSession` 在 200 且 `user` 字段等价时保留原引用，避免依赖 `user` 的 effect 无谓重跑 |
| `authedFetch.ts` | 退化为 `fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } })`：删 `Authorization`、预检刷新、401 刷新重试、`pinSession`；**保留**默认 `Content-Type: application/json`（旧 `getAuthHeaders` 的另一半——全仓没有任何调用点自带它，删掉会让所有 JSON 写请求变成 `text/plain`，BFF 原样透传不兜）；401 → 不在 business-401 表内则 `clearAuth` + 跳登录。`apiClient.ts` 四个动词方法各自保留 30 s 超时（`AbortController`，与调用方 `signal` 合并），BFF 侧不设超时由 Caddy 兜（§2） |
| `wsStore.ts` | `new WebSocket('/ws')`（同源；协议由 `location.protocol` 推）；删「失败 3 次就刷 token」逻辑 |
| `ProtectedRoute.tsx` | 门槛从 persist 水合改为 `restoreSession()` 的结果；localStorage 里的 `user` 只用于首帧渲染，不作授权依据 |
| `sessionScope.ts` | **保留**登出清盘与 store 世代号（内存里的跨账号仍是真问题）；删 token 相关 reset 与 `auth-storage` 闸门特例 |
| `apiConfig.ts` | `getApiBaseUrl()` → `''`；`rewriteCanonicalApiOrigin` 落到同源；相关测试已习惯跟 `getApiBaseUrl()` 走 |
| `SettingsPage`「切换服务器」 | 移除；`huanvae.api-base-url` 设备键退役（迁移时删除） |
| `DevicesPage` 撤销当前设备 | 改为调 `authStore.logout()`（只清本地 state 的话 cookie 还在，刷新就又登回去） |
| `src/features/auth/api/auth.ts` | 删掉 `authApi.logout`——`getAuthApiUrl()` 变同源后它会构成第二条登出路径，且做不到删会话 / 清 cookie / 关 WS。`getDevices` / `revokeDevice` 保留，经 `/api/*` 代理正常工作 |
| `.env*` / `Dockerfile` / compose | 删 `VITE_API_URL` / `VITE_WS_URL`；新增 §3.3 四个服务端变量 |

## 5. 数据流

**登录**：`POST /api/auth/login {user_id, password}` → 转上游（`device_info` = UA）→ 严格解析 → 建会话 → `Set-Cookie` → `{data:{user}}`。上游 401 原样透传，不设 cookie。客户端成功后照旧 `beginSession()` 清上一账号的落盘。

**启动**：根布局挂载时调用一次 `restoreSession()`（模块级单飞：并发调用共享同一次请求，`ProtectedRoute` 自己的调用只是搭便车）→ `GET /api/session` → `{user}` 或 401。登录页 / 落地页读到的 `isAuthenticated` 因此也是真值，不再依赖落盘标志。**只有 401 意味着未登录**；502 / 网络失败（边缘或后端不可达）→ 保持上一次状态、`ProtectedRoute` 渲染带「重试」按钮的错误态（再调一次 `restoreSession()`），**不登出、不清盘** —— 后端挂了不等于用户退出了，这是 P4b 那条规则在客户端侧的镜像。

**鉴权请求**：§4.4。

**刷新**：只在鉴权请求或 WS 升级时惰性触发，距过期 < 60 s；无定时器、无后台任务。§4.2。

**登出**：`POST /api/auth/logout` → 上游尽力 → 删会话 → 关 WS → 清 cookie；客户端 `endSession()` 清盘、跳登录。

**WS**：只在 `restoreSession` 成功后连 `/ws`。上游因 access token 到期（15 min）关闭 → BFF 同 code 关浏览器侧 → 客户端重连 → 新升级里 `ensureFresh` 刷新 → 新上游连接。后端是否会在 token 到期时切断已建立的 WS 未知，两种情况都必须能活：不切就长连，切了就每 15 min 一次透明重连。

**会话过期**：`last_seen_at` 超 30 天的行在登录时惰性清理（`deleteExpired`，无 cron）。

## 6. 错误处理原则

BFF **不改写上游文案**：只要手里有一个上游响应（任何状态码），状态码 + body 一律原样回给浏览器。BFF 自造响应体的情形**只限于没有上游响应可引**的时刻，且穷举如下：

1. 会话失效 401（无 cookie / 会话不存在 / 刷新时上游 401）：`{"success":false,"code":401,"error":"会话已失效，请重新登录"}`，并清 cookie。
2. 上游不可达 502（刷新或登录时 fetch 抛错 / 刷新时上游 5xx / 登录响应形状坏）：`{"success":false,"code":502,"error":"后端暂时不可用，请稍后重试"}`。刷新端点的 5xx body 描述的是刷新那一次请求而不是浏览器发出的这一次，**不**转给浏览器。
3. 跨站写请求 403：`{"success":false,"code":403,"error":"跨站请求已被拒绝"}`（请求根本没发往上游）。
4. 请求体不合格 400（登录缺 `user_id` / body 不是合法 JSON）：`{"success":false,"code":400,"error":…}`（同上，没发往上游）。
5. `/api/auth/refresh` 从浏览器来 404（该端点对浏览器不存在）：`{"success":false,"code":404,"error":"该端点不对浏览器开放"}`。这一条只在 `api.$.ts` 里出现，写成字面量而不是助手。

转发链路上 edge 自己的 502 JSON（Caddy `handle_errors`）属于「有上游响应」，原样透传。

## 7. 安全边界

- **CSRF**：`SameSite=Lax` + 所有写操作是 JSON `fetch` 而非表单 → 跨站 POST 带不上 cookie；再加 `Sec-Fetch-Site: cross-site` 时拒绝非 GET（一行）。
- BFF **只**代理 §3 列出的六个前缀；其它路径落回 RR 路由 / 404。
- 会话 id ≥ 32 字节 CSPRNG 熵（两个 UUIDv4 拼接，64 hex）；cookie `HttpOnly`；生产 `Secure`。
- 私钥永不进仓：`secrets/` 在 `.gitignore`，alice 上 mode 600，由 owner 放置；本仓是公开仓库。
- `Authorization` 只在 4.4 注入，透传分支结构上不可达（独立模块、测试钉住）。
- 浏览器带来的 `authorization` / `cookie` 与来源头（`x-forwarded-*` `x-real-ip` `forwarded` `via`）在转发前一律剥掉：凭证只能由 BFF 注入，来源头交给上游会成为限流 / 审计 / 拼绝对 URL 时可被任意伪造的输入。
- `redirect: 'manual'`：BFF 不替浏览器追随上游 3xx（预签名下载常靠 302 的 `Location`；追随还会把 BFF 变成会追内网链接的出网客户端）。

## 8. 测试

**单元（vitest / Node）**：会话存储用 `node:sqlite` 跑全部契约用例；同一组用例另以 `bun test` 跑 `bun:sqlite` 驱动。刷新的 CAS 与进程内单飞（并发 N 次只打一次上游；CAS 失败重读）、cookie 序列化、hop-by-hop 剥离、`business401` 表、登录解析器、`refresh_token` 缺席沿用。

**资源路由（vitest + 假上游 `http.createServer`）**：bearer 注入；body 流式逐字节一致（上传大小 > 单个 chunk）；上游 401 → 会话删除且 `Set-Cookie` 清除；business-401 端点 401 会话不动；403 原样透传会话不动；`/api/auth/refresh` 404；透传前缀头对象上 `headers.has('authorization') === false` 且不读 cookie；`Sec-Fetch-Site: cross-site` 的 POST 被拒。

**WS 代理（假上游 WS）**：token 出现在上游 URL、不出现在浏览器侧任何地方；文本 / 二进制双向；close code 传递；无会话 → 401；logout 关闭该会话的 WS。

**客户端**：现有 827 条随改动收缩 —— authStore 删 token 用例、加 `restoreSession`；`authedFetch` 用例大幅减少；wsStore 断言 URL 为 `/ws` 且不含 `token`；`auth-storage` 迁移断言旧 token 字段被删除。

**E2E（Playwright，生产构建）**：`webServer` 数组新增一个**假后端 fixture**（Bun 脚本，实现 login / refresh / logout / profile / friends 最小契约与 `/ws` 回声），`server/index.ts` 的 `BFF_UPSTREAM_*` 指向它。登录 → cookie → 鉴权请求 → WS 升级整条链在真实构建产物上走通，不再依赖 `page.route()`。

**边缘验收（只能在 alice 上跑）**：脚本经 `http://edge:8787` 发 40 次串行 + 40 次并行未鉴权 `GET /api/friends`，**期望全部拿到后端的 401**（证明 mTLS 链路通）；非 401 计数即失败数。验收标准 **0 失败**，与 nginx 那次「修完 keepalive 后 40+40 全过」的基线一致。外加一次 `/ws` 握手探针（期望 HTTP 400 `missing field token`）。不过 → 调 Caddy transport 参数；仍不过 → 退回 nginx，接口是裸 HTTP，只改 compose 的 `edge` 服务。

**变异纪律**：与前序批次相同 —— 每条「钉住 X」的注释都必须由「删掉 X 时对应用例变红」证明；`not.toHaveBeenCalled` 类断言配正对照。

## 9. 上线步骤

1. 分支 `feat/bff-session`（已从 `main` 切出）。
2. owner 在 alice 建 `~/huanvae-frontend/secrets/`：`huanvae-ca.pem`、`app-client.cert.pem`、`app-client.key.pem`（600）。
3. `docker compose up -d edge` → 跑 §8 边缘验收 → 通过后才继续。
4. `docker compose up -d --build app`（新构建 `VITE_API_URL=''`）。
5. 切换即**所有人重登一次**：已开的旧标签页仍持旧 JS 直连后端，刷新后 `restoreSession` → 无 cookie → 登录页。`auth-storage` 迁移删除落盘 token。
6. 回滚：回退 `app` 到前一镜像；`edge` 可留。

## 10. 已知风险与开放问题

| 项 | 状态 |
|---|---|
| Caddy 发 SNI `huanvae-edge`（nginx 不发） | 已记录该 SNI 可通过拦截；§8 验收覆盖 |
| Go transport 连接复用能否像 nginx `keepalive 16` 一样压住边缘 1/8 RST | §8 验收覆盖；不过则调参或退回 nginx |
| `versions 1.1` 是否限制 HTTP 版本 | 计划第一步 `caddy adapt` 验证 |
| 后端会否在 access token 到期时切断已建立的 WS | 未知；两种情况都设计为可活 |
| 边缘 IP 漂移 | 与 Mac nginx 同样硬编码；`ca.huanvae.cn/endpoints` 可查，漂移证实后再接发现协议 |
| `lb_retries` 对带 body 的非幂等请求是否重试 | 第一版**不写** `lb_retry_match`，沿用 Caddy 默认（只在上游不可达、请求尚未发出时换台重试，这与 nginx 对非幂等方法的默认行为一致）。§8 验收若观察到 POST 被重放或该重试的没重试，再用 `lb_retry_match` 收紧 |
| P4 系列的三条已知违反路径 | `wsStore` 与 `ChatWindow` 那两条与 token 无关，本设计不解决，保留在待办；`setAvatarUrl`/`setBackgroundUrl` 同 |

## 10.1 spec 自审补记（2026-09-09，写实施计划时发现）

- **§4.3 的路由表原本漏了 `POST /api/auth/register`。** 它是未登录用户发起的请求，
  按原表会落进 `/api/*` 的 catch-all 并被要求会话 cookie —— 注册功能会彻底坏掉。
  已补为独立的、不查会话的转发路由。这条是实施计划的任务分解逼出来的：给 Task 6
  列文件清单时才发现 `RegisterForm` 的调用链没有落点。
- **`authApi.logout` 会变成第二条登出路径。** `getAuthApiUrl()` 改成同源之后它也会打到
  BFF 的 logout 路由，但它绕过 `authStore.logout` 的本地清理。已在 §4.8 标为删除。

## 11. 决策记录

- **SQLite 而非 Redis**（2026-09-09）：会话只需键值 + TTL + 刷新原子锁；单机单进程；Redis 默认配置重启即全员登出。
- **不做 PG / Drizzle**：无前端自有数据。
- **Caddy 而非 nginx**（owner 决定，2026-09-09）：更短、可 `caddy adapt` 机器校验、alice 上已在运行 Caddy、本地与生产同一容器。代价是 §10 前两条要在 alice 上实测；退路是换回 nginx 只动 compose 一个服务。
- **复用 App 客户端证书**（owner 决定）：换证只是两个文件路径。
- **全部请求走 BFF 而非仅 WS**（owner 决定）：否则 token 仍在浏览器、CORS 与 ICP 问题仍在、ticket 方案又回来，等于两次迁移。
- **不做 401 后刷新重试**：新鲜度在转发前保证；重试 = 重放非幂等请求。
- **透传分支不注入 Authorization**：S3 签名校验拒绝查询串签名与 `Authorization` 并存。
