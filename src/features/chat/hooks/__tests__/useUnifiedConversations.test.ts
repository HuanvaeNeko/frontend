import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import type { Friend } from '@/features/chat/api/friends'
import type { MyGroup } from '@/features/chat/api/groups'
import { usePinnedStore } from '@/features/chat/store/pinnedStore'
import { sortConversations, useUnifiedConversations, type UnifiedConversation } from '../useUnifiedConversations'

const friend = (id: string, extra: Partial<Friend> = {}): Friend => ({
  friend_id: id, friend_nickname: `${id}-昵称`, friend_avatar_url: null, add_time: '2026-01-01T00:00:00Z',
  approve_reason: null, friend_remark: null, is_blacklisted: false, is_special_care: false, ...extra,
})
const group = (id: string, extra: Partial<MyGroup> = {}): MyGroup => ({
  group_id: id, group_name: `群${id}`, group_avatar_url: null, role: 'member', unread_count: null,
  last_message_content: null, last_message_time: null, ...extra,
} as MyGroup)

const conv = (id: string, extra: Partial<UnifiedConversation> = {}): UnifiedConversation => ({
  id, kind: id.startsWith('f-') ? 'friend' : 'group', targetId: id.slice(2), name: id, avatarUrl: null,
  preview: null, lastMessageTime: null, unreadCount: 0, pinned: false, blacklisted: false, ...extra,
})

describe('sortConversations（APP conversationSort：置顶优先 → 时间倒序 → id 稳定）', () => {
  it('置顶在前，同组按最后消息时间倒序，无时间的排最后', () => {
    const sorted = sortConversations([
      conv('f-old', { lastMessageTime: '2026-09-01T00:00:00Z' }),
      conv('g-pinned', { pinned: true, lastMessageTime: '2026-08-01T00:00:00Z' }),
      conv('f-new', { lastMessageTime: '2026-09-10T00:00:00Z' }),
      conv('f-none'),
    ])
    expect(sorted.map((c) => c.id)).toEqual(['g-pinned', 'f-new', 'f-old', 'f-none'])
  })
  it('时间相同按 id 稳定排序（不依赖输入顺序）', () => {
    const t = '2026-09-10T00:00:00Z'
    const a = sortConversations([conv('f-b', { lastMessageTime: t }), conv('f-a', { lastMessageTime: t })])
    const b = sortConversations([conv('f-a', { lastMessageTime: t }), conv('f-b', { lastMessageTime: t })])
    expect(a.map((c) => c.id)).toEqual(['f-a', 'f-b'])
    expect(b.map((c) => c.id)).toEqual(['f-a', 'f-b'])
  })
})

describe('useUnifiedConversations：friends × groups × unreadSummary × pinned', () => {
  beforeEach(() => {
    // hasLoaded:true——本文件大多数用例关心的是"合并/排序对不对"，不是冷启动的
    // loading 态；那一档单独在下面 describe 里用正对照钉住（finding #2）。
    useFriendsStore.setState({ friends: [], isLoading: false, hasLoaded: true })
    useGroupStore.setState({ myGroups: [], isLoading: false, hasLoaded: true })
    useChatStore.setState({ unreadSummary: null })
    usePinnedStore.getState().reset()
  })

  it('好友与群合并为一张表，预览/时间/未读来自 unreadSummary，名字用备注优先', () => {
    useFriendsStore.setState({ friends: [friend('alice', { friend_remark: '小爱' })] })
    useGroupStore.setState({ myGroups: [group('g1', { group_name: '读书会' })] })
    useChatStore.setState({
      unreadSummary: {
        total_count: 5,
        friend_unreads: [{ friend_id: 'alice', unread_count: 2, last_message_preview: '在吗', last_message_time: '2026-09-10T08:00:00Z' }],
        group_unreads: [{ group_id: 'g1', unread_count: 3, last_message_preview: '张三: 明天见', last_message_time: '2026-09-10T09:00:00Z' }],
      },
    })
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.status).toBe('ready')
    expect(result.current.conversations.map((c) => c.id)).toEqual(['g-g1', 'f-alice'])
    const alice = result.current.conversations[1]
    expect(alice).toMatchObject({ kind: 'friend', targetId: 'alice', name: '小爱', preview: '在吗', unreadCount: 2, pinned: false })
    expect(result.current.conversations[0]).toMatchObject({ kind: 'group', name: '读书会', preview: '张三: 明天见', unreadCount: 3 })
  })

  it('没有 unreadSummary 时也能列出（预览为 null、未读 0），群的最后消息回退到 myGroups 自带字段', () => {
    useFriendsStore.setState({ friends: [friend('bob')] })
    useGroupStore.setState({ myGroups: [group('g2', { last_message_content: '回退预览', last_message_time: '2026-09-09T00:00:00Z', unread_count: 4 })] })
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.conversations.find((c) => c.id === 'f-bob')).toMatchObject({ preview: null, unreadCount: 0, name: 'bob-昵称' })
    expect(result.current.conversations.find((c) => c.id === 'g-g2')).toMatchObject({ preview: '回退预览', unreadCount: 4 })
  })

  it('置顶来自 pinnedStore 并影响排序', () => {
    useFriendsStore.setState({ friends: [friend('a'), friend('b')] })
    useChatStore.setState({ unreadSummary: { total_count: 0, friend_unreads: [
      { friend_id: 'a', unread_count: 0, last_message_preview: null, last_message_time: '2026-09-10T00:00:00Z' },
      { friend_id: 'b', unread_count: 0, last_message_preview: null, last_message_time: '2026-09-01T00:00:00Z' },
    ], group_unreads: [] } })
    usePinnedStore.getState().toggle('f-b')
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.conversations.map((c) => c.id)).toEqual(['f-b', 'f-a'])
    expect(result.current.conversations[0].pinned).toBe(true)
  })

  it('两个 store 任一还在首轮加载时 status 为 loading', () => {
    useFriendsStore.setState({ isLoading: true })
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.status).toBe('loading')
  })

  it('群 store 还在首轮加载（friends 早已问完）时 status 也是 loading', () => {
    // 与上一条对称：只让 groupStore.isLoading 为真，friendsStore 保持 beforeEach
    // 里已经问完的状态——证明 loading 不是只看 friendsStore 一侧。
    useGroupStore.setState({ isLoading: true })
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.status).toBe('loading')
  })

  it('从没问过后端（hasLoaded:false）时 status 为 loading，即使 isLoading 已经是 false（终审 finding #2）', () => {
    // 冷启动首帧：两个 store 都是 isLoading:false / hasLoaded:false / 空数组——
    // AppShellLayout 的挂载 effect 要等首轮渲染跑完才会触发 loadFriends()/loadMyGroups()，
    // 那一帧如果只看 isLoading 会被判成 ready+空，列表闪一下"还没有会话"。
    useFriendsStore.setState({ friends: [], isLoading: false, hasLoaded: false })
    useGroupStore.setState({ myGroups: [], isLoading: false, hasLoaded: false })
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.status).toBe('loading')
    // 正对照：同一份数据，两个 store 都置 hasLoaded:true 后立刻变 ready——
    // 证明刚才的 loading 确实是 hasLoaded 决定的，不是数据本身或别的条件。
    useFriendsStore.setState({ hasLoaded: true })
    useGroupStore.setState({ hasLoaded: true })
    const { result: ready } = renderHook(() => useUnifiedConversations())
    expect(ready.current.status).toBe('ready')
  })

  it('好友 is_blacklisted 映射成 blacklisted（群恒 false）', () => {
    useFriendsStore.setState({ friends: [friend('u1', { is_blacklisted: true }), friend('u2')], hasLoaded: true })
    useGroupStore.setState({ myGroups: [group('g1')], hasLoaded: true })
    const { result } = renderHook(() => useUnifiedConversations())
    const byId = Object.fromEntries(result.current.conversations.map((c) => [c.id, c.blacklisted]))
    expect(byId).toEqual({ 'f-u1': true, 'f-u2': false, 'g-g1': false })
  })
})
