import { useState } from 'react'
import { Video, Phone, Users, Link as LinkIcon, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { webrtcApi } from '../../api/webrtc'

export default function WebRTCPanel() {
  const { toast } = useToast()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  // 创建房间表单
  const [roomName, setRoomName] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [maxParticipants, setMaxParticipants] = useState(5)
  const [durationMinutes, setDurationMinutes] = useState(60)

  // 加入房间表单
  const [joinRoomId, setJoinRoomId] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [joinNickname, setJoinNickname] = useState('')

  // 当前房间信息
  const [currentRoom, setCurrentRoom] = useState<{
    roomId: string
    password: string
    shareLink: string
  } | null>(null)

  const handleCreateRoom = async () => {
    setCreating(true)
    try {
      const response = await webrtcApi.createRoom({
        room_name: roomName || undefined,
        password: roomPassword || undefined,
        max_participants: maxParticipants,
        duration_minutes: durationMinutes,
      })

      const shareLink = `${window.location.origin}/video?room=${response.room_id}&pwd=${roomPassword}`
      
      setCurrentRoom({
        roomId: response.room_id,
        password: roomPassword || '无',
        shareLink,
      })

      toast({
        title: '成功',
        description: '房间创建成功！',
      })
      
      setShowCreateDialog(false)
      // TODO: 跳转到视频通话页面
    } catch (error) {
      toast({
        title: '创建失败',
        description: error instanceof Error ? error.message : '创建房间失败',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!joinRoomId.trim()) {
      toast({
        title: '错误',
        description: '请输入房间号',
        variant: 'destructive',
      })
      return
    }

    setJoining(true)
    try {
      const response = await webrtcApi.joinRoom(joinRoomId, {
        password: joinPassword || undefined,
        nickname: joinNickname || undefined,
      })

      toast({
        title: '成功',
        description: '已加入房间！',
      })
      
      setShowJoinDialog(false)
      // TODO: 跳转到视频通话页面，使用 response.ws_token
    } catch (error) {
      toast({
        title: '加入失败',
        description: error instanceof Error ? error.message : '加入房间失败',
        variant: 'destructive',
      })
    } finally {
      setJoining(false)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: '已复制',
        description: `${label}已复制到剪贴板`,
      })
    })
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 功能介绍 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              WebRTC 视频通话
            </CardTitle>
            <CardDescription>
              创建房间后，分享房间号和密码给朋友，即可开始视频通话
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 text-sm">
              <span className="text-green-600">✅</span>
              <span>无需登录即可加入房间</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <span className="text-green-600">✅</span>
              <span>自动分配最优 TURN 服务器</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <span className="text-green-600">✅</span>
              <span>支持多人视频通话</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <span className="text-green-600">✅</span>
              <span>端到端加密传输</span>
            </div>
          </CardContent>
        </Card>

        {/* 操作按钮 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            size="lg"
            className="h-32 text-lg gap-2"
            onClick={() => setShowCreateDialog(true)}
          >
            <Video className="h-6 w-6" />
            创建房间
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-32 text-lg gap-2"
            onClick={() => setShowJoinDialog(true)}
          >
            <Phone className="h-6 w-6" />
            加入房间
          </Button>
        </div>

        {/* 当前房间信息 */}
        {currentRoom && (
          <Card>
            <CardHeader>
              <CardTitle>当前房间</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">房间号:</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {currentRoom.roomId}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(currentRoom.roomId, '房间号')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">密码:</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {currentRoom.password}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(currentRoom.password, '密码')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">分享链接:</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(currentRoom.shareLink, '分享链接')}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  复制链接
                </Button>
              </div>

              <Button
                className="w-full"
                onClick={() => copyToClipboard(
                  `房间号: ${currentRoom.roomId}\n密码: ${currentRoom.password}\n链接: ${currentRoom.shareLink}`,
                  '全部信息'
                )}
              >
                复制全部信息
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 创建房间对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 max-w-[90vw]">
            <h3 className="text-lg font-semibold mb-4">创建视频房间</h3>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="roomName">房间名称（可选）</Label>
                <Input
                  id="roomName"
                  placeholder="我的房间"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="roomPassword">房间密码（可选）</Label>
                <Input
                  id="roomPassword"
                  type="password"
                  placeholder="不填自动生成"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="maxParticipants">最大人数</Label>
                <select
                  id="maxParticipants"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(Number(e.target.value))}
                >
                  <option value={2}>2人</option>
                  <option value={5}>5人</option>
                  <option value={10}>10人</option>
                  <option value={20}>20人</option>
                </select>
              </div>

              <div>
                <Label htmlFor="duration">有效期</Label>
                <select
                  id="duration"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                >
                  <option value={30}>30分钟</option>
                  <option value={60}>1小时</option>
                  <option value={120}>2小时</option>
                  <option value={360}>6小时</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCreateDialog(false)}
                disabled={creating}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreateRoom}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    创建中...
                  </>
                ) : (
                  '创建房间'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 加入房间对话框 */}
      {showJoinDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 max-w-[90vw]">
            <h3 className="text-lg font-semibold mb-4">加入视频房间</h3>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="joinRoomId">房间号</Label>
                <Input
                  id="joinRoomId"
                  placeholder="输入房间号"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="joinPassword">密码</Label>
                <Input
                  id="joinPassword"
                  type="password"
                  placeholder="如有密码请输入"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="joinNickname">您的昵称</Label>
                <Input
                  id="joinNickname"
                  placeholder="可选"
                  value={joinNickname}
                  onChange={(e) => setJoinNickname(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowJoinDialog(false)}
                disabled={joining}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={handleJoinRoom}
                disabled={joining}
              >
                {joining ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    加入中...
                  </>
                ) : (
                  '加入房间'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
