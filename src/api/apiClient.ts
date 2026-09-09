import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '../lib/apiConfig'
import { ApiError, isAuthApiError } from '@/lib/apiEnvelope'
import { isBusiness401Endpoint } from '@/lib/business401'
import { ROUTES } from '@/lib/routes'
import { fetchWithAuth } from './authedFetch'

const BASE_URL = getApiBaseUrl()

/**
 * 本文件四个动词方法的超时上限（毫秒）。
 *
 * 合并之后**只有这四个方法**带超时：`fetchWithAuth` 的默认是"不超时"，
 * 因为合并进来的九份副本调的是裸 `fetch`（其中 `api/storage.ts` 要传大文件）。
 * 把 30 秒留在这里，`lowcode.ts` / `diagnostic.ts` 的行为与合并前逐字一致。
 * 理由与取舍见 `authedFetch.ts` 的 `AuthedFetchConfig.timeoutMs`。
 */
const REQUEST_TIMEOUT = 30000

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
 *      但业务 401 端点除外（`authedFetch.ts` 的 `BUSINESS_401_ENDPOINTS`，
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
 * 通用 API 客户端，自动处理认证和超时。
 *
 * 消费者只有 `features/lowcode/api/lowcode.ts` 与 `api/diagnostic.ts`，
 * 两者都只读 `response.ok`、谁都不 catch。超时在这一层显式传入
 * （`TIMED`），是全仓库唯一带超时的调用点。
 */
const TIMED = { timeoutMs: REQUEST_TIMEOUT } as const

export const apiClient = {
  get: async (path: string, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, { ...options, method: 'GET' }, TIMED)
  },

  post: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(
      `${BASE_URL}${path}`,
      {
        ...options,
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
      },
      TIMED,
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
      TIMED,
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
      TIMED,
    )
  },
}

export { isAuthError }
