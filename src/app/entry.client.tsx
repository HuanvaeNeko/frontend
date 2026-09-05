import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { initSentry } from '@/config/sentry'

// 越早调用越好：要能捕获水合过程本身抛出的错误。initSentry() 内部按
// import.meta.env.PROD 门控，dev 下是 no-op。
initSentry()

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  )
})
