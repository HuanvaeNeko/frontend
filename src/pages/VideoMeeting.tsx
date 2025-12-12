import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
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
  Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { webrtcApi, type ICEServer, type WSMessage, type Participant } from '../api/webrtc'
import { useAuthStore } from '../store/authStore'

interface RemoteStream {
  peerId: string
  stream: MediaStream
  participant: Participant
}

export default function VideoMeeting() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { roomId: urlRoomId } = useParams<{ roomId?: string }>()
  const { accessToken, user } = useAuthStore()
  
  // 从 URL 获取房间信息（支持路径参数和查询参数两种方式）
  const roomId = urlRoomId || searchParams.get('room') || ''
  const password = searchParams.get('pwd') || ''
  const displayName = searchParams.get('name') || user?.nickname || '访客'
  // 从 URL 获取 token（创建者使用 access_token，参与者使用 ws_token）
  const urlToken = searchParams.get('token') || ''
  const isCreator = searchParams.get('creator') === 'true'
  
  // 状态
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
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({})
  const iceServersRef = useRef<ICEServer[]>([])
  const myIdRef = useRef<string>('')
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初始化
  useEffect(() => {
    if (!roomId) {
      setError('房间号不能为空')
      setIsConnecting(false)
      return
    }

    initMeeting()

    return () => {
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // 自动隐藏控制栏
  useEffect(() => {
    const resetTimer = () => {
      setShowControls(true)
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }

    window.addEventListener('mousemove', resetTimer)
    resetTimer()

    return () => {
      window.removeEventListener('mousemove', resetTimer)
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [])

  // 会议计时器
  useEffect(() => {
    if (!isConnected) return
    
    const timer = setInterval(() => {
      setMeetingDuration(prev => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [isConnected])

  // 初始化会议
  const initMeeting = async () => {
    try {
      setIsConnecting(true)
      setError(null)

      // 1. 获取本地媒体流
      await getLocalStream()

      // 2. 获取 ICE 配置和连接 token
      let wsToken: string
      
      if (urlToken) {
        // 如果 URL 中已有 token（从 WebRTCPanel 传来），直接使用
        wsToken = urlToken
        
        if (isCreator && accessToken) {
          // 创建者：获取 ICE 服务器配置
          const iceServers = await webrtcApi.getIceServers()
          iceServersRef.current = iceServers
        } else {
          // 参与者：重新加入房间获取 ICE 配置（ws_token 可能不包含）
          // 尝试使用空 ICE 配置，如果失败再加入
          try {
            const joinResult = await webrtcApi.joinRoom(roomId, {
              password,
              display_name: displayName,
            })
            iceServersRef.current = joinResult.ice_servers
            // 更新 wsToken 为最新的
            wsToken = joinResult.ws_token
          } catch {
            // 如果已经加入过，使用默认 ICE
            iceServersRef.current = [{ urls: ['stun:stun.l.google.com:19302'] }]
          }
        }
      } else if (accessToken) {
        // 有登录状态但没有 URL token：创建者模式
        wsToken = accessToken
        const iceServers = await webrtcApi.getIceServers()
        iceServersRef.current = iceServers
      } else {
        // 未登录且无 URL token：访客需要先加入房间
        const joinResult = await webrtcApi.joinRoom(roomId, {
          password,
          display_name: displayName,
        })
        wsToken = joinResult.ws_token
        iceServersRef.current = joinResult.ice_servers
      }

      // 3. 连接信令 WebSocket
      connectSignaling(wsToken)

    } catch (err) {
      console.error('初始化会议失败:', err)
      setError(err instanceof Error ? err.message : '初始化会议失败')
      setIsConnecting(false)
    }
  }

  // 获取本地媒体流
  const getLocalStream = async () => {
    try {
      // 检测可用设备
      const devices = await navigator.mediaDevices.enumerateDevices()
      const hasVideo = devices.some(d => d.kind === 'videoinput')
      const hasAudio = devices.some(d => d.kind === 'audioinput')

      const constraints: MediaStreamConstraints = {}
      if (hasVideo) constraints.video = true
      if (hasAudio) constraints.audio = true

      if (hasVideo || hasAudio) {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        localStreamRef.current = stream
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        setIsVideoEnabled(hasVideo)
        setIsMuted(!hasAudio)
      }
    } catch (err) {
      console.warn('获取媒体流失败, 进入观看模式:', err)
      setIsVideoEnabled(false)
      setIsMuted(true)
    }
  }

  // 连接信令 WebSocket
  const connectSignaling = (token: string) => {
    const ws = webrtcApi.createSignalingConnection(roomId, token)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('✅ 信令连接已建立')
      setIsConnected(true)
      setIsConnecting(false)
    }

    ws.onmessage = (event) => {
      const message: WSMessage = JSON.parse(event.data)
      handleSignalingMessage(message)
    }

    ws.onclose = () => {
      setIsConnected(false)
      console.log('🔌 信令连接已断开')
    }

    ws.onerror = () => {
      setError('信令连接失败')
      setIsConnecting(false)
    }
  }

  // 处理信令消息
  const handleSignalingMessage = async (message: WSMessage) => {
    switch (message.type) {
      case 'joined':
        myIdRef.current = message.participant_id
        setParticipants(message.participants)
        // 向每个已存在的参与者发起连接
        for (const p of message.participants) {
          if (shouldInitiateOffer(myIdRef.current, p.id)) {
            await createOffer(p.id)
          }
        }
        break

      case 'peer_joined':
        setParticipants(prev => [...prev, message.participant])
        // 根据 ID 比较规则决定谁发起 offer
        if (shouldInitiateOffer(myIdRef.current, message.participant.id)) {
          await createOffer(message.participant.id)
        }
        break

      case 'peer_left':
        setParticipants(prev => prev.filter(p => p.id !== message.participant_id))
        closePeerConnection(message.participant_id)
        break

      case 'offer':
        await handleOffer(message.from, message.sdp)
        break

      case 'answer':
        await handleAnswer(message.from, message.sdp)
        break

      case 'candidate':
        await handleCandidate(message.from, message.candidate)
        break

      case 'room_closed':
        setError(`房间已关闭: ${message.reason}`)
        cleanup()
        break

      case 'error':
        console.error('服务器错误:', message.code, message.message)
        break
    }
  }

  // 决定谁发起 offer（ID 更小的一方发起）
  const shouldInitiateOffer = (myId: string, peerId: string): boolean => {
    return myId < peerId
  }

  // 创建 PeerConnection
  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const config: RTCConfiguration = {
      iceServers: iceServersRef.current.map(server => ({
        urls: server.urls,
        username: server.username,
        credential: server.credential,
      })),
    }

    const pc = new RTCPeerConnection(config)

    // 添加本地流
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    // ICE Candidate 事件
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        webrtcApi.sendCandidate(wsRef.current, peerId, event.candidate.toJSON())
      }
    }

    // 接收远程流
    pc.ontrack = (event) => {
      console.log('收到远程流:', peerId)
      const participant = participants.find(p => p.id === peerId)
      if (participant && event.streams[0]) {
        setRemoteStreams(prev => {
          const existing = prev.find(s => s.peerId === peerId)
          if (existing) {
            return prev.map(s => s.peerId === peerId ? { ...s, stream: event.streams[0] } : s)
          }
          return [...prev, { peerId, stream: event.streams[0], participant }]
        })
      }
    }

    // 连接状态变化
    pc.onconnectionstatechange = () => {
      console.log(`PeerConnection ${peerId} 状态:`, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        closePeerConnection(peerId)
      }
    }

    peerConnectionsRef.current[peerId] = pc
    return pc
  }

  // 发起 Offer
  const createOffer = async (peerId: string) => {
    const pc = createPeerConnection(peerId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    if (wsRef.current && offer.sdp) {
      webrtcApi.sendOffer(wsRef.current, peerId, offer.sdp)
    }
  }

  // 处理 Offer
  const handleOffer = async (peerId: string, sdp: string) => {
    const pc = createPeerConnection(peerId)
    await pc.setRemoteDescription({ type: 'offer', sdp })

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    if (wsRef.current && answer.sdp) {
      webrtcApi.sendAnswer(wsRef.current, peerId, answer.sdp)
    }
  }

  // 处理 Answer
  const handleAnswer = async (peerId: string, sdp: string) => {
    const pc = peerConnectionsRef.current[peerId]
    if (pc) {
      await pc.setRemoteDescription({ type: 'answer', sdp })
    }
  }

  // 处理 ICE Candidate
  const handleCandidate = async (peerId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current[peerId]
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  // 关闭单个 PeerConnection
  const closePeerConnection = (peerId: string) => {
    const pc = peerConnectionsRef.current[peerId]
    if (pc) {
      pc.close()
      delete peerConnectionsRef.current[peerId]
    }
    setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId))
  }

  // 清理所有资源
  const cleanup = () => {
    // 关闭所有 PeerConnection
    Object.keys(peerConnectionsRef.current).forEach(peerId => {
      closePeerConnection(peerId)
    })

    // 关闭 WebSocket
    if (wsRef.current) {
      webrtcApi.leaveRoom(wsRef.current)
      wsRef.current.close()
      wsRef.current = null
    }

    // 停止本地流
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }

    // 停止屏幕共享流
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
      screenStreamRef.current = null
    }
  }

  // 切换静音
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted
      })
    }
    setIsMuted(!isMuted)
  }

  // 切换视频
  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled
      })
    }
    setIsVideoEnabled(!isVideoEnabled)
  }

  // 切换屏幕共享
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // 停止屏幕共享，恢复摄像头
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop())
        screenStreamRef.current = null
      }
      
      // 恢复摄像头轨道
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0]
        if (videoTrack) {
          Object.values(peerConnectionsRef.current).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video')
            if (sender) {
              sender.replaceTrack(videoTrack)
            }
          })
        }
      }
      
      setIsScreenSharing(false)
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' } as MediaTrackConstraints,
          audio: true,
        })
        
        screenStreamRef.current = screenStream
        const videoTrack = screenStream.getVideoTracks()[0]
        
        // 替换所有 PeerConnection 的视频轨道
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) {
            sender.replaceTrack(videoTrack)
          }
        })
        
        // 更新本地预览
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream
        }
        
        // 监听停止共享
        videoTrack.onended = () => {
          toggleScreenShare()
        }
        
        setIsScreenSharing(true)
      } catch (err) {
        console.error('屏幕共享失败:', err)
      }
    }
  }

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  // 离开会议
  const leaveMeeting = () => {
    cleanup()
    navigate('/chat')
  }

  // 复制分享链接
  const copyShareLink = () => {
    const shareLink = `${window.location.origin}/video?room=${roomId}&pwd=${password}`
    navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 格式化时间
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // 获取头像颜色
  const getAvatarColor = (name: string) => {
    const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500']
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  // 所有显示的视频流（本地 + 远程）
  const allStreams = [
    { id: 'local', isLocal: true, stream: localStreamRef.current, name: displayName },
    ...remoteStreams.map(rs => ({ id: rs.peerId, isLocal: false, stream: rs.stream, name: rs.participant.name })),
  ]

  // 错误页面
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <h2 className="text-2xl font-bold mb-4">出错了</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <Button onClick={() => navigate('/chat')}>返回</Button>
        </div>
      </div>
    )
  }

  // 连接中
  if (isConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <div className="animate-spin w-16 h-16 border-4 border-white border-t-transparent rounded-full mx-auto mb-4" />
          <p>正在加入会议...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0' : 'min-h-screen'} bg-gray-900 flex flex-col`}>
      {/* 顶部导航栏 */}
      <header className={`h-14 bg-black/50 backdrop-blur-xl flex items-center justify-between px-4 transition-all ${showControls ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={leaveMeeting} className="text-white">
            <ArrowLeft className="h-4 w-4 mr-2" />
            离开
          </Button>
          <div className="flex items-center gap-2 text-white">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm">房间: {roomId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copyShareLink} className="text-white">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="ml-2">{copied ? '已复制' : '复制链接'}</span>
          </Button>
          <div className="flex items-center gap-1 text-white text-sm">
            <Users className="h-4 w-4" />
            <span>{participants.length + 1}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white">
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* 视频网格区域 */}
      <div className="flex-1 p-4 overflow-auto">
        <div className={`grid gap-4 h-full ${
          allStreams.length === 1 ? 'grid-cols-1' :
          allStreams.length === 2 ? 'grid-cols-2' :
          allStreams.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
        }`}>
          {allStreams.map((item) => {
            const avatarColor = getAvatarColor(item.name)
            const hasVideo = item.stream && item.stream.getVideoTracks().length > 0 && item.stream.getVideoTracks()[0].enabled
            
            return (
              <div
                key={item.id}
                className="relative bg-gray-800 rounded-2xl overflow-hidden shadow-2xl group min-h-[200px]"
              >
                {/* 视频或头像 */}
                {hasVideo ? (
                  <video
                    ref={item.isLocal ? localVideoRef : undefined}
                    autoPlay
                    muted={item.isLocal}
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                    <div className="text-center">
                      <div className={`${avatarColor} text-white rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4`}>
                        <span className="text-4xl font-bold">
                          {item.name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-white text-lg font-medium">{item.name}</p>
                    </div>
                  </div>
                )}

                {/* 底部信息栏 */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <div className="bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1 flex items-center gap-2 text-white text-sm">
                    <User className="h-4 w-4" />
                    {item.name}
                    {item.isLocal && <span className="text-xs opacity-70">(我)</span>}
                  </div>
                  <div className="flex gap-1">
                    {item.isLocal && isMuted && (
                      <div className="bg-red-500 rounded-full p-1">
                        <MicOff className="h-3 w-3 text-white" />
                      </div>
                    )}
                    {item.isLocal && !isVideoEnabled && (
                      <div className="bg-yellow-500 rounded-full p-1">
                        <VideoOff className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 底部控制栏 */}
      <footer className={`h-24 bg-black/50 backdrop-blur-xl flex items-center justify-center gap-4 transition-all ${showControls ? 'translate-y-0' : 'translate-y-full'}`}>
        <Button
          variant={isMuted ? 'destructive' : 'secondary'}
          size="lg"
          className="rounded-full w-14 h-14"
          onClick={toggleMute}
        >
          {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </Button>

        <Button
          variant={!isVideoEnabled ? 'destructive' : 'secondary'}
          size="lg"
          className="rounded-full w-14 h-14"
          onClick={toggleVideo}
        >
          {isVideoEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
        </Button>

        <Button
          variant="destructive"
          size="lg"
          className="rounded-full w-14 h-14"
          onClick={leaveMeeting}
        >
          <PhoneOff className="h-6 w-6" />
        </Button>

        <Button
          variant={isScreenSharing ? 'default' : 'secondary'}
          size="lg"
          className="rounded-full w-14 h-14"
          onClick={toggleScreenShare}
        >
          <Monitor className="h-6 w-6" />
        </Button>

        {/* 会议时长 */}
        <div className="absolute right-4 flex items-center gap-2 text-white text-sm">
          <Clock className="h-4 w-4" />
          {formatDuration(meetingDuration)}
        </div>
      </footer>
    </div>
  )
}
