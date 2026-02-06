'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, 
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Users,
  User,
  Monitor,
  Maximize,
  Minimize,
  Clock,
  Copy,
  Check,
  Settings,
  MessageSquare
} from 'lucide-react'
import { GlassButton, BackgroundOrbs } from '@/components/ui/glass'
import { webrtcApi, type ICEServer, type WSMessage, type Participant } from '../api/webrtc'
import { useAuthStore } from '../store/authStore'

interface RemoteStream {
  peerId: string
  stream: MediaStream
  participant: Participant
}

export default function VideoMeeting() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams<{ roomId?: string }>()
  const urlRoomId = params?.roomId
  const { user } = useAuthStore()
  
  const roomId = urlRoomId || searchParams.get('room') || ''
  const password = searchParams.get('pwd') || ''
  const displayName = searchParams.get('name') || user?.nickname || '访客'
  const urlToken = searchParams.get('token') || ''
  
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [copied, setCopied] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([])
  const [meetingDuration, setMeetingDuration] = useState(0)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({})
  const iceServersRef = useRef<ICEServer[]>([])
  const myIdRef = useRef<string>('')
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!roomId) {
      setError('房间号不能为空')
      setIsConnecting(false)
      return
    }
    initMeeting()
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  useEffect(() => {
    const resetTimer = () => {
      setShowControls(true)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }
    window.addEventListener('mousemove', resetTimer)
    resetTimer()
    return () => {
      window.removeEventListener('mousemove', resetTimer)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isConnected) return
    const timer = setInterval(() => setMeetingDuration(prev => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [isConnected])

  const initMeeting = async () => {
    try {
      setIsConnecting(true)
      setError(null)
      await getLocalStream()
      
      let wsToken: string
      
      if (urlToken) {
        // 从 WebRTCPanel 跳转过来，已有 ws_token
        wsToken = urlToken
        try {
          const iceServers = await webrtcApi.getIceServers()
          iceServersRef.current = iceServers
        } catch {
          iceServersRef.current = [{ urls: ['stun:stun.l.google.com:19302'] }]
        }
      } else {
        // 通过分享链接进入，需要 joinRoom 获取 ws_token
        const joinResult = await webrtcApi.joinRoom(roomId, {
          password,
          display_name: displayName,
          avatar_url: user?.avatar_url || undefined,
        })
        wsToken = joinResult.ws_token
        iceServersRef.current = joinResult.ice_servers
      }
      
      connectSignaling(wsToken)
    } catch (err) {
      console.error('初始化会议失败:', err)
      setError(err instanceof Error ? err.message : '初始化会议失败')
      setIsConnecting(false)
    }
  }

  const getLocalStream = async () => {
    try {
      // 检查 mediaDevices API 是否可用（需要 HTTPS 或 localhost）
      if (!navigator.mediaDevices?.enumerateDevices) {
        console.warn('navigator.mediaDevices 不可用，可能不在安全上下文中（需要 HTTPS 或 localhost）')
        setIsVideoEnabled(false)
        setIsMuted(true)
        return
      }
      const devices = await navigator.mediaDevices.enumerateDevices()
      const hasVideo = devices.some(d => d.kind === 'videoinput')
      const hasAudio = devices.some(d => d.kind === 'audioinput')
      const constraints: MediaStreamConstraints = {}
      if (hasVideo) constraints.video = true
      if (hasAudio) constraints.audio = true
      if (hasVideo || hasAudio) {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        localStreamRef.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        setIsVideoEnabled(hasVideo)
        setIsMuted(!hasAudio)
      }
    } catch (err) {
      console.warn('获取媒体流失败:', err)
      setIsVideoEnabled(false)
      setIsMuted(true)
    }
  }

  const connectSignaling = (token: string) => {
    const ws = webrtcApi.createSignalingConnection(roomId, token)
    wsRef.current = ws
    ws.onopen = () => { setIsConnected(true); setIsConnecting(false) }
    ws.onmessage = (event) => handleSignalingMessage(JSON.parse(event.data))
    ws.onclose = () => setIsConnected(false)
    ws.onerror = () => { setError('信令连接失败'); setIsConnecting(false) }
  }

  const handleSignalingMessage = async (message: WSMessage) => {
    switch (message.type) {
      case 'joined':
        myIdRef.current = message.participant_id
        setParticipants(message.participants)
        for (const p of message.participants) {
          if (shouldInitiateOffer(myIdRef.current, p.id)) await createOffer(p.id)
        }
        break
      case 'peer_joined':
        setParticipants(prev => [...prev, message.participant])
        if (shouldInitiateOffer(myIdRef.current, message.participant.id)) await createOffer(message.participant.id)
        break
      case 'peer_left':
        setParticipants(prev => prev.filter(p => p.id !== message.participant_id))
        closePeerConnection(message.participant_id)
        break
      case 'offer': await handleOffer(message.from, message.sdp); break
      case 'answer': await handleAnswer(message.from, message.sdp); break
      case 'candidate': await handleCandidate(message.from, message.candidate); break
      case 'room_closed': setError(`房间已关闭: ${message.reason}`); cleanup(); break
      case 'error': console.error('服务器错误:', message.code, message.message); break
    }
  }

  const shouldInitiateOffer = (myId: string, peerId: string): boolean => myId < peerId

  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const config: RTCConfiguration = {
      iceServers: iceServersRef.current.map(server => ({
        urls: server.urls, username: server.username, credential: server.credential,
      })),
    }
    const pc = new RTCPeerConnection(config)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!))
    }
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) webrtcApi.sendCandidate(wsRef.current, peerId, event.candidate.toJSON())
    }
    pc.ontrack = (event) => {
      const participant = participants.find(p => p.id === peerId)
      if (participant && event.streams[0]) {
        setRemoteStreams(prev => {
          const existing = prev.find(s => s.peerId === peerId)
          if (existing) return prev.map(s => s.peerId === peerId ? { ...s, stream: event.streams[0] } : s)
          return [...prev, { peerId, stream: event.streams[0], participant }]
        })
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') closePeerConnection(peerId)
    }
    peerConnectionsRef.current[peerId] = pc
    return pc
  }

  const createOffer = async (peerId: string) => {
    const pc = createPeerConnection(peerId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    if (wsRef.current && offer.sdp) webrtcApi.sendOffer(wsRef.current, peerId, offer.sdp)
  }

  const handleOffer = async (peerId: string, sdp: string) => {
    const pc = createPeerConnection(peerId)
    await pc.setRemoteDescription({ type: 'offer', sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    if (wsRef.current && answer.sdp) webrtcApi.sendAnswer(wsRef.current, peerId, answer.sdp)
  }

  const handleAnswer = async (peerId: string, sdp: string) => {
    const pc = peerConnectionsRef.current[peerId]
    if (pc) await pc.setRemoteDescription({ type: 'answer', sdp })
  }

  const handleCandidate = async (peerId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current[peerId]
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate))
  }

  const closePeerConnection = (peerId: string) => {
    const pc = peerConnectionsRef.current[peerId]
    if (pc) { pc.close(); delete peerConnectionsRef.current[peerId] }
    setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId))
  }

  const cleanup = () => {
    Object.keys(peerConnectionsRef.current).forEach(closePeerConnection)
    if (wsRef.current) { webrtcApi.leaveRoom(wsRef.current); wsRef.current.close(); wsRef.current = null }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(track => track.stop()); localStreamRef.current = null }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(track => track.stop()); screenStreamRef.current = null }
  }

  const toggleMute = () => {
    if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = isMuted })
    setIsMuted(!isMuted)
  }

  const toggleVideo = () => {
    if (localStreamRef.current) localStreamRef.current.getVideoTracks().forEach(track => { track.enabled = !isVideoEnabled })
    setIsVideoEnabled(!isVideoEnabled)
  }

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(track => track.stop()); screenStreamRef.current = null }
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0]
        if (videoTrack) Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(videoTrack)
        })
      }
      setIsScreenSharing(false)
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' } as MediaTrackConstraints, audio: true })
        screenStreamRef.current = screenStream
        const videoTrack = screenStream.getVideoTracks()[0]
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(videoTrack)
        })
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream
        videoTrack.onended = () => toggleScreenShare()
        setIsScreenSharing(true)
      } catch (err) { console.error('屏幕共享失败:', err) }
    }
  }

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); setIsFullscreen(true) }
    else { document.exitFullscreen(); setIsFullscreen(false) }
  }, [])

  const leaveMeeting = () => { cleanup(); router.push('/chat') }

  const copyShareLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/video-meeting?room=${roomId}&pwd=${password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const allStreams = [
    { id: 'local', isLocal: true, stream: localStreamRef.current, name: displayName },
    ...remoteStreams.map(rs => ({ id: rs.peerId, isLocal: false, stream: rs.stream, name: rs.participant.name })),
  ]

  // 错误页面
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center relative overflow-hidden">
        <BackgroundOrbs count={3} className="opacity-20" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 text-center p-8"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/20 backdrop-blur-xl border border-red-500/30 flex items-center justify-center">
            <PhoneOff size={36} className="text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">出错了</h2>
          <p className="text-gray-400 mb-8 max-w-md">{error}</p>
          <GlassButton onClick={() => router.push('/chat')}>
            <ArrowLeft size={18} />
            返回聊天
          </GlassButton>
        </motion.div>
      </div>
    )
  }

  // 连接中
  if (isConnecting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center relative overflow-hidden">
        <BackgroundOrbs count={3} className="opacity-20" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative z-10 text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-blue-500/30 border-t-blue-500"
          />
          <p className="text-white text-lg">正在加入会议...</p>
          <p className="text-gray-500 text-sm mt-2">房间: {roomId}</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0' : 'min-h-screen'} bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex flex-col relative overflow-hidden`}>
      <BackgroundOrbs count={3} className="opacity-10" />

      {/* 顶部导航栏 */}
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="relative z-20 h-16 px-6 flex items-center justify-between"
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
            }}
          >
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={leaveMeeting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-lg border border-white/10 text-white text-sm hover:bg-white/20 transition-colors"
              >
                <ArrowLeft size={16} />
                离开
              </motion.button>
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-lg border border-white/10">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-white/80 text-sm">房间: {roomId}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={copyShareLink}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-lg border border-white/10 text-white text-sm hover:bg-white/20 transition-colors"
              >
                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                {copied ? '已复制' : '复制链接'}
              </motion.button>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 backdrop-blur-lg border border-white/10">
                <Users size={16} className="text-white/60" />
                <span className="text-white/80 text-sm">{participants.length + 1}</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleFullscreen}
                className="p-2 rounded-xl bg-white/10 backdrop-blur-lg border border-white/10 text-white hover:bg-white/20 transition-colors"
              >
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </motion.button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* 视频网格 */}
      <div className="flex-1 p-3 overflow-auto relative z-10">
        <div className={`grid gap-3 h-full ${
          allStreams.length === 1 ? 'grid-cols-1 max-w-2xl mx-auto' :
          allStreams.length === 2 ? 'grid-cols-2 max-w-4xl mx-auto' :
          allStreams.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
        }`}>
          {allStreams.map((item, index) => {
            const videoTracks = item.stream?.getVideoTracks() || []
            const hasVideo = videoTracks.length > 0 && videoTracks[0]?.enabled
            const isActive = activeVideoId === item.id
            
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.08 }}
                onClick={() => setActiveVideoId(isActive ? null : item.id)}
                className={`relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 min-h-[180px] ${
                  isActive ? 'ring-2 ring-blue-500/70 shadow-lg shadow-blue-500/15' : ''
                }`}
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {hasVideo ? (
                  <video
                    ref={item.isLocal ? localVideoRef : undefined}
                    autoPlay
                    muted={item.isLocal}
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800/40 to-gray-900/40">
                    <div className="text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-16 h-16 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500/25 to-purple-500/25 backdrop-blur-xl border border-white/10 flex items-center justify-center"
                      >
                        <span className="text-2xl font-bold text-white/90">
                          {item.name[0]?.toUpperCase()}
                        </span>
                      </motion.div>
                      <p className="text-white/70 text-sm font-medium">{item.name}</p>
                    </div>
                  </div>
                )}

                {/* 底部信息 */}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/50 to-transparent">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/30 backdrop-blur-sm">
                      <User size={12} className="text-white/60" />
                      <span className="text-white text-xs font-medium">{item.name}</span>
                      {item.isLocal && <span className="text-[10px] text-blue-400">(我)</span>}
                    </div>
                    <div className="flex gap-1">
                      {item.isLocal && isMuted && (
                        <div className="p-1 rounded-md bg-red-500/70">
                          <MicOff size={10} className="text-white" />
                        </div>
                      )}
                      {item.isLocal && !isVideoEnabled && (
                        <div className="p-1 rounded-md bg-yellow-500/70">
                          <VideoOff size={10} className="text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* 底部控制栏 */}
      <AnimatePresence>
        {showControls && (
          <motion.footer
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="relative z-20 py-6 px-8"
            style={{
              background: 'linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
            }}
          >
            <div className="flex items-center justify-center gap-3">
              {/* 静音按钮 */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleMute}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  isMuted 
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' 
                    : 'bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20'
                }`}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </motion.button>

              {/* 视频按钮 */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleVideo}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  !isVideoEnabled 
                    ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/30' 
                    : 'bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20'
                }`}
              >
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </motion.button>

              {/* 挂断按钮 */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={leaveMeeting}
                className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/35"
              >
                <PhoneOff size={22} />
              </motion.button>

              {/* 屏幕共享 */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleScreenShare}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  isScreenSharing 
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                    : 'bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20'
                }`}
              >
                <Monitor size={20} />
              </motion.button>

              {/* 更多按钮 */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20 flex items-center justify-center"
              >
                <Settings size={20} />
              </motion.button>

              {/* 聊天按钮 */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20 flex items-center justify-center"
              >
                <MessageSquare size={20} />
              </motion.button>
            </div>

            {/* 会议时长 */}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-lg border border-white/10">
              <Clock size={16} className="text-white/60" />
              <span className="text-white/80 text-sm font-mono">{formatDuration(meetingDuration)}</span>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  )
}
