import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { makeProfileWire } from '@/features/profile/api/__tests__/profileFixture'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { AccountSection } from '../AccountSection'

/**
 * 账户与安全分区的真实挂载守卫。
 *
 * 删除 SettingsPage 时连带删掉了 PrivacySettings 的"真的被挂载"回归用例，上一期终审
 * （`bfa796f`）补回过一次——本分区的 PrivacySettings 是这个组件**唯一**的入口。本期
 * Task 8 把它连同 DevicesPage / BlacklistPanel 一起换成了 `vi.mock` 探针，二审终审
 * 指出：探针版能证明"AccountSection 渲染了一个叫 PrivacySettings 的东西"，但结构上
 * 无法证明它**在 AccountSection 里**真的挂得起来——PrivacySettings 自己的测试文件
 * 渲染的是独立的组件，测不到"AccountSection 没提供某个它依赖的 context/provider"、
 * "挂载时抛异常"、或"它的异步加载在这个分区里报错"这几类回归。这里恢复真实挂载：
 * 用一个符合后端 wire 形状的 fetch mock 喂数据，断言真实渲染出来的开关。
 *
 * DevicesPage / BlacklistPanel 继续留探针——它们各自有自己专门的挂载测试
 * （`DevicesPage.test.tsx`、这份文件曾经验证过的黑名单面板），本分区不重复覆盖，
 * 只证明"装进来了"。
 */

vi.mock('@/features/settings/components/DevicesPage', () => ({ default: () => <div data-testid="devices" /> }))
vi.mock('../BlacklistPanel', () => ({ BlacklistPanel: () => <div data-testid="blacklist" /> }))
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const PROFILE_BASE = `${getApiBaseUrl()}/api/profile`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

const mockBackend = (wire: Record<string, unknown>) => {
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
      return json({ success: true, code: 200, data: wire })
    }
    if (url === PROFILE_BASE && init?.method === 'PUT') return json({ message: 'ok' })
    throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
  })
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ isAuthenticated: true })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AccountSection', () => {
  it('四个分区都在：隐私（真实挂载，不是探针）/ 设备 / 黑名单 / 账户；修改密码行链接到 /app/profile', async () => {
    mockBackend(makeProfileWire({ allow_search: true }))

    render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <AccountSection /> }], { initialEntries: ['/app/settings/account'] })} />)

    // PrivacySettings 真实渲染出来的文案——这一行是本条用例存在的全部意义：证明它
    // 在 AccountSection 里真的挂得起来，不是靠 vi.mock 探针"假装"挂了。
    await waitFor(() => expect(screen.getByRole('switch', { name: '允许被搜索' })).toBeTruthy())
    expect(screen.getByTestId('devices')).toBeInTheDocument()
    expect(screen.getByTestId('blacklist')).toBeInTheDocument()
    expect(screen.getByText('黑名单')).toBeInTheDocument()
    expect(screen.getByText('修改密码')).toBeInTheDocument()
    expect(screen.getByText('在资料对话框中修改')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '前往' })).toHaveAttribute('href', '/app/profile')
    expect(screen.getByRole('button', { name: /退出登录/ })).toBeInTheDocument()
  })
})
