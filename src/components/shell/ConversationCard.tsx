import { Pin } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import type { UnifiedConversation } from '@/features/chat/hooks/useUnifiedConversations'
import { formatMessageTime } from '@/features/chat/lib/formatMessageTime'
import { formatUnreadCount } from '@/features/chat/lib/formatUnreadCount'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'

interface ConversationCardProps {
  conversation: UnifiedConversation
  selected: boolean
  onSelect: (id: string) => void
  onTogglePin: (id: string) => void
  onMarkRead: (id: string) => void
}

export function ConversationCard({ conversation: c, selected, onSelect, onTogglePin, onMarkRead }: ConversationCardProps) {
  const { t } = useI18n()
  const unread = formatUnreadCount(c.unreadCount)
  const time = c.lastMessageTime ? formatMessageTime(c.lastMessageTime, undefined, { yesterday: t('shell.list.yesterday'), weekdays: t('shell.list.weekdays').split(',') }) : ''
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          data-testid={`conversation-${c.id}`}
          data-selected={selected ? 'true' : 'false'}
          onClick={() => onSelect(c.id)}
          className={cn(
            // APP .conversation-item:玻璃卡片 + 12px 圆角 + 卡片专用透明度
            // 原生 <button>(而不是 div+role="button"):Enter/Space 由浏览器原生派发
            // click,不用再手写 onKeyDown——那样反而会和原生 click 重复触发一次。
            'relative mb-1 flex w-full cursor-pointer items-center gap-3 rounded-md border p-3 text-left transition-[background,box-shadow,border-color] duration-200',
            'bg-[linear-gradient(135deg,var(--card-bg-start),var(--card-bg-end))] border-[var(--card-border)] shadow-[0_2px_8px_rgba(0,0,0,0.04)]',
            'backdrop-blur-[20px] backdrop-saturate-[180%]',
            'hover:bg-[linear-gradient(135deg,var(--card-bg-hover-start),var(--card-bg-hover-end))] hover:shadow-[0_4px_12px_rgba(59,130,246,0.08)]',
            // APP .conversation-selected-border:外扩 3px 的主色描边
            selected && 'outline outline-2 outline-offset-[3px] outline-primary',
          )}
        >
          <Avatar className="h-12 w-12 shrink-0 rounded-md border-[1.5px] border-[var(--white-alpha-80)]">
            {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt="" />}
            <AvatarFallback className="rounded-md bg-[linear-gradient(135deg,var(--white-alpha-80),var(--white-alpha-50))] text-app-light">
              {c.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex min-w-0 flex-1 items-center gap-1 text-[14px] font-semibold text-foreground">
                {c.kind === 'group' && <span className="shrink-0 text-[10px] font-medium text-[var(--color-primary-5)]">{t('shell.list.groupTag')}</span>}
                <span className="block min-w-0 flex-1 truncate" title={c.name}>{c.name}</span>
              </span>
              {time && <span className="shrink-0 select-none text-[11px] text-app-light">{time}</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 select-none truncate text-[12px] text-muted-foreground" title={c.preview ?? undefined}>
                {c.preview ?? t('shell.list.noMessage')}
              </span>
              {c.pinned && <span className="inline-flex shrink-0 text-muted-foreground" title={t('shell.list.pinned')}><Pin className="h-3.5 w-3.5" /></span>}
              {unread && (
                <span className="ml-2 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[9px] bg-unread px-1.5 text-[10px] font-semibold text-[var(--unread-badge-text)]">
                  {unread}
                </span>
              )}
            </div>
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="glass-surface min-w-[160px] rounded-lg border-[var(--glass-border)]">
        <ContextMenuItem onSelect={() => onTogglePin(c.id)}>{c.pinned ? t('shell.list.unpin') : t('shell.list.pin')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => onMarkRead(c.id)} disabled={c.unreadCount === 0}>{t('shell.list.markRead')}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
