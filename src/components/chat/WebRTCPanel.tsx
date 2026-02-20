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

export default function WebRTCPanel() {
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
      setCurrentRoom({ roomId: response.room_id, password: roomPassword || '无', shareLink })
      toast({ title: '成功', description: '房间创建成功！正在跳转...' })
      setShowCreateDialog(false)
      const params = new URLSearchParams({ room: response.room_id, token: response.ws_token, creator: 'true' })
      if (roomPassword) params.set('pwd', roomPassword)
      router.push(`${ROUTES.app.videoMeeting}?${params.toString()}`)
    } catch (error) {
      toast({ title: '创建失败', description: error instanceof Error ? error.message : '创建房间失败', variant: 'destructive' })
    } finally { setCreating(false) }
  }

  const handleJoinRoom = async () => {
    if (!joinRoomId.trim()) { toast({ title: '错误', description: '请输入房间号', variant: 'destructive' }); return }
    setJoining(true)
    try {
      const response = await webrtcApi.joinRoom(joinRoomId, { password: joinPassword || '', display_name: joinNickname || 'Anonymous' })
      toast({ title: '成功', description: '已加入房间！正在跳转...' })
      setShowJoinDialog(false)
      const params = new URLSearchParams({ room: joinRoomId, token: response.ws_token || '' })
      if (joinNickname) params.set('name', joinNickname)
      router.push(`${ROUTES.app.videoMeeting}?${params.toString()}`)
    } catch (error) {
      toast({ title: '加入失败', description: error instanceof Error ? error.message : '加入房间失败', variant: 'destructive' })
    } finally { setJoining(false) }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: '已复制', description: `${label}已复制到剪贴板` }))
  }

  const features = [
    { icon: Users, text: '无需登录即可加入房间', color: 'text-primary' },
    { icon: Globe, text: '自动分配最优 TURN 服务器', color: 'text-primary' },
    { icon: Video, text: '支持多人视频通话', color: 'text-primary' },
    { icon: Shield, text: '端到端加密传输', color: 'text-primary' },
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
                <CardTitle>WebRTC 视频通话</CardTitle>
                <CardDescription>创建房间后，分享房间号和密码给朋友，即可开始视频通话</CardDescription>
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
              创建房间
            </Button>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Button variant="outline" className="h-32 w-full flex-col gap-3 text-lg" onClick={() => setShowJoinDialog(true)}>
              <Phone className="h-8 w-8" />
              加入房间
            </Button>
          </motion.div>
        </div>

        {/* 当前房间信息 */}
        <AnimatePresence>
          {currentRoom && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card>
                <CardHeader><CardTitle className="text-lg">当前房间</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-muted p-3">
                    <span className="text-sm font-medium">房间号:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono px-2 py-1 rounded-lg bg-background">{currentRoom.roomId}</code>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(currentRoom.roomId, '房间号')}>
                        <Copy className="h-4 w-4 text-primary" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-muted p-3">
                    <span className="text-sm font-medium">密码:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono px-2 py-1 rounded-lg bg-background">{currentRoom.password}</code>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(currentRoom.password, '密码')}>
                        <Copy className="h-4 w-4 text-primary" />
                      </Button>
                    </div>
                  </div>
                  <Button className="w-full gap-2" onClick={() => copyToClipboard(`房间号: ${currentRoom.roomId}\n密码: ${currentRoom.password}\n链接: ${currentRoom.shareLink}`, '全部信息')}>
                    <Copy className="h-4 w-4" />复制全部信息
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
          <DialogHeader><DialogTitle>创建视频房间</DialogTitle><DialogDescription className="sr-only">设置房间名称、密码和参数</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>房间名称（可选）</Label>
              <Input placeholder="我的房间" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Lock className="h-3 w-3" />房间密码（可选）</Label>
              <Input type="password" placeholder="不填自动生成" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>最大人数</Label>
                <Select value={maxParticipants} onValueChange={setMaxParticipants}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2人</SelectItem>
                    <SelectItem value="5">5人</SelectItem>
                    <SelectItem value="10">10人</SelectItem>
                    <SelectItem value="20">20人</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>有效期</Label>
                <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30分钟</SelectItem>
                    <SelectItem value="60">1小时</SelectItem>
                    <SelectItem value="120">2小时</SelectItem>
                    <SelectItem value="360">6小时</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCreateDialog(false)} disabled={creating}>取消</Button>
            <Button className="flex-1" onClick={handleCreateRoom} disabled={creating}>
              {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />创建中...</> : '创建房间'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 加入房间 Dialog */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>加入视频房间</DialogTitle><DialogDescription className="sr-only">输入房间号和密码加入会议</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>房间号 *</Label>
              <Input placeholder="输入房间号" value={joinRoomId} onChange={(e) => setJoinRoomId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>密码</Label>
              <Input type="password" placeholder="如有密码请输入" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>您的昵称</Label>
              <Input placeholder="可选" value={joinNickname} onChange={(e) => setJoinNickname(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowJoinDialog(false)} disabled={joining}>取消</Button>
            <Button className="flex-1" onClick={handleJoinRoom} disabled={joining}>
              {joining ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />加入中...</> : '加入房间'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
