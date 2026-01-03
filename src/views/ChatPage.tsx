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
  User
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

type SubTab = 'main' | 'new' | 'sent' | 'invites' | 'upload'

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

  return (
    <div className="chat-app">
      {/* 背景装饰球 */}
      <div className="chat-bg-orb orb-1" />
      <div className="chat-bg-orb orb-2" />
      <div className="chat-bg-orb orb-3" />

      {/* 左侧边栏 */}
      <aside className="chat-sidebar">
        {/* 用户头像 */}
        <div className="sidebar-avatar">
          <div className="avatar-wrapper" onClick={() => router.push('/profile')}>
            {profile?.user_avatar_url || user?.avatar_url ? (
              <img src={profile?.user_avatar_url || user?.avatar_url} alt="头像" />
            ) : (
              <User className="w-5 h-5 text-[#94a3b8]" />
            )}
          </div>
          {connected && <div className="online-indicator" />}
        </div>

        {/* 导航按钮 */}
        <nav className="sidebar-nav">
          {tabs.map((tab) => (
            <motion.button
              key={tab.id}
              className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => { 
                setActiveTab(tab.id)
                setSubTab('main')
                // 更新 URL 路径
                const pathMap: Record<TabType, string> = {
                  friends: '/chat/friends',
                  groups: '/chat/groups',
                  files: '/chat/files',
                  webrtc: '/chat/webrtc',
                }
                router.push(pathMap[tab.id])
              }}
              title={tab.label}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <tab.icon />
            </motion.button>
          ))}
        </nav>

        {/* 底部按钮 */}
        <div className="sidebar-bottom">
          <motion.button
            className="nav-btn"
            onClick={() => router.push('/settings')}
            title="设置"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Settings />
          </motion.button>
          <motion.button
            className="nav-btn logout"
            onClick={handleLogout}
            title="退出"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <LogOut />
          </motion.button>
        </div>
      </aside>

      {/* 中间会话列表 */}
      <div className="chat-list-container" style={{ width: 280 }}>
        <div className="chat-list-panel">
          {/* 头部：子标签 */}
          {activeTab !== 'webrtc' && (
            <div className="chat-list-header" style={{ flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
              {/* 子标签导航 */}
              <div className="flex gap-1">
                {getSubTabs().map((tab) => (
                  <button
                    key={tab.id}
                    className={`flex-1 px-2 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
                      subTab === tab.id
                        ? 'bg-[var(--blue-alpha-medium)] text-[var(--color-blue-600)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--blue-alpha-subtle)]'
                    }`}
                    onClick={() => setSubTab(tab.id)}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 搜索框 */}
              {subTab === 'main' && (
                <div className="search-box">
                  <Search className="w-4 h-4" />
                  <input
                    type="text"
                    placeholder={`搜索${activeTab === 'friends' ? '好友' : activeTab === 'groups' ? '群聊' : '文件'}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* WebRTC 头部 */}
          {activeTab === 'webrtc' && (
            <div className="chat-list-header">
              <h2 className="font-semibold text-[var(--color-text-primary)]">视频会议</h2>
            </div>
          )}

          {/* 列表内容 */}
          <div className="conversation-list">
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
                  className="p-4 text-center text-sm text-[var(--color-text-muted)]"
                >
                  请在右侧创建或加入视频房间
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 右侧聊天窗口 */}
      <div className="chat-window">
        <AnimatePresence mode="wait">
          {activeTab === 'webrtc' ? (
            <motion.div
              key="webrtc"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <WebRTCPanel />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <ChatWindow />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
