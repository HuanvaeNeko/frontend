import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '../lib/apiConfig'
import { ApiError, isAuthApiError } from '@/lib/apiEnvelope'
import { isBusiness401Endpoint } from '@/lib/business401'
import { ROUTES } from '@/lib/routes'
import { fetchWithAuth } from './authedFetch'

const BASE_URL = getApiBaseUrl()

/**
 * 认证错误类
 * 用于区分认证相关的错误和其他错误
 *
 * ⚠️ 合并之后**全仓库没有任何一处再抛它**：那条 throw 在 `apiClient` 自己那份
 * `fetchWithAuth` 的 401 分支里，而合并取的是九份副本「把 401 原样交回调用方」
 * 的形态（理由见 `authedFetch.ts` 的函数注释）。下面 `isAuthError` 的第 1 档
 * 因此暂时没有生产者，保留是因为它是三档里唯一"最可信"的那一档，
 * 将来若有人要造一个明确的认证错误，形状已经在这里了。
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

/**
 * 前端**自己**写死的「未认证」哨兵文案，**整串相等**才算命中。
 *
 * 这里原本是一张关键词表（`'token'` / `'无效'` / `'过期'` / `'invalid'` /
 * `'登录'` / `'认证'` …）配 `message.includes(keyword)`，也就是拿**后端任意
 * 一句话**当分类依据。而 `isAuthError` 判真 = 用户基本得不到任何解释
 * （消费点见下方 `isAuthError` 的注释），于是：
 *
 *   `PUT /api/profile` 的校验失败文案，逐字是
 *   `"Validation error: email: Invalid email format"`
 *   （`backend-docs/profile/个人资料管理.md:213`）——含 `invalid`，
 *   于是"邮箱格式不对"被判成会话失效，`clearAuth()` + `location.replace('/login')`；
 *   而当时 `profileStore.updateProfile` 命中这一档后是 `return` 不是 `throw`，
 *   `ProfilePage` 拿到一个 resolve 的 promise，照样弹绿色的「个人资料已更新」。
 *   一次被拒绝的编辑 = 成功提示 + 无解释登出。
 *
 * 删掉 `'invalid'` 救不活这张表：`'过期'` 会命中"该分享链接已过期"，
 * `'登录'` 会命中"请在登录设备上确认"，`'token'` 会命中 bot 模块的
 * "bot token 无效"（`backend-docs/bots/Bot平台API.md:630`）。
 * **凡是猜后端文案的分类都是同一个 bug**，区别只是哪天撞上。
 *
 * 现在只剩两条，且都是**本仓库源码里的字符串常量**、不是后端文案。
 * `src/api/__tests__/apiClient.test.ts` 的「哨兵两端一致」两条用例是真的从
 * **抛出点**取错误的（`authStore.refreshAccessToken()` / `friendsApi`
 * 在没有 user_id 时），所以抛出点或本表任一端改文案都会红；
 * 只断言 `isAuthError(new Error('用户未登录'))` 的那条用例做不到这一点，
 * 它只钉本表自己。
 */
const FRONTEND_AUTH_SENTINELS: ReadonlySet<string> = new Set([
  // `src/features/auth/store/authStore.ts` 的 `refreshAccessToken`：
  // 调用时连 refresh token 都没有（典型是另一个并发失败刚 `clearAuth()` 过），
  // 会话确实没了。`authedFetch.ts` 的 401 分支 catch 到它之后原样 rethrow，
  // 于是它以裸 `Error` 的形态到达这里。
  'No refresh token available',
  // `src/features/chat/api/friends.ts` 四处（sendFriendRequest / approve /
  // reject / removeFriend）：拿不到自己的 user_id 就不发请求。
  '用户未登录',
])

/**
 * 判断是否是认证相关的错误。
 *
 * **判真基本等于用户看不到任何解释**，三个消费点：
 * - `profileStore.settleError`（`loadProfile` / `updateProfile` / `uploadAvatar`
 *   三个 action 共用）与 `friendsStore.handleApiError`（七个 action 共用）
 *   走 `silentRedirectToLogin()`（`clearAuth()` + `location.replace('/login')`，
 *   不弹任何提示）；
 * - `chatStore.syncMessages` 判真后只是把 `console.error` 降级成 `console.warn`，
 *   两条分支都 `throw`——它是唯一一个判真不静默的消费点。
 * 所以宁可漏判（错误可见地抛给用户）也不能误判。
 * （本文件的 `safeApiCall` 是第四处调用，但它全仓库零调用点，
 * 不算在"三个"里；它判真后 `return null`，同样是静默形态。）
 *
 * 三档，从可靠到不可靠：
 * 1. `AuthenticationError` —— 本文件自己声明的类型，最可信。合并之后**暂无
 *    生产者**，见该类的注释。
 * 2. `ApiError` —— 带真实 HTTP 状态码。**有状态码就只看状态码，一个字都不猜**：
 *    - 401 判真（`isAuthApiError`，401-only 的理由见它的注释），
 *      但业务 401 端点除外（`src/lib/business401.ts` 的 `BUSINESS_401_ENDPOINTS`，
 *      经 `isBusiness401Endpoint`）——**这条排除今天没有活的生产者**：
 *      改密码的真实路径在 `authedFetch.ts` 的 401 分支上，那里查的是同一张表
 *      的另一个入口 `isBusiness401Request`；
 *    - **其余状态码一律判假并就地返回**，不再落到第 3 档。
 *      这一步是本次修复的要害：`PUT /api/profile` 的 400 校验错误
 *      正是在这里被挡下的，而不是靠"关键词表里恰好没有那个词"。
 *    - `403` 依旧判假（普通权限不足，详见 `isAuthApiError` 的注释）。
 * 3. 哨兵文案整串相等 —— 只兜前端自己抛的两条裸 `Error`，见
 *    `FRONTEND_AUTH_SENTINELS`。**不做子串匹配，不看后端文案。**
 *
 * 代价说清楚：还没带上状态码的裸 `Error`（例如 `storage.ts` 的 `uploadChunk`——
 * 分片直传走的是 XHR 而不是 `fetchWithAuth`，失败时抛的是
 * `new Error('分片上传失败: HTTP 403')` / `new Error('网络错误')`，没有 `status`）
 * 若真是会话失效，这里会漏判 → 错误照常上抛、用户看到一条可见的失败提示，
 * 而不是被静默送去登录页。这是刻意选的方向：可见的错误提示是可恢复的，
 * 无解释的登出不是。
 *
 * （这里原先举的例子是 profile 的 `uploadAvatar`。那个例子已经过期：它现在整条走
 * `storageApi.uploadAvatar` → `readEnvelope`，后端失败一律是带真实状态码的
 * `ApiError`，落在上面第 2 档而不是这一档。段落的方向没变，换的只是例子。）
 */
const isAuthError = (error: Error | string): boolean => {
  // AuthenticationError 直接返回 true
  if (error instanceof AuthenticationError) {
    return true
  }

  // 有状态码就不猜词：认下 401（业务 401 端点除外），其余一律不是认证错误。
  if (error instanceof ApiError) {
    return isAuthApiError(error) && !isBusiness401Endpoint(error.endpoint)
  }

  const message = typeof error === 'string' ? error : error.message
  return FRONTEND_AUTH_SENTINELS.has(message)
}

/**
 * 静默重定向到登录页面
 * 不抛出错误，不显示 Toast
 */
const silentRedirectToLogin = () => {
  const authStore = useAuthStore.getState()
  authStore.clearAuth()
  
  // 使用 replace 而不是 href，避免在历史记录中留下痕迹
  if (typeof window !== 'undefined' && window.location.pathname !== ROUTES.auth.login) {
    window.location.replace(ROUTES.auth.login)
  }
}

/**
 * 安全的 API 调用包装器
 * 自动处理认证错误，不会向用户显示认证相关的错误提示
 */
export const safeApiCall = async <T>(
  apiCall: () => Promise<T>,
  options?: {
    onAuthError?: () => void
    skipAuthRedirect?: boolean
  }
): Promise<T | null> => {
  try {
    return await apiCall()
  } catch (error) {
    if (error instanceof Error && isAuthError(error)) {
      // 认证错误，静默处理
      if (options?.onAuthError) {
        options.onAuthError()
      } else if (!options?.skipAuthRedirect) {
        silentRedirectToLogin()
      }
      return null
    }
    // 非认证错误，继续抛出
    throw error
  }
}

/**
 * `apiClient` 四个动词方法专用的 30 秒超时——**客户端侧**，且只在这四个方法上。
 *
 * BFF 不给代理请求设超时（`server/proxy/forward.ts` 的 `fetch` 没有 `signal`），
 * Caddy 也只管上游拨号超时，不管一条请求能拖多久。上游卡死时如果客户端不设
 * 上限，`lowcodeApi.*` / `diagnostic.ts`（本文件仅有的两个消费者）的 promise
 * 会永久 pending——两者都只读 `response.ok`、谁都不 catch，用户看到的是一个
 * 转不完的圈。曾经这四个方法显式传 `{ timeoutMs: 30000 }`，是全仓库唯一带
 * 超时的调用点；Task 11 把 `fetchWithAuth` 退化成同源裸 `fetch` 时连同
 * `AuthedFetchConfig` 一起删掉了，这里补回等价物。
 *
 * 只放在这四个方法上、不放回 `fetchWithAuth` 本身：`api/storage.ts` 的大文件
 * 传输也走 `fetchWithAuth`，默认若有超时，长传会开始以一句没有任何调用方
 * 解析的「请求超时」失败。
 */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * 建一个到点自动 `abort` 的 `AbortController`，并与调用方自带的 `options.signal`
 * **合成**而不是覆盖——`{ ...options, signal: controller.signal }` 会把调用方
 * 传进来的那个静默盖掉（合并前 `apiClient.fetchWithTimeout` 正是这个写法），
 * 于是这里改成调用方一取消，合成的 controller 跟着中止。
 *
 * `timedOut()` 供调用方在 `catch` 里分辨这次 abort 是不是我们自己的定时器开的
 * 枪：是 → 译成「请求超时，请检查网络连接」；不是（调用方自己取消）→ 原样上抛。
 * 不用 `AbortSignal.timeout`/`AbortSignal.any`：测试跑在 happy-dom 上，
 * 两者的支持程度不确定，手写等价物更可控。
 */
const withTimeout = (
  options: RequestInit,
  ms: number,
): { init: RequestInit; clear: () => void; timedOut: () => boolean } => {
  const controller = new AbortController()
  const callerSignal = options.signal
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, ms)

  const relayAbort = () => controller.abort(callerSignal?.reason)
  if (callerSignal) {
    if (callerSignal.aborted) relayAbort()
    else callerSignal.addEventListener('abort', relayAbort, { once: true })
  }

  return {
    init: { ...options, signal: controller.signal },
    clear: () => {
      clearTimeout(timer)
      callerSignal?.removeEventListener('abort', relayAbort)
    },
    timedOut: () => timedOut,
  }
}

/** 发一次带超时的请求；`finally` 保证定时器与监听器不会泄漏到下一次调用。 */
const sendWithTimeout = async (url: string, options: RequestInit): Promise<Response> => {
  const { init, clear, timedOut } = withTimeout(options, REQUEST_TIMEOUT_MS)
  try {
    return await fetchWithAuth(url, init)
  } catch (error) {
    if (timedOut() && error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接', { cause: error })
    }
    throw error
  } finally {
    clear()
  }
}

/**
 * 通用 API 客户端，自动处理认证。
 *
 * 消费者只有 `features/lowcode/api/lowcode.ts` 与 `api/diagnostic.ts`，
 * 两者都只读 `response.ok`、谁都不 catch。
 */
export const apiClient = {
  get: async (path: string, options?: RequestInit) => {
    return sendWithTimeout(`${BASE_URL}${path}`, { ...options, method: 'GET' })
  },

  post: async (path: string, data?: unknown, options?: RequestInit) => {
    return sendWithTimeout(`${BASE_URL}${path}`, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  put: async (path: string, data?: unknown, options?: RequestInit) => {
    return sendWithTimeout(`${BASE_URL}${path}`, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  delete: async (path: string, data?: unknown, options?: RequestInit) => {
    return sendWithTimeout(`${BASE_URL}${path}`, {
      ...options,
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    })
  },
}

export { isAuthError }
