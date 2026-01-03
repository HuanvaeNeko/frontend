import * as Sentry from '@sentry/nextjs'

/**
 * Sentry 错误监控配置
 */
export const initSentry = () => {
  // 只在生产环境启用 Sentry
  if (process.env.NODE_ENV === 'production') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
      
      // 设置环境
      environment: process.env.NODE_ENV,
      
      // 设置发布版本
      release: `huanvae-frontend@${process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'}`,
      
      // 性能监控
      integrations: [
        Sentry.browserTracingIntegration(),
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
      beforeSend(event, _hint) {
        // 过滤密码等敏感信息
        if (event.request?.data) {
          const data = event.request.data as Record<string, unknown>
          if (data.password) {
            data.password = '[Filtered]'
          }
          if (data.token) {
            data.token = '[Filtered]'
          }
        }
        
        return event
      },
    })
  }
}

/**
 * 捕获错误
 */
export const captureError = (error: Error, context?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'production') {
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
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureMessage(message, level)
  } else {
    console.log(`[${level}]`, message)
  }
}

/**
 * 设置用户信息
 */
export const setUser = (user: { id?: string; email?: string; username?: string } | null) => {
  if (process.env.NODE_ENV === 'production') {
    Sentry.setUser(user)
  }
}

/**
 * 添加面包屑
 */
export const addBreadcrumb = (breadcrumb: Sentry.Breadcrumb) => {
  if (process.env.NODE_ENV === 'production') {
    Sentry.addBreadcrumb(breadcrumb)
  }
}
