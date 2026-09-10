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
  const groups = useGroupStore((s) => s.myGroups)
  const groupsLoading = useGroupStore((s) => s.isLoading)
  const setSelectedConversation = useChatStore((s) => s.setSelectedConversation)

  const parsed = conversationId ? parseConversationId(conversationId) : null
  const friend = parsed?.kind === 'friend' ? friends.find((f) => f.friend_id === parsed.userId) : undefined
  const group = parsed?.kind === 'group' ? groups.find((g) => g.group_id === parsed.groupId) : undefined

  let status: RouteConversationStatus
  if (!conversationId) status = 'idle'
  else if (friend || group) status = 'ready'
  else if (friendsLoading || groupsLoading) status = 'loading'
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
