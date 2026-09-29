import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useWSStore } from '@/store/wsStore'
import { useRealtimeMessages } from '../useRealtimeMessages'

/**
 * 实时 new_message 落进当前会话时要带上发送者：群消息的气泡按 sender_nickname / sender_avatar_url
 * 显示名字与头像。原实现把帧转成私聊形状的 Message，丢掉了这两个字段——实时插入的那一行
 * 没有名字、头像是「U」，刷新后（走 REST 历史）才正常。
 */
vi.mock('@/hooks/useNotification', () => ({ notifyMessage: vi.fn() }))
vi.mock('@/hooks/useSound', () => ({ playMessage: vi.fn() }))

function Bridge() {
  useRealtimeMessages()
  return null
}

function deliverNewMessage(frame: Record<string, unknown>) {
  const handlers = useWSStore.getState().messageHandlers.get('new_message')
  if (!handlers || handlers.size === 0) throw new Error('new_message 没有处理器')
  for (const handler of handlers) handler(frame)
}

beforeEach(() => {
  useAuthStore.setState({ user: { user_id: 'alice', nickname: '爱丽丝' }, isAuthenticated: false } as never)
  useChatStore.setState({
    selectedConversation: { id: 'g1', type: 'group', name: '徒步群', unreadCount: 0 },
    activeChat: { type: 'group', id: 'g1' },
    messages: [],
    unreadSummary: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useRealtimeMessages：实时群消息', () => {
  it('落进当前群会话的消息带着发送者昵称与头像', () => {
    render(<Bridge />)

    deliverNewMessage({
      source_type: 'group', source_id: 'g1', message_uuid: 'm1', sender_id: 'carol',
      sender_nickname: '卡萝尔', sender_avatar_url: 'avatars/carol.png', content: '实时群消息：谁发的？',
      message_type: 'text', seq: 7, timestamp: '2026-09-29T10:00:00Z',
    })

    const last = useChatStore.getState().messages.at(-1) as unknown as Record<string, unknown>
    expect(last.message_content).toBe('实时群消息：谁发的？')
    expect(last.sender_nickname).toBe('卡萝尔')
    expect(last.sender_avatar_url).toBe('avatars/carol.png')
  })
})
