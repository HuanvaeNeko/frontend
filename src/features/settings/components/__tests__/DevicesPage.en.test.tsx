import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import Devices from '../DevicesPage'

/**
 * 英文界面下设备管理里不能再冒中文。`t` 用真实字典（带参数替换），不是恒等函数——
 * 恒等的 `t` 下「是不是英文」根本断言不出来。
 */

vi.mock('@/i18n/I18nProvider', async () => {
  const { translateIn } = await import('@/i18n/translate')
  const t = (key: string, params?: Record<string, string | number>) => translateIn('en-US', key, params)
  return { useI18n: () => ({ locale: 'en-US' as const, t }) }
})

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

const CJK = /[㐀-鿿＀-￯　-〿]/

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
    device_info: 'Mozilla/5.0 (X11) Firefox/141',
    ip_address: '',
    last_active_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    created_at: new Date().toISOString(),
    is_current: false,
  },
]

/** 正文 + 常见的文字型属性。 */
const visibleText = (): string => {
  const attrs = [...document.body.querySelectorAll('[placeholder], [aria-label], [title]')].flatMap((el) =>
    ['placeholder', 'aria-label', 'title'].map((name) => el.getAttribute(name) ?? ''),
  )
  return [document.body.textContent ?? '', ...attrs].join('\n')
}

let fetchMock: ReturnType<typeof vi.fn>

const renderPage = () =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <Devices /> }], { initialEntries: ['/app/settings/devices'] })} />)

beforeEach(() => {
  localStorage.clear()
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

describe('设备管理页（en-US）', () => {
  it('列表、徽章、相对时间、按钮与确认框都是英文', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { devices: DEVICES, total: 2 } }))

    renderPage()

    expect(await screen.findByText('Current device')).toBeTruthy()
    expect(screen.getByText('Firefox browser')).toBeTruthy()
    expect(screen.getByText('Last active: Just now')).toBeTruthy()
    expect(screen.getByText('Last active: 3h ago')).toBeTruthy()
    // 空 IP 走「未知」
    expect(screen.getByText(/IP: Unknown/)).toBeTruthy()
    expect(screen.getByText('Security tips')).toBeTruthy()
    expect(visibleText()).not.toMatch(CJK)

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByText('Log out of this device?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(visibleText()).not.toMatch(CJK)
  })

  it('某条设备缺 is_current：失败提示是英文', async () => {
    const { is_current: _omitted, ...missing } = DEVICES[0]
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { devices: [missing], total: 1 } }))

    renderPage()

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Failed to load',
        description: 'Device d1 is missing the is_current field; unexpected response shape',
        variant: 'destructive',
      }),
    )
    expect(screen.getByText('Failed to load devices')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(visibleText()).not.toMatch(CJK)
  })
})
