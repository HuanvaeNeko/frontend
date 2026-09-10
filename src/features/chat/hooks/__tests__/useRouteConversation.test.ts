import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { useRouteConversation } from '../useRouteConversation'

const friend = { friend_id: 'alice', friend_nickname: '爱丽丝', friend_avatar_url: 'https://cdn.test/a.png', add_time: '', approve_reason: null, friend_remark: '小爱', is_blacklisted: false, is_special_care: false }
const group = { group_id: 'g1', group_name: '读书会', group_avatar_url: null, role: 'member', unread_count: 2, last_message_content: '晚安', last_message_time: '2026-09-10T00:00:00Z' } as never

describe('useRouteConversation：URL → chatStore.selectedConversation', () => {
  beforeEach(() => {
    useFriendsStore.setState({ friends: [friend], isLoading: false, hasLoaded: true })
    useGroupStore.setState({ myGroups: [group], isLoading: false, hasLoaded: true })
    useChatStore.setState({ selectedConversation: null })
  })

  it('f-<uid> 解析成好友会话，形状与旧 FriendList 写入的一致', () => {
    const { result } = renderHook(() => useRouteConversation('f-alice'))
    expect(result.current).toBe('ready')
    expect(useChatStore.getState().selectedConversation).toEqual({
      id: 'alice', type: 'friend', name: '小爱', avatar: 'https://cdn.test/a.png', unreadCount: 0, online: false,
    })
  })

  it('g-<gid> 解析成群会话，带未读与最后消息', () => {
    const { result } = renderHook(() => useRouteConversation('g-g1'))
    expect(result.current).toBe('ready')
    expect(useChatStore.getState().selectedConversation).toMatchObject({ id: 'g1', type: 'group', name: '读书会', unreadCount: 2, lastMessage: '晚安' })
  })

  it('stores 还在加载时是 loading；加载完仍找不到是 missing；两种都不写 store', () => {
    useFriendsStore.setState({ isLoading: true })
    const loading = renderHook(() => useRouteConversation('f-nobody'))
    expect(loading.result.current).toBe('loading')
    loading.unmount()
    useFriendsStore.setState({ isLoading: false })
    const missing = renderHook(() => useRouteConversation('f-nobody'))
    expect(missing.result.current).toBe('missing')
    expect(useChatStore.getState().selectedConversation).toBe(null)
  })

  it('两个 store 都还没加载过（冷启动：isLoading 与 hasLoaded 都是初始值）时是 loading，不写 store；正对照：都标记加载完后同样的渲染变成 missing', () => {
    // 模拟刷新 / 书签打开深链 / 登录后 last_visited_path 恢复：AppShellLayout 的
    // useShellBootstrap effect 还没来得及跑，两个 store 停在 create() 刚返回时的
    // 初始值——hasLoaded 是 false，不是"加载完了但没找到"的 missing。
    useFriendsStore.setState({ isLoading: false, hasLoaded: false })
    useGroupStore.setState({ isLoading: false, hasLoaded: false })
    const cold = renderHook(() => useRouteConversation('f-nobody'))
    expect(cold.result.current).toBe('loading')
    expect(useChatStore.getState().selectedConversation).toBe(null)
    cold.unmount()

    // 正对照：同样的 id、同样找不到，只把两个 store 都补上"已经加载完成"——
    // 证明上面那次 loading 确实是 hasLoaded 在起作用，不是巧合或者别的分支。
    useFriendsStore.setState({ hasLoaded: true })
    useGroupStore.setState({ hasLoaded: true })
    const missing = renderHook(() => useRouteConversation('f-nobody'))
    expect(missing.result.current).toBe('missing')
    expect(useChatStore.getState().selectedConversation).toBe(null)
  })

  it('没有 id 时是 idle 并把 store 清成 null；卸载也清', () => {
    renderHook(() => useRouteConversation('f-alice')).unmount()
    expect(useChatStore.getState().selectedConversation).toBe(null)
    useChatStore.setState({ selectedConversation: { id: 'x', type: 'friend', name: 'x', unreadCount: 0 } })
    const { result } = renderHook(() => useRouteConversation(undefined))
    expect(result.current).toBe('idle')
    expect(useChatStore.getState().selectedConversation).toBe(null)
  })
})
