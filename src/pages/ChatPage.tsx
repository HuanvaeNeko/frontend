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
  Phone
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useChatStore } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { useWSStore } from '../store/wsStore'
import { useNavigate } from 'react-router-dom'
import FriendList from '../components/chat/FriendList'
import GroupList from '../components/chat/GroupList'
import ChatWindow from '../components/chat/ChatWindow'
import FileManager from '../components/chat/FileManager'
import WebRTCPanel from '../components/chat/WebRTCPanel'

type SubTab = 'main' | 'new' | 'sent' | 'invites' | 'upload'

export default function ChatPage() {
  const navigate = useNavigate()
  const { user, logout, accessToken } = useAuthStore()
  const { profile, loadProfile } = useProfileStore()
  const { activeTab, setActiveTab, wsConnected } = useChatStore()
  const { loadFriends, loadPendingRequests, loadSentRequests } = useFriendsStore()
  const { loadMyGroups } = useGroupStore()
  const { connect: connectWS, disconnect: disconnectWS, connected } = useWSStore()
  
  const [subTab, setSubTab] = useState<SubTab>('main')
  const [searchQuery, setSearchQuery] = useState('')

  // 初始化加载数据
  useEffect(() => {
    if (user && accessToken) {
      // 加载用户资料
      loadProfile().catch(console.error)
      
      // 连接 WebSocket
      connectWS(accessToken)
      
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
    
    // 处理新消息
    wsStore.registerHandler('new_message', (data: unknown) => {
      console.log('收到新消息:', data)
      const { addMessage, updateConversation } = useChatStore.getState()
      // TODO: 解析消息并添加到聊天窗口
      // addMessage(data as Message)
    })

    // 处理好友请求
    wsStore.registerHandler('friend_request', (data: unknown) => {
      console.log('收到好友请求:', data)
      loadPendingRequests().catch(console.error)
    })

    // 处理群邀请
    wsStore.registerHandler('group_invite', (data: unknown) => {
      console.log('收到群邀请:', data)
      loadMyGroups().catch(console.error)
    })

    return () => {
      wsStore.unregisterHandler('new_message')
      wsStore.unregisterHandler('friend_request')
      wsStore.unregisterHandler('group_invite')
    }
  }, [])

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
                  <FriendList subTab={subTab} searchQuery={searchQuery} />
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
                  <GroupList subTab={subTab} searchQuery={searchQuery} />
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
                  <FileManager subTab={subTab} />
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
