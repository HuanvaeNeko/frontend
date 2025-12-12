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
  LogOut
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useChatStore } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { useWSStore } from '../store/wsStore'
import { useNavigate, useParams } from 'react-router-dom'
import FriendList from '../components/chat/FriendList'
import GroupList from '../components/chat/GroupList'
import ChatWindow from '../components/chat/ChatWindow'
import FileManager from '../components/chat/FileManager'
import WebRTCPanel from '../components/chat/WebRTCPanel'

type SubTab = 'main' | 'new' | 'sent' | 'invites' | 'upload'

export default function ChatPage() {
  const navigate = useNavigate()
  const { friendId } = useParams<{ friendId?: string }>()
  const { user, logout, accessToken } = useAuthStore()
  const { profile, loadProfile } = useProfileStore()
  const { activeTab, setActiveTab, setSelectedConversation } = useChatStore()
  const { friends, loadFriends, loadPendingRequests, loadSentRequests } = useFriendsStore()
  const { loadMyGroups } = useGroupStore()
  const { connect: connectWS, disconnect: disconnectWS, connected } = useWSStore()
  
  const [subTab, setSubTab] = useState<SubTab>('main')
  const [searchQuery, setSearchQuery] = useState('')

  // 处理 URL 中的 friendId 参数
  useEffect(() => {
    if (friendId && friends.length > 0) {
      const friend = friends.find(f => f.user_id === friendId)
      if (friend) {
        // 设置选中的会话
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

  // 初始化加载数据
  useEffect(() => {
    if (user && accessToken) {
      // 加载用户资料
      loadProfile().catch(console.error)
      
      // 连接 WebSocket
      connectWS()
      
      // 加载好友和群聊数据
      loadFriends().catch(console.error)
      loadPendingRequests().catch(console.error)
      loadSentRequests().catch(console.error)
      loadMyGroups().catch(console.error)
    }

    return () => {
      disconnectWS()
    }
  }, [user, accessToken])

  // 注册 WebSocket 消息处理器
  useEffect(() => {
    const wsStore = useWSStore.getState()
    const chatStore = useChatStore.getState()
    
    // 处理私聊消息
    const handlePrivateMessage = (data: {
      message_uuid: string
      sender_id: string
      sender_nickname: string
      sender_avatar_url: string
      receiver_id: string
      message_content: string
      message_type: 'text' | 'image' | 'video' | 'file'
      file_uuid: string | null
      file_url: string | null
      file_size: number | null
      send_time: string
    }) => {
      console.log('收到私聊消息:', data)
      
      // 如果当前正在与发送者聊天，添加消息到列表
      const selectedConv = chatStore.selectedConversation
      if (selectedConv?.type === 'friend' && 
          (selectedConv.id === data.sender_id || selectedConv.id === data.receiver_id)) {
        chatStore.addMessage({
          message_uuid: data.message_uuid,
          sender_id: data.sender_id,
          receiver_id: data.receiver_id,
          message_content: data.message_content,
          message_type: data.message_type,
          file_uuid: data.file_uuid,
          file_url: data.file_url,
          file_size: data.file_size,
          send_time: data.send_time,
        })
      }
      
      // 更新会话列表中的最后消息
      const conversationId = data.sender_id === user?.user_id ? data.receiver_id : data.sender_id
      chatStore.updateConversation(conversationId, {
        lastMessage: data.message_content,
        lastTime: data.send_time,
        unreadCount: selectedConv?.id === conversationId ? 0 : 1,
      })
    }

    // 处理群消息
    const handleGroupMessage = (data: {
      message_uuid: string
      group_id: string
      sender_id: string
      sender_nickname: string
      sender_avatar_url: string
      message_content: string
      message_type: 'text' | 'image' | 'video' | 'file' | 'system'
      file_uuid: string | null
      file_url: string | null
      file_size: number | null
      reply_to: string | null
      send_time: string
    }) => {
      console.log('收到群消息:', data)
      
      // 如果当前正在查看该群，添加消息到列表
      const selectedConv = chatStore.selectedConversation
      if (selectedConv?.type === 'group' && selectedConv.id === data.group_id) {
        chatStore.addMessage({
          message_uuid: data.message_uuid,
          sender_id: data.sender_id,
          receiver_id: data.group_id,
          message_content: data.message_content,
          message_type: data.message_type,
          file_uuid: data.file_uuid,
          file_url: data.file_url,
          file_size: data.file_size,
          send_time: data.send_time,
        })
      }
      
      // 更新群会话的最后消息
      chatStore.updateConversation(data.group_id, {
        lastMessage: data.message_content,
        lastTime: data.send_time,
        unreadCount: selectedConv?.id === data.group_id ? 0 : 1,
      })
    }

    // 处理消息撤回
    const handleMessageRecalled = (data: {
      message_uuid: string
      conversation_type: 'private' | 'group'
      conversation_id: string
    }) => {
      console.log('消息被撤回:', data)
      // 从消息列表中移除该消息
      chatStore.setMessages(
        chatStore.messages.filter(m => m.message_uuid !== data.message_uuid)
      )
    }

    // 处理好友请求
    const handleFriendRequest = () => {
      console.log('收到好友请求')
      loadPendingRequests().catch(console.error)
    }

    // 处理好友请求结果
    const handleFriendRequestResult = (data: {
      target_user_id: string
      result: 'approved' | 'rejected'
    }) => {
      console.log('好友请求结果:', data)
      if (data.result === 'approved') {
        loadFriends().catch(console.error)
      }
      loadSentRequests().catch(console.error)
    }

    // 处理群邀请
    const handleGroupInvite = () => {
      console.log('收到群邀请')
      loadMyGroups().catch(console.error)
    }

    // 处理群成员变化
    const handleGroupMemberChange = () => {
      console.log('群成员变化')
      loadMyGroups().catch(console.error)
    }

    // 处理文件上传完成通知（秒传或上传完成后自动发送的消息）
    const handleFileUploaded = (data: {
      file_uuid: string
      file_url: string
      conversation_type: 'private' | 'group'
      conversation_id: string
      message_uuid: string
      message_send_time: string
    }) => {
      console.log('文件上传完成:', data)
      // 刷新当前会话的消息列表以显示新的文件消息
      const selectedConv = chatStore.selectedConversation
      if (selectedConv?.id === data.conversation_id) {
        // 重新加载消息
        // 这里可以选择添加消息或刷新整个列表
      }
    }

    // 处理群公告
    const handleGroupNotice = (data: {
      group_id: string
      notice_id: string
      title: string
      content: string
      publisher_nickname: string
      is_pinned: boolean
      published_at: string
    }) => {
      console.log('收到群公告:', data)
      // 如果当前正在查看该群，可以显示公告通知
      const selectedConv = chatStore.selectedConversation
      if (selectedConv?.type === 'group' && selectedConv.id === data.group_id) {
        // 可以在这里触发公告弹窗或添加系统消息
      }
    }

    // 处理好友关系变化
    const handleFriendshipChange = (data: {
      friend_user_id: string
      friend_nickname: string
    }, type: 'added' | 'removed') => {
      console.log('好友关系变化:', type, data)
      loadFriends().catch(console.error)
    }

    // 处理正在输入状态
    const handleTypingStatus = (data: {
      user_id: string
      conversation_type: 'private' | 'group'
      conversation_id: string
      is_typing: boolean
    }) => {
      chatStore.setTypingStatus({
        conversationId: data.conversation_id,
        conversationType: data.conversation_type,
        userId: data.user_id,
        isTyping: data.is_typing,
        timestamp: Date.now(),
      })
    }

    // 处理在线状态
    const handleOnlineStatus = (data: {
      user_id: string
      status: 'online' | 'offline'
    }) => {
      console.log('在线状态变化:', data)
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
    const unsubFriendshipAdded = wsStore.registerHandler('friendship_added', (data) => handleFriendshipChange(data, 'added'))
    const unsubFriendshipRemoved = wsStore.registerHandler('friendship_removed', (data) => handleFriendshipChange(data, 'removed'))
    const unsubTyping = wsStore.registerHandler('typing', handleTypingStatus)
    const unsubOnlineStatus = wsStore.registerHandler('online_status', handleOnlineStatus)

    return () => {
      unsubPrivateMessage()
      unsubGroupMessage()
      unsubMessageRecalled()
      unsubFriendRequest()
      unsubFriendResult()
      unsubGroupInvite()
      unsubMemberJoined()
      unsubMemberLeft()
      unsubFileUploaded()
      unsubGroupNotice()
      unsubFriendshipAdded()
      unsubFriendshipRemoved()
      unsubTyping()
      unsubOnlineStatus()
    }
  }, [user?.user_id])

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (error) {
      console.error('登出失败:', error)
    }
  }

  // 顶部标签配置
  const tabs = [
    { id: 'friends' as const, icon: MessageCircle, label: '好友' },
    { id: 'groups' as const, icon: Users, label: '群聊' },
    { id: 'files' as const, icon: FileText, label: '文件' },
    { id: 'webrtc' as const, icon: Video, label: '视频' },
  ]

  // 子标签配置
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
    <div className="h-screen flex flex-col bg-background">
      {/* 顶部导航栏 */}
      <header className="h-16 border-b bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile?.user_avatar_url || user?.avatar_url} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {(profile?.user_nickname || user?.nickname)?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-semibold text-sm">{profile?.user_nickname || user?.nickname || user?.user_id}</span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-muted-foreground">
                {connected ? '已连接' : '未连接'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
            <Settings className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧功能切换栏 */}
        <aside className="w-20 border-r bg-card flex flex-col items-center py-4 gap-2 shrink-0">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              size="icon"
              className={`w-14 h-14 rounded-2xl transition-all ${
                activeTab === tab.id ? 'shadow-lg' : ''
              }`}
              onClick={() => {
                setActiveTab(tab.id)
                setSubTab('main')
              }}
              title={tab.label}
            >
              <tab.icon className="h-6 w-6" />
            </Button>
          ))}
        </aside>

        {/* 中间列表区域 */}
        <div className="w-80 border-r bg-card flex flex-col shrink-0">
          {/* 子标签导航 */}
          {activeTab !== 'webrtc' && (
            <div className="border-b">
              <div className="flex">
                {getSubTabs().map((tab) => (
                  <button
                    key={tab.id}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      subTab === tab.id
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setSubTab(tab.id)}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 搜索框 */}
          {(activeTab !== 'webrtc' && subTab === 'main') && (
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`搜索${activeTab === 'friends' ? '好友' : activeTab === 'groups' ? '群聊' : '文件'}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          )}

          {/* 列表内容 */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'friends' && (
                <motion.div
                  key="friends"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
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
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
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
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  <FileManager 
                    subTab={['main', 'upload'].includes(subTab) ? subTab as 'main' | 'upload' : 'main'} 
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 右侧主内容区 */}
        <main className="flex-1 flex flex-col bg-background">
          <AnimatePresence mode="wait">
            {activeTab === 'webrtc' ? (
              <motion.div
                key="webrtc"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex-1"
              >
                <WebRTCPanel />
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex-1"
              >
                <ChatWindow />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
