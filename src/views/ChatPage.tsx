'use client'

import { useState, useEffect } from 'react'
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
import SettingsModal, { useSettingsModal } from '../components/SettingsModal'
import FileManager from '../components/chat/FileManager'
import WebRTCPanel from '../components/chat/WebRTCPanel'
import { cn } from '@/lib/utils'

type SubTab = 'main' | 'new' | 'sent' | 'invites' | 'upload'
type MobileView = 'list' | 'chat'

function getTabFromPath(pathname: string): TabType {
  if (pathname.startsWith('/chat/groups')) return 'groups'
  if (pathname.startsWith('/chat/files')) return 'files'
  if (pathname.startsWith('/chat/webrtc')) return 'webrtc'
  return 'friends'
}

let chatPageInitialized = false

export function resetChatPageInit() {
  chatPageInitialized = false
}

const STORAGE_KEY = 'huanvae_chat_state'

function saveStateToStorage(tab: TabType, conversationId?: string, conversationType?: 'friend' | 'group') {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab, conversationId, conversationType, timestamp: Date.now() }))
  } catch (e) { console.warn('无法保存状态到 localStorage:', e) }
}

function loadStateFromStorage(): { tab: TabType; conversationId?: string; conversationType?: 'friend' | 'group' } | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) return parsed
    }
  } catch (e) { console.warn('无法从 localStorage 加载状态:', e) }
  return null
}

export default function ChatPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const settingsModal = useSettingsModal()
  const { openProfileModal } = useUIStore()
  const friendId = searchParams.get('id') && pathname?.includes('/friends') ? searchParams.get('id') : null
  const groupId = searchParams.get('id') && pathname?.includes('/groups') ? searchParams.get('id') : null
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

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile && selectedConversation) setMobileView('chat')
  }, [selectedConversation, isMobile])

  useEffect(() => {
    const tabFromPath = getTabFromPath(pathname || '/chat')
    if (pathname !== '/chat' && pathname !== '/chat/') {
      setActiveTab(tabFromPath)
    } else {
      const savedState = loadStateFromStorage()
      if (savedState && !isInitialized) setActiveTab(savedState.tab)
    }
    setIsInitialized(true)
  }, [pathname, setActiveTab, isInitialized])

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
      router.push('/login')
    } catch (error) {
      console.error('登出失败:', error)
    }
  }

  const tabs = [
    { id: 'friends' as const, icon: MessageCircle, label: '好友' },
    { id: 'groups' as const, icon: Users, label: '群聊' },
    { id: 'files' as const, icon: FileText, label: '文件' },
    { id: 'webrtc' as const, icon: Video, label: '视频' },
  ]

  const getSubTabs = () => {
    switch (activeTab) {
      case 'friends':
        return [
          { id: 'main' as const, label: '好友', icon: MessageCircle },
          { id: 'new' as const, label: '新朋友', icon: UserPlus },
          { id: 'sent' as const, label: '已发送', icon: Send },
        ]
      case 'groups':
        return [
          { id: 'main' as const, label: '我的群聊', icon: Users },
          { id: 'invites' as const, label: '群邀请', icon: UserCheck },
        ]
      case 'files':
        return [
          { id: 'main' as const, label: '我的文件', icon: FileText },
          { id: 'upload' as const, label: '上传文件', icon: Plus },
        ]
      default:
        return []
    }
  }

  return (
    <div className="w-full h-screen flex relative overflow-hidden bg-background">
      {/* 左侧图标栏 */}
      <TooltipProvider>
        <aside className="w-[68px] h-full flex-col items-center py-6 z-10 bg-card border-r border-border hidden md:flex">
          {/* 用户头像 */}
          <div className="relative mb-7">
            <button
              className="w-[42px] h-[42px] rounded-xl overflow-hidden bg-muted border-2 border-border flex items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-primary/30"
              onClick={openProfileModal}
            >
              {profile?.user_avatar_url || user?.avatar_url ? (
                <img src={profile?.user_avatar_url || user?.avatar_url} alt="头像" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            {connected && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-card rounded-full animate-pulse-online" />
            )}
          </div>

          {/* 导航按钮 */}
          <nav className="flex flex-col gap-2 flex-1">
            {tabs.map((tab) => (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center transition-all relative",
                      activeTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                    onClick={() => {
                      setActiveTab(tab.id)
                      setSubTab('main')
                      const pathMap: Record<TabType, string> = {
                        friends: '/chat/friends', groups: '/chat/groups',
                        files: '/chat/files', webrtc: '/chat/webrtc',
                      }
                      router.push(pathMap[tab.id])
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
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
                          {total > 99 ? '99+' : total}
                        </span>
                      )
                      return null
                    })()}
                    {tab.id === 'groups' && (() => {
                      const summary = useChatStore.getState().unreadSummary
                      const total = summary?.group_unreads.reduce((sum, u) => sum + u.unread_count, 0) ?? 0
                      if (total > 0) return (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
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
                  onClick={settingsModal.open}
                >
                  <Settings className="w-[22px] h-[22px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">设置</TooltipContent>
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
              <TooltipContent side="right">退出</TooltipContent>
            </Tooltip>
          </div>
        </aside>
      </TooltipProvider>

      {/* 中间会话列表 */}
      <div className={cn(
        "relative h-full flex z-10 shrink-0",
        "md:min-w-[240px] md:max-w-[400px] md:w-[280px]",
        "max-md:absolute max-md:inset-0 max-md:w-full max-md:max-w-none",
        isMobile && mobileView === 'chat' && "max-md:hidden"
      )}>
        <div className="w-full h-full flex flex-col z-10 overflow-hidden min-h-0 bg-card md:border-r border-border">
          {/* 子标签头部 */}
          {activeTab !== 'webrtc' && (
            <div className="p-4 pt-6 min-h-[90px] flex flex-col gap-3 border-b border-border">
              <div className="flex gap-1">
                {getSubTabs().map((tab) => (
                  <button
                    key={tab.id}
                    className={cn(
                      "flex-1 px-2 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1",
                      subTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                    onClick={() => setSubTab(tab.id)}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {subTab === 'main' && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={`搜索${activeTab === 'friends' ? '好友' : activeTab === 'groups' ? '群聊' : '文件'}...`}
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
              <h2 className="font-semibold text-foreground">视频会议</h2>
            </div>
          )}

          {/* 列表内容 */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 max-md:pb-28">
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
                    请在右侧创建或加入视频房间
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 右侧聊天窗口 */}
      <div className={cn(
        "flex-1 h-full min-h-0 min-w-0 flex flex-col z-10 overflow-hidden bg-background",
        "max-md:absolute max-md:inset-0 max-md:w-full",
        isMobile && mobileView === 'list' && "max-md:hidden"
      )}>
        {/* 移动端顶部返回栏 */}
        {isMobile && mobileView === 'chat' && (
          <div className="md:hidden flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 bg-card border-b border-border shrink-0 safe-area-inset-top">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 min-h-[44px] min-w-[44px] touch-target"
              onClick={() => {
                saveStateToStorage(activeTab)
                setSelectedConversation(null)
                setMobileView('list')
              }}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            {selectedConversation && (
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-foreground truncate">{selectedConversation.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {selectedConversation.type === 'friend' ? '好友' : '群聊'}
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
      {isMobile && mobileView === 'list' && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-card/95 backdrop-blur-xl border-t border-border pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] px-2">
          <div className="flex justify-around items-stretch">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-h-[56px] min-w-[56px] flex-1 max-w-[80px] rounded-xl transition-all touch-target",
                  activeTab === tab.id ? "text-primary bg-primary/10" : "text-muted-foreground active:bg-muted/50"
                )}
                onClick={() => { setActiveTab(tab.id); setSubTab('main') }}
              >
                <tab.icon className="w-6 h-6 shrink-0" />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            ))}
            <button
              className="flex flex-col items-center justify-center gap-0.5 min-h-[56px] min-w-[56px] flex-1 max-w-[80px] rounded-xl text-muted-foreground active:bg-muted/50 touch-target"
              onClick={settingsModal.open}
            >
              <Settings className="w-6 h-6 shrink-0" />
              <span className="text-xs font-medium">设置</span>
            </button>
          </div>
        </div>
      )}

      <SettingsModal isOpen={settingsModal.isOpen} onClose={settingsModal.close} />
    </div>
  )
}
