'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  Bot,
  ChevronRight,
  Download,
  Home,
  Laptop,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  User,
  Users,
  Video,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useProfileStore } from '@/store/profileStore'
import { useUIStore } from '@/store/uiStore'
import { playTap } from '@/hooks/useSound'
import { RELEASE_PAGE_URL, fetchInstallTargets } from '@/lib/appInstall'
import { DEFAULT_UNAUTHENTICATED_ROUTE, ROUTES, getRouteBreadcrumbs, isRouteActive } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'

interface NavItem {
  path: string
  label: string
  icon: React.ElementType
}

interface MainLayoutProps {
  children: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useI18n()
  const { user, clearAuth } = useAuthStore()
  const { profile } = useProfileStore()
  const { openProfileModal } = useUIStore()
  const [installUrl, setInstallUrl] = useState(RELEASE_PAGE_URL)

  const displayName = profile?.user_nickname || user?.nickname || '用户'
  const avatarUrl = profile?.user_avatar_url || ''

  useEffect(() => {
    let cancelled = false
    void fetchInstallTargets().then((targets) => {
      if (!targets || cancelled) return
      setInstallUrl(targets.normalUrl)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = () => {
    clearAuth()
    router.push(DEFAULT_UNAUTHENTICATED_ROUTE)
  }

  const handleNavigation = (path: string) => {
    router.push(path)
  }

  const isActive = (path: string) => {
    return isRouteActive(pathname, path)
  }

  const mainNavItems: NavItem[] = [
    { path: ROUTES.app.chat, label: t('nav.messages'), icon: MessageSquare },
    { path: ROUTES.app.friends, label: t('nav.friends'), icon: Users },
    { path: ROUTES.app.aiChat, label: t('nav.aiAssistant'), icon: Bot },
    { path: ROUTES.app.videoMeeting, label: t('nav.videoMeeting'), icon: Video },
  ]

  const settingsNavItems: NavItem[] = [
    { path: ROUTES.app.devices, label: t('nav.devices'), icon: Laptop },
    { path: ROUTES.app.settings, label: t('nav.settings'), icon: Settings },
  ]

  const breadcrumbs = getRouteBreadcrumbs(pathname, (segment) => {
    const keyMap: Record<string, string> = {
      home: 'nav.home',
      chat: 'nav.messages',
      friends: 'nav.friends',
      'ai-chat': 'nav.aiAssistant',
      'video-meeting': 'nav.videoMeeting',
      devices: 'nav.devices',
      settings: 'nav.settings',
      profile: 'nav.profile',
      groups: 'nav.groups',
      files: 'nav.files',
      webrtc: 'nav.webrtc',
    }
    const key = keyMap[segment]
    return key ? t(key) : segment
  })

  const handleOpenProfile = () => {
    playTap()
    openProfileModal()
  }

  const SidebarContent = () => (
    <>
      <div className="border-b p-4">
        <button className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent" onClick={handleOpenProfile}>
          <Avatar className="h-10 w-10">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback>{displayName[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.user_id}</div>
          </div>
          <Badge variant="secondary" className="text-[10px]">{t('layout.online')}</Badge>
        </button>
      </div>

      <ScrollArea className="flex-1">
        <nav className="space-y-4 p-4">
          <div className="space-y-1">
            <div className="px-2 text-xs font-medium text-muted-foreground">{t('layout.mainMenu')}</div>
            {mainNavItems.map((item) => (
              <Button
                key={item.path}
                variant={isActive(item.path) ? 'secondary' : 'ghost'}
                className={cn('w-full justify-start gap-2.5', isActive(item.path) && 'bg-primary/10 text-primary hover:bg-primary/15')}
                onClick={() => handleNavigation(item.path)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </div>

          <Separator />

          <div className="space-y-1">
            <div className="px-2 text-xs font-medium text-muted-foreground">{t('layout.accountAndSystem')}</div>
            <Button variant="ghost" className="w-full justify-start gap-2.5" onClick={handleOpenProfile}>
              <User className="h-4 w-4" />{t('nav.profile')}
            </Button>
            {settingsNavItems.map((item) => (
              <Button
                key={item.path}
                variant={isActive(item.path) ? 'secondary' : 'ghost'}
                className={cn('w-full justify-start gap-2.5', isActive(item.path) && 'bg-primary/10 text-primary hover:bg-primary/15')}
                onClick={() => handleNavigation(item.path)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
            <Button variant="ghost" className="w-full justify-start gap-2.5" onClick={() => window.open(installUrl, '_blank', 'noopener,noreferrer')}>
              <Download className="h-4 w-4" />{t('layout.installApp')}
            </Button>
          </div>
        </nav>
      </ScrollArea>

      <div className="border-t p-4">
        <Button variant="ghost" className="w-full justify-start gap-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />{t('layout.logout')}
        </Button>
      </div>
    </>
  )

  return (
    <div className="app-screen flex bg-muted/30">
      <aside className="fixed hidden h-full w-72 border-r bg-card  md:flex md:flex-col">
        <SidebarContent />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col md:ml-72">
        <header className="mobile-top-safe sticky top-0 z-30 border-b bg-card px-3 py-2.5 sm:px-4 md:px-6">
          <nav className="flex items-center gap-1.5 text-sm">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[88vw] max-w-[340px] p-0">
                <div className="flex h-full flex-col"><SidebarContent /></div>
              </SheetContent>
            </Sheet>

            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {index === 0 ? (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => handleNavigation(crumb.path)}>
                    <Home className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{crumb.label}</span>
                  </Button>
                ) : index === breadcrumbs.length - 1 ? (
                  <span className="px-2 text-muted-foreground">{crumb.label}</span>
                ) : (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleNavigation(crumb.path)}>
                    {crumb.label}
                  </Button>
                )}
              </div>
            ))}
          </nav>
        </header>

        <main className="app-page-scroll min-h-0 flex-1 mobile-bottom-safe">{children}</main>
      </div>
    </div>
  )
}
