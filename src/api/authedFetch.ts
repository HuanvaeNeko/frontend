import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'

/**
 * 带认证与自动重试的 `fetch`。全仓唯一一份。
 *
 * 2026-09-07 之前这段逻辑以**九份逐字副本**存在于 `auth` / `profile` / `friends` /
 * `messages` / `groupMessages` / `groups` / `webrtc` / `storage` / `discovery`
 * 九个模块里（`apiClient.ts` 另有一份语义不同的，见文末）。九份当时确实字节等价，
 * 但等价是巧合而非机制：任何一次只改一处的修复都会让它们悄悄分叉。
 *
 * ## 两条不能动的语义
 *
 * **1. 只认 401，不认 403。**
 * 本后端用 403 表达普通权限不足（「权限不足」「不是本群活跃成员」——故意同形），
 * 用 401 表达 token 失效。把 403 并进来的后果是「打开一个没权限的文件」变成无提示
 * 登出。所以下面的分支是写死的 `=== 401`，不是 `>= 401`，也不复用任何「像是认证
 * 错误吗」的启发式判断。`apiClient.ts` 的 `isAuthError` 是另一条路径上的同一道坎，
 * 由 `__tests__/apiClient.test.ts` 单独守着。
 *
 * **2. 刷新只能走 `authStore.refreshAccessToken()`。**
 * 单飞锁和「刚轮换过 10 秒内跳过」的窗口都在 authStore 的模块级
 * （`refreshInFlight` / `lastRotatedAt`），只有所有调用者都汇进那一个漏斗才对所有人
 * 生效。这里绝不能自己去 `POST /api/auth/refresh`：并发刷新会带着同一个 refresh
 * token 出去，后端每次轮换一对新的，先落地的那对被后来的作废，最后全部 401 →
 * 拿作废的 token 再刷再 401 → clearAuth 跳登录。这正是 `7ee0598` 修的线上故障。
 *
 * ## 与 `apiClient.ts` 的 `fetchWithAuth` 的区别（两者刻意并存）
 *
 * 那一份会在认证失败时 `silentRedirectToLogin()` 并抛 `AuthenticationError`，
 * 且带 30 秒超时；本函数**永远返回 `Response`**，把 401/403/5xx 都交回调用方去
 * 解包——迁移期的模块依赖这个契约（信封解包层要读 body 才能给出可见错误）。
 * 那一份现在只剩 `lowcode` / `diagnostic` 两个调用点，不要把本函数换成它。
 */

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const authStore = useAuthStore.getState()

  // 检查 Token 是否即将过期，如果是则刷新。
  // 失败只记日志不中断：预刷新是尽力而为，让后端用 401 来裁决。
  if (authStore.checkTokenExpiry() && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
    } catch (error) {
      console.error('Failed to refresh token:', error)
    }
  }

  const headers = getAuthHeaders()

  let response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  // 如果 Token 过期，尝试刷新后重试一次。
  // 重试前重新取一次头：`headers` 是刷新之前算的，带的是已经作废的旧 token。
  if (response.status === 401 && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
      const newHeaders = getAuthHeaders()
      response = await fetch(url, {
        ...options,
        headers: {
          ...newHeaders,
          ...options.headers,
        },
      })
    } catch (error) {
      console.error('Token refresh failed, redirecting to login')
      authStore.clearAuth()
      window.location.href = ROUTES.auth.login
      throw error
    }
  }

  return response
}
