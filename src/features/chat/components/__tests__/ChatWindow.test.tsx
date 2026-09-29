import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Message, messagesApi } from '@/features/chat/api/messages'
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
