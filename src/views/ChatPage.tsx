'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { 
  MessageCircle, 
  Users, 
  FileText, 
  Video, 
  UserPlus,
  UserCheck,
  Send,
  Search,
  Plus,
  Settings,
  LogOut,
  Globe,
  User,
  ArrowLeft
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useChatStore } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { useWSStore } from '../store/wsStore'
import { useUIStore } from '../store/uiStore'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { TabType } from '../store/chatStore'
import FriendList from '../components/chat/FriendList'
import GroupList from '../components/chat/GroupList'
import ChatWindow from '../components/chat/ChatWindow'
import FileManager from '../components/chat/FileManager'
import WebRTCPanel from '../components/chat/WebRTCPanel'
import { cn } from '@/lib/utils'
import { CHAT_TAB_ROUTE_MAP, DEFAULT_UNAUTHENTICATED_ROUTE, ROUTES, getChatTabFromPath } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'
import { MOBILE_INTERACTIONS, triggerMobileHaptic } from '@/lib/mobileInteractions'

type SubTab = 'main' | 'new' | 'sent' | 'invites' | 'upload'
type MobileView = 'list' | 'chat'

let chatPageInitialized = false

export function resetChatPageInit() {
  chatPageInitialized = false
}

const STORAGE_KEY = 'huanvae_chat_state'

function saveStateToStorage(tab: TabType, conversationId?: string, conversationType?: 'friend' | 'group') {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab, conversationId, conversationType, timestamp: Date.now() }))
  } catch (e) { console.warn('Failed to save state to localStorage:', e) }
}

function loadStateFromStorage(): { tab: TabType; conversationId?: string; conversationType?: 'friend' | 'group' } | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) return parsed
    }
  } catch (e) { console.warn('Failed to load state from localStorage:', e) }
  return null
}

export default function ChatPage() {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { openProfileModal } = useUIStore()
  const friendId = searchParams.get('id') && pathname?.startsWith(ROUTES.app.chatFriends) ? searchParams.get('id') : null
  const groupId = searchParams.get('id') && pathname?.startsWith(ROUTES.app.chatGroups) ? searchParams.get('id') : null
  const { user, logout, accessToken } = useAuthStore()
  const { profile, loadProfile } = useProfileStore()
  const { activeTab, setActiveTab, setSelectedConversation, selectedConversation } = useChatStore()
  const { friends, loadFriends, loadPendingRequests, loadSentRequests } = useFriendsStore()
  const { myGroups, loadMyGroups } = useGroupStore()
  const { connect: connectWS, connected } = useWSStore()
  
  const [subTab, setSubTab] = useState<SubTab>('main')
  const [searchQuery, setSearchQuery] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [isMobile, setIsMobile] = useState(false)
  const [isLandscape, setIsLandscape] = useState(false)
  const [isCompactHeight, setIsCompactHeight] = useState(false)
  const [swipeHintProgress, setSwipeHintProgress] = useState(0)
  const chatSwipeStartRef = useRef<{ x: number; y: number } | null>(null)

  const resolveSubTabFromRoute = (tab: TabType): SubTab => {
    const view = searchParams.get('view')
    if (tab === 'friends') {
      if (view === 'new' || view === 'sent') return view
      return 'main'
    }
    if (tab === 'groups') {
      if (view === 'invites') return 'invites'
      return 'main'
    }
    if (tab === 'files') {
      if (view === 'upload') return 'upload'
      return 'main'
    }
    return 'main'
  }

  const getRouteWithSubTab = (tab: TabType, targetSubTab: SubTab) => {
    const params = new URLSearchParams(searchParams.toString())
    const basePath = CHAT_TAB_ROUTE_MAP[tab]

    if (targetSubTab === 'main') {
      params.delete('view')
    } else {
      params.set('view', targetSubTab)
      params.delete('id')
    }

    const query = params.toString()
    return query ? `${basePath}?${query}` : basePath
  }

  useEffect(() => {
    const updateViewportFlags = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches
      const landscape = width > height
      const mobileWidth = width < 768
      const compactLandscape = coarsePointer && landscape && height < 640

      setIsLandscape(landscape)
      setIsCompactHeight(height < 560)
      setIsMobile(mobileWidth || compactLandscape)
    }

    updateViewportFlags()
    window.addEventListener('resize', updateViewportFlags)
    window.addEventListener('orientationchange', updateViewportFlags)
    return () => {
      window.removeEventListener('resize', updateViewportFlags)
      window.removeEventListener('orientationchange', updateViewportFlags)
    }
  }, [])

  useEffect(() => {
    if (isMobile && selectedConversation) setMobileView('chat')
  }, [selectedConversation, isMobile])

  useEffect(() => {
    const tabFromPath = getChatTabFromPath(pathname || ROUTES.app.chat)
    if (pathname !== ROUTES.app.chat && pathname !== `${ROUTES.app.chat}/`) {
      setActiveTab(tabFromPath)
    } else {
      const savedState = loadStateFromStorage()
      if (savedState && !isInitialized) setActiveTab(savedState.tab)
    }
    setIsInitialized(true)
  }, [pathname, setActiveTab, isInitialized])

  useEffect(() => {
    const tabFromPath = getChatTabFromPath(pathname || ROUTES.app.chat)
    const nextSubTab = resolveSubTabFromRoute(tabFromPath)
    setSubTab((prev) => (prev === nextSubTab ? prev : nextSubTab))
    // searchParams 对象本身每次可能变化，使用 toString 保持稳定依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams.toString()])

  useEffect(() => {
    if (friendId && friends.length > 0) {
      const friend = friends.find(f => f.user_id === friendId)
      if (friend) {
        setSelectedConversation({ id: friend.user_id, type: 'friend', name: friend.nickname, avatar: friend.avatar_url, unreadCount: 0 })
        setActiveTab('friends')
      }
    }
  }, [friendId, friends, setSelectedConversation, setActiveTab])

  useEffect(() => {
    if (groupId && myGroups.length > 0) {
      const group = myGroups.find(g => g.group_id === groupId)
      if (group) {
        setSelectedConversation({ id: group.group_id, type: 'group', name: group.group_name, avatar: group.group_avatar_url, unreadCount: 0 })
        setActiveTab('groups')
      }
    }
  }, [groupId, myGroups, setSelectedConversation, setActiveTab])

  useEffect(() => {
    if (!isInitialized || friendId || groupId) return
    const savedState = loadStateFromStorage()
    if (!savedState?.conversationId) return
    if (savedState.conversationType === 'friend' && friends.length > 0) {
      const friend = friends.find(f => f.user_id === savedState.conversationId)
      if (friend && !selectedConversation) {
        setSelectedConversation({ id: friend.user_id, type: 'friend', name: friend.nickname, avatar: friend.avatar_url, unreadCount: 0 })
      }
    } else if (savedState.conversationType === 'group' && myGroups.length > 0) {
      const group = myGroups.find(g => g.group_id === savedState.conversationId)
      if (group && !selectedConversation) {
        setSelectedConversation({ id: group.group_id, type: 'group', name: group.group_name, avatar: group.group_avatar_url, unreadCount: 0 })
      }
    }
  }, [isInitialized, friendId, groupId, friends, myGroups, selectedConversation, setSelectedConversation])

  useEffect(() => {
    if (!isInitialized) return
    saveStateToStorage(activeTab, selectedConversation?.id, selectedConversation?.type)
  }, [activeTab, selectedConversation, isInitialized])

  useEffect(() => {
    if (user && accessToken) {
      if (!chatPageInitialized) {
        chatPageInitialized = true
        loadProfile().catch(console.error)
        loadFriends().catch(console.error)
        loadPendingRequests().catch(console.error)
        loadSentRequests().catch(console.error)
        loadMyGroups().catch(console.error)
      }
      connectWS()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accessToken])

  useEffect(() => {
    const wsStore = useWSStore.getState()
    const chatStore = useChatStore.getState()
    
    const handlePrivateMessage = (data: {
      message_uuid: string; sender_id: string; sender_nickname: string; sender_avatar_url: string
      receiver_id: string; message_content: string; message_type: 'text' | 'image' | 'video' | 'file'
      file_uuid: string | null; file_url: string | null; file_size: number | null; file_hash: string | null
      filename: string | null; content_type: string | null
      image_width: number | null; image_height: number | null; seq: number; send_time: string
    }) => {
      const selectedConv = chatStore.selectedConversation
      if (selectedConv?.type === 'friend' && (selectedConv.id === data.sender_id || selectedConv.id === data.receiver_id)) {
        chatStore.addMessage({
          message_uuid: data.message_uuid, sender_id: data.sender_id, receiver_id: data.receiver_id,
          message_content: data.message_content, message_type: data.message_type,
          file_uuid: data.file_uuid, file_url: data.file_url, file_size: data.file_size,
          file_hash: data.file_hash, filename: data.filename, content_type: data.content_type,
          image_width: data.image_width, image_height: data.image_height,
          seq: data.seq, send_time: data.send_time,
        })
      }
      const conversationId = data.sender_id === user?.user_id ? data.receiver_id : data.sender_id
      chatStore.updateConversation(conversationId, {
        lastMessage: data.message_content, lastTime: data.send_time,
        unreadCount: selectedConv?.id === conversationId ? 0 : 1,
      })
      chatStore.updateLastSeq(conversationId, data.seq)
    }

    const handleGroupMessage = (data: {
      message_uuid: string; group_id: string; sender_id: string; sender_nickname: string
      sender_avatar_url: string; message_content: string
      message_type: 'text' | 'image' | 'video' | 'file' | 'system'
      file_uuid: string | null; file_url: string | null; file_size: number | null; file_hash: string | null
      filename: string | null; content_type: string | null
      image_width: number | null; image_height: number | null; seq: number
      reply_to: string | null; send_time: string
    }) => {
      if (data.message_type === 'system') return
      const selectedConv = chatStore.selectedConversation
      if (selectedConv?.type === 'group' && selectedConv.id === data.group_id) {
        chatStore.addMessage({
          message_uuid: data.message_uuid, sender_id: data.sender_id, receiver_id: data.group_id,
          message_content: data.message_content,
          message_type: data.message_type as 'text' | 'image' | 'video' | 'file',
          file_uuid: data.file_uuid, file_url: data.file_url, file_size: data.file_size,
          file_hash: data.file_hash, filename: data.filename, content_type: data.content_type,
          image_width: data.image_width, image_height: data.image_height,
          seq: data.seq, send_time: data.send_time,
        })
      }
      chatStore.updateConversation(data.group_id, {
        lastMessage: data.message_content, lastTime: data.send_time,
        unreadCount: selectedConv?.id === data.group_id ? 0 : 1,
      })
      chatStore.updateLastSeq(data.group_id, data.seq)
    }

    const handleMessageRecalled = (data: {
      message_uuid: string; source_type: 'friend' | 'group'; source_id: string; recalled_by: string
    }) => {
      chatStore.setMessages(chatStore.messages.filter(m => m.message_uuid !== data.message_uuid))
    }

    const handleFriendRequest = () => { loadPendingRequests().catch(console.error) }
    const handleFriendRequestResult = (data: { target_user_id: string; result: 'approved' | 'rejected' }) => {
      if (data.result === 'approved') loadFriends().catch(console.error)
      loadSentRequests().catch(console.error)
    }
    const handleGroupInvite = () => { loadMyGroups().catch(console.error) }
    const handleGroupMemberChange = () => { loadMyGroups().catch(console.error) }
    const handleFileUploaded = (_data: {
      file_uuid: string; file_url: string; conversation_type: 'private' | 'group'
      conversation_id: string; message_uuid: string; message_send_time: string
    }) => {}
    const handleGroupNotice = (_data: {
      group_id: string; notice_id: string; title: string; content: string
      publisher_nickname: string; is_pinned: boolean; published_at: string
    }) => {}
    const handleFriendshipChange = (_data: { friend_user_id: string; friend_nickname: string }, _type: 'added' | 'removed') => {
      loadFriends().catch(console.error)
    }
    const handleTypingStatus = (data: {
      user_id: string; conversation_type: 'private' | 'group'; conversation_id: string; is_typing: boolean
    }) => {
      chatStore.setTypingStatus({
        conversationId: data.conversation_id, conversationType: data.conversation_type,
        userId: data.user_id, isTyping: data.is_typing, timestamp: Date.now(),
      })
    }
    const handleOnlineStatus = (data: { user_id: string; status: 'online' | 'offline' }) => {
      const friendsStore = useFriendsStore.getState()
      friendsStore.setOnlineStatus(data.user_id, data.status === 'online')
    }

    const unsubPrivateMessage = wsStore.registerHandler('private_message', handlePrivateMessage)
    const unsubGroupMessage = wsStore.registerHandler('group_message', handleGroupMessage)
    const unsubMessageRecalled = wsStore.registerHandler('message_recalled', handleMessageRecalled)
    const unsubFriendRequest = wsStore.registerHandler('friend_request', handleFriendRequest)
    const unsubFriendResult = wsStore.registerHandler('friend_request_result', handleFriendRequestResult)
    const unsubGroupInvite = wsStore.registerHandler('group_invitation', handleGroupInvite)
    const unsubMemberJoined = wsStore.registerHandler('group_member_joined', handleGroupMemberChange)
    const unsubMemberLeft = wsStore.registerHandler('group_member_left', handleGroupMemberChange)
    const unsubFileUploaded = wsStore.registerHandler('file_uploaded', handleFileUploaded)
    const unsubGroupNotice = wsStore.registerHandler('group_notice', handleGroupNotice)
    const unsubFriendshipAdded = wsStore.registerHandler('friendship_added', (d) => handleFriendshipChange(d as { friend_user_id: string; friend_nickname: string }, 'added'))
    const unsubFriendshipRemoved = wsStore.registerHandler('friendship_removed', (d) => handleFriendshipChange(d as { friend_user_id: string; friend_nickname: string }, 'removed'))
    const unsubTyping = wsStore.registerHandler('typing', handleTypingStatus)
    const unsubOnlineStatus = wsStore.registerHandler('online_status', handleOnlineStatus)

    return () => {
      unsubPrivateMessage(); unsubGroupMessage(); unsubMessageRecalled(); unsubFriendRequest()
      unsubFriendResult(); unsubGroupInvite(); unsubMemberJoined(); unsubMemberLeft()
      unsubFileUploaded(); unsubGroupNotice(); unsubFriendshipAdded(); unsubFriendshipRemoved()
      unsubTyping(); unsubOnlineStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id])

  const handleLogout = async () => {
    try {
      useWSStore.getState().disconnect()
      resetChatPageInit()
      await logout()
      router.push(DEFAULT_UNAUTHENTICATED_ROUTE)
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const tabs = [
    { id: 'friends' as const, icon: MessageCircle, label: t('chat.page.tabs.friends') },
    { id: 'groups' as const, icon: Users, label: t('chat.page.tabs.groups') },
    { id: 'files' as const, icon: FileText, label: t('chat.page.tabs.files') },
    { id: 'webrtc' as const, icon: Video, label: t('chat.page.tabs.webrtc') },
  ]
  const isFilesTab = activeTab === 'files'

  const handleMobileBackToList = () => {
    saveStateToStorage(activeTab)
    setSelectedConversation(null)
    setMobileView('list')
    triggerMobileHaptic(10)
  }

  const handleChatPanelTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile || mobileView !== 'chat') return
    const touch = event.touches[0]
    chatSwipeStartRef.current = { x: touch.clientX, y: touch.clientY }
    if (touch.clientX <= MOBILE_INTERACTIONS.edgeSwipeStartX) {
      setSwipeHintProgress(0.08)
    } else {
      setSwipeHintProgress(0)
    }
  }

  const handleChatPanelTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile || mobileView !== 'chat') return
    const start = chatSwipeStartRef.current
    if (!start) return

    const touch = event.touches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = Math.abs(touch.clientY - start.y)
    const startsFromLeftEdge = start.x <= MOBILE_INTERACTIONS.edgeSwipeStartX

    if (!startsFromLeftEdge || deltaY > MOBILE_INTERACTIONS.edgeSwipeMaxVerticalDelta || deltaX <= 0) {
      setSwipeHintProgress(0)
      return
    }

    const progress = Math.min(1, deltaX / MOBILE_INTERACTIONS.edgeSwipeProgressDistance)
    setSwipeHintProgress(progress)
  }

  const handleChatPanelTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile || mobileView !== 'chat') return
    const start = chatSwipeStartRef.current
    if (!start) return

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = Math.abs(touch.clientY - start.y)
    const startsFromLeftEdge = start.x <= MOBILE_INTERACTIONS.edgeSwipeStartX

    chatSwipeStartRef.current = null

    if (startsFromLeftEdge && deltaX > MOBILE_INTERACTIONS.edgeSwipeTriggerX && deltaY < MOBILE_INTERACTIONS.edgeSwipeMaxVerticalDelta) {
      setSwipeHintProgress(0)
      handleMobileBackToList()
      return
    }

    setSwipeHintProgress(0)
  }

  const getSubTabs = () => {
    switch (activeTab) {
      case 'friends':
        return [
          { id: 'main' as const, label: t('chat.page.subTabs.friends.main'), icon: MessageCircle },
          { id: 'new' as const, label: t('chat.page.subTabs.friends.new'), icon: UserPlus },
          { id: 'sent' as const, label: t('chat.page.subTabs.friends.sent'), icon: Send },
        ]
      case 'groups':
        return [
          { id: 'main' as const, label: t('chat.page.subTabs.groups.main'), icon: Users },
          { id: 'invites' as const, label: t('chat.page.subTabs.groups.invites'), icon: UserCheck },
        ]
      case 'files':
        return [
          { id: 'main' as const, label: t('chat.page.subTabs.files.main'), icon: FileText },
          { id: 'upload' as const, label: t('chat.page.subTabs.files.upload'), icon: Plus },
        ]
      default:
        return []
    }
  }

  return (
    <div
      className={cn(
        "app-screen relative flex w-full overflow-hidden bg-background/70 md:gap-3 md:p-3",
        isMobile && isLandscape && "mobile-landscape-chat"
      )}
    >
      {/* 左侧图标栏 */}
      <TooltipProvider>
        <aside className="z-10 hidden h-full w-[74px] flex-col items-center rounded-2xl border border-border bg-card/95 py-5 shadow-sm backdrop-blur md:flex">
          {/* 用户头像 */}
          <div className="relative mb-7">
            <button
              className="w-[42px] h-[42px] rounded-xl overflow-hidden bg-muted border-2 border-border flex items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-primary/30"
              onClick={openProfileModal}
            >
              {profile?.user_avatar_url || user?.avatar_url ? (
                <img src={profile?.user_avatar_url || user?.avatar_url} alt={t('chat.page.avatarAlt')} className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            {connected && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-primary border-2 border-card rounded-full animate-pulse-online" />
            )}
          </div>

          {/* 导航按钮 */}
          <nav className="flex flex-col gap-2 flex-1">
            {tabs.map((tab) => (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all",
                      activeTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                    onClick={() => {
                      setActiveTab(tab.id)
                      setSubTab('main')
                      router.push(getRouteWithSubTab(tab.id, 'main'))
                    }}
                  >
                    <tab.icon className="w-[22px] h-[22px]" />
                    {activeTab === tab.id && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-sm" />
                    )}
                    {/* 未读角标 */}
                    {tab.id === 'friends' && (() => {
                      const summary = useChatStore.getState().unreadSummary
                      const total = summary?.friend_unreads.reduce((sum, u) => sum + u.unread_count, 0) ?? 0
                      if (total > 0) return (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-destructive-foreground bg-destructive rounded-full">
                          {total > 99 ? '99+' : total}
                        </span>
                      )
                      return null
                    })()}
                    {tab.id === 'groups' && (() => {
                      const summary = useChatStore.getState().unreadSummary
                      const total = summary?.group_unreads.reduce((sum, u) => sum + u.unread_count, 0) ?? 0
                      if (total > 0) return (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-destructive-foreground bg-destructive rounded-full">
                          {total > 99 ? '99+' : total}
                        </span>
                      )
                      return null
                    })()}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{tab.label}</TooltipContent>
              </Tooltip>
            ))}
          </nav>

          {/* 底部按钮 */}
          <div className="flex flex-col gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
                  onClick={() => router.push(ROUTES.app.settings)}
                >
                  <Settings className="w-[22px] h-[22px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('chat.page.settings')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
                  onClick={() => router.push(ROUTES.root)}
                >
                  <Globe className="w-[22px] h-[22px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('layout.officialSite')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                  onClick={handleLogout}
                >
                  <LogOut className="w-[22px] h-[22px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('chat.page.logout')}</TooltipContent>
            </Tooltip>
          </div>
        </aside>
      </TooltipProvider>

      {/* 中间会话列表 */}
      <div className={cn(
        "relative z-10 flex h-full w-full shrink-0 md:w-auto",
        isFilesTab ? "md:min-w-0 md:max-w-none md:w-auto md:flex-1" : "md:min-w-[240px] md:max-w-[400px] md:w-[280px]",
        isMobile && mobileView === 'chat' && "hidden md:flex",
        activeTab === 'webrtc' && isMobile && "hidden"
      )}>
        <div className="z-10 flex h-full min-h-0 w-full flex-col overflow-hidden bg-card md:rounded-2xl md:border md:shadow-sm">
          {/* Mobile Top Tabs for Main Categories */}
          {isMobile && (
            <div className="flex items-center p-2 border-b bg-card/95 backdrop-blur shrink-0 overflow-x-auto no-scrollbar gap-2 mobile-top-safe">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={cn(
                    "flex-1 min-w-[60px] flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg transition-colors",
                    activeTab === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                  )}
                  onClick={() => {
                    setActiveTab(tab.id)
                    setSubTab('main')
                    if (tab.id === 'webrtc') {
                      setMobileView('chat')
                    } else {
                      setMobileView('list')
                    }
                  }}
                >
                  <tab.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium whitespace-nowrap">{tab.label}</span>
                </button>
              ))}
              <div className="w-px h-6 bg-border mx-1" />
              <button
                className="flex flex-col items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-muted-foreground hover:bg-accent"
                onClick={() => router.push(ROUTES.app.settings)}
              >
                <Settings className="w-5 h-5" />
                <span className="text-[10px] font-medium">{t('chat.page.settings')}</span>
              </button>
            </div>
          )}

          {/* 子标签头部 */}
          {activeTab !== 'webrtc' && (
          <div className={cn(
            "p-4 pt-6 min-h-[90px] flex flex-col gap-3 border-b border-border",
            isMobile && isLandscape && "landscape-compact-header"
          )}>
              <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
                {getSubTabs().map((tab) => (
                  <button
                    key={tab.id}
                    className={cn(
                      "flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-all",
                      isMobile && isLandscape && "landscape-compact-button",
                      subTab === tab.id
                        ? "bg-card text-primary shadow-sm"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                    onClick={() => {
                      setSubTab(tab.id)
                      router.push(getRouteWithSubTab(activeTab, tab.id))
                    }}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {!(isMobile && isCompactHeight) && tab.label}
                  </button>
                ))}
              </div>

              {subTab === 'main' && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={activeTab === 'friends'
                      ? t('chat.page.searchFriends')
                      : activeTab === 'groups'
                        ? t('chat.page.searchGroups')
                        : t('chat.page.searchFiles')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'webrtc' && (
            <div className="p-4 pt-6 min-h-[90px] flex items-center border-b border-border">
              <h2 className="font-semibold text-foreground">{t('chat.page.tabs.webrtc')}</h2>
            </div>
          )}

          {/* 列表内容 */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2">
              <AnimatePresence mode="wait">
                {activeTab === 'friends' && (
                  <motion.div key="friends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    <FriendList subTab={subTab === 'invites' ? 'new' : subTab as 'main' | 'new' | 'sent'} searchQuery={searchQuery} />
                  </motion.div>
                )}
                {activeTab === 'groups' && (
                  <motion.div key="groups" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    <GroupList subTab={subTab === 'upload' ? 'main' : subTab as 'main' | 'invites'} searchQuery={searchQuery} />
                  </motion.div>
                )}
                {activeTab === 'files' && (
                  <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    <FileManager subTab={['main', 'upload'].includes(subTab) ? subTab as 'main' | 'upload' : 'main'} />
                  </motion.div>
                )}
                {activeTab === 'webrtc' && (
                  <motion.div key="webrtc-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-4 text-center text-sm text-muted-foreground">
                    {isMobile ? t('chat.page.webrtcHintMobile') : t('chat.page.webrtcHint')}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 右侧聊天窗口 */}
      <div
        className={cn(
          "relative z-10 flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background md:w-auto md:rounded-2xl md:border md:shadow-sm",
          isFilesTab && "md:hidden",
          isMobile && mobileView === 'list' && "hidden md:flex",
          isMobile && mobileView === 'chat' && "fixed inset-0 z-50",
          activeTab === 'webrtc' && isMobile && "flex fixed inset-0 z-10 w-full h-full"
        )}
        onTouchStart={handleChatPanelTouchStart}
        onTouchMove={handleChatPanelTouchMove}
        onTouchEnd={handleChatPanelTouchEnd}
      >
        {isMobile && mobileView === 'chat' && swipeHintProgress > 0 && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-30 w-12 bg-gradient-to-r from-primary/30 to-transparent transition-opacity duration-150"
            style={{ opacity: Math.min(0.9, swipeHintProgress), transform: 'translateX(' + Math.max(-14, -16 + swipeHintProgress * 16) + 'px)' }}
          />
        )}

        {isMobile && activeTab === 'webrtc' && (
          <div className={cn(
            "md:hidden flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 bg-card border-b border-border shrink-0 safe-area-inset-top",
            isLandscape && "landscape-compact-header"
          )}>
            <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar flex items-center gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={cn(
                    "flex-1 min-w-[60px] flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg transition-colors",
                    activeTab === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                  )}
                  onClick={() => {
                    setActiveTab(tab.id)
                    setSubTab('main')
                    if (tab.id !== 'webrtc') {
                      setMobileView('list')
                    }
                  }}
                >
                  <tab.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium whitespace-nowrap">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {isMobile && mobileView === 'chat' && activeTab !== 'webrtc' && (
          <div className={cn(
            "md:hidden flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 bg-card border-b border-border shrink-0 safe-area-inset-top",
            isLandscape && "landscape-compact-header"
          )}>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 min-h-[44px] min-w-[44px] touch-target"
              onClick={handleMobileBackToList}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            {selectedConversation && (
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-foreground truncate">{selectedConversation.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {selectedConversation.type === 'friend' ? t('chat.page.tabs.friends') : t('chat.page.tabs.groups')}
                </span>
              </div>
            )}
          </div>
        )}
        
        <AnimatePresence mode="wait">
          {activeTab === 'webrtc' ? (
            <motion.div key="webrtc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full">
              <WebRTCPanel />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-h-0">
              <ChatWindow hideMobileHeader={isMobile && mobileView === 'chat'} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 移动端底部导航栏 */}
      {/* 已迁移至 MainLayout 的 MobileBottomNav */}
    </div>
  )
}
