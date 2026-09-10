# 部署指南

本项目使用 React Router 8（Framework Mode，SSR）+ Vite 8 构建，用 Bun 作为运行时，通过 Docker Compose 部署到自建 VPS，公网流量经 Cloudflare Tunnel 进出。

## 🚀 快速开始

### 本地构建 + 启动

```bash
bun install
bun run build   # 产出 build/client/ + build/server/index.js
bun run start   # 起生产服务（server/index.ts，默认监听 :3000）
```

### 用 Docker Compose 起服务

```bash
docker compose up -d --build
```

`docker-compose.yml` 定义了三个服务：`app`（Bun 生产服务）、`cloudflared`（Cloudflare Tunnel 客户端）、`edge`（出网到 Huanvae 后端的 Caddy sidecar，见下面「BFF / edge」小节）。

## ☁️ 部署拓扑：VPS + Cloudflare Tunnel

```
浏览器 ──TLS──> Cloudflare 边缘 ──加密隧道──> cloudflared 容器 ──明文 HTTP──> app 容器
                                              （同一 docker 网络，不出 VPS）
```

- **TLS 终止在 Cloudflare 边缘**，证书由 CF 签发续期，`server/index.ts` 只服务明文 HTTP，不需要 Caddy / Traefik / certbot。
- **VPS 不对公网开放 80/443**：`cloudflared` 是出站建连到 CF 边缘的，`app` 容器也不 `publish` 端口到宿主机，只在 docker 内部网络上暴露给 `cloudflared` 访问。
- `docker-compose.yml` 里 `cloudflared` 用 `depends_on: { app: { condition: service_healthy } }`，保证 `app` 通过 `/healthz` 健康检查之后才开始接流量，避免部署瞬间的 502。

## 🔧 环境变量

在 VPS 上创建 `.env`（已被 `.gitignore` 覆盖，绝不提交）：

| 变量名 | 说明 | 消费方 | 示例值 |
|--------|------|--------|--------|
| `BFF_UPSTREAM_HTTP` | 上游（`edge` sidecar）HTTP 地址，BFF 转发 REST 请求的目标 | 仅服务端（运行时 `process.env`） | `http://edge:8787` |
| `BFF_UPSTREAM_WS` | 上游 WS 地址，BFF 注入 token 后代理升级的目标 | 仅服务端（运行时） | `ws://edge:8787` |
| `SESSION_DB_PATH` | 会话 SQLite 库路径，落在 `sessions` 卷里 | 仅服务端（运行时） | `/data/sessions.sqlite` |
| `SESSION_COOKIE_SECURE` | 会话 cookie 是否加 `Secure` 属性 | 仅服务端（运行时） | `"true"` |
| `VITE_SENTRY_DSN` | Sentry DSN（留空则禁用上报） | **双重**：客户端（构建期内联）+ `server/index.ts`（运行时 `process.env` 读取，服务端 Sentry 初始化） | |
| `VITE_APP_VERSION` | 版本号，用于 Sentry release 标签和版本徽标 | **双重**：客户端（构建期内联）+ `server/index.ts`（运行时 `process.env` 读取，服务端 Sentry release 标签） | `1.0.1` |
| `CF_TUNNEL_TOKEN` | Cloudflare Tunnel token（Zero Trust 控制台的隧道详情页获取） | 仅 `cloudflared` 容器（运行时） | |

> **`BFF_UPSTREAM_HTTP` / `BFF_UPSTREAM_WS` / `SESSION_DB_PATH` / `SESSION_COOKIE_SECURE` 是纯运行时变量，不是构建期变量。** `server/upstream.ts`、`server/session/index.ts` 在处理请求时读 `process.env`，不经过 Vite 的构建期内联。改这几个值只需要 `docker compose up -d`（读取新的 `environment` 并重建容器），**不需要** `--build` 重新构建镜像——这与下面 `VITE_*` 的规则正相反，两者混淆会导致改了配置却诧异"没生效"（其实重建的是不该重建的镜像），或者"重启了却没生效"（其实这几个变量该走的是重启，不是 VITE_* 那条重建规则）。四个变量的生产值见 `docker-compose.yml` 的 `app.environment`；`edge` 服务见下面的「BFF / edge」小节。
>
> **`VITE_*` 在构建时被 Vite 内联进产物，不是运行时读取。** 它们通过 `docker-compose.yml` 的 `build.args` 传给 `Dockerfile`，改这些值必须 `docker compose up -d --build` 重新构建镜像，单纯重启容器不会生效。镜像因此是环境相关的，不能"一个镜像部署到多环境"。
>
> 与此并存的是 `src/lib/apiConfig.ts` 里纯运行时的 `localStorage` 覆盖机制（用于临时切换后端），不受这条限制影响。
>
> **`VITE_SENTRY_DSN` 和 `VITE_APP_VERSION` 是例外，两边都要配置。** 上表"消费方"一栏标了双重的这两个变量，`server/index.ts` 会在容器启动时用 `process.env.VITE_SENTRY_DSN` / `process.env.VITE_APP_VERSION` 做服务端 Sentry 初始化——这是纯运行时读取，和 Vite 构建期内联是两条独立的路径。因此 `docker-compose.yml` 里 `app` 服务必须**同时**在 `build.args`（供客户端构建）和 `environment`（供服务端运行时）声明它们；只配置其中一边，另一边会静默失效——服务端只配 `build.args` 的话，容器正常启动、健康检查照常通过，但 `Sentry.init({ dsn: '' })` 永远拿到空字符串，服务端报错永远不会上报，且不会有任何报错或日志提示这一点。

## 🔀 BFF / edge：出网到 Huanvae 后端

浏览器不再直连 `api.huanvae.cn`——该域名已从客户端产物里移除（见上表），也确实连不通：它在阿里云被 ICP 备案拦截。出网分两跳：

```
app（Bun BFF）──明文 HTTP/WS，docker 网络内──> edge（Caddy sidecar）──mTLS，无 huanvae.cn SNI──> Huanvae 后端边缘
```

- **`app`** 只知道 `BFF_UPSTREAM_HTTP=http://edge:8787` / `BFF_UPSTREAM_WS=ws://edge:8787`——docker 网络内部地址，不出容器，也不出现在任何客户端产物里。
- **`edge`** 服务（`docker-compose.yml`）是 `caddy:2-alpine`，配置在 `edge/Caddyfile`：反代到 Huanvae 后端边缘 IP，带客户端证书（mTLS）且刻意不带 `huanvae.cn` 的 SNI/Host（拦截正是按 SNI 触发的，细节见该文件顶部注释）。它只在 docker 网络内 `expose: ["8787"]`，不对宿主机发布端口。
- **`secrets/huanvae-ca.pem`、`secrets/app-client.cert.pem`、`secrets/app-client.key.pem`** 由 owner 手动放到 VPS 上（`chmod 600`），**永不提交到仓库**——这是公开仓库，私钥不能进版本控制，agent 不经手这把私钥。`docker-compose.yml` 把整个 `./secrets` 目录只读挂载进 `edge` 容器。
- **`sessions` 卷**：`SESSION_DB_PATH=/data/sessions.sqlite` 落在具名卷 `sessions`（挂载到 `app` 容器的 `/data`），随容器重建而保留，不随 `docker compose down`（不带 `-v`）丢失。

本地开发想连这条链路：`cp docker-compose.override.yml.example docker-compose.override.yml && docker compose up -d edge` 把 `edge` 发布到 `127.0.0.1:8787`，再在 `.env.development.local` 里设 `BFF_UPSTREAM_HTTP=http://127.0.0.1:8787` / `BFF_UPSTREAM_WS=ws://127.0.0.1:8787`（`vite.config.ts` 会把它们接进 `react-router dev` 的 `process.env`，见该文件注释）。

## 🔒 VPS 防火墙

由于所有流量走 Cloudflare Tunnel（`cloudflared` 主动出站建连），VPS 防火墙可以对公网完全关闭 80/443，站点仍可正常访问——这比传统反向代理暴露入站端口的方案攻击面更小。部署后应验证：关闭 80/443 入站规则，站点依然可以从公网访问。

## 📡 Cloudflare 侧配置

- **Tunnel ingress** 用 Cloudflare 面板托管（remote-managed tunnel），把域名映射到 `http://app:3000`。
- **`/sw.js` 需要在 CF 加一条 Cache Rule 设为 Bypass**：CF 默认按扩展名缓存 `.js`，虽然会尊重 origin 的 `Cache-Control: no-store`，但 Service Worker 更新链路本来就脆弱，边缘旁路是廉价保险。
- **`/assets/*` 交给 CF 边缘缓存**：`server/index.ts` 对这个路径设置 `max-age=31536000, immutable`，CF 会长期缓存，这是白拿的 CDN 收益——注意路径是 `/assets/*`（Vite 产物），不是 Next 时代的 `/_next/static/*`。
- **真实客户端 IP 在 `CF-Connecting-IP` 头**，不是 socket 远端地址（那是 `cloudflared` 容器的 IP）。

## 🩺 健康检查

```bash
curl -s http://<host>/healthz   # 期望返回 "ok"，状态码 200
```

`docker-compose.yml` 里 `app` 服务的 `healthcheck` 每 30 秒探测一次 `/healthz`；`cloudflared` 依赖它变为 `healthy` 才启动。

## 🐛 常见问题

### 1. 改了 `VITE_SENTRY_DSN` / `VITE_APP_VERSION` 之类的构建时变量，重启容器不生效

**原因**：`VITE_*` 在 `bun run build` 时被内联进 JS 产物，运行时读不到新值。

**解决**：`docker compose up -d --build` 重新构建镜像（不能只 `restart`）。反过来，`BFF_UPSTREAM_HTTP` / `BFF_UPSTREAM_WS` / `SESSION_DB_PATH` / `SESSION_COOKIE_SECURE` 这四个是纯运行时变量，改值只需要 `docker compose up -d` 重启容器，不必 `--build`。

### 2. 尾斜杠 URL（如 `/app/chat/`）跳转异常或出现循环

**原因**：`server/index.ts` 的 301 重定向只应该改写路径，绝不能带上协议/主机。origin 收到的始终是明文 HTTP（TLS 终止在 CF 边缘），一旦重定向逻辑意外拼出 `https://` 前缀，会和 CF 边缘的 TLS 终止形成无限循环。

**解决**：确认 `Location` 头只是相对路径（例如 `/app/chat`），不含 scheme/host；`tests/migration-regression.spec.ts` 里的"尾斜杠重定向"用例专门锁定这一点。

### 3. Service Worker 更新后客户端一直拿不到新版本

**原因**：`/sw.js` 被 Cloudflare 边缘缓存住了。

**解决**：确认 CF 面板对 `/sw.js` 有 Cache Rule Bypass；本地可用 `curl -I` 确认 `Cache-Control: no-store`。

### 4. 视频会议无法获取摄像头/麦克风权限，浏览器没有任何报错

**原因**：`Permissions-Policy` 响应头的 `camera` / `microphone` 没有允许 `self`——浏览器会静默拒绝权限请求，不会有任何报错提示。

**解决**：`curl -I` 检查响应头是否包含 `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`。

### 5. API 请求失败

**原因**：BFF 环境变量配置问题，或 `edge` 出网链路故障（见「BFF / edge」小节）。

**解决**：
- 浏览器发出的请求都是同源的（打到 `app` 自己），不会有 CORS 问题——如果看到 CORS 报错，说明请求没有经过 BFF，走错了路径
- 检查 `app` 容器的 `BFF_UPSTREAM_HTTP` / `BFF_UPSTREAM_WS` 是否指向正确的 `edge` 地址
- 检查 `edge` 容器日志（`docker compose logs edge`）和 `secrets/` 下三个证书文件是否就位、权限是否正确（`600`）

## 📚 相关资源

- [React Router 部署文档](https://reactrouter.com/start/framework/deploying)
- [Vite 文档](https://vite.dev/)
- [Cloudflare Tunnel 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Docker Compose 文档](https://docs.docker.com/compose/)

## 💡 提示

- 首次 `docker compose up -d --build` 需要完整构建镜像，可能需要几分钟；后续增量构建通常更快
- 部署前建议先本地跑一遍 `bun run build && bun run start`，用 `curl -IL` 确认响应头、健康检查、尾斜杠重定向都符合预期
- 可以通过 `docker compose logs -f app` 查看运行日志

---

**更新时间**: 2026-09-10
