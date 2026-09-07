import { afterEach, describe, expect, it, vi } from 'vitest'
import { friendsApi } from '@/features/chat/api/friends'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, ApiShapeError } from '@/lib/apiEnvelope'
import { AuthenticationError, isAuthError } from '../apiClient'

/**
 * `isAuthError` 的六个消费点全部是**静默**路径：
 * `friendsStore` / `profileStore` 走 `silentRedirectToLogin()`
 * （`clearAuth()` + `location.replace('/login')`，不弹任何提示），
 * `chatStore` 只留一句 `console.warn`。
 *
 * 所以这个函数判真 = 用户看不到任何解释。它必须只对**真正的会话失效**为真。
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
    // 若只按状态码判，用户打错一次当前密码就会被 clearAuth 静默登出。
    // 从 BUSINESS_401_ENDPOINTS 里删掉这个端点 → 这条立刻红。
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
