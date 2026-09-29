import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { beginSession } from '@/lib/sessionScope'
import { AddFriendDialog } from '../AddFriendDialog'

/**
 * 「添加好友」对话框：输入对方用户 ID（+ 可选验证消息）→ POST /api/friends/requests。
 * 新壳里原来没有任何入口能打开它（见 ContactsList.test 的说明），这里验它本身能用。
 */
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock('@/i18n/I18nProvider', () => ({ useI18n: () => ({ locale: 'zh-CN', t: (key: string) => key }) }))
vi.mock('framer-motion', async () => {
  const react = await import('react')
  const strip = ({ initial: _i, animate: _a, exit: _e, transition: _t, variants: _v, layout: _l, ...rest }: Record<string, unknown>) => rest
  const passthrough = (tag: string) =>
    react.forwardRef(function MockMotion(props: Record<string, unknown>, ref: React.Ref<unknown>) {
      const { children, ...rest } = strip(props)
      return react.createElement(tag, { ...rest, ref }, children as React.ReactNode)
    })
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  }
})

const envelope = (data: unknown) =>
  new Response(JSON.stringify({ success: true, code: 200, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  beginSession()
  useAuthStore.setState({ user: { user_id: 'alice', nickname: '爱丽丝' }, isAuthenticated: true } as never)
  fetchMock = vi.fn((url: string) => Promise.resolve(envelope(String(url).includes('/requests/sent') ? [] : { message: 'ok' })))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AddFriendDialog', () => {
  it('填对方 ID 与验证消息后发出好友申请，然后关闭', async () => {
    const onClose = vi.fn()
    render(<AddFriendDialog open onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('chat.friendList.enterUserIdPlaceholder'), { target: { value: ' grace ' } })
    fireEvent.change(screen.getByPlaceholderText('chat.friendList.verifyPlaceholder'), { target: { value: '桌游局见过' } })
    fireEvent.click(screen.getByRole('button', { name: 'chat.friendList.sendRequest' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/api/friends/requests') && (init as RequestInit)?.method === 'POST')
    if (!call) throw new Error('没有发出 POST /api/friends/requests')
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ target_user_id: 'grace', reason: '桌游局见过' })
  })

  it('没填 ID 不发请求、不关闭', async () => {
    const onClose = vi.fn()
    render(<AddFriendDialog open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.friendList.sendRequest' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/friends/requests'))).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })
})
