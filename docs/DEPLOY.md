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

`docker-compose.yml` 定义了两个服务：`app`（Bun 生产服务）和 `cloudflared`（Cloudflare Tunnel 客户端）。

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
| `VITE_API_URL` | 后端 API 地址 | 仅客户端（构建期内联） | `https://api.huanvae.cn` |
| `VITE_WS_URL` | WebSocket 地址 | 仅客户端（构建期内联） | `wss://api.huanvae.cn` |
| `VITE_SENTRY_DSN` | Sentry DSN（留空则禁用上报） | **双重**：客户端（构建期内联）+ `server/index.ts`（运行时 `process.env` 读取，服务端 Sentry 初始化） | |
| `VITE_APP_VERSION` | 版本号，用于 Sentry release 标签和版本徽标 | **双重**：客户端（构建期内联）+ `server/index.ts`（运行时 `process.env` 读取，服务端 Sentry release 标签） | `1.0.1` |
| `CF_TUNNEL_TOKEN` | Cloudflare Tunnel token（Zero Trust 控制台的隧道详情页获取） | 仅 `cloudflared` 容器（运行时） | |

> **`VITE_*` 在构建时被 Vite 内联进产物，不是运行时读取。** 它们通过 `docker-compose.yml` 的 `build.args` 传给 `Dockerfile`，改这些值必须 `docker compose up -d --build` 重新构建镜像，单纯重启容器不会生效。镜像因此是环境相关的，不能"一个镜像部署到多环境"。
>
> 与此并存的是 `src/lib/apiConfig.ts` 里纯运行时的 `localStorage` 覆盖机制（用于临时切换后端），不受这条限制影响。
>
> **`VITE_SENTRY_DSN` 和 `VITE_APP_VERSION` 是例外，两边都要配置。** 上表"消费方"一栏标了双重的这两个变量，`server/index.ts` 会在容器启动时用 `process.env.VITE_SENTRY_DSN` / `process.env.VITE_APP_VERSION` 做服务端 Sentry 初始化——这是纯运行时读取，和 Vite 构建期内联是两条独立的路径。因此 `docker-compose.yml` 里 `app` 服务必须**同时**在 `build.args`（供客户端构建）和 `environment`（供服务端运行时）声明它们；只配置其中一边，另一边会静默失效——服务端只配 `build.args` 的话，容器正常启动、健康检查照常通过，但 `Sentry.init({ dsn: '' })` 永远拿到空字符串，服务端报错永远不会上报，且不会有任何报错或日志提示这一点。

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

### 1. 改了 `VITE_API_URL` 之类的构建时变量，重启容器不生效

**原因**：`VITE_*` 在 `bun run build` 时被内联进 JS 产物，运行时读不到新值。

**解决**：`docker compose up -d --build` 重新构建镜像（不能只 `restart`）。

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

**原因**：CORS 配置或环境变量问题。

**解决**：
- 确认后端配置了正确的 CORS 策略
- 检查 `VITE_API_URL` / `VITE_WS_URL` 是否指向正确的后端地址

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

**更新时间**: 2026-09-05
