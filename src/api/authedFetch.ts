import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'

/**
 * 带认证与自动重试的 `fetch`。全仓唯一一份。
 *
 * 2026-09-07 之前这段逻辑以**九份逐字副本**存在于 `auth` / `profile` / `friends` /
 * `messages` / `groupMessages` / `groups` / `webrtc` / `storage` / `discovery`
 * 九个模块里，`apiClient.ts` 另有语义不同的第十份。九份当时确实字节等价，
 * 但等价是巧合而非机制：任何一次只改一处的修复都会让它们悄悄分叉。
 * 第十份随后也已并入本文件，见文末。
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
 * ## 吃掉 `apiClient.ts` 那一份时丢掉了什么（都是有意的）
 *
 * 那一份会在三条路径上 `silentRedirectToLogin()`（`location.replace`）并抛
 * `AuthenticationError`。**没有搬过来**：它的两个调用方（`lowcode` / `diagnostic`）
 * 本就只读 `response.ok`、从不 catch 那个错误，于是「刷新后仍 401」表现为一次
 * 无解释的跳转。本函数**永远返回 `Response`**，把 401/403/5xx 都交回调用方解包，
 * 那种情况变成带后端原文的可见错误。refresh token 真失效（刷新抛错）时，
 * 下面的 catch 仍会 clearAuth 并跳登录页，掉线体验没有丢。
 *
 * 那一份还自带 `isRefreshing` / `refreshPromise` 二级单飞锁——**冗余**，authStore
 * 的漏斗里已有一份，两层锁叠在一个轮换型 refresh token 上只会让推理更难。已删。
 *
 * 唯一保留下来的是 30 秒超时，作为可选的 `timeoutMs` 传入，默认不启用。
 */

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

export interface FetchWithAuthConfig {
  /**
   * 毫秒。**不传 = 不超时**——九个已迁移模块合并前就没有超时，默认值必须保持这个语义。
   * 只有 `apiClient` 对象（lowcode / diagnostic）会传，值取合并前 `fetchWithTimeout`
   * 的 30 秒。初次请求与刷新后的重试**各自**享有一份完整预算，与合并前逐字一致。
   */
  timeoutMs?: number
}

export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {},
  { timeoutMs }: FetchWithAuthConfig = {}
): Promise<Response> => {
  const send = async (init: RequestInit): Promise<Response> => {
    if (timeoutMs === undefined) return fetch(url, init)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接', { cause: error })
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

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

  let response = await send({
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
      response = await send({
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
