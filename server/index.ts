import type { ServerBuild } from 'react-router'

// vite.config.ts 把 react-dom 打进了 build/server/index.js（noExternal），
// 那段代码在运行时读 process.env.NODE_ENV 来决定用生产版还是开发版实现。
// bun run/Docker CMD 都不会替我们设这个变量，不在这里兜底的话，"生产服务器"
// 会静默跑 React 的开发版渲染（更慢、体积更大、带一堆仅供调试的检查）。
// 用 ??= 只在没人显式设置时才生效，不覆盖有意设置的 NODE_ENV=development。
//
// 必须在任何一个会加载 react/react-dom 的 import 之前设置：ES Module 的
// import 在模块求值阶段就会执行，早于本文件里排在 import 语句之后的普通
// 代码。所以上面这行 `import type` 用纯类型导入（编译期整条擦除，
// 不产生真实 import），真正的 createRequestHandler 改成下面 NODE_ENV
// 赋值之后再动态 import('react-router') —— 顺序调换过、已实测复现：
// 调换前 react（外部、运行时按 NODE_ENV 走）已经在开发模式下完成初始化，
// 与随后按 production 分支跑的内联 react-dom 内部结构对不上，
// SSR 时直接 500（dispatcher.getOwner is not a function）。
process.env.NODE_ENV ??= 'production'

const PORT = Number(process.env.PORT ?? 3000)

// 原 public/_headers 的安全头，Cloudflare Pages 格式在 Docker 下失效，此处重新实现。
// Permissions-Policy 的 camera/microphone 必须允许 self —— 漏掉会静默破坏视频会议。
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
}

const { createRequestHandler } = await import('react-router')

// @ts-ignore 构建产物，仅在 build 后存在；build 后其类型是压缩产物的结构化推断，
// 与 ServerBuild 无法精确对齐（例如 entry.module 被推断为 {}），故整体断言为 ServerBuild。
const build = (await import('../build/server/index.js')) as unknown as ServerBuild
const handler = createRequestHandler(build, 'production')

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/healthz') {
      return new Response('ok', { status: 200 })
    }

    // 尾斜杠 301：原 Next 配置是 trailingSlash: true，迁移后不带尾斜杠。
    // 只改路径、绝不碰协议 —— origin 在 Cloudflare Tunnel 后面收到的是 HTTP，
    // 任何 http→https 重定向都会与 CF 边缘形成无限循环。
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '')
      return Response.redirect(url.toString(), 301)
    }

    // Service Worker：绝不缓存
    if (url.pathname === '/sw.js') {
      const file = Bun.file('build/client/sw.js')
      if (await file.exists()) {
        return withSecurityHeaders(new Response(file, {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }))
      }
    }

    // 构建产物：长缓存。注意路径是 /assets/*（Vite），不是 /_next/static/*（Next）。
    if (url.pathname.startsWith('/assets/')) {
      const file = Bun.file(`build/client${url.pathname}`)
      if (await file.exists()) {
        return withSecurityHeaders(new Response(file, {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        }))
      }
    }

    // public/ 下的其余静态文件
    const publicFile = Bun.file(`build/client${url.pathname}`)
    if (url.pathname !== '/' && (await publicFile.exists())) {
      return withSecurityHeaders(new Response(publicFile))
    }

    // 真实客户端 IP 在 CF-Connecting-IP 头（socket 远端地址是 cloudflared 的容器 IP）。
    // 阶段 1 无限流/日志需求，故未读取；阶段 2 的 Redis 限流必须读它，
    // 否则会把所有用户当成同一个 IP。

    return withSecurityHeaders(await handler(request))
  },
})

console.warn(`server listening on :${PORT}`)
