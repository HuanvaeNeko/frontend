import { Ban, MessageCircle, UserMinus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { friendConversationId } from '@/features/chat/lib/conversationId'
import { friendDisplayName } from '@/features/chat/lib/friendName'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { profileApi, type PublicProfileResponse } from '@/features/profile/api/profile'
import { useI18n } from '@/i18n/I18nProvider'
import { useRouter } from '@/lib/navigation'
import { ROUTES, chatPath } from '@/lib/routes'

/** 对方资料（右栏）。好友的本地信息（备注、成为好友时间）来自 friendsStore；公开资料来自 GET /api/profile/{id}/public */
export function ProfileView({ userId }: { userId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const friend = useFriendsStore((s) => s.friends.find((f) => f.friend_id === userId))
  const removeFriend = useFriendsStore((s) => s.removeFriend)
  const addBlacklist = useFriendsStore((s) => s.addBlacklist)
  const removeBlacklist = useFriendsStore((s) => s.removeBlacklist)
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setProfile(null)
    setError(null)
    profileApi.getPublicProfile(userId)
      .then((p) => { if (alive) setProfile(p) })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [userId])

  const name = friend ? friendDisplayName(friend) : (profile?.user_nickname ?? userId)
  const avatarUrl = profile?.user_avatar_url ?? friend?.friend_avatar_url ?? null

  const handleRemove = async () => {
    if (!window.confirm(t('shell.contacts.confirmRemove'))) return
    setRemoveError(null)
    setRemoving(true)
    try {
      await removeFriend(userId)
      router.replace(ROUTES.app.contacts)
    } catch (e: unknown) {
      setRemoveError(e instanceof Error ? e.message : String(e))
    } finally {
      setRemoving(false)
    }
  }

  const handleBlockToggle = async () => {
    if (!friend) return
    if (!friend.is_blacklisted && !window.confirm(t('shell.contacts.confirmBlock'))) return
    setBlockError(null)
    setBlocking(true)
    try {
      if (friend.is_blacklisted) await removeBlacklist(userId)
      else await addBlacklist(userId)
    } catch (e: unknown) {
      setBlockError(e instanceof Error ? e.message : String(e))
    } finally {
      setBlocking(false)
    }
  }

  return (
    <div className="app-scrollbar h-full overflow-y-auto p-6">
      <div className="glass-card mx-auto max-w-[520px] p-8">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 rounded-xl">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="rounded-xl text-2xl text-app-light">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-foreground">{name}</h2>
            <p className="text-[13px] text-muted-foreground">@{userId}</p>
            {!friend && <p className="text-[12px] text-app-warning">{t('shell.contacts.notFriend')}</p>}
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] text-destructive" role="alert">{t('shell.contacts.loadFailed')}: {error}</p>}
        <dl className="mt-6 space-y-2 text-[13px]">
          {profile?.user_signature && <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted-foreground">{t('shell.contacts.signature')}</dt><dd className="text-foreground">{profile.user_signature}</dd></div>}
          {profile?.region && <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted-foreground">{t('shell.contacts.region')}</dt><dd className="text-foreground">{profile.region}</dd></div>}
          {friend?.add_time && <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted-foreground">{t('shell.contacts.memberSince')}</dt><dd className="text-foreground">{new Date(friend.add_time).toLocaleDateString()}</dd></div>}
        </dl>
        {friend && (
          <>
            <div className="mt-8 flex gap-3">
              <NavLink to={chatPath(friendConversationId(userId))} className="subtle-btn"><MessageCircle className="h-4 w-4" />{t('shell.contacts.message')}</NavLink>
              <button type="button" onClick={handleBlockToggle} disabled={blocking} className="subtle-btn"><Ban className="h-4 w-4" />{friend.is_blacklisted ? t('shell.contacts.unblock') : t('shell.contacts.block')}</button>
              <button type="button" onClick={handleRemove} disabled={removing} className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive"><UserMinus className="h-4 w-4" />{t('shell.contacts.removeFriend')}</button>
            </div>
            {blockError && <p className="mt-3 text-[13px] text-destructive" role="alert">{t('shell.contacts.blockFailed')}: {blockError}</p>}
            {removeError && <p className="mt-3 text-[13px] text-destructive" role="alert">{t('shell.contacts.removeFailed')}: {removeError}</p>}
          </>
        )}
      </div>
    </div>
  )
}
