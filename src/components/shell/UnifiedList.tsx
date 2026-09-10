import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { UnifiedConversation } from '@/features/chat/hooks/useUnifiedConversations'
import { useI18n } from '@/i18n/I18nProvider'
import { ConversationCard } from './ConversationCard'
import { ListEmpty, ListError, ListLoading } from './ListStates'

export interface UnifiedListProps {
  conversations: UnifiedConversation[]
  status: 'loading' | 'error' | 'ready'
  error?: string
  selectedId: string | null
  onSelect: (id: string) => void
  onTogglePin: (id: string) => void
  onMarkRead: (id: string) => void
  onRetry: () => void
  onCreateGroup: () => void
  onAddFriend: () => void
  onJoinGroup: () => void
}

/** 统一会话列表(APP UnifiedList 的展示部分;数据与路由由第 5 步的壳接线) */
export function UnifiedList(props: UnifiedListProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return props.conversations
    return props.conversations.filter((c) => c.name.toLowerCase().includes(q) || (c.preview ?? '').toLowerCase().includes(q))
  }, [props.conversations, query])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* APP .search-box + AddMenu */}
      <div className="flex shrink-0 items-center gap-2 p-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[var(--white-alpha-70)] bg-[var(--white-alpha-60)] px-3 py-2 focus-within:border-[var(--border-strong)] focus-within:shadow-[0_0_0_3px_var(--primary-subtle)]">
          <Search className="h-4 w-4 shrink-0 text-app-light" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('shell.list.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-app-light"
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={t('shell.list.add')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-[var(--primary-subtle)] hover:text-primary">
              <Plus className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-surface min-w-[160px] rounded-lg border-[var(--glass-border)]">
            <DropdownMenuItem onSelect={props.onCreateGroup}>{t('shell.list.createGroup')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onAddFriend}>{t('shell.list.addFriend')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onJoinGroup}>{t('shell.list.joinGroup')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* APP .conversation-list:右侧 2px + 滚动条槽 6px = 左侧 8px,各 tab 卡片等宽 */}
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto py-2 pl-2 pr-0.5 [scrollbar-gutter:stable]">
        {props.status === 'loading' && <ListLoading />}
        {props.status === 'error' && <ListError error={props.error ?? ''} onRetry={props.onRetry} />}
        {props.status === 'ready' && props.conversations.length === 0 && <ListEmpty message={t('shell.list.empty')} />}
        {props.status === 'ready' && props.conversations.length > 0 && filtered.length === 0 && <ListEmpty message={t('shell.list.noMatch')} />}
        {props.status === 'ready' && filtered.map((c) => (
          <ConversationCard
            key={c.id}
            conversation={c}
            selected={c.id === props.selectedId}
            onSelect={props.onSelect}
            onTogglePin={props.onTogglePin}
            onMarkRead={props.onMarkRead}
          />
        ))}
      </div>
    </div>
  )
}
