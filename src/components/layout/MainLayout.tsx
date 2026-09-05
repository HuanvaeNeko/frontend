'use client'

import { DesktopSidebar, MobileTabBar } from './app-shell/Navigation'
import { usePathname } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'

interface MainLayoutProps {
  children: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname()
  
  // 视频会议页面通常需要全屏，没有任何 Shell 元素
  const isVideoMeeting = pathname === ROUTES.app.videoMeeting || pathname?.startsWith(`${ROUTES.app.videoMeeting}/`)

  if (isVideoMeeting) {
    return (
      <div className="h-[100dvh] w-screen bg-background overflow-hidden">
        {children}
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-background">
      {/* Desktop Sidebar (Left) - Always visible on desktop, shrink-0 prevents compression */}
      <div className="shrink-0 hidden md:flex h-full border-r bg-card/50 backdrop-blur-xl z-40">
        <DesktopSidebar />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>

        {/* Mobile Tab Bar (Bottom) */}
        <MobileTabBar />
      </main>
    </div>
  )
}
