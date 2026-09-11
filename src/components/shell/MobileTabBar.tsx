import { MessageCircle, MoreHorizontal, Settings, UserRound, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatUnreadCount } from '@/features/chat/lib/formatUnreadCount'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useI18n } from '@/i18n/I18nProvider'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { SIDEBAR_TOOLS } from './sidebarTools'

const tabBtn = 'relative flex h-full min-w-[64px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground [&>svg]:h-6 [&>svg]:w-6'
const tabActive = 'text-primary'
const row = 'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[14px] text-foreground transition-colors hover:bg-[var(--primary-subtle)] [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:text-muted-foreground'

/**
 * `Link` 而不是 `NavLink`：`NavLink` 自己按 `to` 与当前 URL 算 isActive，再用它
 * 同时决定 aria-current 的取值*和*要不要渲染——调用方传的 aria-current prop 只在
 * NavLink 自己判定的 isActive 为真时才生效。模态框路由（如 `/app/files`）下 URL
 * 跟聊天/联系人都不匹配，但底部条该高亮的是记住的那个 tab（`activeTab`）：
 * 高亮类名（下面的 `active && tabActive`）已经跟着 `active` 走，NavLink 却仍会
 * 按 URL 结果省略 aria-current，让「看起来选中」与「读屏器读到的当前项」对不上
 * （终审 finding #9）。换成 `Link`，aria-current 只由 `active` 一个来源决定。
 */
function TabLink({ to, label, icon: Icon, active, badge, testId }: { to: string; label: string; icon: LucideIcon; active: boolean; badge: string; testId: string }) {
  return (
    <Link to={to} aria-label={label} aria-current={active ? 'page' : undefined} className={cn(tabBtn, active && tabActive)}>
      <span className="relative">
        <Icon />
        {badge && <span data-testid={testId} className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-unread px-1 text-[10px] font-semibold text-[var(--unread-badge-text)]">{badge}</span>}
      </span>
      <span>{label}</span>
    </Link>
  )
}

/** <768px 的底部条（spec §3）：聊天 / 联系人 / 更多。「更多」列出全部工具 + 个人资料 + 设置（手机上没有竖侧栏，这两项只能从这里进） */
export function MobileTabBar({ activeTab }: { activeTab: 'chat' | 'contacts' | 'settings' }) {
  const { t } = useI18n()
  const totalUnread = useChatStore((s) => s.totalUnreadCount)
  const pendingCount = useFriendsStore((s) => s.pendingRequests.length)
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <nav data-testid="mobile-tab-bar" className="glass-surface flex h-[60px] shrink-0 items-stretch justify-around border-t border-[var(--glass-border)] pb-[env(safe-area-inset-bottom)]">
      <TabLink to={ROUTES.app.chat} label={t('shell.nav.chat')} icon={MessageCircle} active={activeTab === 'chat'} badge={formatUnreadCount(totalUnread)} testId="badge-chat" />
      <TabLink to={ROUTES.app.contacts} label={t('shell.nav.contacts')} icon={Users} active={activeTab === 'contacts'} badge={formatUnreadCount(pendingCount)} testId="badge-contacts" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={t('shell.nav.more')} className={cn(tabBtn, open && tabActive)}>
            <MoreHorizontal />
            <span>{t('shell.nav.more')}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="glass-surface w-[220px] rounded-lg border-[var(--glass-border)] p-2">
          <div className="flex flex-col gap-0.5">
            {SIDEBAR_TOOLS.map((tool) => (
              <NavLink key={tool.key} to={tool.to} onClick={close} className={row}><tool.icon /><span>{t(tool.labelKey)}</span></NavLink>
            ))}
            <div className="my-1 border-t border-[var(--border-subtle)]" />
            <NavLink to={ROUTES.app.profile} onClick={close} className={row}><UserRound /><span>{t('shell.nav.profile')}</span></NavLink>
            <NavLink to={ROUTES.app.settings} onClick={close} className={row}><Settings /><span>{t('shell.nav.settings')}</span></NavLink>
          </div>
        </PopoverContent>
      </Popover>
    </nav>
  )
}
