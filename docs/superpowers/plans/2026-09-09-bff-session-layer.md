# BFF 会话层实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 浏览器只与 `huanvae.cn` 同源通信；服务端持有后端 token（SQLite 会话 + httpOnly cookie），经 Caddy sidecar 以 mTLS 代理 HTTP 与 WebSocket 到后端。

**Architecture:** `edge`（Caddy 容器）承担出网的全部难点（mTLS、避开 `huanvae.cn` SNI、连接复用、备用 IP、流式）；`app`（Bun.serve + RR8 资源路由）承担会话与转发；会话落在一个 SQLite 文件。浏览器侧删除所有 token 状态。

**Tech Stack:** Bun 1.3.14 / React Router 8.3.1 资源路由 / Caddy 2-alpine / `bun:sqlite` + `node:sqlite` / vitest / Playwright

**Spec:** `docs/superpowers/specs/2026-09-09-bff-session-layer-design.md`

## Global Constraints

- **分支**：`feat/bff-session`（已从 `main` 切出，HEAD `03d62df`）。不切别的分支。
- **门禁**：`bunx tsc --noEmit` 0 错；`bun run lint` 0 错（**163 warnings / 22 infos 是基线，不得增加**）；`bun run test` 全绿。
- **e2e 只在最后一个任务跑**（Task 14）。中间任务不跑 `bun run test:e2e` —— 它 8–13 分钟、占用 3000/39471 端口，并发跑会互相污染。
- **不发明错误文案**：BFF 自己只产生三种响应（会话失效 401、`/api/auth/refresh` 404、`edge` 的 502 原样透传），其余全是上游原样。
- **解包路径不留兜底**：禁止 `|| []`、`?? ''`、`x.data ?? x`、`|| {}`，禁止用 `!` 代替校验。
- **注释宣称被钉住的规则必须真的被钉住**：本仓已发生六次「注释点名的错误、断言结构上测不到」。写下这类注释前先做变异、看着那条断言变红。`expect(spy).not.toHaveBeenCalled()` 在 spy 未接线时**平凡通过** —— 每条否定断言配一条同 act 内的正对照。
- **任何数字带作用域**：写变异计数就写清命令、范围、逐条枚举。本仓已有三次计数对不上。
- **跨文件引用锚符号名，不写行号**。
- **提交信息用中文，Conventional Commits**，结尾：`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **`secrets/` 永不入库**：私钥由 owner 手动放到 alice；本仓是公开仓库。
- 上游地址只从 `process.env.BFF_UPSTREAM_HTTP` / `BFF_UPSTREAM_WS` 读，**不硬编码 `api.huanvae.cn`**。

## File Structure

**新建 — 服务端（不进 SSR bundle，Bun 直接跑 / vitest 直接跑）**

| 文件 | 职责 |
|---|---|
| `server/session/sql.ts` | 建表与全部 SQL 语句字符串。**零 import**，供 bundle 内外与 `vite.config.ts` 共用同一份语句 |
| `server/session/db.ts` | 驱动接缝：`openDatabase(path)` → `bun:sqlite` 或 `node:sqlite`，只暴露 `prepare().get/all/run` 交集 |
| `server/session/store.ts` | `SessionStore`：`create/get/updateTokens/touch/delete/deleteExpired` |
| `server/session/cookie.ts` | `hv_session` 的序列化与解析 |
| `server/session/refresh.ts` | `ensureFreshAccessToken`、`SessionDead`、`UpstreamUnavailable` |
| `server/session/index.ts` | 单例 `getSessionStore()`（读 `SESSION_DB_PATH`） |
| `server/upstream.ts` | `upstreamHttp()` / `upstreamWs()` 读环境变量 |
| `server/proxy/forward.ts` | hop-by-hop 头剥离、上游请求/响应构造（纯函数 + 一个 fetch 包装） |
| `server/ws/proxy.ts` | 生产 WS 双向管道 + `sessionId → Set<ws>` 登记 |
| `edge/Caddyfile` | 出网配置 |
| `edge/probe.ts` | 边缘验收探针（只在 alice 上跑） |
| `tests/fixtures/fake-backend.ts` | e2e 用的假后端（Bun 脚本） |

**新建 — 客户端 / 路由（进 SSR bundle）**

| 文件 | 职责 |
|---|---|
| `src/lib/business401.ts` | `BUSINESS_401_ENDPOINTS` + 两个查询函数，BFF 与客户端共用 |
| `src/app/routes/api.auth.login.ts` | 资源路由：建会话 |
| `src/app/routes/api.auth.logout.ts` | 资源路由：销会话 |
| `src/app/routes/api.session.ts` | 资源路由：「我登录了吗」 |
| `src/app/routes/api.$.ts` | 资源路由：鉴权代理 |
| `src/app/routes/passthrough.$.ts` | 资源路由：透传代理 |

**修改**

| 文件 | 改动 |
|---|---|
| `vitest.config.ts` | `include` 增加 `server/**/__tests__/**/*.test.ts`；`exclude` 排除 `**/*.bun.test.ts` |
| `package.json` | 新增 `test:bun` 脚本 |
| `docker-compose.yml` | 新增 `edge` 服务、`sessions` 卷、`app` 的四个环境变量与 `depends_on` |
| `Dockerfile` | 删 `VITE_API_URL` / `VITE_WS_URL` 的 ARG/ENV |
| `.gitignore` | 新增 `secrets/` |
| `.env.example` | 删两个 VITE 变量，新增服务端四个 |
| `server/index.ts` | WS 升级分支 |
| `vite.config.ts` | `server.proxy['/ws']` |
| `src/app/routes.ts` | 注册六条资源路由 |
| `src/api/authedFetch.ts` | 退化为同源 fetch |
| `src/api/apiClient.ts` | `isBusiness401Endpoint` 改从 `business401.ts` 导入 |
| `src/features/auth/store/authStore.ts` | 删 token 状态，改 BFF 登录/登出，加 `restoreSession` |
| `src/features/auth/types/auth.ts` | `AuthState` 删 token 字段 |
| `src/store/wsStore.ts` | 连 `/ws`，删刷新逻辑 |
| `src/features/auth/components/ProtectedRoute.tsx` | 门槛改 `restoreSession()` |
| `src/lib/apiConfig.ts` | `getApiBaseUrl()` → `''` |
| `src/lib/sessionScope.ts` | 删 token 相关注释与 reset |
| `src/features/settings/components/SettingsPage.tsx` | 移除「切换服务器」 |
| `src/features/settings/components/DevicesPage.tsx` | 撤销当前设备改走 logout |
| `src/features/chat/components/ChatPage.tsx` | 挂载闸门改读 `isAuthenticated` |
| `src/features/chat/hooks/useRealtimeMessages.ts` | 同上 |
| `src/features/ai/components/AiChatPage.tsx` | 删 `Authorization` 头（同源 cookie） |
| `playwright.config.ts` | `webServer` 增加假后端 |

---

### Task 1: Caddy 边缘 sidecar

**Files:**
- Create: `edge/Caddyfile`
- Create: `edge/probe.ts`
- Modify: `docker-compose.yml`
- Modify: `.gitignore`
- Create: `docker-compose.override.yml.example`

**Interfaces:**
- Produces: docker 网络内的 `http://edge:8787`，把请求以 mTLS 转发到后端边缘。后续任务只通过 `BFF_UPSTREAM_HTTP` 使用它，不关心内部实现。

- [ ] **Step 1: 写 Caddyfile**

创建 `edge/Caddyfile`：

```caddyfile
# 出网层：把 BFF 的裸 HTTP 请求转成「mTLS + 不带 huanvae.cn SNI」的请求打到后端边缘。
#
# 为什么需要这一层：api.huanvae.cn 在阿里云被 ICP 备案拦截——边缘会被动读明文 SNI，
# 携带 huanvae.cn 的 TLS ClientHello 直接 RST。可行路径是连 IP 字面量（或用
# huanvae-edge 这个名字），钉私有 CA，并出示客户端证书（后端边缘 nginx 开了
# ssl_verify_client）。这些浏览器一件都做不到，所以必须由服务端做。
#
# 本文件是 ~/.config/huanvae-edge/nginx.conf 那份**已在真实边缘调通**的配置的逐条移植，
# 对应关系写在 spec §3.1。每一条都对应一次实际故障，改动前先读那张表。
{
	admin off
	auto_https off
}

:8787 {
	reverse_proxy https://47.105.101.42:443 https://47.104.231.235:443 {
		# 主备而非轮询：第二个 IP 是同集群兜底，不是用来分流的
		lb_policy first
		lb_retries 3
		lb_try_duration 5s
		fail_duration 30s
		max_fails 1

		# 上游按 Host 路由，也按 Host 签发预签名 URL——必须是逻辑域名
		header_up Host api.huanvae.cn

		# SSE 与分片上传要即时刷出，不缓冲
		flush_interval -1

		transport http {
			# 只用于校验边缘证书，不能是 huanvae.cn——那个名字会触发拦截
			tls_server_name huanvae-edge
			tls_trust_pool file /secrets/huanvae-ca.pem
			tls_client_auth /secrets/app-client.cert.pem /secrets/app-client.key.pem
			# 边缘对 h2 探测过回 401，App 也避开 h2
			versions 1.1
			dial_timeout 10s
			# 连接复用是压住边缘「新建连接约 1/8 被 RST」的机制，不是性能优化
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

- [ ] **Step 2: 用 `caddy adapt` 验证语法，并确认 `versions` 落在哪**

Run:
```bash
cd /Users/i/Code/huanvae/frontend && docker run --rm -v "$PWD/edge/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy adapt --config /etc/caddy/Caddyfile 2>&1 | tail -40
```

Expected: 输出 JSON，无 error。在 JSON 里确认三件事，**任一不符就停下改配置**：
1. `versions` 出现在 `handler.transport.versions`（证明它是上游 HTTP 版本，不是 TLS 版本）
2. `tls_client_auth` 落成 `transport.tls.client_certificate_file` / `client_certificate_key_file`
3. `tls_server_name` 落成 `transport.tls.server_name`

把这三条的实际 JSON 路径记进 `edge/Caddyfile` 顶部注释（spec §10 的开放问题之一）。

- [ ] **Step 3: 写边缘验收探针**

创建 `edge/probe.ts`：

```ts
/**
 * 边缘验收探针 —— 只在 alice 上、`edge` 容器起来之后跑。
 *
 * 判据：未鉴权请求应当拿到**后端的 401**（`{"success":false,"code":401,...}`）。
 * 拿到 401 就证明整条链路通了：TLS 握手成功、客户端证书被接受、Host 路由正确、
 * 请求真的到了 Rust 后端。任何非 401（连接错误、502、超时）都是失败。
 *
 * 40 串行 + 40 并行的形状来自 nginx 那次实测：边缘对**新建**的 mTLS 连接约有
 * 1/8 会 RST，而复用已有连接的请求从不失败。并发那一组就是在压这个行为。
 * nginx 加上 keepalive 之后是 40+40 全过（之前 10%~25% 失败），这里用同一个基线。
 *
 * 用法：bun run edge/probe.ts [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://edge:8787'
const PATH = '/api/friends'

async function once(i: number): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}${PATH}`)
    if (res.status === 401) return null
    return `#${i} 状态码 ${res.status}（期望 401）`
  } catch (error) {
    return `#${i} ${error instanceof Error ? error.message : String(error)}`
  }
}

const serial: (string | null)[] = []
for (let i = 0; i < 40; i++) serial.push(await once(i))

const parallel = await Promise.all(Array.from({ length: 40 }, (_, i) => once(40 + i)))

const failures = [...serial, ...parallel].filter((x): x is string => x !== null)

// WS 握手：不带 token 时后端回 HTTP 400 `missing field token`（已实测记录）。
// 拿到 400 说明升级请求真的到了后端，而不是被边缘或 Caddy 挡下。
let wsNote = ''
try {
  const res = await fetch(`${BASE}/ws`, {
    headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' },
  })
  wsNote = `WS 握手状态码 ${res.status}（期望 400 missing field token）`
} catch (error) {
  wsNote = `WS 握手失败：${error instanceof Error ? error.message : String(error)}`
}

console.warn(`串行 40 + 并行 40：失败 ${failures.length} / 80`)
for (const f of failures.slice(0, 10)) console.warn('  ', f)
console.warn(wsNote)
process.exit(failures.length === 0 ? 0 : 1)
```

- [ ] **Step 4: compose 里加 edge 服务与 sessions 卷**

修改 `docker-compose.yml`：在 `app` 服务的 `environment` 块末尾（`VITE_APP_VERSION: ${VITE_APP_VERSION}` 之后）追加四行，并在 `app` 内加 `volumes` 与 `depends_on`；在 `cloudflared` 之后加 `edge` 服务；把文件末尾那段注释掉的 `# 阶段 2 启用 / # volumes: pgdata redisdata` **替换**为真实的 `volumes: sessions:`。

`app` 内追加：
```yaml
      # BFF：上游只指 docker 网络内的 edge，绝不出现 api.huanvae.cn
      BFF_UPSTREAM_HTTP: http://edge:8787
      BFF_UPSTREAM_WS: ws://edge:8787
      SESSION_DB_PATH: /data/sessions.sqlite
      SESSION_COOKIE_SECURE: "true"
    volumes:
      - sessions:/data
    depends_on:
      - edge
```

⚠️ `app` 原来没有 `depends_on`，而 `cloudflared` 有 `depends_on: app: condition: service_healthy`。这里给 `app` 加的是不带 condition 的启动顺序依赖 —— **不能**用 `service_healthy`：`edge` 是纯代理，没有健康检查端点，而且**后端挂了页面也必须能开**（`/healthz` 不依赖 `edge`）。

新增服务：
```yaml
  edge:
    # 与 alice 上已在运行的 gensokyo-caddy 同一 tag。首次部署验证通过后钉 digest。
    image: caddy:2-alpine
    volumes:
      - ./edge/Caddyfile:/etc/caddy/Caddyfile:ro
      # huanvae-ca.pem / app-client.cert.pem / app-client.key.pem
      # 由 owner 手动放置（mode 600），永不入库——本仓是公开仓库
      - ./secrets:/secrets:ro
    expose: ["8787"]
    restart: unless-stopped
```

文件末尾：
```yaml
volumes:
  sessions:
```

- [ ] **Step 5: gitignore 与本地 override 示例**

`.gitignore` 在 `# Misc` 段的 `*.pem` 之后追加：
```
# mTLS 客户端证书与私钥，由 owner 手动放置，永不入库
secrets/
```

创建 `docker-compose.override.yml.example`：
```yaml
# 本地开发：把 edge 发布到宿主机，让 `react-router dev`（跑在容器外）能打到它。
# 用法：cp docker-compose.override.yml.example docker-compose.override.yml
#      docker compose up -d edge
# 然后 .env.development.local 里 BFF_UPSTREAM_HTTP=http://127.0.0.1:8787
#
# 只绑 127.0.0.1，不绑 0.0.0.0：这个端口背后是一条持证的 mTLS 出网通道，
# 不能对局域网开放。
services:
  edge:
    ports:
      - "127.0.0.1:8787:8787"
```

`.gitignore` 追加 `docker-compose.override.yml`。

- [ ] **Step 6: 验证 compose 可解析**

Run: `cd /Users/i/Code/huanvae/frontend && docker compose config >/dev/null && echo OK`
Expected: `OK`（`secrets/` 目录不存在时 compose config 仍可解析；真正 `up` 之前 owner 会创建它）

- [ ] **Step 7: 提交**

```bash
git add edge/ docker-compose.yml docker-compose.override.yml.example .gitignore
git commit -m "$(cat <<'EOF'
feat(edge): 加 Caddy 出网 sidecar，移植已验证的 mTLS 配置

api.huanvae.cn 被 ICP 备案拦截（边缘被动读明文 SNI 后 RST），可行路径是连 IP、
钉私有 CA、出示客户端证书——浏览器一件都做不到，必须由服务端做。本配置是
~/.config/huanvae-edge/nginx.conf 那份已在真实边缘调通的配置的逐条移植，
对应关系见 spec §3.1；keepalive 不是性能优化，是压住边缘对新建连接约 1/8
RST 的机制。

caddy adapt 已确认 versions / tls_client_auth / tls_server_name 三项落在预期的
JSON 路径上，结论记在 Caddyfile 顶部。边缘验收探针 edge/probe.ts 只在 alice 上跑，
基线与 nginx 那次一致（串行 40 + 并行 40，0 失败）。

secrets/ 与 docker-compose.override.yml 加入 gitignore：私钥由 owner 手动放置，
本仓是公开仓库。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 会话存储（SQLite，双驱动）

**Files:**
- Create: `server/session/sql.ts`
- Create: `server/session/db.ts`
- Create: `server/session/store.ts`
- Create: `server/session/__tests__/storeContract.ts`
- Create: `server/session/__tests__/store.test.ts`
- Create: `server/session/__tests__/store.bun.test.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `SESSION_SCHEMA_SQL`、`SESSION_SELECT_BY_ID_SQL`（`server/session/sql.ts`，零 import，`vite.config.ts` 也要用）
  - `openDatabase(path: string): Promise<SqliteLike>`（`server/session/db.ts`）
  - `type Session = { id, userId, accessToken, refreshToken, accessExpiresAt, user, createdAt, lastSeenAt, userAgent }`
  - `createSessionStore(db: SqliteLike): SessionStore`，`SessionStore` 含 `create/get/updateTokens/touch/delete/deleteExpired`

- [ ] **Step 1: 写 SQL 常量（零 import）**

创建 `server/session/sql.ts`：

```ts
/**
 * 会话表的全部 SQL。**本文件不允许有任何 import。**
 *
 * 原因：这些语句有两个消费方，且它们不能共用同一个 sqlite 驱动 ——
 * 一是 `server/session/db.ts`（运行时按 Bun / Node 动态选驱动），
 * 二是 `vite.config.ts` 的 `server.proxy['/ws']` 钩子（Vite 的 proxyReqWs 是
 * **同步**回调，读不了异步打开的 store，只能自己用 node:sqlite 同步查一次）。
 * 把语句提到这里，两边共用同一份字符串，避免「两处各写一遍 SELECT、日后改一边
 * 忘了另一边」这种分叉。
 */

export const SESSION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,
  user_json         TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  last_seen_at      INTEGER NOT NULL,
  user_agent        TEXT
);
CREATE INDEX IF NOT EXISTS sessions_last_seen ON sessions(last_seen_at);
`

export const SESSION_INSERT_SQL = `
INSERT INTO sessions
  (id, user_id, access_token, refresh_token, access_expires_at, user_json, created_at, last_seen_at, user_agent)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`

export const SESSION_SELECT_BY_ID_SQL = `SELECT * FROM sessions WHERE id = ?`

/**
 * CAS 更新：只有 access_expires_at 仍等于读到的旧值时才写入。
 *
 * 为什么是 CAS 而不是事务：刷新要跨网络调上游，绝不能把网络 I/O 关在 SQLite
 * 事务里。并发两个请求同时发现临期时，两者都会打上游，但只有一个能写进来；
 * 输的那个重读、用赢的那份 token。
 */
export const SESSION_UPDATE_TOKENS_CAS_SQL = `
UPDATE sessions
   SET access_token = ?, refresh_token = ?, access_expires_at = ?, last_seen_at = ?
 WHERE id = ? AND access_expires_at = ?
`

export const SESSION_TOUCH_SQL = `UPDATE sessions SET last_seen_at = ? WHERE id = ?`
export const SESSION_DELETE_SQL = `DELETE FROM sessions WHERE id = ?`
export const SESSION_DELETE_EXPIRED_SQL = `DELETE FROM sessions WHERE last_seen_at < ?`
```

- [ ] **Step 2: 写驱动接缝**

创建 `server/session/db.ts`：

```ts
import { SESSION_SCHEMA_SQL } from './sql'

/** `bun:sqlite` 与 `node:sqlite` 的交集，只用这三个方法 */
export interface SqliteLike {
  prepare(sql: string): {
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    run(...params: unknown[]): { changes?: number | bigint }
  }
  exec(sql: string): void
  close(): void
}

/**
 * 变量说明符 + `@vite-ignore`：**故意**让 Rolldown 无法静态分析这两个 import。
 *
 * 路由模块（`src/app/routes/api.$.ts` 等）会经本文件间接引到 sqlite，而它们进的是
 * SSR bundle。写成静态 `import { Database } from 'bun:sqlite'` 的话，
 * `react-router dev`（其 bin 是 `#!/usr/bin/env node`，跑在 Node 下）在构建
 * 依赖图时就会去解析 `bun:sqlite` 并失败。反过来写死 `node:sqlite`，生产的 Bun
 * 运行时又拿不到最优实现。用变量说明符把解析推到运行时，两端各取所需。
 */
const runtimeImport = (specifier: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ specifier)

/** Bun 与 Node 的 sqlite 类名不同，构造后的实例形状才是一致的 */
export async function openDatabase(path: string): Promise<SqliteLike> {
  const isBun = typeof process !== 'undefined' && Boolean(process.versions?.bun)
  const mod = await runtimeImport(isBun ? 'bun:sqlite' : 'node:sqlite')
  const Ctor = (isBun ? mod.Database : mod.DatabaseSync) as new (p: string) => SqliteLike

  const db = new Ctor(path)
  // WAL：读写不互斥。生产是单进程，但 dev 下 Vite 进程与 SSR 模块可能各持一份连接。
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(SESSION_SCHEMA_SQL)
  return db
}
```

- [ ] **Step 3: 写失败的契约测试（runner 无关）**

创建 `server/session/__tests__/storeContract.ts`：

```ts
import type { SessionStore } from '../store'

export interface ContractCase {
  name: string
  run(store: SessionStore, expect: (actual: unknown) => { toBe(v: unknown): void; toEqual(v: unknown): void }): void
}

const USER = { user_id: 'alice', nickname: '爱丽丝' }

function seed(store: SessionStore, id: string, expiresAt: number) {
  return store.create({
    id,
    userId: 'alice',
    accessToken: `AT-${id}`,
    refreshToken: `RT-${id}`,
    accessExpiresAt: expiresAt,
    user: USER,
    now: 1_000,
    userAgent: 'probe',
  })
}

/**
 * 同一组用例跑两个驱动：vitest（node:sqlite）与 bun test（bun:sqlite）。
 * 生产跑在 Bun 上，只测 Node 驱动的话，两者的行为分叉会直接进生产。
 */
export const SESSION_STORE_CONTRACT: ContractCase[] = [
  {
    name: 'create 之后 get 拿回同一行，user 是反序列化后的对象',
    run(store, expect) {
      seed(store, 's1', 9_000)
      const got = store.get('s1')
      expect(got?.accessToken).toBe('AT-s1')
      expect(got?.accessExpiresAt).toBe(9_000)
      expect(got?.user).toEqual(USER)
    },
  },
  {
    name: 'get 不存在的 id 返回 null，不抛错',
    run(store, expect) {
      expect(store.get('nope')).toBe(null)
    },
  },
  {
    name: 'updateTokens：期望值匹配时写入并返回 true',
    run(store, expect) {
      seed(store, 's2', 9_000)
      const ok = store.updateTokens('s2', 9_000, { accessToken: 'AT2', refreshToken: 'RT2', accessExpiresAt: 20_000, now: 2_000 })
      expect(ok).toBe(true)
      expect(store.get('s2')?.accessToken).toBe('AT2')
      expect(store.get('s2')?.accessExpiresAt).toBe(20_000)
    },
  },
  {
    name: 'updateTokens：期望值不匹配时返回 false 且一个字节都不改（CAS 输的那一方）',
    run(store, expect) {
      seed(store, 's3', 9_000)
      const ok = store.updateTokens('s3', 8_999, { accessToken: 'LOSER', refreshToken: 'LOSER', accessExpiresAt: 30_000, now: 2_000 })
      expect(ok).toBe(false)
      // 正对照在上一条：期望值对时确实写得进去。这里断言的是「没写进去」
      expect(store.get('s3')?.accessToken).toBe('AT-s3')
      expect(store.get('s3')?.accessExpiresAt).toBe(9_000)
    },
  },
  {
    name: 'delete 之后 get 返回 null',
    run(store, expect) {
      seed(store, 's4', 9_000)
      store.delete('s4')
      expect(store.get('s4')).toBe(null)
    },
  },
  {
    name: 'deleteExpired 只删 last_seen_at 早于阈值的行，返回删除条数',
    run(store, expect) {
      seed(store, 'old', 9_000)
      seed(store, 'fresh', 9_000)
      store.touch('fresh', 5_000)
      const removed = store.deleteExpired(3_000)
      expect(removed).toBe(1)
      expect(store.get('old')).toBe(null)
      expect(store.get('fresh')?.id).toBe('fresh')
    },
  },
]
```

创建 `server/session/__tests__/store.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { createSessionStore, type SessionStore } from '../store'
import { SESSION_STORE_CONTRACT } from './storeContract'

describe('SessionStore（node:sqlite 驱动）', () => {
  let store: SessionStore

  beforeEach(async () => {
    // :memory: 每个用例一份，用例间零共享
    store = createSessionStore(await openDatabase(':memory:'))
  })

  for (const c of SESSION_STORE_CONTRACT) {
    it(c.name, () => {
      c.run(store, expect as never)
    })
  }
})
```

- [ ] **Step 4: 运行测试确认失败**

先扩 vitest 的收集范围，否则 `server/` 下的测试**根本不会被跑到**（现有 `include` 只有 `src/**`）。修改 `vitest.config.ts` 的 `test` 块：

```ts
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    // server/ 下是 BFF 的服务端代码，不在 src/ 里。漏掉这一条的话
    // server/**/__tests__ 会被静默跳过——测试文件存在、也全绿、但一条都没跑。
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'server/**/__tests__/**/*.test.ts'],
    // *.bun.test.ts 由 `bun test` 跑（它们 import bun:sqlite，Node 下必然失败）。
    // 上面的 *.test.ts 会匹配到它们，必须显式排除。
    exclude: ['**/node_modules/**', '**/*.bun.test.ts'],
  },
```

Run: `cd /Users/i/Code/huanvae/frontend && bun run test server/session 2>&1 | tail -15`
Expected: FAIL —— `Cannot find module '../store'`（`store.ts` 还没写）

- [ ] **Step 5: 写最小实现**

创建 `server/session/store.ts`：

```ts
import type { SqliteLike } from './db'
import {
  SESSION_DELETE_EXPIRED_SQL,
  SESSION_DELETE_SQL,
  SESSION_INSERT_SQL,
  SESSION_SELECT_BY_ID_SQL,
  SESSION_TOUCH_SQL,
  SESSION_UPDATE_TOKENS_CAS_SQL,
} from './sql'

/** 登录响应里的用户快照。只用于首帧渲染，完整资料仍由客户端 loadProfile() 拉 */
export interface SessionUser {
  user_id: string
  nickname?: string
  email?: string
  avatar_url?: string
  signature?: string
}

export interface Session {
  id: string
  userId: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  user: SessionUser
  createdAt: number
  lastSeenAt: number
  userAgent: string | null
}

export interface NewSession {
  id: string
  userId: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  user: SessionUser
  now: number
  userAgent: string | null | undefined
}

export interface TokenUpdate {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  now: number
}

export interface SessionStore {
  create(s: NewSession): Session
  get(id: string): Session | null
  /** CAS：仅当 access_expires_at 仍等于 expectedExpiresAt 时写入。返回是否写入 */
  updateTokens(id: string, expectedExpiresAt: number, next: TokenUpdate): boolean
  touch(id: string, now: number): void
  delete(id: string): void
  deleteExpired(before: number): number
}

interface Row {
  id: string
  user_id: string
  access_token: string
  refresh_token: string
  access_expires_at: number
  user_json: string
  created_at: number
  last_seen_at: number
  user_agent: string | null
}

function toSession(row: Row): Session {
  return {
    id: row.id,
    userId: row.user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    accessExpiresAt: Number(row.access_expires_at),
    // 这一行由 create() 写入、只可能是它序列化出来的 JSON。解析失败意味着
    // 表被外部改坏了，抛错是对的——不写 `?? {}` 兜底：那会让「会话里没有用户」
    // 变成一个看不见的状态，正是这个项目一直在消灭的形态。
    user: JSON.parse(row.user_json) as SessionUser,
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
    userAgent: row.user_agent,
  }
}

export function createSessionStore(db: SqliteLike): SessionStore {
  return {
    create(s) {
      db.prepare(SESSION_INSERT_SQL).run(
        s.id, s.userId, s.accessToken, s.refreshToken, s.accessExpiresAt,
        JSON.stringify(s.user), s.now, s.now, s.userAgent ?? null,
      )
      return {
        id: s.id, userId: s.userId, accessToken: s.accessToken, refreshToken: s.refreshToken,
        accessExpiresAt: s.accessExpiresAt, user: s.user,
        createdAt: s.now, lastSeenAt: s.now, userAgent: s.userAgent ?? null,
      }
    },

    get(id) {
      const row = db.prepare(SESSION_SELECT_BY_ID_SQL).get(id) as Row | undefined | null
      // bun:sqlite 返回 null，node:sqlite 返回 undefined——归一成 null
      return row ? toSession(row) : null
    },

    updateTokens(id, expectedExpiresAt, next) {
      const result = db.prepare(SESSION_UPDATE_TOKENS_CAS_SQL).run(
        next.accessToken, next.refreshToken, next.accessExpiresAt, next.now, id, expectedExpiresAt,
      )
      return Number(result.changes ?? 0) === 1
    },

    touch(id, now) {
      db.prepare(SESSION_TOUCH_SQL).run(now, id)
    },

    delete(id) {
      db.prepare(SESSION_DELETE_SQL).run(id)
    },

    deleteExpired(before) {
      return Number(db.prepare(SESSION_DELETE_EXPIRED_SQL).run(before).changes ?? 0)
    },
  }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd /Users/i/Code/huanvae/frontend && bun run test server/session 2>&1 | tail -8`
Expected: PASS，6 条用例

- [ ] **Step 7: 加 bun:sqlite 驱动的同套用例**

创建 `server/session/__tests__/store.bun.test.ts`：

```ts
/**
 * 同一组契约跑 bun:sqlite 驱动。生产运行时是 Bun，只测 node:sqlite 的话，
 * 两个驱动的行为分叉（`changes` 的类型、`get()` 未命中时返回 null 还是 undefined）
 * 会直接进生产。
 *
 * 由 `bun test` 跑，不由 vitest 跑（vitest 在 Node 下，import bun:sqlite 必然失败）；
 * vitest.config.ts 的 exclude 已排除 *.bun.test.ts。
 */
import { beforeEach, describe, expect, it } from 'bun:test'
import { openDatabase } from '../db'
import { createSessionStore, type SessionStore } from '../store'
import { SESSION_STORE_CONTRACT } from './storeContract'

describe('SessionStore（bun:sqlite 驱动）', () => {
  let store: SessionStore

  beforeEach(async () => {
    store = createSessionStore(await openDatabase(':memory:'))
  })

  for (const c of SESSION_STORE_CONTRACT) {
    it(c.name, () => {
      c.run(store, expect as never)
    })
  }
})
```

`package.json` 的 `scripts` 里，在 `"test:watch"` 之后加一行：
```json
    "test:bun": "bun test server",
```

- [ ] **Step 8: 运行 bun test 确认双驱动都过**

Run: `cd /Users/i/Code/huanvae/frontend && bun run test:bun 2>&1 | tail -8`
Expected: PASS，6 条用例

- [ ] **Step 9: 变异验证 CAS 真的被钉住**

把 `store.ts` 的 `updateTokens` 里 `expectedExpiresAt` 参数删掉、改用无条件 UPDATE（`SESSION_UPDATE_TOKENS_CAS_SQL` 换成不带 `AND access_expires_at = ?` 的语句）。

Run: `bun run test server/session 2>&1 | tail -6` 与 `bun run test:bun 2>&1 | tail -6`
Expected: 两个 runner 各有 **1 条**红 —— 「期望值不匹配时返回 false 且一个字节都不改」。观察后**还原**。

- [ ] **Step 10: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests "`
Expected: tsc 0 错；lint 0 errors / 163 warnings / 22 infos；单测总数 = 827 + 6

```bash
git add server/session vitest.config.ts package.json
git commit -m "$(cat <<'EOF'
feat(session): SQLite 会话存储，双驱动同一组契约

生产跑 Bun、`react-router dev` 跑 Node，两个 sqlite 驱动的类名与「未命中返回
null 还是 undefined」「changes 的类型」都不同，所以同一组契约用例跑两遍：
vitest 打 node:sqlite，bun test 打 bun:sqlite。只测一个驱动等于让分叉直接进生产。

db.ts 用变量说明符 + @vite-ignore 让 Rolldown 无法静态分析这两个 import：
路由模块进 SSR bundle，写死 bun:sqlite 会让 dev（Node）构建依赖图时就失败，
写死 node:sqlite 生产又拿不到最优实现。

刷新用 CAS 而不是事务：跨网络的刷新调用绝不能关在 SQLite 事务里。并发两方都会
打上游，只有一方写得进来，输的那方重读用赢的那份。变异验证：去掉 CAS 条件后
两个 runner 各红 1 条。

SQL 语句提到零 import 的 sql.ts：Vite 的 proxyReqWs 是同步回调，读不了异步打开的
store，dev 的 WS 钩子只能自己同步查一次，两边共用同一份语句以免分叉。

vitest 的 include 原本只有 src/**，server/**/__tests__ 会被静默跳过——测试存在、
全绿、一条都没跑。一并扩上，并排除由 bun test 接管的 *.bun.test.ts。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: cookie、上游地址与刷新

**Files:**
- Create: `server/session/cookie.ts`
- Create: `server/upstream.ts`
- Create: `server/session/refresh.ts`
- Create: `server/session/index.ts`
- Create: `server/session/__tests__/cookie.test.ts`
- Create: `server/session/__tests__/refresh.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `SessionStore`、`Session`、`createSessionStore`、`openDatabase`
- Produces:
  - `SESSION_COOKIE_NAME = 'hv_session'`、`serializeSessionCookie(id)`、`clearSessionCookie()`、`readSessionId(request)`
  - `upstreamHttp(): string`、`upstreamWs(): string`
  - `class SessionDead extends Error`、`class UpstreamUnavailable extends Error`
  - `ensureFreshAccessToken(store, session): Promise<string>`
  - `getSessionStore(): Promise<SessionStore>`

- [ ] **Step 1: 写失败的 cookie 测试**

创建 `server/session/__tests__/cookie.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { SESSION_COOKIE_NAME, clearSessionCookie, readSessionId, serializeSessionCookie } from '../cookie'

describe('会话 cookie', () => {
  it('序列化带上 HttpOnly / Path / SameSite / Max-Age', () => {
    const v = serializeSessionCookie('abc', { secure: false })
    expect(v.startsWith(`${SESSION_COOKIE_NAME}=abc;`)).toBe(true)
    expect(v).toContain('HttpOnly')
    expect(v).toContain('Path=/')
    expect(v).toContain('SameSite=Lax')
    expect(v).toContain('Max-Age=2592000')
  })

  it('secure 为真时带 Secure，为假时不带（本地 http 下带了浏览器会整条丢弃）', () => {
    expect(serializeSessionCookie('abc', { secure: true })).toContain('Secure')
    expect(serializeSessionCookie('abc', { secure: false })).not.toContain('Secure')
  })

  it('清除用 Max-Age=0 且值为空', () => {
    const v = clearSessionCookie({ secure: false })
    expect(v).toContain(`${SESSION_COOKIE_NAME}=;`)
    expect(v).toContain('Max-Age=0')
  })

  it('从请求头里读出 id，和别的 cookie 混在一起也能读对', () => {
    const req = new Request('http://x/', { headers: { cookie: `theme=dark; ${SESSION_COOKIE_NAME}=xyz; other=1` } })
    expect(readSessionId(req)).toBe('xyz')
  })

  it('没有 cookie 头、或没有这一项时返回 null', () => {
    expect(readSessionId(new Request('http://x/'))).toBe(null)
    expect(readSessionId(new Request('http://x/', { headers: { cookie: 'theme=dark' } }))).toBe(null)
  })

  it('不会把 hv_session_other 这种前缀相同的项误读成会话 id', () => {
    const req = new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE_NAME}_other=nope` } })
    expect(readSessionId(req)).toBe(null)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/i/Code/huanvae/frontend && bun run test server/session/__tests__/cookie.test.ts 2>&1 | tail -6`
Expected: FAIL —— `Cannot find module '../cookie'`

- [ ] **Step 3: 写 cookie 实现**

创建 `server/session/cookie.ts`：

```ts
export const SESSION_COOKIE_NAME = 'hv_session'

/** 30 天。cookie 的 Max-Age 只是钥匙的寿命，服务端那一行才是真值 */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export interface CookieOptions {
  /** 生产必须为 true；本地 http 下必须为 false，否则浏览器整条丢弃 */
  secure: boolean
}

function attributes(opts: CookieOptions, maxAge: number): string {
  // SameSite=Lax：跨站 POST 带不上 cookie（本项目所有写操作都是 JSON fetch，
  // 不是表单），这是 CSRF 的第一道；第二道是 api.$.ts 里对
  // Sec-Fetch-Site: cross-site 的非 GET 请求直接拒绝。
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function serializeSessionCookie(id: string, opts: CookieOptions): string {
  return `${SESSION_COOKIE_NAME}=${id}; ${attributes(opts, MAX_AGE_SECONDS)}`
}

export function clearSessionCookie(opts: CookieOptions): string {
  return `${SESSION_COOKIE_NAME}=; ${attributes(opts, 0)}`
}

export function readSessionId(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    // 必须整名相等：`hv_session_other=…` 不能被 startsWith 之类误读成会话 id
    if (pair.slice(0, eq).trim() !== SESSION_COOKIE_NAME) continue
    const value = pair.slice(eq + 1).trim()
    return value === '' ? null : value
  }
  return null
}

export function cookieOptionsFromEnv(): CookieOptions {
  return { secure: process.env.SESSION_COOKIE_SECURE === 'true' }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun run test server/session/__tests__/cookie.test.ts 2>&1 | tail -6`
Expected: PASS，6 条

- [ ] **Step 5: 写上游地址模块**

创建 `server/upstream.ts`：

```ts
/**
 * 上游地址只从环境变量读，**绝不硬编码 api.huanvae.cn**。
 *
 * 生产：`http://edge:8787` / `ws://edge:8787`（docker 网络内的 Caddy sidecar）。
 * 本地：`http://127.0.0.1:8787` / `ws://127.0.0.1:8787`（compose override 发布出来的同一个容器）。
 * e2e：指向 `tests/fixtures/fake-backend.ts`。
 *
 * 缺失时直接抛错，不回退到任何默认值：一个悄悄指错地方的 BFF 比起不来的 BFF 难查得多。
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量 ${name}——BFF 不知道该把请求转到哪里`)
  }
  return value.replace(/\/+$/, '')
}

export const upstreamHttp = (): string => required('BFF_UPSTREAM_HTTP')
export const upstreamWs = (): string => required('BFF_UPSTREAM_WS')
```

- [ ] **Step 6: 写失败的刷新测试**

创建 `server/session/__tests__/refresh.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db'
import { SessionDead, UpstreamUnavailable, ensureFreshAccessToken, resetRefreshInFlight } from '../refresh'
import { createSessionStore, type SessionStore } from '../store'

const NOW = 1_000_000

function seed(store: SessionStore, expiresAt: number) {
  return store.create({
    id: 's1', userId: 'alice', accessToken: 'AT-old', refreshToken: 'RT-old',
    accessExpiresAt: expiresAt, user: { user_id: 'alice' }, now: NOW, userAgent: null,
  })
}

const okRefresh = (access: string, refresh?: string) =>
  new Response(
    JSON.stringify({ success: true, code: 200, data: { access_token: access, token_type: 'Bearer', expires_in: 900, ...(refresh ? { refresh_token: refresh } : {}) } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

describe('ensureFreshAccessToken', () => {
  let store: SessionStore
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    store = createSessionStore(await openDatabase(':memory:'))
    resetRefreshInFlight()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('距过期还很远时一个请求都不发，直接返回现有 token', async () => {
    const s = seed(store, NOW + 10 * 60_000)
    const token = await ensureFreshAccessToken(store, s)
    expect(token).toBe('AT-old')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('距过期不足 60 秒时刷新，新 token 写进库', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(okRefresh('AT-new', 'RT-new'))

    const token = await ensureFreshAccessToken(store, s)

    // 正对照：上一条证明「远离过期时确实不发」，这条证明「临期时确实发了」
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(token).toBe('AT-new')
    expect(store.get('s1')?.refreshToken).toBe('RT-new')
    expect(store.get('s1')?.accessExpiresAt).toBe(NOW + 900_000)
  })

  it('上游不回 refresh_token 时沿用旧的（2026-09-09 线上实测形状）', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(okRefresh('AT-new'))

    await ensureFreshAccessToken(store, s)

    expect(store.get('s1')?.accessToken).toBe('AT-new')
    expect(store.get('s1')?.refreshToken).toBe('RT-old')
  })

  it('并发调用只打一次上游（进程内单飞）', async () => {
    const s = seed(store, NOW + 30_000)
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    fetchMock.mockImplementation(() => gate.then(() => okRefresh('AT-new', 'RT-new')))

    const all = Promise.all([1, 2, 3, 4, 5].map(() => ensureFreshAccessToken(store, s)))
    release()
    const tokens = await all

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tokens).toEqual(['AT-new', 'AT-new', 'AT-new', 'AT-new', 'AT-new'])
  })

  it('CAS 输掉时用赢家的 token，不覆盖它', async () => {
    const s = seed(store, NOW + 30_000)
    // 模拟「别人先刷完了」：上游返回之前，库里已经被改成另一对
    fetchMock.mockImplementation(async () => {
      store.updateTokens('s1', NOW + 30_000, { accessToken: 'AT-winner', refreshToken: 'RT-winner', accessExpiresAt: NOW + 900_000, now: NOW })
      return okRefresh('AT-loser', 'RT-loser')
    })

    const token = await ensureFreshAccessToken(store, s)

    expect(token).toBe('AT-winner')
    expect(store.get('s1')?.accessToken).toBe('AT-winner')
  })

  it('上游 401：删会话并抛 SessionDead', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: 401, error: 'Token 无效或已过期' }), { status: 401 }))

    await expect(ensureFreshAccessToken(store, s)).rejects.toBeInstanceOf(SessionDead)
    expect(store.get('s1')).toBe(null)
  })

  it('上游 502：抛 UpstreamUnavailable，会话保留（传输失败 ≠ 会话结束）', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response('{"code":502}', { status: 502 }))

    await expect(ensureFreshAccessToken(store, s)).rejects.toBeInstanceOf(UpstreamUnavailable)
    expect(store.get('s1')?.accessToken).toBe('AT-old')
  })

  it('网络失败：抛 UpstreamUnavailable，会话保留', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    await expect(ensureFreshAccessToken(store, s)).rejects.toBeInstanceOf(UpstreamUnavailable)
    expect(store.get('s1')?.accessToken).toBe('AT-old')
  })

  it('响应形状坏（缺 expires_in）：抛 UpstreamUnavailable，不当成会话结束', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, code: 200, data: { access_token: 'AT-new' } }), { status: 200 }))

    await expect(ensureFreshAccessToken(store, s)).rejects.toBeInstanceOf(UpstreamUnavailable)
    expect(store.get('s1')?.accessToken).toBe('AT-old')
  })
})
```

- [ ] **Step 7: 运行确认失败**

Run: `bun run test server/session/__tests__/refresh.test.ts 2>&1 | tail -6`
Expected: FAIL —— `Cannot find module '../refresh'`

- [ ] **Step 8: 写刷新实现**

创建 `server/session/refresh.ts`：

```ts
import { upstreamHttp } from '../upstream'
import type { Session, SessionStore } from './store'

/** 后端明确说凭证不认（401）。会话已死，必须删。 */
export class SessionDead extends Error {
  constructor() {
    super('会话已失效，请重新登录')
    this.name = 'SessionDead'
  }
}

/**
 * 上游不可达 / 5xx / 响应形状坏。**会话保留。**
 *
 * 这条分档来自 P4b 的教训：此前刷新失败一律 clearAuth，一次网络抖动就销毁用户
 * 自己敲进去的第三方 API Key（只有他知道、应用无从恢复）。两侧代价不对称
 * （清少了泄露、清多了毁数据），所以只有后端**真的**说凭证不认才算会话结束。
 */
export class UpstreamUnavailable extends Error {
  constructor(cause?: unknown) {
    super('后端暂时不可用，请稍后重试')
    this.name = 'UpstreamUnavailable'
    this.cause = cause
  }
}

/** 距过期不足这个时长才刷新。没有定时器、没有后台任务——只在有请求经过时惰性触发 */
const REFRESH_WINDOW_MS = 60_000

/**
 * 每会话单飞。生产是单进程，这就是唯一的并发入口；dev 下 Vite 进程与 SSR 模块
 * 可能各持一份模块实例，那时靠 store 的 CAS 兜底。
 */
let inFlight = new Map<string, Promise<string>>()

/** 仅供测试：清掉单飞表，避免用例间互相串 */
export function resetRefreshInFlight(): void {
  inFlight = new Map()
}

interface RefreshPayload {
  access_token: string
  refresh_token?: string
  expires_in: number
}

/**
 * 解析规则与客户端 authStore 的 refreshTokenPayload 一致（见 commit f3d7230）：
 * `refresh_token` **缺席是合法形状**，语义是「这次没轮换」。
 * 2026-09-09 线上实测：/api/auth/refresh 只回
 * `{access_token, token_type: 'Bearer', expires_in: 900}`。此前把缺席当形状错误，
 * 导致每次刷新都以登出收场。
 */
function parseRefresh(body: unknown): RefreshPayload {
  const envelope = body as { data?: unknown } | null
  const data = (envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : body) as Record<string, unknown> | null
  if (!data || typeof data !== 'object') throw new Error('刷新响应不是对象')

  const accessToken = data.access_token
  if (typeof accessToken !== 'string' || accessToken === '') throw new Error('access_token 缺失或不是非空字符串')

  const refreshToken = data.refresh_token
  if (refreshToken !== undefined && (typeof refreshToken !== 'string' || refreshToken === '')) {
    throw new Error('refresh_token 给了但不是非空字符串')
  }

  const expiresIn = data.expires_in
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) {
    throw new Error('expires_in 缺失或不是有限数字')
  }

  return { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn }
}

async function performRefresh(store: SessionStore, session: Session): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${upstreamHttp()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    })
  } catch (error) {
    throw new UpstreamUnavailable(error)
  }

  if (response.status === 401) {
    store.delete(session.id)
    throw new SessionDead()
  }
  if (!response.ok) throw new UpstreamUnavailable(`上游 ${response.status}`)

  let parsed: RefreshPayload
  try {
    parsed = parseRefresh(await response.json())
  } catch (error) {
    // 形状坏不是「凭证不认」：删会话会把一个还能用的登录态误杀
    throw new UpstreamUnavailable(error)
  }

  const now = Date.now()
  const next = {
    accessToken: parsed.access_token,
    // 缺席 → 沿用旧的。形状仍受上面校验（给了却不是非空字符串照抛）
    refreshToken: parsed.refresh_token ?? session.refreshToken,
    accessExpiresAt: now + parsed.expires_in * 1000,
    now,
  }

  const won = store.updateTokens(session.id, session.accessExpiresAt, next)
  if (won) return next.accessToken

  // CAS 输了：别人已经刷完并写进去了。用赢家那份，绝不覆盖。
  const current = store.get(session.id)
  if (!current) throw new SessionDead()
  return current.accessToken
}

export async function ensureFreshAccessToken(store: SessionStore, session: Session): Promise<string> {
  if (session.accessExpiresAt - Date.now() > REFRESH_WINDOW_MS) {
    return session.accessToken
  }

  const existing = inFlight.get(session.id)
  if (existing) return existing

  const promise = performRefresh(store, session).finally(() => {
    // 只清自己那一格：晚到的结算不能抹掉后来者的槽位
    if (inFlight.get(session.id) === promise) inFlight.delete(session.id)
  })
  inFlight.set(session.id, promise)
  return promise
}
```

- [ ] **Step 9: 运行确认通过**

Run: `bun run test server/session/__tests__/refresh.test.ts 2>&1 | tail -8`
Expected: PASS，9 条

- [ ] **Step 10: 写会话单例**

创建 `server/session/index.ts`：

```ts
import { openDatabase } from './db'
import { createSessionStore, type SessionStore } from './store'

export { SESSION_COOKIE_NAME, clearSessionCookie, cookieOptionsFromEnv, readSessionId, serializeSessionCookie } from './cookie'
export { SessionDead, UpstreamUnavailable, ensureFreshAccessToken } from './refresh'
export type { Session, SessionStore, SessionUser } from './store'

/**
 * 进程内单例。第一次调用时打开数据库并建表。
 *
 * 缓存的是 Promise 而不是解析后的 store：并发的首次调用会共享同一次打开过程，
 * 不会各开一个连接、各建一次表。
 */
let storePromise: Promise<SessionStore> | null = null

export function getSessionStore(): Promise<SessionStore> {
  if (!storePromise) {
    const path = process.env.SESSION_DB_PATH
    if (!path) throw new Error('缺少环境变量 SESSION_DB_PATH——会话无处存放')
    storePromise = openDatabase(path).then(createSessionStore)
  }
  return storePromise
}

/** 仅供测试：丢掉单例，让下一次调用重新打开 */
export function resetSessionStore(): void {
  storePromise = null
}
```

- [ ] **Step 11: 变异验证三条最容易退化的规则**

依次做以下三个变异，每次跑 `bun run test server/session 2>&1 | tail -6`，观察后**还原**：

| 变异 | 期望 |
|---|---|
| `performRefresh` 的 `!response.ok` 分支改成 `store.delete(session.id); throw new SessionDead()` | 「上游 502」与「网络失败」中至少「502」那条红 |
| `refreshToken: parsed.refresh_token ?? session.refreshToken` 改成 `parsed.refresh_token as string` | 「上游不回 refresh_token 时沿用旧的」红 |
| `ensureFreshAccessToken` 去掉单飞（每次都新建 promise） | 「并发调用只打一次上游」红 |

三条都必须**恰好**红对应那条。任何一条没红就说明断言测不到它宣称的规则，**先修测试再继续**。

- [ ] **Step 12: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun run test:bun 2>&1 | tail -4`

```bash
git add server/session server/upstream.ts
git commit -m "$(cat <<'EOF'
feat(session): cookie、上游地址与惰性刷新

刷新只在有请求经过、且距过期不足 60 秒时触发，没有定时器也没有后台任务。
每会话进程内单飞 + store 层 CAS：生产单进程时单飞就是唯一并发入口，dev 下
Vite 与 SSR 各持一份模块实例时靠 CAS 兜底；CAS 输掉就用赢家的 token，绝不覆盖。

失败分两档，这是 P4b 的教训：401（后端真的说凭证不认）→ 删会话；5xx / 网络失败 /
响应形状坏 → 会话保留。此前一律 clearAuth，一次网络抖动就销毁用户自己敲进去的
第三方 API Key，只有他知道、应用无从恢复；两侧代价不对称。

refresh_token 缺席按 f3d7230 的实测规则处理（沿用旧的），给了却不是非空字符串
仍然抛。上游地址只从环境变量读，缺失直接抛错不回退——悄悄指错地方的 BFF 比
起不来的难查得多。

cookie 的 readSessionId 整名比较，不用 startsWith：hv_session_other 不能被误读。

变异验证（bun run test server/session，两个 runner 各跑）：把 !ok 改成删会话 →
502 那条红；把缺席沿用改成 as string → 沿用那条红；去掉单飞 → 并发那条红。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 业务 401 表提到跨端共享模块

**Files:**
- Create: `src/lib/business401.ts`
- Modify: `src/api/authedFetch.ts`
- Modify: `src/api/apiClient.ts`
- Create: `src/lib/__tests__/business401.test.ts`

**Interfaces:**
- Produces: `BUSINESS_401_ENDPOINTS: ReadonlySet<string>`、`isBusiness401Endpoint(endpoint: string): boolean`、`isBusiness401Path(method: string | undefined, pathname: string): boolean`

**为什么必须先做这一步**：`api.$.ts`（Task 7）要判「这个 401 该不该删会话」，而这张表现在长在 `authedFetch.ts` 里。不搬的话，用户打错一次旧密码就会被 BFF 删会话踢下线 —— 后端对旧密码错误返回的正是 401（`backend-docs/auth/用户登录注册鉴权部分.md` 与 `个人资料管理.md` §4）。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/__tests__/business401.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { BUSINESS_401_ENDPOINTS, isBusiness401Endpoint, isBusiness401Path } from '@/lib/business401'

describe('业务 401 端点表', () => {
  it('改密端点在表里——旧密码错误后端回 401，那不是会话失效', () => {
    expect(BUSINESS_401_ENDPOINTS.has('PUT /api/profile/password')).toBe(true)
  })

  it('isBusiness401Endpoint 认 `METHOD /path` 形态', () => {
    expect(isBusiness401Endpoint('PUT /api/profile/password')).toBe(true)
    expect(isBusiness401Endpoint('GET /api/friends')).toBe(false)
  })

  it('isBusiness401Path 只看 method + pathname，query 不参与', () => {
    expect(isBusiness401Path('put', '/api/profile/password')).toBe(true)
    expect(isBusiness401Path('PUT', '/api/profile/password')).toBe(true)
    expect(isBusiness401Path('POST', '/api/profile/password')).toBe(false)
    expect(isBusiness401Path(undefined, '/api/profile/password')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/lib/__tests__/business401.test.ts 2>&1 | tail -6`
Expected: FAIL —— 找不到模块 `@/lib/business401`

- [ ] **Step 3: 写实现**

创建 `src/lib/business401.ts`：

```ts
/**
 * 「业务 401」：后端用 401 表达一个**业务**结果，而不是「你的会话失效了」。
 *
 * 目前只有一条：`PUT /api/profile/password` 的旧密码错误。文档
 * `backend-docs/profile/个人资料管理.md` §4 明写「旧密码验证失败返回 401 状态码」。
 *
 * 这张表有**两个**消费方，所以必须住在 src/lib 而不是某一侧：
 * - 客户端 `api/authedFetch.ts`：401 时决定要不要 clearAuth + 跳登录页；
 * - 服务端 `app/routes/api.$.ts`（BFF）：401 时决定要不要删会话。
 *
 * 漏掉服务端那一侧的后果：用户打错一次当前密码 → BFF 删会话 → 被踢下线。
 *
 * ⚠️ 往这张表里加一行**不会**自动全仓生效：只有真正查询它的那两处会读到。
 * 新增消费方要自己接上。
 */
export const BUSINESS_401_ENDPOINTS: ReadonlySet<string> = new Set(['PUT /api/profile/password'])

/** `ApiError.endpoint` 形态（`METHOD /path`）的查询 */
export const isBusiness401Endpoint = (endpoint: string): boolean => BUSINESS_401_ENDPOINTS.has(endpoint)

/**
 * 方法 + pathname 形态的查询。query / hash 不参与。
 *
 * method 缺失时判**假**：判假 = 维持原来的会话失效处理，不会凭空多出一条
 * 「某个 401 被当成业务结果而放过」的静默路径。
 */
export const isBusiness401Path = (method: string | undefined, pathname: string): boolean => {
  if (method === undefined) return false
  return BUSINESS_401_ENDPOINTS.has(`${method.toUpperCase()} ${pathname}`)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun run test src/lib/__tests__/business401.test.ts 2>&1 | tail -6`
Expected: PASS，3 条

- [ ] **Step 5: 改 authedFetch 与 apiClient 改从新模块取**

在 `src/api/authedFetch.ts` 里：
- 删掉 `const BUSINESS_401_ENDPOINTS: ReadonlySet<string> = new Set(['PUT /api/profile/password'])` 那一行及其上方注释。
- 删掉 `isBusiness401Endpoint` 的定义（连注释）。
- `isBusiness401Request` 的函数体改为调用共享模块，**保留**它自己关于「url 绝对/相对都行、解析不出来判假」的注释：

```ts
import { isBusiness401Path } from '@/lib/business401'

export const isBusiness401Request = (method: string | undefined, url: string): boolean => {
  let pathname: string
  try {
    pathname = new URL(url, BASE_URL).pathname
  } catch {
    return false
  }
  return isBusiness401Path(method, pathname)
}
```
- 在文件顶部 `export { isBusiness401Endpoint } from '@/lib/business401'` —— `apiClient.ts` 现在从 `authedFetch` 拿它，保持它的 import 不变即可（改动面更小）。若 biome 报 re-export 规则问题，改成让 `apiClient.ts` 直接从 `@/lib/business401` 导入。

- [ ] **Step 6: 全量单测 + 门禁**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests "`
Expected: tsc 0；lint 基线不变；单测 = 上一任务总数 + 3，且**原有关于业务 401 的用例全部仍然绿**（它们盯的是行为，不是这张表住在哪）

- [ ] **Step 7: 变异验证**

把 `src/lib/business401.ts` 的 Set 改成空 `new Set([])`。

Run: `bun run test 2>&1 | grep -E "Tests |×" | head -8`
Expected: 至少 `business401.test.ts` 的 2 条 + `profile.test.ts` 里那组改密 401 用例一起红（证明搬家没让原有防线失效）。观察后还原。

- [ ] **Step 8: 提交**

```bash
git add src/lib/business401.ts src/lib/__tests__/business401.test.ts src/api/authedFetch.ts src/api/apiClient.ts
git commit -m "$(cat <<'EOF'
refactor(auth): 业务 401 端点表提到 src/lib，供客户端与 BFF 共用

这张表原来长在 api/authedFetch.ts 里，只有客户端读得到。BFF 的鉴权代理也要用它
判「这个 401 该不该删会话」——不共用的话，用户打错一次当前密码，后端按文档回
401，BFF 就把会话删了把人踢下线。

注释里写明往表里加一行不会自动全仓生效，只有真正查询它的那两处会读到。

变异：把表清空 → business401 自己的 2 条 + profile.test.ts 那组改密 401 用例
一起红，证明搬家没让原有防线失效。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 转发核心（头剥离 + 流式）

**Files:**
- Create: `server/proxy/forward.ts`
- Create: `server/proxy/__tests__/forward.test.ts`

**Interfaces:**
- Consumes: `upstreamHttp()`（Task 3）
- Produces:
  - `buildUpstreamHeaders(request: Request, extra?: Record<string, string>): Headers`
  - `buildDownstreamHeaders(response: Response, extra?: Record<string, string>): Headers`
  - `forwardToUpstream(request: Request, opts: { pathWithQuery: string; authorization?: string }): Promise<Response>`
  - `isCrossSiteWrite(request: Request): boolean`

- [ ] **Step 1: 写失败的测试**

创建 `server/proxy/__tests__/forward.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDownstreamHeaders, buildUpstreamHeaders, forwardToUpstream, isCrossSiteWrite } from '../forward'

describe('buildUpstreamHeaders', () => {
  it('剥掉 hop-by-hop 头与 cookie / host', () => {
    const req = new Request('http://app.test/api/x', {
      headers: {
        cookie: 'hv_session=secret',
        host: 'app.test',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        'transfer-encoding': 'chunked',
        upgrade: 'h2c',
        te: 'trailers',
        trailer: 'X',
        'proxy-authorization': 'Basic xxx',
        'user-agent': 'probe/1.0',
        accept: 'application/json',
      },
    })

    const headers = buildUpstreamHeaders(req)

    // cookie 绝不能转发给后端：它只对 BFF 有意义，且里面是会话钥匙
    expect(headers.get('cookie')).toBe(null)
    expect(headers.get('host')).toBe(null)
    for (const h of ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authorization']) {
      expect(headers.get(h)).toBe(null)
    }
    // 正对照：不该剥的确实留着
    expect(headers.get('user-agent')).toBe('probe/1.0')
    expect(headers.get('accept')).toBe('application/json')
  })

  it('extra 里的头会被加上', () => {
    const headers = buildUpstreamHeaders(new Request('http://app.test/'), { Authorization: 'Bearer AT' })
    expect(headers.get('authorization')).toBe('Bearer AT')
  })

  it('请求自带的 authorization 被剥掉——凭证只能由 BFF 注入', () => {
    const req = new Request('http://app.test/', { headers: { authorization: 'Bearer 用户伪造的' } })
    expect(buildUpstreamHeaders(req).get('authorization')).toBe(null)
  })
})

describe('buildDownstreamHeaders', () => {
  it('剥掉上游的 hop-by-hop 与 set-cookie', () => {
    const res = new Response('x', {
      headers: {
        'content-type': 'application/json',
        connection: 'close',
        'transfer-encoding': 'chunked',
        'set-cookie': 'upstream=1',
      },
    })
    const headers = buildDownstreamHeaders(res)
    expect(headers.get('connection')).toBe(null)
    expect(headers.get('transfer-encoding')).toBe(null)
    // 上游的 set-cookie 不能透给浏览器：会话由 BFF 全权管理
    expect(headers.get('set-cookie')).toBe(null)
    expect(headers.get('content-type')).toBe('application/json')
  })
})

describe('isCrossSiteWrite', () => {
  it('跨站的非 GET 判真', () => {
    const req = new Request('http://app.test/api/x', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } })
    expect(isCrossSiteWrite(req)).toBe(true)
  })

  it('跨站的 GET 判假（读不构成 CSRF）', () => {
    const req = new Request('http://app.test/api/x', { headers: { 'sec-fetch-site': 'cross-site' } })
    expect(isCrossSiteWrite(req)).toBe(false)
  })

  it('同源的 POST 判假', () => {
    const req = new Request('http://app.test/api/x', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } })
    expect(isCrossSiteWrite(req)).toBe(false)
  })

  it('没有 Sec-Fetch-Site 头时判假（老浏览器与服务端调用不该被拦）', () => {
    const req = new Request('http://app.test/api/x', { method: 'POST' })
    expect(isCrossSiteWrite(req)).toBe(false)
  })
})

describe('forwardToUpstream', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('URL 由上游基址 + 原样 path/query 拼成', async () => {
    await forwardToUpstream(new Request('http://app.test/api/friends?limit=2'), { pathWithQuery: '/api/friends?limit=2' })
    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/api/friends?limit=2')
  })

  it('带 body 的请求用 duplex: half 流式转发，不先读进内存', async () => {
    const req = new Request('http://app.test/api/x', { method: 'POST', body: 'payload', duplex: 'half' } as RequestInit)
    await forwardToUpstream(req, { pathWithQuery: '/api/x' })

    const init = fetchMock.mock.calls[0][1] as RequestInit & { duplex?: string }
    expect(init.method).toBe('POST')
    expect(init.duplex).toBe('half')
    // body 是原始流，不是被 await text() 读出来的字符串
    expect(typeof init.body).not.toBe('string')
  })

  it('GET / HEAD 不带 body（带了 fetch 会抛）', async () => {
    await forwardToUpstream(new Request('http://app.test/api/x'), { pathWithQuery: '/api/x' })
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(null)
  })

  it('authorization 传入时注入', async () => {
    await forwardToUpstream(new Request('http://app.test/api/x'), { pathWithQuery: '/api/x', authorization: 'Bearer AT' })
    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    expect(headers.get('authorization')).toBe('Bearer AT')
  })

  it('不传 authorization 时头对象上根本没有这个键（透传分支的硬约束）', async () => {
    await forwardToUpstream(new Request('http://app.test/avatars/a.png'), { pathWithQuery: '/avatars/a.png' })
    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    // 断言 has()，不是 get() === null：预签名请求带查询串签名，
    // 再带 Authorization 会被 S3 拒绝，所以这个键必须**不存在**
    expect(headers.has('authorization')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test server/proxy 2>&1 | tail -6`
Expected: FAIL —— 找不到 `../forward`

- [ ] **Step 3: 写实现**

创建 `server/proxy/forward.ts`：

```ts
import { upstreamHttp } from '../upstream'

/**
 * hop-by-hop 头：只对单跳连接有意义，转发时必须剥掉（RFC 7230 §6.1）。
 * 连带剥 `host`（由 fetch 按目标 URL 自己设）与 `cookie`（只对 BFF 有意义，
 * 里面是会话钥匙，绝不能出现在到后端的请求里）。
 */
const STRIP_FROM_REQUEST = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer',
  'proxy-authorization', 'proxy-connection',
  'host', 'cookie',
  // 凭证只能由 BFF 注入。请求自带的 authorization 一律不信——否则浏览器侧
  // 可以自己塞一个头绕过会话检查。
  'authorization',
])

const STRIP_FROM_RESPONSE = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer',
  'proxy-authenticate', 'proxy-connection',
  // 上游的 set-cookie 不透给浏览器：会话由 BFF 全权管理，
  // 后端如果哪天开始下发 cookie，也不该越过 BFF 直达浏览器。
  'set-cookie',
])

export function buildUpstreamHeaders(request: Request, extra?: Record<string, string>): Headers {
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!STRIP_FROM_REQUEST.has(key.toLowerCase())) headers.set(key, value)
  })
  for (const [k, v] of Object.entries(extra ?? {})) headers.set(k, v)
  return headers
}

export function buildDownstreamHeaders(response: Response, extra?: Record<string, string>): Headers {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    if (!STRIP_FROM_RESPONSE.has(key.toLowerCase())) headers.set(key, value)
  })
  for (const [k, v] of Object.entries(extra ?? {})) headers.set(k, v)
  return headers
}

/**
 * 跨站写请求。`SameSite=Lax` 已经让跨站 POST 带不上 cookie，这是第二道：
 * 即便将来 cookie 策略变了，跨站的非 GET 也直接拒。
 *
 * 头缺失时判**假**：老浏览器与服务端发起的调用不带这个头，拦它们没有依据。
 */
export function isCrossSiteWrite(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return false
  return request.headers.get('sec-fetch-site') === 'cross-site'
}

export interface ForwardOptions {
  /** 原样的 pathname + search。**绝不重新编码** —— 预签名 URL 的签名对字节敏感 */
  pathWithQuery: string
  /** 只有鉴权代理会传；透传分支必须不传，否则 S3 拒绝 */
  authorization?: string
}

export async function forwardToUpstream(request: Request, opts: ForwardOptions): Promise<Response> {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  const upstream = await fetch(`${upstreamHttp()}${opts.pathWithQuery}`, {
    method: request.method,
    headers: buildUpstreamHeaders(request, opts.authorization ? { Authorization: opts.authorization } : undefined),
    // 流式转发：不 await text()/arrayBuffer()。分片上传可能是几十 MB，
    // 读进内存等于把它们全压在 BFF 的堆上。duplex: 'half' 是 fetch 接受
    // ReadableStream body 的前提，缺了它 Node/Bun 都会抛。
    body: hasBody ? request.body : null,
    duplex: hasBody ? 'half' : undefined,
    redirect: 'manual',
  } as RequestInit)

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: buildDownstreamHeaders(upstream),
  })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun run test server/proxy 2>&1 | tail -6`
Expected: PASS，10 条

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `STRIP_FROM_REQUEST` 里删掉 `'cookie'` | 「剥掉 hop-by-hop 头与 cookie / host」红 |
| `STRIP_FROM_REQUEST` 里删掉 `'authorization'` | 「请求自带的 authorization 被剥掉」红 |
| `STRIP_FROM_RESPONSE` 里删掉 `'set-cookie'` | 「剥掉上游的 hop-by-hop 与 set-cookie」红 |
| `body: hasBody ? request.body : null` 改成 `await request.text()` | 「带 body 的请求用 duplex: half 流式转发」红 |
| `isCrossSiteWrite` 去掉 GET/HEAD 的提前返回 | 「跨站的 GET 判假」红 |

每条观察后还原。**任何一条没红就先修测试**。

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests "`

```bash
git add server/proxy
git commit -m "$(cat <<'EOF'
feat(proxy): 转发核心——头剥离与流式透传

请求侧除 hop-by-hop 外还剥 host、cookie、authorization：cookie 只对 BFF 有意义
且里面是会话钥匙；authorization 一律不信请求自带的，否则浏览器可以自己塞头绕过
会话检查，凭证只能由 BFF 注入。响应侧剥上游的 set-cookie——会话由 BFF 全权管理。

body 流式转发不 await text()：分片上传可能几十 MB，读进内存等于全压在 BFF 堆上。
duplex: 'half' 是 fetch 接受流式 body 的前提。pathWithQuery 原样拼接不重新编码，
预签名 URL 的签名对字节敏感。

isCrossSiteWrite 是 SameSite=Lax 之外的第二道；头缺失时判假，老浏览器与服务端
调用不带它，拦它们没有依据。

透传分支「不注入 Authorization」用 headers.has() 断言，不是 get() === null：
预签名请求带查询串签名，再带 Authorization 会被 S3 拒绝，这个键必须不存在。

变异验证五条（每条恰好红对应用例）：删 cookie 剥离 / 删 authorization 剥离 /
删 set-cookie 剥离 / body 改成 await text() / isCrossSiteWrite 去掉 GET 提前返回。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 登录 / 注册 / 登出 / 会话查询四条资源路由

**Files:**
- Create: `src/app/routes/api.auth.login.ts`
- Create: `src/app/routes/api.auth.register.ts`
- Create: `src/app/routes/api.auth.logout.ts`
- Create: `src/app/routes/api.session.ts`
- Create: `src/app/routes/__tests__/apiAuth.test.ts`
- Modify: `src/app/routes.ts`

**⚠️ 为什么必须有 `register` 这条**：`authStore.register`（`RegisterForm.tsx` 在用）打 `POST /api/auth/register`。它是**未登录**用户发起的 —— 落进 `api.$.ts` 那条 catch-all 会被要求会话 cookie，没有就 401，**注册功能彻底坏掉**。所以它必须是一条独立的、不查会话的转发路由。写计划时的 spec 自审才发现这一条，spec §4.3 的路由表遗漏了它。

**Interfaces:**
- Consumes: `getSessionStore`、`serializeSessionCookie`、`clearSessionCookie`、`cookieOptionsFromEnv`、`readSessionId`、`ensureFreshAccessToken`、`SessionDead`、`UpstreamUnavailable`（`server/session`）；`upstreamHttp`（`server/upstream`）；`isCrossSiteWrite`（`server/proxy/forward`）
- Produces: 三个资源路由模块，各导出 `action`（login/logout）或 `loader`（session）。后续任务不 import 它们。

**路由模块怎么引服务端代码**：用相对路径 `../../../server/session`。不加 alias —— 加 alias 要同时改 `vite.config.ts`、`vitest.config.ts`、`tsconfig.json` 三处，为四个 import 不值得；相对路径也更直白地表达「这是跨目录引服务端代码」。

- [ ] **Step 1: 写失败的测试**

创建 `src/app/routes/__tests__/apiAuth.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_NAME, resetSessionStore } from '../../../../server/session'
import { action as loginAction } from '../api.auth.login'
import { action as logoutAction } from '../api.auth.logout'
import { loader as sessionLoader } from '../api.session'

const LOGIN_OK = {
  success: true,
  code: 200,
  data: {
    access_token: 'AT1', refresh_token: 'RT1', expires_in: 900,
    user_nickname: '爱丽丝', user_email: 'a@x.com', user_avatar_url: 'avatars/a.png',
  },
}

function req(url: string, init?: RequestInit & { cookie?: string }): Request {
  const headers = new Headers(init?.headers)
  if (init?.cookie) headers.set('cookie', init.cookie)
  return new Request(url, { ...init, headers })
}

function sessionIdFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? ''
  const m = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookie)
  if (!m || m[1] === '') throw new Error(`响应没有设置会话 cookie：${setCookie}`)
  return m[1]
}

describe('BFF 登录 / 登出 / 会话查询', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    process.env.SESSION_DB_PATH = ':memory:'
    process.env.SESSION_COOKIE_SECURE = 'false'
    resetSessionStore()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('登录成功：设 httpOnly cookie，响应体里没有任何 token', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))

    const res = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'probe/1.0' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never,
    })

    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('HttpOnly')

    const body = await res.text()
    // 这是本设计的核心断言：token 绝不能出现在给浏览器的响应里
    expect(body).not.toContain('AT1')
    expect(body).not.toContain('RT1')
    // 正对照：用户字段确实回来了，证明不是「整个 body 都空所以当然没有 token」
    expect(body).toContain('爱丽丝')
  })

  it('登录把 device_info 填成请求的 User-Agent', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))

    await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'probe/1.0' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never,
    })

    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as Record<string, unknown>
    expect(sent.device_info).toBe('probe/1.0')
    expect(sent.user_id).toBe('alice')
  })

  it('登录失败：原样透传后端文案与状态码，不设 cookie', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: false, code: 401, error: '用户名或密码错误' }, 401))

    const res = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'bad' }),
      }),
      params: {}, context: {} as never,
    })

    expect(res.status).toBe(401)
    expect(await res.text()).toContain('用户名或密码错误')
    expect(res.headers.get('set-cookie')).toBe(null)
  })

  it('登录响应缺 expires_in：不建会话，回 502，不设 cookie', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, code: 200, data: { access_token: 'AT1', refresh_token: 'RT1' } }))

    const res = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never,
    })

    expect(res.status).toBe(502)
    expect(res.headers.get('set-cookie')).toBe(null)
  })

  it('GET /api/session：有效会话回用户字段', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))
    const login = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never,
    })
    const id = sessionIdFrom(login)

    const res = await sessionLoader({
      request: req('http://app.test/api/session', { cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never,
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { user: { user_id: string; nickname?: string } } }
    expect(body.data.user.user_id).toBe('alice')
    expect(body.data.user.nickname).toBe('爱丽丝')
  })

  it('GET /api/session：没有 cookie 回 401 并清 cookie', async () => {
    const res = await sessionLoader({
      request: req('http://app.test/api/session'), params: {}, context: {} as never,
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('GET /api/session：cookie 指向不存在的会话，回 401 并清 cookie', async () => {
    const res = await sessionLoader({
      request: req('http://app.test/api/session', { cookie: `${SESSION_COOKIE_NAME}=不存在` }),
      params: {}, context: {} as never,
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('登出：打上游 logout、删会话、清 cookie', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))
    const login = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never,
    })
    const id = sessionIdFrom(login)

    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, code: 200 }))
    const res = await logoutAction({
      request: req('http://app.test/api/auth/logout', { method: 'POST', cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    // 上游确实被打了（第 2 次 fetch）
    expect(fetchMock.mock.calls[1][0]).toBe('http://upstream.test/api/auth/logout')

    // 会话真的没了：再查 session 应当 401
    const after = await sessionLoader({
      request: req('http://app.test/api/session', { cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never,
    })
    expect(after.status).toBe(401)
  })

  it('登出：上游失败也照样删会话、清 cookie（本地登出不能被后端拖住）', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))
    const login = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never,
    })
    const id = sessionIdFrom(login)

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const res = await logoutAction({
      request: req('http://app.test/api/auth/logout', { method: 'POST', cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    const after = await sessionLoader({
      request: req('http://app.test/api/session', { cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never,
    })
    expect(after.status).toBe(401)
  })

  it('跨站 POST 登录被拒（CSRF 第二道）', async () => {
    const res = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never,
    })
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    // 正对照：同源的同一请求会真的打上游（见「登录成功」那条）
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/app/routes/__tests__/apiAuth.test.ts 2>&1 | tail -6`
Expected: FAIL —— 找不到 `../api.auth.login`

- [ ] **Step 3: 写共用的 BFF 响应助手**

在 `server/session/index.ts` 末尾追加：

```ts
import { clearSessionCookie, cookieOptionsFromEnv } from './cookie'

/**
 * BFF 自己产生的三种响应之一：会话失效。
 *
 * 形状与后端的错误信封一致（`{success:false, code, error}`），让客户端的解包层
 * 不必为 BFF 单开一条分支。**这是 BFF 唯一会自己造的错误文案** ——
 * 其余一律上游原样，见 spec §6。
 */
export function sessionExpiredResponse(): Response {
  return new Response(JSON.stringify({ success: false, code: 401, error: '会话已失效，请重新登录' }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'set-cookie': clearSessionCookie(cookieOptionsFromEnv()) },
  })
}

/** 上游不可达。透传 502，不编造文案（edge 那份 JSON 已经说明了原因） */
export function upstreamUnavailableResponse(): Response {
  return new Response(JSON.stringify({ success: false, code: 502, error: '后端暂时不可用，请稍后重试' }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  })
}

/** 跨站写请求。SameSite=Lax 之外的第二道 */
export function crossSiteRejectedResponse(): Response {
  return new Response(JSON.stringify({ success: false, code: 403, error: '跨站请求已被拒绝' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  })
}
```

- [ ] **Step 4: 写三条路由**

创建 `src/app/routes/api.auth.login.ts`：

```ts
import type { ActionFunctionArgs } from 'react-router'
import { isCrossSiteWrite } from '../../../server/proxy/forward'
import {
  cookieOptionsFromEnv,
  crossSiteRejectedResponse,
  getSessionStore,
  serializeSessionCookie,
  upstreamUnavailableResponse,
  type SessionUser,
} from '../../../server/session'
import { upstreamHttp } from '../../../server/upstream'

/**
 * `POST /api/auth/login` —— 建会话。
 *
 * 这是资源路由（只有 action、没有 default export），RR 不会给它套任何布局。
 *
 * 与其余 `/api/*` 的关键差别：**响应体里绝不含 token**。上游返回的 access /
 * refresh token 只写进 SQLite，浏览器拿到的只有一个 httpOnly cookie 和用户字段。
 */

/** 登录响应的严格解析：三个字段全部必需。缺任何一个都不建会话——一个没有
 *  refresh token 的会话在 15 分钟后必死，且死法是「无声地开始 401」。 */
interface LoginTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: SessionUser
}

function parseLogin(userId: string, body: unknown): LoginTokens {
  const envelope = body as { data?: unknown } | null
  const data = (envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : body) as Record<string, unknown> | null
  if (!data || typeof data !== 'object') throw new Error('登录响应不是对象')

  const accessToken = data.access_token
  if (typeof accessToken !== 'string' || accessToken === '') throw new Error('access_token 缺失或不是非空字符串')
  const refreshToken = data.refresh_token
  if (typeof refreshToken !== 'string' || refreshToken === '') throw new Error('refresh_token 缺失或不是非空字符串')
  const expiresIn = data.expires_in
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) throw new Error('expires_in 缺失或不是有限数字')

  // 用户字段是快照，用于 GET /api/session 的首帧渲染；完整资料仍由客户端
  // loadProfile() 拉取覆盖。后端两套命名都收（user_nickname / nickname）。
  const pick = (a: unknown, b: unknown): string | undefined => {
    for (const v of [a, b]) if (typeof v === 'string' && v !== '') return v
    return undefined
  }

  return {
    accessToken, refreshToken, expiresIn,
    user: {
      user_id: userId,
      nickname: pick(data.user_nickname, data.nickname),
      email: pick(data.user_email, data.email),
      // 相对路径原样存。客户端的 toAbsoluteApiUrl 会把它落到同源 /avatars/…，
      // 正好进 passthrough 分支。BFF 不在这里补基址——那是客户端的约定。
      avatar_url: pick(data.user_avatar_url, data.avatar_url),
      signature: pick(data.user_signature, data.signature),
    },
  }
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejectedResponse()

  const payload = (await request.json()) as { user_id?: unknown; password?: unknown }
  const userId = typeof payload.user_id === 'string' ? payload.user_id : ''
  if (userId === '') {
    return new Response(JSON.stringify({ success: false, code: 400, error: '缺少 user_id' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${upstreamHttp()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        password: payload.password,
        // 后端把它显示在「设备管理」里。浏览器侧唯一有意义的设备标识就是 UA。
        device_info: request.headers.get('user-agent') ?? 'unknown',
        mac_address: 'unknown',
      }),
    })
  } catch {
    return upstreamUnavailableResponse()
  }

  // 失败原样透传：后端的「用户名或密码错误」比任何自造文案都准确
  if (!upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  }

  let tokens: LoginTokens
  try {
    tokens = parseLogin(userId, await upstream.json())
  } catch {
    // 形状不对不是「密码错」，回 502 而不是 401：让用户重试密码是错误建议
    return upstreamUnavailableResponse()
  }

  const store = await getSessionStore()
  const now = Date.now()

  // 惰性清理：把 30 天没露面的会话删掉。放在登录这一刻做，不设 cron。
  store.deleteExpired(now - 30 * 24 * 60 * 60 * 1000)

  const id = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
  store.create({
    id, userId, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
    accessExpiresAt: now + tokens.expiresIn * 1000, user: tokens.user, now,
    userAgent: request.headers.get('user-agent'),
  })

  return new Response(JSON.stringify({ success: true, code: 200, data: { user: tokens.user } }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': serializeSessionCookie(id, cookieOptionsFromEnv()),
    },
  })
}
```

创建 `src/app/routes/api.auth.logout.ts`：

```ts
import type { ActionFunctionArgs } from 'react-router'
import { isCrossSiteWrite } from '../../../server/proxy/forward'
import {
  clearSessionCookie,
  cookieOptionsFromEnv,
  crossSiteRejectedResponse,
  getSessionStore,
  readSessionId,
} from '../../../server/session'
import { upstreamHttp } from '../../../server/upstream'
import { closeSessionSockets } from '../../../server/ws/registry'

/**
 * `POST /api/auth/logout` —— 销会话。
 *
 * 顺序刻意是「先打上游（尽力）→ 再删本地 → 再关 WS」：上游失败**不能**阻止
 * 本地登出。用户点了登出就该登出，后端不可达不是让他继续待在登录态的理由。
 */
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejectedResponse()

  const id = readSessionId(request)
  const cookie = clearSessionCookie(cookieOptionsFromEnv())

  if (id) {
    const store = await getSessionStore()
    const session = store.get(id)

    if (session) {
      try {
        await fetch(`${upstreamHttp()}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}` },
        })
      } catch {
        // 尽力而为。失败不影响本地登出。
      }
      store.delete(id)
    }

    // 该会话名下所有还活着的 WS 一并关掉：否则登出后那条连接还在替他收消息
    closeSessionSockets(id)
  }

  return new Response(JSON.stringify({ success: true, code: 200 }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': cookie },
  })
}
```

创建 `src/app/routes/api.session.ts`：

```ts
import type { LoaderFunctionArgs } from 'react-router'
import {
  SessionDead,
  UpstreamUnavailable,
  ensureFreshAccessToken,
  getSessionStore,
  readSessionId,
  sessionExpiredResponse,
  upstreamUnavailableResponse,
} from '../../../server/session'

/**
 * `GET /api/session` —— 「我登录了吗」的**唯一真值**。
 *
 * 客户端启动时读它，而不是读 localStorage 里的 `isAuthenticated`。落盘的那份
 * `user` 只用于首帧把头像昵称画出来，永远不当授权依据。
 *
 * 401 = 未登录。**502 ≠ 未登录** —— 后端挂了不等于用户退出了，客户端在 502 时
 * 必须保持上一次状态、给可重试的错误，不清盘不跳登录。
 */
export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const id = readSessionId(request)
  if (!id) return sessionExpiredResponse()

  const store = await getSessionStore()
  const session = store.get(id)
  if (!session) return sessionExpiredResponse()

  // 顺手刷新：让启动那一刻就把临期 token 换掉，后续请求不必各自触发
  try {
    await ensureFreshAccessToken(store, session)
  } catch (error) {
    if (error instanceof SessionDead) return sessionExpiredResponse()
    if (error instanceof UpstreamUnavailable) return upstreamUnavailableResponse()
    throw error
  }

  store.touch(id, Date.now())

  return new Response(JSON.stringify({ success: true, code: 200, data: { user: session.user } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
```

创建 `src/app/routes/api.auth.register.ts`：

```ts
import type { ActionFunctionArgs } from 'react-router'
import { forwardToUpstream, isCrossSiteWrite } from '../../../server/proxy/forward'
import { crossSiteRejectedResponse } from '../../../server/session'

/**
 * `POST /api/auth/register` —— **不查会话**的转发。
 *
 * 注册是未登录用户发起的：走 `api.$.ts` 那条 catch-all 会被要求会话 cookie，
 * 没有就 401，注册功能直接坏掉。所以它必须是独立一条。
 *
 * 与 login 的差别：注册**不建会话**。后端的注册接口不返回 token（文档
 * `backend-docs/auth/用户登录注册鉴权部分.md:20-27` 的请求体是
 * `{user_id, nickname, password, email}`，响应里没有 token），前端注册成功后
 * 仍然要走一次登录。所以这里只做纯转发，一个字节都不改。
 */
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejectedResponse()
  const url = new URL(request.url)
  return forwardToUpstream(request, { pathWithQuery: `${url.pathname}${url.search}` })
}
```

在 `src/app/routes/__tests__/apiAuth.test.ts` 里追加：

```ts
describe('BFF 注册转发', () => {
  it('未登录也能注册——不查会话、原样转发', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, code: 200, data: { user_id: 'newbie' } }))

    const res = await registerAction({
      // 刻意**不带** cookie：这就是本条要证明的事
      request: req('http://app.test/api/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'newbie', nickname: '新人', email: 'n@x.com', password: 'p' }),
      }),
      params: {}, context: {} as never,
    })

    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/api/auth/register')
    // 注册不建会话：后端注册接口不返回 token，前端仍要走一次登录
    expect(res.headers.get('set-cookie')).toBe(null)
  })

  it('注册失败原样透传后端文案', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: false, code: 400, error: '用户 ID 已存在' }, 400))

    const res = await registerAction({
      request: req('http://app.test/api/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'taken' }),
      }),
      params: {}, context: {} as never,
    })

    expect(res.status).toBe(400)
    expect(await res.text()).toContain('用户 ID 已存在')
  })
})
```

并在该测试文件顶部的 import 里追加 `import { action as registerAction } from '../api.auth.register'`。

创建 `server/ws/registry.ts`（登出要用，WS 代理本体在 Task 9）：

```ts
/**
 * `sessionId → 该会话名下活着的 WS`。
 *
 * 单独一个模块而不是塞进 `ws/proxy.ts`：登出路由（跑在 SSR bundle 里）要关这些
 * 连接，而 `ws/proxy.ts` 会 import Bun 专属的 ServerWebSocket 类型。让登出只依赖
 * 这个零依赖的登记表，避免把 Bun 的类型拖进 bundle。
 *
 * ⚠️ 这是**进程内**的表。生产是单进程，成立；将来若多进程，登出关别的进程里的
 * 连接需要另想办法（那时 WS 也需要跨进程路由，是同一个更大的问题）。
 */
interface CloseableSocket {
  close(code?: number, reason?: string): void
}

const sockets = new Map<string, Set<CloseableSocket>>()

export function registerSessionSocket(sessionId: string, socket: CloseableSocket): void {
  const set = sockets.get(sessionId) ?? new Set<CloseableSocket>()
  set.add(socket)
  sockets.set(sessionId, set)
}

export function unregisterSessionSocket(sessionId: string, socket: CloseableSocket): void {
  const set = sockets.get(sessionId)
  if (!set) return
  set.delete(socket)
  if (set.size === 0) sockets.delete(sessionId)
}

/** 登出时调用。1000 = 正常关闭，客户端的重连逻辑不该把它当成故障 */
export function closeSessionSockets(sessionId: string): void {
  const set = sockets.get(sessionId)
  if (!set) return
  for (const socket of set) {
    try {
      socket.close(1000, 'session ended')
    } catch {
      // 已经关了就算了
    }
  }
  sockets.delete(sessionId)
}
```

- [ ] **Step 5: 注册路由**

修改 `src/app/routes.ts`：在 `export default [` 之后、`index('routes/home.tsx')` 之前插入：

```ts
  // ── BFF 资源路由（只有 loader/action，没有组件） ──
  // 具体路径排在 `api/*` 之前。RR 的路由排序本身也让静态段优先于 splat，
  // 但显式排序让下一个读这个文件的人不必去查 RR 的排序规则。
  route('api/auth/login', 'routes/api.auth.login.ts'),
  // 注册必须独立一条：它是**未登录**用户发起的，落进 `api/*` 会被要求会话 cookie
  route('api/auth/register', 'routes/api.auth.register.ts'),
  route('api/auth/logout', 'routes/api.auth.logout.ts'),
  route('api/session', 'routes/api.session.ts'),
  route('api/*', 'routes/api.$.ts'),
  route('avatars/*', 'routes/passthrough.$.ts', { id: 'passthrough-avatars' }),
  route('user-file/*', 'routes/passthrough.$.ts', { id: 'passthrough-user-file' }),
  route('friends-file/*', 'routes/passthrough.$.ts', { id: 'passthrough-friends-file' }),
  route('apps/*', 'routes/passthrough.$.ts', { id: 'passthrough-apps' }),
```

⚠️ 四条 passthrough 指向**同一个模块**，必须各给一个 `id` —— RR 用 (file, id) 唯一标识路由，同一文件注册多次不给 id 会报重复。

Task 7、8 会创建 `api.$.ts` 与 `passthrough.$.ts`；本任务先只写这两行会让 typegen 失败，所以**这一步放到 Task 8 末尾做**。本任务只注册前三条。

- [ ] **Step 6: 运行确认通过**

Run: `bun run test src/app/routes/__tests__/apiAuth.test.ts 2>&1 | tail -8`
Expected: PASS，12 条

- [ ] **Step 7: 变异验证**

| 变异 | 期望 |
|---|---|
| `api.auth.register.ts` 改成走 `api.$.ts` 的会话检查（加一行 `readSessionId` 为空就 401） | 「未登录也能注册」红 |
| 登录响应体里加上 `access_token: tokens.accessToken` | 「响应体里没有任何 token」红 |
| `device_info` 改成写死 `'web'` | 「device_info 填成 User-Agent」红 |
| `parseLogin` 里 `refresh_token` 的校验删掉 | 「缺 expires_in 回 502」**不会**红（它缺的是 expires_in）；需另加一条缺 refresh_token 的用例才能钉住 —— **补上这条用例** |
| 登出时 `store.delete(id)` 挪进 `try` 内（上游失败就不删） | 「上游失败也照样删会话」红 |
| `isCrossSiteWrite` 那行 early return 删掉 | 「跨站 POST 登录被拒」红 |

第三条是**故意留的空档**：按它补一条「登录响应缺 refresh_token 时回 502 不建会话」的用例，再重跑变异确认它红。

- [ ] **Step 8: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests "`

```bash
git add src/app/routes/api.auth.login.ts src/app/routes/api.auth.register.ts src/app/routes/api.auth.logout.ts src/app/routes/api.session.ts src/app/routes/__tests__/apiAuth.test.ts src/app/routes.ts server/session/index.ts server/ws/registry.ts
git commit -m "$(cat <<'EOF'
feat(bff): 登录 / 注册 / 登出 / 会话查询四条资源路由

登录把上游的 token 写进 SQLite，给浏览器的只有 httpOnly cookie 与用户字段——
核心断言是响应体里 grep 不到 token，并配正对照（用户昵称确实在里面，证明不是
「body 空所以当然没 token」）。device_info 填请求的 User-Agent，后端「设备管理」
页显示的就是它。

登录失败原样透传后端文案；响应形状坏回 502 而不是 401——让用户重试密码是错误
建议。缺任一 token 字段都不建会话：没有 refresh token 的会话 15 分钟后必死，
且死法是无声地开始 401。

登出顺序是「上游尽力 → 删本地 → 关 WS」，上游失败不阻止本地登出：用户点了登出
就该登出。WS 登记表单独一个零依赖模块，避免把 Bun 的 ServerWebSocket 类型拖进
SSR bundle。

注册单独一条不查会话的转发路由：它是未登录用户发起的，落进 /api/* 的 catch-all 会被
要求会话 cookie，注册功能会彻底坏掉。spec §4.3 的路由表漏了这一条，写实施计划时的
自审才发现。注册不建会话——后端注册接口不返回 token，前端成功后仍要走一次登录。

GET /api/session 是「我登录了吗」的唯一真值；401 = 未登录，502 ≠ 未登录。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 鉴权代理 `api.$.ts`

**Files:**
- Create: `src/app/routes/api.$.ts`
- Create: `src/app/routes/__tests__/apiProxy.test.ts`

**Interfaces:**
- Consumes: Task 3 的会话与刷新、Task 4 的 `isBusiness401Path`、Task 5 的 `forwardToUpstream` / `isCrossSiteWrite`
- Produces: `loader` 与 `action`（同一个 handler），处理 `/api/*` 全部方法

- [ ] **Step 1: 写失败的测试**

创建 `src/app/routes/__tests__/apiProxy.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_NAME, getSessionStore, resetSessionStore } from '../../../../server/session'
import { action, loader } from '../api.$'

const NOW = 1_000_000

async function makeSession(overrides?: { accessExpiresAt?: number }): Promise<string> {
  const store = await getSessionStore()
  const id = 'sess-1'
  store.create({
    id, userId: 'alice', accessToken: 'AT-live', refreshToken: 'RT-live',
    accessExpiresAt: overrides?.accessExpiresAt ?? NOW + 10 * 60_000,
    user: { user_id: 'alice' }, now: NOW, userAgent: 'probe',
  })
  return id
}

function authed(url: string, id: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers)
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${id}`)
  return new Request(url, { ...init, headers })
}

const args = (request: Request) => ({ request, params: { '*': new URL(request.url).pathname.slice(5) }, context: {} as never })

describe('BFF 鉴权代理 /api/*', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    process.env.SESSION_DB_PATH = ':memory:'
    process.env.SESSION_COOKIE_SECURE = 'false'
    resetSessionStore()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const ok = (body = '{"success":true,"code":200,"data":[]}') =>
    new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })

  it('注入 Bearer 并把 path + query 原样转发', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(ok())

    const res = await loader(args(authed('http://app.test/api/friends?limit=2&q=%E4%B8%AD', id)))

    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/api/friends?limit=2&q=%E4%B8%AD')
    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    expect(headers.get('authorization')).toBe('Bearer AT-live')
    // cookie 绝不能到后端
    expect(headers.get('cookie')).toBe(null)
  })

  it('没有 cookie：401 且不打上游', async () => {
    const res = await loader(args(new Request('http://app.test/api/friends')))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    // 正对照：带上有效 cookie 时确实会打上游（见第一条）
  })

  it('cookie 指向不存在的会话：401 且清 cookie', async () => {
    const res = await loader(args(authed('http://app.test/api/friends', '不存在')))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('上游 401（普通端点）：删会话、清 cookie、原样回 401', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"success":false,"code":401,"error":"未授权访问"}', { status: 401 }))

    const res = await loader(args(authed('http://app.test/api/friends', id)))

    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await getSessionStore()).get(id)).toBe(null)
  })

  it('上游 401（业务 401 端点：改密）：原样透传，会话**不动**', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"success":false,"code":401,"error":"Old password is incorrect"}', { status: 401 }))

    const res = await action(args(authed('http://app.test/api/profile/password', id, {
      method: 'PUT', body: '{"old_password":"x","new_password":"y"}',
    })))

    expect(res.status).toBe(401)
    expect(await res.text()).toContain('Old password is incorrect')
    // 这是本条的要点：打错一次旧密码不能把人踢下线
    expect(res.headers.get('set-cookie')).toBe(null)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })

  it('上游 403：原样透传，会话不动（后端用 403 表示普通权限拒绝）', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"success":false,"code":403,"error":"不是群主/管理员"}', { status: 403 }))

    const res = await action(args(authed('http://app.test/api/groups/g1/avatar', id, { method: 'POST', body: '{}' })))

    expect(res.status).toBe(403)
    expect(await res.text()).toContain('不是群主/管理员')
    expect(res.headers.get('set-cookie')).toBe(null)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })

  it('上游 500：原样透传，会话不动', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"code":500}', { status: 500 }))

    const res = await loader(args(authed('http://app.test/api/friends', id)))

    expect(res.status).toBe(500)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })

  it('临期时先刷新再转发，转发用的是新 token', async () => {
    const id = await makeSession({ accessExpiresAt: NOW + 30_000 })
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, code: 200, data: { access_token: 'AT-new', expires_in: 900 } }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(ok())

    await loader(args(authed('http://app.test/api/friends', id)))

    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/api/auth/refresh')
    expect(fetchMock.mock.calls[1][0]).toBe('http://upstream.test/api/friends')
    expect((fetchMock.mock.calls[1][1] as { headers: Headers }).headers.get('authorization')).toBe('Bearer AT-new')
  })

  it('刷新时上游 401：删会话、401、**不**转发原请求', async () => {
    const id = await makeSession({ accessExpiresAt: NOW + 30_000 })
    fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))

    const res = await loader(args(authed('http://app.test/api/friends', id)))

    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await getSessionStore()).get(id)).toBe(null)
  })

  it('刷新时上游 5xx：502，会话保留，不转发原请求', async () => {
    const id = await makeSession({ accessExpiresAt: NOW + 30_000 })
    fetchMock.mockResolvedValueOnce(new Response('{"code":502}', { status: 502 }))

    const res = await loader(args(authed('http://app.test/api/friends', id)))

    expect(res.status).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })

  it('/api/auth/refresh 从浏览器来一律 404——刷新是 BFF 的事', async () => {
    const id = await makeSession()
    const res = await action(args(authed('http://app.test/api/auth/refresh', id, { method: 'POST', body: '{}' })))
    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('跨站的非 GET：403 且不打上游', async () => {
    const id = await makeSession()
    const res = await action(args(authed('http://app.test/api/friends', id, {
      method: 'POST', body: '{}', headers: { 'sec-fetch-site': 'cross-site' },
    })))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('**没有**「401 后刷新重试」：上游 401 只发一次请求，不重放', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))

    await action(args(authed('http://app.test/api/profile', id, { method: 'PUT', body: '{"nickname":"x"}' })))

    // 重试 = 重放非幂等请求。P1b 修过的正是这一类 bug（改密请求被重放）
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/app/routes/__tests__/apiProxy.test.ts 2>&1 | tail -6`
Expected: FAIL —— 找不到 `../api.$`

- [ ] **Step 3: 写实现**

创建 `src/app/routes/api.$.ts`：

```ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { isBusiness401Path } from '@/lib/business401'
import { forwardToUpstream, isCrossSiteWrite } from '../../../server/proxy/forward'
import {
  SessionDead,
  UpstreamUnavailable,
  clearSessionCookie,
  cookieOptionsFromEnv,
  crossSiteRejectedResponse,
  ensureFreshAccessToken,
  getSessionStore,
  readSessionId,
  sessionExpiredResponse,
  upstreamUnavailableResponse,
} from '../../../server/session'

/**
 * `/api/*` 鉴权代理。
 *
 * 契约（spec §4.4）：
 * 1. cookie → 会话 → `ensureFresh` → 注入 Bearer → 流式转发 → 流式回传。
 * 2. **不做「401 后刷新重试」**。新鲜度在转发**前**保证；401 之后重试等于重放
 *    一个非幂等请求 —— P1b 修过的正是这类 bug（改密请求被重放，可能撞上服务端
 *    的失败计数器）。
 * 3. 上游 **401** 分两种：业务 401 端点（见 `@/lib/business401`）原样透传、会话
 *    不动；其余视为会话死亡 → 删会话 + 清 cookie。漏掉这个分支的后果是用户打错
 *    一次当前密码就被踢下线。
 * 4. **403 与其余 4xx/5xx 一律原样透传，不碰会话。** 后端拿 403 表示普通权限拒绝
 *    （「不是群主/管理员」之类），这是 P1 用「静默登出」换来的教训。
 */
async function handle(request: Request): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejectedResponse()

  const url = new URL(request.url)
  const pathWithQuery = `${url.pathname}${url.search}`

  // 刷新是 BFF 的事，客户端不得驱动它。404 而不是 403：这个端点对浏览器
  // 而言就是不存在。
  if (url.pathname === '/api/auth/refresh') {
    return new Response(JSON.stringify({ success: false, code: 404, error: '该端点不对浏览器开放' }), {
      status: 404, headers: { 'content-type': 'application/json' },
    })
  }

  const id = readSessionId(request)
  if (!id) return sessionExpiredResponse()

  const store = await getSessionStore()
  const session = store.get(id)
  if (!session) return sessionExpiredResponse()

  let accessToken: string
  try {
    accessToken = await ensureFreshAccessToken(store, session)
  } catch (error) {
    if (error instanceof SessionDead) return sessionExpiredResponse()
    if (error instanceof UpstreamUnavailable) return upstreamUnavailableResponse()
    throw error
  }

  const response = await forwardToUpstream(request, { pathWithQuery, authorization: `Bearer ${accessToken}` })

  if (response.status === 401 && !isBusiness401Path(request.method, url.pathname)) {
    store.delete(id)
    // 原样透传上游的 body 与状态码，只额外清 cookie。BFF 不改写后端文案。
    const headers = new Headers(response.headers)
    headers.set('set-cookie', clearSessionCookie(cookieOptionsFromEnv()))
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }

  store.touch(id, Date.now())
  return response
}

export const loader = ({ request }: LoaderFunctionArgs): Promise<Response> => handle(request)
export const action = ({ request }: ActionFunctionArgs): Promise<Response> => handle(request)
```

- [ ] **Step 4: 运行确认通过**

Run: `bun run test src/app/routes/__tests__/apiProxy.test.ts 2>&1 | tail -8`
Expected: PASS，13 条

- [ ] **Step 5: 变异验证（这是本任务最重要的一步）**

| 变异 | 期望 |
|---|---|
| `!isBusiness401Path(...)` 改成 `true`（业务 401 也删会话） | 「业务 401 端点：会话不动」红 |
| 401 分支的条件放宽成 `response.status >= 401`（403 也删会话） | 「上游 403：会话不动」红 |
| 在 401 分支后加一段「刷新后重发一次」 | 「没有 401 后刷新重试」红 |
| `ensureFreshAccessToken` 的 `UpstreamUnavailable` 分支改成 `sessionExpiredResponse()` | 「刷新时上游 5xx：502，会话保留」红 |
| `/api/auth/refresh` 的 404 提前返回删掉 | 「/api/auth/refresh 一律 404」红 |
| `forwardToUpstream` 的 `authorization` 参数不传 | 「注入 Bearer」红 |

六条各自恰好红对应用例。**任何一条没红，先修测试再继续** —— 这一组是整个 BFF 最容易悄悄退化的地方。

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests "`

```bash
git add src/app/routes/api.$.ts src/app/routes/__tests__/apiProxy.test.ts
git commit -m "$(cat <<'EOF'
feat(bff): /api/* 鉴权代理

cookie → 会话 → 惰性刷新 → 注入 Bearer → 流式转发。三条刻意的不作为：

1. 不做「401 后刷新重试」。新鲜度在转发前保证；401 后重试等于重放非幂等请求，
   P1b 修过的正是这类 bug（改密请求被重放，可能撞服务端失败计数器）。
2. 业务 401 端点原样透传、会话不动。漏掉这个分支，用户打错一次当前密码就被踢下线。
3. 403 与其余 4xx/5xx 一律原样透传不碰会话。后端拿 403 表示普通权限拒绝，
   这是 P1 用「静默登出」换来的教训。

/api/auth/refresh 从浏览器来一律 404——刷新是 BFF 的事。

变异验证六条，各自恰好红对应用例：业务 401 也删会话 / 403 也删会话 / 加回 401
重试 / 把 UpstreamUnavailable 当会话失效 / 删 refresh 的 404 / 不注入 Bearer。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 透传代理 `passthrough.$.ts` + 路由注册

**Files:**
- Create: `src/app/routes/passthrough.$.ts`
- Create: `src/app/routes/__tests__/passthrough.test.ts`
- Modify: `src/app/routes.ts`

**Interfaces:**
- Consumes: Task 5 的 `forwardToUpstream`
- Produces: `loader` 与 `action`，服务 `/avatars/*`、`/user-file/*`、`/friends-file/*`、`/apps/*`

- [ ] **Step 1: 写失败的测试**

创建 `src/app/routes/__tests__/passthrough.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_NAME } from '../../../../server/session'
import { action, loader } from '../passthrough.$'

const args = (request: Request) => ({ request, params: {}, context: {} as never })

describe('BFF 透传代理', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    fetchMock = vi.fn().mockResolvedValue(new Response('bytes', { status: 200, headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('原样转发 path 与 query，**头对象上根本没有 authorization 这个键**', async () => {
    const res = await loader(args(new Request('http://app.test/avatars/alice.png?t=1706000000')))

    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/avatars/alice.png?t=1706000000')

    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    // 用 has() 而不是 get() === null：预签名请求带查询串签名，
    // 再带 Authorization 会被 S3 拒绝（403），所以这个键必须**不存在**。
    expect(headers.has('authorization')).toBe(false)
  })

  it('即便请求带着会话 cookie，也不查会话、不注入凭证', async () => {
    await loader(args(new Request('http://app.test/avatars/alice.png', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=sess-1` },
    })))

    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    expect(headers.has('authorization')).toBe(false)
    expect(headers.get('cookie')).toBe(null)
  })

  it('预签名 PUT 的查询串一个字节都不改（X-Amz-Signature 对字节敏感）', async () => {
    const q = '?uploadId=abc&partNumber=1&X-Amz-Signature=deadbeef&X-Amz-Date=20260909T000000Z'
    await action(args(new Request(`http://app.test/user-file/obj${q}`, { method: 'PUT', body: 'chunk', duplex: 'half' } as RequestInit)))

    expect(fetchMock.mock.calls[0][0]).toBe(`http://upstream.test/user-file/obj${q}`)
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT')
  })

  it('上游状态码与 content-type 原样回传', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<Error/>', { status: 404, headers: { 'content-type': 'application/xml' } }))
    const res = await loader(args(new Request('http://app.test/avatars/missing.png')))
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('application/xml')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/app/routes/__tests__/passthrough.test.ts 2>&1 | tail -6`
Expected: FAIL —— 找不到 `../passthrough.$`

- [ ] **Step 3: 写实现**

创建 `src/app/routes/passthrough.$.ts`：

```ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { forwardToUpstream } from '../../../server/proxy/forward'

/**
 * 透传代理：`/avatars/*`、`/user-file/*`、`/friends-file/*`、`/apps/*`。
 *
 * 与 `api.$.ts` 的差别是**两个不作为**，都是硬约束：
 *
 * 1. **不查会话。** 这些资源自鉴权：预签名 URL 的签名在查询串里，头像是公开可读的。
 *    查会话会让未登录状态下的头像加载全部 401。
 * 2. **绝不注入 `Authorization`。** 预签名请求已经带了查询串签名，S3 兼容存储
 *    对「同时带查询串签名和 Authorization 头」直接拒绝（403）。测试用
 *    `headers.has('authorization') === false` 钉住 —— 断言键**不存在**，
 *    而不是它的值为 null。
 *
 * 那为什么还要经过 BFF？因为浏览器直连 `api.huanvae.cn` 走不通（ICP 拦截 +
 * mTLS），这些字节也必须由服务端代取。客户端的 `toAbsoluteApiUrl` 把后端返回的
 * 相对路径落到同源，自然进这里。
 */
function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  // pathname + search 原样拼接，不重新编码：X-Amz-Signature 对字节敏感
  return forwardToUpstream(request, { pathWithQuery: `${url.pathname}${url.search}` })
}

export const loader = ({ request }: LoaderFunctionArgs): Promise<Response> => handle(request)
export const action = ({ request }: ActionFunctionArgs): Promise<Response> => handle(request)
```

- [ ] **Step 4: 运行确认通过**

Run: `bun run test src/app/routes/__tests__/passthrough.test.ts 2>&1 | tail -6`
Expected: PASS，4 条

- [ ] **Step 5: 注册全部六条路由**

修改 `src/app/routes.ts`，在 `export default [` 之后插入（Task 6 Step 5 的完整版）：

```ts
  // ── BFF 资源路由（只有 loader/action，没有组件） ──
  // 具体路径排在 `api/*` 之前。RR 的排序本身也让静态段优先于 splat，
  // 但显式排序让下一个读这个文件的人不必去查 RR 的排序规则。
  route('api/auth/login', 'routes/api.auth.login.ts'),
  // 注册必须独立一条：它是**未登录**用户发起的，落进 `api/*` 会被要求会话 cookie
  route('api/auth/register', 'routes/api.auth.register.ts'),
  route('api/auth/logout', 'routes/api.auth.logout.ts'),
  route('api/session', 'routes/api.session.ts'),
  route('api/*', 'routes/api.$.ts'),
  // 四条透传前缀指向同一个模块，必须各给一个 id：RR 用 (file, id) 唯一标识路由，
  // 同一文件注册多次不给 id 会报重复定义。
  route('avatars/*', 'routes/passthrough.$.ts', { id: 'passthrough-avatars' }),
  route('user-file/*', 'routes/passthrough.$.ts', { id: 'passthrough-user-file' }),
  route('friends-file/*', 'routes/passthrough.$.ts', { id: 'passthrough-friends-file' }),
  route('apps/*', 'routes/passthrough.$.ts', { id: 'passthrough-apps' }),
```

- [ ] **Step 6: 验证 typegen 与构建认这些路由**

Run: `bunx react-router typegen && bunx tsc --noEmit && echo TYPEGEN_OK`
Expected: `TYPEGEN_OK`。若报路由重复，检查四条 passthrough 的 `id` 是否都给了。

Run: `bun run build 2>&1 | tail -20`
Expected: 构建成功。**特别确认没有 `Cannot resolve 'bun:sqlite'` 或 `node:sqlite`** —— 若有，说明 `server/session/db.ts` 的变量说明符 + `@vite-ignore` 没生效，此时给 `vite.config.ts` 加 `ssr: { external: ['bun:sqlite', 'node:sqlite'] }` 并记录原因。

- [ ] **Step 7: 变异验证**

| 变异 | 期望 |
|---|---|
| `handle` 里给 `forwardToUpstream` 传 `authorization: 'Bearer x'` | 「头对象上根本没有 authorization」与「带 cookie 也不注入」两条红 |
| `pathWithQuery` 改成 `encodeURI(url.pathname) + url.search` | 「预签名 PUT 的查询串一个字节都不改」**可能不红**（这个 fixture 里没有需要编码的字符）—— 若不红，**给 fixture 换成含空格的对象名**（`/user-file/my obj`）再重跑，直到它红 |

第二条是刻意的：它演示了「断言穿过一个无损层时测不到东西」这个本仓反复出现的缺陷类。修好后再提交。

- [ ] **Step 8: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests "`

```bash
git add src/app/routes/passthrough.$.ts src/app/routes/__tests__/passthrough.test.ts src/app/routes.ts
git commit -m "$(cat <<'EOF'
feat(bff): 透传代理与六条资源路由注册

/avatars /user-file /friends-file /apps 四个前缀：不查会话、绝不注入 Authorization。
这两条都是硬约束——这些资源自鉴权（预签名签名在查询串里、头像公开可读），查会话
会让未登录时的头像全部 401；而预签名请求再带 Authorization 会被 S3 直接 403。

「不注入」用 headers.has('authorization') === false 钉住，断言的是键不存在，
不是它的值为 null。

pathname + search 原样拼接不重新编码：X-Amz-Signature 对字节敏感。变异验证时
发现原 fixture 里没有需要编码的字符、encodeURI 变异测不出来——换成含空格的对象名
才钉得住，这正是本仓反复出现的「断言穿过无损层」那类缺陷。

四条透传路由指向同一模块，各给一个 id：RR 用 (file, id) 唯一标识路由。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: WebSocket 代理（生产 Bun.serve + 开发 Vite）

**Files:**
- Create: `server/ws/proxy.ts`
- Create: `server/ws/__tests__/proxy.test.ts`
- Modify: `server/index.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: Task 3 的会话与刷新、Task 6 的 `server/ws/registry.ts`、Task 2 的 `SESSION_SELECT_BY_ID_SQL`
- Produces:
  - `resolveWsToken(request: Request): Promise<{ ok: true; sessionId: string; token: string } | { ok: false; response: Response }>`
  - `pumpUpstream(...)`：把上游 WS 与浏览器侧 WS 接成双向管道

**这个任务为什么有两套宿主**：生产是 `Bun.serve` 的原生 `websocket` 处理器；开发是 `react-router dev` 起的 Vite server，WS 走 Vite 的 `server.proxy`。帧的收发两边都由平台做，我们只共享「cookie → token」那一段。这是**诚实的不对称**，不是隐藏的分叉。

- [ ] **Step 1: 写失败的测试**

创建 `server/ws/__tests__/proxy.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_NAME, getSessionStore, resetSessionStore } from '../../session'
import { closeSessionSockets, registerSessionSocket, unregisterSessionSocket } from '../registry'
import { resolveWsToken } from '../proxy'

const NOW = 1_000_000

async function makeSession(accessExpiresAt = NOW + 10 * 60_000): Promise<string> {
  const store = await getSessionStore()
  store.create({
    id: 'sess-1', userId: 'alice', accessToken: 'AT-live', refreshToken: 'RT-live',
    accessExpiresAt, user: { user_id: 'alice' }, now: NOW, userAgent: null,
  })
  return 'sess-1'
}

const upgradeReq = (cookie?: string) =>
  new Request('http://app.test/ws', {
    headers: {
      ...(cookie ? { cookie } : {}),
      upgrade: 'websocket', connection: 'Upgrade',
      'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    },
  })

describe('resolveWsToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    process.env.SESSION_DB_PATH = ':memory:'
    process.env.SESSION_COOKIE_SECURE = 'false'
    resetSessionStore()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('有效会话：拿到 token 与 sessionId', async () => {
    const id = await makeSession()
    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=${id}`))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.token).toBe('AT-live')
      expect(result.sessionId).toBe(id)
    }
  })

  it('没有 cookie：不 ok，给一个 401 响应', async () => {
    const result = await resolveWsToken(upgradeReq())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('会话不存在：不 ok，401', async () => {
    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=不存在`))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('临期时先刷新，拿到的是新 token', async () => {
    const id = await makeSession(NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, code: 200, data: { access_token: 'AT-new', expires_in: 900 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))

    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=${id}`))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.token).toBe('AT-new')
  })

  it('刷新时上游 401：不 ok，401，会话已删', async () => {
    const id = await makeSession(NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))

    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=${id}`))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
    expect((await getSessionStore()).get(id)).toBe(null)
  })

  it('刷新时上游 5xx：不 ok，502，会话保留', async () => {
    const id = await makeSession(NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response('{"code":502}', { status: 502 }))

    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=${id}`))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(502)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })
})

describe('会话 WS 登记表', () => {
  it('登出时关掉该会话名下所有连接，用 code 1000', () => {
    const closed: number[] = []
    const a = { close: (code?: number) => closed.push(code ?? 0) }
    const b = { close: (code?: number) => closed.push(code ?? 0) }

    registerSessionSocket('s1', a)
    registerSessionSocket('s1', b)
    closeSessionSockets('s1')

    expect(closed).toEqual([1000, 1000])
  })

  it('只关目标会话的连接，别人的不动', () => {
    let mineClosed = false
    let othersClosed = false
    registerSessionSocket('s1', { close: () => { mineClosed = true } })
    registerSessionSocket('s2', { close: () => { othersClosed = true } })

    closeSessionSockets('s1')

    expect(mineClosed).toBe(true)
    // 正对照：上一条证明 close 真的会被调用，所以这里的 false 有意义
    expect(othersClosed).toBe(false)
  })

  it('注销之后不再被关（避免关一个已经断开的连接）', () => {
    let closed = false
    const socket = { close: () => { closed = true } }
    registerSessionSocket('s1', socket)
    unregisterSessionSocket('s1', socket)

    closeSessionSockets('s1')

    expect(closed).toBe(false)
  })

  it('close 抛错不影响关同一会话的其余连接', () => {
    let secondClosed = false
    registerSessionSocket('s1', { close: () => { throw new Error('already closed') } })
    registerSessionSocket('s1', { close: () => { secondClosed = true } })

    closeSessionSockets('s1')

    expect(secondClosed).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test server/ws 2>&1 | tail -6`
Expected: FAIL —— 找不到 `../proxy`

- [ ] **Step 3: 写 WS 代理**

创建 `server/ws/proxy.ts`：

```ts
import {
  SessionDead,
  UpstreamUnavailable,
  ensureFreshAccessToken,
  getSessionStore,
  readSessionId,
  sessionExpiredResponse,
  upstreamUnavailableResponse,
} from '../session'
import { upstreamWs } from '../upstream'
import { registerSessionSocket, unregisterSessionSocket } from './registry'

export type WsAuth =
  | { ok: true; sessionId: string; token: string }
  | { ok: false; response: Response }

/**
 * WS 升级前的鉴权：cookie → 会话 → 惰性刷新 → 拿到 access token。
 *
 * 失败时返回的是**HTTP 响应**而不是抛错：升级请求还没变成 WebSocket，此时
 * 唯一能表达失败的方式就是普通 HTTP 状态码。浏览器侧会看到 close 1006
 * （握手失败），现有的重连退避会接管。
 */
export async function resolveWsToken(request: Request): Promise<WsAuth> {
  const sessionId = readSessionId(request)
  if (!sessionId) return { ok: false, response: sessionExpiredResponse() }

  const store = await getSessionStore()
  const session = store.get(sessionId)
  if (!session) return { ok: false, response: sessionExpiredResponse() }

  try {
    const token = await ensureFreshAccessToken(store, session)
    return { ok: true, sessionId, token }
  } catch (error) {
    if (error instanceof SessionDead) return { ok: false, response: sessionExpiredResponse() }
    if (error instanceof UpstreamUnavailable) return { ok: false, response: upstreamUnavailableResponse() }
    throw error
  }
}

/** 浏览器侧连接需要的最小接口（Bun 的 ServerWebSocket 的子集） */
export interface ClientSocket {
  send(data: string | ArrayBufferLike): void
  close(code?: number, reason?: string): void
}

export interface UpstreamPump {
  /** 浏览器 → 上游 */
  forward(data: string | ArrayBufferLike): void
  /** 浏览器侧关了，关上游 */
  close(code?: number, reason?: string): void
}

/**
 * 开上游连接并接成双向管道。
 *
 * token 只出现在**这一处** —— 上游 URL 的查询串里，服务端内部。浏览器从头到尾
 * 看不到它。（后端只支持 `?token=` 这一种 WS 鉴权方式，全部文档里没有任何
 * cookie 支持，所以这个查询串在服务端侧无法避免；能做到的是让它不出现在
 * 浏览器、不出现在浏览器历史、不出现在前端日志里。）
 */
export function pumpUpstream(sessionId: string, token: string, client: ClientSocket): UpstreamPump {
  const url = `${upstreamWs()}/ws?token=${encodeURIComponent(token)}`
  const upstream = new WebSocket(url)
  const queue: (string | ArrayBufferLike)[] = []
  let open = false

  registerSessionSocket(sessionId, client)

  upstream.onopen = () => {
    open = true
    // 上游握手完成前浏览器可能已经发了帧，补发出去，不丢
    for (const item of queue) upstream.send(item as string)
    queue.length = 0
  }

  upstream.onmessage = (event: MessageEvent) => {
    client.send(event.data as string | ArrayBufferLike)
  }

  upstream.onclose = (event: CloseEvent) => {
    unregisterSessionSocket(sessionId, client)
    // 用上游的 code 关浏览器侧：access token 到期导致的关闭要如实传下去，
    // 客户端的重连才会在新一次升级里触发刷新。
    try {
      client.close(event.code, event.reason)
    } catch {
      // 已经关了
    }
  }

  upstream.onerror = () => {
    unregisterSessionSocket(sessionId, client)
    try {
      client.close(1011, 'upstream error')
    } catch {
      // 已经关了
    }
  }

  return {
    forward(data) {
      if (open) upstream.send(data as string)
      else queue.push(data)
    },
    close(code, reason) {
      unregisterSessionSocket(sessionId, client)
      try {
        upstream.close(code, reason)
      } catch {
        // 已经关了
      }
    },
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun run test server/ws 2>&1 | tail -6`
Expected: PASS，10 条

- [ ] **Step 5: 接进生产 server/index.ts**

修改 `server/index.ts`：

在文件顶部 import 区（`filterSensitiveData` 那一行之后）追加：
```ts
import { type UpstreamPump, pumpUpstream, resolveWsToken } from './ws/proxy'
```

在 `Bun.serve({` 的 `port: PORT,` 之后、`async fetch(request) {` 之前插入 WS 升级分支所需的类型，并在 `fetch` 内**最前面**（`const url = new URL(request.url)` 之后）插入：

```ts
    // WS 升级：cookie → 会话 → token，然后把连接交给下面的 websocket 处理器。
    // 必须在 handler(request) 之前 —— RR 的 request handler 不认识升级请求。
    if (url.pathname === '/ws' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const auth = await resolveWsToken(request)
      // 失败时返回普通 HTTP 响应：升级还没发生，这是唯一能表达失败的方式。
      // 浏览器侧看到 close 1006，现有重连退避接管。
      if (!auth.ok) return withSecurityHeaders(auth.response)

      const upgraded = server.upgrade(request, { data: { sessionId: auth.sessionId, token: auth.token } })
      if (upgraded) return undefined as unknown as Response
      return withSecurityHeaders(new Response('升级失败', { status: 400 }))
    }
```

把 `Bun.serve({` 改成 `const server = Bun.serve({`（`server.upgrade` 要用到它），并在 `fetch` 之后追加 `websocket` 处理器：

```ts
  websocket: {
    open(ws) {
      const { sessionId, token } = ws.data as { sessionId: string; token: string }
      // 管道存回 ws.data：Bun 的 ServerWebSocket 没有别的地方挂状态
      ;(ws.data as { pump?: UpstreamPump }).pump = pumpUpstream(sessionId, token, ws)
    },
    message(ws, message) {
      ;(ws.data as { pump?: UpstreamPump }).pump?.forward(message as string | ArrayBufferLike)
    },
    close(ws, code, reason) {
      ;(ws.data as { pump?: UpstreamPump }).pump?.close(code, reason)
    },
  },
```

同时把 `fetch(request)` 的签名改成 `async fetch(request, server)` —— 不用外层的 `server` 变量也行，但用参数更清晰；两种都可以，**选一种并保持一致**。

- [ ] **Step 6: 接进开发 vite.config.ts**

修改 `vite.config.ts`：

顶部 import 追加：
```ts
import { DatabaseSync } from 'node:sqlite'
import { SESSION_SELECT_BY_ID_SQL } from './server/session/sql'
```

把 `server: { port: 3000 }` 替换为：

```ts
    server: {
      port: 3000,
      proxy: {
        // 开发环境的 WS 代理。
        //
        // 为什么不能和生产共用一段代码：生产是 Bun.serve 的原生 websocket 处理器，
        // 开发是 `react-router dev` 起的 Vite server —— 帧的收发两边都由平台做，
        // 我们只共享「cookie → token」这一段。这是诚实的不对称，不是隐藏的分叉。
        //
        // ⚠️ proxyReqWs 是**同步**回调，读不了异步打开的 session store，
        // 所以这里自己用 node:sqlite 同步查一次。语句从 server/session/sql.ts 取，
        // 与 store 共用同一份字符串，避免两处各写一遍 SELECT 然后分叉。
        //
        // 同步也意味着**这里不能刷新 token**：连接时若 access token 已过期，
        // 上游会在握手时回 401，客户端现有的重连退避接管；而 ChatPage 挂载时的
        // loadProfile() 总会先经 /api/* 把它刷新。开发环境可以接受这个限制。
        '/ws': {
          target: env.BFF_UPSTREAM_WS || 'ws://127.0.0.1:8787',
          ws: true,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReqWs', (proxyReq, req) => {
              const cookie = req.headers.cookie ?? ''
              const match = /(?:^|;\s*)hv_session=([^;]+)/.exec(cookie)
              if (!match) return

              const dbPath = env.SESSION_DB_PATH
              if (!dbPath) return

              try {
                const db = new DatabaseSync(dbPath)
                const row = db.prepare(SESSION_SELECT_BY_ID_SQL).get(match[1]) as { access_token?: string } | undefined
                db.close()
                if (row?.access_token) {
                  proxyReq.path = `/ws?token=${encodeURIComponent(row.access_token)}`
                }
              } catch {
                // 读不到就让上游按「没有 token」处理（HTTP 400），不静默伪造一个
              }
            })
          },
        },
      },
    },
```

⚠️ `env` 是 `loadEnv(mode, process.cwd(), '')` 的结果，已经在文件里存在 —— 第三个参数是 `''`，所以它会加载**所有**变量（不只 `VITE_` 前缀），`BFF_UPSTREAM_WS` 与 `SESSION_DB_PATH` 能读到。

- [ ] **Step 7: 验证构建与 dev 启动**

Run: `bunx tsc --noEmit && bun run build 2>&1 | tail -12`
Expected: 构建成功

Run:
```bash
SESSION_DB_PATH=/tmp/hv-dev-sessions.sqlite BFF_UPSTREAM_HTTP=http://127.0.0.1:8787 BFF_UPSTREAM_WS=ws://127.0.0.1:8787 timeout 25 bun run dev 2>&1 | head -20
```
Expected: Vite 正常启动、打印本地地址，**没有** `node:sqlite` 或 `bun:sqlite` 解析错误。（`edge` 没起时打 `/ws` 会失败，这一步只验证启动。）

- [ ] **Step 8: 变异验证**

| 变异 | 期望 |
|---|---|
| `resolveWsToken` 里 `UpstreamUnavailable` 分支改成 `sessionExpiredResponse()` | 「刷新时上游 5xx：502，会话保留」红 |
| `resolveWsToken` 去掉 `ensureFreshAccessToken`、直接用 `session.accessToken` | 「临期时先刷新」红 |
| `closeSessionSockets` 的 `close(1000, …)` 改成 `close()` | 「用 code 1000」红 |
| `closeSessionSockets` 里去掉 try/catch | 「close 抛错不影响其余连接」红 |
| `unregisterSessionSocket` 改成空函数 | 「注销之后不再被关」红 |

五条各自恰好红对应用例。观察后还原。

- [ ] **Step 9: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun run test:bun 2>&1 | tail -4`

```bash
git add server/ws server/index.ts vite.config.ts
git commit -m "$(cat <<'EOF'
feat(bff): WebSocket 代理——浏览器连同源 /ws，token 只出现在服务端

浏览器 `new WebSocket('/ws')` 不带任何凭证；BFF 在升级前用 cookie 查会话、惰性
刷新，然后开上游 ws://edge:8787/ws?token=… 接成双向管道。后端只支持 ?token=
这一种 WS 鉴权（全部文档无 cookie 支持），所以查询串在服务端侧无法避免；能做到的
是让它不出现在浏览器、不出现在浏览器历史、不出现在前端日志——那正是上线前控制台
一行日志打出两个完整 JWT 的来源。

升级失败时返回普通 HTTP 响应而不是抛错：升级还没发生，这是唯一能表达失败的方式。
上游关闭时用它的 code 关浏览器侧，access token 到期要如实传下去，客户端重连才会
在新一次升级里触发刷新。

生产是 Bun.serve 的原生 websocket 处理器，开发是 Vite 的 server.proxy——帧收发
两边都由平台做，只共享「cookie → token」那一段，是诚实的不对称。Vite 的
proxyReqWs 是同步回调，读不了异步 store，所以自己用 node:sqlite 同步查一次，
语句从零 import 的 server/session/sql.ts 取以免分叉；同步也意味着 dev 下不能刷新，
上游会在握手时回 401 由现有重连接管。

变异验证五条各自恰好红：把上游 5xx 当会话失效 / 去掉惰性刷新 / close 不带 1000 /
去掉 try-catch / 注销变空函数。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 客户端 authStore 改为会话制

**Files:**
- Modify: `src/features/auth/store/authStore.ts`
- Modify: `src/features/auth/types/auth.ts`
- Modify: `src/features/chat/components/ChatPage.tsx`
- Modify: `src/features/chat/hooks/useRealtimeMessages.ts`
- Modify: `src/features/ai/components/AiChatPage.tsx`
- Modify: `src/features/auth/components/ProtectedRoute.tsx`
- Modify: `src/features/auth/store/__tests__/authStore.test.ts`
- Modify: `src/features/auth/store/__tests__/sessionHandoff.test.tsx`
- Modify: `src/features/auth/api/auth.ts`

**Interfaces:**
- Produces: `useAuthStore` 的新形状 —— state 只有 `user / isAuthenticated / isRestoring`；action 只有 `login / logout / restoreSession / clearAuth`
- Consumes: BFF 的 `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/session`

**这五个文件必须一次改完**：它们都读 `accessToken`，分开改 `tsc` 不可能过。

- [ ] **Step 1: 写失败的测试（先改测试，再改实现）**

在 `src/features/auth/store/__tests__/authStore.test.ts` 里：

- **删除**整个 `describe('authStore.refreshAccessToken —— 与 login 逐字同构的第二处静默故障')`、`describe('authStore.refreshAccessToken —— 并发刷新竞态')`、`describe('refreshAccessToken —— 会话结束之后才落地的刷新结果')`、`describe('refreshAccessToken —— 传输层失败 vs 真的 401')`、`describe('setTokens —— 会话进行中才成立的前置条件')` —— 这些 action 全部不再存在。删掉时在文件顶部留一段注释说明去向：

```ts
/**
 * ⚠️ 本文件在 BFF 会话层落地时删掉了五组用例：refreshAccessToken 的四组
 * （信封解包、并发竞态、会话结束后落地、传输失败 vs 真 401）与 setTokens 那一组。
 *
 * 不是「不再测这些行为」——那些规则**整体搬到了服务端**：
 * - 刷新的分档与单飞：`server/session/__tests__/refresh.test.ts`
 * - 会话边界：BFF 只认 cookie，客户端手里已经没有 token 可以在边界上写错
 *
 * 客户端这一侧现在只需要证明三件事：登录后 store 里没有 token、启动靠
 * GET /api/session、502 不等于登出。
 */
```

- **新增**：

```ts
describe('authStore.login —— 打 BFF，store 里不留 token', () => {
  it('登录成功后 store 里只有 user 与 isAuthenticated，没有任何 token 字段', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { user: { user_id: 'alice', nickname: '爱丽丝' } } }))

    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    const state = useAuthStore.getState() as unknown as Record<string, unknown>
    expect(state.isAuthenticated).toBe(true)
    expect((state.user as { nickname?: string }).nickname).toBe('爱丽丝')
    // 这是本设计的核心断言：token 字段在 store 上根本不存在
    expect('accessToken' in state).toBe(false)
    expect('refreshToken' in state).toBe(false)
    expect('tokenExpiry' in state).toBe(false)
  })

  it('登录打的是同源 /api/auth/login，且带 credentials', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { user: { user_id: 'alice' } } }))

    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login')
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('same-origin')
  })

  it('登录失败透出后端文案，且不进登录态', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, error: '用户名或密码错误' }, 401))

    await expect(useAuthStore.getState().login({ user_id: 'alice', password: 'bad' })).rejects.toThrow(/用户名或密码错误/)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('authStore.restoreSession —— 启动时的唯一真值', () => {
  it('200：写入 user 并进登录态', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { user: { user_id: 'bob', nickname: '鲍勃' } } }))

    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.nickname).toBe('鲍勃')
  })

  it('401：清空登录态（这才是「未登录」）', async () => {
    useAuthStore.setState({ user: { user_id: 'old' }, isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, error: '会话已失效，请重新登录' }, 401))

    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBe(null)
  })

  it('502：保持上一次状态、记错误，**不**清空登录态（后端挂了 ≠ 用户退出了）', async () => {
    useAuthStore.setState({ user: { user_id: 'old', nickname: '老状态' }, isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 502, error: '后端暂时不可用，请稍后重试' }, 502))

    await useAuthStore.getState().restoreSession()

    // 正对照在上一条：401 时确实会清空。所以这里的「没清空」有意义
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.nickname).toBe('老状态')
    expect(useAuthStore.getState().error).toContain('后端暂时不可用')
  })

  it('网络失败：同 502，保持状态不登出', async () => {
    useAuthStore.setState({ user: { user_id: 'old' }, isAuthenticated: true })
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})

describe('authStore.logout', () => {
  it('打 BFF 的 logout 并清空本地登录态', async () => {
    useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200 }))

    await useAuthStore.getState().logout()

    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/logout')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBe(null)
  })

  it('BFF 不可达也照样清空本地态（点了登出就该登出）', async () => {
    useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
```

- 把 `auth-storage` 迁移那一组改成断言**旧 token 字段被删掉**：

```ts
  it('迁移把落盘的 token 字段删掉（JWT 留在 localStorage 里正是要消灭的东西）', () => {
    const migrated = migrateAuthPersist({
      state: { accessToken: 'AT', refreshToken: 'RT', tokenExpiry: 123, isAuthenticated: true, user: { user_id: 'alice', avatar_url: 'avatars/a.png' } },
      version: 1,
    }) as { state: Record<string, unknown> }

    expect('accessToken' in migrated.state).toBe(false)
    expect('refreshToken' in migrated.state).toBe(false)
    expect('tokenExpiry' in migrated.state).toBe(false)
    // 正对照：user 保留（首帧渲染要用），且头像仍被补成绝对地址
    expect((migrated.state.user as { user_id: string }).user_id).toBe('alice')
  })
```

- `sessionHandoff.test.tsx` 里所有 seed `accessToken` / `refreshToken` 的地方改成只 seed `user` + `isAuthenticated`；断言「A 的落盘副本一个都不剩」保留 —— 它盯的是清盘，与 token 无关。

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/features/auth 2>&1 | tail -10`
Expected: FAIL —— `restoreSession is not a function` 等

- [ ] **Step 3: 改类型**

修改 `src/features/auth/types/auth.ts` 的 `AuthState`：删掉 `accessToken` / `refreshToken` / `tokenExpiry`，加 `isRestoring: boolean` 与 `error: string | null`（若原本没有）。保留 `User` 不变。

- [ ] **Step 4: 改 authStore**

`src/features/auth/store/authStore.ts` 的改动清单（逐条执行）：

1. **删除**：`authTokenPayload`、`refreshTokenPayload`、`parseTokenPayload`、`AuthTokenPayload`、`RefreshTokenPayload`、`AUTH_TOKEN_LEGACY_BARE`、`refreshInFlight`、`lastRotatedAt`、`RECENT_ROTATION_WINDOW_MS`、模块顶部那个 `registerSessionReset(...)`（它清的就是这两个变量）、`refreshAccessToken`、`checkTokenExpiry`、`clearCredentials`、`setTokens`。
2. **`login`** 改为：

```ts
      login: async (credentials: LoginRequest) => {
        // 打的是**同源** BFF，不是后端。BFF 会 Set-Cookie，浏览器手里从此
        // 只有一个 httpOnly cookie —— 它读不到、JS 拿不到、也塞不进 URL。
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: credentials.user_id, password: credentials.password }),
        })

        // device_info 由 BFF 用请求的 User-Agent 填 —— 浏览器侧唯一有意义的
        // 设备标识就是它，客户端不必再传。
        const data = await readEnvelope<{ user: User }>(response, {
          endpoint: 'POST /api/auth/login',
          fallbackMessage: '登录失败',
          parse: { parse: (input) => {
            const record = input as { user?: unknown } | null
            const user = record && typeof record === 'object' ? record.user : null
            if (!user || typeof user !== 'object' || typeof (user as User).user_id !== 'string') {
              throw new Error('user 缺失或不是对象')
            }
            return { user: user as User }
          } },
        })

        // 新会话从这一行开始，必须在 set() 之前：beginSession 开场就清盘
        beginSession()

        set({
          user: { ...data.user, avatar_url: toAbsoluteApiUrl(data.user.avatar_url) },
          isAuthenticated: true,
          error: null,
        })
      },
```

3. **`logout`** 改为：

```ts
      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
        } catch {
          // BFF 不可达不能阻止本地登出：用户点了登出就该登出
        }
        get().clearAuth()
      },
```

4. **`register`** 改为打同源 BFF（路径与原来一致，只是不再拼绝对基址）：

```ts
      register: async (data: RegisterRequest) => {
        // 同源。注册**不建会话** —— 后端注册接口不返回 token，成功后仍要走一次登录，
        // 现有 RegisterForm 的「注册成功 → 跳登录页」流程不变。
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: data.user_id, nickname: data.nickname, email: data.email, password: data.password,
          }),
        })
        await assertEnvelopeOk(response, { endpoint: 'POST /api/auth/register', fallbackMessage: '注册失败' })
      },
```

5. **新增 `restoreSession`**：

```ts
      /**
       * 启动时问 BFF「我登录了吗」。这是**唯一真值** —— 落盘的那份 `user` 只用于
       * 首帧把头像昵称画出来，永远不当授权依据。
       *
       * 401 = 未登录。**502 / 网络失败 ≠ 未登录** —— 后端挂了不等于用户退出了，
       * 那时保持上一次状态、记一个可重试的错误，不清盘不跳登录。这是 P4b 那条
       * 「传输失败 ≠ 会话结束」在客户端侧的镜像。
       */
      restoreSession: async () => {
        set({ isRestoring: true, error: null })
        try {
          const response = await fetch('/api/session', { credentials: 'same-origin' })

          if (response.status === 401) {
            get().clearAuth()
            set({ isRestoring: false })
            return
          }

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null
            set({ isRestoring: false, error: body?.error ?? '无法确认登录状态，请稍后重试' })
            return
          }

          const body = (await response.json()) as { data?: { user?: User } }
          const user = body.data?.user
          if (!user || typeof user.user_id !== 'string') {
            set({ isRestoring: false, error: '会话响应形状不符合预期' })
            return
          }

          set({
            user: { ...user, avatar_url: toAbsoluteApiUrl(user.avatar_url) },
            isAuthenticated: true,
            isRestoring: false,
            error: null,
          })
        } catch {
          // 网络失败：同 502，保持状态
          set({ isRestoring: false, error: '无法确认登录状态，请稍后重试' })
        }
      },
```

6. **`clearAuth`** 改为只清 `user` / `isAuthenticated` / `error`，保留 `endSession()`。
7. **`migrateAuthPersist`** 增加删除旧 token 字段：

```ts
export function migrateAuthPersist(persisted: unknown): unknown {
  const wrapper = persisted as { state?: Record<string, unknown> } | null
  if (!wrapper || typeof wrapper !== 'object' || !wrapper.state) return persisted
  // 显式剔除，不是「不再读它们」：JWT 留在 localStorage 里正是这一批要消灭的东西。
  // 已部署用户的盘上有一对真实可用的 token，迁移必须真的删掉它。
  const { accessToken: _a, refreshToken: _r, tokenExpiry: _t, ...rest } = wrapper.state
  const user = rest.user as { avatar_url?: string } | null | undefined
  if (!user || typeof user !== 'object') return { ...wrapper, state: rest }
  return { ...wrapper, state: { ...rest, user: { ...user, avatar_url: toAbsoluteApiUrl(user.avatar_url) } } }
}
```

8. **`AUTH_PERSIST_VERSION`** +1。
9. **`partialize`** 只留 `{ user: state.user }` —— `isAuthenticated` 也不落盘（它由 `restoreSession` 决定，落盘会让「盘上说已登录、实际 cookie 已过期」这种半状态复活）。
10. 初始 state：`{ user: null, isAuthenticated: false, isRestoring: false, error: null }`。

- [ ] **Step 4b: 清掉 `authApi.logout` 这条第二路径**

`src/features/auth/api/auth.ts` 里 `logout`（约 `:48`）用 `fetchWithAuth` 打
`${getAuthApiUrl()}/logout`。Task 12 之后 `getAuthApiUrl()` 返回 `/api/auth`，
于是它**也**会打到 BFF 的 logout 路由 —— 与 `authStore.logout` 构成两条并存路径。

**删掉 `authApi.logout`**，并删掉 `src/features/auth/api/__tests__/auth.test.ts` 里
`describe('authApi.revokeDevice / logout')` 中属于 logout 的用例（`revokeDevice`
的保留）。加注释说明：

```ts
// ⚠️ 这里原来有一个 `logout`。BFF 落地后删掉了：登出现在唯一的入口是
// `authStore.logout()` —— 它打同源 `/api/auth/logout`，由 BFF 删会话、清 cookie、
// 关该会话名下的 WS。留着这一个会构成第二条路径，而它做不到后三件事。
// `getDevices` / `revokeDevice` 保留：它们经 `/api/*` 代理正常工作。
```

- [ ] **Step 5: 改四个消费方**

- `ProtectedRoute.tsx`：把 persist 水合那两个 effect 换成：挂载时若 `!isAuthenticated && !isRestoring` 则调 `restoreSession()`；`isRestoring` 为真时渲染 `<SimpleLoading />`；`!isAuthenticated && !isRestoring` 时 `router.replace(DEFAULT_UNAUTHENTICATED_ROUTE)`。**保留 `useRouter()` 的引用稳定性写法** —— 那是 `be14018` 修过的无限循环。
- `ChatPage.tsx:28/47/57`：`const { user, accessToken }` → `const { user, isAuthenticated }`；`if (user && accessToken)` → `if (user && isAuthenticated)`；依赖数组里 `accessToken` → `isAuthenticated`。
- `useRealtimeMessages.ts:25/36/40`：同样换成 `isAuthenticated`。
- `AiChatPage.tsx:36/82`：删掉 `accessToken` 的读取与 `headers.Authorization = ...` 那一行；改为在 fetch 里加 `credentials: 'same-origin'`（同源 cookie 自动带上）。

- [ ] **Step 6: 运行测试确认通过**

Run: `bun run test src/features/auth src/features/chat 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 7: 变异验证**

| 变异 | 期望 |
|---|---|
| `login` 的 `set()` 里加回 `accessToken: 'AT'` | 「store 里没有任何 token 字段」红 |
| `restoreSession` 的 `!response.ok` 分支改成 `get().clearAuth()` | 「502：保持上一次状态」与「网络失败：同 502」红 |
| `migrateAuthPersist` 去掉剔除、改成原样返回 | 「迁移把落盘的 token 字段删掉」红 |
| `logout` 的 `clearAuth()` 挪进 `try` 内 | 「BFF 不可达也照样清空本地态」红 |
| `partialize` 加回 `isAuthenticated` | 需**新增**一条用例钉住「isAuthenticated 不落盘」 —— 按此补上 |

最后一条是刻意留的空档，按它补一条用例再重跑。

- [ ] **Step 8: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests "`

```bash
git add src/features/auth src/features/chat/components/ChatPage.tsx src/features/chat/hooks/useRealtimeMessages.ts src/features/ai/components/AiChatPage.tsx
git commit -m "$(cat <<'EOF'
refactor(auth)!: authStore 改为会话制，客户端不再持有任何 token

state 只剩 user / isAuthenticated / isRestoring / error；删掉 refreshAccessToken、
checkTokenExpiry、setTokens、clearCredentials、refreshInFlight、lastRotatedAt
与它们的会话边界回调——刷新的分档与单飞整体搬到了服务端
（server/session/__tests__/refresh.test.ts），客户端手里已经没有 token 可以在
边界上写错。

启动改问 GET /api/session，这是唯一真值；落盘的 user 只用于首帧渲染。401 = 未登录，
502 / 网络失败 ≠ 未登录：那时保持上一次状态、记可重试的错误，不清盘不跳登录——
P4b 那条「传输失败 ≠ 会话结束」在客户端侧的镜像。

persist 迁移**显式剔除**旧 token 字段而不是「不再读它们」：已部署用户盘上有一对
真实可用的 token，JWT 留在 localStorage 里正是这一批要消灭的东西。isAuthenticated
也不落盘，否则「盘上说已登录、实际 cookie 已过期」这种半状态会复活。

删掉五组 refreshAccessToken / setTokens 用例，并在测试文件顶部写明去向，避免读者
误以为这些行为不再被测。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `authedFetch` 退化与 `wsStore` 同源

**Files:**
- Modify: `src/api/authedFetch.ts`
- Modify: `src/store/wsStore.ts`
- Modify: `src/api/__tests__/authedFetch.test.ts`
- Modify: `src/api/__tests__/sessionScopedFetchWithAuth.test.ts`
- Modify: `src/store/__tests__/wsStore.test.ts`
- Delete: `src/api/__tests__/sessionScopedFetchWithAuth.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `isBusiness401Request`（内部改用 `isBusiness401Path`）、Task 10 的 `useAuthStore.clearAuth`
- Produces: `fetchWithAuth(url, options?) => Promise<Response>`（签名不变，行为退化为同源 fetch，**不再刷新、不再重试、不再注入 Authorization**）。全仓 11 个 api 模块的调用点一行不用改。

- [ ] **Step 1: 改测试（大幅收缩）**

`src/api/__tests__/authedFetch.test.ts`：删掉预刷新、401 刷新重试、`pinSession` 相关的全部用例（它们测的能力已经不存在），保留/新增：

```ts
  it('带 credentials: same-origin，不带 Authorization 头', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await fetchWithAuth('/api/friends')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.credentials).toBe('same-origin')
    expect(new Headers(init.headers).has('authorization')).toBe(false)
  })

  it('普通端点 401：clearAuth 并跳登录页', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))
    await fetchWithAuth('/api/friends')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(hrefSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })

  it('业务 401 端点（改密）401：不 clearAuth、不跳转', async () => {
    useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))
    await fetchWithAuth('/api/profile/password', { method: 'PUT' })
    // 正对照在上一条：普通端点确实会跳。所以这里的「没跳」有意义
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(hrefSpy).not.toHaveBeenCalled()
  })

  it('**只发一次请求**：没有刷新重试（重试 = 重放非幂等请求）', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))
    await fetchWithAuth('/api/profile', { method: 'PUT', body: '{}' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
```

`src/api/__tests__/sessionScopedFetchWithAuth.test.ts`：这个文件盯的是「十份副本各自带 `isLiveSession()`」，而现在只有一份客户端 fetch、且它不再刷新也不再 `clearAuth` 跨会话。**整个文件删除**，并在 `authedFetch.test.ts` 顶部注释写明：

```ts
/**
 * ⚠️ sessionScopedFetchWithAuth.test.ts 已删除。它钉的是「十份 fetchWithAuth
 * 副本各自带 isLiveSession() 闸门」——那个问题的成因（客户端持有 token、会在
 * 会话边界上刷新与清盘）在 BFF 落地后不存在了：现在客户端不刷新、不持 token，
 * 401 只做「清本地态 + 跳登录」，跨会话最坏结果是多跳一次登录页。
 */
```

`src/store/__tests__/wsStore.test.ts`：断言 URL 与不含 token：

```ts
  it('连的是同源 /ws，URL 里没有 token', () => {
    useWsStore.getState().connect()
    const url = String((globalThis.WebSocket as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])
    expect(url).toBe('/ws')
    expect(url).not.toContain('token')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/api src/store 2>&1 | tail -10`
Expected: FAIL

- [ ] **Step 3: 改 authedFetch**

`src/api/authedFetch.ts` 改动：

1. 删除 `getAuthHeaders`、`supersededByAnotherSession`、`SESSION_CHANGED_BEFORE_SEND`、`sendOnce` 里的预刷新与 401 重试逻辑、`pinSession` / `isSessionLive` 的 import、`BASE_URL`（同源后不需要）。
2. `fetchWithAuth` 改为：

```ts
/**
 * 同源 fetch。**不带 Authorization、不刷新、不重试。**
 *
 * 凭证是 httpOnly cookie，浏览器自动带上（`credentials: 'same-origin'`）；
 * token 由 BFF 持有，刷新在 BFF 转发**之前**完成（见 `server/session/refresh.ts`）。
 * 客户端在 401 上唯一要做的判断是「这是不是业务 401」：
 * - 是（改密打错旧密码）→ 什么都不做，让调用方读后端文案；
 * - 不是 → 清本地登录态并跳登录页。
 *
 * 刻意**不**做「401 后重试」：BFF 已经保证了新鲜度，重试只会重放一个非幂等请求。
 */
export const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const response = await fetch(url, { ...options, credentials: 'same-origin' })

  if (response.status === 401 && !isBusiness401Request(options.method, url)) {
    useAuthStore.getState().clearAuth()
    redirectToLogin()
  }

  return response
}
```

3. `isBusiness401Request` 里 `new URL(url, BASE_URL)` 改成 `new URL(url, 'http://localhost')` —— 同源相对路径需要一个基址才能解析出 pathname，用哪个都不影响结果；加注释说明。
4. 删除 `src/api/__tests__/sessionScopedFetchWithAuth.test.ts`。

- [ ] **Step 4: 改 wsStore**

`src/store/wsStore.ts`：

1. `const url = \`${wsBaseUrl}/ws?token=${encodeURIComponent(authStore.accessToken)}\`` → `const url = '/ws'`，删掉 `getWsUrl()` 的 import 与调用。加注释：

```ts
        // 同源相对地址：协议由浏览器按 location 推（https → wss）。
        // **不带 token** —— 凭证是 httpOnly cookie，BFF 在升级时用它查会话、
        // 惰性刷新，再开上游 ws://edge:8787/ws?token=…。token 从此不出现在
        // 浏览器、URL、浏览器历史与前端日志里（上线前控制台一行日志会打出
        // 两个完整 JWT，那正是这条要消灭的）。
        const url = '/ws'
```

2. 删掉 `TOKEN_REFRESH_THRESHOLD` 与 `scheduleReconnect` 里那整段「连续失败 3 次就刷 token」的逻辑（`shouldRefreshToken`、`await authStore.refreshAccessToken()` 及其注释）。重连退避本身保留。加注释说明去向：

```ts
    // ⚠️ 这里原来有一段「连续失败 3 次就刷 token 再重连」。BFF 落地后删掉了：
    // 刷新发生在 BFF 的升级处理里（server/ws/proxy.ts 的 resolveWsToken），
    // 客户端手里没有 token 可刷。上游因 access token 到期关闭时，BFF 用它的
    // close code 关浏览器侧，下面的退避重连会触发新一次升级，那一次自然带上
    // 刷新后的 token。
```

3. `wsStore.ts` 里若还有 `authStore.accessToken` 的读取（比如判断「有没有 token 再连」），改成 `authStore.isAuthenticated`。

- [ ] **Step 5: 运行确认通过**

Run: `bun run test src/api src/store 2>&1 | tail -8`
Expected: PASS

- [ ] **Step 6: 变异验证**

| 变异 | 期望 |
|---|---|
| `fetchWithAuth` 里 401 分支去掉 `!isBusiness401Request(...)` | 「业务 401 端点：不 clearAuth 不跳转」红 |
| `fetchWithAuth` 里加回一段「401 就重发一次」 | 「只发一次请求」红 |
| `credentials: 'same-origin'` 删掉 | 「带 credentials」红 |
| `wsStore` 的 url 改回 `` `${getWsUrl()}/ws?token=x` `` | 「连的是同源 /ws，URL 里没有 token」红 |

- [ ] **Step 7: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests "`

```bash
git add src/api src/store
git commit -m "$(cat <<'EOF'
refactor(api)!: authedFetch 退化为同源 fetch，WS 连 /ws 不带 token

authedFetch 不再注入 Authorization、不预刷新、不做 401 重试、不再需要 pinSession：
凭证是 httpOnly cookie 由浏览器自动带上，新鲜度在 BFF 转发之前保证。401 上唯一的
判断是「是不是业务 401」——是就什么都不做让调用方读后端文案，不是就清本地态跳登录。

wsStore 连同源 '/ws'，协议由 location 推。删掉「连续失败 3 次刷 token」那段：
刷新在 BFF 的升级处理里做，客户端手里没有 token 可刷；上游因 token 到期关闭时
BFF 用它的 code 关浏览器侧，退避重连触发的新一次升级自然带上刷新后的 token。

删除 sessionScopedFetchWithAuth.test.ts 并在 authedFetch.test.ts 顶部写明原因：
它钉的是「十份副本各自带 isLiveSession() 闸门」，而那个问题的成因（客户端持有
token、在会话边界上刷新与清盘）已经不存在。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: 同源基址、移除切换服务器、设备页登出

**Files:**
- Modify: `src/lib/apiConfig.ts`
- Modify: `src/lib/__tests__/apiConfig.test.ts`
- Modify: `src/features/settings/components/SettingsPage.tsx`
- Modify: `src/features/settings/components/DevicesPage.tsx`
- Modify: `src/lib/sessionScope.ts`

**Interfaces:**
- Produces: `getApiBaseUrl() => ''`、`getAuthApiUrl() => '/api/auth'`、`getWsUrl() => ''`；`toAbsoluteApiUrl` / `toApiRelativePath` / `rewriteCanonicalApiOrigin` 签名与行为不变（只是基址变成同源）
- **移除的导出**（调用方必须一并清理）：`normalizeApiBaseUrl`、`setApiBaseUrl`、`clearApiBaseUrl`

- [ ] **Step 1: 改测试**

`src/lib/__tests__/apiConfig.test.ts`：

```ts
  it('getApiBaseUrl 返回空串——所有请求同源，浏览器不再知道后端主机', () => {
    expect(getApiBaseUrl()).toBe('')
  })

  it('相对路径补成同源绝对路径（toAbsoluteApiUrl 的行为不变，只是基址变了）', () => {
    // happy-dom 的 location.origin 是 http://localhost:3000
    expect(toAbsoluteApiUrl('avatars/a.png')).toBe(`${location.origin}/avatars/a.png`)
  })

  it('后端返回的正式域名绝对地址被改写到同源（预签名 URL 走这条）', () => {
    const rewritten = toAbsoluteApiUrl('https://api.huanvae.cn/user-file/obj?X-Amz-Signature=deadbeef')
    expect(rewritten).toBe(`${location.origin}/user-file/obj?X-Amz-Signature=deadbeef`)
  })

  it('getWsUrl 返回空串——wsStore 用相对 /ws', () => {
    expect(getWsUrl()).toBe('')
  })
```

`setApiBaseUrl` / `clearApiBaseUrl` / `normalizeApiBaseUrl` 的用例**全部删除**（这三个导出要删）。

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/lib/__tests__/apiConfig.test.ts 2>&1 | tail -6`
Expected: FAIL

- [ ] **Step 3: 改 apiConfig**

1. **删除** `normalizeApiBaseUrl`、`setApiBaseUrl`、`clearApiBaseUrl`、`getStoredApiBaseUrl` 与 `huanvae.api-base-url` 的常量。
2. `getApiBaseUrl` 改为：

```ts
/**
 * API 基址 = **空串**：所有请求同源打到 BFF（`/api/*`、`/avatars/*` …）。
 *
 * 浏览器不再知道 `api.huanvae.cn` 存在。这不只是整洁问题——那个域名在阿里云被
 * ICP 备案拦截，浏览器直连走不通（WS 完全连不上），必须由服务端代取。
 *
 * 「切换服务器」那个设置项随之移除：上游由服务端的 BFF_UPSTREAM_HTTP 决定，
 * 不再是浏览器能改的东西。
 */
export const getApiBaseUrl = (): string => ''

export const getAuthApiUrl = (): string => '/api/auth'

/** 空串：`wsStore` 用相对 `/ws`，协议由 `location` 推 */
export const getWsUrl = (): string => ''
```

3. `rewriteCanonicalApiOrigin` **保留** —— 后端返回的绝对地址（预签名 `part_url`）要落到同源。它内部读 `getApiBaseUrl()`，空串时改成落到 `location.origin`；补一段注释说明为什么这条机制在 BFF 之后**更重要**了。
4. `toAbsoluteApiUrl` 里 `new URL(trimmed, \`${getApiBaseUrl()}/\`)` 在基址为空串时会拿 document base，happy-dom 与浏览器都是 `location.origin` —— **实测确认**，若不符则显式用 `location.origin`。

- [ ] **Step 4: 移除切换服务器控件**

`SettingsPage.tsx`：删掉 `apiConfig` 的 import、`setApiBaseUrl` / `clearApiBaseUrl` 的调用、以及整个「服务器地址」Card（含 `<Label htmlFor="server_base_url">` 与它的输入框、保存/重置按钮、相关 state 与 toast）。

- [ ] **Step 5: 设备页「撤销当前设备」改走登出**

`DevicesPage.tsx`：`const { clearAuth } = useAuthStore()` → `const { logout } = useAuthStore()`；撤销当前设备的处理里 `clearAuth()` → `await logout()`。加注释：

```ts
      // 撤销当前设备 = 登出。必须走 authStore.logout()（它打 BFF 的
      // /api/auth/logout，由 BFF 删会话、清 cookie、关该会话的 WS），
      // 而不是只清本地 state —— 只清本地的话 cookie 还在，刷新页面就又登回去了。
```

- [ ] **Step 6: 清理 sessionScope 的 token 相关内容**

`src/lib/sessionScope.ts`：
- 模块顶部注释里关于「一对刚轮换出来的 token 明文躺在 auth-storage 里等下一个人」的段落，改成说明**现在**为什么还需要清盘（内存里的跨账号状态仍是真问题：profile、friends、chat、groups、apiConfig 的 aiApiKey），并写明 token 那一半已由 BFF 消除。
- `DEVICE_SCOPED_SETTING_FIELDS` 与清盘逻辑**不动**。
- 若有以 `auth-storage` 为名的特例分支，删掉。

- [ ] **Step 7: 运行确认通过 + 变异**

Run: `bun run test 2>&1 | grep -E "Test Files|Tests "`

| 变异 | 期望 |
|---|---|
| `getApiBaseUrl` 返回 `'https://api.huanvae.cn'` | 「返回空串」与「正式域名被改写到同源」红 |
| `DevicesPage` 的 `await logout()` 改回 `clearAuth()` | 需**新增**一条组件用例钉住「撤销当前设备会打 /api/auth/logout」—— 按此补上 |

第二条是刻意留的空档。

- [ ] **Step 8: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests "`

```bash
git add src/lib src/features/settings
git commit -m "$(cat <<'EOF'
refactor(config)!: API 基址改同源空串，移除「切换服务器」

浏览器不再知道 api.huanvae.cn 存在。这不只是整洁——那个域名在阿里云被 ICP 备案
拦截，浏览器直连走不通（WS 完全连不上），必须由服务端代取。上游由服务端的
BFF_UPSTREAM_HTTP 决定，不再是浏览器能改的东西，所以「服务器地址」设置项与
huanvae.api-base-url 这个设备键一并退役。

rewriteCanonicalApiOrigin 保留且更重要了：后端返回的绝对地址（预签名 part_url）
要落到同源，才能进 BFF 的透传分支。

设备页「撤销当前设备」从 clearAuth() 改成 await logout()：只清本地 state 的话
cookie 还在，刷新页面就又登回去了。

sessionScope 的清盘逻辑不动——内存里的跨账号状态仍是真问题（profile / friends /
chat / groups / aiApiKey）；只把注释里「token 明文躺在 auth-storage 等下一个人」
那一半改成说明它已由 BFF 消除。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: 构建与环境接线 + e2e 假后端

**Files:**
- Modify: `Dockerfile`
- Modify: `.env.example`
- Create: `tests/fixtures/fake-backend.ts`
- Modify: `playwright.config.ts`
- Create: `tests/bff-session.spec.ts`

**Interfaces:**
- Consumes: 前 12 个任务的全部产物
- Produces: 一条端到端跑通「登录 → cookie → 鉴权请求 → WS 升级」的 e2e 用例，跑在**真实生产构建产物**上

- [ ] **Step 1: 改 Dockerfile**

删掉 `ARG VITE_API_URL` / `ARG VITE_WS_URL` 两行，以及 `ENV` 块里的 `VITE_API_URL=$VITE_API_URL \` 与 `VITE_WS_URL=$VITE_WS_URL \` 两行。在 `ARG VITE_SENTRY_DSN` 上方加注释：

```dockerfile
# VITE_API_URL / VITE_WS_URL 已删除：所有请求同源打到 BFF，客户端产物里不再
# 内联任何后端主机名。上游由运行时的 BFF_UPSTREAM_HTTP / BFF_UPSTREAM_WS 决定
# （见 docker-compose.yml 的 app.environment），改它们只需重启容器、不必重建镜像。
```

runtime 阶段追加（`COPY --from=build /app/server ./server` 之后）：

```dockerfile
# 会话库的挂载点。compose 把 sessions 卷挂在这里；目录必须存在且 bun 用户可写。
RUN mkdir -p /data && chown bun:bun /data
```

⚠️ 这一行必须在 `USER bun` **之前**。

- [ ] **Step 2: 改 .env.example**

删掉 `VITE_API_URL` 与 `VITE_WS_URL` 两行，在 `VITE_SENTRY_DSN=` 之前插入：

```
# ── BFF（服务端运行时变量，不是 VITE_*，不会内联进客户端产物）──
# 生产：docker 网络内的 Caddy sidecar；本地：compose override 发布出来的同一个容器。
BFF_UPSTREAM_HTTP=http://127.0.0.1:8787
BFF_UPSTREAM_WS=ws://127.0.0.1:8787
# 会话库路径。生产是 sessions 卷里的 /data/sessions.sqlite。
SESSION_DB_PATH=./sessions.sqlite
# cookie 的 Secure 属性。生产必须 true；本地 http 下必须 false，否则浏览器整条丢弃。
SESSION_COOKIE_SECURE=false
```

`.gitignore` 追加 `sessions.sqlite*`（本地开发的会话库与 WAL 边文件）。

- [ ] **Step 3: 写 e2e 假后端**

创建 `tests/fixtures/fake-backend.ts`：

```ts
/**
 * e2e 用的假后端。实现 BFF 真正会打的那几条最小契约，让整条链路
 * （浏览器 → BFF → 上游）能在**真实生产构建产物**上跑通，而不再靠
 * `page.route()` 在浏览器侧拦截。
 *
 * 刻意只实现 BFF 需要的东西，不追求覆盖后端全部端点：这个 fixture 的作用是证明
 * 「cookie 换 bearer、WS 注入 token」这条机制成立，业务契约由单测的解析器守。
 *
 * 响应形状照抄 backend-docs 的信封：`{success, code, data}`；
 * `/api/auth/refresh` 特意**不回** `refresh_token`，与 2026-09-09 线上实测一致。
 */
const PORT = Number(process.env.FAKE_BACKEND_PORT ?? 39473)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const USER = {
  user_nickname: 'E2E 用户',
  user_email: 'e2e@example.com',
  user_avatar_url: 'avatars/e2e.png',
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)
    const auth = request.headers.get('authorization')

    if (url.pathname === '/api/auth/login') {
      const body = (await request.json()) as { user_id?: string; password?: string; device_info?: string }
      if (body.password !== 'correct-horse') {
        return json({ success: false, code: 401, error: '用户名或密码错误' }, 401)
      }
      return json({
        success: true, code: 200,
        data: { access_token: 'AT-e2e', refresh_token: 'RT-e2e', expires_in: 900, ...USER },
      })
    }

    if (url.pathname === '/api/auth/refresh') {
      // 与线上实测一致：不回 refresh_token
      return json({ success: true, code: 200, data: { access_token: 'AT-e2e-2', token_type: 'Bearer', expires_in: 900 } })
    }

    if (url.pathname === '/api/auth/logout') return json({ success: true, code: 200 })

    // 以下端点一律要求 Bearer —— 这是 e2e 真正在验的东西：
    // 浏览器只发了 cookie，而到这里必须变成 Authorization。
    if (!auth?.startsWith('Bearer ')) {
      return json({ success: false, code: 401, error: '未授权访问' }, 401)
    }

    if (url.pathname === '/api/profile') {
      return json({
        success: true, code: 200,
        data: {
          user_id: 'e2e', user_nickname: 'E2E 用户', user_email: 'e2e@example.com',
          user_signature: null, user_avatar_url: 'avatars/e2e.png', background_url: null,
          gender: null, birthday: null, region: null, admin: 'false',
          allow_search: true, search_visible_by_id: true,
          friend_request_policy: 'manual', group_invite_policy: 'manual',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      })
    }

    if (url.pathname === '/api/friends') return json({ success: true, code: 200, data: [] })
    if (url.pathname === '/api/friends/requests/pending') return json({ success: true, code: 200, data: [] })
    if (url.pathname === '/api/friends/requests/sent') return json({ success: true, code: 200, data: [] })
    if (url.pathname === '/api/groups/my') return json({ success: true, code: 200, data: [] })

    return json({ success: false, code: 404, error: `假后端未实现 ${url.pathname}` }, 404)
  },
  websocket: {
    open(ws) {
      ws.send(JSON.stringify({ type: 'hello', from: 'fake-backend' }))
    },
    message(ws, message) {
      ws.send(message as string)
    },
  },
})

// WS 升级：token 必须在查询串里 —— 这是 BFF 注入的证明
const originalFetch = server.fetch.bind(server)
void originalFetch

console.warn(`fake backend listening on :${PORT}`)
```

⚠️ Bun 的 WS 升级要在 `fetch` 里调 `server.upgrade`。把上面的 `fetch` 开头补上：

```ts
    if (url.pathname === '/ws') {
      const token = url.searchParams.get('token')
      // 这一句是 e2e 的核心断言之一：浏览器从没发过 token，它只能来自 BFF
      if (!token) return json({ success: false, code: 400, error: 'missing field token' }, 400)
      if (server.upgrade(request, { data: { token } })) return undefined as unknown as Response
      return json({ success: false, code: 400, error: '升级失败' }, 400)
    }
```

（`server` 在 `Bun.serve` 的回调里可见，因为 `const server = Bun.serve({...})` 是同一条语句的绑定 —— 与 `server/index.ts` 里同样的写法。删掉上面那两行 `originalFetch` 占位。）

- [ ] **Step 4: 改 playwright.config.ts**

在 `webServer` 数组**最前面**插入假后端（它必须先起来）：

```ts
    {
      // 假后端：BFF 的上游。必须排在最前面——production 那条的 BFF_UPSTREAM_* 指向它。
      command: 'bun run tests/fixtures/fake-backend.ts',
      url: `http://127.0.0.1:${FAKE_BACKEND_PORT}/api/friends`,
      env: { FAKE_BACKEND_PORT: String(FAKE_BACKEND_PORT) },
      // 它没有会话，未鉴权请求回 401 —— webServer 只看能不能拿到响应，
      // 但 Playwright 要求 2xx/3xx，所以用一个不需要 Bearer 的路径探活。
      reuseExistingServer: false,
      timeout: 30_000,
    },
```

⚠️ `/api/friends` 未鉴权会回 401，Playwright 的 `url` 探活要 2xx。**在假后端里加一条 `/healthz` 回 200**，探活用它。

在文件顶部常量区加：
```ts
const FAKE_BACKEND_PORT = 39473
```

production 那条 `webServer` 的 `env` 改为：
```ts
      env: {
        PORT: String(PRODUCTION_PORT),
        BFF_UPSTREAM_HTTP: `http://127.0.0.1:${FAKE_BACKEND_PORT}`,
        BFF_UPSTREAM_WS: `ws://127.0.0.1:${FAKE_BACKEND_PORT}`,
        SESSION_DB_PATH: './e2e-sessions.sqlite',
        SESSION_COOKIE_SECURE: 'false',
      },
```

`.gitignore` 追加 `e2e-sessions.sqlite*`。

- [ ] **Step 5: 写 e2e 用例**

创建 `tests/bff-session.spec.ts`：

```ts
import { expect, test } from '@playwright/test'

/**
 * BFF 会话层的端到端验证，跑在**真实生产构建产物**上（production project）。
 *
 * 这条用例的价值在于它验的东西单测验不了：浏览器只发 cookie，而到上游必须
 * 变成 Authorization；WS 的 token 由 BFF 注入。中间经过真实的 Bun.serve、
 * 真实的 RR 资源路由、真实的构建产物。
 */
test.describe('BFF 会话层', () => {
  test('登录 → cookie → 鉴权请求 → WS，浏览器侧从头到尾没有 token', async ({ page, context }) => {
    await page.goto('/app/login')

    await page.getByLabel(/用户名|账号|user.?id/i).fill('e2e')
    await page.getByLabel(/密码/i).fill('correct-horse')
    await page.getByRole('button', { name: /登录/ }).click()

    // 1. cookie 是 httpOnly，且 JS 读不到
    await expect.poll(async () => {
      const cookies = await context.cookies()
      return cookies.find((c) => c.name === 'hv_session')?.httpOnly
    }).toBe(true)

    const documentCookie = await page.evaluate(() => document.cookie)
    expect(documentCookie).not.toContain('hv_session')

    // 2. localStorage 里没有任何 token
    const storage = await page.evaluate(() => JSON.stringify(localStorage))
    expect(storage).not.toContain('AT-e2e')
    expect(storage).not.toContain('RT-e2e')
    expect(storage).not.toContain('accessToken')

    // 3. 进到聊天页，鉴权请求成功（说明 BFF 真的换成了 Bearer）
    const friendsResponse = page.waitForResponse((r) => r.url().includes('/api/friends') && r.status() === 200)
    await page.goto('/app/chat')
    await friendsResponse

    // 4. 浏览器发出的请求里没有 Authorization 头
    const requests: string[] = []
    page.on('request', (r) => {
      const header = r.headers().authorization
      if (header) requests.push(`${r.url()} → ${header}`)
    })
    await page.goto('/app/profile')
    await page.waitForLoadState('networkidle')
    expect(requests).toEqual([])
  })

  test('未登录访问受保护页面 → 跳登录页', async ({ page }) => {
    await page.goto('/app/chat')
    await expect(page).toHaveURL(/\/app\/login/)
  })

  test('登出后 cookie 被清、再访问受保护页面跳登录', async ({ page, context }) => {
    await page.goto('/app/login')
    await page.getByLabel(/用户名|账号|user.?id/i).fill('e2e')
    await page.getByLabel(/密码/i).fill('correct-horse')
    await page.getByRole('button', { name: /登录/ }).click()
    await expect(page).toHaveURL(/\/app\//)

    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }))

    await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'hv_session' && c.value !== '')).toBe(false)

    await page.goto('/app/chat')
    await expect(page).toHaveURL(/\/app\/login/)
  })
})
```

⚠️ 表单的 label 文案要**先读 `LoginForm.tsx` 确认**，不要照抄上面的正则。

`playwright.config.ts` 的 `production` project 的 `testMatch` 目前只匹配 `migration-regression.spec.ts`。把它改成同时匹配这个新文件：

```ts
const PRODUCTION_SPECS = /(migration-regression|bff-session)\.spec\.ts$/
```
并把 `testMatch` 与 chromium/mobile 的 `testIgnore` 都换成 `PRODUCTION_SPECS`。

- [ ] **Step 6: 跑 e2e（本任务是唯一跑它的地方）**

先确认端口空闲：
Run: `lsof -nP -iTCP:3000 -sTCP:LISTEN; lsof -nP -iTCP:39471 -sTCP:LISTEN; lsof -nP -iTCP:39473 -sTCP:LISTEN`
Expected: 全部为空。有占用先杀掉 —— 这台机器有多个 worktree，别的 session 的 dev server 曾两次污染过 e2e。

Run: `bun run test:e2e 2>&1 | tail -25`
Expected: 全绿。`tests/chat.spec.ts:49` 是已知的并发 flake（单跑 3/3 过），若只有它红，单独复跑确认后按 flake 记录，**不要**跳过它。

⚠️ **开跑后不要改源码** —— Vite 热重载会让整轮作废（之前发生过一次）。

- [ ] **Step 7: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun run test:bun 2>&1 | tail -4`

```bash
git add Dockerfile .env.example .gitignore tests/fixtures/fake-backend.ts tests/bff-session.spec.ts playwright.config.ts
git commit -m "$(cat <<'EOF'
test(e2e): 假后端 + BFF 会话层端到端用例；构建产物不再内联后端主机名

Dockerfile 删掉 VITE_API_URL / VITE_WS_URL：所有请求同源，客户端产物里不再有任何
后端主机名。上游由运行时的 BFF_UPSTREAM_* 决定，改它们只需重启容器不必重建镜像。
runtime 阶段建 /data 并 chown bun（必须在 USER bun 之前），会话卷挂在那里。

e2e 加一个假后端 fixture 当 BFF 的上游，整条链路跑在真实生产构建产物上，不再靠
page.route() 在浏览器侧拦截。它验的是单测验不了的东西：浏览器只发 cookie 而到上游
必须变成 Authorization、WS 的 token 由 BFF 注入（假后端在 /ws 缺 token 时回 400）。
/api/auth/refresh 特意不回 refresh_token，与 2026-09-09 线上实测一致。

用例断言：cookie 是 httpOnly 且 document.cookie 读不到、localStorage 里没有任何
token、浏览器发出的请求没有 Authorization 头、登出后 cookie 被清。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: 上线

**Files:**
- Modify: `docs/superpowers/plans/2026-09-09-bff-session-layer.md`（末尾「上线记录」小节）
- Modify: `~/.claude/projects/-Users-i-Code-huanvae-frontend/memory/backend-reachability-2026-09.md`

**Interfaces:**
- Consumes: Task 1–13 的全部产物
- Produces: 线上运行的 BFF；以及一份**实测记录**（边缘验收数字、四条 curl 结果、是否用了 Caddy 还是退回 nginx），供下一个人不必重新发现

**无源码改动**——本任务只做部署与验收

**前置**：owner 必须先在 alice 上放好证书 —— 这一步 agent 做不了（私钥不在仓里，也不该经过 agent）。

- [ ] **Step 1: 请 owner 放置证书**

告诉 owner 执行（Mac 侧）：

```bash
ssh alice 'mkdir -p ~/huanvae-frontend/secrets && chmod 700 ~/huanvae-frontend/secrets'
scp ~/.config/huanvae-edge/huanvae-ca.pem ~/.config/huanvae-edge/app-client.cert.pem ~/.config/huanvae-edge/app-client.key.pem alice:~/huanvae-frontend/secrets/
ssh alice 'chmod 600 ~/huanvae-frontend/secrets/*.pem && ls -l ~/huanvae-frontend/secrets/'
```

**agent 不执行这一步**，也不读私钥内容。

- [ ] **Step 2: 合并到 dev 与 main、部署 edge**

```bash
git checkout dev && git merge --ff-only feat/bff-session && git push origin dev
git checkout main && git merge --no-ff dev -m "Merge branch 'dev': BFF 会话层" && git push origin main
git checkout feat/bff-session
```

在 alice 上：
```bash
ssh alice 'cd ~/huanvae-frontend && git pull --ff-only origin main && docker compose up -d edge && docker compose ps edge'
```

- [ ] **Step 3: 边缘验收（这是整批唯一测不到、必须在 alice 上跑的部分）**

```bash
ssh alice 'cd ~/huanvae-frontend && docker compose exec -T app bun run edge/probe.ts http://edge:8787'
```

若 `app` 还是旧镜像没有 `edge/probe.ts`，改用一次性容器：
```bash
ssh alice 'cd ~/huanvae-frontend && docker run --rm --network huanvae-frontend_default -v "$PWD/edge:/edge:ro" oven/bun:1.3.14-alpine bun run /edge/probe.ts http://edge:8787'
```

**验收标准：`失败 0 / 80`，且 WS 握手回 400 `missing field token`。**

不过则按此顺序处置，**不要**跳过：
1. 全部失败、报 TLS 错 → 检查 `secrets/` 三个文件是否都在、权限对不对。
2. 部分失败（约 1/8）→ Caddy 的连接复用没生效。检查 `caddy adapt` 输出里 `keepalive_idle_conns_per_host` 是否落在 `transport.http`；试着把 `lb_retries` 提到 5。
3. 报 SNI/证书名不匹配 → 这就是 spec §10 那条已知差异（Caddy 会发 SNI `huanvae-edge`，nginx 不发）。**此时退回 nginx**：把 `edge` 服务的 `image` 换成 `nginx:1.27-alpine`、挂载一份从 `~/.config/huanvae-edge/nginx.conf` 改来的配置（监听 `0.0.0.0:8787`、证书路径改 `/secrets/`）。接口是裸 HTTP，BFF 一行不用改。

- [ ] **Step 4: 部署 app**

```bash
ssh alice 'cd ~/huanvae-frontend && docker compose up -d --build app && docker compose ps'
```
Expected: `app` healthy、`edge` running

- [ ] **Step 5: 线上验证**

```bash
# 1. 页面仍然可开（/healthz 不依赖 edge）
curl -sI --max-time 15 https://huanvae.cn/ | head -3
# 2. 客户端产物里不再有后端主机名
ENTRY=$(curl -s --max-time 15 https://huanvae.cn/ | grep -oE '/assets/entry\.client-[A-Za-z0-9_-]+\.js' | head -1)
curl -s --max-time 15 "https://huanvae.cn$ENTRY" | grep -c 'api\.huanvae\.cn' # 期望 0
# 3. 未登录时 /api/session 回 401
curl -s --max-time 15 -o /dev/null -w '%{http_code}\n' https://huanvae.cn/api/session  # 期望 401
# 4. 未登录时 /api/friends 回 401 且带清 cookie
curl -sI --max-time 15 https://huanvae.cn/api/friends | grep -iE '^HTTP|set-cookie'
```

然后**由 owner 在浏览器里**做一次真实验证（agent 不代劳，因为要输真实密码）：登录 → 开控制台确认 `document.cookie` 里没有 `hv_session`、Application → Local Storage 里没有任何 token → 确认 WS 连的是 `wss://huanvae.cn/ws` **不带 `?token=`** 且状态是 101 → 发一条消息确认实时收发正常。

- [ ] **Step 6: 记录结果并更新记忆**

把边缘验收的实际数字（失败数 / 80、WS 握手状态码）与 §5 的四条 curl 结果写进本文件末尾的「上线记录」小节。**写实测到的数字，不写「通过」** —— 这个项目已经三次出现过对不上的计数。

```bash
git add docs/superpowers/plans/2026-09-09-bff-session-layer.md
git commit -m "$(cat <<'EOF'
docs(plan): BFF 会话层上线记录

记录边缘验收的实测数字与线上验证结果，供下一个人不必重新发现：
Caddy 的 SNI 差异与连接复用到底成不成立、Web 的 WS 现在走的是哪条路。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

同时更新 `~/.claude/projects/-Users-i-Code-huanvae-frontend/memory/backend-reachability-2026-09.md`：Web 的 WS 现在通不通、走的是哪条路、`~/.config/huanvae-edge/` 的 nginx 是否已退役。

---

## 上线记录

（Task 14 完成时填写：边缘验收数字、线上 curl 结果、owner 浏览器验证结论、是否用了 Caddy 还是退回 nginx。）
