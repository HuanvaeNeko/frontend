import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { isAuthError } from '@/api/apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { ApiError } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { profileApi } from '../profile'

/**
 * profile 模块的线级用例（本模块此前一条测试都没有）。
 *
 * 本批只解决一件事：**失败要带上真实 HTTP 状态码**。原因是
 * `apiClient.isAuthError` 曾靠关键词子串匹配 message 决定要不要静默跳登录页，
 * 而 `PUT /api/profile` 的校验失败文案逐字是
 * `"Validation error: email: Invalid email format"`
 * （backend-docs/profile/个人资料管理.md:213）——含 `invalid`。
 *
 * 所以每条用例都要**同时**断言两件事：
 * 1. 抛出来的是带 `status` / `endpoint` 的 `ApiError`；
 * 2. `isAuthError(error)` 的取值。
 * 只断言 `rejects.toThrow(...)` 的话，把 status 写错（比如恒填 500）
 * 也照样通过——而分类器读的正是这个字段。
 *
 * 响应体的读法（`data.data || data` 等）本批一个字没动，属于后续批次。
 */

// getApiBaseUrl() 而不是字面量：Vitest 会加载 .env，宿主由本机反代决定。
const PROFILE_BASE = `${getApiBaseUrl()}/api/profile`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const PROFILE_DTO = {
  user_id: 'u1',
  user_nickname: '测试用户',
  user_email: 'a@example.com',
  user_signature: null,
  user_avatar_url: null,
  admin: 'false',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({
    accessToken: 'AT',
    isAuthenticated: true,
    // refreshToken **默认非空**，等同真实登录态。
    //
    // 这里原先默认置空，理由是"401 会先打一次 /api/auth/refresh 再重试，把
    // mockResolvedValueOnce 的顺序整体错开"。代价是被置空的那七条用例里，**三条
    // 打的正是 401**，而 401 刷新重试分支对它们结构上根本不存在——**打错当前密码时
    // 真正执行的就是那条分支**，这正是上一版测试没看见那个 bug 的原因。
    // 默认值不该复制出让 bug 隐身的形状。
    //
    // 于是反过来：默认给非空，只有少数几条「响应序列写死、多一次 refresh 就错位」
    // 的用例在自己的 it 里就地置空，并各自写明为什么。这样新加的用例默认落在
    // 有刷新分支的世界里，忘记设置也不会静默跳过防线。
    refreshToken: 'RT',
    // 远期过期时间：否则进门就会先触发一次预刷新。
    tokenExpiry: Date.now() + 3600_000,
  })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('profileApi.updateProfile', () => {
  it('成功时把请求打到 PUT /api/profile', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))

    const result = await profileApi.updateProfile({ email: 'new@example.com' })

    expect(result.message).toBe('Profile updated successfully')
    expect(fetchMock.mock.calls[0][0]).toBe(PROFILE_BASE)
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
  })

  it('400 校验失败：抛 ApiError(400)，且**不**被判成认证错误', async () => {
    // 文档 :213 的错误响应，逐字。
    fetchMock.mockResolvedValueOnce(json({ error: 'Validation error: email: Invalid email format' }, 400))

    const error = await profileApi.updateProfile({ email: 'not-an-email' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).endpoint).toBe('PUT /api/profile')
    expect((error as ApiError).message).toBe('Validation error: email: Invalid email format')
    // 这一行才是这条 bug 的正身：文案含 invalid，但它不是认证错误。
    expect(isAuthError(error as Error)).toBe(false)
  })

  it('401 会话失效：抛 ApiError(401)，且**是**认证错误', async () => {
    // 本条只钉「401 响应 → 带状态码的 ApiError → 分类为认证错误」这一段。
    // PUT /api/profile 不在业务 401 白名单里，非空 refreshToken 会让它先去打一次
    // refresh 再重发，mockResolvedValueOnce 的单条排期会整体错位；刷新流程本身由
    // describe「profileApi 的 401 刷新重试分支（refreshToken 非空）」的两条用例覆盖。
    useAuthStore.setState({ refreshToken: null })
    fetchMock.mockResolvedValueOnce(json({ error: '未认证或 Token 无效' }, 401))

    const error = await profileApi.updateProfile({ email: 'a@example.com' }).catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(401)
    expect(isAuthError(error as Error)).toBe(true)
  })
})

describe('profileApi.changePassword', () => {
  it('旧密码错误的 401 抛 ApiError，端点字段可被白名单识别，不判成认证错误', async () => {
    // 文档 :329-333：旧密码错误（401）：{ "error": "Old password is incorrect" }
    //
    // 本条走的是默认的 `refreshToken: 'RT'`：正因为白名单挡住了刷新重试，只排一条
    // 响应就够。去掉 profile.ts 401 分支上的 `!isBusiness401Request(...)` 之后，
    // 第二次 fetch 拿到 undefined、刷新抛错，本条会连带变红——这不是巧合，是这次
    // 把默认值改成非空之后，普通用例也能感知那道防线的直接结果。
    fetchMock.mockResolvedValueOnce(json({ error: 'Old password is incorrect' }, 401))

    const error = await profileApi
      .changePassword({ old_password: 'wrong1', new_password: 'newpass456' })
      .catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(401)
    // 端点字符串必须与 apiClient.ts 的 BUSINESS_401_ENDPOINTS 逐字一致；
    // 写错一个字符，下面那行 isAuthError 就会变成 true。
    expect((error as ApiError).endpoint).toBe('PUT /api/profile/password')
    expect((error as ApiError).message).toBe('Old password is incorrect')
    expect(isAuthError(error as Error)).toBe(false)
  })

  it('400 新密码不合规同样是可见错误', async () => {
    // 文档 :339 的验证错误响应，逐字。
    fetchMock.mockResolvedValueOnce(
      json({ error: 'Validation error: new_password: Password must be 6-100 characters' }, 400),
    )

    const error = await profileApi
      .changePassword({ old_password: 'oldpass123', new_password: 'abc' })
      .catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(400)
    expect(isAuthError(error as Error)).toBe(false)
  })
})

/**
 * **打错当前密码时真正执行的那条路径。**
 *
 * `profile.ts` 的 `fetchWithAuth` 见到 401 且 `authStore.refreshToken` 非空时，会
 * 「刷新 token → 把同一个密码请求原样重发一遍」，刷新失败则 `clearAuth()` +
 * `location.href = /app/login`。
 *
 * 这个 describe 把该分支的**两种结局**分开钉：刷新成功（轮换 + 重发）与刷新失败
 * （登出 + 跳登录页）。原因是"不登出"这句话只有在刷新失败的那一支上才有内容——
 * 刷新成功时本来就没有任何登出代码会执行，在那一支上断言"没登出"是恒真的。
 *
 * `apiClient.isAuthError` 里的 `BUSINESS_401_ENDPOINTS` 那一档**到不了这里**：
 * 它只在拿到 `ApiError` 之后做分类，而两个 UI 直接 `await profileApi.changePassword`
 * 并自己 catch，谁也不调 `isAuthError`。所以护栏必须落在这一层，用例也必须打在这一层。
 */
describe('profileApi 的 401 刷新重试分支（refreshToken 非空）', () => {
  const REFRESH_URL = `${getApiBaseUrl()}/api/auth/refresh`
  const ROTATED = { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600 }

  /** `profile.ts:73` 的 `window.location.href = ROUTES.auth.login`，全仓库仅此一条用例盯着。 */
  let hrefSpy: Mock<(value: string) => void>

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'AT',
      refreshToken: 'RT',
      isAuthenticated: true,
      tokenExpiry: Date.now() + 3600_000,
    })
    hrefSpy = vi.fn()
    // 不 mock 的话 happy-dom 会真的把 location 换掉，后续用例读到的 href 就变了。
    vi.spyOn(window.location, 'href', 'set').mockImplementation(hrefSpy)
  })

  it('旧密码错误的 401：不刷新、不重发、不轮换 token', async () => {
    // 刷新端点故意 mock 成**会成功**：这样"多打了一次 refresh"不会伪装成网络错误，
    // 而是如实表现为「3 次请求 + token 轮换成 RT2」。
    // 注意这一支**测不了"不登出"**：登出只在刷新失败的 catch 里，刷新成功时那段代码
    // 根本不存在于路径上。「也不登出」由下一条（刷新失败）负责。
    fetchMock.mockImplementation(async (input: string) =>
      input === REFRESH_URL
        ? json({ success: true, code: 200, data: ROTATED })
        : json({ error: 'Old password is incorrect' }, 401),
    )

    const error = await profileApi
      .changePassword({ old_password: 'wrong1', new_password: 'newpass456' })
      .catch((e: unknown) => e)

    // 去掉 profile.ts 401 分支上的 `!isBusiness401Request(...)`，或从 apiClient 的
    // BUSINESS_401_ENDPOINTS 删掉这个端点 → 下面三行一起变红：
    // 请求序列变成 [密码, refresh, 密码]（错误密码被重放一次），token 轮换成 AT2 / RT2。
    expect(fetchMock.mock.calls.map((call: unknown[]) => call[0])).toEqual([`${PROFILE_BASE}/password`])
    expect(useAuthStore.getState().refreshToken).toBe('RT')
    expect(useAuthStore.getState().accessToken).toBe('AT')

    // 业务失败照常以**可见错误**的形态抛给 UI（两个组件都在 catch 里弹 destructive toast）
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect((error as ApiError).message).toBe('Old password is incorrect')
  })

  it('旧密码错误的 401：即使刷新会失败，也不清 token、不跳登录页', async () => {
    // 「也不登出」的正身。刷新端点 mock 成**会失败**（401），于是白名单一旦失效：
    // 401 → 进刷新分支 → `refreshAccessToken()` 内部 catch 先 `clearAuth()` 再 rethrow
    // → `profile.ts:70-73` 再 `clearAuth()` + `location.href = /app/login`。
    // 用户只是打错了一次当前密码，却被无解释地送去登录页——这正是要挡的形态。
    fetchMock.mockImplementation(async (input: string) =>
      input === REFRESH_URL
        ? json({ error: 'Token 刷新失败' }, 401)
        : json({ error: 'Old password is incorrect' }, 401),
    )

    const error = await profileApi
      .changePassword({ old_password: 'wrong1', new_password: 'newpass456' })
      .catch((e: unknown) => e)

    // 去掉 profile.ts 401 分支上的 `!isBusiness401Request(...)` → 下面四行一起变红。
    expect(fetchMock.mock.calls.map((call: unknown[]) => call[0])).toEqual([`${PROFILE_BASE}/password`])
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().accessToken).toBe('AT')
    expect(hrefSpy).not.toHaveBeenCalled()

    // 抛给 UI 的仍然是那条业务错误，而不是刷新失败的错误（后者会被当成会话问题）。
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect((error as ApiError).message).toBe('Old password is incorrect')
  })

  it('对照：普通端点（PUT /api/profile）的 401 照旧刷新并重试一次', async () => {
    // 没有这条，把 401 分支整个关掉也能让上一条变绿。
    let profileCalls = 0
    fetchMock.mockImplementation(async (input: string) => {
      if (input === REFRESH_URL) return json({ success: true, code: 200, data: ROTATED })
      profileCalls += 1
      return profileCalls === 1
        ? json({ error: '未认证或 Token 无效' }, 401)
        : json({ message: 'Profile updated successfully' })
    })

    const result = await profileApi.updateProfile({ email: 'new@example.com' })

    expect(result.message).toBe('Profile updated successfully')
    expect(fetchMock.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      PROFILE_BASE,
      REFRESH_URL,
      PROFILE_BASE,
    ])
    expect(useAuthStore.getState().refreshToken).toBe('RT2')
  })

  it('对照：普通端点刷新失败时**确实**会 clearAuth + 跳登录页', async () => {
    // 上一条的 `expect(hrefSpy).not.toHaveBeenCalled()` 需要一个正对照，否则
    // 「spy 根本没接上任何东西」也能让它绿。这条同时是 `profile.ts:70-73` 那段
    // clearAuth + 跳转在全仓库唯一的断言——它是用户可见行为，此前一处没被覆盖。
    fetchMock.mockImplementation(async (input: string) =>
      input === REFRESH_URL
        ? json({ error: 'Token 刷新失败' }, 401)
        : json({ error: '未认证或 Token 无效' }, 401),
    )

    await expect(profileApi.updateProfile({ email: 'new@example.com' })).rejects.toThrow()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(hrefSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })
})

describe('profileApi.getProfile', () => {
  it('从信封里取出资料', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    const profile = await profileApi.getProfile()

    expect(profile.user_id).toBe('u1')
    expect(profile.user_nickname).toBe('测试用户')
  })

  it('401 抛 ApiError(401) 并被判成认证错误', async () => {
    // 同上一条 401 用例：GET /api/profile 不在白名单里，非空 refreshToken 会插进一次
    // refresh + 重发，打乱这里写死的单条响应排期。刷新流程有自己的 describe 覆盖。
    useAuthStore.setState({ refreshToken: null })
    fetchMock.mockResolvedValueOnce(json({ error: '未认证或 Token 无效' }, 401))

    const error = await profileApi.getProfile().catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(401)
    expect((error as ApiError).endpoint).toBe('GET /api/profile')
    expect(isAuthError(error as Error)).toBe(true)
  })
})
