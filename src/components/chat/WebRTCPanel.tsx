'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Video, Phone, Copy, Loader2, Users, Shield, Globe, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { webrtcApi } from '../../api/webrtc'
import { useAuthStore } from '../../store/authStore'
import { ROUTES } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'

export default function WebRTCPanel() {
  const { t } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const { accessToken: _accessToken } = useAuthStore()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  const [roomName, setRoomName] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('5')
  const [durationMinutes, setDurationMinutes] = useState('60')

  const [joinRoomId, setJoinRoomId] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [joinNickname, setJoinNickname] = useState('')

  const [currentRoom, setCurrentRoom] = useState<{ roomId: string; password: string; shareLink: string } | null>(null)

  const handleCreateRoom = async () => {
    setCreating(true)
    try {
      const response = await webrtcApi.createRoom({
        name: roomName || undefined,
        password: roomPassword || undefined,
        max_participants: parseInt(maxParticipants),
      })
      const shareLink = `${window.location.origin}/video-meeting?room=${response.room_id}&pwd=${roomPassword || ''}`
      setCurrentRoom({ roomId: response.room_id, password: roomPassword || t('chat.webrtc.none'), shareLink })
      toast({ title: t('chat.webrtc.success'), description: t('chat.webrtc.roomCreatedRedirecting') })
      setShowCreateDialog(false)
      const params = new URLSearchParams({ room: response.room_id, token: response.ws_token, creator: 'true' })
      if (roomPassword) params.set('pwd', roomPassword)
      router.push(`${ROUTES.app.videoMeeting}?${params.toString()}`)
    } catch (error) {
      toast({ title: t('chat.webrtc.createFailedTitle'), description: error instanceof Error ? error.message : t('chat.webrtc.createFailedDesc'), variant: 'destructive' })
    } finally { setCreating(false) }
  }

  const handleJoinRoom = async () => {
    if (!joinRoomId.trim()) { toast({ title: t('chat.webrtc.error'), description: t('chat.webrtc.enterRoomId'), variant: 'destructive' }); return }
    setJoining(true)
    try {
      const response = await webrtcApi.joinRoom(joinRoomId, { password: joinPassword || '', display_name: joinNickname || 'Anonymous' })
      toast({ title: t('chat.webrtc.success'), description: t('chat.webrtc.joinedRedirecting') })
      setShowJoinDialog(false)
      const params = new URLSearchParams({ room: joinRoomId, token: response.ws_token || '' })
      if (joinNickname) params.set('name', joinNickname)
      router.push(`${ROUTES.app.videoMeeting}?${params.toString()}`)
    } catch (error) {
      toast({ title: t('chat.webrtc.joinFailedTitle'), description: error instanceof Error ? error.message : t('chat.webrtc.joinFailedDesc'), variant: 'destructive' })
    } finally { setJoining(false) }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: t('chat.webrtc.copied'), description: t('chat.webrtc.copiedDesc', { label }) }))
  }

  const features = [
    { icon: Users, text: t('chat.webrtc.feature1'), color: 'text-primary' },
    { icon: Globe, text: t('chat.webrtc.feature2'), color: 'text-primary' },
    { icon: Video, text: t('chat.webrtc.feature3'), color: 'text-primary' },
    { icon: Shield, text: t('chat.webrtc.feature4'), color: 'text-primary' },
  ]

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 功能介绍 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Video className="h-6 w-6 text-background" />
              </div>
              <div>
                <CardTitle>{t('chat.webrtc.title')}</CardTitle>
                <CardDescription>{t('chat.webrtc.subtitle')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {features.map((feature, index) => (
                <motion.div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-muted" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: index * 0.1 }}>
                  <feature.icon className={`h-5 w-5 ${feature.color}`} />
                  <span className="text-sm text-foreground">{feature.text}</span>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 操作按钮 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Button className="h-32 w-full flex-col gap-3 text-lg" onClick={() => setShowCreateDialog(true)}>
              <Video className="h-8 w-8" />
              {t('chat.webrtc.createRoom')}
            </Button>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Button variant="outline" className="h-32 w-full flex-col gap-3 text-lg" onClick={() => setShowJoinDialog(true)}>
              <Phone className="h-8 w-8" />
              {t('chat.webrtc.joinRoom')}
            </Button>
          </motion.div>
        </div>

        {/* 当前房间信息 */}
        <AnimatePresence>
          {currentRoom && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card>
                <CardHeader><CardTitle className="text-lg">{t('chat.webrtc.currentRoom')}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-muted p-3">
                    <span className="text-sm font-medium">{t('chat.webrtc.roomId')}:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono px-2 py-1 rounded-lg bg-background">{currentRoom.roomId}</code>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(currentRoom.roomId, t('chat.webrtc.roomId'))}>
                        <Copy className="h-4 w-4 text-primary" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-muted p-3">
                    <span className="text-sm font-medium">{t('chat.webrtc.password')}:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono px-2 py-1 rounded-lg bg-background">{currentRoom.password}</code>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(currentRoom.password, t('chat.webrtc.password'))}>
                        <Copy className="h-4 w-4 text-primary" />
                      </Button>
                    </div>
                  </div>
                  <Button className="w-full gap-2" onClick={() => copyToClipboard(`${t('chat.webrtc.roomId')}: ${currentRoom.roomId}\n${t('chat.webrtc.password')}: ${currentRoom.password}\n${t('chat.webrtc.link')}: ${currentRoom.shareLink}`, t('chat.webrtc.allInfo'))}>
                    <Copy className="h-4 w-4" />{t('chat.webrtc.copyAll')}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 创建房间 Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>{t('chat.webrtc.createDialogTitle')}</DialogTitle><DialogDescription className="sr-only">{t('chat.webrtc.createDialogDesc')}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('chat.webrtc.roomNameOptional')}</Label>
              <Input placeholder={t('chat.webrtc.myRoom')} value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Lock className="h-3 w-3" />{t('chat.webrtc.roomPasswordOptional')}</Label>
              <Input type="password" placeholder={t('chat.webrtc.autoGenerateIfEmpty')} value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('chat.webrtc.maxParticipants')}</Label>
                <Select value={maxParticipants} onValueChange={setMaxParticipants}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">{t('chat.webrtc.people', { count: 2 })}</SelectItem>
                    <SelectItem value="5">{t('chat.webrtc.people', { count: 5 })}</SelectItem>
                    <SelectItem value="10">{t('chat.webrtc.people', { count: 10 })}</SelectItem>
                    <SelectItem value="20">{t('chat.webrtc.people', { count: 20 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('chat.webrtc.duration')}</Label>
                <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">{t('chat.webrtc.minutes', { count: 30 })}</SelectItem>
                    <SelectItem value="60">{t('chat.webrtc.hour', { count: 1 })}</SelectItem>
                    <SelectItem value="120">{t('chat.webrtc.hour', { count: 2 })}</SelectItem>
                    <SelectItem value="360">{t('chat.webrtc.hour', { count: 6 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCreateDialog(false)} disabled={creating}>{t('chat.webrtc.cancel')}</Button>
            <Button className="flex-1" onClick={handleCreateRoom} disabled={creating}>
              {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('chat.webrtc.creating')}</> : t('chat.webrtc.createRoom')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 加入房间 Dialog */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>{t('chat.webrtc.joinDialogTitle')}</DialogTitle><DialogDescription className="sr-only">{t('chat.webrtc.joinDialogDesc')}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('chat.webrtc.roomIdRequired')}</Label>
              <Input placeholder={t('chat.webrtc.enterRoomIdPlaceholder')} value={joinRoomId} onChange={(e) => setJoinRoomId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('chat.webrtc.password')}</Label>
              <Input type="password" placeholder={t('chat.webrtc.enterPasswordIfAny')} value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('chat.webrtc.yourNickname')}</Label>
              <Input placeholder={t('chat.webrtc.optional')} value={joinNickname} onChange={(e) => setJoinNickname(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowJoinDialog(false)} disabled={joining}>{t('chat.webrtc.cancel')}</Button>
            <Button className="flex-1" onClick={handleJoinRoom} disabled={joining}>
              {joining ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('chat.webrtc.joining')}</> : t('chat.webrtc.joinRoom')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
