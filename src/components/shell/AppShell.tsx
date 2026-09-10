import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useI18n } from '@/i18n/I18nProvider'
import { usePathname } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { MobileTabBar } from './MobileTabBar'
import { Sidebar } from './Sidebar'
import { backTargetOf, isDetailPath } from './shellFold'
import { useShellFold } from './useShellFold'

interface AppShellProps {
  activeTab: 'chat' | 'contacts' | 'settings'
  list: ReactNode
  children: ReactNode
}

const bg = 'h-[100dvh] w-screen overflow-hidden bg-[var(--gradient-bg-page)] text-foreground'

/**
 * APP Main.tsx 的三栏 + spec §3 的折叠：
 * - desktop：Sidebar 60 ｜ 列表 320 ｜ 内容
 * - tablet：Sidebar 60 ｜（列表｜内容）二选一，内容顶部有「返回列表」
 * - phone：（列表｜内容）二选一 + 底部条；内容态底部条让位
 * 折叠且无选中项时 children 仍挂在 hidden 容器里：模态框路由的 Dialog 是 portal，照常弹出。
 */
export function AppShell({ activeTab, list, children }: AppShellProps) {
  const { t } = useI18n()
  const fold = useShellFold()
  const pathname = usePathname()
  const detail = isDetailPath(pathname)
  const conversationName = useChatStore((s) => s.selectedConversation?.name)

  if (fold === 'desktop') {
    return (
      <div className={`grid grid-cols-[60px_320px_1fr] ${bg}`}>
        <Sidebar activeTab={activeTab} />
        <section data-testid="list-column" className="glass-surface flex min-h-0 flex-col border-r border-[var(--glass-border)]">{list}</section>
        <main data-testid="content-column" className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">{children}</main>
      </div>
    )
  }

  const back = backTargetOf(pathname, activeTab === 'contacts' ? 'contacts' : 'chat')
  const title = pathname.startsWith(`${ROUTES.app.chat}/`) ? (conversationName ?? '') : ''
  const pane = detail ? (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div data-testid="fold-back-bar" className="glass-surface flex h-12 shrink-0 items-center gap-1 border-b border-[var(--glass-border)] px-1">
        <NavLink to={back} aria-label={t('shell.nav.backToList')} title={t('shell.nav.backToList')} className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--primary-subtle)] hover:text-primary">
          <ChevronLeft className="h-6 w-6" />
        </NavLink>
        <span className="truncate text-[15px] font-semibold text-foreground">{title}</span>
      </div>
      <main data-testid="content-column" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  ) : (
    <>
      <section data-testid="list-column" className="glass-surface flex min-h-0 min-w-0 flex-1 flex-col">{list}</section>
      <div hidden>{children}</div>
    </>
  )

  if (fold === 'tablet') {
    return (
      <div className={`grid grid-cols-[60px_1fr] ${bg}`}>
        <Sidebar activeTab={activeTab} />
        <div className="flex min-h-0 min-w-0 flex-col">{pane}</div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${bg}`}>
      {pane}
      {!detail && <MobileTabBar activeTab={activeTab} />}
    </div>
  )
}
