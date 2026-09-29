import { LogIn, Plus, UserPlus, UsersRound } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n/I18nProvider'

/**
 * 列表栏右上角的「+」菜单：创建群聊 / 添加好友 / 加入群。会话列表与联系人列表共用——
 * 原来只有会话列表有，联系人页（最该加好友的地方）连入口都没有。
 */
export function AddMenu({ onCreateGroup, onAddFriend, onJoinGroup }: { onCreateGroup: () => void; onAddFriend: () => void; onJoinGroup: () => void }) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('shell.list.add')} title={t('shell.list.add')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-[var(--primary-subtle)] hover:text-primary">
          <Plus className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-surface min-w-[160px] rounded-lg border-[var(--glass-border)]">
        <DropdownMenuItem onSelect={onCreateGroup}><UsersRound className="h-4 w-4" />{t('shell.list.createGroup')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddFriend}><UserPlus className="h-4 w-4" />{t('shell.list.addFriend')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onJoinGroup}><LogIn className="h-4 w-4" />{t('shell.list.joinGroup')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
