'use client'

import { useEffect, useState } from 'react'
import { Users, Video } from 'lucide-react'
import { AppLink } from '@/components/common/AppLink'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { groupsApi, type PublicGroupInfo } from '@/features/chat/api/groups'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/i18n/I18nProvider'
import { ROUTES, chatPath } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * 文本 / 图片 / 视频 / 文件之外、后端文档里有的消息类型（backend-docs group_messages/群消息.md 类型表、
 * messages/好友消息.md「群卡片消息」）。原来一律渲染成「[不支持的消息类型]」——APP 用户发来的会议
 * 邀请、群名片在网页端完全看不懂。
 */

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** meeting_invite：content 是 {room_id, password, room_name, creator_name, creator_avatar} */
export function MeetingInviteCard({ content, isOwn }: { content: string; isOwn: boolean }) {
  const { t } = useI18n()
  const invite = parseJsonObject(content)
  const roomId = str(invite?.room_id)
  if (!invite || !roomId) return <p className="text-sm opacity-80">{t('chat.window.meetingInviteFallback')}</p>
  const password = str(invite.password)
  const query = new URLSearchParams({ room: roomId })
  if (password) query.set('pwd', password)
  return (
    <div className="flex min-w-[220px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', isOwn ? 'bg-white/20' : 'bg-primary/10 text-primary')}>
          <Video className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('chat.window.meetingInviteTitle', { name: str(invite.creator_name) || t('chat.window.otherSide') })}</p>
          <p className={cn('truncate text-xs', isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
            {[str(invite.room_name), t('chat.window.meetingRoomId', { id: roomId })].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant={isOwn ? 'secondary' : 'default'}>
        <AppLink href={`${ROUTES.app.videoMeeting}?${query.toString()}`}>{t('chat.window.joinMeeting')}</AppLink>
      </Button>
    </div>
  )
}

/** group_card：content 是 {group_id}；群名 / 头像 / 人数不在消息体里，按 /public 现拉 */
export function GroupCardMessage({ content, isOwn }: { content: string; isOwn: boolean }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const groupId = str(parseJsonObject(content)?.group_id)
  const isMember = useGroupStore((s) => s.myGroups.some((g) => g.group_id === groupId))
  const [info, setInfo] = useState<PublicGroupInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!groupId) return
    let alive = true
    groupsApi.getPublicGroupInfo(groupId).then(
      (data) => { if (alive) setInfo(data) },
      () => { if (alive) setFailed(true) },
    )
    return () => { alive = false }
  }, [groupId])

  if (!groupId) return <p className="text-sm opacity-80">{t('chat.window.groupCardFallback')}</p>

  const apply = async () => {
    setApplying(true)
    try {
      // 群名片落地走「好友推荐」这条路（source="referral"，群主可用 allow_join_via_referral 关掉）
      const result = await groupsApi.applyToJoin(groupId, 'referral')
      setApplied(true)
      toast({ title: result.status === 'joined' ? t('chat.window.groupCardJoined') : t('chat.window.groupCardApplied') })
      if (result.status === 'joined') void useGroupStore.getState().loadMyGroups().catch(() => undefined)
    } catch (error) {
      toast({ title: t('chat.window.groupCardApplyFailed'), description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-2">
      <p className={cn('text-[11px]', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{t('chat.window.groupCardLabel')}</p>
      <div className="flex items-center gap-2">
        <Avatar className="h-9 w-9 shrink-0 rounded-xl">
          {info?.group_avatar_url && <AvatarImage src={info.group_avatar_url} />}
          <AvatarFallback className="rounded-xl"><Users className="h-4 w-4" /></AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{info?.group_name ?? (failed ? t('chat.window.groupCardUnavailable') : '…')}</p>
          {info && <p className={cn('truncate text-xs', isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{t('shell.contacts.memberCount', { n: info.member_count })}{info.group_description ? ` · ${info.group_description}` : ''}</p>}
        </div>
      </div>
      {info && (isMember ? (
        <Button asChild size="sm" variant={isOwn ? 'secondary' : 'default'}>
          <AppLink href={chatPath(`g-${groupId}`)}>{t('chat.window.groupCardEnter')}</AppLink>
        </Button>
      ) : !info.allow_join_via_referral ? (
        <p className="text-xs opacity-80">{t('chat.window.groupCardClosed')}</p>
      ) : (
        <Button size="sm" variant={isOwn ? 'secondary' : 'default'} disabled={applying || applied} onClick={() => { void apply() }}>
          {applied ? t('chat.window.groupCardApplied') : t('chat.window.groupCardApply')}
        </Button>
      ))}
    </div>
  )
}
