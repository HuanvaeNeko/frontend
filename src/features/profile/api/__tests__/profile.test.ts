import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { isAuthError } from '@/api/apiClient'
import { isUploadSessionExpired, storageApi } from '@/api/storage'
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

  it('user_avatar_url 的相对路径出来是绝对地址（doc:74、:98）', async () => {
    // 后端给的是**相对路径**（doc:98「头像相对路径（需拼接 `STORAGE_BASE_URL`）」，
    // :74 的样例逐字是 `"avatars/testuser001.jpg?t=1706000000"`）。整个 profile 模块
    // 此前没有任何一处补基址，三个渲染点（ProfilePage / ProfileModal / Navigation）
    // 拿到的就是这串相对路径，浏览器按当前页面路径解析后 404。
    //
    // 断言必须是完整 URL 逐字相等：只断言"非空"的话，相对路径本身也非空。
    fetchMock.mockResolvedValueOnce(
      json({
        success: true,
        code: 200,
        data: { ...PROFILE_DTO, user_avatar_url: 'avatars/testuser001.jpg?t=1706000000' },
      }),
    )

    const profile = await profileApi.getProfile()

    expect(profile.user_avatar_url).toBe(
      `${getApiBaseUrl()}/avatars/testuser001.jpg?t=1706000000`,
    )
  })

  it('user_avatar_url 为 null 时保持 null，不被兜底成空串或基址本身', async () => {
    // `toAbsoluteApiUrl(null)` 返回 undefined；写成 `?? ''` 会得到空串，
    // 写漏 `?? null` 会得到 undefined —— 两者都会让"没有头像"变成另一种东西。
    fetchMock.mockResolvedValueOnce(
      json({ success: true, code: 200, data: { ...PROFILE_DTO, user_avatar_url: null } }),
    )

    const profile = await profileApi.getProfile()

    expect(profile.user_avatar_url).toBeNull()
  })

  it('其余字段原样透传（补基址不是一次重建 DTO）', async () => {
    // 正对照：上面两条只看一个字段，若实现变成"只返回头像字段"也能绿。
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    const profile = await profileApi.getProfile()

    expect(profile).toEqual(PROFILE_DTO)
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

/**
 * 头像上传：`POST /api/profile/avatar`（multipart）→ storage 的四步预签名链路。
 *
 * 旧端点已于 2026-08-28 **删除、无兼容层**（`个人资料管理.md:352-355`），所以
 * 迁移前每一次头像上传都是 404 —— 本模块此前一条头像用例都没有，这就是原因。
 *
 * 每条用例都断言**具体的请求序列或具体的字段值**：只断言"没抛错"的话，
 * 一个仍在打旧端点、被 mock 顺手喂了 200 的实现照样绿。
 */
describe('profileApi.uploadAvatar（四步预签名链路）', () => {
  const STORAGE_BASE = `${getApiBaseUrl()}/api/storage`
  const pngFile = () => new File(['x'], 'me.png', { type: 'image/png' })

  const envelope = (data: unknown, status = 200) =>
    json({ success: true, code: 200, data }, status)

  /** 第 1 步的响应（头像档一律不走秒传，doc:426-427）。 */
  const AVATAR_SESSION = {
    mode: 'multipart',
    preview_support: 'inline_preview',
    multipart_upload_id: 'upload-id-avatar',
    expires_in: 3600,
    chunk_size: 31457280,
    total_chunks: 1,
    // object key 是确定性的 `{user_id}.{ext}`（doc:420）
    file_key: 'alice.png',
    max_file_size: 10485760,
    instant_upload: false,
    existing_file_url: null,
  }

  const PART_URL_DATA = {
    part_url: 'https://api.huanvae.cn/avatars/alice.png?uploadId=x&partNumber=1&X-Amz-Signature=s',
    part_number: 1,
    expires_in: 3600,
  }

  /** 第 4 步的响应（doc:398-405，逐字：相对路径 + `?t=` 秒级缓存戳）。 */
  const CONFIRM_DATA = {
    file_url: 'avatars/alice.png?t=1706000000',
    file_key: 'alice.png',
    file_size: 40960,
    content_type: 'image/png',
    preview_support: 'inline_preview',
  }

  /** 三步都成功的响应序列。第 3 步是直传对象存储，走 XHR，不经这里。 */
  const mockHappyPath = () => {
    fetchMock
      .mockResolvedValueOnce(envelope(AVATAR_SESSION))
      .mockResolvedValueOnce(envelope(PART_URL_DATA))
      .mockResolvedValueOnce(envelope(CONFIRM_DATA))
  }

  /** `${method} ${url}` 的调用序列——顺序、方法、URL 一次钉死。 */
  const requestLog = () =>
    fetchMock.mock.calls.map(
      (call: unknown[]) => `${(call[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(call[0])}`,
    )

  let uploadChunk: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // calculateFileHash 走 crypto.subtle，与本批无关，固定掉以免依赖运行环境。
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
    // 第 3 步是 XMLHttpRequest 直传预签名 URL，不走 fetch。
    uploadChunk = vi.spyOn(storageApi, 'uploadChunk').mockResolvedValue(undefined)
  })

  it('四步按序发出，且没有一个请求打到已删除的 POST /api/profile/avatar', async () => {
    mockHappyPath()

    await profileApi.uploadAvatar(pngFile())

    // 这一条 toEqual 是本 describe 的主锚：顺序、方法、URL、query 全在里面。
    // 把实现改回 multipart POST → 序列变成 [`POST ${PROFILE_BASE}/avatar`]，立刻红。
    expect(requestLog()).toEqual([
      `POST ${STORAGE_BASE}/upload/request`,
      `GET ${STORAGE_BASE}/multipart/part_url?file_key=alice.png&upload_id=upload-id-avatar&part_number=1`,
      `POST ${STORAGE_BASE}/upload/confirm`,
    ])
    // 第 3 步：字节直传预签名 URL，不经过 chat 进程（doc:367）。
    //
    // ⚠️ 这里断言的是**换过 origin 的**那个地址：`part_url` 后端给的是
    // `https://api.huanvae.cn/...` 绝对地址，`toAbsoluteApiUrl` 只把 origin 换成当前基址
    // （本机反代时是 127.0.0.1:8787），path / query 逐字保留，签名不受影响。
    //
    // profile 文档 :678 的示例写的是 `fetch(\`${STORAGE_BASE_URL}/${part.part_url}\`)`，
    // 而它那份 `STORAGE_BASE_URL` 是**裸域名**（:597）；本仓的同名常量已经带
    // `/api/storage`（`storage.ts` 顶部有 ⚠️ JSDoc）。照示例拼会得到
    // `…/api/storage/https://api.huanvae.cn/…`，所以下面第二行也是一条真断言。
    expect(uploadChunk).toHaveBeenCalledTimes(1)
    expect(uploadChunk.mock.calls[0][0]).toBe(
      `${getApiBaseUrl()}/avatars/alice.png?uploadId=x&partNumber=1&X-Amz-Signature=s`,
    )
    expect(String(uploadChunk.mock.calls[0][0])).not.toContain('/api/storage/')
    // 上面那条 toEqual 已经蕴含这两句；单独写出来是因为它们是本批要消灭的两个具体形态，
    // 而且各自都是真的会变红的断言（不是对恒真式的复述）。
    expect(requestLog().some((line) => line.includes('/api/profile/avatar'))).toBe(false)
    expect(requestLog().some((line) => line.startsWith(`PUT ${PROFILE_BASE}`))).toBe(false)
  })

  it('第 1 步请求体逐字段等于文档 :373-383 的样例形状', async () => {
    mockHappyPath()

    await profileApi.uploadAvatar(pngFile())

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toEqual({
      // file_type ⟺ storage_location 是**双向绑定**，任一侧单独出现都是 400
      // （doc:387、:451-452），而这条绑定是 10 MB 上限的承重件。
      file_type: 'avatar',
      storage_location: 'avatars',
      avatar_target: 'user_avatar',
      filename: 'me.png',
      file_size: 1,
      content_type: 'image/png',
      file_hash: '0'.repeat(64),
    })
  })

  it('user_avatar 档：请求体对象上**根本没有** related_id 这个键（doc:390、:440「不静默忽略」）', async () => {
    // ⚠️ 这条**不能**用 `JSON.parse(init.body)` 来测：`JSON.stringify` 会丢掉值为
    // undefined 的键，所以 `{...base}` 与 `{...base, related_id: undefined}` 序列化后
    // 逐字相同，wire-level 断言对这条约束恒真。判据在**对象**上，不在 JSON 上，
    // 所以这里截的是交给 `requestAvatarUpload` 的那个 payload 对象本身。
    let captured: Record<string, unknown> | undefined
    const requestSpy = vi
      .spyOn(storageApi, 'requestAvatarUpload')
      .mockImplementation(async (payload) => {
        captured = payload as unknown as Record<string, unknown>
        return AVATAR_SESSION as never
      })
    fetchMock
      .mockResolvedValueOnce(envelope(PART_URL_DATA))
      .mockResolvedValueOnce(envelope(CONFIRM_DATA))

    await profileApi.uploadAvatar(pngFile())

    // 正对照：spy 确实接上了、拿到的确实是用户头像那一档的 payload。
    // 少了这一段，下面三条 `false` 在 spy 根本没被调用时也可能"通过"。
    expect(requestSpy).toHaveBeenCalledTimes(1)
    if (captured === undefined) throw new Error('requestAvatarUpload 没被调用，下面的断言无从谈起')
    expect(captured.avatar_target).toBe('user_avatar')

    expect(Object.hasOwn(captured, 'related_id')).toBe(false)
    expect('related_id' in captured).toBe(false)
    expect(Object.keys(captured)).not.toContain('related_id')
  })

  it('confirm 的相对 file_url 出来是绝对地址，字段名是 file_url 不是 avatar_url', async () => {
    mockHappyPath()

    const result = await profileApi.uploadAvatar(pngFile())

    // doc:400 的样例是相对路径 `avatars/{key}?t=…`；补基址在 api 出口做一次。
    // 断言必须是完整 URL 逐字相等——相对路径本身也是非空字符串。
    expect(result.file_url).toBe(`${getApiBaseUrl()}/avatars/alice.png?t=1706000000`)
    expect(result.file_key).toBe('alice.png')
  })

  it('成功之后不再回写：没有 PUT /api/profile（doc:411「无需再调」）', async () => {
    mockHappyPath()

    await profileApi.uploadAvatar(pngFile())

    // 正对照：confirm 确实发生了（否则"没有 PUT"是恒真的空话）。
    expect(requestLog()).toContain(`POST ${STORAGE_BASE}/upload/confirm`)
    expect(requestLog().filter((line) => line.startsWith('PUT '))).toEqual([])
  })

  it('group- 前缀账号的 400：后端原文原样上抛，且不会被当成可重试的会话错误', async () => {
    // doc:454：`user_id` 以 `group-` 开头的存量账号 → 400，那是群头像 object key 的
    // **保留命名空间**，这个账号的头像上传永远不会成功。文档没有给这条的服务端原文，
    // 所以本条钉的是**透传**（后端说什么就抛什么），不是某句具体文案。
    const backendText = '用户 ID 以 group- 开头，该命名空间保留给群头像，无法上传用户头像'
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 400, message: backendText }, 400))

    const error = await profileApi.uploadAvatar(pngFile()).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    // 换成自造的「上传失败，请重试」→ 本行红。那句话对这个账号是错误建议。
    expect((error as ApiError).message).toBe(backendText)
    // 400 ≠ 409：它不是"会话死了、整条重来"，分诊器必须分得开。
    expect(isUploadSessionExpired(error)).toBe(false)
    // 第 1 步就被拒，链路不往下走，更没有自动重试。
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('confirm 的 409 可分诊，且不自动重试（doc:445、:447-450）', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope(AVATAR_SESSION))
      .mockResolvedValueOnce(envelope(PART_URL_DATA))
      .mockResolvedValueOnce(
        json(
          { success: false, code: 409, message: '该上传会话已被同一目标的新请求接管，请重新发起上传' },
          409,
        ),
      )

    const error = await profileApi.uploadAvatar(pngFile()).catch((e: unknown) => e)

    // 409 = 必须回第 1 步重来；400 = 改个参数还可能成。分诊按**状态码**，不 match 文案。
    expect(isUploadSessionExpired(error)).toBe(true)
    expect((error as ApiError).message).toBe(
      '该上传会话已被同一目标的新请求接管，请重新发起上传',
    )
    // 三次请求就地停下：没有静默重发 confirm，也没有重走一遍链路去接管别人的会话。
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('进度回调透传的是真实分片进度，不是编出来的数', async () => {
    // 两片：第一片完成 50%，第二片完成 100%。写死任何一个值都会让这条红。
    fetchMock
      .mockResolvedValueOnce(envelope({ ...AVATAR_SESSION, chunk_size: 2, total_chunks: 2 }))
      .mockResolvedValueOnce(envelope(PART_URL_DATA))
      .mockResolvedValueOnce(envelope({ ...PART_URL_DATA, part_number: 2 }))
      .mockResolvedValueOnce(envelope(CONFIRM_DATA))
    const onProgress = vi.fn()

    await profileApi.uploadAvatar(new File(['abcd'], 'me.png', { type: 'image/png' }), onProgress)

    expect(onProgress.mock.calls.map(([p]) => p.percent)).toEqual([50, 100])
    expect(onProgress.mock.calls[1][0]).toEqual({
      percent: 100,
      loaded: 4,
      total: 4,
      currentChunk: 2,
      totalChunks: 2,
    })
  })

  it('扩展名不在白名单的文件一个请求都不发（doc:391、:453）', async () => {
    // 扩展名会成为 object key 的后缀，所以它是与 MIME 并列的第二道闸：
    // 这个文件 MIME 合法、扩展名非法，后端会在第 1 步 400。
    await expect(
      profileApi.uploadAvatar(new File(['x'], 'me.bmp', { type: 'image/png' })),
    ).rejects.toThrow('文件扩展名不支持')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('image/jpg 被放行——后端收（doc:392），客户端此前把它挡在门外', async () => {
    // 正对照：上一条的 `not.toHaveBeenCalled()` 只有在"确实有能走通的输入"时才有意义。
    mockHappyPath()

    await expect(
      profileApi.uploadAvatar(new File(['x'], 'me.jpg', { type: 'image/jpg' })),
    ).resolves.toBeTruthy()

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
