'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Video, Phone, Copy, Loader2, Users, Shield, Globe, Lock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { webrtcApi } from '../../api/webrtc'
import { useAuthStore } from '../../store/authStore'

export default function WebRTCPanel() {
  const router = useRouter()
  const { toast } = useToast()
  const { accessToken } = useAuthStore()
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
        name: roomName || undefined,
        password: roomPassword || undefined,
        max_participants: maxParticipants,
      })

      const shareLink = `${window.location.origin}/video-meeting?room=${response.room_id}&pwd=${roomPassword || ''}`
      
      setCurrentRoom({
        roomId: response.room_id,
        password: roomPassword || '无',
        shareLink: shareLink,
      })

      toast({
        title: '成功',
        description: '房间创建成功！正在跳转...',
      })
      
      setShowCreateDialog(false)
      
      const params = new URLSearchParams({
        room: response.room_id,
        token: accessToken || '',
        creator: 'true',
      })
      if (roomPassword) {
        params.set('pwd', roomPassword)
      }
      router.push(`/video-meeting?${params.toString()}`)
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
        password: joinPassword || '',
        display_name: joinNickname || 'Anonymous',
      })

      toast({
        title: '成功',
        description: '已加入房间！正在跳转...',
      })
      
      setShowJoinDialog(false)
      
      const params = new URLSearchParams({
        room: joinRoomId,
        token: response.ws_token || '',
      })
      if (joinNickname) {
        params.set('name', joinNickname)
      }
      router.push(`/video-meeting?${params.toString()}`)
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

  const features = [
    { icon: Users, text: '无需登录即可加入房间', color: 'text-green-500' },
    { icon: Globe, text: '自动分配最优 TURN 服务器', color: 'text-blue-500' },
    { icon: Video, text: '支持多人视频通话', color: 'text-purple-500' },
    { icon: Shield, text: '端到端加密传输', color: 'text-orange-500' },
  ]

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 功能介绍 */}
        <motion.div
          className="p-6 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.4) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(147, 197, 253, 0.3)',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
            >
              <Video className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-700">WebRTC 视频通话</h2>
              <p className="text-sm text-slate-500">创建房间后，分享房间号和密码给朋友，即可开始视频通话</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(255, 255, 255, 0.5)' }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <feature.icon className={`h-5 w-5 ${feature.color}`} />
                <span className="text-sm text-slate-600">{feature.text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* 操作按钮 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.button
            className="h-32 rounded-2xl flex flex-col items-center justify-center gap-3 text-white"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
              boxShadow: '0 10px 40px rgba(139, 92, 246, 0.3)',
            }}
            onClick={() => setShowCreateDialog(true)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            whileHover={{ 
              scale: 1.02,
              boxShadow: '0 15px 50px rgba(139, 92, 246, 0.4)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            <Video className="h-8 w-8" />
            <span className="text-lg font-semibold">创建房间</span>
          </motion.button>
          
          <motion.button
            className="h-32 rounded-2xl flex flex-col items-center justify-center gap-3"
            style={{
              background: 'rgba(255, 255, 255, 0.7)',
              border: '2px solid rgba(139, 92, 246, 0.3)',
              color: '#7c3aed',
            }}
            onClick={() => setShowJoinDialog(true)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            whileHover={{ 
              scale: 1.02,
              borderColor: 'rgba(139, 92, 246, 0.6)',
              background: 'rgba(255, 255, 255, 0.9)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            <Phone className="h-8 w-8" />
            <span className="text-lg font-semibold">加入房间</span>
          </motion.button>
        </div>

        {/* 当前房间信息 */}
        <AnimatePresence>
          {currentRoom && (
            <motion.div
              className="p-6 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.4) 100%)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <h3 className="text-lg font-semibold text-slate-700 mb-4">当前房间</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                  <span className="text-sm font-medium text-slate-600">房间号:</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono px-2 py-1 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.6)' }}>
                      {currentRoom.roomId}
                    </code>
                    <motion.button
                      className="p-2 rounded-lg"
                      style={{ background: 'rgba(255, 255, 255, 0.6)' }}
                      onClick={() => copyToClipboard(currentRoom.roomId, '房间号')}
                      whileHover={{ background: 'rgba(139, 92, 246, 0.2)' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Copy className="h-4 w-4 text-violet-500" />
                    </motion.button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                  <span className="text-sm font-medium text-slate-600">密码:</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono px-2 py-1 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.6)' }}>
                      {currentRoom.password}
                    </code>
                    <motion.button
                      className="p-2 rounded-lg"
                      style={{ background: 'rgba(255, 255, 255, 0.6)' }}
                      onClick={() => copyToClipboard(currentRoom.password, '密码')}
                      whileHover={{ background: 'rgba(139, 92, 246, 0.2)' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Copy className="h-4 w-4 text-violet-500" />
                    </motion.button>
                  </div>
                </div>

                <motion.button
                  className="w-full py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                  }}
                  onClick={() => copyToClipboard(
                    `房间号: ${currentRoom.roomId}\n密码: ${currentRoom.password}\n链接: ${currentRoom.shareLink}`,
                    '全部信息'
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Copy className="h-4 w-4" />
                  复制全部信息
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 创建房间对话框 */}
      <AnimatePresence>
        {showCreateDialog && (
          <>
            <motion.div
              className="fixed inset-0 z-[100]"
              style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateDialog(false)}
            />
            <motion.div
              className="fixed inset-0 flex items-center justify-center z-[101] pointer-events-none p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-[400px] max-w-full pointer-events-auto"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  borderRadius: '24px',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  boxShadow: '0 25px 50px -12px rgba(139, 92, 246, 0.25)',
                  padding: '24px',
                }}
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-xl font-semibold mb-6 text-slate-700">创建视频房间</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1.5 block">房间名称（可选）</label>
                    <input
                      type="text"
                      placeholder="我的房间"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-slate-700 outline-none transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                      }}
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1.5 block">
                      <Lock className="h-3 w-3 inline mr-1" />
                      房间密码（可选）
                    </label>
                    <input
                      type="password"
                      placeholder="不填自动生成"
                      value={roomPassword}
                      onChange={(e) => setRoomPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-slate-700 outline-none transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-600 mb-1.5 block">最大人数</label>
                      <select
                        className="w-full px-4 py-3 rounded-xl text-slate-700 outline-none cursor-pointer"
                        style={{
                          background: 'rgba(255, 255, 255, 0.6)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                        }}
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
                      <label className="text-sm font-medium text-slate-600 mb-1.5 block">有效期</label>
                      <select
                        className="w-full px-4 py-3 rounded-xl text-slate-700 outline-none cursor-pointer"
                        style={{
                          background: 'rgba(255, 255, 255, 0.6)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                        }}
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
                </div>

                <div className="flex gap-3 mt-6">
                  <motion.button
                    className="flex-1 py-3 px-4 rounded-xl font-medium text-slate-600"
                    style={{
                      background: 'rgba(255, 255, 255, 0.6)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                    }}
                    onClick={() => setShowCreateDialog(false)}
                    disabled={creating}
                    whileHover={{ background: 'rgba(139, 92, 246, 0.1)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    取消
                  </motion.button>
                  <motion.button
                    className="flex-1 py-3 px-4 rounded-xl font-medium text-white flex items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)',
                    }}
                    onClick={handleCreateRoom}
                    disabled={creating}
                    whileHover={{ boxShadow: '0 6px 20px rgba(139, 92, 246, 0.4)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        创建中...
                      </>
                    ) : (
                      '创建房间'
                    )}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 加入房间对话框 */}
      <AnimatePresence>
        {showJoinDialog && (
          <>
            <motion.div
              className="fixed inset-0 z-[100]"
              style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJoinDialog(false)}
            />
            <motion.div
              className="fixed inset-0 flex items-center justify-center z-[101] pointer-events-none p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-[400px] max-w-full pointer-events-auto"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  borderRadius: '24px',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  boxShadow: '0 25px 50px -12px rgba(139, 92, 246, 0.25)',
                  padding: '24px',
                }}
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-xl font-semibold mb-6 text-slate-700">加入视频房间</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1.5 block">房间号 *</label>
                    <input
                      type="text"
                      placeholder="输入房间号"
                      value={joinRoomId}
                      onChange={(e) => setJoinRoomId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-slate-700 outline-none transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                      }}
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1.5 block">密码</label>
                    <input
                      type="password"
                      placeholder="如有密码请输入"
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-slate-700 outline-none transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1.5 block">您的昵称</label>
                    <input
                      type="text"
                      placeholder="可选"
                      value={joinNickname}
                      onChange={(e) => setJoinNickname(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-slate-700 outline-none transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <motion.button
                    className="flex-1 py-3 px-4 rounded-xl font-medium text-slate-600"
                    style={{
                      background: 'rgba(255, 255, 255, 0.6)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                    }}
                    onClick={() => setShowJoinDialog(false)}
                    disabled={joining}
                    whileHover={{ background: 'rgba(139, 92, 246, 0.1)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    取消
                  </motion.button>
                  <motion.button
                    className="flex-1 py-3 px-4 rounded-xl font-medium text-white flex items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)',
                    }}
                    onClick={handleJoinRoom}
                    disabled={joining}
                    whileHover={{ boxShadow: '0 6px 20px rgba(139, 92, 246, 0.4)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {joining ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        加入中...
                      </>
                    ) : (
                      '加入房间'
                    )}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
