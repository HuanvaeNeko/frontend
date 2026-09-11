import { useMemo } from 'react'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { friendConversationId, groupConversationId } from '../lib/conversationId'
import { friendDisplayName } from '../lib/friendName'
import { useChatStore } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'
import { usePinnedStore } from '../store/pinnedStore'

export interface UnifiedConversation {
  /** `f-<uid>` / `g-<gid>`，也是 URL 里的 :conversationId */
  id: string
  kind: 'friend' | 'group'
  /** 好友的 user_id 或群的 group_id */
  targetId: string
  name: string
  avatarUrl: string | null
  /** 服务端给的最后一条预览（群消息已带「发送者: 」前缀），Web 不自行拼接 */
  preview: string | null
  lastMessageTime: string | null
  unreadCount: number
  pinned: boolean
}

function toEpoch(time: string | null): number {
  if (!time) return 0
  const ms = new Date(time).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/** APP `conversationSort.ts`：置顶优先，再按时间倒序，同时间按 id 稳定。 */
export function sortConversations(list: UnifiedConversation[]): UnifiedConversation[] {
  return [...list].sort((a, b) => {
    const pin = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
    if (pin !== 0) return pin
    const diff = toEpoch(b.lastMessageTime) - toEpoch(a.lastMessageTime)
    if (diff !== 0) return diff
    return a.id.localeCompare(b.id)
  })
}

export function useUnifiedConversations(): { conversations: UnifiedConversation[]; status: 'loading' | 'ready' } {
  const friends = useFriendsStore((s) => s.friends)
  const friendsLoading = useFriendsStore((s) => s.isLoading)
  const friendsHasLoaded = useFriendsStore((s) => s.hasLoaded)
  const groups = useGroupStore((s) => s.myGroups)
  const groupsLoading = useGroupStore((s) => s.isLoading)
  const groupsHasLoaded = useGroupStore((s) => s.hasLoaded)
  const summary = useChatStore((s) => s.unreadSummary)
  const pinned = usePinnedStore((s) => s.pinned)

  const conversations = useMemo(() => {
    const friendUnread = new Map(summary?.friend_unreads.map((u) => [u.friend_id, u]) ?? [])
    const groupUnread = new Map(summary?.group_unreads.map((u) => [u.group_id, u]) ?? [])
    const list: UnifiedConversation[] = []
    for (const f of friends) {
      const u = friendUnread.get(f.friend_id)
      const id = friendConversationId(f.friend_id)
      list.push({
        id, kind: 'friend', targetId: f.friend_id,
        name: friendDisplayName(f),
        avatarUrl: f.friend_avatar_url ? (toAbsoluteApiUrl(f.friend_avatar_url) ?? null) : null,
        preview: u?.last_message_preview ?? null,
        lastMessageTime: u?.last_message_time ?? null,
        unreadCount: u?.unread_count ?? 0,
        pinned: pinned.includes(id),
      })
    }
    for (const g of groups) {
      const u = groupUnread.get(g.group_id)
      const id = groupConversationId(g.group_id)
      list.push({
        id, kind: 'group', targetId: g.group_id,
        name: g.group_name,
        avatarUrl: g.group_avatar_url ? (toAbsoluteApiUrl(g.group_avatar_url) ?? null) : null,
        // unreadSummary 是实时真值；没有时退回 GET /api/groups/my 自带的快照
        preview: u?.last_message_preview ?? g.last_message_content ?? null,
        lastMessageTime: u?.last_message_time ?? g.last_message_time ?? null,
        unreadCount: u?.unread_count ?? g.unread_count ?? 0,
        pinned: pinned.includes(id),
      })
    }
    return sortConversations(list)
  }, [friends, groups, summary, pinned])

  // `hasLoaded` 区分"从没问过后端"与"问过了，结果就是没有"（friendsStore/groupStore
  // 的注释）：冷启动首帧两个 store 都是 isLoading:false / 空数组，只看 isLoading
  // 会把这一帧误判成 ready+空，列表先闪一下"还没有会话"再变成真内容（终审 finding #2）。
  const status = !friendsHasLoaded || !groupsHasLoaded || friendsLoading || groupsLoading ? 'loading' : 'ready'
  return { conversations, status }
}
