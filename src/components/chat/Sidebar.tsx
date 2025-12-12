import { Users, MessagesSquare, FolderOpen, Video, Settings, User, LogOut } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useChatStore, TabType } from '@/store/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useNavigate } from 'react-router-dom'

// 标签动画配置
const tabVariants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: {
      delay: i * 0.1,
      type: 'spring' as const,
      stiffness: 300,
      damping: 20,
    },
  }),
  hover: {
    scale: 1.1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 10 },
  },
  tap: { scale: 0.95 },
}

// 徽章动画
const badgeVariants = {
  initial: { scale: 0 },
  animate: {
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 500, damping: 15 },
  },
  pulse: {
    scale: [1, 1.2, 1],
    transition: { duration: 0.5, repeat: Infinity, repeatDelay: 2 },
  },
}

// 在线状态动画
const onlineIndicatorVariants = {
  offline: { backgroundColor: '#9ca3af' },
  online: {
    backgroundColor: '#4ade80',
    boxShadow: ['0 0 0 0 rgba(74, 222, 128, 0.4)', '0 0 0 8px rgba(74, 222, 128, 0)', '0 0 0 0 rgba(74, 222, 128, 0)'],
    transition: {
      boxShadow: { duration: 2, repeat: Infinity },
    },
  },
}

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
    <motion.div
      className="w-20 bg-gradient-to-b from-blue-600 to-purple-600 flex flex-col items-center py-4 gap-2"
      initial={{ x: -80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* 用户头像 */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <motion.button
            className="relative group mb-4"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            <Avatar className="h-12 w-12 border-2 border-white/20 group-hover:border-white/40 transition-all cursor-pointer">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-white/20 text-white">
                {user?.nickname?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            {/* 在线状态指示器 */}
            <motion.div
              className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white"
              variants={onlineIndicatorVariants}
              animate={wsConnected ? 'online' : 'offline'}
            />
          </motion.button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="min-w-[200px] bg-white rounded-lg shadow-xl border p-1"
            sideOffset={10}
            side="right"
            asChild
          >
            <motion.div
              initial={{ opacity: 0, x: -10, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
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
            </motion.div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* 分隔线 */}
      <motion.div
        className="w-12 h-px bg-white/20 mb-2"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      />

      {/* 功能标签 */}
      {tabs.map((tab, index) => (
        <motion.button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`relative w-14 h-14 rounded-xl flex flex-col items-center justify-center group ${
            activeTab === tab.id
              ? 'bg-white text-blue-600 shadow-lg'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          }`}
          variants={tabVariants}
          initial="initial"
          animate="animate"
          whileHover="hover"
          whileTap="tap"
          custom={index}
        >
          {/* 选中状态背景动画 */}
          <AnimatePresence>
            {activeTab === tab.id && (
              <motion.div
                className="absolute inset-0 bg-white rounded-xl shadow-lg"
                layoutId="activeTab"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </AnimatePresence>
          
          <motion.div
            className="relative z-10"
            animate={activeTab === tab.id ? { color: '#2563eb' } : { color: 'inherit' }}
          >
            <tab.icon size={24} />
          </motion.div>
          
          {/* 未读消息徽章 */}
          <AnimatePresence>
            {tab.id === 'friends' && totalUnreadCount > 0 && (
              <motion.span
                className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 min-w-[20px] flex items-center justify-center px-1"
                variants={badgeVariants}
                initial="initial"
                animate={['animate', 'pulse']}
                exit={{ scale: 0, opacity: 0 }}
              >
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </motion.span>
            )}
          </AnimatePresence>
          
          {/* Tooltip */}
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
            {tab.label}
          </div>
        </motion.button>
      ))}

      {/* 底部设置按钮 */}
      <div className="flex-1" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="w-14 h-14 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all"
          onClick={() => navigate('/settings')}
        >
          <motion.div
            whileHover={{ rotate: 90 }}
            transition={{ duration: 0.3 }}
          >
            <Settings size={24} />
          </motion.div>
        </Button>
      </motion.div>
    </motion.div>
  )
}
