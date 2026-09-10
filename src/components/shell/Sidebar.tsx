import { MessageCircle, Moon, MoreHorizontal, Settings, Sun, Users } from 'lucide-react'
import { Link, NavLink } from 'react-router'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuthStore } from '@/features/auth/store/authStore'
import { formatUnreadCount } from '@/features/chat/lib/formatUnreadCount'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { useI18n } from '@/i18n/I18nProvider'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWSStore } from '@/store/wsStore'
import { SIDEBAR_TOOLS, type SidebarTool } from './sidebarTools'

interface SidebarProps {
  /** 'settings' 时两个 tab 都不高亮——设置没有自己的 nav-btn，靠底部的 NavLink 按 URL 自己高亮 */
  activeTab: 'chat' | 'contacts' | 'settings'
  /** 第 9 步：钉在侧栏上的工具；本任务恒空 */
  pinnedTools?: ReadonlyArray<SidebarTool>
}

/** APP .nav-btn：42px 圆角 12，hover 主色淡底，active 渐变底 */
const navBtn = 'flex h-[42px] w-[42px] items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-[var(--primary-subtle)] hover:text-primary [&>svg]:h-[22px] [&>svg]:w-[22px]'
const navBtnActive = 'bg-[var(--primary-subtle)] text-[var(--primary-hover)]'

function Badge({ value, testId }: { value: string; testId: string }) {
  if (!value) return null
  return (
    <span data-testid={testId} className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-unread px-1 text-[10px] font-semibold text-[var(--unread-badge-text)]">
      {value}
    </span>
  )
}

export function Sidebar({ activeTab, pinnedTools = [] }: SidebarProps) {
  const { t } = useI18n()
  const totalUnread = useChatStore((s) => s.totalUnreadCount)
  const pendingCount = useFriendsStore((s) => s.pendingRequests.length)
  const profile = useProfileStore((s) => s.profile)
  const user = useAuthStore((s) => s.user)
  const connected = useWSStore((s) => s.connected)
  const theme = useSettingsStore((s) => s.theme)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  // 头像：profile 优先，回落到 authStore 的 user（profile 还没加载时侧栏已经在渲染）；空串当"没有头像"——
  // 裸 <img src=""> 会让 React 告警并重下整页。`||` 而不是 `??`：空串必须继续往后找。
  const avatarSrc = toAbsoluteApiUrl(profile?.user_avatar_url || user?.avatar_url) ?? null
  const avatarInitial = (profile?.user_nickname || user?.nickname || 'U')[0]?.toUpperCase() ?? 'U'

  return (
    <aside data-testid="sidebar" className="glass-surface z-10 flex h-full w-[60px] flex-col items-center border-r border-[var(--glass-border)] py-4">
      {/* APP .sidebar-avatar + .online-indicator */}
      <NavLink to={ROUTES.app.profile} aria-label={t('shell.nav.profile')} title={t('shell.nav.profile')} className="relative mb-6 block h-10 w-10 overflow-hidden rounded-[10px] border-2 border-[var(--white-alpha-90)] bg-[linear-gradient(135deg,var(--white-alpha-80),var(--white-alpha-50))] shadow-[0_4px_12px_rgba(59,130,246,0.15)]">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-app-light">{avatarInitial}</span>
        )}
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--presence-dot-ring)]', connected ? 'bg-app-success' : 'bg-destructive')} />
      </NavLink>

      {/* APP .sidebar-nav */}
      {/*
        消息/联系人这两个是 Link 而不是 NavLink：NavLink 自己按 `to` 与当前 URL
        算 isActive，再拿它同时驱动 aria-current 的取值*和*要不要显示——调用方传
        的 aria-current prop 只在 isActive 为真时才生效（react-router 的
        NavLinkWithRef 把它当默认值处理），于是这里写不写 `activeTab === 'chat'`
        这个三元表达式，对渲染结果毫无影响，全由 URL 匹配决定。后续任务（模态框
        路由）会出现 URL 与 activeTab 不一致的情况——弹窗路由的 pathname 变了，
        但侧栏该高亮的 tab 是弹窗打开前记住的那个——这种时候 NavLink 会给错的
        那个 tab 挂 aria-current。换成 Link，aria-current 与下面的 navBtnActive
        类名就都只由 `activeTab` 这一个来源决定，和 URL 是否匹配无关。
      */}
      <nav className="flex flex-1 flex-col items-center gap-2">
        <Link to={ROUTES.app.chat} title={t('shell.nav.chat')} aria-label={t('shell.nav.chat')} aria-current={activeTab === 'chat' ? 'page' : undefined} className={cn(navBtn, 'relative', activeTab === 'chat' && navBtnActive)}>
          <MessageCircle />
          <Badge value={formatUnreadCount(totalUnread)} testId="badge-chat" />
        </Link>
        <Link to={ROUTES.app.contacts} title={t('shell.nav.contacts')} aria-label={t('shell.nav.contacts')} aria-current={activeTab === 'contacts' ? 'page' : undefined} className={cn(navBtn, 'relative', activeTab === 'contacts' && navBtnActive)}>
          <Users />
          <Badge value={formatUnreadCount(pendingCount)} testId="badge-contacts" />
        </Link>
        {pinnedTools.map((tool) => (
          <NavLink key={tool.key} to={tool.to} title={t(tool.labelKey)} aria-label={t(tool.labelKey)} className={navBtn}>
            <tool.icon />
          </NavLink>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" title={t('shell.nav.more')} aria-label={t('shell.nav.more')} className={navBtn}><MoreHorizontal /></button>
          </PopoverTrigger>
          {/* APP .sidebar-more-panel */}
          <PopoverContent side="right" align="start" className="glass-surface w-[210px] rounded-lg border-[var(--glass-border)] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.14)]">
            <div className="mb-1.5 border-b border-[var(--border-subtle)] px-2.5 pb-2.5 pt-1.5 text-[13px] font-semibold text-foreground">{t('shell.nav.more')}</div>
            <div className="flex flex-col gap-0.5">
              {SIDEBAR_TOOLS.filter((tool) => !pinnedTools.some((p) => p.key === tool.key)).map((tool) => (
                <NavLink key={tool.key} to={tool.to} className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13px] text-foreground transition-colors hover:bg-[var(--primary-subtle)]">
                  <tool.icon className="h-[18px] w-[18px] text-muted-foreground" />
                  <span>{t(tool.labelKey)}</span>
                </NavLink>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </nav>

      {/* APP .sidebar-bottom */}
      <div className="flex flex-col items-center gap-2">
        <NavLink to={ROUTES.app.settings} title={t('shell.nav.settings')} aria-label={t('shell.nav.settings')} className={({ isActive }) => cn(navBtn, isActive && navBtnActive)}>
          <Settings />
        </NavLink>
        <button type="button" title={t('shell.nav.theme')} aria-label={t('shell.nav.theme')} className={navBtn} onClick={() => setSetting('theme', isDark ? 'light' : 'dark')}>
          {isDark ? <Sun /> : <Moon />}
        </button>
      </div>
    </aside>
  )
}
