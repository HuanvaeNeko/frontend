import * as Sentry from '@sentry/react-router'
// filterSensitiveData 单独拆到了自己的模块：server/index.ts 也要用它，
// 但不能连带引入这个文件里其余 8 处 import.meta.env.PROD 判断——那些判断
// 在 Bun 的服务端运行时里恒为 falsy（import.meta.env 在 Bun 下就是
// process.env，没有 Vite 注入的 PROD 布尔值），会让 initSentry /
// captureError 等其余导出被服务端误用时静默 no-op。完整原因见
// ./filterSensitiveData.ts 顶部注释。
import { filterSensitiveData } from './filterSensitiveData'

/**
 * Sentry 错误监控配置
 */
export const initSentry = () => {
  // 只在生产环境启用 Sentry
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN || '',

      // 设置环境
      environment: import.meta.env.MODE,

      // 设置发布版本
      release: `huanvae-frontend@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,

      // 性能监控
      // reactRouterTracingIntegration 是 @sentry/react-router 专为 RR 提供的
      // 集成，内部包装了 browserTracingIntegration 并接管路由级 instrumentation
      // （RR8 不会像原 Next.js 的 Sentry SDK 那样自动做路由埋点，需要显式加这一项）——
      // 见 docs/superpowers/specs/2026-09-04-spike-findings.md §3。
      integrations: [
        Sentry.reactRouterTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],

      // 采样率配置
      tracesSampleRate: 0.1, // 10% 的请求会被追踪
      replaysSessionSampleRate: 0.1, // 10% 的 session 会被录制
      replaysOnErrorSampleRate: 1.0, // 100% 的错误会被录制

      // 忽略的错误
      ignoreErrors: [
        // 忽略浏览器扩展引起的错误
        /extensions\//i,
        /^chrome:\/\//i,
        /^chrome-extension:\/\//i,
        // 忽略网络错误
        'Network request failed',
        'NetworkError',
        // 忽略 AbortError
        'AbortError',
        'The operation was aborted',
      ],

      // 过滤敏感信息
      beforeSend: filterSensitiveData,
    })
  }
}

/**
 * 捕获错误
 */
export const captureError = (error: Error, context?: Record<string, unknown>) => {
  if (import.meta.env.PROD) {
    Sentry.captureException(error, {
      extra: context,
    })
  } else {
    console.error('Error:', error, context)
  }
}

/**
 * 捕获消息
 */
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info') => {
  if (import.meta.env.PROD) {
    Sentry.captureMessage(message, level)
  } else {
    console.log(`[${level}]`, message)
  }
}

/**
 * 设置用户信息
 */
export const setUser = (user: { id?: string; email?: string; username?: string } | null) => {
  if (import.meta.env.PROD) {
    Sentry.setUser(user)
  }
}

/**
 * 添加面包屑
 */
export const addBreadcrumb = (breadcrumb: Sentry.Breadcrumb) => {
  if (import.meta.env.PROD) {
    Sentry.addBreadcrumb(breadcrumb)
  }
}
