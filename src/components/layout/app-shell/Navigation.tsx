'use client'

import { cn } from '@/lib/utils'
import { type LucideIcon, Bot, Settings, User, LogOut, Video, Users, FileText, MessageSquare, Globe, Monitor } from 'lucide-react'
import { AppLink as Link } from '@/components/common/AppLink'
import { usePathname } from '@/lib/navigation'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { ROUTES } from '@/lib/routes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { motion } from 'framer-motion'
import { useEffect } from 'react'

import { useFriendsStore } from '@/features/chat/store/friendsStore'

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
    label: '好友',
    icon: Users,
    path: ROUTES.app.chatFriends,
    activeMatch: (p) => p === ROUTES.app.chat || p.startsWith(ROUTES.app.chatFriends),
    badge: () => {
      const summary = useChatStore.getState().unreadSummary
      const pending = useFriendsStore.getState().pendingRequests
      const chatUnreads = (summary?.friend_unreads.reduce((sum, u) => sum + u.unread_count, 0) ?? 0)
      const pendingCount = pending?.length ?? 0
      return chatUnreads + pendingCount
    }
  },
  {
    id: 'groups',
    label: '群聊',
    icon: MessageSquare,
    path: ROUTES.app.chatGroups,
    activeMatch: (p) => p.startsWith(ROUTES.app.chatGroups)
  },
  {
    id: 'files',
    label: '文件',
    icon: FileText,
    path: ROUTES.app.chatFiles,
    activeMatch: (p) => p.startsWith(ROUTES.app.chatFiles)
  },
  {
    id: 'webrtc',
    label: '会议',
    icon: Video,
    path: ROUTES.app.chatWebrtc,
    activeMatch: (p) => p.startsWith(ROUTES.app.chatWebrtc) || p.startsWith(ROUTES.app.videoMeeting),
  },
  {
    id: 'devices',
    label: '设备',
    icon: Monitor,
    path: ROUTES.app.devices,
    activeMatch: (p) => p.startsWith(ROUTES.app.devices)
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
  const { user, logout } = useAuthStore()
  const { profile } = useProfileStore()

  /**
   * 侧栏头像的地址。**在这里读的时候补基址**，不假设上游已经补好——那个假设是错的：
   *
   * - `profile.user_avatar_url`：`profileApi.getProfile` 出口确实补过，落盘的旧值也由
   *   `profileStore` 的 persist migrate 搬平了。这一支是安全的。
   * - `user.avatar_url`（`authStore`）：登录时的补基址是本分支上的改动，**还没进 main**；
   *   `auth-storage` 的 `version` / `migrate` 也是本分支才加的（`migrateAuthPersist`，
   *   提交 `400992d`），在此之前它两者皆无、`refreshAccessToken` 又从不重写 `user`。
   *   也就是说：**已经部署出去的用户**落盘的仍是相对路径，要等他的浏览器加载到本分支
   *   的代码、rehydrate 跑一次 migrate 之后才会变绝对。这一支在那之前是相对路径，
   *   它非空、`||` 会选中它，于是下面那个首字母兜底根本不会触发，用户拿到的正是
   *   兜底本该防住的那个碎图标。
   *
   * `toAbsoluteApiUrl` 幂等（已带协议的原样返回），所以对已经绝对的值是 no-op；
   * 空串 / `null` / `undefined` 一律得到 `undefined`，`?? null` 归一成"没有头像"。
   * 读时归一还有一个 persist migrate 给不了的性质：它**每次渲染重新求值**，而迁移
   * 只跑一次、把值冻结在迁移那一刻的基址上——本项目会故意改基址（本地无 SNI 反代）。
   *
   * 这里不是 `<Avatar>` 而是一个**裸 `<img>`**，所以它比另外两个渲染点更脆：
   * - `src=""` 会让 React 打出
   *   `An empty string ("") was passed to the src attribute. This may cause the browser
   *   to download the whole page again over the network.`（React 19 dev 构建原文，
   *   `react-dom/cjs/react-dom-client.development.js`），处方也是 React 自己给的：
   *   **不渲染这个元素**，或者传 null。Radix 的 `<AvatarImage>` 不会有这个问题
   *   （1.2.6 实测 `if (!src) { setLoadingStatus('error'); return }`，压根不发请求），
   *   裸 `<img>` 没有那层短路。
   * - 没有 `<AvatarFallback>` 兜底，src 不可用时留下的是一个碎图标。
   *
   * 所以：先归一（`''`/`null`/`undefined` 一律当成"没有头像"），有值才渲染 `<img>`，
   * 没有就渲染和 `<AvatarFallback>` 同形的首字母块。`||` 而不是 `??` 是有意的——
   * 空串必须继续往后找 `user?.avatar_url`，而不是被当成一个有效地址。
   *
   * （`Navigation.test.tsx` 用一条渲染裸 `<img src="">` 的**正对照**先证明这句警告
   * 在本环境真的会出现，再断言本组件不产生它——否则"没有警告"是句空话。）
   */
  const avatarSrc = toAbsoluteApiUrl(profile?.user_avatar_url || user?.avatar_url) ?? null
  const avatarInitial = (profile?.user_nickname || user?.nickname || 'U')[0]?.toUpperCase() ?? 'U'

  // Save last visited path
  useEffect(() => {
    if (pathname && pathname.startsWith('/app') && pathname !== ROUTES.auth.login && pathname !== ROUTES.auth.register) {
      localStorage.setItem('last_visited_path', pathname)
    }
  }, [pathname])

  return (
    <aside className="flex w-[80px] flex-col items-center border-r bg-card/50 backdrop-blur-xl py-6 h-full shrink-0 shadow-sm z-50">
      {/* Avatar / Profile Trigger */}
      <div className="mb-8">
         <Link href={ROUTES.app.profile}>
           <motion.div 
             whileHover={{ scale: 1.05 }}
             whileTap={{ scale: 0.95 }}
             className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-border hover:ring-primary transition-all shadow-sm cursor-pointer"
           >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt="Avatar"
                  className="w-full h-full object-cover bg-muted"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-semibold text-muted-foreground">
                  {avatarInitial}
                </div>
              )}
           </motion.div>
         </Link>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-3 w-full px-3 items-center overflow-y-auto no-scrollbar py-2">
        <TooltipProvider delayDuration={0}>
          {NAV_ITEMS.filter(item => item.id !== 'profile').map((item) => {
            const isActive = item.activeMatch(pathname || '')
            const badgeCount = item.badge ? item.badge() : 0
            
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.path}
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
                  </Link>
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
              <a 
                href="https://huanvae.cn" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Globe className="w-5 h-5" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">官方网站</TooltipContent>
          </Tooltip>

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
  // 移动端通常不需要所有导航项，或者折叠
  // 这里选取核心的 4-5 个
  const mobileItems = NAV_ITEMS.filter(item => ['chat', 'webrtc', 'ai-chat', 'profile', 'devices'].includes(item.id))

  return (
    <nav className="md:hidden h-[64px] border-t bg-background/80 backdrop-blur-xl flex items-center justify-around px-2 shrink-0 safe-area-inset-bottom z-50 shadow-[0_-1px_10px_rgba(0,0,0,0.02)]">
      {mobileItems.map((item) => {
        const isActive = item.activeMatch(pathname || '')
        const badgeCount = item.badge ? item.badge() : 0

        return (
          <Link
            key={item.id}
            href={item.path}
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
          </Link>
        )
      })}
    </nav>
  )
}
