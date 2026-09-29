import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '../chatStore'

/**
 * 侧栏「消息」角标与手机底部条角标读的是 `totalUnreadCount`。
 *
 * 它原来只在 `setUnreadSummary`（WS 连接时的 `unread_summary`）里赋值：之后来新消息
 * 角标不涨，打开会话 / 右键标记已读角标也不清——一直停在连接那一刻的数字。
 */

beforeEach(() => {
  useChatStore.setState({ unreadSummary: null, totalUnreadCount: 0 })
  useChatStore.getState().setUnreadSummary({
    total_count: 3,
    friend_unreads: [{ friend_id: 'bob', unread_count: 3, last_message_preview: '在吗', last_message_time: '2026-09-29T09:00:00Z' }],
    group_unreads: [{ group_id: 'g1', unread_count: 0, last_message_preview: null, last_message_time: null }],
  })
})

describe('totalUnreadCount 跟随未读变化', () => {
  it('前置：连接时的摘要写入角标总数', () => {
    expect(useChatStore.getState().totalUnreadCount).toBe(3)
  })

  it('好友新消息（非当前会话）让总数 +1', () => {
    useChatStore.getState().updateFriendUnread('carol', '新消息', '2026-09-29T10:00:00Z', true)
    expect(useChatStore.getState().totalUnreadCount).toBe(4)
  })

  it('群新消息（非当前会话）让总数 +1', () => {
    useChatStore.getState().updateGroupUnread('g1', '群里的新消息', '2026-09-29T10:00:00Z', true)
    expect(useChatStore.getState().totalUnreadCount).toBe(4)
  })

  it('标记已读把该会话的未读从总数里减掉', () => {
    useChatStore.getState().markRead('friend', 'bob')
    expect(useChatStore.getState().totalUnreadCount).toBe(0)
  })

  it('还没收到过摘要时来第一条新消息，总数是 1', () => {
    useChatStore.setState({ unreadSummary: null, totalUnreadCount: 0 })
    useChatStore.getState().updateFriendUnread('carol', '第一条', '2026-09-29T10:00:00Z', true)
    expect(useChatStore.getState().totalUnreadCount).toBe(1)
  })

  it('还没收到过摘要时来第一条群消息，总数是 1', () => {
    useChatStore.setState({ unreadSummary: null, totalUnreadCount: 0 })
    useChatStore.getState().updateGroupUnread('g2', '第一条', '2026-09-29T10:00:00Z', true)
    expect(useChatStore.getState().totalUnreadCount).toBe(1)
  })
})
