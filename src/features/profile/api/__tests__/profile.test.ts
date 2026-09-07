import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthError } from '@/api/apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { ApiError } from '@/lib/apiEnvelope'
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
    // refreshToken 置空是刻意的：profile.ts 里那份 fetchWithAuth 收到 401 会先去
    // 打一次 /api/auth/refresh 再重试，把 mockResolvedValueOnce 的顺序整体错开。
    // 本文件要钉的是「401 响应 → 带状态码的 ApiError」，不是刷新流程本身。
    refreshToken: null,
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
    fetchMock.mockResolvedValueOnce(json({ error: '未认证或 Token 无效' }, 401))

    const error = await profileApi.updateProfile({ email: 'a@example.com' }).catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(401)
    expect(isAuthError(error as Error)).toBe(true)
  })
})

describe('profileApi.changePassword', () => {
  it('旧密码错误的 401 抛 ApiError，端点字段可被白名单识别，不判成认证错误', async () => {
    // 文档 :329-333：旧密码错误（401）：{ "error": "Old password is incorrect" }
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

describe('profileApi.getProfile', () => {
  it('从信封里取出资料', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    const profile = await profileApi.getProfile()

    expect(profile.user_id).toBe('u1')
    expect(profile.user_nickname).toBe('测试用户')
  })

  it('401 抛 ApiError(401) 并被判成认证错误', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: '未认证或 Token 无效' }, 401))

    const error = await profileApi.getProfile().catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(401)
    expect((error as ApiError).endpoint).toBe('GET /api/profile')
    expect(isAuthError(error as Error)).toBe(true)
  })
})
