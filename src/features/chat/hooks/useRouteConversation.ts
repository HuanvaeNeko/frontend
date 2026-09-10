import { useEffect } from 'react'
import { parseConversationId } from '../lib/conversationId'
import { friendDisplayName } from '../lib/friendName'
import { useChatStore } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'

export type RouteConversationStatus = 'idle' | 'loading' | 'ready' | 'missing'

/**
 * URL 里的 :conversationId → `chatStore.selectedConversation`。
 * 这是全仓**唯一**写 `selectedConversation` 的地方（spec §3：URL 是选中态的唯一真值）；
 * 写入的对象形状与迁移前 FriendList / GroupList 点击时写的一致，ChatWindow 不必改。
 */
export function useRouteConversation(conversationId: string | undefined): RouteConversationStatus {
  const friends = useFriendsStore((s) => s.friends)
  const friendsLoading = useFriendsStore((s) => s.isLoading)
  const friendsHasLoaded = useFriendsStore((s) => s.hasLoaded)
  const groups = useGroupStore((s) => s.myGroups)
  const groupsLoading = useGroupStore((s) => s.isLoading)
  const groupsHasLoaded = useGroupStore((s) => s.hasLoaded)
  const setSelectedConversation = useChatStore((s) => s.setSelectedConversation)

  const parsed = conversationId ? parseConversationId(conversationId) : null
  const friend = parsed?.kind === 'friend' ? friends.find((f) => f.friend_id === parsed.userId) : undefined
  const group = parsed?.kind === 'group' ? groups.find((g) => g.group_id === parsed.groupId) : undefined

  let status: RouteConversationStatus
  if (!conversationId) status = 'idle'
  else if (friend || group) status = 'ready'
  // 冷启动（刷新 / 书签打开深链 / 登录后 last_visited_path 恢复）时两个 store 的
  // isLoading 都还是初始的 false——真正发起加载的 `useShellBootstrap` effect
  // 要等 AppShellLayout 整棵树的首轮渲染跑完才会触发。只看 isLoading 的话，这里
  // 会在第一帧就判定 missing 并把深链 replace 掉。`hasLoaded` 记的是"这个 store
  // 有没有完整跑完过一次加载"，跟 isLoading 一起兜住"还没来得及开始加载"这个窗口。
  else if (friendsLoading || groupsLoading || !friendsHasLoaded || !groupsHasLoaded) status = 'loading'
  else status = 'missing'

  useEffect(() => {
    if (friend) {
      setSelectedConversation({ id: friend.friend_id, type: 'friend', name: friendDisplayName(friend), avatar: friend.friend_avatar_url ?? undefined, unreadCount: 0, online: false })
    } else if (group) {
      setSelectedConversation({ id: group.group_id, type: 'group', name: group.group_name, avatar: group.group_avatar_url ?? undefined, unreadCount: group.unread_count || 0, lastMessage: group.last_message_content || undefined, lastTime: group.last_message_time || undefined })
    } else {
      setSelectedConversation(null)
    }
    return () => setSelectedConversation(null)
  }, [friend, group, setSelectedConversation])

  return status
}
