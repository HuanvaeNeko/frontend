'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
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
  Home,
  Menu,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/uiStore'
import { playTap } from '@/hooks/useSound'

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
  { path: '/devices', label: '设备管理', icon: Laptop },
  { path: '/settings', label: '设置', icon: Settings },
]

interface MainLayoutProps {
  children: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, clearAuth } = useAuthStore()
  const { profile } = useProfileStore()
  const { openProfileModal } = useUIStore()

  const displayName = profile?.user_nickname || user?.nickname || '用户'
  const avatarUrl = profile?.user_avatar_url || ''

  // 路由变化时关闭移动端菜单
  useEffect(() => {
    // Sheet 自动处理关闭，不需要额外状态
  }, [pathname])

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  const handleNavigation = (path: string) => {
    router.push(path)
  }

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/' || pathname === '/chat'
    }
    return pathname?.startsWith(path) ?? false
  }

  const getBreadcrumbs = () => {
    const pathSegments = pathname?.split('/').filter(Boolean) || []
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
        breadcrumbs.push({ label: pathLabels[segment], path: currentPath })
      }
    })

    return breadcrumbs
  }

  const breadcrumbs = getBreadcrumbs()

  const handleOpenProfile = () => {
    playTap()
    openProfileModal()
  }

  const SidebarContent = () => (
    <>
      {/* 用户信息 */}
      <div className="p-4 border-b border-border">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:bg-accent rounded-lg p-2 -m-2 transition-colors"
          onClick={handleOpenProfile}
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {displayName[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.user_id}
            </p>
          </div>
        </div>
      </div>

      {/* 主导航 */}
      <ScrollArea className="flex-1">
        <nav className="p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-3 mb-2">主菜单</p>
          {mainNavItems.map(item => (
            <Button
              key={item.path}
              variant={isActive(item.path) ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3',
                isActive(item.path) && 'bg-primary/10 text-primary hover:bg-primary/15'
              )}
              onClick={() => handleNavigation(item.path)}
            >
              <item.icon size={18} />
              {item.label}
            </Button>
          ))}

          <Separator className="my-4" />

          <p className="text-xs font-medium text-muted-foreground px-3 mb-2">账户设置</p>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={handleOpenProfile}
          >
            <User size={18} />
            个人资料
          </Button>
          
          {settingsNavItems.map(item => (
            <Button
              key={item.path}
              variant={isActive(item.path) ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3',
                isActive(item.path) && 'bg-primary/10 text-primary hover:bg-primary/15'
              )}
              onClick={() => handleNavigation(item.path)}
            >
              <item.icon size={18} />
              {item.label}
            </Button>
          ))}
        </nav>
      </ScrollArea>

      {/* 底部登出 */}
      <div className="p-4 border-t border-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
        >
          <LogOut size={18} />
          退出登录
        </Button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-muted/50 flex">
      {/* 桌面端侧边栏 */}
      <aside className="w-64 bg-card border-r border-border flex-col fixed h-full z-10 hidden md:flex">
        <SidebarContent />
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 md:ml-64 min-h-0 flex flex-col">
        {/* 面包屑导航 */}
        <header className="bg-card border-b border-border px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 sticky top-0 z-10 safe-area-inset-top">
          <nav className="flex items-center gap-2 text-sm">
            {/* 移动端菜单 */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 w-9 min-h-[44px] min-w-[44px] p-0 md:hidden touch-target">
                  <Menu size={22} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[85vw] max-w-[320px] flex flex-col">
                <SidebarContent />
              </SheetContent>
            </Sheet>

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
                    onClick={() => handleNavigation(crumb.path)}
                  >
                    <Home size={14} />
                    <span className="hidden sm:inline">{crumb.label}</span>
                  </Button>
                ) : index === breadcrumbs.length - 1 ? (
                  <span className="text-muted-foreground px-2">{crumb.label}</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => handleNavigation(crumb.path)}
                  >
                    {crumb.label}
                  </Button>
                )}
              </div>
            ))}
          </nav>
        </header>

        <main className="flex-1 min-h-0 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
