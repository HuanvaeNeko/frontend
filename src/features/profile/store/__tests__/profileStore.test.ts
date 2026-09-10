import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { ApiError } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { beginSession, endSession } from '@/lib/sessionScope'
import { profileApi, type UserProfile } from '../../api/profile'
import { makeProfile } from '../../api/__tests__/profileFixture'
import { migrateProfilePersist, useProfileStore } from '../profileStore'

/**
 * 三个 action 的失败出口。
 *
 * 修复前，认证分支是
 * `set({isLoading:false}); silentRedirectToLogin(); return` —— **`return`**。
 * promise 因此 resolve，`ProfilePage.handleSubmit` 里
 * `await updateProfile(...)` 后面那句绿色的「成功 / 个人资料已更新」照弹，
 * 而同一刻 `clearAuth()` 已执行、页面正在跳登录页。
 *
 * 所以每条用例都必须断言 **promise 被 reject**，而不只是断言"跳了登录页"：
 * 只断言 `location.replace` 被调用的话，`return` 版本同样通过，等于没测。
 */

const validationError = () =>
  // backend-docs/profile/个人资料管理.md:213，逐字。
  new ApiError('Validation error: email: Invalid email format', {
    status: 400,
    code: 400,
    endpoint: 'PUT /api/profile',
  })

const sessionExpired = (endpoint: string) =>
  new ApiError('未认证或 Token 无效', { status: 401, code: 401, endpoint })

const replaceSpy = vi.fn()

const loggedIn = () => useAuthStore.getState().isAuthenticated

beforeEach(() => {
  localStorage.clear()
  replaceSpy.mockClear()
  // 会话制下 fetchWithAuth 不再读 token——同源 cookie 自动带上。
  useAuthStore.setState({ isAuthenticated: true })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  vi.spyOn(window.location, 'replace').mockImplementation(replaceSpy)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('profileStore.updateProfile', () => {
  it('校验失败：reject + 写 store.error，且不登出', async () => {
    vi.spyOn(profileApi, 'updateProfile').mockRejectedValue(validationError())

    await expect(useProfileStore.getState().updateProfile({ email: 'x' })).rejects.toThrow(
      'Validation error: email: Invalid email format',
    )

    expect(useProfileStore.getState().error).toBe('Validation error: email: Invalid email format')
    expect(useProfileStore.getState().isLoading).toBe(false)
    // 这条编辑被拒绝了，但会话没问题：不清 token、不跳登录页。
    expect(loggedIn()).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('会话失效：跳登录页，但**依然 reject**（不能让调用方弹成功）', async () => {
    vi.spyOn(profileApi, 'updateProfile').mockRejectedValue(sessionExpired('PUT /api/profile'))

    // 把这里的 `throw error` 改回 `return` → 本行变红（promise 会 resolve）。
    await expect(useProfileStore.getState().updateProfile({ email: 'x' })).rejects.toThrow(
      '未认证或 Token 无效',
    )

    expect(loggedIn()).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
    expect(useProfileStore.getState().isLoading).toBe(false)
  })

  it('更新成功后才回填 profile', async () => {
    // `updateProfile` 现在返回 void：后端那句 `"Profile updated successfully"`
    // 是英文、两个调用点弹的都是中文 toast，理由写在 `profile.ts` 该方法的 JSDoc。
    vi.spyOn(profileApi, 'updateProfile').mockResolvedValue(undefined)
    vi.spyOn(profileApi, 'getProfile').mockResolvedValue(
      makeProfile({ user_email: 'new@example.com' }),
    )

    await useProfileStore.getState().updateProfile({ email: 'new@example.com' })

    expect(useProfileStore.getState().profile?.user_email).toBe('new@example.com')
    expect(useProfileStore.getState().error).toBeNull()
  })
})

/**
 * PUT 成功、随后那次读回失败 —— **不是**一次失败的保存。
 *
 * 这是 P2 已经在头像那条路径上修过的同一个形态（`ProfilePage.handleAvatarChange`
 * 的 JSDoc 逐字写着「把这两步塞回同一个 `try` 就会复活这个 bug」，而它自己的
 * `loadProfile()` 带着独立的 `.catch`）。本 action 此前把 PUT 与读回放在同一个
 * `try` 里，于是：
 * - 读回 500 ⇒ 一次后端**已经提交**的修改被报告成「保存失败」，
 *   `PrivacySettings` 的开关随后停回相反的位置（它读的就是本 store 的 `profile`）；
 * - 读回 401 ⇒ `settleError` 认出认证错误，`silentRedirectToLogin()`——
 *   一次成功的保存以无解释登出收场。
 */
describe('profileStore.updateProfile：PUT 已提交之后读回失败', () => {
  const readBackFailure = (status: number) =>
    new ApiError(status === 401 ? '未认证或 Token 无效' : '服务器内部错误', {
      status,
      code: status,
      endpoint: 'GET /api/profile',
    })

  it('读回 500：resolve、不写 error，profile 跟上这次已提交的修改', async () => {
    useProfileStore.setState({ profile: makeProfile({ allow_search: true }) })
    const put = vi.spyOn(profileApi, 'updateProfile').mockResolvedValue(undefined)
    vi.spyOn(profileApi, 'getProfile').mockRejectedValue(readBackFailure(500))

    await expect(
      useProfileStore.getState().updateProfile({ allow_search: false }),
    ).resolves.toBeUndefined()

    // 正对照：PUT 确实发了这一次修改（否则下面三行在"什么都没做"时也成立）。
    expect(put).toHaveBeenCalledWith({ allow_search: false })
    expect(useProfileStore.getState().error).toBeNull()
    // 后端已经提交了 `false`，屏幕上就不能还写着 `true`。
    expect(useProfileStore.getState().profile?.allow_search).toBe(false)
    expect(useProfileStore.getState().isLoading).toBe(false)
  })

  it('读回 401：不清凭证、不跳登录页——这次保存已经成功了', async () => {
    useProfileStore.setState({ profile: makeProfile({ user_signature: '旧签名' }) })
    vi.spyOn(profileApi, 'updateProfile').mockResolvedValue(undefined)
    vi.spyOn(profileApi, 'getProfile').mockRejectedValue(readBackFailure(401))

    await expect(
      useProfileStore.getState().updateProfile({ signature: '新签名' }),
    ).resolves.toBeUndefined()

    expect(loggedIn()).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(useProfileStore.getState().profile?.user_signature).toBe('新签名')
  })

  it('正对照：PUT **本身**失败时，照旧写 error 并 reject', async () => {
    // 没有这一条，上面两条在"updateProfile 从此永不失败"时同样成立。
    useProfileStore.setState({ profile: makeProfile({ allow_search: true }) })
    vi.spyOn(profileApi, 'updateProfile').mockRejectedValue(
      new ApiError('Validation error: email: Invalid email format', {
        status: 400,
        code: 400,
        endpoint: 'PUT /api/profile',
      }),
    )
    const get = vi.spyOn(profileApi, 'getProfile').mockResolvedValue(makeProfile())

    await expect(useProfileStore.getState().updateProfile({ email: 'x' })).rejects.toThrow(
      'Validation error',
    )

    expect(useProfileStore.getState().error).toContain('Validation error')
    // PUT 没成功就不该有读回，profile 也一个字段都不该动。
    expect(get).not.toHaveBeenCalled()
    expect(useProfileStore.getState().profile?.allow_search).toBe(true)
  })
})

describe('profileStore.loadProfile', () => {
  it('会话失效：跳登录页且 reject', async () => {
    vi.spyOn(profileApi, 'getProfile').mockRejectedValue(sessionExpired('GET /api/profile'))

    await expect(useProfileStore.getState().loadProfile()).rejects.toThrow('未认证或 Token 无效')

    expect(loggedIn()).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })

  it('404 之类的普通失败可见地上抛，不登出', async () => {
    vi.spyOn(profileApi, 'getProfile').mockRejectedValue(
      new ApiError('用户不存在', { status: 404, code: 404, endpoint: 'GET /api/profile' }),
    )

    await expect(useProfileStore.getState().loadProfile()).rejects.toThrow('用户不存在')

    expect(useProfileStore.getState().error).toBe('用户不存在')
    expect(loggedIn()).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
  })
})

describe('profileStore.uploadAvatar', () => {
  it('前端哨兵「No refresh token available」判成会话失效：跳登录页且 reject', async () => {
    // 这条裸 Error 来自 authStore.refreshAccessToken，经 profile.ts 那份
    // fetchWithAuth 的 401 分支原样 rethrow 上来 —— 是本模块真实会遇到的形状。
    vi.spyOn(profileApi, 'uploadAvatar').mockRejectedValue(new Error('No refresh token available'))

    await expect(useProfileStore.getState().uploadAvatar(new File([], 'a.png'))).rejects.toThrow(
      'No refresh token available',
    )

    expect(loggedIn()).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })

  it('本地校验失败（文件太大）是可见错误，不登出', async () => {
    vi.spyOn(profileApi, 'uploadAvatar').mockRejectedValue(
      new Error('文件太大，最大 10MB，当前: 12.00 MB'),
    )

    await expect(useProfileStore.getState().uploadAvatar(new File([], 'a.png'))).rejects.toThrow(
      '文件太大',
    )

    expect(useProfileStore.getState().error).toContain('文件太大')
    expect(loggedIn()).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
  })
})

/**
 * 本文件曾有一个 `describe('profileStore.changePassword')`，随该 action 一起删除。
 *
 * 它测的是一条**没有调用方**的路径：两个 UI 都直接 `await profileApi.changePassword`
 * （`ProfilePage.tsx:99` / `ProfileModal.tsx:404`），从不经过本 store。删除的理由写在
 * `profileStore.ts` 顶部「这里为什么没有 changePassword」。
 *
 * 它原本声称钉住的两件事，现在钉在真实路径上：
 * - 「旧密码错误不导致登出」→ `profile/api/__tests__/profile.test.ts` 的
 *   「旧密码错误不刷新、不重发、不轮换 token」（打的是真实 `fetch` 序列）；
 * - 「端点串与白名单一致」→ 同文件「端点字段可被白名单识别」。
 */

/**
 * 头像上传成功后写回 store 的那一步。
 *
 * confirm 的响应字段叫 **`file_url`**（`个人资料管理.md:396-409`）；旧的 `avatar_url`
 * 随 `POST /api/profile/avatar` 一起在 2026-08-28 删掉了。本 action 此前解构的正是
 * 那个不再存在的名字——上传"成功"，`user_avatar_url` 被写成 `undefined`。
 */
describe('profileStore.uploadAvatar 成功路径', () => {
  const AVATAR_URL = 'https://api.huanvae.cn/avatars/u1.png?t=1706000000'
  const PROFILE = makeProfile({ user_avatar_url: AVATAR_URL })

  it('把 confirm 的 file_url 写进 user_avatar_url（不是已删除的 avatar_url）', async () => {
    useProfileStore.setState({ profile: PROFILE })
    vi.spyOn(profileApi, 'uploadAvatar').mockResolvedValue({
      file_url: 'https://api.huanvae.cn/avatars/u1.png?t=1706000099',
      file_key: 'u1.png',
    })

    await useProfileStore.getState().uploadAvatar(new File(['x'], 'u1.png', { type: 'image/png' }))

    // 改回 `const { avatar_url } = ...` → 这里变成 undefined，本行红。
    expect(useProfileStore.getState().profile?.user_avatar_url).toBe(
      'https://api.huanvae.cn/avatars/u1.png?t=1706000099',
    )
    // 其余字段不受影响，isLoading 收干净。
    expect(useProfileStore.getState().profile?.user_nickname).toBe('测试用户')
    expect(useProfileStore.getState().isLoading).toBe(false)
  })

  it('秒级缓存戳导致 file_url 与旧值逐字相同时，仍然按成功收尾', async () => {
    // doc:413-414：`?t=` 是**秒**级，同一秒内连换两次头像拿到的 URL 逐字相同，
    // 浏览器不会重新加载那张图。客户端能做的是**不把"URL 变了"当成成功判据**——
    // 这里断言 promise 正常 resolve、不写 error、不登出（调用方据此弹成功提示）。
    useProfileStore.setState({ profile: PROFILE })
    vi.spyOn(profileApi, 'uploadAvatar').mockResolvedValue({
      file_url: AVATAR_URL,
      file_key: 'u1.png',
    })

    await expect(
      useProfileStore.getState().uploadAvatar(new File(['x'], 'u1.png', { type: 'image/png' })),
    ).resolves.toBeUndefined()

    expect(useProfileStore.getState().error).toBeNull()
    expect(loggedIn()).toBe(true)
  })
})

/**
 * 落盘数据的迁移。
 *
 * `profile` 是持久化字段，而本批之前落盘的 `user_avatar_url` 是后端原样给的
 * **相对路径**（doc:98）。补基址做在 `getProfile` 出口只管得住新拉的数据；
 * 已经在用户 localStorage 里的那些旧值会在刷新后被 rehydrate 出来直接渲染，
 * 而 `Navigation` 挂在每个 `/app` 页面上，会先于任何 `loadProfile()` 用那个
 * 相对路径发一次注定 404 的图片请求。
 *
 * 用 `persist.rehydrate()` 而不是直接调 `migrateProfilePersist`：这样连
 * 「version 号有没有真的接上」一起测了——只导出函数不改 `version`，迁移永远不会跑。
 */
describe('profileStore 的 persist 迁移（v0 → v1）', () => {
  /**
   * `version: 0` 是**旧数据真实的形状**：本批之前这份 persist 配置没写 `version`，
   * 而 zustand 的默认值就是 `0`，落盘时照样会把 `"version":0` 写进去
   * （`node_modules/zustand/esm/middleware.mjs`，`version: 0` 默认值 + 落盘处
   * `version: options.version`）。迁移的触发条件也在那里：
   * `typeof persisted.version === 'number' && persisted.version !== options.version`
   * ——所以**压根没有 version 键**的 blob 是不会被迁移的，本仓不存在那种形状。
   */
  const seed = (persisted: unknown, version = 0) =>
    localStorage.setItem('profile-storage', JSON.stringify({ state: persisted, version }))

  const baseProfile = {
    user_id: 'u1',
    user_nickname: '测试用户',
    user_email: null,
    user_signature: null,
    admin: 'false',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  }

  it('旧版本落盘的相对路径 rehydrate 后是绝对地址', async () => {
    seed({ profile: { ...baseProfile, user_avatar_url: 'avatars/u1.png?t=1706000000' } })

    await useProfileStore.persist.rehydrate()

    expect(useProfileStore.getState().profile?.user_avatar_url).toBe(
      `${getApiBaseUrl()}/avatars/u1.png?t=1706000000`,
    )
  })

  it('已经是绝对地址的值不被再拼一次（toAbsoluteApiUrl 幂等）', async () => {
    const absolute = `${getApiBaseUrl()}/avatars/u1.png?t=1706000000`
    seed({ profile: { ...baseProfile, user_avatar_url: absolute } })

    await useProfileStore.persist.rehydrate()

    expect(useProfileStore.getState().profile?.user_avatar_url).toBe(absolute)
  })

  it('null 保持 null，其余字段原样', async () => {
    seed({ profile: { ...baseProfile, user_avatar_url: null } })

    await useProfileStore.persist.rehydrate()

    expect(useProfileStore.getState().profile).toEqual({ ...baseProfile, user_avatar_url: null })
  })

  it('迁移函数本身：形状不认识时原样返回，不编造默认 state', () => {
    // 迁移不是校验层。在这里兜一个空 profile 只会把"落盘数据坏了"变成看不见的状态。
    expect(migrateProfilePersist(null)).toBeNull()
    expect(migrateProfilePersist({ profile: null })).toEqual({ profile: null })
    expect(migrateProfilePersist({ profile: { user_avatar_url: 42 } })).toEqual({
      profile: { user_avatar_url: 42 },
    })
  })
})

/**
 * 会话边界的**失败半边**。
 *
 * 三个 action 的 catch 里都有 `if (!stillMine()) throw error`，挡的是
 * `settleError` 那条路：它对认证失败会 `silentRedirectToLogin()`（`clearAuth()` +
 * `location.replace('/login')`）。属于**上一场**会话的一次 401 若绕过这道闸落进来，
 * 就是"A 的请求把刚登录的 B 清盘并踢回登录页"。
 *
 * 这一组是本批补的：实测把 `loadProfile` 的 `if (!stillMine()) throw error` 删掉，
 * 全仓 730 条用例**一条都不红**——写入半边（`if (!stillMine()) return`）有
 * `sessionHandoff.test.tsx` 的「loadProfile 在 endSession 之后才返回」盯着，
 * 失败半边此前没有任何人盯。两半必须各有各的用例。
 */
describe('profileStore 的会话边界：失败半边', () => {
  const sessionExpiredError = () => sessionExpired('GET /api/profile')

  it('上一场会话的 401 落地时：不清掉当前会话的凭证、不跳登录页', async () => {
    // A 的会话里发出请求，请求还在飞的时候换人。
    beginSession()
    let reject!: (error: unknown) => void
    vi.spyOn(profileApi, 'getProfile').mockReturnValue(
      new Promise((_resolve, r) => {
        reject = r
      }),
    )
    const inFlight = useProfileStore.getState().loadProfile()

    endSession()
    // B 登录：新的一场会话，凭证是新的。
    beginSession()
    useAuthStore.setState({ isAuthenticated: true })

    reject(sessionExpiredError())
    // 属于死会话的错误照样 reject（调用方仍然会看到失败），只是不再有副作用。
    await expect(inFlight).rejects.toThrow('未认证或 Token 无效')

    // 删掉 `if (!stillMine()) throw error` → settleError 会认出 401 并
    // `silentRedirectToLogin()`，把 B 清盘 + 跳登录页；实测本条停在下面第一行
    // （`expected false to be true`），下一行是同一件事的另一个侧面。
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('正对照：同一场会话里的 401 **确实**会清盘并跳登录页', async () => {
    // 没有这一条，上面那两行在"401 从来不会触发登出"时同样成立——
    // 而那正是这道闸唯一有意义的前提。
    beginSession()
    useAuthStore.setState({ isAuthenticated: true })
    vi.spyOn(profileApi, 'getProfile').mockRejectedValue(sessionExpiredError())

    await expect(useProfileStore.getState().loadProfile()).rejects.toThrow('未认证或 Token 无效')

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })
})

/**
 * `updateProfile` 与 `uploadAvatar` 的**每一道**会话闸，一条用例一道。
 *
 * 上面那组只覆盖了 `loadProfile`，而它的 JSDoc 却写着「三个 action」。实测过：
 * 本组存在之前，`updateProfile` / `uploadAvatar` 里的那四道 `stillMine()` 逐个
 * 注释掉，全仓 740 条用例**一条都不红**——那句概括当时是假的。
 *
 * 现在是五道：`updateProfile` 的读回被挪出 PUT 那个 `try` 之后，
 * 「PUT 落地时已经换人」与「读回落地时已经换人」变成两个不同的时点，各占一道
 * （前者顺带挡住了一次**跨会话发出**的 GET——旧写法那道闸在 GET **之后**，
 * 换人之后照样会拿 B 的凭证去发 A 的读回）。五道各自的变异结果写在各自的用例里。
 *
 * 每条都用「请求还在飞的时候换人」的真实时序（`endSession()` + `beginSession()`），
 * 而不是直接改世代号：`endSession` 会顺带跑 `clearProfile()`，B 的 store 因此是干净的，
 * A 的落地若漏进来就是可见的脏值。
 */
describe('profileStore 的会话边界：updateProfile 与 uploadAvatar 的每一道闸', () => {
  const asB = () => {
    useAuthStore.setState({ isAuthenticated: true })
  }
  const png = () => new File(['x'], 'a.png', { type: 'image/png' })

  it('updateProfile 的 PUT 失败闸：上一场的 401 不清 B 的凭证、不跳登录页', async () => {
    beginSession()
    let rejectPut!: (error: unknown) => void
    vi.spyOn(profileApi, 'updateProfile').mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        rejectPut = reject
      }),
    )
    const inFlight = useProfileStore.getState().updateProfile({ email: 'a@example.com' })

    endSession()
    beginSession()
    asB()

    rejectPut(sessionExpired('PUT /api/profile'))
    // 属于死会话的错误照样 reject，只是不再有副作用。
    await expect(inFlight).rejects.toThrow('未认证或 Token 无效')

    // 删掉这道闸 → `settleError` 认出 401 并 `silentRedirectToLogin()`：
    // 本行停在 `expected false to be true`。
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()

    // 同一场里的正对照：这条 401 **确实**会登出（否则上面两行恒真）。
    vi.spyOn(profileApi, 'updateProfile').mockRejectedValue(sessionExpired('PUT /api/profile'))
    await expect(
      useProfileStore.getState().updateProfile({ email: 'b@example.com' }),
    ).rejects.toThrow()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })

  it('updateProfile 的 PUT 成功闸：换人之后不读回、不把 A 的修改打进 B 的资料', async () => {
    beginSession()
    let resolvePut!: () => void
    vi.spyOn(profileApi, 'updateProfile').mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePut = () => resolve()
      }),
    )
    const getSpy = vi.spyOn(profileApi, 'getProfile').mockResolvedValue(
      makeProfile({ user_nickname: 'A 的资料' }),
    )
    const inFlight = useProfileStore.getState().updateProfile({ allow_search: false })

    endSession()
    beginSession()
    asB()
    useProfileStore.setState({ profile: makeProfile({ user_nickname: 'B', allow_search: true }) })

    resolvePut()
    await inFlight

    // 删掉这道闸 → A 的那次 PUT 会带出一次读回，B 的 profile 被 A 的资料覆盖。
    expect(getSpy).not.toHaveBeenCalled()
    expect(useProfileStore.getState().profile?.user_nickname).toBe('B')
    expect(useProfileStore.getState().profile?.allow_search).toBe(true)

    // 正对照（同一个 spy）：活着的会话里这次读回**确实**会发生。
    vi.spyOn(profileApi, 'updateProfile').mockResolvedValue(undefined)
    await useProfileStore.getState().updateProfile({ allow_search: false })
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('updateProfile 的读回闸：读回落地时已经换人 → 一个字节都不写进 B 的 store', async () => {
    beginSession()
    vi.spyOn(profileApi, 'updateProfile').mockResolvedValue(undefined)
    let resolveGet!: (profile: UserProfile) => void
    vi.spyOn(profileApi, 'getProfile').mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        resolveGet = resolve
      }),
    )
    useProfileStore.setState({ profile: makeProfile({ allow_search: true }) })
    const inFlight = useProfileStore.getState().updateProfile({ allow_search: false })

    // 等 PUT 落地：本地补丁打上了，说明请求已经越过上一道闸，现在停在读回上。
    await vi.waitFor(() =>
      expect(useProfileStore.getState().profile?.allow_search).toBe(false),
    )

    endSession()
    beginSession()
    asB()
    useProfileStore.setState({ profile: makeProfile({ user_nickname: 'B' }) })

    resolveGet(makeProfile({ user_nickname: 'A 的资料' }))
    await inFlight

    // 删掉这道闸 → B 的侧栏（`Navigation` 直接读本 store）挂上 A 的昵称与头像。
    expect(useProfileStore.getState().profile?.user_nickname).toBe('B')
  })

  it('uploadAvatar 的成功闸：A 的 file_url 不写进 B 的资料', async () => {
    beginSession()
    let resolveUpload!: (result: { file_url: string; file_key: string }) => void
    const uploadSpy = vi.spyOn(profileApi, 'uploadAvatar').mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      }),
    )
    useProfileStore.setState({ profile: makeProfile({ user_avatar_url: 'https://x/a.png' }) })
    const inFlight = useProfileStore.getState().uploadAvatar(png())

    endSession()
    beginSession()
    asB()
    useProfileStore.setState({ profile: makeProfile({ user_avatar_url: 'https://x/b.png' }) })

    resolveUpload({ file_url: 'https://x/a-new.png', file_key: 'a.png' })
    await inFlight

    // 删掉这道闸 → B 的头像被换成 A 刚传的那张。
    expect(useProfileStore.getState().profile?.user_avatar_url).toBe('https://x/b.png')

    // 正对照（同一个 spy、同一个返回值）：活着的会话里它**确实**会写进去。
    uploadSpy.mockResolvedValue({ file_url: 'https://x/a-new.png', file_key: 'a.png' })
    await useProfileStore.getState().uploadAvatar(png())
    expect(useProfileStore.getState().profile?.user_avatar_url).toBe('https://x/a-new.png')
  })

  it('uploadAvatar 的失败闸：上一场的 401 不清 B 的凭证、不跳登录页', async () => {
    beginSession()
    let rejectUpload!: (error: unknown) => void
    vi.spyOn(profileApi, 'uploadAvatar').mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectUpload = reject
      }),
    )
    const inFlight = useProfileStore.getState().uploadAvatar(png())

    endSession()
    beginSession()
    asB()

    rejectUpload(sessionExpired('GET /api/profile'))
    await expect(inFlight).rejects.toThrow('未认证或 Token 无效')

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()

    // 正对照：同一场会话里的同一个错误**确实**会登出。
    vi.spyOn(profileApi, 'uploadAvatar').mockRejectedValue(sessionExpired('GET /api/profile'))
    await expect(useProfileStore.getState().uploadAvatar(png())).rejects.toThrow()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })
})

/**
 * `resetBackground`（`DELETE /api/profile/background`，`个人资料管理.md:458-492`）。
 *
 * 三件事在这一组里被钉住：
 * 1. 写进 store 的是 **`null`**，不是响应里那个 `""`（doc:491「前端不应拼接此值
 *    展示图片」）；
 * 2. DELETE 与随后那次读回**不在同一个 `try`** 里——读回失败不能把一次已提交的
 *    重置说成失败（500 ⇒ 假的「重置失败」，401 ⇒ 无解释登出）；
 * 3. 两道会话闸都在（`set()` 之前、`settleError` 之前）。
 */
describe('profileStore.resetBackground', () => {
  const withBackground = () =>
    makeProfile({ background_url: 'https://x/cover.png', updated_at: '2026-01-02T00:00:00Z' })

  it('成功后 background_url 变成 null，并拉齐其余字段', async () => {
    vi.spyOn(profileApi, 'resetBackground').mockResolvedValue(undefined)
    vi.spyOn(profileApi, 'getProfile').mockResolvedValue(
      makeProfile({ background_url: null, updated_at: '2026-02-02T00:00:00Z' }),
    )
    useProfileStore.setState({ profile: withBackground() })

    await useProfileStore.getState().resetBackground()

    expect(useProfileStore.getState().profile?.background_url).toBeNull()
    // 读回把 `updated_at` 之类这次没改的字段拉齐了。
    expect(useProfileStore.getState().profile?.updated_at).toBe('2026-02-02T00:00:00Z')
    expect(useProfileStore.getState().error).toBeNull()
    expect(useProfileStore.getState().isLoading).toBe(false)
  })

  it('🔴 写进去的是 null，不是 `""`——空串**不**是"默认封面"的合法内部表示', async () => {
    // doc:482 的响应体里 `background_url` 恒为 `""`，doc:491 逐字「前端不应拼接
    // 此值展示图片」。`profileApi.resetBackground` 返回 `void`，所以那个 `""`
    // 连出 api 层都不会；本条盯住 store 这一侧也没有人把它接回来。
    // 把 action 改成 `{ ...current, background_url: '' }` → 本行红。
    vi.spyOn(profileApi, 'resetBackground').mockResolvedValue(undefined)
    // 读回也挂掉：确保断言看的是**本 action 自己写进去的那个值**，
    // 而不是读回带回来的 profile（否则这条断言测的是 getProfile 的返回值）。
    vi.spyOn(profileApi, 'getProfile').mockRejectedValue(new Error('读回失败'))
    useProfileStore.setState({ profile: withBackground() })

    await useProfileStore.getState().resetBackground()

    const value = useProfileStore.getState().profile?.background_url
    expect(value).toBeNull()
    expect(value).not.toBe('')
  })

  it('读回 500：resolve、不写 error，封面已经是默认了', async () => {
    // 把 DELETE 与读回塞回同一个 `try` → 本条红（会 reject 并写 error）。
    vi.spyOn(profileApi, 'resetBackground').mockResolvedValue(undefined)
    vi.spyOn(profileApi, 'getProfile').mockRejectedValue(
      new ApiError('服务器内部错误', { status: 500, code: 500, endpoint: 'GET /api/profile' }),
    )
    useProfileStore.setState({ profile: withBackground() })

    await expect(useProfileStore.getState().resetBackground()).resolves.toBeUndefined()

    expect(useProfileStore.getState().error).toBeNull()
    expect(useProfileStore.getState().isLoading).toBe(false)
    expect(useProfileStore.getState().profile?.background_url).toBeNull()
  })

  it('读回 401：不清凭证、不跳登录页——这次重置已经成功了', async () => {
    vi.spyOn(profileApi, 'resetBackground').mockResolvedValue(undefined)
    vi.spyOn(profileApi, 'getProfile').mockRejectedValue(sessionExpired('GET /api/profile'))
    useProfileStore.setState({ profile: withBackground() })

    await expect(useProfileStore.getState().resetBackground()).resolves.toBeUndefined()

    expect(loggedIn()).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(useProfileStore.getState().profile?.background_url).toBeNull()
  })

  it('正对照：DELETE **本身** 401 时照旧登出并 reject', async () => {
    // 少了这一条，上面两条的 `not.toHaveBeenCalled()` 在"这条路径压根不会登出"
    // 的实现下同样成立。
    vi.spyOn(profileApi, 'resetBackground').mockRejectedValue(
      sessionExpired('DELETE /api/profile/background'),
    )
    useProfileStore.setState({ profile: withBackground() })

    await expect(useProfileStore.getState().resetBackground()).rejects.toThrow('未认证或 Token 无效')

    expect(loggedIn()).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
    // 整份资料被清掉了——不是"重置生效了"，而是 `clearAuth()` 触发 `endSession()`，
    // 本 store 登记给它的 `clearProfile()` 把内存那一份归零（见文件底部的
    // `registerSessionReset`）。写清楚免得下一个人把这个 `null` 读成"封面被重置了"。
    expect(useProfileStore.getState().profile).toBeNull()
  })

  it('DELETE 失败（非认证）时封面原封不动', async () => {
    // 上一条因为登出把整份资料清空了，看不出"失败不动封面"。这一条补上：
    // 500 不触发登出，profile 还在，封面必须还是原来那张。
    vi.spyOn(profileApi, 'resetBackground').mockRejectedValue(
      new ApiError('数据库写入失败', {
        status: 500,
        code: 500,
        endpoint: 'DELETE /api/profile/background',
      }),
    )
    useProfileStore.setState({ profile: withBackground() })

    await expect(useProfileStore.getState().resetBackground()).rejects.toThrow()

    expect(useProfileStore.getState().profile?.background_url).toBe('https://x/cover.png')
  })

  it('DELETE 500：写 store.error 并 reject，不登出', async () => {
    vi.spyOn(profileApi, 'resetBackground').mockRejectedValue(
      new ApiError('数据库写入失败', {
        status: 500,
        code: 500,
        endpoint: 'DELETE /api/profile/background',
      }),
    )
    useProfileStore.setState({ profile: withBackground() })

    await expect(useProfileStore.getState().resetBackground()).rejects.toThrow('数据库写入失败')

    expect(useProfileStore.getState().error).toBe('数据库写入失败')
    expect(useProfileStore.getState().isLoading).toBe(false)
    expect(loggedIn()).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
  })
})

describe('profileStore.setBackgroundUrl', () => {
  it('把 confirm 的 file_url 写进 background_url，其余字段一个不动', () => {
    useProfileStore.setState({ profile: makeProfile({ user_nickname: '我', background_url: null }) })

    useProfileStore.getState().setBackgroundUrl('https://x/cover.png')

    expect(useProfileStore.getState().profile?.background_url).toBe('https://x/cover.png')
    expect(useProfileStore.getState().profile?.user_nickname).toBe('我')
  })

  it('null 表示恢复默认封面', () => {
    useProfileStore.setState({ profile: makeProfile({ background_url: 'https://x/cover.png' }) })

    useProfileStore.getState().setBackgroundUrl(null)

    expect(useProfileStore.getState().profile?.background_url).toBeNull()
  })

  it('profile 还是 null 时什么都不做，不凭一个 URL 造半份资料', () => {
    useProfileStore.setState({ profile: null })

    useProfileStore.getState().setBackgroundUrl('https://x/cover.png')

    expect(useProfileStore.getState().profile).toBeNull()
  })
})

/**
 * `resetBackground` 的两道会话闸，与 `updateProfile` / `uploadAvatar` 那一组
 * 逐条同构：一场已经死掉的会话既不能替**当前**这个人清凭证跳登录页，
 * 也不能把它的重置结果写进当前这个人的资料。
 */
describe('profileStore 的会话边界：resetBackground 的每一道闸', () => {
  const asB = () => {
    useAuthStore.setState({ isAuthenticated: true })
  }

  it('DELETE 失败闸：上一场的 401 不清 B 的凭证、不跳登录页', async () => {
    beginSession()
    let rejectDelete!: (error: unknown) => void
    vi.spyOn(profileApi, 'resetBackground').mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        rejectDelete = reject
      }),
    )
    const inFlight = useProfileStore.getState().resetBackground()

    endSession()
    beginSession()
    asB()

    rejectDelete(sessionExpired('DELETE /api/profile/background'))
    // 属于死会话的错误照样 reject，只是不再有副作用。
    await expect(inFlight).rejects.toThrow('未认证或 Token 无效')

    // 删掉 `settleError` 前面那道闸 → `silentRedirectToLogin()` 执行，
    // 本行停在 `expected false to be true`。
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()

    // 同一场里的正对照：这条 401 **确实**会登出（否则上面两行恒真）。
    vi.spyOn(profileApi, 'resetBackground').mockRejectedValue(
      sessionExpired('DELETE /api/profile/background'),
    )
    await expect(useProfileStore.getState().resetBackground()).rejects.toThrow()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })

  it('DELETE 成功闸：换人之后不读回、不把 A 的重置打进 B 的封面', async () => {
    beginSession()
    let resolveDelete!: () => void
    vi.spyOn(profileApi, 'resetBackground').mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = () => resolve()
      }),
    )
    const getSpy = vi
      .spyOn(profileApi, 'getProfile')
      .mockResolvedValue(makeProfile({ user_nickname: 'A 的资料' }))
    const inFlight = useProfileStore.getState().resetBackground()

    endSession()
    beginSession()
    asB()
    useProfileStore.setState({
      profile: makeProfile({ user_nickname: 'B', background_url: 'https://x/b-cover.png' }),
    })

    resolveDelete()
    await inFlight

    // 删掉 `set()` 前面那道闸 → B 的封面被 A 的那次重置抹掉，还会多打一次读回。
    expect(getSpy).not.toHaveBeenCalled()
    expect(useProfileStore.getState().profile?.user_nickname).toBe('B')
    expect(useProfileStore.getState().profile?.background_url).toBe('https://x/b-cover.png')

    // 正对照（同一个 spy）：活着的会话里这次读回**确实**会发生。
    vi.spyOn(profileApi, 'resetBackground').mockResolvedValue(undefined)
    await useProfileStore.getState().resetBackground()
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('读回闸：读回落地时已经换人 → 一个字节都不写进 B 的 store', async () => {
    beginSession()
    vi.spyOn(profileApi, 'resetBackground').mockResolvedValue(undefined)
    let resolveGet!: (profile: UserProfile) => void
    vi.spyOn(profileApi, 'getProfile').mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        resolveGet = resolve
      }),
    )
    useProfileStore.setState({ profile: makeProfile({ background_url: 'https://x/a-cover.png' }) })
    const inFlight = useProfileStore.getState().resetBackground()

    // 等 DELETE 落地：本地补丁打上了，说明请求已经越过上一道闸，现在停在读回上。
    await vi.waitFor(() =>
      expect(useProfileStore.getState().profile?.background_url).toBeNull(),
    )

    endSession()
    beginSession()
    asB()
    useProfileStore.setState({ profile: makeProfile({ user_nickname: 'B' }) })

    resolveGet(makeProfile({ user_nickname: 'A 的资料' }))
    await inFlight

    expect(useProfileStore.getState().profile?.user_nickname).toBe('B')
  })
})
