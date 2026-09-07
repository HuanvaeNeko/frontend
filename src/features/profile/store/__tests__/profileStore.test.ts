import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { profileApi } from '../../api/profile'
import { useProfileStore } from '../profileStore'

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
