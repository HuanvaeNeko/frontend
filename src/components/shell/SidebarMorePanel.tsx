import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'
import { forwardRef } from 'react'
import { NavLink } from 'react-router'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import { SIDEBAR_TOOLS_BY_KEY, type SidebarTool, type SidebarToolKey } from './sidebarTools'

interface SidebarMorePanelProps {
  moreKeys: SidebarToolKey[]
  /** fixed 定位（Sidebar 按「更多」按钮的位置算） */
  position: { top: number; left: number }
  /** 点了某一项：Sidebar 负责收起面板 */
  onNavigate: () => void
}

function MoreRow({ tool, label, onNavigate }: { tool: SidebarTool; label: string; onNavigate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tool.key })
  return (
    // 无键盘 sensor，wrapper 不抢 tab 焦点（覆写 attributes 的 tabIndex=0），焦点留给内层链接
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} tabIndex={-1} className={cn('rounded-[10px]', isDragging && 'opacity-40')}>
      <NavLink to={tool.to} onClick={onNavigate} className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13px] text-foreground transition-colors hover:bg-[var(--primary-subtle)]">
        <tool.icon className="h-[18px] w-[18px] text-muted-foreground" />
        <span>{label}</span>
      </NavLink>
    </div>
  )
}

export const SidebarMorePanel = forwardRef<HTMLDivElement, SidebarMorePanelProps>(function SidebarMorePanel({ moreKeys, position, onNavigate }, ref) {
  const { t } = useI18n()
  const { setNodeRef, isOver } = useDroppable({ id: 'more' })
  return (
    <motion.div
      ref={ref}
      data-testid="sidebar-more-panel"
      role="dialog"
      aria-label={t('shell.nav.more')}
      style={{ top: position.top, left: position.left }}
      className="glass-surface fixed z-[10000] w-[210px] rounded-lg border border-[var(--glass-border)] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.14)]"
      initial={{ opacity: 0, x: -8, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] px-2.5 pb-2.5 pt-1.5">
        <span className="text-[13px] font-semibold text-foreground">{t('shell.nav.more')}</span>
        <span className="text-[11px] text-app-light">{t('shell.nav.dragHint')}</span>
      </div>
      <div ref={setNodeRef} className={cn('flex min-h-[40px] flex-col gap-0.5 rounded-[10px] transition-colors', isOver && 'bg-[var(--primary-subtle)]')}>
        <SortableContext items={moreKeys} strategy={verticalListSortingStrategy}>
          {moreKeys.map((key) => (
            <MoreRow key={key} tool={SIDEBAR_TOOLS_BY_KEY[key]} label={t(SIDEBAR_TOOLS_BY_KEY[key].labelKey)} onNavigate={onNavigate} />
          ))}
        </SortableContext>
        {moreKeys.length === 0 && (
          <div className="px-2.5 py-3 text-center text-[12px] text-app-light">
            <div>{t('shell.nav.allPinned')}</div>
            <div>{t('shell.nav.dragBackHint')}</div>
          </div>
        )}
      </div>
    </motion.div>
  )
})
