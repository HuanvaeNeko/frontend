import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/store/authStore'
import { setActiveLocale } from '@/i18n/translate'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { makeProfileWire } from '../../api/__tests__/profileFixture'
import { useProfileStore } from '../../store/profileStore'
import ProfileModal from '../ProfileModal'

/**
 * 英文界面下资料对话框里不能再冒中文。
 *
 * `t` 用真实字典（`translateIn('en-US', …)`，带参数替换），不是 `(key) => key`：
 * 恒等的 `t` 下「文案是不是英文」这件事根本断言不出来。组件外的 `translate()` 也一并切到
 * 英文（I18nProvider 在真实页面里就是这么同步的）。
 *
 * 主断言是「整页没有一个汉字」（含 placeholder / aria-label / title 这些不在 textContent 里的
 * 属性）：哪一处漏了 `t()`，写死的中文就会落在这里。资料数据本身刻意用英文，免得把后端数据
 * 误判成漏翻。
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

const PROFILE_BASE = `${getApiBaseUrl()}/api/profile`
const CJK = /[㐀-鿿＀-￯　-〿]/

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const PROFILE_DTO = makeProfileWire({
  user_nickname: 'Alice',
  user_email: 'alice@example.com',
  user_signature: 'Hello there',
})

/** 页面上所有用户看得见（或读屏读得出）的文字：正文 + 常见的文字型属性。 */
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
  toastMock.mockClear()
  useAuthStore.setState({ isAuthenticated: true })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
      return json({ success: true, code: 200, data: PROFILE_DTO })
    }
    throw new Error(`unexpected request: ${init?.method ?? 'GET'} ${url}`)
  })
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

describe('ProfileModal（en-US）', () => {
  it('三个页签都没有中文', async () => {
    render(<ProfileModal isOpen onClose={() => {}} />)
    await screen.findByDisplayValue('alice@example.com')

    // 基本信息页签
    expect(screen.getByRole('dialog', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByText('Manage your personal information')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Save changes/ })).toBeTruthy()
    expect(screen.getByText('Click the avatar to change it')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter a nickname')).toBeTruthy()
    expect(visibleText()).not.toMatch(CJK)

    // 修改密码页签（桌面侧栏与窄屏横排各有一套页签，happy-dom 里两套都在）
    await userEvent.click(screen.getAllByRole('tab', { name: /Change password/ })[0])
    expect(await screen.findByText('Password tips')).toBeTruthy()
    expect(screen.getByText(/New password must be 6–100 characters/)).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter a new password (at least 6 characters)')).toBeTruthy()
    expect(visibleText()).not.toMatch(CJK)

    // 账户信息页签
    await userEvent.click(screen.getAllByRole('tab', { name: /Account/ })[0])
    expect(await screen.findByText('Standard user')).toBeTruthy()
    expect(screen.getByText('Account type')).toBeTruthy()
    expect(visibleText()).not.toMatch(CJK)
  })

  it('两次新密码不一致：toast 是英文', async () => {
    render(<ProfileModal isOpen onClose={() => {}} />)
    await userEvent.click((await screen.findAllByRole('tab', { name: /Change password/ }))[0])

    const inputs = document.querySelectorAll('input[type="password"]')
    fireEvent.change(inputs[0], { target: { value: 'oldpass1' } })
    fireEvent.change(inputs[1], { target: { value: 'NewPass123' } })
    fireEvent.change(inputs[2], { target: { value: 'NewPass124' } })
    await userEvent.click(screen.getAllByRole('button', { name: /Change password/ }).at(-1) as HTMLElement)

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Error',
        description: 'The passwords do not match',
        variant: 'destructive',
      }),
    )
  })
})
