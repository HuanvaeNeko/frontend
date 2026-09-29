import { useState } from 'react'
import { useLocation } from 'react-router'
import { AppLink } from '@/components/common/AppLink'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/i18n/I18nProvider'
import { ROUTES } from '@/lib/routes'

/**
 * 访客（没登录）拿着会议链接进来：先填一个显示名称再入会。
 *
 * 后端「加入房间」无需登录（backend-docs webrtc/WebRTC房间.md:139），但网页端的会议页原来挂在
 * 登录守卫后面，访客直接被踢去登录页——会议面板上「无需登录即可加入」那句话不成立。放开以后如果
 * 直接进房，名字只能是「访客」，房间里谁也认不出是谁，所以先问一句。
 */
export function GuestJoinLobby({ roomId, onJoin }: { roomId: string; onJoin: (name: string) => void }) {
  const { t } = useI18n()
  const location = useLocation()
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const next = `${location.pathname}${location.search}`

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <form
        className="glass-card w-full max-w-sm space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed) onJoin(trimmed)
        }}
      >
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">{t('chat.webrtc.guestTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('chat.webrtc.guestRoom', { id: roomId })}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="guest-name">{t('chat.webrtc.guestName')}</Label>
          <Input id="guest-name" value={name} maxLength={32} placeholder={t('chat.webrtc.guestNamePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={!trimmed}>{t('chat.webrtc.guestJoin')}</Button>
        <p className="text-center text-xs text-muted-foreground">
          <AppLink href={`${ROUTES.auth.login}?next=${encodeURIComponent(next)}`} className="text-primary hover:underline">{t('chat.webrtc.guestLogin')}</AppLink>
        </p>
      </form>
    </div>
  )
}
