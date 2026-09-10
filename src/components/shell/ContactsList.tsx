import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, useParams, useSearchParams } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import FriendList from '@/features/chat/components/sidebar/FriendList'
import GroupList from '@/features/chat/components/sidebar/GroupList'
import { friendDisplayName } from '@/features/chat/lib/friendName'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { useI18n } from '@/i18n/I18nProvider'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { contactFriendPath, contactGroupPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { ListEmpty, ListError, ListLoading } from './ListStates'

export type ContactsTab = 'friends' | 'groups' | 'requests'
export type ContactsAdd = 'friend' | 'join-group' | 'create-group'

export function contactsTabFrom(params: URLSearchParams): ContactsTab {
  const t = params.get('tab')
  return t === 'groups' || t === 'requests' ? t : 'friends'
}
export function contactsAddFrom(params: URLSearchParams): ContactsAdd | null {
  const a = params.get('add')
  return a === 'friend' || a === 'join-group' || a === 'create-group' ? a : null
}

function ContactRow({ testId, to, name, subtitle, avatarUrl, selected }: { testId: string; to: string; name: string; subtitle: string; avatarUrl: string | null; selected: boolean }) {
  return (
    <NavLink
      to={to}
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'mb-1 flex items-center gap-3 rounded-md border border-[var(--card-border)] bg-[linear-gradient(135deg,var(--card-bg-start),var(--card-bg-end))] p-3 transition-colors hover:bg-[linear-gradient(135deg,var(--card-bg-hover-start),var(--card-bg-hover-end))]',
        selected && 'outline outline-2 outline-offset-[3px] outline-primary',
      )}
    >
      <Avatar className="h-10 w-10 shrink-0 rounded-[10px]">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="rounded-[10px] text-app-light">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-foreground">{name}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{subtitle}</span>
      </span>
    </NavLink>
  )
}

/** 联系人栏：好友 / 群 / 申请三段；主列表自渲染并导航，add 与申请面板复用旧组件 */
export function ContactsList() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const { userId, groupId } = useParams()
  const tab = contactsTabFrom(params)
  const add = contactsAddFrom(params)
  const [query, setQuery] = useState('')
  const friends = useFriendsStore((s) => s.friends)
  const friendsLoading = useFriendsStore((s) => s.isLoading)
  const friendsError = useFriendsStore((s) => s.error)
  const loadFriends = useFriendsStore((s) => s.loadFriends)
  const groups = useGroupStore((s) => s.myGroups)
  const groupsLoading = useGroupStore((s) => s.isLoading)

  const q = query.trim().toLowerCase()
  const shownFriends = useMemo(() => friends.filter((f) => !q || friendDisplayName(f).toLowerCase().includes(q) || f.friend_id.toLowerCase().includes(q)), [friends, q])
  const shownGroups = useMemo(() => groups.filter((g) => !q || g.group_name.toLowerCase().includes(q)), [groups, q])

  const setTab = (next: ContactsTab) => { const p = new URLSearchParams(params); p.set('tab', next); p.delete('add'); setParams(p, { replace: true }) }
  const closeAdd = () => { const p = new URLSearchParams(params); p.delete('add'); setParams(p, { replace: true }) }

  const segment = (key: ContactsTab, label: string) => (
    <button type="button" key={key} onClick={() => setTab(key)} aria-pressed={tab === key}
      className={cn('flex-1 rounded-[10px] px-2 py-1.5 text-[13px] transition-colors', tab === key ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-muted-foreground hover:text-foreground')}>
      {label}
    </button>
  )

  const addPanel = add && (
    <div className="mb-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
      <div className="mb-1 flex justify-end">
        <button type="button" aria-label={t('shell.contacts.closePanel')} onClick={closeAdd} className="rounded-md p-1 text-muted-foreground hover:bg-[var(--primary-subtle)]"><X className="h-4 w-4" /></button>
      </div>
      {add === 'friend' && <FriendList subTab="new" searchQuery="" />}
      {add === 'join-group' && <GroupList subTab="join" searchQuery="" />}
      {add === 'create-group' && <GroupList subTab="main" searchQuery="" initialCreateOpen />}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 p-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('shell.contacts.search')}
          className="w-full rounded-[10px] border border-[var(--white-alpha-70)] bg-[var(--white-alpha-60)] px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-app-light focus:border-[var(--border-strong)]" />
        <div className="flex gap-1 rounded-md bg-[var(--bg-tertiary)] p-1">
          {segment('friends', t('shell.contacts.friends'))}
          {segment('groups', t('shell.contacts.groups'))}
          {segment('requests', t('shell.contacts.requests'))}
        </div>
      </div>
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto py-2 pl-2 pr-0.5 [scrollbar-gutter:stable]">
        {addPanel}
        {tab === 'friends' && (friendsLoading ? <ListLoading /> : friendsError ? <ListError error={friendsError} onRetry={() => { loadFriends().catch(console.error) }} /> :
          friends.length === 0 ? <ListEmpty message={t('shell.contacts.noFriends')} /> : shownFriends.length === 0 ? <ListEmpty message={t('shell.contacts.noMatch')} /> :
          shownFriends.map((f) => (
            <ContactRow key={f.friend_id} testId={`contact-f-${f.friend_id}`} to={contactFriendPath(f.friend_id)} name={friendDisplayName(f)} subtitle={`@${f.friend_id}`}
              avatarUrl={f.friend_avatar_url ? (toAbsoluteApiUrl(f.friend_avatar_url) ?? null) : null} selected={userId === f.friend_id} />
          )))}
        {tab === 'groups' && (groupsLoading ? <ListLoading /> :
          groups.length === 0 ? <ListEmpty message={t('shell.contacts.noGroups')} /> : shownGroups.length === 0 ? <ListEmpty message={t('shell.contacts.noMatch')} /> :
          shownGroups.map((g) => (
            <ContactRow key={g.group_id} testId={`contact-g-${g.group_id}`} to={contactGroupPath(g.group_id)} name={g.group_name} subtitle={g.member_count ? `${g.member_count} 人` : g.group_id}
              avatarUrl={g.group_avatar_url ? (toAbsoluteApiUrl(g.group_avatar_url) ?? null) : null} selected={groupId === g.group_id} />
          )))}
        {tab === 'requests' && (
          <div className="space-y-3">
            <FriendList subTab="new" searchQuery="" />
            <FriendList subTab="sent" searchQuery="" />
            <GroupList subTab="invites" searchQuery="" />
          </div>
        )}
      </div>
    </div>
  )
}
