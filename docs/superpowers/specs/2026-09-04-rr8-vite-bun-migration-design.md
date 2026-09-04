# Next.js → React Router 8 + Vite + Bun 迁移设计

**日期**: 2026-09-04
**状态**: 待评审
**范围**: 阶段 1（构建迁移）完整设计；阶段 2（BFF 数据层）、阶段 3（设计对齐）仅列出契约，各自另写 spec

---

## 1. 背景与动机

### 1.1 当前状态

`huanvae/frontend` 是一个 **纯静态导出的 Next.js SPA**：

- Next.js 16 App Router，`next.config.js` 设 `output: 'export'`
- 产物是静态 HTML，部署到 Cloudflare Pages（`npx wrangler pages dev out`）
- 全仓库 **0 个** route handler / server action —— 没有任何服务端代码
- 所有数据来自外部后端 `https://api.huanvae.cn`（REST）+ `wss://api.huanvae.cn`（WebSocket）
- 169 个 TS/TSX 文件，其中 92 个标了 `'use client'`
- 包管理器 pnpm 10.30.1

**对 Next.js 的耦合很浅**，这是迁移可行的前提：

| Next API | 文件数 | 用法 |
|---|---|---|
| `next/navigation` | 20 | `useRouter`×30、`usePathname`×13、`useSearchParams`×4、`useParams`×2 |
| `next/dynamic` | 13 | 全部是 `dynamic(() => import(...), { ssr: false })` 的统一形态 |
| `next/link` | 5 | 普通 `<Link href>` |
| `metadata` / `viewport` 导出 | 6 | 静态对象，无 `generateMetadata` |

没有用到 RSC 数据流、Server Actions、`next/image` 优化、ISR、middleware —— 也就是说，Next.js 在这个项目里**只承担了路由 + 构建 + 静态导出**三件事。

### 1.2 目标状态

- **构建**：Vite 8.2.2（Rolldown 内核）+ React Router 8.3.1（framework mode）
- **运行时**：Bun 1.3.14（包管理 + 服务端运行时）
- **Lint**：Biome 2.5.12（取代 ESLint 全栈）
- **渲染**：SSR 但偏 CSR —— 服务端渲染 HTML 外壳，业务数据全部客户端拉取
- **部署**：Docker Compose（app + postgres + redis），取代 Cloudflare Pages 静态托管
- **数据层**：Drizzle ORM 作为 BFF，管理 Postgres + Redis
- **设计**：shadcn/ui 主题向 `huanwei520/Huanvae-Chat-App` 的设计语言对齐

### 1.3 为什么"偏 SPA CSR 的 SSR"

选 `ssr: true` 而非 SPA-only 是为了拿到 SSR 的外壳收益：首屏骨架（消除白屏）、真实的 `<meta>`（SEO / 社交卡片）、服务端就能定的主题类名（消除暗色模式闪烁）。

但**不**做业务数据的服务端渲染：92 个 `'use client'` 组件重度依赖 `window`、`localStorage`、WebSocket、WebRTC、Three.js，把它们改成同构渲染的成本远超收益，且会与阶段 2 的认证改造纠缠。所以业务数据统一走客户端。

**这个决定的代价**：首屏仍需一次客户端往返才有内容，SSR 只省了白屏不省数据延迟。这是有意接受的 —— 阶段 2 引入 BFF 后，可以按需把个别路由升级为服务端 loader，而不必现在全量改造。

---

## 2. 架构决策

### 2.1 分三阶段，每阶段可独立发布

| 阶段 | 内容 | 可发布 | 验证手段 |
|---|---|---|---|
| **1. 构建迁移** | Next → RR8 + Vite + Bun；Docker Compose 只起 app | 是 | 现有 Playwright 用例 + 手工回归 |
| **2. BFF 数据层** | 加 pg + redis；Drizzle schema/migrations；token 迁移到 httpOnly cookie + Redis session | 是 | 新增 loader 层测试 + 认证流回归 |
| **3. 设计对齐** | token 重映射 + 玻璃质感层 + ThemeProvider 动态主题 | 是 | 视觉回归（Playwright 截图对比） |

**为什么串行而不是并行**：阶段 3 要动 `src/styles/globals.css` 和 `src/components/ui/` 下 59 个组件；阶段 1 会移动路由文件。并行做会产生大面积合并冲突，收益不抵成本。

**为什么阶段 1 不顺手把数据层做了**：阶段 1 是"同构替换"——业务逻辑一行不改，所以现有 Playwright 用例能作为安全网。阶段 2 改认证方式（localStorage → httpOnly cookie），会让这张网失效。两者叠加会导致故障难以定位。

### 2.2 `src/data/` 抽象层 —— 消除阶段 1 的返工

串行方案的固有缺点是：阶段 1 写的客户端取数，阶段 2 要改成服务端 loader，等于白写。

解法是在阶段 1 就引入一层数据访问抽象：

```
src/data/
├── conversations.ts   // export async function loadConversations(): Promise<Conversation[]>
├── profile.ts
└── ...
```

- **页面组件只调 `loadConversations()`**，不直接碰 `fetch` 或 `apiClient`
- **阶段 1**：函数体内部是客户端 `fetch`（复用现有 `src/api/*`）
- **阶段 2**：函数体换成服务端 loader + Drizzle 查询，**页面组件一行不改**

这样串行方案拿到了"只改一次数据流"的收益，同时保留了分阶段可回滚。

**范围限制**：阶段 1 只为**阶段 2 确定要下沉到 BFF 的数据**建立这层抽象（用户偏好、主题、已读位置、草稿、会话列表）。其余保持现状直接调 `src/api/*`，避免为了抽象而抽象。

### 2.3 保留 `src/` 目录布局

RR8 默认 app 目录是 `app/`，但本项目 169 个文件的 import 全部走 `@/*` → `./src/*`。

**决定**：在 `react-router.config.ts` 设 `appDirectory: 'src/app'`，让 RR8 在现有 `src/app/` 下工作。

这样 `src/components/`、`src/features/`、`src/lib/`、`src/hooks/`、`src/store/`、`src/i18n/`、`src/styles/`、`src/api/` **全部原地不动**，`@/` 别名语义不变。169 个 TS/TSX 文件中，`src/app/` 下 24 个需要重写为 RR8 路由模块，其余 **145 个目录结构零改动**（其中 34 个仅需机械替换 import 路径，见 §2.4）。

### 2.4 兼容 shim 而非全量重写调用点

`next/navigation`、`next/link`、`next/dynamic` 共 34 个文件受影响。两种做法：

- **全量重写成 RR8 惯用法**：长期干净，但 34 个文件、30 处 `router.push()` 调用点的改动混在框架迁移里，评审困难。
- **建 shim + 机械替换 import**（采用）：写 3 个约 30 行的适配模块，然后 `sed` 替换 import 路径。改动面收敛到"3 个新文件 + 34 行 import 变更"，可逐行评审。

**这是有意接受的技术债**，条件是：shim 放在 `src/lib/` 且**不**命名为 `next-compat`（不假装自己是 Next），并在阶段 3 之后作为可选清理项逐步去除。去 shim 不是阶段 1 的交付条件。

---

## 3. 目标目录结构

```
huanvae/frontend/
├── src/
│   ├── app/                        # RR8 appDirectory
│   │   ├── root.tsx                # ← 原 layout.tsx：html 外壳 / meta / links / providers
│   │   ├── routes.ts               # RR8 路由配置（config-based routing）
│   │   ├── entry.client.tsx        # 客户端 hydration 入口
│   │   ├── entry.server.tsx        # 服务端渲染入口
│   │   ├── sw.ts                   # 保留：Serwist service worker 源码
│   │   └── routes/                 # 路由模块（见 §4 映射表）
│   ├── data/                       # 新增：数据访问抽象层（阶段 2 接缝）
│   ├── api/                        # 不动
│   ├── components/                 # 不动（含 ui/ 下 59 个 shadcn 组件）
│   ├── features/                   # 不动
│   ├── hooks/  lib/  store/        # 不动（lib/ 新增 3 个 shim）
│   ├── i18n/  styles/  types/      # 不动
│   └── config/                     # sentry.ts 需改
├── server/
│   └── index.ts                    # Bun HTTP server，挂 RR8 request handler
├── vite.config.ts                  # 新增
├── react-router.config.ts          # 新增
├── Dockerfile                      # 新增
├── docker-compose.yml              # 新增
├── playwright.config.ts            # 新增（当前缺失，见 §9）
├── tsconfig.json                   # 改
├── biome.json                      # 新增（取代 eslint.config.mjs）
├── package.json                    # 改
├── bun.lock                        # 新增（替代 pnpm-lock.yaml）
└── [删除] next.config.js / next-env.d.ts / serwist.config.js / eslint.config.mjs
        / pnpm-lock.yaml / pnpm-workspace.yaml / public/_headers / .next/ / out/
```

---

## 4. 路由映射表

RR8 用 **config-based routing**（`src/app/routes.ts` 显式声明），不用文件系统约定。理由：Next 的 `(auth)` 分组语法和 `~offline` 目录名在 RR8 文件路由里都需要转义，显式配置更清楚。

| Next.js 源文件 | URL | RR8 路由模块 |
|---|---|---|
| `app/layout.tsx` | — | `root.tsx` |
| `app/not-found.tsx` | 404 | `root.tsx` 的 `ErrorBoundary` |
| `app/page.tsx` | `/` | `routes/home.tsx` |
| `app/downloads/page.tsx` | `/downloads` | `routes/downloads.tsx` |
| `app/~offline/page.tsx` | `/~offline` | `routes/offline.tsx` |
| `app/app/page.tsx` | `/app` | `routes/app-index.tsx` |
| `app/app/(auth)/layout.tsx` | — | `routes/auth-layout.tsx`（layout 路由） |
| `app/app/(auth)/login/page.tsx` | `/app/login` | `routes/login.tsx` |
| `app/app/(auth)/register/page.tsx` | `/app/register` | `routes/register.tsx` |
| `app/app/(protected)/layout.tsx` + `ProtectedLayoutClient.tsx` | — | `routes/protected-layout.tsx`（layout 路由） |
| `(protected)/chat/page.tsx` | `/app/chat` | `routes/chat.tsx` |
| `(protected)/friends/page.tsx` | `/app/friends` | `routes/friends.tsx` |
| `(protected)/groups/page.tsx` | `/app/groups` | `routes/groups.tsx` |
| `(protected)/files/page.tsx` | `/app/files` | `routes/files.tsx` |
| `(protected)/webrtc/page.tsx` | `/app/webrtc` | `routes/webrtc.tsx` |
| `(protected)/ai-chat/page.tsx` | `/app/ai-chat` | `routes/ai-chat.tsx` |
| `(protected)/video-meeting/page.tsx` | `/app/video-meeting` | `routes/video-meeting.tsx` |
| `(protected)/devices/page.tsx` | `/app/devices` | `routes/devices.tsx` |
| `(protected)/settings/page.tsx` | `/app/settings` | `routes/settings.tsx` |
| `(protected)/profile/page.tsx` | `/app/profile` | `routes/profile.tsx` |

`src/lib/routes.ts`（URL 常量表）**保持不变** —— 所有 URL 字符串一致，这是迁移正确性的锚点。注意它与 RR8 的 `src/app/routes.ts`（路由配置）是两个不同文件，命名相近但职责不同。

**`trailingSlash: true` 的处理**：当前 Next 配置强制尾部斜杠（静态导出需要）。RR8 无此需求，迁移后 URL 不带尾斜杠。需要在服务端加一条 301 重定向 `/path/` → `/path`，避免旧书签和已被搜索引擎收录的 URL 404。

---

## 5. Next API 替换方案

### 5.1 `next/navigation` → `src/lib/navigation.ts`

新建 shim，保持 Next 的调用签名，内部用 RR8 实现：

```ts
// src/lib/navigation.ts
import { useNavigate, useLocation, useSearchParams as useRRSearchParams, useParams as useRRParams } from 'react-router'

export function useRouter() {
  const navigate = useNavigate()
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => navigate('.', { replace: true }),
    prefetch: () => {},   // RR8 的 <Link prefetch> 已覆盖，此处为空实现
  }
}

export function usePathname() { return useLocation().pathname }
export function useSearchParams() { return useRRSearchParams()[0] }
export const useParams = useRRParams
```

替换方式：20 个文件的 `from 'next/navigation'` → `from '@/lib/navigation'`，30 处 `router.push()` 等调用点不动。

**语义差异已逐项核查完毕，无阻塞**：

- `router.refresh()` / `router.prefetch()`：**全仓库零调用点**（已 grep 验证）。所以 `refresh` 的退化语义和 `prefetch` 的空实现都不构成风险，保留它们只是为了类型完整。
- `useSearchParams()`：Next 返回 `ReadonlyURLSearchParams`，RR8 返回可变 `URLSearchParams`。**4 处调用点全部只读**（`LoginForm.tsx:51` 取 `next`；`VideoMeeting.tsx:112-115` 取 `room`/`pwd`/`name`/`token`），只用 `.get()`，完全兼容。

也就是说 30 处 `useRouter` 实际只用到 `push` / `replace` / `back`，shim 的行为等价性可以静态论证，不依赖运行时验证。

### 5.2 `next/link` → `src/components/common/AppLink.tsx`

RR8 的 `<Link>` 用 `to` 而非 `href`。写一个 5 行包装接受 `href`，避免改 5 个文件的 JSX 属性：

```tsx
import { Link, type LinkProps } from 'react-router'
export function AppLink({ href, ...rest }: Omit<LinkProps, 'to'> & { href: string }) {
  return <Link to={href} {...rest} />
}
```

### 5.3 `next/dynamic` → `src/lib/dynamic.tsx`

13 处用法形态完全统一（`dynamic(() => import(X), { ssr: false })`），可以一个 helper 全覆盖：

```tsx
import { lazy, Suspense, type ComponentType } from 'react'
import { useHydrated } from './useHydrated'

export function dynamic<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>) {
  const Lazy = lazy(loader)
  return function DynamicComponent(props: P) {
    const hydrated = useHydrated()
    if (!hydrated) return null              // 等价于 Next 的 ssr: false
    return <Suspense fallback={null}><Lazy {...props} /></Suspense>
  }
}
```

`useHydrated` 是标准的 `useSyncExternalStore` 水合守卫，保证服务端和首次客户端渲染一致，避免 hydration mismatch。

**注意**：其中 6 处 `dynamic` 的目标组件在 `.then(mod => ({ default: mod.X }))` 形态（如 `providers.tsx` 的 `UpdatePrompt`），loader 签名兼容，无需特殊处理。

### 5.4 `metadata` / `viewport` 导出 → RR8 `meta`

6 个文件的静态 `metadata` 对象转成 RR8 的 `export const meta: MetaFunction`。

`root.tsx` 里最大的那个（含 OpenGraph、Twitter Card、robots、icons、manifest、appleWebApp）拆成两部分：

- `<meta>` 类（title/description/keywords/og:*/twitter:*/robots）→ `meta` 导出
- `<link>` 类（manifest/icon/apple-touch-icon/canonical/alternate）→ `links` 导出

`viewport` 对象（含 `viewportFit: 'cover'`、`themeColor`）→ `meta` 里的 `{ name: 'viewport', content: '...' }` 和 `{ name: 'theme-color', content: '#4285f4' }`。

**主题防闪脚本**（`layout.tsx` 里的 `themeInitScript`）原样搬到 `root.tsx` 的 `<head>`，必须在样式表之后、body 之前，用 `dangerouslySetInnerHTML`。

### 5.5 `not-found.tsx` → `ErrorBoundary`

RR8 没有独立的 404 约定。在 `root.tsx` 导出 `ErrorBoundary`，用 `isRouteErrorResponse(error) && error.status === 404` 分支渲染现有的 not-found UI。

---

## 6. 基础设施替换

### 6.1 PWA：`@serwist/next` → `@serwist/vite`

Serwist 官方有 Vite 集成（`@serwist/vite@9.5.12`），**优先继续用 Serwist** —— `src/app/sw.ts` 的自定义预缓存过滤逻辑可以基本原样保留，改动最小。

**但这是有条件的**：`@serwist/vite` 对 Vite 8（Rolldown）的兼容性未经确证（§8、§10）。§9.2 第 2 步的骨架验证若发现不通，**改用 `vite-plugin-pwa@1.3.0`**（`injectManifest` 模式同样支持自定义 SW 源码），届时 `sw.ts` 需要按其 API 调整预缓存过滤的写法。两条路都可行，先验证再选。

需要改的：

- `sw.ts` 里 `import { defaultCache } from '@serwist/next/worker'` → `@serwist/vite/worker`
- `PRECACHE_SKIP_PATTERNS` 里的 Next 专属条目（`_buildManifest.js`、`_ssgManifest.js`、`_clientMiddlewareManifest.json`、`/_global-error`）删除，换成 Vite 产物的对应模式
- `serwist.config.js` 删除，配置移入 `vite.config.ts` 的 plugin 参数
- `src/app/serwist.tsx`（re-export `SerwistProvider`）改为 `@serwist/vite/react` 或按其 API 调整

**风险**：最近两个 commit（`12025f6`、`1d1498b`）刚修过 SW 的接管/更新重载逻辑，说明这块脆弱。迁移后必须专门回归"更新提示 → 点击更新 → 重载"整条链路。

### 6.2 Sentry：`@sentry/nextjs` → `@sentry/react-router`

`@sentry/react-router@10.73.0` 是官方 React Router 框架 SDK。

**风险与回退**：需要先验证它是否支持 RR **8**（其文档主要针对 v7）。若不支持，回退方案是 `@sentry/react`（浏览器）+ `@sentry/node`（服务端）手工接线 —— 功能等价，只是少了自动的路由 instrumentation。

`src/config/sentry.ts` 的 `beforeSend` 敏感信息过滤、`ignoreErrors` 列表、采样率配置全部保留不变，只换 import 和 init 位置（客户端在 `entry.client.tsx`，服务端在 `server/index.ts`）。

环境变量 `NEXT_PUBLIC_SENTRY_DSN` → `VITE_SENTRY_DSN`（见 §6.4）。

### 6.3 服务端

`server/index.ts` 用 Bun 原生 HTTP server 挂 RR8 的 request handler：

- 静态资源（`/assets/*`、`public/` 内容）由 Bun 直接 serve
- 尾斜杠 301 重定向（见 §4）—— **只处理路径，不碰协议**，否则与 Cloudflare Tunnel 形成重定向循环（§7.1）
- 健康检查端点 `/healthz`，供 Docker Compose healthcheck 与 cloudflared 的 `depends_on` 用
- 明文 HTTP 监听，**不处理 TLS**（终止在 CF 边缘，§7.1）
- 客户端 IP 从 `CF-Connecting-IP` 头取，不用 socket 远端地址（§7.1）
- **响应头迁移**（见下）

**`public/_headers` 迁移 —— 不能丢的安全头**

该文件是 Cloudflare Pages 专用格式，换成 Docker 部署后**完全失效**。里面的每一条都必须在 `server/index.ts` 里重新实现，否则是实质性的安全回退：

| 头 | 值 | 作用范围 |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | `/*` |
| `X-Content-Type-Options` | `nosniff` | `/*` |
| `X-Frame-Options` | `DENY` | `/*` |
| `X-XSS-Protection` | `1; mode=block` | `/*` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `/*` |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=()` | `/*` |
| `Cache-Control` | `no-cache, no-store, must-revalidate` | `/sw.js` |
| `Cache-Control` | `public, max-age=31536000, immutable` | `/_next/static/*` → **改为 `/assets/*`** |

两点注意：

1. **`Permissions-Policy` 的 `camera=(self), microphone=(self)` 是视频会议功能必需的** —— 漏掉会导致 WebRTC 直接不可用，且症状隐蔽（浏览器静默拒绝权限）。§9.3 的 WebRTC 回归必须覆盖。
2. **长缓存路径要改**：Next 的产物在 `/_next/static/*`，Vite 的在 `/assets/*`。照抄会导致新产物完全不被缓存。

`public/_headers` 在阶段 1 结束后删除。

**阶段 1 明确不做**：`server/` 里不出现任何数据库连接、session 处理、上游 API 代理。它就是一个薄的静态资源 + SSR handler。这是有意的（见 §2.1）。

### 6.4 环境变量

Vite 只暴露 `VITE_` 前缀的变量给客户端。全部 `NEXT_PUBLIC_*` 需要改名：

| 现有 | 迁移后 | 消费位置 |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `VITE_API_URL` | `src/lib/apiConfig.ts` |
| `NEXT_PUBLIC_WS_URL` | `VITE_WS_URL` | `src/lib/apiConfig.ts` |
| `NEXT_PUBLIC_SENTRY_DSN` | `VITE_SENTRY_DSN` | `src/config/sentry.ts` |
| `NEXT_PUBLIC_APP_VERSION`（由 `next.config.js` 从 `npm_package_version` 注入） | `VITE_APP_VERSION` | `src/lib/version.ts` |

`process.env.X` → `import.meta.env.X`。注意 `src/api/apiClient.ts`、`src/app/providers.tsx` 等处的 `process.env.NODE_ENV` → `import.meta.env.DEV` / `import.meta.env.PROD`。

**`compiler.removeConsole` 的等价实现（需在实现时确认 API）**

`next.config.js` 现在做的是：生产环境移除 `console.log`，但**保留 `console.error` 和 `console.warn`**。

Vite 8 换成 Rolldown/Oxc 后，esbuild 时代常见的 `esbuild: { drop: ['console'] }` 写法不能照抄 —— 而且 `drop: ['console']` 是全量移除，会连 `error`/`warn` 一起干掉，与当前行为不等价。实现时按以下顺序尝试：

1. **首选**：`oxc` 配置项下的 pure-function 剥离，把 `console.log` 列为可安全移除的纯函数调用（保留 `error`/`warn`）。具体字段名需查 Rolldown `TransformOptions` 的当前签名 —— 本 spec 不臆测。
2. **保底**：`build.minify: 'terser'` + `terserOptions.compress.pure_funcs: ['console.log']`。这套 API 稳定且行为精确可控，代价是加一个 `terser` devDependency、构建稍慢。

**验收以行为为准，不以配置写法为准**：生产构建产物中 `console.log` 已消失、`console.error` / `console.warn` 仍在。若首选方案做不到精确保留，直接用保底方案，不要为了少一个依赖而牺牲 `error`/`warn`（它们是线上排障的唯一手段）。

---

### 6.5 Lint：ESLint 全栈 → Biome

用 `@biomejs/biome@2.5.12` 取代 `eslint` + `@eslint/js` + `typescript-eslint` + `eslint-plugin-react-hooks` + `globals`（5 个包 → 1 个），`eslint.config.mjs` → `biome.json`。

**现有 4 条规则的映射已逐条核实**（比对 Biome 的 `configuration_schema.json`）：

| 现有 ESLint 规则 | 级别 | Biome 等价 | 分组 |
|---|---|---|---|
| `react-hooks/rules-of-hooks` | error | `useHookAtTopLevel` | `correctness` |
| `react-hooks/exhaustive-deps` | warn | `useExhaustiveDependencies` | `correctness` |
| `@typescript-eslint/no-unused-vars` | warn | `noUnusedVariables` + `noUnusedFunctionParameters` | `correctness` |
| `@typescript-eslint/no-explicit-any` | warn | `noExplicitAny` | `suspicious` |

四条全部有对应规则，**没有能力缺口**。注意 ESLint 的 `no-unused-vars` 在 Biome 里拆成了变量和函数参数两条规则，两条都要配。

**一个不完全等价处**：现有配置用 `argsIgnorePattern: "^_"` / `varsIgnorePattern: "^_"`（正则）忽略下划线前缀。Biome 的 `noUnusedVariables.ignore` 取的是**标识符名数组**（`{ "*": [...], "function": [...] }`），不是正则。Biome 对 `_` 前缀有内建处理，实现时**先验证默认行为是否已满足**；若不满足，用 `ignore` 显式列出。这是小事，但别默认它自动等价。

**关键决策：阶段 1 只启用 linter，不启用 formatter。**

Biome 同时是格式化工具，而本项目**当前没有 Prettier**，代码风格是历史自然形成的。一旦开启 `biome format`，169 个文件会被全量重排 —— 这个 diff 会把框架迁移的真实改动彻底淹没，让 code review 失去意义。

所以：

- 阶段 1 的 `biome.json` 设 `"formatter": { "enabled": false }`，只跑 lint
- 格式化作为**独立的一个 commit** 单独引入，时机在阶段 1 合并**之后**、阶段 2 开始**之前**，并在 `.git-blame-ignore-revs` 里登记该 commit，避免污染 `git blame`

**scripts**：

```json
{
  "lint": "biome lint .",
  "lint:fix": "biome lint --write .",
  "check": "biome check ."
}
```

**顺带收益**：Biome 是 Rust 单二进制，替换掉 5 个 npm 包及其传递依赖，`bun install` 会明显变快 —— 与本次迁移"换 Bun 提速"的动机一致。

## 7. 部署拓扑与 Docker Compose

### 7.1 拓扑：VPS + Cloudflare Tunnel

```
浏览器 ──TLS──> Cloudflare 边缘 ──加密隧道──> cloudflared 容器 ──明文 HTTP──> app 容器
                                              （同一 docker 网络，不出 VPS）
```

这个选择消掉了两类工作，也带来几个必须处理的细节。

**消掉的**：

- **TLS 不需要自己管**。终止在 Cloudflare 边缘，证书由 CF 签发续期。`server/index.ts` 只服务明文 HTTP，**不需要 Caddy / Traefik / certbot**。
- **不需要开任何入站端口**。`cloudflared` 是**出站**建连到 CF 边缘的，VPS 防火墙可以对公网完全关闭 80/443。app 容器也**不 publish 端口到宿主机** —— 只暴露在 docker 内部网络上给 cloudflared 访问。这比 Pages 时代的攻击面还小。

**必须处理的**：

1. **信任 `X-Forwarded-Proto`**。origin 收到的是 HTTP，如果服务端有任何"非 HTTPS 就重定向到 HTTPS"的逻辑，会和 CF 之间形成**无限重定向循环**。§4 的尾斜杠 301 重定向要注意只处理路径、不碰协议。
2. **真实客户端 IP 在 `CF-Connecting-IP`**，不是 socket 远端地址（那是 cloudflared 的容器 IP）。阶段 1 只影响 Sentry 的请求上下文；**阶段 2 的 Redis 限流必须读这个头**，否则会把所有用户当成同一个 IP 限流。
3. **`/sw.js` 要显式绕过 CF 边缘缓存**。CF 默认缓存 `.js` 扩展名。虽然它会尊重 origin 的 `Cache-Control: no-store`，但 Service Worker 的更新链路本来就是本项目最脆弱的一环（最近两个 commit 都在修它），在 CF 加一条 Cache Rule 对 `/sw.js` 设 Bypass 是廉价保险。
4. **SSR 的 HTML 不能被边缘缓存**。CF 的 Standard 缓存级别默认不缓存 HTML，所以阶段 1 无需额外配置；但阶段 2 的 HTML 会带用户态（主题、登录状态），届时必须确认没有任何 Cache Rule 把 HTML 纳入缓存。
5. **`/assets/*` 交给 CF 缓存**。§6.3 的 `max-age=31536000, immutable` 会让 CF 边缘长期缓存，这是白拿的 CDN 收益 —— 前提是路径改对了（不是 `/_next/static/*`）。

### 7.2 Compose

阶段 1 是 app + cloudflared 两个服务，**结构上预留** pg 和 redis，让阶段 2 只需取消注释。

```yaml
services:
  app:
    build:
      context: .
      args:
        VITE_API_URL: ${VITE_API_URL}
        VITE_WS_URL: ${VITE_WS_URL}
        VITE_SENTRY_DSN: ${VITE_SENTRY_DSN}
        VITE_APP_VERSION: ${VITE_APP_VERSION}
    expose: ["3000"]          # 只对 docker 网络暴露，不 publish 到宿主机
    environment:
      NODE_ENV: production
      PORT: 3000
    healthcheck:
      test: ["CMD", "bun", "-e", "const r = await fetch('http://localhost:3000/healthz'); process.exit(r.ok ? 0 : 1)"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CF_TUNNEL_TOKEN}    # 从 .env 读，不进镜像不进 git
    depends_on:
      app:
        condition: service_healthy
    restart: unless-stopped

  # 阶段 2 启用
  # postgres:
  #   image: postgres:17-alpine
  #   volumes: [pgdata:/var/lib/postgresql/data]
  # redis:
  #   image: redis:8-alpine
  #   volumes: [redisdata:/data]
```

Tunnel 的 ingress 规则用 CF 面板托管（remote-managed tunnel），映射 `huanvae.cn` → `http://app:3000`。`CF_TUNNEL_TOKEN` 是密钥，必须走 `.env` 且 `.env` 要在 `.gitignore` 里 —— 迁移时确认。

`depends_on: service_healthy` 保证 app 起来之前 cloudflared 不接流量，避免部署瞬间的 502。

### 7.3 Dockerfile 与构建时变量

`Dockerfile` 用 `oven/bun` 多阶段构建：deps → build → runtime，runtime 只带 `build/` 产物和生产依赖，非 root 用户运行。

**关键约束：`VITE_*` 变量在构建时被内联进 JS 产物，不是运行时读取。** 所以：

- 它们必须作为 **build args** 传入（见 §7.2），不能只放 `environment`
- 改 `VITE_API_URL` 需要**重新构建镜像**，重启容器无效
- 推论：**镜像是环境相关的**，不能"一个镜像部署到多环境"

这与 `src/lib/apiConfig.ts` 现有的"localStorage 可覆盖 API 地址"机制并存 —— 后者是纯运行时的，不受影响，仍可用于临时切换后端。

---

## 8. package.json 变更

当前 `dependencies` 40 个、`devDependencies` 18 个。

**删除**（13 个包 + pnpm 字段）：

- `dependencies`：`next`、`@sentry/nextjs`
- `devDependencies`（构建相关）：`@serwist/next`、`@serwist/cli`、`autoprefixer`、`postcss`、`@tailwindcss/postcss`、`esbuild`
- `devDependencies`（ESLint 全栈，换 Biome）：`eslint`、`@eslint/js`、`typescript-eslint`、`eslint-plugin-react-hooks`、`globals`
- `package.json` 字段：`packageManager`、`pnpm.overrides`（overrides 内容需迁移，见下）

> `postcss` / `autoprefixer` / `@tailwindcss/postcss` 换成 `@tailwindcss/vite`（Tailwind v4 官方 Vite 插件，参考仓库用的也是它）。
> `globals` 已确认未被 `eslint.config.mjs` import，本就是残留依赖。
> ESLint 全栈换 Biome，见 §6.5。

**需要替换而非删除**：`next-themes`

它**确实在被使用**，但只有一处：`src/components/ui/sonner.tsx:10` 的 `useTheme()`。

这里有一个**既存缺陷**：项目里没有挂载 next-themes 的 `ThemeProvider`（`src/app/providers.tsx` 的主题同步是手写的，走 `settingsStore` + `documentElement.classList`）。所以 `useTheme()` 永远返回默认值 `"system"`，Toaster 的主题实际上**从未跟随过应用主题**。

迁移时顺手修掉：`sonner.tsx` 改为从 `useSettingsStore((s) => s.theme)` 取值，然后删除 `next-themes` 依赖。这是迁移的副产品修复，不额外扩大范围。

**新增**：

| 包 | 版本 | 用途 |
|---|---|---|
| `react-router` | ^8.3.1 | 路由核心 |
| `@react-router/dev` | ^8.3.1 | Vite 插件 + CLI |
| `@react-router/node` | ^8.3.1 | 服务端适配 |
| `vite` | **^8.2.2** | 构建 |
| `@vitejs/plugin-react` | **^6.1.1** | React 支持 |
| `@tailwindcss/vite` | ^4.3.3 | Tailwind v4 |
| `@serwist/vite` | ^9.5.12 | PWA |
| `@sentry/react-router` | ^10.73 | 错误监控（待验证 RR8 支持，见 §6.2） |
| `@biomejs/biome` | ^2.5.12 | Lint（取代 ESLint 全栈，见 §6.5） |

**版本兼容性已逐条核实**：

- `@react-router/dev@8.3.1` 的 peer 明确声明 `vite: "^7.0.0 || ^8.0.0"` —— **RR8 官方支持 Vite 8**，不是"能跑但没测"。
- `@vitejs/plugin-react` **必须用 6.x**：6.1.1 的 peer 是 `vite: "^8.0.0"`（**只接受 8**）。配 Vite 8 时用 4.x/5.x 会 peer 冲突。它另外三个 peer（`oxc-transform-react`、`@rolldown/plugin-babel`、`babel-plugin-react-compiler`）**全部标了 optional**，不需要额外安装。
- `@tailwindcss/vite@4.3.3` peer `^5.2.0 || ^6 || ^7 || ^8` ✓

**Vite 8 的底层换代 —— 这不只是版本号 +1**

Vite 8 的直接依赖是 `rolldown@~1.2.4` + `lightningcss`，即**打包器从 Rollup/esbuild 换成了 Rolldown，CSS 处理换成 Lightning CSS**。配置层面 `esbuild?: ESBuildOptions | false` 仍在（兼容用），同时新增了 `oxc?: OxcOptions | false`（Oxc 是 Rolldown 的转换器）。

两个连带影响：

1. **console 剥离的写法要重新确认**（见 §6.4）。
2. **`@serwist/vite` 是本次最不确定的一环**：它的 peer 写的是 `vite: ">=5.0.0"` —— 这是个开放区间，**声明兼容不等于测过 Rolldown**。列为风险（§10），验证放在迁移最早期，一旦不通就及早换 `vite-plugin-pwa`，避免到后期才发现。

**scripts**：

```json
{
  "dev": "react-router dev",
  "build": "react-router build",
  "start": "bun run server/index.ts",
  "typecheck": "react-router typegen && tsc --noEmit",
  "lint": "biome lint .",
  "lint:fix": "biome lint --write .",
  "test:e2e": "playwright test"
}
```

**保持不变**（49 个）：所有 UI/功能依赖 —— `@base-ui/react`、`radix-ui`、`zustand`、`framer-motion`、`gsap`、`three`、`react-hook-form`、`zod`、`react-markdown` 全家桶、`lucide-react`、`tailwindcss`、`tailwind-merge`、`class-variance-authority`、`serwist` 核心包等。这些都与框架无关。

**包管理器切换**：删 `pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.pnpm-store/`，跑 `bun install` 生成 `bun.lock`。

> `pnpm.overrides` 里有三条安全覆盖（`minimatch@^10.2.1`、`ajv@^6`→`^6.14.0`、`ajv@^8`→`^8.18.0`）。Bun 的等价机制是 `package.json` 的 `overrides` 字段，需要迁移过去，**不能丢** —— 这些是有意的安全升级。

---

## 9. 测试策略

### 9.1 现状问题

`tests/` 下有 `chat.spec.ts` 和 `device-matrix.spec.js`，`@playwright/test` 在 devDependencies 里，但**仓库根目录没有 `playwright.config.ts`**。也就是说 e2e 当前跑不起来。

**阶段 1 的第一步是补上这个配置并让现有用例跑绿** —— 否则整个迁移没有安全网。这是阶段 1 的前置条件，不是可选项。

### 9.2 验证顺序

1. **补 `playwright.config.ts`，让现有用例在 Next 版本上跑绿** ← 基线
2. **技术骨架验证（spike）** ← 新增，见下
3. 执行迁移
4. 同一套用例在 RR8 版本上跑绿 ← 行为等价性证明
5. 补充迁移专项回归（见 9.3）

**第 2 步为什么必须独立存在**：Vite 8 是 Rolldown 换代版本，`@serwist/vite` 对它的兼容性只有一个开放区间 peer 作依据（§8、§10）。在动 169 个文件**之前**，先在一个临时目录搭最小骨架验证三件事：

- Vite 8 + `@react-router/dev` + `@vitejs/plugin-react@6` 能起 dev server 并 SSR 出页面
- `@serwist/vite` 能构建出可注册的 SW
- `@sentry/react-router` 能在 RR8 下初始化（§6.2）

这是一次性的抛弃型验证，产物不保留。**任何一项不通，先调整方案再开始迁移** —— 代价是半天，换的是不会在迁移做到 80% 时被迫推倒重来。

### 9.3 迁移专项回归清单

现有用例覆盖不到、但迁移风险高的点：

- **20 条路由逐个可达**，且 URL 与 `src/lib/routes.ts` 常量完全一致
- **尾斜杠重定向**：`/app/chat/` → `/app/chat` 返回 301
- **认证守卫**：未登录访问 `/app/*` 跳 `/app/login`；已登录访问 `/app/login` 跳默认页
- **PWA 更新链路**：SW 注册 → 检测到新版本 → 更新提示 → 点击 → 重载（§6.1 风险点）
- **离线页**：断网时 `/~offline` fallback 生效
- **主题防闪**：暗色模式下硬刷新无白屏闪烁
- **hydration 无警告**：13 个 `dynamic` 组件在控制台无 mismatch 报错
- **WebSocket / WebRTC 建连**：迁移后仍能连上 `wss://api.huanvae.cn`

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| `@sentry/react-router` 不支持 RR8 | 中 | 回退 `@sentry/react` + `@sentry/node` 手工接线（§6.2） |
| **`@serwist/vite` 未必测过 Vite 8 / Rolldown** | **高** | peer 只写 `vite: ">=5.0.0"`，是开放区间不是背书（§8）。**放在迁移最早期验证**：先建最小 Vite 8 + RR8 + Serwist 骨架跑通 SW 构建，再动 169 个文件。不通就立即换 `vite-plugin-pwa` |
| Serwist 集成与现有 `sw.ts` 不兼容 | 中 | 该文件刚被改过两次，脆弱；专项回归（§9.3） |
| Vite 8 生态其余插件的 Rolldown 兼容性 | 中 | RR8 与 `@tailwindcss/vite` 的 peer 都已显式包含 `^8`（§8），风险集中在 Serwist 一处 |
| hydration mismatch | 中 | `useHydrated` 守卫（§5.3）；控制台零警告作为验收条件 |
| **安全头随 `_headers` 失效** | **高** | `server/index.ts` 逐条重实现（§6.3）；`Permissions-Policy` 漏掉会静默破坏 WebRTC |
| 静态资源缓存路径 `/_next/static/*` → `/assets/*` 未改 | 中 | 同 §6.3；症状是产物完全不被缓存，需在验收时用 DevTools 确认 |
| 协议重定向与 CF Tunnel 形成循环 | 中 | 尾斜杠 301 只改路径不碰协议（§6.3、§7.1）；验收时 `curl -IL` 确认无循环 |
| `/sw.js` 被 CF 边缘缓存，卡住 SW 更新 | 中 | CF 加 Cache Rule 对 `/sw.js` 设 Bypass（§7.1）；SW 更新链路专项回归（§9.3） |
| `CF_TUNNEL_TOKEN` 误提交进 git | 高 | `.gitignore` 已覆盖 `.env`（已验证）；仍需在 PR 里确认 token 未硬编码进 compose |
| 误以为改环境变量重启即可生效 | 中 | `VITE_*` 是构建时内联的，必须重建镜像（§7.3）；写进部署文档 |

> `.gitignore` 已确认覆盖 `.env`、`out`、`.next`、`.history/`，且 `git ls-files` 无已跟踪的构建产物 —— 原先列的误提交风险不成立，已移除。迁移后可顺手删掉其中 `next-env.d.ts` 一行。

---

## 11. 阶段 2 / 3 契约（各自另写 spec）

### 阶段 2：BFF 数据层

**边界**：业务数据的真实来源仍是 `api.huanvae.cn`。新增的 PG/Redis 只拥有：

- **Redis**：会话 / token（httpOnly cookie，取代当前 localStorage 存 token 的做法）、SSR 缓存、限流
- **Postgres**（Drizzle）：用户偏好、主题配置、已读位置、草稿、消息本地归档与搜索索引

**不做**：认证、好友、消息、群聊、存储、WebRTC 的领域模型 —— 那些归上游后端。

**安全收益**：当前 access/refresh token 存在 `localStorage`（`src/features/auth/store/authStore.ts`），对 XSS 无防护。迁到 httpOnly cookie + Redis session 是实质性提升。

**接入点**：`src/data/` 各函数体从客户端 fetch 换成服务端 loader + Drizzle 查询。

### 阶段 3：设计对齐

**参照**：`huanwei520/Huanvae-Chat-App` 的 `src/styles/variables.css`。注意该仓库**不是 shadcn 项目**（无 `components.json`、无 Radix、无 CVA），所以是"用它的设计语言重铸我们的 shadcn 主题"，不是搬它的组件。

**范围**：

1. **Token 重映射**：`src/styles/globals.css` 的 shadcn CSS 变量从当前青色系（`--primary: 193 86% 41%`）改为参考仓库的蓝 `#3b82f6` / 紫 `#8b5cf6`，引入 12 级色阶（`--color-primary-1..12`、`--color-accent-1..12`、`--color-neutral-1..12`）
2. **圆角体系**：当前 `--radius: 0.8rem` 单值 → 参考仓库的 8/12/14/16/22/28px 六级体系
3. **玻璃质感层**：给 card / sidebar / dialog / popover / input 加毛玻璃变体（`backdrop-filter: blur() saturate()` + 多层阴影 + 内高光 + 渐变页面底）
4. **ThemeProvider 动态主题**：移植参考仓库 `src/theme/` 的运行时色阶生成（用户可换主色），注入到 `:root`

59 个 `src/components/ui/` 组件因为都走 CSS 变量，token 层改完自动跟随；只有需要玻璃质感的那几个容器组件要加变体类。

---

## 12. 阶段 1 验收标准

- [ ] `bun install` 生成 `bun.lock`，`pnpm-lock.yaml` / `pnpm-workspace.yaml` 已删除，`overrides` 三条安全约束已迁移
- [ ] `bun run dev` 启动 Vite dev server，20 条路由全部可访问
- [ ] `bun run build` 产出 SSR 构建，`bun run start` 能起服务
- [ ] `bun run typecheck` 零错误
- [ ] `bun run lint`（Biome）零 error（warn 可接受），4 条规则映射生效（§6.5）
- [ ] `biome.json` 中 formatter 处于禁用状态（格式化留作独立 commit，§6.5）
- [ ] `docker compose up` 起 app + cloudflared，`/healthz` 返回 200，cloudflared 在 app healthy 后才接流量
- [ ] VPS 防火墙对公网关闭 80/443，站点仍可从公网正常访问（证明流量确实走隧道）
- [ ] `curl -IL https://huanvae.cn/app/chat/` 得到单次 301 到 `/app/chat`，**无重定向循环**
- [ ] `CF_TUNNEL_TOKEN` 在 `.env` 中且 `.env` 已被 `.gitignore` 覆盖
- [ ] Playwright 现有用例 + §9.3 专项回归全绿
- [ ] 浏览器控制台无 hydration 警告
- [ ] **§6.3 表中 8 条响应头逐条验证生效**（`curl -I` 比对），其中 `Permissions-Policy` 的 camera/microphone 必须允许 self
- [ ] **静态资源长缓存路径已从 `/_next/static/*` 改为 `/assets/*`** 并在 DevTools 确认命中
- [ ] `sonner.tsx` 的 Toaster 主题跟随应用主题（既存缺陷已修，见 §8）
- [ ] **生产产物中 `console.log` 已剥离，`console.error` / `console.warn` 仍保留**（§6.4，以行为验收而非配置写法）
- [ ] `bun run build` 使用 Vite 8（`vite --version` 确认 8.x），无 peer 依赖警告
- [ ] 仓库内 `grep -r "next/" src/` 无结果（除注释）
- [ ] `next.config.js`、`next-env.d.ts`、`serwist.config.js`、`public/_headers`、`.next/`、`out/` 已删除

---

## 13. 部署决策与剩余问题

**已定**：VPS 自托管，Cloudflare Tunnel 出口。拓扑、TLS 归属、端口策略、响应头迁移见 §7。DNS 侧只需在 CF 面板把 `huanvae.cn` 指向 tunnel，不需要改 A/AAAA 记录。

**剩余的一个小问题：镜像在哪构建。**

前端仓库目前**没有任何 CI**（`huanvae/.github` 只是组织 profile README，`frontend/` 下无 `.github/`），Cloudflare Pages 时代应是走 CF 的 git 集成自动构建。换成自托管后这条链断了，需要补。两个选项：

- **在 VPS 上 `docker compose build`（推荐作为起步）**：最少的活动部件，`.env` 就在机器上，不需要镜像仓库、不需要往 CI 传 secret。代价是构建吃 VPS 资源，且构建期间机器负载高。以本项目规模（169 文件）这代价可以接受。
- **CI 构建 + 推镜像仓库**：VPS 只 `docker compose pull && up`。更规范，回滚也更容易（镜像有 tag）。代价是要建 GitHub Actions、配镜像仓库、把 4 个 `VITE_*` 和注册表凭据作为 secret 注入。

**建议起步用前者，等部署节奏稳定后再上 CI。** 这个决定不阻塞阶段 1 的编码 —— `Dockerfile` 和 `compose.yml` 两种方式完全一样，区别只在谁执行 `build`。所以**可以现在就开始实施，这个问题在第一次部署前定下即可**。
