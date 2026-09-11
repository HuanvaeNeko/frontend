import { useCallback, useEffect, useRef, useState } from 'react'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { BlacklistedUser } from '@/features/chat/api/friends'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useI18n } from '@/i18n/I18nProvider'

const NS = 'shell.settings.blacklist'

function BlacklistRow({ user, onRemove, removing }: { user: BlacklistedUser; onRemove: () => Promise<void>; removing: boolean }) {
  const { t } = useI18n()
  const [confirm, setConfirm] = useState(false)
  const name = user.user_nickname?.trim() || user.user_id
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <Avatar className="h-9 w-9 rounded-[10px]">
        {user.user_avatar_url && <AvatarImage src={user.user_avatar_url} alt="" />}
        <AvatarFallback className="rounded-[10px] text-app-light">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-foreground">{name}</div>
        <div className="truncate text-[12px] text-muted-foreground"><span>@{user.user_id}</span> · {t(`${NS}.blockedAt`, { date: new Date(user.created_at).toLocaleDateString() })}</div>
      </div>
      {confirm ? (
        <span className="flex gap-1">
          <button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" disabled={removing} onClick={() => { setConfirm(false); void onRemove() }}>{t(`${NS}.confirm`)}</button>
          <button type="button" className="subtle-btn" disabled={removing} onClick={() => setConfirm(false)}>{t(`${NS}.cancel`)}</button>
        </span>
      ) : (
        <button type="button" className="subtle-btn" disabled={removing} onClick={() => setConfirm(true)}>{t(`${NS}.remove`)}</button>
      )}
    </li>
  )
}

/** 设置 → 账户与安全 → 黑名单（内嵌，spec §5）。列表在 friendsStore，loading / error 是本面板自己的。 */
export function BlacklistPanel() {
  const { t } = useI18n()
  const blacklist = useFriendsStore((s) => s.blacklist)
  const loaded = useFriendsStore((s) => s.blacklistLoaded)
  const loadBlacklist = useFriendsStore((s) => s.loadBlacklist)
  const removeBlacklist = useFriendsStore((s) => s.removeBlacklist)
  const [loading, setLoading] = useState(!loaded)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    loadBlacklist().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false))
  }, [loadBlacklist])

  // 只想在挂载时按 loaded 决定拉不拉一次：startedRef 防止 loaded 变化后二次拉取，
  // 同时把 load 塞进依赖数组让 useExhaustiveDependencies 满意，不需要抑制规则。
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (!loaded) load()
  }, [loaded, load])

  const remove = async (userId: string) => {
    setRemoving(userId)
    setRemoveError(null)
    try { await removeBlacklist(userId) } catch (e: unknown) { setRemoveError(e instanceof Error ? e.message : String(e)) } finally { setRemoving(null) }
  }

  if (loading) return <ListLoading />
  if (error) return <ListError error={error} onRetry={load} />
  return (
    <div>
      <p className="px-3 pt-3 text-[12px] text-muted-foreground">{t(`${NS}.hint`)}</p>
      {blacklist.length === 0 ? <ListEmpty message={t(`${NS}.empty`)} /> : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {blacklist.map((u) => <BlacklistRow key={u.user_id} user={u} removing={removing === u.user_id} onRemove={() => remove(u.user_id)} />)}
        </ul>
      )}
      {removeError && <p className="px-3 pb-3 text-[13px] text-destructive" role="alert">{t(`${NS}.removeFailed`)}: {removeError}</p>}
    </div>
  )
}
