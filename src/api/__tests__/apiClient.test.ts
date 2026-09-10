import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { friendsApi } from '@/features/chat/api/friends'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, ApiShapeError } from '@/lib/apiEnvelope'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { apiClient, AuthenticationError, isAuthError } from '../apiClient'
// 业务 401 白名单的查询函数住在 `authedFetch.ts`（表本身住在
// `src/lib/business401.ts`）；`apiClient.ts` 只剩分类器与四个动词方法。
import { isBusiness401Request } from '../authedFetch'

/**
 * `isAuthError` 的消费点：`friendsStore.handleApiError`（七个 action 共用）与
 * `profileStore.settleError`（三个 action 共用）判真后走 `silentRedirectToLogin()`
 * （`clearAuth()` + `location.replace('/login')`，不弹任何提示）；
 * `chatStore.syncMessages` 判真只是把 `console.error` 降级成 `console.warn`。
 *
 * 所以这个函数判真基本等于用户看不到任何解释。它必须只对**真正的会话失效**为真。
 */
describe('isAuthError —— 有状态码就只看状态码', () => {
  it('400 校验失败不再被判成认证错误（这就是那条含 invalid 的文案）', () => {
    // `PUT /api/profile` 的错误响应，逐字抄自
    // backend-docs/profile/个人资料管理.md:213：
    //   "error": "Validation error: email: Invalid email format"
    // 旧实现是 `lowerMessage.includes('invalid')`，于是"邮箱格式不对"被判成
    // 会话失效：clearAuth + 跳登录页，而 updateProfile 当时还 return 不 throw，
    // 页面照弹绿色的「个人资料已更新」。
    const validation = new ApiError('Validation error: email: Invalid email format', {
      status: 400,
      code: 400,
      endpoint: 'PUT /api/profile',
    })
    expect(isAuthError(validation)).toBe(false)
  })

  it('同一条文案即使没带状态码（裸 Error）也不算认证错误', () => {
    // 关键词兜底档删除后剩下的是"整串相等的前端哨兵"，后端文案一律不参与匹配。
    // 把 'invalid' 加回关键词表 → 这条立刻红。
    expect(isAuthError(new Error('Validation error: email: Invalid email format'))).toBe(false)
  })

  it('401 仍然被判成认证错误 —— 收窄不能误伤静默刷新/重定向路径', () => {
    // 解包层抛出的是后端原文，很可能一个"认证味"的词都不含；
    // 若这条挂了，说明状态码档被收得太狠，401 不再触发静默重定向。
    const expired = new ApiError('您的会话已结束，请重新开始', {
      status: 401,
      code: 401,
      endpoint: 'GET /api/auth/devices',
    })
    expect(isAuthError(expired)).toBe(true)
  })

  it('403 不被判成认证错误：普通权限不足不该触发无提示登出', () => {
    // 后端文档：文件访问 403 的 error 恒为「权限不足」（好友关系已解除 /
    // 不是会话参与者 / 不是该群活跃成员，故意同形）。
    const denied = new ApiError('权限不足', {
      status: 403,
      code: 403,
      endpoint: 'POST /api/storage/file/{uuid}/presigned_url',
    })
    expect(isAuthError(denied)).toBe(false)
  })

  it('PUT /api/profile/password 的 401 是"旧密码错误"，不是会话失效', () => {
    // backend-docs/profile/个人资料管理.md:329-333：
    //   旧密码错误（401）：{ "error": "Old password is incorrect" }
    // 同页 :345 复述「旧密码验证失败返回 401 状态码」。
    // 从 BUSINESS_401_ENDPOINTS 里删掉这个端点 → 这条立刻红。
    //
    // ⚠️ 别把这条读成"用户因此不会被静默登出"：`isAuthError` 这一档今天**没有
    // 活的生产者**（两个 UI 直接调 `profileApi.changePassword` 并自己 catch）。
    // 真正拦住"打错密码 → 刷新 + 重发 + 登出"的是 `profile.ts` 的 401 分支，
    // 钉它的用例在 `features/profile/api/__tests__/profile.test.ts`。
    // 这条钉的是分类器的契约本身：将来谁把这个端点接进 store / safeApiCall，
    // 分类结果必须仍然是"不是会话失效"。
    const wrongPassword = new ApiError('Old password is incorrect', {
      status: 401,
      code: 401,
      endpoint: 'PUT /api/profile/password',
    })
    expect(isAuthError(wrongPassword)).toBe(false)
  })

  it('端点白名单是逐端点的，不是"凡 401 都放行"', () => {
    // 与上一条同状态码、同文案，只换端点：仍然必须判真。
    // 否则 BUSINESS_401_ENDPOINTS 一旦写成 `status === 401 → false` 就没人发现。
    const sameTextOtherEndpoint = new ApiError('Old password is incorrect', {
      status: 401,
      code: 401,
      endpoint: 'POST /api/auth/login',
    })
    expect(isAuthError(sameTextOtherEndpoint)).toBe(true)
  })

  it('形状漂移（ApiShapeError，HTTP 200）不是认证错误', () => {
    const shape = new ApiShapeError('GET /api/friends: data 应为数组', {
      status: 200,
      endpoint: 'GET /api/friends',
    })
    expect(isAuthError(shape)).toBe(false)
  })
})

/**
 * `isBusiness401Request` —— 各份 `fetchWithAuth` 在 401 分支上真正查的那个函数。
 * 它比 `isAuthError` 更早一步：那时手里只有 `url` 和 `options.method`。
 * 这里钉的是"怎么算命中"的契约；命中之后的行为（不刷新、不重发、不轮换 token）
 * 由 `features/profile/api/__tests__/profile.test.ts` 打真实 fetch 序列来钉。
 */
describe('isBusiness401Request', () => {
  const BASE = getApiBaseUrl()

  it('方法 + pathname 都对才命中；绝对地址、相对路径、带 query/hash 都认', () => {
    expect(isBusiness401Request('PUT', `${BASE}/api/profile/password`)).toBe(true)
    expect(isBusiness401Request('put', '/api/profile/password')).toBe(true)
    expect(isBusiness401Request('PUT', `${BASE}/api/profile/password?a=1#x`)).toBe(true)
  })

  it('方法不同不命中', () => {
    expect(isBusiness401Request('GET', `${BASE}/api/profile/password`)).toBe(false)
    // RequestInit.method 可省略，语义是 GET。
    expect(isBusiness401Request(undefined, `${BASE}/api/profile/password`)).toBe(false)
  })

  it('路径不同不命中 —— 否则整个 profile 模块会一起失去 401 刷新重试', () => {
    expect(isBusiness401Request('PUT', `${BASE}/api/profile`)).toBe(false)
    expect(isBusiness401Request('PUT', `${BASE}/api/profile/passwords`)).toBe(false)
    expect(isBusiness401Request('GET', `${BASE}/api/friends`)).toBe(false)
  })
})

describe('isAuthError —— 没有状态码时只认前端自己写的哨兵', () => {
  it('AuthenticationError 永远判真', () => {
    expect(isAuthError(new AuthenticationError('Token 刷新失败'))).toBe(true)
  })

  it('两条前端哨兵整串相等时判真', () => {
    // authStore.refreshAccessToken 抛的（refresh token 都没有了）
    expect(isAuthError(new Error('No refresh token available'))).toBe(true)
    // friends.ts 四处抛的（拿不到自己的 user_id，请求根本没发出去）
    expect(isAuthError(new Error('用户未登录'))).toBe(true)
  })

  it('不做子串匹配：含哨兵词但不是哨兵的后端文案一律判假', () => {
    // 这三条正是老关键词表（'过期' / 'token' / '登录' / '认证'）会误捞的形状。
    // 恢复任意一个关键词 + includes 匹配 → 对应那条立刻红。
    expect(isAuthError(new Error('该分享链接已过期'))).toBe(false)
    expect(isAuthError(new Error('bot token 无效或已被重置'))).toBe(false)
    expect(isAuthError(new Error('请在已登录的设备上确认本次操作'))).toBe(false)
    expect(isAuthError(new Error('用户未登录过本应用'))).toBe(false)
  })

  it('与会话无关的普通错误判假', () => {
    expect(isAuthError(new Error('网络连接失败'))).toBe(false)
    expect(isAuthError(new Error('请求超时，请检查网络连接'))).toBe(false)
  })
})

/**
 * 哨兵两端一致。
 *
 * 上面那组用例写的是字面量，只能钉住 `FRONTEND_AUTH_SENTINELS` 这一端：
 * **抛出点**（friends.ts）改文案时它们照样绿。下面这条改从抛出点真正取
 * 错误，两端任一改动都会红。
 *
 * ⚠️ 这个 describe 曾经还有一条「authStore.refreshAccessToken 没有 refresh
 * token 时抛的，就是表里那条」，钉的是 `FRONTEND_AUTH_SENTINELS` 里
 * `'No refresh token available'` 那一条。BFF 会话层落地后 `refreshAccessToken`
 * 整个被删掉——客户端手里已经没有 token，这句哨兵没有任何生产者了，钉它的用例
 * 随之删除。哨兵条目本身留在 `apiClient.ts`（不是这次改动范围），只是从今往后
 * 不会再被命中。
 */
describe('哨兵两端一致：抛出点的文案也被钉住', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.getState().clearAuth()
  })

  it('friendsApi 拿不到自己的 user_id 时抛的，就是表里那条', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: null, isAuthenticated: true })

    // 这条在发请求之前就抛，不需要 stub fetch。
    const error = await friendsApi.sendFriendRequest('u2').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(isAuthError(error as Error)).toBe(true)
  })
})

// ⚠️ 「fetchWithAuth —— 上一场会话的 401 不碰当前这一场」曾经钉在这里：
// 请求发起时快照的 action 闭包是活的，上一场会话的 401 落地时不能刷新/清盘
// 当前这个人。Task 11 把 `fetchWithAuth` 退化成同源裸 fetch 之后，客户端不再
// 刷新、不再持 token，这道闸随刷新重试逻辑一起删掉了——401 只做
// 「清本地态 + 跳登录」，跨会话最坏结果是多跳一次登录页（与
// `authedFetch.test.ts` 顶部对 `sessionScopedFetchWithAuth.test.ts` 的说明
// 是同一件事）。

/**
 * `apiClient` 四个动词方法的 30 秒超时（I-3：随 `AuthedFetchConfig` 一起被
 * 静默删掉，两侧都无替代，见 `apiClient.ts` 顶部 `withTimeout` 的注释）。
 *
 * 只打 `apiClient.get`：四个方法共用同一个 `sendWithTimeout`，钉住共享逻辑
 * 一次就够，不必对 post/put/delete 逐一重复同一件事。
 */
describe('apiClient 的 30 秒超时', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('上游卡死：30 秒后拒绝，译成「请求超时，请检查网络连接」', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const abort = new Error('aborted')
            abort.name = 'AbortError'
            reject(abort)
          })
        }),
    )

    const pending = expect(apiClient.get('/api/probe')).rejects.toThrow('请求超时，请检查网络连接')

    await vi.advanceTimersByTimeAsync(30_000)
    await pending
  })

  it('正对照：没到 30 秒就回来，照常返回响应，且定时器被清掉', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const response = await apiClient.get('/api/probe')

    expect(response.status).toBe(200)
    // 上一条证明"到点会拒绝"；这一条证明"没到点不会误伤"，且 `clear()` 真的
    // 清掉了定时器——如果没清，这里就不会是 0。
    expect(vi.getTimerCount()).toBe(0)
  })

  it('调用方自己 abort：拿到的是调用方的取消，不是超时文案', async () => {
    const caller = new AbortController()
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const abort = new Error('caller aborted')
            abort.name = 'AbortError'
            reject(abort)
          })
        }),
    )

    const pending = apiClient.get('/api/probe', { signal: caller.signal })
    caller.abort()

    // 超时定时器还没到点（只过去了 0 秒），这次 abort 只可能是调用方自己发的。
    await expect(pending).rejects.toThrow('caller aborted')
  })
})
