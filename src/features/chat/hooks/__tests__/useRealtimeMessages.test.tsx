import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { notifyMessage } from '@/hooks/useNotification'
import { setActiveLocale } from '@/i18n/translate'
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

describe('useRealtimeMessages：卡片更新（WS message_updated，backend-docs messages/好友消息.md:790-821）', () => {
  const card = (text: string) => JSON.stringify({ version: 1, nodes: [{ type: 'text', text }] })
  const deliver = (frame: Record<string, unknown>) => {
    const handlers = useWSStore.getState().messageHandlers.get('message_updated')
    if (!handlers || handlers.size === 0) throw new Error('message_updated 没有处理器')
    for (const handler of handlers) handler(frame)
  }
  const current = () => useChatStore.getState().messages.find((m) => m.message_uuid === 'm-card') as unknown as Record<string, unknown>

  beforeEach(() => {
    useChatStore.setState({
      messages: [{ message_uuid: 'm-card', sender_id: 'weather_bot', receiver_id: 'alice', message_content: card('v2'), message_type: 'card', rev: 2, seq: 3, send_time: '2026-09-29T10:00:00Z' } as never],
    })
  })

  it('rev 更大：换上新内容与新 rev', () => {
    render(<Bridge />)
    deliver({ source_type: 'friend', source_id: 'weather_bot', message_uuid: 'm-card', content: card('v3'), message_type: 'card', rev: 3, seq: 9, timestamp: '2026-09-29T10:05:00Z' })
    expect(current().message_content).toBe(card('v3'))
    expect(current().rev).toBe(3)
  })

  it('rev 不比手里的大（乱序到达的旧版本）：不回退', () => {
    render(<Bridge />)
    deliver({ source_type: 'friend', source_id: 'weather_bot', message_uuid: 'm-card', content: card('v1'), message_type: 'card', rev: 1, seq: 8, timestamp: '2026-09-29T10:04:00Z' })
    expect(current().message_content).toBe(card('v2'))
    expect(current().rev).toBe(2)
  })
})

/**
 * 通知文案（notify.*）在**收到帧的那一刻**按当前界面语言取。原来标题、正文、「某人」兜底、
 * 群消息标题「群聊 · 昵称」、撤回占位全写死中文，英文界面照样弹中文通知。
 */
describe('useRealtimeMessages：通知文案跟随界面语言', () => {
  const deliver = (type: string, frame: Record<string, unknown>) => {
    const handlers = useWSStore.getState().messageHandlers.get(type)
    if (!handlers || handlers.size === 0) throw new Error(`${type} 没有处理器`)
    for (const handler of handlers) handler(frame)
  }
  const notified = () => vi.mocked(notifyMessage).mock.calls.map(([title, body]) => ({ title, body }))

  beforeEach(() => {
    vi.mocked(notifyMessage).mockClear()
    // 这几个处理器顺手会重拉列表：换成桩，不真发请求
    useFriendsStore.setState({ loadPendingRequests: vi.fn().mockResolvedValue(undefined), loadFriends: vi.fn().mockResolvedValue(undefined) })
    useGroupStore.setState({ loadMyGroups: vi.fn().mockResolvedValue(undefined) })
  })

  afterEach(() => setActiveLocale('zh-CN'))

  it('中文（默认语言）：措辞与改成 key 之前逐字一致，含「某人」兜底', () => {
    render(<Bridge />)

    deliver('system_notification', { notification_type: 'friend_request', data: { from_nickname: '张三' } })
    deliver('system_notification', { notification_type: 'group_invite', data: { inviter_nickname: '李四', group_name: '徒步群' } })
    deliver('system_notification', { notification_type: 'owner_transferred', data: { group_name: '徒步群' } })

    expect(notified()).toEqual([
      { title: '好友请求', body: '张三 请求添加你为好友' },
      { title: '群邀请', body: '李四 邀请你加入群聊 徒步群' },
      { title: '群主已转让', body: '群聊 徒步群 的群主已转让给 某人' },
    ])
  })

  it('英文：系统通知、群消息标题、「某人」兜底、撤回占位全是英文，一个汉字都没有', () => {
    setActiveLocale('en-US')
    useChatStore.setState({
      messages: [{ message_uuid: 'm-old', sender_id: 'carol', receiver_id: 'g1', message_content: 'soon gone', message_type: 'text', seq: 1, send_time: '2026-09-29T09:00:00Z' } as never],
    })
    render(<Bridge />)

    deliver('system_notification', { notification_type: 'friend_request', data: { from_nickname: 'Carol' } })
    deliver('system_notification', { notification_type: 'group_invite', data: { inviter_nickname: 'Dave', group_name: 'Hiking' } })
    deliver('system_notification', { notification_type: 'friend_request_rejected', data: {} })
    deliver('system_notification', { notification_type: 'group_disbanded', data: { group_id: 'g9', group_name: 'Hiking' } })
    // 另一个群（当前打开的是 g1）来的新消息：会弹通知
    deliver('new_message', {
      source_type: 'group', source_id: 'g2', message_uuid: 'm2', sender_id: 'erin', sender_nickname: 'Erin',
      sender_avatar_url: '', content: 'hi there', message_type: 'text', seq: 2, timestamp: '2026-09-29T10:00:00Z',
    })
    deliver('message_recalled', { source_type: 'group', source_id: 'g1', message_uuid: 'm-old' })

    expect(notified()).toEqual([
      { title: 'Friend request', body: 'Carol wants to add you as a friend' },
      { title: 'Group invitation', body: 'Dave invited you to join the group Hiking' },
      { title: 'Friend request declined', body: 'Someone declined your friend request' },
      { title: 'Group disbanded', body: 'The group Hiking was disbanded' },
      { title: 'Group · Erin', body: 'hi there' },
    ])
    expect(JSON.stringify(notified())).not.toMatch(/[\u4e00-\u9fff]/)

    const recalled = useChatStore.getState().messages.find((m) => m.message_uuid === 'm-old') as unknown as Record<string, unknown>
    expect(recalled.is_recalled).toBe(true)
    expect(recalled.message_content).toBe('This message was recalled')
  })
})
