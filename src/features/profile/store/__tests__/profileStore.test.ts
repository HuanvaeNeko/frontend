import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { ApiError } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { profileApi } from '../../api/profile'
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

const loggedIn = () => useAuthStore.getState().accessToken !== null

beforeEach(() => {
  localStorage.clear()
  replaceSpy.mockClear()
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: 'RT',
    isAuthenticated: true,
    tokenExpiry: Date.now() + 3600_000,
  })
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
    vi.spyOn(profileApi, 'updateProfile').mockResolvedValue({ message: 'Profile updated successfully' })
    vi.spyOn(profileApi, 'getProfile').mockResolvedValue({
      user_id: 'u1',
      user_nickname: '测试用户',
      user_email: 'new@example.com',
      user_signature: null,
      user_avatar_url: null,
      admin: 'false',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    })

    await useProfileStore.getState().updateProfile({ email: 'new@example.com' })

    expect(useProfileStore.getState().profile?.user_email).toBe('new@example.com')
    expect(useProfileStore.getState().error).toBeNull()
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
  const PROFILE = {
    user_id: 'u1',
    user_nickname: '测试用户',
    user_email: 'a@example.com',
    user_signature: null,
    user_avatar_url: 'https://api.huanvae.cn/avatars/u1.png?t=1706000000',
    admin: 'false',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  }

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
      file_url: PROFILE.user_avatar_url,
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
