import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { friendsApi } from '@/features/chat/api/friends'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, ApiShapeError } from '@/lib/apiEnvelope'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { useApiConfigStore } from '@/store/apiConfig'
import {
  AuthenticationError,
  fetchWithAuth,
  isAuthError,
  isBusiness401Request,
} from '../apiClient'

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
 * **抛出点**（authStore / friends.ts）改文案时它们照样绿。
 * 下面两条改从抛出点真正取错误，两端任一改动都会红。
 */
describe('哨兵两端一致：抛出点的文案也被钉住', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.getState().clearAuth()
  })

  it('authStore.refreshAccessToken 没有 refresh token 时抛的，就是表里那条', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      isAuthenticated: false,
    })

    const error = await useAuthStore
      .getState()
      .refreshAccessToken()
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(isAuthError(error as Error)).toBe(true)
  })

  it('friendsApi 拿不到自己的 user_id 时抛的，就是表里那条', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({
      accessToken: 'AT',
      refreshToken: 'RT',
      user: null,
      isAuthenticated: true,
      tokenExpiry: Date.now() + 3600_000,
    })

    // 这条在发请求之前就抛，不需要 stub fetch。
    const error = await friendsApi.sendFriendRequest('u2').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(isAuthError(error as Error)).toBe(true)
  })
})

/**
 * 请求发起时这份 `fetchWithAuth` 快照了 `useAuthStore.getState()`，但快照里攥着的
 * action 闭包是**活的**：`tryRefreshToken()` / `silentRedirectToLogin()` 打到的都是
 * **当前**那个人的 store。于是 A 登出前发出的请求若在 B 登录之后才收到 401，
 * 它会拿 B 的 token 去刷新，刷不动就调 B 的 `clearAuth()`——反向名单清盘，
 * 把刚登录的 B 连同他自备的 `aiApiKey` 一起清掉。
 *
 * 三道防线一条都拦不住这一条：世代号只挡 `set()` 不挡副作用，写入闸门在 B 的会话里
 * 是开着的，而清盘正是施害者本身。挡它的是 401 分支上的 `pinSession()`。
 */
describe('fetchWithAuth —— 上一场会话的 401 不碰当前这一场', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const loginEnvelope = (who: string) => ({
    success: true,
    code: 200,
    data: { access_token: `AT-${who}`, refresh_token: `RT-${who}`, expires_in: 3600 },
  })
  const loginAs = async (who: string, fetchMock: ReturnType<typeof vi.fn>) => {
    fetchMock.mockResolvedValueOnce(json(loginEnvelope(who)))
    await useAuthStore.getState().login({ user_id: who, password: 'p' })
  }

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('换人之后才落地的 401：原样返回，不刷新、不跳转、不清 B 的盘', async () => {
    await loginAs('alice', fetchMock)

    let release!: (response: Response) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    const aliceRequest = fetchWithAuth(`${getApiBaseUrl()}/api/friends`)

    useAuthStore.getState().clearAuth()
    await loginAs('bob', fetchMock)
    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-bob', useCustomApi: true })
    // 正对照：B 的会话是活的，密钥也确实落了盘。
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')

    release(json({ success: false, code: 401, error: 'Token 无效或已过期' }, 401))
    const response = await aliceRequest

    // 401 原样交回调用方（不是 AuthenticationError，也不是重试后的 200）
    expect(response.status).toBe(401)
    // 三次 fetch = alice 登录 + 这个请求 + bob 登录。没有第四次（刷新）。
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-bob')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')
  })

  it('正对照：同一场会话里的 401 照旧刷新并重发一次', async () => {
    // 没有这一条，把 401 分支实现成"永远原样返回"也会绿——而那等于删掉整条
    // 自动续期路径：每个 token 过期的请求都会把原始 401 抛给用户。
    await loginAs('alice', fetchMock)

    fetchMock
      .mockResolvedValueOnce(json({ success: false, code: 401, error: 'Token 无效或已过期' }, 401))
      .mockResolvedValueOnce(
        json({
          success: true,
          code: 200,
          data: { access_token: 'AT-alice-2', refresh_token: 'RT-alice-2', expires_in: 3600 },
        }),
      )
      .mockResolvedValueOnce(json({ success: true, code: 200, data: { friends: [] } }))

    const response = await fetchWithAuth(`${getApiBaseUrl()}/api/friends`)

    expect(response.status).toBe(200)
    // 四次 = 登录 + 401 + 刷新 + 重发
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(useAuthStore.getState().accessToken).toBe('AT-alice-2')
  })
})
