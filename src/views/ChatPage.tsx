'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
import { useChatStore } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { useWSStore } from '../store/wsStore'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { TabType } from '../store/chatStore'
import FriendList from '../components/chat/FriendList'
import GroupList from '../components/chat/GroupList'
import ChatWindow from '../components/chat/ChatWindow'
import FileManager from '../components/chat/FileManager'
import WebRTCPanel from '../components/chat/WebRTCPanel'
import { cn } from '@/lib/utils'

type SubTab = 'main' | 'new' | 'sent' | 'invites' | 'upload'

// 移动端视图模式
type MobileView = 'list' | 'chat'

// 从 URL 路径解析 tab 类型
function getTabFromPath(pathname: string): TabType {
  if (pathname.startsWith('/chat/groups')) return 'groups'
  if (pathname.startsWith('/chat/files')) return 'files'
  if (pathname.startsWith('/chat/webrtc')) return 'webrtc'
  return 'friends'
}

// localStorage key
const STORAGE_KEY = 'huanvae_chat_state'

// 保存状态到 localStorage
function saveStateToStorage(tab: TabType, conversationId?: string, conversationType?: 'friend' | 'group') {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tab,
      conversationId,
      conversationType,
      timestamp: Date.now(),
    }))
  } catch (e) {
    console.warn('无法保存状态到 localStorage:', e)
  }
}

// 从 localStorage 加载状态
function loadStateFromStorage(): { tab: TabType; conversationId?: string; conversationType?: 'friend' | 'group' } | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      // 24 小时内的状态才恢复
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        return parsed
      }
    }
  } catch (e) {
    console.warn('无法从 localStorage 加载状态:', e)
  }
  return null
}

export default function ChatPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // 使用查询参数：/chat/friends?id=xxx 或 /chat/groups?id=xxx
  const friendId = searchParams.get('id') && pathname?.includes('/friends') ? searchParams.get('id') : null
  const groupId = searchParams.get('id') && pathname?.includes('/groups') ? searchParams.get('id') : null
  const { user, logout, accessToken } = useAuthStore()
  const { profile, loadProfile } = useProfileStore()
  const { activeTab, setActiveTab, setSelectedConversation, selectedConversation } = useChatStore()
  const { friends, loadFriends, loadPendingRequests, loadSentRequests } = useFriendsStore()
  const { myGroups, loadMyGroups } = useGroupStore()
  const { connect: connectWS, disconnect: disconnectWS, connected } = useWSStore()
  
  const [subTab, setSubTab] = useState<SubTab>('main')
  const [searchQuery, setSearchQuery] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [isMobile, setIsMobile] = useState(false)

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 当选中会话时，移动端自动切换到聊天视图
  useEffect(() => {
    if (isMobile && selectedConversation) {
      setMobileView('chat')
    }
  }, [selectedConversation, isMobile])

  // 从 URL 路径初始化 tab 状态
  useEffect(() => {
    const tabFromPath = getTabFromPath(pathname || '/chat')
    
    // 如果 URL 指定了 tab，使用 URL 的
    if (pathname !== '/chat' && pathname !== '/chat/') {
      setActiveTab(tabFromPath)
    } else {
      // 如果是 /chat，尝试从 localStorage 恢复
      const savedState = loadStateFromStorage()
      if (savedState && !isInitialized) {
        setActiveTab(savedState.tab)
      }
    }
    setIsInitialized(true)
  }, [pathname, setActiveTab, isInitialized])

  // 处理 URL 中的 friendId 参数
  useEffect(() => {
    if (friendId && friends.length > 0) {
      const friend = friends.find(f => f.user_id === friendId)
      if (friend) {
        setSelectedConversation({
          id: friend.user_id,
          type: 'friend',
          name: friend.nickname,
          avatar: friend.avatar_url,
          unreadCount: 0,
        })
        setActiveTab('friends')
      }
    }
  }, [friendId, friends, setSelectedConversation, setActiveTab])

  // 处理 URL 中的 groupId 参数
  useEffect(() => {
    if (groupId && myGroups.length > 0) {
      const group = myGroups.find(g => g.group_id === groupId)
      if (group) {
        setSelectedConversation({
          id: group.group_id,
          type: 'group',
          name: group.group_name,
          avatar: group.group_avatar_url,
          unreadCount: 0,
        })
        setActiveTab('groups')
      }
    }
  }, [groupId, myGroups, setSelectedConversation, setActiveTab])

  // 从 localStorage 恢复会话
  useEffect(() => {
    if (!isInitialized || friendId || groupId) return
    
    const savedState = loadStateFromStorage()
    if (!savedState?.conversationId) return

    if (savedState.conversationType === 'friend' && friends.length > 0) {
      const friend = friends.find(f => f.user_id === savedState.conversationId)
      if (friend && !selectedConversation) {
        setSelectedConversation({
          id: friend.user_id,
          type: 'friend',
          name: friend.nickname,
          avatar: friend.avatar_url,
          unreadCount: 0,
        })
      }
    } else if (savedState.conversationType === 'group' && myGroups.length > 0) {
      const group = myGroups.find(g => g.group_id === savedState.conversationId)
      if (group && !selectedConversation) {
        setSelectedConversation({
          id: group.group_id,
          type: 'group',
          name: group.group_name,
          avatar: group.group_avatar_url,
          unreadCount: 0,
        })
      }
    }
  }, [isInitialized, friendId, groupId, friends, myGroups, selectedConversation, setSelectedConversation])

  // 当 tab 或选中会话变化时，更新 localStorage
  useEffect(() => {
    if (!isInitialized) return
    saveStateToStorage(
      activeTab,
      selectedConversation?.id,
      selectedConversation?.type
    )
  }, [activeTab, selectedConversation, isInitialized])

  // 初始化加载数据
  useEffect(() => {
    if (user && accessToken) {
      loadProfile().catch(console.error)
      connectWS()
      loadFriends().catch(console.error)
      loadPendingRequests().catch(console.error)
      loadSentRequests().catch(console.error)
      loadMyGroups().catch(console.error)
    }

    return () => {
      disconnectWS()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accessToken])

  // 注册 WebSocket 消息处理器
  useEffect(() => {
    const wsStore = useWSStore.getState()
    const chatStore = useChatStore.getState()
    
    const handlePrivateMessage = (data: {
      message_uuid: string; sender_id: string; sender_nickname: string; sender_avatar_url: string
      receiver_id: string; message_content: string; message_type: 'text' | 'image' | 'video' | 'file'
      file_uuid: string | null; file_url: string | null; file_size: number | null; file_hash: string | null
      image_width: number | null; image_height: number | null; seq: number; send_time: string
    }) => {
      const selectedConv = chatStore.selectedConversation
      if (selectedConv?.type === 'friend' && 
          (selectedConv.id === data.sender_id || selectedConv.id === data.receiver_id)) {
        chatStore.addMessage({
          message_uuid: data.message_uuid, sender_id: data.sender_id, receiver_id: data.receiver_id,
          message_content: data.message_content, message_type: data.message_type,
          file_uuid: data.file_uuid, file_url: data.file_url, file_size: data.file_size,
          file_hash: data.file_hash, image_width: data.image_width, image_height: data.image_height,
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
          file_hash: data.file_hash, image_width: data.image_width, image_height: data.image_height,
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

  // 移动端返回列表
  const handleMobileBack = () => {
    setMobileView('list')
    setSelectedConversation(null)
  }

  return (
    <div className="w-full h-screen flex relative overflow-hidden bg-gradient-to-br from-blue-100 via-slate-50 to-purple-100">
      {/* 背景装饰球 */}
      <div className="absolute w-[400px] h-[400px] rounded-full bg-gradient-to-br from-blue-300 to-blue-400 -top-24 -right-24 blur-[80px] opacity-40 pointer-events-none z-0 animate-float-slow max-md:w-[200px] max-md:h-[200px]" />
      <div className="absolute w-[300px] h-[300px] rounded-full bg-gradient-to-br from-indigo-300 to-indigo-400 -bottom-20 left-[20%] blur-[80px] opacity-40 pointer-events-none z-0 animate-float-slow-reverse max-md:w-[150px] max-md:h-[150px]" />
      <div className="absolute w-[250px] h-[250px] rounded-full bg-gradient-to-br from-violet-300 to-violet-400 top-1/2 -left-12 blur-[80px] opacity-40 pointer-events-none z-0 animate-float-slow max-md:hidden" />

      {/* 左侧边栏 - 移动端隐藏 */}
      <aside className="w-[68px] h-full flex-col items-center py-6 z-10 bg-gradient-to-b from-white/75 to-white/55 backdrop-blur-2xl border-r border-blue-200/25 shadow-[2px_0_20px_rgba(147,197,253,0.08)] hidden md:flex">
        {/* 用户头像 */}
        <div className="relative mb-7">
          <motion.div 
            className="w-[42px] h-[42px] rounded-xl overflow-hidden bg-gradient-to-br from-white/90 to-white/60 border-2 border-white/95 shadow-[0_4px_12px_rgba(59,130,246,0.12),0_2px_6px_rgba(147,197,253,0.15)] flex items-center justify-center cursor-pointer transition-all duration-200"
            onClick={() => router.push('/profile')}
            whileHover={{ scale: 1.08, y: -2 }}
          >
            {profile?.user_avatar_url || user?.avatar_url ? (
              <img src={profile?.user_avatar_url || user?.avatar_url} alt="头像" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-slate-400" />
            )}
          </motion.div>
          {connected && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-gradient-to-br from-green-500 to-green-600 border-2 border-white rounded-full shadow-[0_2px_8px_rgba(34,197,94,0.45)] animate-pulse-online" />
          )}
        </div>

        {/* 导航按钮 */}
        <nav className="flex flex-col gap-2 flex-1">
          {tabs.map((tab) => (
            <motion.button
              key={tab.id}
              className={cn(
                "w-11 h-11 rounded-[14px] border-none bg-transparent text-slate-500 cursor-pointer flex items-center justify-center transition-all duration-200 relative",
                activeTab === tab.id && "bg-gradient-to-br from-blue-500/20 to-blue-300/25 text-blue-600 shadow-[0_2px_8px_rgba(59,130,246,0.15)]"
              )}
              onClick={() => {
                setActiveTab(tab.id)
                setSubTab('main')
                const pathMap: Record<TabType, string> = {
                  friends: '/chat/friends',
                  groups: '/chat/groups',
                  files: '/chat/files',
                  webrtc: '/chat/webrtc',
                }
                router.push(pathMap[tab.id])
              }}
              title={tab.label}
              whileHover={{ scale: 1.05, backgroundColor: 'rgba(147, 197, 253, 0.18)' }}
              whileTap={{ scale: 0.95 }}
            >
              <tab.icon className="w-[22px] h-[22px]" />
              {activeTab === tab.id && (
                <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-blue-500 to-blue-400 rounded-r-sm" />
              )}
            </motion.button>
          ))}
        </nav>

        {/* 底部按钮 */}
        <div className="flex flex-col gap-2">
          <motion.button
            className="w-11 h-11 rounded-[14px] border-none bg-transparent text-slate-500 cursor-pointer flex items-center justify-center transition-all duration-200"
            onClick={() => router.push('/settings')}
            title="设置"
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(147, 197, 253, 0.18)' }}
            whileTap={{ scale: 0.95 }}
          >
            <Settings className="w-[22px] h-[22px]" />
          </motion.button>
          <motion.button
            className="w-11 h-11 rounded-[14px] border-none bg-transparent text-slate-500 cursor-pointer flex items-center justify-center transition-all duration-200 hover:bg-red-500/10 hover:text-red-600"
            onClick={handleLogout}
            title="退出"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <LogOut className="w-[22px] h-[22px]" />
          </motion.button>
        </div>
        </aside>

      {/* 中间会话列表 - 移动端全屏显示 */}
      <div className={cn(
        "relative h-full flex z-10 shrink-0",
        "md:min-w-[240px] md:max-w-[400px] md:w-[280px]",
        // 移动端
        "max-md:absolute max-md:inset-0 max-md:w-full max-md:max-w-none",
        isMobile && mobileView === 'chat' && "max-md:hidden"
      )}>
        <div className="w-full h-full flex flex-col z-10 overflow-hidden min-h-0 bg-gradient-to-b from-white/65 to-white/45 backdrop-blur-xl md:border-r border-blue-200/20 shadow-[2px_0_24px_rgba(147,197,253,0.06)]">
          {/* 头部：子标签 */}
          {activeTab !== 'webrtc' && (
            <div className="p-4 pt-6 min-h-[90px] flex flex-col gap-3 border-b border-blue-200/15 bg-white/20">
              {/* 子标签导航 */}
              <div className="flex gap-1">
                {getSubTabs().map((tab) => (
                  <button
                    key={tab.id}
                    className={cn(
                      "flex-1 px-2 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1",
                      subTab === tab.id
                        ? "bg-blue-200/30 text-blue-600"
                        : "text-slate-500 hover:bg-blue-100/20"
                    )}
                    onClick={() => setSubTab(tab.id)}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

          {/* 搜索框 */}
              {subTab === 'main' && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-white/70 border border-white/80 rounded-[14px] transition-all shadow-[0_2px_8px_rgba(147,197,253,0.08)] focus-within:border-blue-300/50 focus-within:shadow-[0_0_0_4px_rgba(147,197,253,0.12),0_4px_12px_rgba(147,197,253,0.1)] focus-within:bg-white/85">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                  placeholder={`搜索${activeTab === 'friends' ? '好友' : activeTab === 'groups' ? '群聊' : '文件'}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-0 border-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>
              )}
            </div>
          )}

          {/* WebRTC 头部 */}
          {activeTab === 'webrtc' && (
            <div className="p-4 pt-6 min-h-[90px] flex items-center border-b border-blue-200/15 bg-white/20">
              <h2 className="font-semibold text-slate-700">视频会议</h2>
            </div>
          )}

          {/* 列表内容 - 移动端底部留空间给导航栏 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 max-md:pb-24">
            <AnimatePresence mode="wait">
              {activeTab === 'friends' && (
                <motion.div
                  key="friends"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <FriendList 
                    subTab={subTab === 'invites' ? 'new' : subTab as 'main' | 'new' | 'sent'} 
                    searchQuery={searchQuery} 
                  />
                </motion.div>
              )}
              
              {activeTab === 'groups' && (
                <motion.div
                  key="groups"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <GroupList 
                    subTab={subTab === 'upload' ? 'main' : subTab as 'main' | 'invites'} 
                    searchQuery={searchQuery} 
                  />
                </motion.div>
              )}
              
              {activeTab === 'files' && (
                <motion.div
                  key="files"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <FileManager 
                    subTab={['main', 'upload'].includes(subTab) ? subTab as 'main' | 'upload' : 'main'} 
                  />
                </motion.div>
              )}

              {activeTab === 'webrtc' && (
                <motion.div
                  key="webrtc-list"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="p-4 text-center text-sm text-slate-500"
                >
                  请在右侧创建或加入视频房间
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
        </div>

      {/* 右侧聊天窗口 - 移动端全屏覆盖 */}
      <div className={cn(
        "flex-1 h-full min-h-0 min-w-0 flex flex-col z-10 overflow-hidden bg-gradient-to-b from-white/50 to-white/30 backdrop-blur-lg",
        // 移动端
        "max-md:absolute max-md:inset-0 max-md:w-full",
        isMobile && mobileView === 'list' && "max-md:hidden"
      )}>
        {/* 移动端顶部返回栏 */}
        {isMobile && mobileView === 'chat' && (
          <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white/40 backdrop-blur-xl border-b border-blue-200/20 shrink-0">
            <button
              type="button"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 bg-white/50 hover:bg-white/70 active:scale-95 transition-all"
              onClick={() => {
                // 先清除 localStorage 中保存的会话，防止被 useEffect 恢复
                saveStateToStorage(activeTab)
                setSelectedConversation(null)
                setMobileView('list')
              }}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            {selectedConversation && (
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-slate-700 truncate">{selectedConversation.name}</h2>
                <span className="text-xs text-slate-500">
                  {selectedConversation.type === 'friend' ? '好友' : '群聊'}
                </span>
              </div>
            )}
          </div>
        )}
        
        <AnimatePresence mode="wait">
          {activeTab === 'webrtc' ? (
            <motion.div
              key="webrtc"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <WebRTCPanel />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-h-0"
            >
              <ChatWindow hideMobileHeader={isMobile && mobileView === 'chat'} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 移动端底部导航栏 */}
      {isMobile && mobileView === 'list' && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/80 backdrop-blur-xl border-t border-blue-200/30 safe-area-inset-bottom">
          <div className="flex justify-around py-2 px-4">
            {tabs.map((tab) => (
              <motion.button
                key={tab.id}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-all",
                  activeTab === tab.id 
                    ? "text-blue-600 bg-blue-100/50" 
                    : "text-slate-500"
                )}
                onClick={() => {
                  setActiveTab(tab.id)
                  setSubTab('main')
                }}
                whileTap={{ scale: 0.95 }}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{tab.label}</span>
              </motion.button>
            ))}
            <motion.button
              className="flex flex-col items-center gap-1 py-2 px-4 rounded-xl text-slate-500"
              onClick={() => router.push('/settings')}
              whileTap={{ scale: 0.95 }}
            >
              <Settings className="w-5 h-5" />
              <span className="text-xs font-medium">设置</span>
            </motion.button>
          </div>
        </div>
      )}
    </div>
  )
}
