import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { usePathname } from '@/lib/navigation'
import { useAuthStore } from '../../store/authStore'
import ProtectedRoute from '../ProtectedRoute'

/**
 * 会话制下 `ProtectedRoute` 的状态机：挂载时若未登录就问一次
 * `GET /api/session`，三条分支各钉一条——
 * - 200：写入登录态，渲染 children；
 * - 401：确认未登录，`router.replace` 跳登录页；
 * - 502：问不到，不是"问到了说没登录"，留在原地、不跳转、也不渲染受保护内容
 *   （后端挂了 ≠ 用户退出了）。
 *
 * 三条都要挡住"没等 `restoreSession` 落地就先跳转"的双跳陷阱：本文件不 mock
 * `restoreSession` 本身，走真实实现 + 真实 fetch mock，这样时序上的 bug
 * （提前跳转 / 从不跳转）才会在这里现出原形，而不是被一个理想化的 mock 掩盖。
 */

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

function PathProbe() {
  return <span data-testid="path">{usePathname()}</span>
}

const renderProtected = (initialPath = '/app/chat') => {
  const router = createMemoryRouter(
    [
      {
        path: '/app/chat',
        element: (
          <>
            <PathProbe />
            <ProtectedRoute>
              <div>受保护的内容</div>
            </ProtectedRoute>
          </>
        ),
      },
      { path: '/app/login', element: <><PathProbe /><div>登录页</div></> },
    ],
    { initialEntries: [initialPath] },
  )
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ user: null, isAuthenticated: false, isRestoring: false, error: null })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProtectedRoute —— 挂载时问一次 GET /api/session', () => {
  it('200：写入登录态并渲染受保护内容，不跳转', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { user: { user_id: 'alice' } } }))

    renderProtected()

    expect(await screen.findByText('受保护的内容')).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent('/app/chat')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('401：确认未登录，router.replace 跳到登录页', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, error: '会话已失效，请重新登录' }, 401))

    renderProtected()

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/app/login'))
    expect(screen.queryByText('受保护的内容')).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('502：后端暂不可用，留在原地、不跳转、也不渲染受保护内容', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 502, error: '后端暂时不可用，请稍后重试' }, 502))

    renderProtected()

    // 等 restoreSession 真正落地（isRestoring 回到 false），给"错误地把 502
    // 当 401 处理"一个足够的机会发生——它会在这一等待之后表现为路径变了。
    await waitFor(() => expect(useAuthStore.getState().isRestoring).toBe(false))
    expect(screen.getByTestId('path')).toHaveTextContent('/app/chat')
    expect(screen.queryByText('受保护的内容')).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().error).toContain('后端暂时不可用')
  })

  it('已经登录时挂载：不发请求，直接渲染受保护内容', async () => {
    useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })

    renderProtected()

    expect(await screen.findByText('受保护的内容')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
