import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
import ProtectedRoute from '@/features/auth/components/ProtectedRoute'
import AppInstallPrompt from '../AppInstallPrompt'
import LoadingAnimation from '../LoadingAnimation'
import MaintenancePage from '../MaintenancePage'
import SimpleLoading from '../SimpleLoading'

/**
 * 系统级界面（system.* 以及它们复用的 shell.list.loading / shell.list.retry / home.more / common.close）
 * 在英文界面下说英文。这几个组件原来把中文直接写在 JSX 里，英文界面照样是「加载中...」「重试」。
 *
 * t 按 en-US 字典真查（translateIn），不是回显 key：断言的是用户真正看到的那句英文；
 * 再加一道「容器里一个汉字都没有」，漏改的中文、或英文缺 key 回落成中文，都会在这里红。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { translateIn } = await import('@/i18n/translate')
  return {
    useI18n: () => ({
      locale: 'en-US',
      t: (key: string, params?: Record<string, string | number>) => translateIn('en-US', key, params),
    }),
  }
})

// framer-motion 直通（同 GroupList.test.tsx：happy-dom 的 Animation.cancel 会在卸载时抛没人接的 AbortError）
vi.mock('framer-motion', async () => {
  const react = await import('react')
  type MotionProps = Record<string, unknown> & { children?: unknown }
  const passthrough = (tag: string) =>
    function MockMotionComponent({ initial: _i, animate: _a, exit: _e, variants: _v, transition: _t, layout: _l, children, ...rest }: MotionProps) {
      return react.createElement(tag, rest, children as React.ReactNode)
    }
  return {
    motion: new Proxy({} as Record<string, unknown>, { get: (_target, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: MotionProps) => children,
  }
})

// 安装提示挂载时会去 GitHub 拉版本号：换成桩，不发请求
vi.mock('@/lib/appInstall', () => ({
  RELEASE_PAGE_URL: 'https://example.invalid/releases/latest',
  fetchInstallTargets: vi.fn().mockResolvedValue(null),
}))

const CJK = /[一-鿿]/

const noChinese = (container: HTMLElement) => {
  expect(container.textContent ?? '').not.toMatch(CJK)
  for (const el of container.querySelectorAll('[aria-label]')) {
    expect(el.getAttribute('aria-label') ?? '').not.toMatch(CJK)
  }
}

describe('系统级界面在英文界面下说英文', () => {
  it('SimpleLoading', () => {
    const { container } = render(<SimpleLoading />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    noChinese(container)
  })

  it('LoadingAnimation', () => {
    const { container } = render(<LoadingAnimation />)
    expect(screen.getByText('Preparing your workspace...')).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    noChinese(container)
  })

  it('MaintenancePage：标题、兜底错误、按钮、诊断信息', () => {
    const onRetry = vi.fn()
    const { container, rerender } = render(
      <MaintenancePage error={{ message: '', url: '/api/health', timestamp: '2026-09-29T10:00:00Z', details: 'ECONNREFUSED' }} onRetry={onRetry} />,
    )

    expect(screen.getByText('Service issue')).toBeInTheDocument()
    expect(screen.getByText('Service temporarily unavailable')).toBeInTheDocument()
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reconnect/ }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Show diagnostics/ }))
    expect(screen.getByText('Request URL')).toBeInTheDocument()
    expect(screen.getByText('Time')).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
    noChinese(container)

    rerender(<MaintenancePage error={{ message: 'boom' }} onRetry={onRetry} isRetrying />)
    expect(screen.getByRole('button', { name: /Retrying\.\.\./ })).toBeDisabled()
    noChinese(container)
  })

  it('AppInstallPrompt：卡片、展开项、关闭后的入口按钮', async () => {
    localStorage.clear()
    const { container } = render(<AppInstallPrompt />)

    // 挂载时没被关过（hiddenUntil = 0）就直接弹卡片
    expect(await screen.findByText('Install the Huanvae Chat app')).toBeInTheDocument()
    expect(screen.getByText('Direct')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /More/ }))
    expect(await screen.findByText('Proxy mirror')).toBeInTheDocument()
    expect(screen.getByText('Don’t show for 7 days')).toBeInTheDocument()
    noChinese(container)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(await screen.findByRole('button', { name: /Install app/ })).toBeInTheDocument()
    noChinese(container)
  })
})

describe('ProtectedRoute 的重试界面在英文界面下说英文', () => {
  const realRestoreSession = useAuthStore.getState().restoreSession

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    useAuthStore.setState({ restoreSession: realRestoreSession, error: null, isRestoring: false })
  })

  it('「重试」按钮是 Retry', () => {
    const restoreSession = vi.fn().mockResolvedValue(undefined)
    useAuthStore.setState({ user: null, isAuthenticated: false, isRestoring: false, error: 'Service unavailable', restoreSession })
    const router = createMemoryRouter(
      [{ path: '/app/chat', element: <ProtectedRoute><div>protected</div></ProtectedRoute> }],
      { initialEntries: ['/app/chat'] },
    )
    const { container } = render(<RouterProvider router={router} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    // 挂载时问过一次，点重试再问一次
    expect(restoreSession).toHaveBeenCalledTimes(2)
    noChinese(container)
  })
})
