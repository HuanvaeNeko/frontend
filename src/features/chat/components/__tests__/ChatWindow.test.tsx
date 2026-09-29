import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Message, messagesApi } from '@/features/chat/api/messages'
import { storageApi } from '@/api/storage'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useChatStore } from '@/features/chat/store/chatStore'
import ChatWindow from '../ChatWindow'

/**
 * 切会话时，上一个会话还在途的历史请求不能落到新会话的窗口里（串台）。
 *
 * 线上 TTFB 1–2 s：点 A、还没加载完就点 B，是正常操作速度。原实现两处叠加出错：
 * B 的加载被 A 的 `loading` 挡掉（早退）；A 的响应回来后无条件 `setMessages`——
 * 于是标题是 B、消息是 A。
 */

vi.mock('@/i18n/I18nProvider', () => ({ useI18n: () => ({ locale: 'zh-CN', t: (key: string) => key }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
// 打开会话即标记已读会发 WS mark_read——与这里验的历史加载无关
vi.mock('@/features/chat/hooks/useRealtimeMessages', () => ({ setActiveChat: vi.fn() }))
// file-preview 在模块顶层引 react-pdf（pdf.js 要 DOMMatrix）；群管理与本用例无关
vi.mock('@/components/ui/file-preview', () => ({ FilePreview: () => null }))
vi.mock('../sidebar/GroupManagement', () => ({ default: () => null }))
// 消息气泡的进场动画在卸载时被 happy-dom 取消，会抛未处理的 AbortError（同 Sidebar.test.tsx 的说明）
vi.mock('framer-motion', async () => {
  const react = await import('react')
  const strip = ({ initial: _i, animate: _a, exit: _e, transition: _t, variants: _v, layout: _l, whileHover: _h, whileTap: _w, ...rest }: Record<string, unknown>) => rest
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

function textMessage(uuid: string, from: string, to: string, content: string, seq: number): Message {
  return {
    message_uuid: uuid, sender_id: from, receiver_id: to, message_content: content, message_type: 'text',
    file_uuid: null, file_url: null, file_size: null, file_hash: null, filename: null, content_type: null,
    image_width: null, image_height: null, seq, send_time: '2026-09-29T10:00:00Z',
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const bob = { id: 'bob', type: 'friend' as const, name: '鲍勃', unreadCount: 0 }
const carol = { id: 'carol', type: 'friend' as const, name: '卡萝尔', unreadCount: 0 }

beforeEach(() => {
  useAuthStore.setState({ user: { user_id: 'alice', nickname: '爱丽丝' }, isAuthenticated: true } as never)
  useChatStore.setState({ selectedConversation: null, messages: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChatWindow 切会话与在途的历史请求', () => {
  it('A 的历史还在途就切到 B：窗口最终只显示 B 的消息', async () => {
    const bobPage = deferred<{ messages: Message[]; has_more: boolean }>()
    const getMessages = vi.spyOn(messagesApi, 'getMessages').mockImplementation((friendId: string) =>
      friendId === 'bob'
        ? bobPage.promise
        : Promise.resolve({ messages: [textMessage('c1', 'carol', 'alice', '卡萝尔说的话', 1)], has_more: false }),
    )

    act(() => { useChatStore.setState({ selectedConversation: bob }) })
    render(<ChatWindow />)
    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('bob', undefined, 50))

    act(() => { useChatStore.setState({ selectedConversation: carol }) })
    // B 的加载必须真的发出去，不能被 A 的 loading 挡掉
    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('carol', undefined, 50))
    expect(await screen.findByText('卡萝尔说的话')).toBeInTheDocument()

    // A 的响应此时才回来
    await act(async () => {
      bobPage.resolve({ messages: [textMessage('b1', 'bob', 'alice', '鲍勃说的话', 1)], has_more: false })
      await bobPage.promise
    })

    expect(screen.queryByText('鲍勃说的话')).not.toBeInTheDocument()
    expect(screen.getByText('卡萝尔说的话')).toBeInTheDocument()
  })

  it('A 已显示、切到 B 且 B 还在加载：窗口里不再挂着 A 的消息', async () => {
    const carolPage = deferred<{ messages: Message[]; has_more: boolean }>()
    vi.spyOn(messagesApi, 'getMessages').mockImplementation((friendId: string) =>
      friendId === 'bob'
        ? Promise.resolve({ messages: [textMessage('b1', 'bob', 'alice', '鲍勃说的话', 1)], has_more: false })
        : carolPage.promise,
    )

    act(() => { useChatStore.setState({ selectedConversation: bob }) })
    render(<ChatWindow />)
    // 前置：A 的消息确实显示过，下面的「不在」才有意义
    expect(await screen.findByText('鲍勃说的话')).toBeInTheDocument()

    act(() => { useChatStore.setState({ selectedConversation: carol }) })
    await waitFor(() => expect(screen.queryByText('鲍勃说的话')).not.toBeInTheDocument())

    await act(async () => {
      carolPage.resolve({ messages: [textMessage('c1', 'carol', 'alice', '卡萝尔说的话', 1)], has_more: false })
      await carolPage.promise
    })
    expect(await screen.findByText('卡萝尔说的话')).toBeInTheDocument()
  })

  it('A 的「加载更早」还在途就切到 B：A 的旧一页不会拼进 B', async () => {
    const bobOlder = deferred<{ messages: Message[]; has_more: boolean }>()
    vi.spyOn(messagesApi, 'getMessages').mockImplementation((friendId: string, beforeTime?: string) => {
      if (friendId === 'carol') {
        return Promise.resolve({ messages: [textMessage('c1', 'carol', 'alice', '卡萝尔说的话', 1)], has_more: false })
      }
      return beforeTime
        ? bobOlder.promise
        : Promise.resolve({ messages: [textMessage('b2', 'bob', 'alice', '鲍勃新消息', 2)], has_more: true })
    })

    act(() => { useChatStore.setState({ selectedConversation: bob }) })
    render(<ChatWindow />)
    expect(await screen.findByText('鲍勃新消息')).toBeInTheDocument()

    act(() => { screen.getByRole('button', { name: 'chat.window.loadMore' }).click() })
    act(() => { useChatStore.setState({ selectedConversation: carol }) })
    expect(await screen.findByText('卡萝尔说的话')).toBeInTheDocument()

    await act(async () => {
      bobOlder.resolve({ messages: [textMessage('b1', 'bob', 'alice', '鲍勃旧消息', 1)], has_more: false })
      await bobOlder.promise
    })
    expect(screen.queryByText('鲍勃旧消息')).not.toBeInTheDocument()
    expect(screen.getByText('卡萝尔说的话')).toBeInTheDocument()
  })
})

/**
 * 发图片/文件后，自己的会话列表也要更新预览与时间（「[图片]」并按时间排到前面）。
 * 原实现只有文本消息调了 updateLastMessage：发完图片，列表里还是上一条文字、时间停在几天前。
 */
describe('ChatWindow 发文件后更新会话预览', () => {
  it('好友会话里发一张图片：会话预览变成「[图片]」', async () => {
    vi.spyOn(messagesApi, 'getMessages').mockResolvedValue({ messages: [], has_more: false })
    vi.spyOn(storageApi, 'uploadFile').mockResolvedValue({ fileUrl: 'friends-file/conv-alice-carol/images/p.png', isInstant: false })
    vi.spyOn(messagesApi, 'sendMessage').mockResolvedValue({ message_uuid: 'm-img', send_time: '2026-09-29T10:00:00Z', seq: 9 })
    // 发出的图片气泡会去取预签名地址：给一个，免得真去 fetch
    vi.spyOn(storageApi, 'getFriendFilePresignedUrl').mockResolvedValue('https://files.test/p.png')
    useChatStore.setState({ unreadSummary: { total_count: 0, friend_unreads: [{ friend_id: 'carol', unread_count: 0, last_message_preview: '那就这么定了', last_message_time: '2026-09-27T04:35:00Z' }], group_unreads: [] } })

    act(() => { useChatStore.setState({ selectedConversation: carol }) })
    const { container } = render(<ChatWindow />)
    await waitFor(() => expect(messagesApi.getMessages).toHaveBeenCalled())

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] } })
    const buttons = await screen.findAllByRole('button')
    fireEvent.click(buttons[buttons.length - 1])

    await waitFor(() => expect(messagesApi.sendMessage).toHaveBeenCalled())
    await waitFor(() => {
      const row = useChatStore.getState().unreadSummary?.friend_unreads.find((u) => u.friend_id === 'carol')
      expect(row?.last_message_preview).toBe('[图片]')
    })
  })
})

/**
 * 删除消息不可恢复（后端只对自己隐藏，但没有撤销），原实现右键「删除」即刻删掉、没有确认。
 */
describe('ChatWindow 删除消息的二次确认', () => {
  it('右键删除先弹确认；取消不删，确认才删', async () => {
    vi.spyOn(messagesApi, 'getMessages').mockResolvedValue({ messages: [textMessage('m1', 'alice', 'carol', '要删的话', 1)], has_more: false })
    const del = vi.spyOn(messagesApi, 'deleteMessage').mockResolvedValue({ success: true, message: 'ok' } as never)

    act(() => { useChatStore.setState({ selectedConversation: carol }) })
    render(<ChatWindow />)

    fireEvent.contextMenu(await screen.findByText('要删的话'))
    fireEvent.click(await screen.findByRole('menuitem', { name: /chat\.window\.delete/ }))
    expect(await screen.findByRole('alertdialog', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /chat\.window\.cancel|取消/ }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(del).not.toHaveBeenCalled()

    fireEvent.contextMenu(screen.getByText('要删的话'))
    fireEvent.click(await screen.findByRole('menuitem', { name: /chat\.window\.delete/ }))
    fireEvent.click(await screen.findByRole('button', { name: /chat\.window\.confirmDeleteAction/ }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('m1'))
  })
})
