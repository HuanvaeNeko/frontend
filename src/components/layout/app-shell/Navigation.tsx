'use client'

import { cn } from '@/lib/utils'
import { type LucideIcon, MessageCircle, Bot, Settings, User, LogOut, Video } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { ROUTES } from '@/lib/routes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { motion } from 'framer-motion'

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  path: string
  activeMatch: (pathname: string) => boolean
  badge?: () => number
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'chat',
    label: '消息',
    icon: MessageCircle,
    path: ROUTES.app.chat,
    activeMatch: (p) => p === ROUTES.app.chat || (p.startsWith(ROUTES.app.chat + '/') && !p.startsWith(ROUTES.app.chatWebrtc) && !p.startsWith(ROUTES.app.friends)),
    badge: () => {
      const summary = useChatStore.getState().unreadSummary
      return (summary?.friend_unreads.reduce((sum, u) => sum + u.unread_count, 0) ?? 0) +
             (summary?.group_unreads.reduce((sum, u) => sum + u.unread_count, 0) ?? 0)
    }
  },
  {
    id: 'webrtc',
    label: '会议',
    icon: Video,
    path: ROUTES.app.videoMeeting,
    activeMatch: (p) => p.startsWith(ROUTES.app.chatWebrtc) || p.startsWith(ROUTES.app.videoMeeting),
  },
  {
    id: 'ai-chat',
    label: 'AI 助手',
    icon: Bot,
    path: ROUTES.app.aiChat,
    activeMatch: (p) => p.startsWith(ROUTES.app.aiChat)
  },
  {
    id: 'profile',
    label: '我的',
    icon: User,
    path: ROUTES.app.profile,
    activeMatch: (p) => p.startsWith(ROUTES.app.profile)
  },
  {
    id: 'settings',
    label: '设置',
    icon: Settings,
    path: ROUTES.app.settings,
    activeMatch: (p) => p.startsWith(ROUTES.app.settings)
  }
]

export function DesktopSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const { profile } = useProfileStore()

  return (
    <aside className="flex w-[80px] flex-col items-center border-r bg-card/50 backdrop-blur-xl py-6 h-full shrink-0 shadow-sm z-50">
      {/* Avatar / Profile Trigger */}
      <div className="mb-8">
         <motion.button 
           whileHover={{ scale: 1.05 }}
           whileTap={{ scale: 0.95 }}
           onClick={() => router.push(ROUTES.app.profile)}
           className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-border hover:ring-primary transition-all shadow-sm"
         >
            <img 
              src={profile?.user_avatar_url || user?.avatar_url} 
              alt="Avatar" 
              className="w-full h-full object-cover bg-muted"
            />
         </motion.button>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-3 w-full px-3 items-center">
        <TooltipProvider delayDuration={0}>
          {NAV_ITEMS.filter(item => item.id !== 'profile').map((item) => {
            const isActive = item.activeMatch(pathname || '')
            const badgeCount = item.badge ? item.badge() : 0
            
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => router.push(item.path)}
                    className={cn(
                      "relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("w-6 h-6 transition-transform duration-300", isActive ? "scale-100" : "group-hover:scale-110")} />
                    
                    {/* Active Indicator Dot (Optional style choice) */}
                    {!isActive && <div className="absolute left-0 w-1 h-0 bg-primary rounded-r-full transition-all group-hover:h-5 opacity-0 group-hover:opacity-100" />}

                    {badgeCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-background shadow-sm animate-in zoom-in">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="font-medium bg-foreground text-background">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </TooltipProvider>
      </nav>

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col gap-3 pb-2">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                onClick={logout}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">退出登录</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </aside>
  )
}

export function MobileTabBar() {
  const pathname = usePathname()
  const router = useRouter()
  // 移动端通常不需要所有导航项，或者折叠
  // 这里选取核心的 4-5 个
  const mobileItems = NAV_ITEMS.filter(item => ['chat', 'webrtc', 'ai-chat', 'profile'].includes(item.id))

  return (
    <nav className="md:hidden h-[64px] border-t bg-background/80 backdrop-blur-xl flex items-center justify-around px-2 shrink-0 safe-area-inset-bottom z-50 shadow-[0_-1px_10px_rgba(0,0,0,0.02)]">
      {mobileItems.map((item) => {
        const isActive = item.activeMatch(pathname || '')
        const badgeCount = item.badge ? item.badge() : 0

        return (
          <button
            key={item.id}
            onClick={() => router.push(item.path)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 w-16 h-full",
              isActive ? "text-primary" : "text-muted-foreground/60 hover:text-muted-foreground"
            )}
          >
            <div className={cn("relative p-1.5 rounded-xl transition-all", isActive && "bg-primary/10")}>
              <item.icon className={cn("w-6 h-6 transition-all duration-300", isActive && "scale-105")} strokeWidth={isActive ? 2.5 : 2} />
              {badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-background shadow-sm">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </div>
            <span className={cn("text-[10px] font-medium transition-all", isActive ? "text-primary" : "text-muted-foreground/60")}>
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
