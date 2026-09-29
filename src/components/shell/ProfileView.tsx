import { Ban, MessageCircle, UserMinus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { friendConversationId } from '@/features/chat/lib/conversationId'
import { friendDisplayName } from '@/features/chat/lib/friendName'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { profileApi, type PublicProfileResponse } from '@/features/profile/api/profile'
import { useI18n } from '@/i18n/I18nProvider'
import { useRouter } from '@/lib/navigation'
import { ROUTES, chatPath } from '@/lib/routes'

/** 好友备注上限（friends/好友添加删除.md:133，后端 MAX_REMARK_LEN） */
const REMARK_MAX_LENGTH = 30

/** 对方资料（右栏）。好友的本地信息（备注、成为好友时间）来自 friendsStore；公开资料来自 GET /api/profile/{id}/public */
export function ProfileView({ userId }: { userId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const friend = useFriendsStore((s) => s.friends.find((f) => f.friend_id === userId))
  const removeFriend = useFriendsStore((s) => s.removeFriend)
  const addBlacklist = useFriendsStore((s) => s.addBlacklist)
  const removeBlacklist = useFriendsStore((s) => s.removeBlacklist)
  const setRemark = useFriendsStore((s) => s.setRemark)
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [editingRemark, setEditingRemark] = useState(false)
  const [remarkDraft, setRemarkDraft] = useState('')
  const [savingRemark, setSavingRemark] = useState(false)
  const [remarkError, setRemarkError] = useState<string | null>(null)
  const remarkInputRef = useRef<HTMLInputElement>(null)

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

  // 点「修改备注」后光标直接落进输入框
  useEffect(() => {
    if (editingRemark) remarkInputRef.current?.focus()
  }, [editingRemark])

  const startEditRemark = () => {
    setRemarkDraft(friend?.friend_remark ?? '')
    setRemarkError(null)
    setEditingRemark(true)
  }

  const saveRemark = async () => {
    setRemarkError(null)
    setSavingRemark(true)
    try {
      await setRemark(userId, remarkDraft)
      setEditingRemark(false)
    } catch (e: unknown) {
      setRemarkError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingRemark(false)
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
          {/* 备注（仅自己可见）：就地编辑，同 APP OtherProfilePanel；POST /api/friends/remark 最长 30 字，空 = 清除 */}
          {friend && (
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 pt-1 text-muted-foreground">{t('shell.contacts.remark')}</dt>
              <dd className="min-w-0 flex-1 text-foreground">
                {editingRemark ? (
                  <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void saveRemark() }}>
                    <input
                      ref={remarkInputRef}
                      value={remarkDraft}
                      maxLength={REMARK_MAX_LENGTH}
                      aria-label={t('shell.contacts.remark')}
                      placeholder={t('shell.contacts.remarkPlaceholder')}
                      onChange={(e) => setRemarkDraft(e.target.value)}
                      onKeyDown={(e) => {
                        // 输入法组字时的回车是选词，不是保存
                        if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
                        if (e.key === 'Escape') setEditingRemark(false)
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button type="submit" disabled={savingRemark} className="subtle-btn">{t('shell.contacts.save')}</button>
                    <button type="button" onClick={() => setEditingRemark(false)} className="subtle-btn">{t('shell.contacts.cancel')}</button>
                  </form>
                ) : (
                  <span className="flex flex-wrap items-center gap-2 pt-1">
                    <span className={friend.friend_remark ? undefined : 'text-muted-foreground'}>{friend.friend_remark || t('shell.contacts.noRemark')}</span>
                    <button type="button" onClick={startEditRemark} className="text-[12px] text-primary hover:underline">
                      {friend.friend_remark ? t('shell.contacts.editRemark') : t('shell.contacts.setRemark')}
                    </button>
                  </span>
                )}
                {remarkError && <p className="mt-1 text-[12px] text-destructive" role="alert">{remarkError}</p>}
              </dd>
            </div>
          )}
          {/* 有备注时标题显示的是备注，原昵称单独列一行，免得认不出是谁 */}
          {friend?.friend_remark && profile?.user_nickname && <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted-foreground">{t('shell.contacts.nickname')}</dt><dd className="text-foreground">{profile.user_nickname}</dd></div>}
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
