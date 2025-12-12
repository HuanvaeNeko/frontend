import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  MessageSquare, 
  Users, 
  Settings, 
  User, 
  Laptop,
  LogOut,
  Bot,
  Video,
  ChevronRight,
  Home
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { cn } from '@/lib/utils'

interface NavItem {
  path: string
  label: string
  icon: React.ElementType
}

const mainNavItems: NavItem[] = [
  { path: '/', label: '消息', icon: MessageSquare },
  { path: '/friends', label: '好友', icon: Users },
  { path: '/ai-chat', label: 'AI 助手', icon: Bot },
  { path: '/video-meeting', label: '视频会议', icon: Video },
]

const settingsNavItems: NavItem[] = [
  { path: '/profile', label: '个人资料', icon: User },
  { path: '/devices', label: '设备管理', icon: Laptop },
  { path: '/settings', label: '设置', icon: Settings },
]

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, clearAuth } = useAuthStore()
  const { profile } = useProfileStore()

  const displayName = profile?.user_nickname || user?.nickname || '用户'
  const avatarUrl = profile?.user_avatar_url || ''

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname === '/chat'
    }
    return location.pathname.startsWith(path)
  }

  // 获取面包屑
  const getBreadcrumbs = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean)
    const breadcrumbs: { label: string; path: string }[] = [
      { label: '首页', path: '/' }
    ]

    const pathLabels: Record<string, string> = {
      'chat': '消息',
      'friends': '好友',
      'ai-chat': 'AI 助手',
      'video-meeting': '视频会议',
      'profile': '个人资料',
      'devices': '设备管理',
      'settings': '设置',
      'group-chat': '群聊',
      'home': '首页',
    }

    let currentPath = ''
    pathSegments.forEach(segment => {
      currentPath += `/${segment}`
      if (pathLabels[segment]) {
        breadcrumbs.push({
          label: pathLabels[segment],
          path: currentPath
        })
      }
    })

    return breadcrumbs
  }

  const breadcrumbs = getBreadcrumbs()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 侧边栏 */}
      <motion.aside
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full z-10"
      >
        {/* 用户信息 */}
        <div className="p-4 border-b">
          <div 
            className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors"
            onClick={() => navigate('/profile')}
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                {displayName[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.user_id}
              </p>
            </div>
          </div>
        </div>

        {/* 主导航 */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground px-3 mb-2">主菜单</p>
          {mainNavItems.map(item => (
            <Button
              key={item.path}
              variant={isActive(item.path) ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3',
                isActive(item.path) && 'bg-primary/10 text-primary hover:bg-primary/15'
              )}
              onClick={() => navigate(item.path)}
            >
              <item.icon size={18} />
              {item.label}
            </Button>
          ))}

          <Separator className="my-4" />

          <p className="text-xs font-medium text-muted-foreground px-3 mb-2">账户设置</p>
          {settingsNavItems.map(item => (
            <Button
              key={item.path}
              variant={isActive(item.path) ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3',
                isActive(item.path) && 'bg-primary/10 text-primary hover:bg-primary/15'
              )}
              onClick={() => navigate(item.path)}
            >
              <item.icon size={18} />
              {item.label}
            </Button>
          ))}
        </nav>

        {/* 底部登出 */}
        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut size={18} />
            退出登录
          </Button>
        </div>
      </motion.aside>

      {/* 主内容区 */}
      <div className="flex-1 ml-64">
        {/* 面包屑导航 */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-10">
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="flex items-center gap-1">
                {index > 0 && (
                  <ChevronRight size={14} className="text-muted-foreground" />
                )}
                {index === 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={() => navigate(crumb.path)}
                  >
                    <Home size={14} />
                    {crumb.label}
                  </Button>
                ) : index === breadcrumbs.length - 1 ? (
                  <span className="text-muted-foreground px-2">{crumb.label}</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => navigate(crumb.path)}
                  >
                    {crumb.label}
                  </Button>
                )}
              </div>
            ))}
          </nav>
        </header>

        {/* 页面内容 */}
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
