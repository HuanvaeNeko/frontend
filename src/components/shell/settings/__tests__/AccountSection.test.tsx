import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { makeProfileWire } from '@/features/profile/api/__tests__/profileFixture'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { AccountSection } from '../AccountSection'

/**
 * 账户与安全分区的真实挂载守卫。
 *
 * 删除 SettingsPage 时连带删掉了 PrivacySettings 的"真的被挂载"回归用例。
 * 本分区的 PrivacySettings 是这个组件**唯一**的入口；AccountSection 没有
 * 专用测试，sections.test.tsx 只断言"函数形状"，settings.test.tsx 不碰它。
 * 这条用例补上那层"真的渲染，真的能看到内容"的覆盖。
 */

vi.mock('@/features/settings/components/DevicesPage', () => ({
  default: () => <div data-testid="devices-probe" />,
}))

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

describe('AccountSection 的真实挂载', () => {
  it('账户与安全分区真的挂了隐私区', async () => {
    mockBackend(makeProfileWire({ allow_search: true }))

    render(<AccountSection />)

    // PrivacySettings 真实渲染出来的文案
    await waitFor(() => expect(screen.getByRole('switch', { name: '允许被搜索' })).toBeTruthy())
    // DevicesPage 被 probe mock 替代
    expect(screen.getByTestId('devices-probe')).toBeInTheDocument()
    // 退出登录按钮存在
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument()
  })
})
