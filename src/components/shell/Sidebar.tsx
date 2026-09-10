import { DndContext, DragOverlay, MeasuringStrategy, PointerSensor, pointerWithin, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence } from 'framer-motion'
import { MessageCircle, Moon, MoreHorizontal, Settings, Sun, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink } from 'react-router'
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
import { SidebarMorePanel } from './SidebarMorePanel'
import { defaultLayout, loadLayout, moveAcrossZones, reorderWithinZone, saveLayout, type SidebarLayout } from './sidebarLayout'
import { SIDEBAR_TOOLS_BY_KEY, type SidebarTool, type SidebarToolKey } from './sidebarTools'

interface SidebarProps {
  /** 'settings' 时两个 tab 都不高亮——设置没有自己的 nav-btn，靠底部的 NavLink 按 URL 自己高亮 */
  activeTab: 'chat' | 'contacts' | 'settings'
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

/** 钉住区单项：useSortable 包一层 div，里面是真正的 NavLink（同 SidebarMorePanel 的理由） */
function PinnedTool({ tool, label }: { tool: SidebarTool; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tool.key })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} tabIndex={-1} className={cn(isDragging && 'opacity-40')}>
      <NavLink to={tool.to} title={label} aria-label={label} className={({ isActive }) => cn(navBtn, isActive && navBtnActive)}>
        <tool.icon />
      </NavLink>
    </div>
  )
}

/** 钉住区容器（useDroppable 'pinned' + 竖排 SortableContext）；拖拽中显示虚线落点 */
function PinZone({ pinned, dragActive, t }: { pinned: SidebarToolKey[]; dragActive: boolean; t: (key: string) => string }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pinned' })
  return (
    <div
      ref={setNodeRef}
      data-testid="pin-zone"
      className={cn(
        'flex flex-col items-center gap-2 rounded-md transition-colors',
        dragActive && 'min-h-[42px] w-[42px] outline-dashed outline-1 outline-[var(--border-strong)]',
        dragActive && isOver && 'bg-[var(--primary-subtle)]',
      )}
    >
      <SortableContext items={pinned} strategy={verticalListSortingStrategy}>
        {pinned.map((key) => (
          <PinnedTool key={key} tool={SIDEBAR_TOOLS_BY_KEY[key]} label={t(SIDEBAR_TOOLS_BY_KEY[key].labelKey)} />
        ))}
      </SortableContext>
    </div>
  )
}

export function Sidebar({ activeTab }: SidebarProps) {
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

  // ---- 双区布局：SSR 先渲染默认布局，挂载后再读 localStorage（避免 hydration 不一致） ----
  const [layout, setLayout] = useState<SidebarLayout>(defaultLayout)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setLayout(loadLayout())
    setMounted(true)
  }, [])

  const [showMore, setShowMore] = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const [activeKey, setActiveKey] = useState<SidebarToolKey | null>(null)
  const snapshotRef = useRef<SidebarLayout | null>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 仅 PointerSensor、6px 才算拖：点击不触发拖拽，链接照常导航。不加键盘 sensor（APP 同款理由）
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const openMore = useCallback(() => {
    const rect = moreBtnRef.current?.getBoundingClientRect()
    if (rect) setPanelPos({ top: rect.top, left: rect.right + 10 })
    setShowMore(true)
  }, [])
  const toggleMore = () => (showMore ? setShowMore(false) : openMore())

  // 点面板外收起（拖拽中不收：拖出/拖回都需要面板在场）
  useEffect(() => {
    if (!showMore) return
    const onPointerDown = (event: PointerEvent) => {
      if (activeKey !== null) return
      const target = event.target as Node
      if (panelRef.current?.contains(target) || moreBtnRef.current?.contains(target)) return
      setShowMore(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showMore, activeKey])

  // ---- dnd-kit 编排（APP Sidebar.tsx 的标准多容器模式；归约逻辑在 sidebarLayout.ts） ----
  const handleDragStart = (event: DragStartEvent) => {
    setActiveKey(event.active.id as SidebarToolKey)
    snapshotRef.current = layout
    if (!showMore) openMore()
  }
  const handleDragOver = (event: DragOverEvent) => {
    if (!event.over) return
    const activeId = event.active.id as SidebarToolKey
    const overId = String(event.over.id)
    setLayout((prev) => moveAcrossZones(prev, activeId, overId)) // 拖拽中不持久化
  }
  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = event.active.id as SidebarToolKey
    // onDragOver 的跨区更新在 pointerup 前已 flush，闭包里的 layout 就是最新值；saveLayout 不放进 updater（StrictMode 双调用会双写）
    const next = event.over ? reorderWithinZone(layout, activeId, String(event.over.id)) : layout
    setLayout(next)
    saveLayout(next)
    setActiveKey(null)
    snapshotRef.current = null
  }
  const handleDragCancel = () => {
    if (snapshotRef.current) setLayout(snapshotRef.current)
    setActiveKey(null)
    snapshotRef.current = null
  }

  const activeTool = activeKey ? SIDEBAR_TOOLS_BY_KEY[activeKey] : null

  return (
    // pointerWithin：指针真正进入某 droppable 才算命中；measuring Always：钉住区空时不挂载、拖起才挂载，必须持续测量
    <DndContext sensors={sensors} collisionDetection={pointerWithin} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
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

          {/* 钉住区：空且没在拖时不渲染（gap 会给 0 高度的空 div 也算间距） */}
          {(layout.pinned.length > 0 || activeKey !== null) && <PinZone pinned={layout.pinned} dragActive={activeKey !== null} t={t} />}

          <button ref={moreBtnRef} type="button" title={t('shell.nav.more')} aria-label={t('shell.nav.more')} aria-expanded={showMore} onClick={toggleMore} className={cn(navBtn, showMore && navBtnActive)}>
            <MoreHorizontal />
          </button>
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

      {/* 面板与拖拽幽灵卡都 portal 到 body：不被 aside 的 overflow 裁切；SSR 没有 document，挂载后再渲染 */}
      {mounted && createPortal(
        <AnimatePresence>
          {showMore && <SidebarMorePanel ref={panelRef} moreKeys={layout.more} position={panelPos} onNavigate={() => setShowMore(false)} />}
        </AnimatePresence>,
        document.body,
      )}
      {mounted && createPortal(
        <DragOverlay zIndex={10001}>
          {activeTool ? (
            <div className="glass-surface flex items-center gap-2.5 rounded-[10px] border border-[var(--glass-border)] px-2.5 py-[7px] text-[13px] text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
              <activeTool.icon className="h-[18px] w-[18px] text-muted-foreground" />
              <span>{t(activeTool.labelKey)}</span>
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
}
