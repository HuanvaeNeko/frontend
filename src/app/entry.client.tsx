import * as Sentry from '@sentry/react-router'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { initSentry } from '@/config/sentry'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'

// 越早调用越好：要能捕获水合过程本身抛出的错误。initSentry() 内部按
// import.meta.env.PROD 门控，dev 下是 no-op。
initSentry()

// API 响应形状漂移的上报口。
//
// 为什么在这里接、而不是在 apiEnvelope.ts 里直接 import Sentry：解包层会被
// server 端（server/index.ts 跑纯 Bun）间接引用，那边 import.meta.env.PROD
// 恒为 falsy，直接 import 会让上报静默失效——这个坑
// src/config/filterSensitiveData.ts 顶部注释已经记过一次。entry.client.tsx
// 是纯客户端入口、由 Vite 打包，在这里 import Sentry 才是安全的。
//
// 上报和抛出是并行的两件事：即使调用点 catch 掉了形状错误（降级成空列表、
// 提示一条 toast），监控里也必须留下一条记录——否则就是下一个"半年没人发现"。
setApiShapeErrorReporter((error) => {
  console.error(`[api-shape] ${error.endpoint}: ${error.message}`, error.payload)
  Sentry.captureException(error, {
    tags: { kind: 'api-shape', endpoint: error.endpoint },
    extra: { status: error.status, payload: error.payload },
  })
})

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  )
})
