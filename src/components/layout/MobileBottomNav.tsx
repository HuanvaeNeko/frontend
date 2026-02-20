'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Bot, MessageSquare, User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES, isRouteActive } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'

export function MobileBottomNav() {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useI18n()

  const items = [
    { path: ROUTES.app.chat, label: t('nav.messages'), icon: MessageSquare },
    { path: ROUTES.app.friends, label: t('nav.friends'), icon: Users },
    { path: ROUTES.app.aiChat, label: t('nav.aiAssistant'), icon: Bot },
    { path: ROUTES.app.profile, label: t('nav.profile'), icon: User },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        {items.map((item) => {
          const isActive = isRouteActive(pathname, item.path)
          return (
            <button
              key={item.path}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 transition-colors touch-target",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground active:bg-muted/50"
              )}
              onClick={() => router.push(item.path)}
            >
              <item.icon className={cn("h-6 w-6 transition-transform", isActive && "scale-110")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
