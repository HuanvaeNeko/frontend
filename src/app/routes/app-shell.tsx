import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router'
import { AppShell } from '@/components/shell/AppShell'
import { ContactsList } from '@/components/shell/ContactsList'
import { useShellTab } from '@/components/shell/shellTab'
import { SettingsSectionList } from '@/components/shell/settings/SettingsSectionList'
import { UnifiedList } from '@/components/shell/UnifiedList'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useUnifiedConversations } from '@/features/chat/hooks/useUnifiedConversations'
import { parseConversationId } from '@/features/chat/lib/conversationId'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { usePinnedStore } from '@/features/chat/store/pinnedStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { usePathname, useRouter } from '@/lib/navigation'
import { ROUTES, chatPath } from '@/lib/routes'
import { useWSStore } from '@/store/wsStore'

/** 原 ChatPage 的挂载副作用，搬到壳：整个 /app/* 只跑一次 */
function useShellBootstrap() {
  const userId = useAuthStore((s) => s.user?.user_id)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const connect = useWSStore((s) => s.connect)
  const loadProfile = useProfileStore((s) => s.loadProfile)
  const loadFriends = useFriendsStore((s) => s.loadFriends)
  const loadPendingRequests = useFriendsStore((s) => s.loadPendingRequests)
  const loadSentRequests = useFriendsStore((s) => s.loadSentRequests)
  const loadMyGroups = useGroupStore((s) => s.loadMyGroups)
  useEffect(() => {
    if (!userId || !isAuthenticated) return
    connect()
    loadProfile().catch(console.error)
    loadFriends().catch(console.error)
    loadPendingRequests().catch(console.error)
    loadSentRequests().catch(console.error)
    loadMyGroups().catch(console.error)
  }, [userId, isAuthenticated, connect, loadProfile, loadFriends, loadPendingRequests, loadSentRequests, loadMyGroups])
}

function ChatListColumn() {
  const router = useRouter()
  const { conversationId } = useParams()
  const { conversations, status } = useUnifiedConversations()
  const friendsError = useFriendsStore((s) => s.error)
  const loadFriends = useFriendsStore((s) => s.loadFriends)
  const loadMyGroups = useGroupStore((s) => s.loadMyGroups)
  const togglePin = usePinnedStore((s) => s.toggle)
  const markRead = useChatStore((s) => s.markRead)
  return (
    <UnifiedList
      conversations={conversations}
      status={friendsError ? 'error' : status}
      error={friendsError ?? undefined}
      selectedId={conversationId ?? null}
      onSelect={(id) => router.push(chatPath(id))}
      onTogglePin={togglePin}
      onMarkRead={(id) => { const p = parseConversationId(id); if (p) markRead(p.kind, p.kind === 'friend' ? p.userId : p.groupId) }}
      onRetry={() => { loadFriends().catch(console.error); loadMyGroups().catch(console.error) }}
      onCreateGroup={() => router.push(`${ROUTES.app.contacts}?tab=groups&add=create-group`)}
      onAddFriend={() => router.push(`${ROUTES.app.contacts}?add=friend`)}
      onJoinGroup={() => router.push(`${ROUTES.app.contacts}?tab=groups&add=join-group`)}
    />
  )
}

export default function AppShellLayout() {
  useShellBootstrap()
  const pathname = usePathname()
  const tab = useShellTab()
  // 原 Navigation.tsx 写的"上次访问路径"（app-index.tsx 读它恢复落点；登出时由 sessionScope 清掉）。壳内每次路径变化都写
  useEffect(() => {
    if (pathname.startsWith('/app')) localStorage.setItem('last_visited_path', pathname)
  }, [pathname])
  return (
    <AppShell activeTab={tab} list={tab === 'settings' ? <SettingsSectionList /> : tab === 'contacts' ? <ContactsList /> : <ChatListColumn />}>
      <Outlet />
    </AppShell>
  )
}
