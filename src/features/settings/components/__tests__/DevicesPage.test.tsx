import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import Devices from '../DevicesPage'

/**
 * 组件级验证：只 stub 全局 fetch，**不 mock `@/features/auth/api/auth`**。
 * mock 掉 authApi 就等于把要验证的解包逻辑整段跳过，测了等于没测——
 * 这里要证明的恰恰是"响应信封 → 屏幕上出现设备条目"这条完整链路。
 *
 * use-toast 是被 mock 的，但它不在解包路径上，只是用来观察失败是否真的可见。
 */

// vi.mock 会被提升到文件顶部，工厂里不能引用模块级变量——用 vi.hoisted 显式提升。
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const DEVICES = [
  {
    device_id: 'd1',
    device_info: 'Mozilla/5.0 (Macintosh) Chrome/140',
    ip_address: '10.0.0.1',
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    is_current: true,
  },
  {
    device_id: 'd2',
    device_info: 'Mozilla/5.0 (Windows NT 10.0) Firefox/141',
    ip_address: '10.0.0.2',
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    is_current: false,
  },
]

let fetchMock: ReturnType<typeof vi.fn>

const renderPage = () =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <Devices /> }], { initialEntries: ['/app/settings/devices'] })} />)

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  // 会话制下 fetchWithAuth 不再读 token/校验过期——同源 cookie 自动带上，
  // 这里只需要把 isAuthenticated 摆成"已登录"。
  useAuthStore.setState({ isAuthenticated: true })
  setApiShapeErrorReporter(() => {})
  toastMock.mockClear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('设备管理页', () => {
  it('信封响应会渲染出设备条目，而不是"暂无设备信息"空态', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { devices: DEVICES, total: 2 } }))

    renderPage()

    // "当前设备" 徽章只在 is_current 的条目上渲染；它出现就说明整条链路通了。
    expect(await screen.findByText('当前设备')).toBeInTheDocument()
    expect(screen.getByText('Mac Chrome')).toBeInTheDocument()
    expect(screen.getByText('Firefox 浏览器')).toBeInTheDocument()
    expect(screen.queryByText('暂无设备信息')).toBeNull()
    // 撤销/退出按钮必须真的渲染出来——空列表下这两个按钮压根不存在，
    // 也就是说这个安全功能整块消失过半年。
    expect(screen.getByText('退出登录')).toBeInTheDocument()
    expect(screen.getByText('移除')).toBeInTheDocument()
  })

  it('响应形状不对时弹出可见的错误提示，而不是安静地显示空态', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: {} }))

    renderPage()

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '加载失败', variant: 'destructive' })),
    )
  })

  it('某条设备缺少 is_current 时加载失败，绝不把它悄悄当成"不是当前设备"', async () => {
    // require: ['devices','total'] 只保护顶层字段，保护不到数组元素内部；
    // 这里模拟的正是"当前设备"那条记录漏了 is_current 的情况——如果代码用
    // `?? false` 兜底，这条本该显示"当前设备"徽章的记录会被误判成"别人的设备"，
    // 用户可能因此把自己正在用的会话当成陌生设备撤销掉。
    const deviceMissingIsCurrent = {
      device_id: 'd1',
      device_info: 'Mozilla/5.0 (Macintosh) Chrome/140',
      ip_address: '10.0.0.1',
      last_active_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      // 故意不写 is_current
    }
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { devices: [deviceMissingIsCurrent, DEVICES[1]], total: 2 } }),
    )

    renderPage()

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '加载失败', variant: 'destructive' })),
    )
    // 关键断言：这条设备不能被渲染出来（尤其不能渲染成"不是当前设备"的样子）。
    expect(screen.queryByText('当前设备')).toBeNull()
    expect(screen.queryByText('Mac Chrome')).toBeNull()
  })

  /**
   * 撤销当前设备 = 登出，必须真的走 authStore.logout()（打 BFF 的
   * /api/auth/logout，由 BFF 删会话、清 cookie、关该会话的 WS）。
   *
   * 变异实测：把 DevicesPage 里的 `await logout()` 改回 `clearAuth()`，
   * 本条红——`clearAuth()` 只清本地 state，一个字节都不会打到 /api/auth/logout，
   * 断言里的 `some(url === '/api/auth/logout')` 永远是 false。只清本地的话
   * cookie 还在，刷新页面就又登回去了，这正是这条用例要钉住的。
   */
  it('撤销当前设备会打 /api/auth/logout，不是只清本地 state', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ success: true, code: 200, data: { devices: DEVICES, total: 2 } }))
      .mockResolvedValueOnce(ok({ success: true, code: 200 })) // DELETE /api/auth/devices/d1
      .mockResolvedValueOnce(ok({ success: true, code: 200 })) // POST /api/auth/logout

    renderPage()
    await screen.findByText('当前设备')

    await userEvent.click(screen.getByText('退出登录'))
    await userEvent.click(await screen.findByRole('button', { name: '确认' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/auth/logout')).toBe(true),
    )
    // 正对照：真的是 POST（logout 的 fetch 用的是 POST），不是随便什么请求
    // 命中了这个 URL 字符串。
    const logoutCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/auth/logout')
    expect((logoutCall?.[1] as RequestInit | undefined)?.method).toBe('POST')
  })
})
