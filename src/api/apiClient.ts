import { getApiBaseUrl } from '../lib/apiConfig'
import { isAuthApiError } from '@/lib/apiEnvelope'
import { fetchWithAuth } from './authedFetch'

const BASE_URL = getApiBaseUrl()

/**
 * `apiClient` 的请求超时（毫秒）。
 * 2026-09-07 合并前它属于本文件私有的 `fetchWithTimeout`；现在作为
 * `fetchWithAuth` 的可选能力传进去，只有本文件这两个调用方（lowcode /
 * diagnostic）启用，其余九个模块保持无超时的既有行为。
 */
const REQUEST_TIMEOUT = 30000

/**
 * 认证错误类
 * 用于区分认证相关的错误和其他错误
 *
 * 2026-09-07 起本文件不再抛出它（传输层已合并进 `authedFetch.ts`，那一份统一
 * 返回 `Response`）。类保留是因为它仍是 `isAuthError` 最可信的一档：调用方若
 * 要表达「这是一次认证失败」，抛它即可，不必依赖文案关键词。
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

// 认证相关错误的标识
const AUTH_ERROR_MESSAGES = [
  'token',
  '无效',
  '过期',
  'expired',
  'invalid',
  'unauthorized',
  '登录',
  'login',
  '认证',
  'authentication',
]

/**
 * 判断是否是认证相关的错误
 *
 * 三档，从可靠到不可靠：
 * 1. `AuthenticationError` —— 调用方显式标注的认证失败，最可信。
 * 2. `isAuthApiError` —— 解包层的 `ApiError` 带真实 HTTP 状态码，**401** 直接判定。
 *    **这一档不能省**：解包层抛出的错误文案是后端原文，很可能一个
 *    AUTH_ERROR_MESSAGES 关键词都不含（例如"您的会话已结束"），只靠下面的
 *    关键词匹配会让 401 不再触发静默重定向——那是一次实打实的回归。
 *    **`403` 刻意不在这一档**：本后端的 403 是普通权限不足（`权限不足`），
 *    不是 token 失效；判成认证错误会让"打开一个没权限的文件"变成
 *    `friendsStore` / `profileStore` 里 `silentRedirectToLogin()` 的无提示登出，
 *    或 `chatStore` 的 `return []`。详见 `isAuthApiError` 的注释。
 * 3. 关键词匹配 —— 兜住那些还没接入解包层的裸 `Error` / 字符串，
 *    等三个模块全部迁完之后可以再评估要不要删。
 *    403 落到这一档后，因为文案「权限不足」不含任何关键词，会正确地
 *    作为可见错误继续上抛，而不是被静默吞掉。
 *
 * 三个消费点（`chatStore` / `friendsStore` / `profileStore`）全部是**静默**路径，
 * 判真 = 用户看不到任何解释，所以它必须只对真正的认证失败为真。
 * 由 `__tests__/apiClient.test.ts` 守着 401/403 的分界。
 */
const isAuthError = (error: Error | string): boolean => {
  // AuthenticationError 直接返回 true
  if (error instanceof AuthenticationError) {
    return true
  }

  // 有状态码就不猜词
  if (isAuthApiError(error)) {
    return true
  }

  const message = typeof error === 'string' ? error : error.message
  const lowerMessage = message.toLowerCase()
  return AUTH_ERROR_MESSAGES.some(keyword => lowerMessage.includes(keyword.toLowerCase()))
}

/**
 * 通用 API 客户端，自动处理认证和超时。
 *
 * 传输层是全仓唯一那份 `authedFetch.ts`：**只对 401 刷新重试一次，永远返回
 * `Response`**。本文件合并前另有一份会在认证失败时静默 `location.replace` 到
 * 登录页并抛 `AuthenticationError` 的实现，已于 2026-09-07 删除——它的两个
 * 调用方（`lowcode` / `diagnostic`）本就只读 `response.ok`，从不 catch 那个错误，
 * 于是「刷新后仍 401」表现为一次无解释的跳转。现在它会作为带后端原文的可见
 * 错误从调用方的 `if (!response.ok)` 抛出。refresh token 真失效时，
 * `authedFetch` 仍会 clearAuth 并跳登录页。
 */
export const apiClient = {
  get: async (path: string, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, { ...options, method: 'GET' }, { timeoutMs: REQUEST_TIMEOUT })
  },

  post: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(
      `${BASE_URL}${path}`,
      {
        ...options,
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
      },
      { timeoutMs: REQUEST_TIMEOUT }
    )
  },

  put: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(
      `${BASE_URL}${path}`,
      {
        ...options,
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined,
      },
      { timeoutMs: REQUEST_TIMEOUT }
    )
  },

  delete: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(
      `${BASE_URL}${path}`,
      {
        ...options,
        method: 'DELETE',
        body: data ? JSON.stringify(data) : undefined,
      },
      { timeoutMs: REQUEST_TIMEOUT }
    )
  },
}

export { isAuthError }
