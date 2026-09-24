import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'

type SentryModule = typeof import('@sentry/react-router')

// Sentry 按需加载：只有生产构建且配置了 DSN 才下载。
//
// 以前是顶层静态 import，`@sentry/react-router`（连同 Replay 录屏）整块打进 entry
// chunk，每个页面水合前都要下载、解析——而 DSN 为空时 `Sentry.init` 什么都不做
// （client 不启用、integration 不装），这份代价完全白付。DSN 在构建期内联，为空时
// 下面这个分支是死代码，Sentry 的 chunk 根本不会被请求。
//
// 配置了 DSN 时仍然「先 init 再水合」：要能捕获水合过程本身抛出的错误。加载失败
// 不能拦住水合——监控挂了应用照样要能用。
let sentry: SentryModule | null = null
const sentryReady: Promise<void> =
  import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN
    ? Promise.all([import('@sentry/react-router'), import('@/config/sentry')])
        .then(([mod, { initSentry }]) => {
          initSentry()
          sentry = mod
        })
        .catch((error: unknown) => console.error('[sentry] 加载失败', error))
    : Promise.resolve()

// API 响应形状漂移的上报口。
//
// 为什么在这里接、而不是在 apiEnvelope.ts 里直接 import Sentry：解包层会被
// server 端（server/index.ts 跑纯 Bun）间接引用，那边 import.meta.env.PROD
// 恒为 falsy，直接 import 会让上报静默失效——这个坑
// src/config/filterSensitiveData.ts 顶部注释已经记过一次。entry.client.tsx
// 是纯客户端入口、由 Vite 打包，在这里接 Sentry 才是安全的。
//
// 上报和抛出是并行的两件事：即使调用点 catch 掉了形状错误（降级成空列表、
// 提示一条 toast），监控里也必须留下一条记录——否则就是下一个"半年没人发现"。
// 控制台这一行不依赖 Sentry 是否加载，始终打。
setApiShapeErrorReporter((error) => {
  console.error(`[api-shape] ${error.endpoint}: ${error.message}`, error.payload)
  sentry?.captureException(error, {
    tags: { kind: 'api-shape', endpoint: error.endpoint },
    extra: { status: error.status, payload: error.payload },
  })
})

void sentryReady.then(() => {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>,
    )
  })
})
