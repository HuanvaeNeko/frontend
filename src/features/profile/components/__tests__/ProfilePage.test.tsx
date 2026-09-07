import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { useProfileStore } from '../../store/profileStore'
import ProfilePage from '../ProfilePage'

/**
 * 消费端的诚实性：**被后端拒绝的编辑，屏幕上不能出现「成功」。**
 *
 * 这条链路修复前是这样断的：
 * `PUT /api/profile` 返回 400，文案 `Validation error: email: Invalid email format`
 * → 旧 `isAuthError` 靠子串匹配命中 `invalid` → `updateProfile` 走认证分支
 * `return`（不是 throw）→ promise resolve → `handleSubmit` 里
 * `await updateProfile(...)` 后面那句 `toast({title:'成功'})` 照弹，
 * 同一刻 `clearAuth()` + 跳登录页已经发生。
 *
 * 所以只 stub 全局 fetch，**不 mock store、不 mock profileApi**：要验的正是
 * 「400 响应 → 屏幕上出现失败提示、且不出现成功提示」这条完整链路。
 * use-toast 被 mock 只是为了观察，它不在链路上。
 */

// vi.mock 会被提升到文件顶部，工厂里不能引用模块级变量——用 vi.hoisted 显式提升。
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

const PROFILE_BASE = `${getApiBaseUrl()}/api/profile`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const PROFILE_DTO = {
  user_id: 'u1',
  user_nickname: '测试用户',
  user_email: 'old@example.com',
  user_signature: '签名',
  user_avatar_url: null,
  admin: 'false',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

let fetchMock: ReturnType<typeof vi.fn>

const renderPage = () =>
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '*', element: <ProfilePage /> }], {
        initialEntries: ['/app/profile'],
      })}
    />,
  )

beforeEach(() => {
  localStorage.clear()
  toastMock.mockClear()
  useAuthStore.setState({
    accessToken: 'AT',
    // refreshToken 置空：本文件不测刷新流程，留着会在 401 分支多打一次 /refresh。
    refreshToken: null,
    isAuthenticated: true,
    tokenExpiry: Date.now() + 3600_000,
  })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProfilePage 保存个人资料', () => {
  it('后端 400 校验失败时只弹失败提示，绝不弹「成功」', async () => {
    fetchMock
      // 挂载时的 loadProfile
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))
      // 提交：文档 :213 的错误响应，逐字。
      .mockResolvedValueOnce(json({ error: 'Validation error: email: Invalid email format' }, 400))

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: '更新失败',
        description: 'Validation error: email: Invalid email format',
        variant: 'destructive',
      }),
    )
    // 这一行是本条用例的正身：把成功 toast 挪出 try（变成无条件）→ 立刻红。
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
  })

  it('后端 401 会话失效时同样不弹「成功」', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))
      .mockResolvedValueOnce(json({ error: '未认证或 Token 无效' }, 401))

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    // 认证分支跳登录页之后**依然 reject**；把 profileStore 的 `throw error`
    // 改回 `return` → promise resolve → 弹的是「成功」，本条两行断言都红。
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })),
    )
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
  })

  it('后端接受时才弹「成功」', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))
      // PUT 成功
      .mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))
      // updateProfile 成功后会重新拉一次完整资料
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '个人资料已更新' }),
    )
    expect(fetchMock.mock.calls[1][0]).toBe(PROFILE_BASE)
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
  })
})
