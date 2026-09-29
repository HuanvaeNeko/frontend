import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useAuthStore } from '@/features/auth/store/authStore'
import { makeProfileWire } from '@/features/profile/api/__tests__/profileFixture'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { setActiveLocale } from '@/i18n/translate'
import { getApiBaseUrl } from '@/lib/apiConfig'
import PrivacySettings from '../PrivacySettings'

/**
 * 英文界面下隐私设置里不能再冒中文。`t` 用真实字典（带参数替换），组件外的 `translate()`
 * 也切到英文——读失败那一屏的原文来自 `profileApi` 的兜底文案，走的正是那一条。
 */

vi.mock('@/i18n/I18nProvider', async () => {
  const { translateIn } = await import('@/i18n/translate')
  const t = (key: string, params?: Record<string, string | number>) => translateIn('en-US', key, params)
  return { useI18n: () => ({ locale: 'en-US' as const, t }) }
})

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))

const PROFILE_BASE = `${getApiBaseUrl()}/api/profile`
const CJK = /[㐀-鿿＀-￯　-〿]/

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** 正文 + 常见的文字型属性（开关的名字在 aria-label 上，不在 textContent 里）。 */
const visibleText = (): string => {
  const attrs = [...document.body.querySelectorAll('[placeholder], [aria-label], [title]')].flatMap((el) =>
    ['placeholder', 'aria-label', 'title'].map((name) => el.getAttribute(name) ?? ''),
  )
  return [document.body.textContent ?? '', ...attrs].join('\n')
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActiveLocale('en-US')
  localStorage.clear()
  useAuthStore.setState({ isAuthenticated: true })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  setActiveLocale('zh-CN')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PrivacySettings（en-US）', () => {
  it('开关、下拉与策略标签都是英文', async () => {
    fetchMock.mockImplementation(async (input: string) => {
      if (String(input) !== PROFILE_BASE) throw new Error(`unexpected request: ${String(input)}`)
      return json({
        success: true,
        code: 200,
        data: makeProfileWire({ friend_request_policy: 'auto_reject', group_invite_policy: 'auto_accept' }),
      })
    })

    render(<PrivacySettings />)

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Allow others to find or add me' })).toBeTruthy())
    expect(screen.getByRole('switch', { name: 'Allow adding me by ID / username' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Friend request handling' }).textContent).toBe('Decline automatically')
    expect(screen.getByRole('combobox', { name: 'Group invite handling' }).textContent).toBe('Accept automatically')
    expect(visibleText()).not.toMatch(CJK)
  })

  it('读失败那一屏：组件文案与 profileApi 的兜底原文都是英文', async () => {
    // 空响应体 → readEnvelope 用 profileApi 传进去的兜底文案（translate，跟随生效语言）
    fetchMock.mockImplementation(async (input: string) => {
      if (String(input) !== PROFILE_BASE) throw new Error(`unexpected request: ${String(input)}`)
      return new Response('', { status: 500 })
    })

    render(<PrivacySettings />)

    expect(
      await screen.findByText('Failed to load privacy settings: Failed to load profile (HTTP 500)'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(visibleText()).not.toMatch(CJK)
  })
})
