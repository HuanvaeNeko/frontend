import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest'
import { fetchWithAuth } from '../authedFetch'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'

/**
 * ⚠️ sessionScopedFetchWithAuth.test.ts 已删除。它钉的是「十份 fetchWithAuth
 * 副本各自带 isLiveSession() 闸门」——那个问题的成因(客户端持有 token、会在
 * 会话边界上刷新与清盘)在 BFF 落地后不存在了：现在客户端不刷新、不持 token，
 * 401 只做「清本地态 + 跳登录」，跨会话最坏结果是多跳一次登录页。
 */

let fetchMock: ReturnType<typeof vi.fn>
let hrefSpy: Mock<(value: string) => void>

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  hrefSpy = vi.fn()
  vi.spyOn(window.location, 'href', 'set').mockImplementation(hrefSpy)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('带 credentials: same-origin，不带 Authorization 头', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
  await fetchWithAuth('/api/friends')
  const init = fetchMock.mock.calls[0][1] as RequestInit
  expect(init.credentials).toBe('same-origin')
  expect(new Headers(init.headers).has('authorization')).toBe(false)
})

it('普通端点 401：clearAuth 并跳登录页', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))
  await fetchWithAuth('/api/friends')
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
  expect(hrefSpy).toHaveBeenCalledWith(ROUTES.auth.login)
})

it('业务 401 端点（改密）401：不 clearAuth、不跳转', async () => {
  useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })
  fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))
  await fetchWithAuth('/api/profile/password', { method: 'PUT' })
  // 正对照在上一条：普通端点确实会跳。所以这里的「没跳」有意义
  expect(useAuthStore.getState().isAuthenticated).toBe(true)
  expect(hrefSpy).not.toHaveBeenCalled()
})

it('**只发一次请求**：没有刷新重试（重试 = 重放非幂等请求）', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))
  await fetchWithAuth('/api/profile', { method: 'PUT', body: '{}' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
