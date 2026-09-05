import type { ServerBuild } from 'react-router'
// filterSensitiveData 单独在 src/config/filterSensitiveData.ts 里：那个模块
// 对 @sentry/react-router、React 都零运行时依赖，也不引用 import.meta.env
// （完整原因见该文件顶部注释）。正因为如此，它可以放心用静态 import，和上面
// 纯类型的 ServerBuild 一样，不会像 Sentry 或 react-router 那样在 NODE_ENV
// 落定前就把 React 拉进模块缓存——下面 NODE_ENV 赋值那段注释详细解释了这个
// 风险具体从何而来。这里不再像早期版本那样从客户端的 sentry.ts 动态
// `await import(...)` 出 filterSensitiveData：那个文件其余 8 处判断都是
// `import.meta.env.PROD`，在 Bun 下恒为 falsy，
// 跨端引入整个模块会带出"看似能调、实际静默 no-op"的其余导出，只是因为一直
// 没人在服务端调用到才没出过问题；改成从这个零依赖的小模块导入，从结构上
// 消除这个隐患。
import { filterSensitiveData } from '../src/config/filterSensitiveData'

// vite.config.ts 把 react-dom 打进了 build/server/index.js（noExternal），
// 那段代码在运行时读 process.env.NODE_ENV 来决定用生产版还是开发版实现。
// bun run/Docker CMD 都不会替我们设这个变量，不在这里兜底的话，"生产服务器"
// 会静默跑 React 的开发版渲染（更慢、体积更大、带一堆仅供调试的检查）。
// 用 ??= 只在没人显式设置时才生效，不覆盖有意设置的 NODE_ENV=development。
//
// 必须在任何一个会加载 react/react-dom 的 import 之前设置：ES Module 的
// import 在模块求值阶段就会执行，早于本文件里排在 import 语句之后的普通
// 代码。所以上面两行 import（type-only 的 ServerBuild、零运行时依赖的
// filterSensitiveData）都不会加载 react 生态，真正的 createRequestHandler
// 改成下面 NODE_ENV 赋值之后再动态 import('react-router') —— 顺序调换过、
// 已实测复现：调换前 react（外部、运行时按 NODE_ENV 走）已经在开发模式下
// 完成初始化，与随后按 production 分支跑的内联 react-dom 内部结构对不上，
// SSR 时直接 500（dispatcher.getOwner is not a function）。
process.env.NODE_ENV ??= 'production'

// Sentry 服务端初始化。刻意放在这里（NODE_ENV 赋值之后，其余业务 import 之前），
// 不能像 src/app/entry.client.tsx 那样用静态 `import * as Sentry from
// '@sentry/react-router'` 放在文件顶部：这个包的 Node 导出
// （@sentry/react-router/build/esm/index.server.js）里有一行
// `export { createSentryHandleRequest } from './server/createSentryHandleRequest.js'`，
// 而 createSentryHandleRequest.js 顶层是 `import React from 'react'` ——
// ES 模块的静态 import/export-from 在模块求值阶段就会连带执行，一旦这行发生在
// 上面 NODE_ENV 赋值之前，会在 NODE_ENV 还没落定时就把 react 拉进模块缓存；
// react/index.js 自己也是 `process.env.NODE_ENV === 'production' ? require(prod)
// : require(dev)` 这种一次性分支（同上面注释里 react-dom 那次事故的机制完全一样），
// 一旦缓存住开发版就不会再重新求值，会和 build/server/index.js 里内联的、按
// NODE_ENV=production 求值的 react-dom 对不上，复现同一类 dispatcher 不匹配的
// 500。改成动态 import 并放在赋值之后，拿到的 react 已经是在 NODE_ENV=production
// 下求值的版本，从源头避开这个问题（已用 bun run build && bun run start 验证：
// curl / 返回 200，服务端日志无报错，见 task-9-report.md）。
//
// beforeSend 复用文件顶部静态导入的 filterSensitiveData，和客户端的
// sentry.ts 共用同一份实现——避免"过滤 password/token"这条安全规则在两处
// 分别维护、日后改一边忘了改另一边。
if (process.env.NODE_ENV === 'production') {
  const Sentry = await import('@sentry/react-router')

  Sentry.init({
    dsn: process.env.VITE_SENTRY_DSN || '',
    environment: process.env.NODE_ENV,
    // 服务端不经过 vite.config.ts 的 define 注入（那只对 Vite 构建的产物生效），
    // 读不到真实 package.json 版本号，回退值与客户端一致；DSN 未配置时 Sentry
    // 本就是 inert，这个 release 标签不会被真正发送。
    release: `huanvae-frontend@${process.env.VITE_APP_VERSION || '1.0.0'}`,
    beforeSend: filterSensitiveData,
  })
}

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

    // spec §6.3 把六条安全头范围定在 /*，健康检查端点不是例外——即使探测方是
    // Docker healthcheck 而不是浏览器，也没有理由让这一条路径少一份纵深防御。
    if (url.pathname === '/healthz') {
      return withSecurityHeaders(new Response('ok', { status: 200 }))
    }

    // 尾斜杠 301：原 Next 配置是 trailingSlash: true，迁移后不带尾斜杠。
    // Location 只拼 pathname + search 这个相对引用，绝不用 url.toString()
    // 或以任何方式带出协议/主机。原因：new URL(request.url) 会如实相信请求行里
    // 到达的 scheme 和 host —— HTTP/1.1 允许 absolute-form request-target
    // （RFC 7230 §5.3.2），Bun.serve 会遵循它，所以一个精心构造的请求
    // （如 `GET http://evil.example/foo/ HTTP/1.1`）能让 url.toString() 把
    // evil.example 原样反射进 Location，构成开放重定向（已实测复现）。
    // 只拼相对路径从结构上杜绝了这个问题，也是"绝不碰协议"这句话真正成立的
    // 唯一方式——origin 在 Cloudflare Tunnel 后面只看得到 HTTP，一旦重定向里
    // 混进了协议/主机，就有被攻击者操纵、或者在改协议时与 CF 边缘的 TLS
    // 终止形成无限循环的风险。
    // 同样套 withSecurityHeaders：带尾斜杠的 URL 是 Next 时代的合法 canonical
    // 形式，旧书签、外链、搜索引擎缓存结果会先命中这一条 301，不能让它们拿到
    // 一个没有安全头的响应。
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      const location = url.pathname.replace(/\/+$/, '') + url.search
      return withSecurityHeaders(new Response(null, { status: 301, headers: { Location: location } }))
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
