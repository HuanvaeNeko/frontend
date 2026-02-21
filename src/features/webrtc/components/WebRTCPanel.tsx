'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Video, Loader2, Users, Shield, Globe, Lock, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { webrtcApi } from '@/features/webrtc/api/webrtc'
import { useToast } from '@/hooks/use-toast'
import { ROUTES } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'

export default function WebRTCPanel() {
  const { t } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  
  // Create room state
  const [roomName, setRoomName] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('5')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [creating, setCreating] = useState(false)
  
  // Join room state
  const [joinRoomId, setJoinRoomId] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [joinNickname, setJoinNickname] = useState('')
  const [joining, setJoining] = useState(false)

  const handleCreateRoom = async () => {
    setCreating(true)
    try {
      const response = await webrtcApi.createRoom({
        name: roomName || undefined,
        password: roomPassword || undefined,
        max_participants: parseInt(maxParticipants),
      })
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

  const features = [
    { icon: Users, text: t('chat.webrtc.feature1'), color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { icon: Globe, text: t('chat.webrtc.feature2'), color: 'text-green-500', bg: 'bg-green-500/10' },
    { icon: Video, text: t('chat.webrtc.feature3'), color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { icon: Shield, text: t('chat.webrtc.feature4'), color: 'text-orange-500', bg: 'bg-orange-500/10' },
  ]

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4 mb-12">
           <motion.div 
             initial={{ scale: 0.9, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/20"
           >
             <Video className="w-10 h-10 text-primary" />
           </motion.div>
           <motion.h2 
             initial={{ y: 20, opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             transition={{ delay: 0.1 }}
             className="text-3xl md:text-4xl font-bold tracking-tight"
           >
             {t('chat.webrtc.title')}
           </motion.h2>
           <motion.p 
             initial={{ y: 20, opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             transition={{ delay: 0.2 }}
             className="text-lg text-muted-foreground max-w-2xl mx-auto"
           >
             {t('chat.webrtc.subtitle')}
           </motion.p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              className="h-auto py-8 w-full flex-col gap-4 rounded-2xl shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all border-0 bg-gradient-to-br from-primary to-primary/80" 
              onClick={() => setShowCreateDialog(true)}
            >
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
                 <Video className="h-8 w-8 text-white" />
              </div>
              <div className="space-y-1">
                 <span className="text-xl font-bold text-white block">{t('chat.webrtc.createRoom')}</span>
                 <span className="text-sm text-white/80 font-normal block">Start a new instant meeting</span>
              </div>
            </Button>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              variant="outline" 
              className="h-auto py-8 w-full flex-col gap-4 rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-accent/50 transition-all bg-card/50" 
              onClick={() => setShowJoinDialog(true)}
            >
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                 <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                 <span className="text-xl font-bold text-foreground block">{t('chat.webrtc.joinRoom')}</span>
                 <span className="text-sm text-muted-foreground font-normal block">Enter code to join existing meeting</span>
              </div>
            </Button>
          </motion.div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          {features.map((feature, index) => (
            <motion.div 
              key={index} 
              className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-card/50 border border-border/50 text-center" 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", feature.bg)}>
                <feature.icon className={cn("h-5 w-5", feature.color)} />
              </div>
              <span className="text-sm font-medium text-muted-foreground">{feature.text}</span>
            </motion.div>
          ))}
        </div>

        {/* Create Room Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[420px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">{t('chat.webrtc.createDialogTitle')}</DialogTitle>
              <DialogDescription>{t('chat.webrtc.createDialogDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label>{t('chat.webrtc.roomNameOptional')}</Label>
                <Input className="rounded-xl" placeholder={t('chat.webrtc.myRoom')} value={roomName} onChange={(e) => setRoomName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Lock className="h-3 w-3" />{t('chat.webrtc.roomPasswordOptional')}</Label>
                <Input className="rounded-xl" type="password" placeholder={t('chat.webrtc.autoGenerateIfEmpty')} value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('chat.webrtc.maxParticipants')}</Label>
                  <Select value={maxParticipants} onValueChange={setMaxParticipants}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
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
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
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
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setShowCreateDialog(false)} disabled={creating} className="rounded-xl">{t('chat.webrtc.cancel')}</Button>
              <Button onClick={handleCreateRoom} disabled={creating} className="rounded-xl min-w-[120px]">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t('chat.webrtc.createRoom')} <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Join Room Dialog */}
        <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
          <DialogContent className="sm:max-w-[420px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">{t('chat.webrtc.joinDialogTitle')}</DialogTitle>
              <DialogDescription>{t('chat.webrtc.joinDialogDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label>{t('chat.webrtc.roomIdRequired')}</Label>
                <div className="relative">
                  <Input className="pl-9 rounded-xl" placeholder={t('chat.webrtc.enterRoomIdPlaceholder')} value={joinRoomId} onChange={(e) => setJoinRoomId(e.target.value)} />
                  <Video className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('chat.webrtc.password')}</Label>
                <div className="relative">
                  <Input className="pl-9 rounded-xl" type="password" placeholder={t('chat.webrtc.enterPasswordIfAny')} value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('chat.webrtc.yourNickname')}</Label>
                <div className="relative">
                   <Input className="pl-9 rounded-xl" placeholder={t('chat.webrtc.optional')} value={joinNickname} onChange={(e) => setJoinNickname(e.target.value)} />
                   <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setShowJoinDialog(false)} disabled={joining} className="rounded-xl">{t('chat.webrtc.cancel')}</Button>
              <Button onClick={handleJoinRoom} disabled={joining} className="rounded-xl min-w-[120px]">
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t('chat.webrtc.joinRoom')} <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}