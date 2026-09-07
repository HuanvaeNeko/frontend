import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { AuthenticationError, apiClient, isAuthError } from '../apiClient'

/**
 * `isAuthError` 的消费点全部是**静默**路径：
 * `friendsStore` / `profileStore` 走 `silentRedirectToLogin()`
 * （`clearAuth()` + `location.replace('/login')`，不弹任何提示），
 * `chatStore` 直接 `return []` 只留一句 `console.warn`。
 *
 * 所以这个函数判真 = 用户看不到任何解释。它必须只对**真正的认证失败**为真。
 */
describe('isAuthError —— 401 与 403 的分界', () => {
  it('403 不再被判成认证错误：普通权限不足不该触发无提示登出', () => {
    // 后端文档：文件访问 403 的 error 恒为「权限不足」（好友关系已解除 /
    // 不是会话参与者 / 不是该群活跃成员，故意同形）。
    // 这条文案不含 AUTH_ERROR_MESSAGES 里任何一个关键词，
    // 所以状态码档放行之后，关键词兜底档也放行 —— 错误会作为可见错误上抛。
    const denied = new ApiError('权限不足', {
      status: 403,
      code: 403,
      endpoint: 'POST /api/storage/file/{uuid}/presigned_url',
    })
    expect(isAuthError(denied)).toBe(false)
  })

  it('401 仍然被判成认证错误 —— 收窄不能误伤静默刷新/重定向路径', () => {
    // 解包层抛出的是后端原文，很可能一个关键词都不含；
    // 若这条挂了，说明状态码档被收得太狠，401 会退回到猜词，静默重定向失效。
    const expired = new ApiError('您的会话已结束，请重新开始', {
      status: 401,
      code: 401,
      endpoint: 'GET /api/auth/devices',
    })
    expect(isAuthError(expired)).toBe(true)
  })

  it('AuthenticationError 与关键词兜底档不受影响', () => {
    expect(isAuthError(new AuthenticationError('Token 刷新失败'))).toBe(true)
    expect(isAuthError('token 已过期')).toBe(true)
    expect(isAuthError(new Error('网络连接失败'))).toBe(false)
  })

  it('403 的其它常见文案同样不含认证关键词，不会被兜底档误捞', () => {
    for (const message of ['权限不足', '文件不存在', '群存在但你不是本群活跃成员']) {
      expect(isAuthError(new ApiError(message, { status: 403, endpoint: 'GET /x' }))).toBe(false)
    }
  })
})

/**
 * `apiClient` 对象合并前零测试覆盖，而 2026-09-07 恰恰改了它的语义：
 * 传输层从本文件私有的那份（认证失败 → `silentRedirectToLogin()` +
 * 抛 `AuthenticationError`）换成了全仓共用的 `authedFetch`（**永远返回
 * `Response`**）。它的两个调用方 `lowcode` / `diagnostic` 只读 `response.ok`，
 * 所以「刷新后仍 401」从一次无解释的跳转变成了一个带后端原文的可见错误。
 *
 * 这几条就是钉住这次变更的守卫。
 */
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

describe('apiClient —— 走共用 authedFetch', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().clearAuth()
    useAuthStore.setState({
      accessToken: 'AT1',
      refreshToken: 'RT1',
      isAuthenticated: true,
      tokenExpiry: Date.now() + 3600_000,
    })
    setApiShapeErrorReporter(() => {})
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('带上 Authorization 头与 30 秒超时的 signal', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true }))

    await apiClient.get('/api/lowcode/operators')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url.endsWith('/api/lowcode/operators')).toBe(true)
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer AT1')
    // signal 存在即证明超时预算挂上了；合并前那份 `fetchWithTimeout` 的等价物
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('post 序列化 body，无 data 时不带 body', async () => {
    fetchMock.mockResolvedValue(ok({ ok: true }))

    await apiClient.post('/api/lowcode/execute', { workflow_id: 'w1' })
    await apiClient.post('/api/lowcode/workflows/w1/validate')

    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe('{"workflow_id":"w1"}')
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBeUndefined()
  })

  it('刷新后仍 401 → 返回 401 而不是抛错、不跳登录页', async () => {
    // 这是本次行为变更的核心。合并前：silentRedirectToLogin() + 抛
    // AuthenticationError，调用方的 `if (!response.ok)` 根本走不到。
    // 合并后：401 原样返回，调用方抛出带后端原文的可见错误。
    const location = { href: '', pathname: '/app/lowcode' }
    Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true })
    fetchMock
      .mockResolvedValueOnce(ok({ error: '会话已结束' }, 401))
      .mockResolvedValueOnce(
        ok({ success: true, code: 200, data: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600 } })
      )
      .mockResolvedValueOnce(ok({ error: '会话已结束' }, 401))

    const response = await apiClient.get('/api/lowcode/operators')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '会话已结束' })
    expect(location.href).toBe('')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('403 原样返回，不刷新也不登出', async () => {
    fetchMock.mockResolvedValueOnce(ok({ error: '权限不足' }, 403))

    const response = await apiClient.get('/api/admin/diagnostic/statistics')

    expect(response.status).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe('AT1')
  })

  it('refresh token 真失效时仍会清登录态并跳登录页', async () => {
    // 掉线体验没有丢：只有刷新**抛错**这一条路径才登出。
    const location = { href: '', pathname: '/app/lowcode' }
    Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true })
    fetchMock
      .mockResolvedValueOnce(ok({ error: 'unauthorized' }, 401))
      // 缺 refresh_token → readEnvelope 抛错 → authStore clearAuth 后继续抛
      .mockResolvedValueOnce(ok({ success: true, code: 200, data: { access_token: 'AT2' } }))

    await expect(apiClient.get('/api/lowcode/operators')).rejects.toThrow()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(location.href).toBe(ROUTES.auth.login)
  })
})
