import { Users, MessagesSquare, FolderOpen, Video, Settings, User, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useChatStore, TabType } from '@/store/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useNavigate } from 'react-router-dom'

export default function Sidebar() {
  const { activeTab, setActiveTab, totalUnreadCount, wsConnected } = useChatStore()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (error) {
      console.error('登出失败:', error)
    }
  }

  const tabs: Array<{ id: TabType; icon: typeof Users; label: string }> = [
    { id: 'friends', icon: Users, label: '好友' },
    { id: 'groups', icon: MessagesSquare, label: '群聊' },
    { id: 'files', icon: FolderOpen, label: '文件' },
    { id: 'webrtc', icon: Video, label: '视频' },
  ]

  return (
    <div className="w-20 bg-gradient-to-b from-blue-600 to-purple-600 flex flex-col items-center py-4 gap-2">
      {/* 用户头像 */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="relative group mb-4">
            <Avatar className="h-12 w-12 border-2 border-white/20 group-hover:border-white/40 transition-all cursor-pointer">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-white/20 text-white">
                {user?.nickname?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            {/* 在线状态指示器 */}
            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
              wsConnected ? 'bg-green-400' : 'bg-gray-400'
            }`} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="min-w-[200px] bg-white rounded-lg shadow-xl border p-1" sideOffset={10} side="right">
            <div className="px-3 py-2 border-b">
              <div className="font-semibold">{user?.nickname || user?.user_id}</div>
              <div className="text-xs text-gray-500">{user?.email}</div>
            </div>
            <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded outline-none" onSelect={() => navigate('/profile')}>
              <User size={16} />个人资料
            </DropdownMenu.Item>
            <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded outline-none" onSelect={() => navigate('/settings')}>
              <Settings size={16} />设置
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
            <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-red-50 text-red-600 rounded outline-none" onSelect={handleLogout}>
              <LogOut size={16} />登出
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* 分隔线 */}
      <div className="w-12 h-px bg-white/20 mb-2" />

      {/* 功能标签 */}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`relative w-14 h-14 rounded-xl flex flex-col items-center justify-center transition-all group ${
            activeTab === tab.id
              ? 'bg-white text-blue-600 shadow-lg'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          <tab.icon size={24} />
          {/* 未读消息徽章 */}
          {tab.id === 'friends' && totalUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
            </span>
          )}
          {/* Tooltip */}
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {tab.label}
          </div>
        </button>
      ))}

      {/* 底部设置按钮 */}
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        className="w-14 h-14 rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
        onClick={() => navigate('/settings')}
      >
        <Settings size={24} />
      </Button>
    </div>
  )
}
