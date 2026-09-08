import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { isAuthError } from '@/api/apiClient'
import { isUploadSessionExpired, storageApi } from '@/api/storage'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { ApiError, ApiShapeError } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import {
  applyProfileEdits,
  pickProfileEdits,
  profileApi,
  profileFormValues,
  type UpdateProfileRequest,
} from '../profile'
import { makeProfile, makeProfileWire } from './profileFixture'

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
 * 响应体的读法（`data.data || data`）**已经在本文件里换掉了**，不是后续批次：
 * 见 `describe('profileApi.getProfile 的信封解包')` 与
 * `describe('profileApi.getProfile 的字段校验')`。本行此前写的是"本批一个字没动"，
 * 与那两组用例、以及它们上方那句"被替掉的是 `data.data || data`"直接矛盾。
 */

// getApiBaseUrl() 而不是字面量：Vitest 会加载 .env，宿主由本机反代决定。
const PROFILE_BASE = `${getApiBaseUrl()}/api/profile`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** 后端线上形状（16 个字段，doc:92-109）。 */
const PROFILE_DTO = makeProfileWire()

let fetchMock: ReturnType<typeof vi.fn>
/** `legacyBare` 与宽松档字段都是**靠 warn 留痕**的，所以它必须被观察到而不是被吞掉。 */
let warnMock: ReturnType<typeof vi.spyOn>

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
  warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('profileApi.updateProfile', () => {
  it('成功时把请求打到 PUT /api/profile', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))

    await expect(profileApi.updateProfile({ email: 'new@example.com' })).resolves.toBeUndefined()

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
    //
    // ⚠️ 新密码这里给的是**本地检查放得过**的 6 位：长度闸现在在客户端也有一道
    // （见下面那个 describe），所以这条 400 只可能在"前后端规则不一致"时出现——
    // 而这正是它仍然要被钉住的原因：判据在后端，客户端那道只是省一次往返，
    // 后端说不行时错误必须照样以可见形态上抛，不能因为"本地过了"就当成功。
    fetchMock.mockResolvedValueOnce(
      json({ error: 'Validation error: new_password: Password must be 6-100 characters' }, 400),
    )

    const error = await profileApi
      .changePassword({ old_password: 'oldpass123', new_password: 'abcdef' })
      .catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(400)
    expect(isAuthError(error as Error)).toBe(false)
  })
})

/**
 * 密码长度：doc:304-306「`old_password`: 至少 6 字符 / `new_password`: 6-100 字符」。
 *
 * 本批之前**上限一处都没有**：两个组件各判了一次 `newPassword.length < 6`，
 * 粘一个 100 位以上的密码要等一次往返回来才知道不行。下限也从组件搬到了这里——
 * 同一条规则写在两个组件里，改一处就是漂移。
 */
describe('profileApi.changePassword 的本地长度闸', () => {
  it('新密码超过 100 位：一个请求都不发', async () => {
    await expect(
      profileApi.changePassword({ old_password: 'oldpass123', new_password: 'a'.repeat(101) }),
    ).rejects.toThrow('新密码长度最多 100 位')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('新密码不足 6 位：一个请求都不发', async () => {
    await expect(
      profileApi.changePassword({ old_password: 'oldpass123', new_password: 'abc' }),
    ).rejects.toThrow('新密码长度至少 6 位')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('旧密码不足 6 位：一个请求都不发（doc:305，此前两个组件都没判）', async () => {
    await expect(
      profileApi.changePassword({ old_password: 'abc', new_password: 'newpass456' }),
    ).rejects.toThrow('当前密码长度至少 6 位')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('正对照：边界值（新密码正好 100 位）照常发出去', async () => {
    // 上面三条的 `not.toHaveBeenCalled()` 需要这一条，否则"没发请求"在
    // fetchMock 根本没接上、或长度闸把所有输入都拦下时同样成立。
    fetchMock.mockResolvedValueOnce(json({ message: 'Password updated successfully' }))

    await expect(
      profileApi.changePassword({ old_password: 'oldpass123', new_password: 'a'.repeat(100) }),
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${PROFILE_BASE}/password`)
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

    await expect(profileApi.updateProfile({ email: 'new@example.com' })).resolves.toBeUndefined()

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

    expect(profile).toEqual(makeProfile())
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

/**
 * 信封解包层。
 *
 * 被替掉的是 `const data = await response.json(); return data.data || data`——
 * 三种候选形状（裸 DTO / 只有 `data` 键 / 完整 `{success, code, data}`）它**全都**
 * 歪打正着，所以它从来不会报错，也就从来不会告诉任何人形状到底是哪一种。
 *
 * 后端在本机不可达（`api.huanvae.cn` 被 ICP 拦截、无 SNI 那条要客户端证书），
 * 而文档在这个端点上自相矛盾（:68-87 只有 `data` 键，:240-254 是完整信封），
 * 所以迁移带了 `legacyBare` 豁免。本组用例钉的正是这个豁免**不是** `?? body`：
 * 它命中时会 warn（欠账可 grep），而 `data: null` 之类的真形状错误照抛不误。
 */
describe('profileApi.getProfile 的信封解包', () => {
  it('裸响应（没有 success/code/data 包裹）走 legacyBare：能解析，但每次都留下 warn', async () => {
    // 一条用例里做两次请求，用**同一个** spy 覆盖正反两侧：
    // 只写"裸响应会 warn"，spy 接错地方也可能碰巧绿；只写"信封不 warn"，
    // 在 warn 从来没被调用过时是恒真的空话。
    fetchMock.mockResolvedValueOnce(json(PROFILE_DTO))

    const bare = await profileApi.getProfile()

    expect(bare.user_id).toBe('u1')
    // 文案里必须能看出"这是欠账"：reason 与清理期限都来自 PROFILE_LEGACY_BARE。
    const warned: string[] = warnMock.mock.calls.map((call: unknown[]) => String(call[0]))
    expect(warned.some((line) => line.includes('GET /api/profile 仍是裸响应'))).toBe(true)
    expect(warned.some((line) => line.includes('清理期限 2026-12-31'))).toBe(true)

    // 反向：完整信封走正常路径，一条 warn 都不该有。
    warnMock.mockClear()
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    const enveloped = await profileApi.getProfile()

    expect(enveloped.user_id).toBe('u1')
    expect(warnMock).not.toHaveBeenCalled()
  })

  it('文档 :68-87 那种「只有 data 键」的形状也认，且不算欠账', async () => {
    // §1 的响应样例逐字就是这个形状：没有 success、没有 code，只有 data。
    // `unwrapData` 的判定是 `'data' in envelope`，所以它走的是正常路径而不是
    // legacyBare——这条与上一条合起来覆盖了三种候选形状里的后两种。
    fetchMock.mockResolvedValueOnce(json({ data: PROFILE_DTO }))

    const profile = await profileApi.getProfile()

    expect(profile.user_id).toBe('u1')
    expect(warnMock).not.toHaveBeenCalled()
  })

  it('data 为 null 时抛形状错误——legacyBare 不是 `?? body`', async () => {
    // 这一条是 `legacyBare` 与 `x.data ?? x` 的**分界线**：后者会把
    // `{success:true,data:null}` 变成"读整个信封"，于是 user_id 是 undefined，
    // 一路静默到渲染层。这里必须炸。
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: null }))

    const error = await profileApi.getProfile().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiShapeError)
    expect((error as ApiError).endpoint).toBe('GET /api/profile')
  })

  it('HTTP 200 但 success:false 也是失败（旧写法只看 response.ok）', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 400, error: '资料不可用' }, 200))

    const error = await profileApi.getProfile().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('资料不可用')
  })
})

/**
 * 16 个字段的严格 / 宽松两档。
 *
 * 界线是「本批有没有接上消费者」：四个隐私字段本批接进了设置页的隐私区 ⇒ 严格；
 * `background_url` / `gender` / `birthday` / `region` 本批无人读 ⇒ 宽松（warn 但不抛）。
 * 理由写在 `profile.ts` 的 `unconsumedNullableStr` 上：一个被严格解析却没有消费者的
 * 字段，在后端改名那天会让**所有人**打不开资料页，而收益是零。
 */
describe('profileApi.getProfile 的字段校验', () => {
  const omit = (key: string) => {
    const wire = makeProfileWire()
    delete wire[key]
    return wire
  }

  it('四个隐私字段：少一个就抛形状错误，且错误里点得出是哪个字段', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: omit('allow_search') }))

    const error = await profileApi.getProfile().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiShapeError)
    // "可见"还不够，要"可归因"：错误必须指名字段，否则排查时只知道"资料页坏了"。
    expect((error as Error).message).toContain('allow_search')
    expect((error as ApiError).endpoint).toBe('GET /api/profile')
  })

  it('allow_search 为 null 时同样抛——null 会被 Switch 渲染成"关"', async () => {
    // `require` 档会放行 null（它判的是 `=== undefined`），于是一个**开着**的
    // 搜索开关在面板上显示成关着的。这就是本端点用 `parse` 不用 `require` 的理由。
    fetchMock.mockResolvedValueOnce(
      json({ success: true, code: 200, data: makeProfileWire({ allow_search: null }) }),
    )

    await expect(profileApi.getProfile()).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('search_visible_by_id 缺失同样抛，且点名', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ success: true, code: 200, data: omit('search_visible_by_id') }),
    )

    const error = await profileApi.getProfile().catch((e: unknown) => e)

    expect((error as Error).message).toContain('search_visible_by_id')
  })

  it('policy 取值不在 manual/auto_accept/auto_reject 里就抛（doc:156）', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        success: true,
        code: 200,
        data: makeProfileWire({ friend_request_policy: 'auto_maybe' }),
      }),
    )

    const error = await profileApi.getProfile().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiShapeError)
    expect((error as Error).message).toContain('friend_request_policy')
    expect((error as Error).message).toContain('auto_maybe')
  })

  it('group_invite_policy 缺失同样抛，且点名', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ success: true, code: 200, data: omit('group_invite_policy') }),
    )

    const error = await profileApi.getProfile().catch((e: unknown) => e)

    expect((error as Error).message).toContain('group_invite_policy')
  })

  it('本批无人消费的四个字段：缺席只 warn，不让所有人打不开资料页', async () => {
    // 同一个 spy 覆盖正反两侧（理由同 legacyBare 那条）。
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: omit('gender') }))

    const profile = await profileApi.getProfile()

    // 请求整体成功——这才是"宽松"的全部含义。
    expect(profile.user_id).toBe('u1')
    expect(profile.gender).toBeNull()
    const warned: string[] = warnMock.mock.calls.map((call: unknown[]) => String(call[0]))
    expect(warned.some((line) => line.includes('gender') && line.includes('缺失'))).toBe(true)

    // 反向：字段在时原样透传，且不 warn。
    warnMock.mockClear()
    fetchMock.mockResolvedValueOnce(
      json({ success: true, code: 200, data: makeProfileWire({ gender: 'female' }) }),
    )

    const complete = await profileApi.getProfile()

    expect(complete.gender).toBe('female')
    expect(warnMock).not.toHaveBeenCalled()
  })

  it('background_url 的相对路径出来是绝对地址（doc:99，与头像同一句「需拼接」）', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        success: true,
        code: 200,
        data: makeProfileWire({ background_url: 'avatars/background/u1.jpg?t=1706000000' }),
      }),
    )

    const profile = await profileApi.getProfile()

    expect(profile.background_url).toBe(
      `${getApiBaseUrl()}/avatars/background/u1.jpg?t=1706000000`,
    )
  })

  it('user_signature 为空串时归一成 null，而不是让整个资料页炸掉', async () => {
    // `nullableStr` 会把 `''` 判成"缺失"并抛。而写侧对空串是放行的
    // （文档自己的参考实现 :609/:615 就是把空输入框原样发出去），所以
    // "签名被清空了"是一个完全正常的账号状态，不能变成解析失败。
    fetchMock.mockResolvedValueOnce(
      json({ success: true, code: 200, data: makeProfileWire({ user_signature: '', user_email: '' }) }),
    )

    const profile = await profileApi.getProfile()

    expect(profile.user_signature).toBeNull()
    expect(profile.user_email).toBeNull()
  })

  it('三个 emptyable 字段**缺键**照抛：空串归一是放宽，缺席不是', async () => {
    // 修掉的是 `emptyableStr` 里 `value === undefined` 那一支：它把「后端明确说
    // 没有」和「这个键根本没来」折成同一个 `null`，而这三个字段 UI 都在读
    // （邮箱/签名输入框、三处头像）。房规见 `apiParse.nullableStr` 与 `groups.ts`
    // 的同名 `emptyableStr`——两者对缺键都抛。
    for (const key of ['user_email', 'user_signature', 'user_avatar_url']) {
      fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: omit(key) }))

      const error = await profileApi.getProfile().catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ApiShapeError)
      expect((error as Error).message).toContain(key)
    }

    // 同一条用例里的两侧对照，缺一不可：
    // - 放宽档还在（缺 `gender` 仍然只 warn 不抛），证明上面三条不是"什么都抛"；
    // - `''` 仍然归一成 `null`，证明上面三条抛的是缺键而不是把放宽整个撤回。
    warnMock.mockClear()
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: omit('gender') }))
    await expect(profileApi.getProfile()).resolves.toMatchObject({ gender: null })
    expect(warnMock).toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(
      json({ success: true, code: 200, data: makeProfileWire({ user_avatar_url: '' }) }),
    )
    await expect(profileApi.getProfile()).resolves.toMatchObject({ user_avatar_url: null })
  })

  it('admin 是字符串 "false"（不是布尔），16 个字段一个不少地带出来', async () => {
    // 正对照：上面几条都在验"少字段会怎样"，这条验"齐了会怎样"。
    // 最后那句 `Object.keys(profile).sort()` 覆盖全部 16 个键——把解析器改成
    // 少返回两个（实测删掉 created_at / updated_at），它立刻红。
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    const profile = await profileApi.getProfile()

    expect(profile.admin).toBe('false')
    expect(typeof profile.admin).toBe('string')
    expect(Object.keys(profile).sort()).toEqual(Object.keys(makeProfile()).sort())
  })
})

/**
 * `PUT /api/profile` 的七个被丢掉的可写字段。
 *
 * 旧实现是一条 if 链，只放行 `nickname` / `email` / `signature`；文档 :139-150 的
 * 字段表有十个。剩下七个**静默丢弃**——用户在面板上改了隐私设置、点了保存、
 * 看到"成功"，而请求体里根本没有那个字段。
 */
describe('profileApi.updateProfile 的请求体', () => {
  const sentBody = () => JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))

  it('七个新字段逐个上线（把 if 链白名单还原 → 本条红）', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))

    await profileApi.updateProfile({
      allow_search: false,
      search_visible_by_id: false,
      friend_request_policy: 'auto_reject',
      group_invite_policy: 'auto_accept',
      gender: 'female',
      birthday: '1995-08-20',
      region: '上海',
    })

    expect(sentBody()).toEqual({
      allow_search: false,
      search_visible_by_id: false,
      friend_request_policy: 'auto_reject',
      group_invite_policy: 'auto_accept',
      gender: 'female',
      birthday: '1995-08-20',
      region: '上海',
    })
  })

  it('只传一个字段就只发一个字段——部分更新，缺席 = 保持原值（doc:162-189）', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))

    await profileApi.updateProfile({ signature: '新签名' })

    // `toEqual` 而不是 `toMatchObject`：多发一个没碰过的字段就是一次覆盖写，
    // 而这正是本批要修的缺陷（旧代码无条件带上 email / signature）。
    expect(sentBody()).toEqual({ signature: '新签名' })
  })

  it('allow_search: false 不会被当成"没传"丢掉', async () => {
    // 判定必须是 `!== undefined`，写成真值判断的话，两个隐私开关**永远关不掉**：
    // false 会被跳过，请求体空了再被下面那条空体闸拦住，用户看到的是"没有需要保存的修改"。
    fetchMock.mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))

    await profileApi.updateProfile({ allow_search: false })

    expect(sentBody()).toEqual({ allow_search: false })
  })

  it('空请求体一个请求都不发（doc:160「至少提供一个字段」）', async () => {
    await expect(profileApi.updateProfile({})).rejects.toThrow('没有需要保存的修改')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('昵称被清空时就地拦下（doc:141「1-50 字符」），不发请求', async () => {
    // 本批把两个组件里那个一直 disabled 的昵称输入框放开了，于是"清空昵称"
    // 第一次成为可达输入。后端对它是 400，本地这一道只是省一次往返。
    await expect(profileApi.updateProfile({ nickname: '' })).rejects.toThrow('昵称长度需为 1-50')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('正对照：合法的昵称照常发出去', async () => {
    // 上面两条的 `not.toHaveBeenCalled()` 需要它，否则"没发请求"在 fetchMock
    // 没接上、或本地闸把一切都拦下时同样成立。
    fetchMock.mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))

    await profileApi.updateProfile({ nickname: '新昵称' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentBody()).toEqual({ nickname: '新昵称' })
  })
})

/**
 * `pickProfileEdits`：表单值 → 只含**被改过**的字段的部分更新体。
 *
 * 两个 UI 此前都无条件发 `{email, signature}`，于是一次"只改签名"的保存会把
 * 邮箱一起重写，而 `profile.user_email || ''` 让没有邮箱的账号发出 `email: ""`。
 * 缺陷不是"发了空串"，是**发了用户没碰过的字段**。
 */
describe('pickProfileEdits', () => {
  const current = makeProfile({ user_email: 'a@example.com', user_signature: '旧签名' })
  const formOf = (overrides: Partial<{ nickname: string; email: string; signature: string }> = {}) => ({
    nickname: current.user_nickname,
    email: current.user_email ?? '',
    signature: current.user_signature ?? '',
    ...overrides,
  })

  it('一个都没改：空对象（于是 updateProfile 会就地拦下，不发请求）', () => {
    expect(pickProfileEdits(current, formOf())).toEqual({})
  })

  it('只改签名：邮箱不出现在请求体里（旧写法会把它一起重写）', () => {
    expect(pickProfileEdits(current, formOf({ signature: '新签名' }))).toEqual({
      signature: '新签名',
    })
  })

  it('用户主动清空邮箱：空串照发——"清空"与"没碰过"必须分得开', () => {
    // 文档没有任何一处说空串会被拒，它自己的参考实现（:592、:609、:615）做的
    // 正是"读输入框原值直接发"。所以这里不去猜后端收不收，只保证意图能表达。
    expect(pickProfileEdits(current, formOf({ email: '' }))).toEqual({ email: '' })
  })

  it('没有邮箱的账号不动邮箱框：不会发出 email: ""', () => {
    // 旧写法的具体形态：`formData.email = profile.user_email || ''`，
    // 再无条件 `body.email = formData.email` ⇒ 每次保存都发 `email: ""`。
    const noEmail = makeProfile({ user_email: null, user_signature: null })

    expect(pickProfileEdits(noEmail, { nickname: noEmail.user_nickname, email: '', signature: '' })).toEqual({})
  })

  it('资料还没加载出来时返回空对象，不拿一份空表单去覆盖真实资料', () => {
    expect(pickProfileEdits(null, formOf({ signature: '新签名' }))).toEqual({})
  })

  it('昵称改了就带上昵称（本批之前输入框是 disabled 的，改不了）', () => {
    expect(pickProfileEdits(current, formOf({ nickname: '新昵称' }))).toEqual({
      nickname: '新昵称',
    })
  })

  it('左逆：从一份资料种出来的表单，差分必然为空', () => {
    // 这条等式是「保存更改」不会闪的**全部**理由（`ProfileModal` 那一侧靠它把
    // "表单空着但按钮亮着"那一拍消掉）。三种形态各来一份：有值 / `null` /
    // 空串——后两种在输入框里都长成"空的"，差分必须同样为空。（解析器出口只会给
    // `null`，空串那份来自落盘 rehydrate 的旧值。）
    for (const profile of [
      current,
      makeProfile({ user_email: null, user_signature: null }),
      makeProfile({ user_email: '', user_signature: '' }),
    ]) {
      expect(pickProfileEdits(profile, profileFormValues(profile))).toEqual({})
    }

    // 正对照：种出来之后**改一个字**，差分立刻非空——上面那句不是"永远返回 {}"。
    const seeded = profileFormValues(current)
    expect(pickProfileEdits(current, { ...seeded, nickname: `${seeded.nickname}丁` })).toEqual({
      nickname: `${current.user_nickname}丁`,
    })
  })

  it('资料为 null 时表单是三个空串（输入框只认字符串）', () => {
    expect(profileFormValues(null)).toEqual({ nickname: '', email: '', signature: '' })
  })
})

/**
 * `applyProfileEdits`：一次**后端已经答应下来**的部分更新 → 新的 `UserProfile`。
 *
 * 只有一个调用点：`profileStore.updateProfile` 在 PUT 拿到 200 之后。它存在的理由
 * 是那次读回可能失败——失败时若什么都不做，屏幕上留的是**修改前**的值，而后端存的
 * 是新值（`PrivacySettings` 的开关就是这么弹回相反位置的）。
 *
 * 三个字段两侧不同名（`nickname`/`email`/`signature` ⇄ `user_*`），所以这里逐个点名；
 * 漏一个的后果是"这个字段保存成功但界面不动"，比整体失败更难查。
 */
describe('applyProfileEdits', () => {
  const current = makeProfile({
    user_nickname: '旧昵称',
    user_email: 'old@example.com',
    user_signature: '旧签名',
    allow_search: true,
    search_visible_by_id: true,
    friend_request_policy: 'manual',
    group_invite_policy: 'manual',
    gender: null,
    birthday: null,
    region: null,
  })

  it('十个可写字段逐个落到对应的 UserProfile 字段上（含三个改名的）', () => {
    const applied = applyProfileEdits(current, {
      nickname: '新昵称',
      email: 'new@example.com',
      signature: '新签名',
      allow_search: false,
      search_visible_by_id: false,
      friend_request_policy: 'auto_reject',
      group_invite_policy: 'auto_accept',
      gender: 'female',
      birthday: '1995-08-20',
      region: '上海',
    })

    expect(applied).toEqual({
      ...current,
      user_nickname: '新昵称',
      user_email: 'new@example.com',
      user_signature: '新签名',
      allow_search: false,
      search_visible_by_id: false,
      friend_request_policy: 'auto_reject',
      group_invite_policy: 'auto_accept',
      gender: 'female',
      birthday: '1995-08-20',
      region: '上海',
    })
  })

  it('没带的字段一个都不动（部分更新语义 doc:162-189）', () => {
    const applied = applyProfileEdits(current, { allow_search: false })

    expect(applied).toEqual({ ...current, allow_search: false })
    // 原对象不被就地改写：store 靠引用变化触发重渲染。
    expect(current.allow_search).toBe(true)
  })

  it('清空一格：写侧的空串 = 读侧的 null，两侧口径同一套', () => {
    // 读侧 `emptyableStr` 把 `''` 归一成 `null`；这里若原样存 `''`，
    // 下一次 `loadProfile()` 回来就会变成 `null`，同一个账号在两拍之间不一样。
    const applied = applyProfileEdits(current, { email: '', signature: '', region: '' })

    expect(applied.user_email).toBeNull()
    expect(applied.user_signature).toBeNull()
    expect(applied.region).toBeNull()
  })

  it('与 pickProfileEdits 对得上：一次真实编辑的差分打回去，就是编辑后的那份资料', () => {
    const edited = { ...profileFormValues(current), signature: '新签名' }

    expect(applyProfileEdits(current, pickProfileEdits(current, edited))).toEqual({
      ...current,
      user_signature: '新签名',
    })
  })
})

/**
 * `PUT /api/profile` 的本地字段校验（doc:152-160 的「验证规则」逐条）。
 *
 * 性质与 `uploadAvatar` 的大小/格式检查相同：**判据在后端**，这里只省一次注定
 * 失败的往返，顺便把提示写成中文（后端给的是 `Validation error: ...` 的英文串）。
 * 每条都断言 `fetch` 一次都没发——只断言"抛了"的话，一个先发请求再抛的实现也能绿。
 */
describe('profileApi.updateProfile 的本地字段校验', () => {
  const cases: readonly [string, UpdateProfileRequest, string][] = [
    ['昵称超过 50 字（doc:141）', { nickname: 'a'.repeat(51) }, '昵称长度需为 1-50'],
    ['签名超过 200 字（doc:143）', { signature: 'a'.repeat(201) }, '个性签名最长 200'],
    ['地区超过 100 字（doc:150）', { region: 'a'.repeat(101) }, '地区最长 100'],
    // 类型上写不出这些值，但类型不是执行者——运行时校验才是。
    ['性别不在三档里（doc:148）', { gender: 'unknown' as never }, '性别取值须为'],
    ['好友申请策略取值非法（doc:146）', { friend_request_policy: 'later' as never }, 'friend_request_policy 取值须为'],
    ['群邀请策略取值非法（doc:147）', { group_invite_policy: 'later' as never }, 'group_invite_policy 取值须为'],
    ['生日不是 ISO 日期（doc:149）', { birthday: '1995/08/20' }, '生日须为 ISO 日期格式'],
  ]

  it.each(cases)('%s：就地拦下，不发请求', async (_name, updates, expected) => {
    await expect(profileApi.updateProfile(updates)).rejects.toThrow(expected)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('正对照：每一档的合法边界值都放行', async () => {
    // 上面七条的 `not.toHaveBeenCalled()` 需要它，否则"没发请求"在校验把一切都
    // 拦下时同样成立。边界值取的是各自的上限/合法枚举，不是"随便一个正常值"。
    fetchMock.mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))

    await profileApi.updateProfile({
      nickname: 'a'.repeat(50),
      signature: 'b'.repeat(200),
      region: 'c'.repeat(100),
      gender: 'other',
      friend_request_policy: 'auto_reject',
      group_invite_policy: 'auto_accept',
      birthday: '1995-08-20',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
