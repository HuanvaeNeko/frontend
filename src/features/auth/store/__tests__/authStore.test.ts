import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { getApiBaseUrl, getAuthApiUrl } from '@/lib/apiConfig'
import { useAuthStore } from '../authStore'

/**
 * 这批用例针对的是一种**静默**故障：信封化之后 `data.access_token` 恒为
 * undefined，但 `isAuthenticated: true` 是硬编码的、控制台照样打印"登录成功"、
 * `tokenExpiry` 变成 NaN 而 NaN 是 falsy 所以 `checkTokenExpiry()` 永不触发自愈。
 * 也就是说「坏」和「好」从外部看长得一模一样。
 *
 * 因此每一条断言都必须落在**具体的值**上。"没抛错""能编译""控制台没红"
 * 恰恰是这个 bug 当年的表现，不能当成证明。
 */

// getAuthApiUrl() 而不是字面量：Vitest 会加载 .env，宿主由本机反代决定，
// 断言必须跟着同一个基址走，不能钉死某个域名（否则一换 .env 就假红）。
const AUTH_BASE = getAuthApiUrl()

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ENVELOPE = {
  success: true,
  code: 200,
  data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  // zustand persist 会往 localStorage 写 auth-storage；不清会污染下一条用例。
  // 同时 getApiBaseUrl() 也读 localStorage（huanvae.api-base-url），清空后走
  // import.meta.env.VITE_API_URL（Vitest 加载的 .env）或默认的 https://api.huanvae.cn。
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  setApiShapeErrorReporter(() => {})
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('authStore.login —— 信封解包', () => {
  it('把 data 里的 token 真正存进 store（信封根部读不到，这条就是那个 bug）', async () => {
    fetchMock.mockResolvedValueOnce(ok(ENVELOPE))

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('AT')
    expect(state.refreshToken).toBe('RT')
    expect(state.isAuthenticated).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(`${AUTH_BASE}/login`, expect.anything())
  })

  it('tokenExpiry 是有限数字，不是 NaN', async () => {
    // 直接拦截"永不自愈"那一环：`Date.now() + undefined * 1000` = NaN，
    // 而 checkTokenExpiry 的 `if (!tokenExpiry) return false` 把 NaN 当成"没设过期时间"，
    // 于是主动续期永远不会触发。只断言 accessToken 是抓不到这一条的。
    const before = Date.now()
    fetchMock.mockResolvedValueOnce(ok(ENVELOPE))

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    const { tokenExpiry } = useAuthStore.getState()
    expect(Number.isFinite(tokenExpiry)).toBe(true)
    expect(tokenExpiry).toBeGreaterThanOrEqual(before + 3600_000 - 2000)
    expect(tokenExpiry).toBeLessThanOrEqual(Date.now() + 3600_000)
  })

  it('data 为空对象时拒绝登录，绝不留下"已登录但没有 token"的半登录态', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: {} }))

    await expect(useAuthStore.getState().login({ user_id: 'u1', password: 'p' })).rejects.toThrow(
      /access_token/,
    )

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.accessToken).toBeNull()
  })

  it('expires_in 为 null 时抛错，而不是把 NaN 写进 tokenExpiry', async () => {
    // 解包层的 require 判定是 `payload[key] === undefined`，null 算"存在"——
    // 所以这里用的是 parse 而不是 require。这条用例就是那个选择的护栏。
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { access_token: 'AT', refresh_token: 'RT', expires_in: null } }),
    )

    await expect(useAuthStore.getState().login({ user_id: 'u1', password: 'p' })).rejects.toThrow(
      /expires_in/,
    )
    expect(useAuthStore.getState().tokenExpiry).toBeNull()
  })

  it('后端仍返回裸响应时靠 legacyBare 兜住，并且必须吵一声', async () => {
    // 两份后端文档对 login/refresh 的口径冲突（auth 文档:37 是信封，
    // README:217 是裸读），legacyBare 就是为这个不确定性准备的。
    // 它和 `?? body` 的关键差别在于：命中裸响应会 console.warn，欠账可被 grep 出来。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(ok({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().accessToken).toBe('AT')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('legacyBare'))
  })

  it('登录失败时把后端的真实文案透出来，而不是一句通用提示', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, message: '用户名或密码错误' }, 401))

    await expect(useAuthStore.getState().login({ user_id: 'u1', password: 'bad' })).rejects.toThrow(
      '用户名或密码错误',
    )
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('user_nickname（profile 命名）能正确归一成 nickname', async () => {
    // 后端 profile 模块的字段一律带 user_ 前缀（user_nickname/user_email/...），
    // 而登录响应历史上读的是无前缀名；这条断言的是 optionalString 对
    // user_nickname 这个新映射真的生效，不是只测到了旧的无前缀名分支。
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user_nickname: '小明' },
      }),
    )

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().user?.nickname).toBe('小明')
  })

  it('avatar_url 是相对路径时补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user_avatar_url: 'avatars/x.jpg' },
      }),
    )

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().user?.avatar_url).toBe(`${getApiBaseUrl()}/avatars/x.jpg`)
  })

  it('avatar_url 已经是绝对地址时原样保留，不会被二次拼接破坏', async () => {
    // backend-docs/profile/个人资料管理.md:74 的真实示例就是这种形状
    // （指向 MinIO 的完整 URL，不是 api.huanvae.cn 下的路径）。
    const absolute = 'http://localhost:9000/avatars/testuser001.jpg'
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user_avatar_url: absolute },
      }),
    )

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().user?.avatar_url).toBe(absolute)
  })
})

describe('authStore.refreshAccessToken —— 与 login 逐字同构的第二处静默故障', () => {
  it('把 data 里的新 token 存进 store', async () => {
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 7200 } }),
    )

    await useAuthStore.getState().refreshAccessToken()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('AT2')
    expect(state.refreshToken).toBe('RT2')
    expect(Number.isFinite(state.tokenExpiry)).toBe(true)
    expect(state.tokenExpiry).toBeGreaterThan(Date.now() + 7000_000)
  })

  it('响应形状不对时清空登录态并抛错，而不是静默写入 undefined', async () => {
    // 旧行为：resolve、accessToken=undefined、refreshToken=undefined 落盘持久化，
    // 此后 401 重试分支（`&& authStore.refreshToken`）永远进不去，故障不可逆。
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { access_token: 'AT2' } }))

    await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow(/refresh_token/)

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })
})
