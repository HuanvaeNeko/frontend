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
  X,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react'
import { GlassButton, BackgroundOrbs } from '@/components/ui/glass'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { webrtcApi, type ICEServer, type WSMessage, type Participant } from '../api/webrtc'
import { useAuthStore } from '../store/authStore'

// =============================================
// 类型定义
// =============================================

interface RemoteStream {
  peerId: string
  stream: MediaStream
  participant: Participant
  isSpeaking: boolean
  cameraStream?: MediaStream
  screenStream?: MediaStream
}

interface TransceiverRefs {
  mic: RTCRtpTransceiver | null
  camera: RTCRtpTransceiver | null
  screen: RTCRtpTransceiver | null
}

type ScreenShareResolution = '1080p' | '2k' | '4k'
type ScreenShareFrameRate = 60 | 120

interface ScreenShareSettings {
  resolution: ScreenShareResolution
  frameRate: ScreenShareFrameRate
}

interface MediaError {
  type: 'camera' | 'microphone'
  reason: 'denied' | 'not_found' | 'in_use' | 'unknown'
  message: string
}

const RESOLUTION_MAP: Record<ScreenShareResolution, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
}

function getAvailableResolutions(): ScreenShareResolution[] {
  const screenWidth = window.screen.width * (window.devicePixelRatio || 1)
  const screenHeight = window.screen.height * (window.devicePixelRatio || 1)
  const all: ScreenShareResolution[] = ['1080p', '2k', '4k']
  return all.filter((res) => {
    const { width, height } = RESOLUTION_MAP[res]
    return width <= screenWidth && height <= screenHeight
  })
}

function parseMediaError(err: unknown, type: 'camera' | 'microphone'): MediaError {
  const typeName = type === 'camera' ? '摄像头' : '麦克风'
  if (err instanceof Error) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return { type, reason: 'denied', message: `${typeName}权限被拒绝` }
      case 'NotFoundError':
        return { type, reason: 'not_found', message: `未检测到${typeName}` }
      case 'NotReadableError':
        return { type, reason: 'in_use', message: `${typeName}被其他应用占用` }
      default:
        return { type, reason: 'unknown', message: `${typeName}初始化失败: ${err.message}` }
    }
  }
  return { type, reason: 'unknown', message: `${typeName}初始化失败` }
}

// =============================================
// 组件
// =============================================

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
  
  // UI 状态
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
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [showScreenShareSettings, setShowScreenShareSettings] = useState(false)
  const [screenShareSettings, setScreenShareSettings] = useState<ScreenShareSettings>({ resolution: '1080p', frameRate: 60 })
  const [availableResolutions, setAvailableResolutions] = useState<ScreenShareResolution[]>(['1080p'])
  const [mediaError, setMediaError] = useState<MediaError | null>(null)
  const [showPermissionGuide, setShowPermissionGuide] = useState(false)
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({})
  const transceiverMapRef = useRef<Map<string, TransceiverRefs>>(new Map())
  const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map())
  const mediaTypeMapsRef = useRef<Map<string, Map<string, 'camera' | 'screen'>>>(new Map())
  const iceServersRef = useRef<ICEServer[]>([])
  const myIdRef = useRef<string>('')
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const negotiationLockRef = useRef<Set<string>>(new Set())
  
  // 发言检测
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number>(0)
  const lastSpeakingRef = useRef(false)
  const isCreatorRef = useRef(false)

  // =============================================
  // 生命周期
  // =============================================

  useEffect(() => {
    if (!roomId) {
      setError('房间号不能为空')
      setIsConnecting(false)
      return
    }
    setAvailableResolutions(getAvailableResolutions())
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

  // 权限错误时显示引导
  useEffect(() => {
    if (mediaError?.reason === 'denied') {
      setShowPermissionGuide(true)
    }
  }, [mediaError])

  // =============================================
  // 发言检测
  // =============================================

  const broadcastSpeakingStatus = useCallback((speaking: boolean) => {
    const message = JSON.stringify({ type: 'speaking', speaking })
    dataChannelsRef.current.forEach((channel) => {
      if (channel.readyState === 'open') {
        channel.send(message)
      }
    })
  }, [])

  const startVolumeDetection = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.5

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const SPEAKING_THRESHOLD = 30

      const detectVolume = () => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const average = sum / dataArray.length
        const speaking = average > SPEAKING_THRESHOLD

        if (speaking !== lastSpeakingRef.current) {
          lastSpeakingRef.current = speaking
          setIsSpeaking(speaking)
          broadcastSpeakingStatus(speaking)
        }

        animationFrameRef.current = requestAnimationFrame(detectVolume)
      }

      detectVolume()
    } catch (err) {
      console.warn('发言检测初始化失败:', err)
    }
  }, [broadcastSpeakingStatus])

  const stopVolumeDetection = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null
    lastSpeakingRef.current = false
    setIsSpeaking(false)
  }, [])

  // =============================================
  // DataChannel 媒体类型广播
  // =============================================

  const broadcastMediaType = useCallback((peerId: string, mid: string, mediaType: 'camera' | 'screen') => {
    const channel = dataChannelsRef.current.get(peerId)
    if (channel?.readyState === 'open') {
      channel.send(JSON.stringify({ type: 'media-type', mid, mediaType }))
    }
  }, [])

  const waitForMidAndBroadcast = useCallback((transceiver: RTCRtpTransceiver, peerId: string, mediaType: 'camera' | 'screen') => {
    let attempts = 0
    const checkMid = () => {
      if (transceiver.mid) {
        broadcastMediaType(peerId, transceiver.mid, mediaType)
      } else if (attempts < 20) {
        attempts++
        setTimeout(checkMid, 100)
      }
    }
    checkMid()
  }, [broadcastMediaType])

  const handleDataChannelMessage = useCallback((peerId: string, data: string) => {
    try {
      const message = JSON.parse(data)
      if (message.type === 'speaking') {
        setRemoteStreams(prev => prev.map(s =>
          s.peerId === peerId ? { ...s, isSpeaking: message.speaking } : s
        ))
      } else if (message.type === 'media-type') {
        // 更新媒体类型映射
        if (!mediaTypeMapsRef.current.has(peerId)) {
          mediaTypeMapsRef.current.set(peerId, new Map())
        }
        mediaTypeMapsRef.current.get(peerId)!.set(message.mid, message.mediaType)
      }
    } catch {
      // 忽略解析错误
    }
  }, [])

  // =============================================
  // 初始化
  // =============================================

  const initMeeting = async () => {
    try {
      setIsConnecting(true)
      setError(null)
      await getLocalStream()
      
      let wsToken: string
      
      if (urlToken) {
        wsToken = urlToken
        try {
          const iceServers = await webrtcApi.getIceServers()
          iceServersRef.current = iceServers
        } catch {
          iceServersRef.current = [{ urls: ['stun:stun.l.google.com:19302'] }]
        }
      } else {
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
      if (!navigator.mediaDevices?.enumerateDevices) {
        console.warn('navigator.mediaDevices 不可用，可能不在安全上下文中（需要 HTTPS 或 localhost）')
        setMediaError({ type: 'camera', reason: 'unknown', message: '请使用 HTTPS 或 localhost 访问以启用媒体设备' })
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
        // 启动发言检测
        if (hasAudio) startVolumeDetection(stream)
      }
    } catch (err) {
      const mediaErr = parseMediaError(err, 'camera')
      console.warn('获取媒体流失败:', mediaErr.message)
      setMediaError(mediaErr)
      setIsVideoEnabled(false)
      setIsMuted(true)
    }
  }

  // =============================================
  // 信令连接
  // =============================================

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
        // 检测是否是创建者
        isCreatorRef.current = message.participants.length === 0
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

  // =============================================
  // PeerConnection 管理 (Transceiver 架构)
  // =============================================

  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const config: RTCConfiguration = {
      iceServers: iceServersRef.current.map(server => ({
        urls: server.urls, username: server.username, credential: server.credential,
      })),
    }
    const pc = new RTCPeerConnection(config)

    // 初始化 transceiver refs
    const tRefs: TransceiverRefs = { mic: null, camera: null, screen: null }
    transceiverMapRef.current.set(peerId, tRefs)

    // 添加本地媒体流的 tracks 通过 transceiver
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      const videoTrack = localStreamRef.current.getVideoTracks()[0]

      if (audioTrack) {
        tRefs.mic = pc.addTransceiver(audioTrack, { direction: 'sendrecv' })
      }
      if (videoTrack) {
        tRefs.camera = pc.addTransceiver(videoTrack, { direction: 'sendrecv' })
      }
    }

    // 设置 DataChannel
    const channel = pc.createDataChannel('status', { ordered: true })
    channel.onmessage = (e) => handleDataChannelMessage(peerId, e.data)
    channel.onopen = () => {
      // 广播当前摄像头 transceiver 的 mid
      if (tRefs.camera?.mid) {
        broadcastMediaType(peerId, tRefs.camera.mid, 'camera')
      }
    }
    dataChannelsRef.current.set(peerId, channel)

    pc.ondatachannel = (event) => {
      event.channel.onmessage = (e) => handleDataChannelMessage(peerId, e.data)
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
          return [...prev, { peerId, stream: event.streams[0], participant, isSpeaking: false }]
        })
      }
    }

    pc.onnegotiationneeded = async () => {
      // 安全重协商：检查 signalingState 和锁
      if (pc.signalingState !== 'stable' || negotiationLockRef.current.has(peerId)) return
      negotiationLockRef.current.add(peerId)
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        if (wsRef.current && offer.sdp) webrtcApi.sendOffer(wsRef.current, peerId, offer.sdp)
      } catch (err) {
        console.error('重协商失败:', err)
      } finally {
        negotiationLockRef.current.delete(peerId)
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
    transceiverMapRef.current.delete(peerId)
    dataChannelsRef.current.delete(peerId)
    mediaTypeMapsRef.current.delete(peerId)
    setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId))
  }

  const cleanup = () => {
    stopVolumeDetection()
    Object.keys(peerConnectionsRef.current).forEach(closePeerConnection)
    if (wsRef.current) { webrtcApi.leaveRoom(wsRef.current); wsRef.current.close(); wsRef.current = null }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(track => track.stop()); localStreamRef.current = null }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(track => track.stop()); screenStreamRef.current = null }
  }

  // =============================================
  // 媒体控制
  // =============================================

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = isMuted })
      if (isMuted) {
        // 重新开始发言检测
        startVolumeDetection(localStreamRef.current)
      } else {
        stopVolumeDetection()
        broadcastSpeakingStatus(false)
      }
    }
    setIsMuted(!isMuted)
  }

  const toggleVideo = () => {
    if (localStreamRef.current) localStreamRef.current.getVideoTracks().forEach(track => { track.enabled = !isVideoEnabled })
    setIsVideoEnabled(!isVideoEnabled)
  }

  const toggleScreenShare = async (settings?: ScreenShareSettings) => {
    if (isScreenSharing) {
      // 停止屏幕共享
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop())
        screenStreamRef.current = null
      }
      // 恢复摄像头
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0]
        if (videoTrack) {
          Object.entries(peerConnectionsRef.current).forEach(([peerId, pc]) => {
            const tRefs = transceiverMapRef.current.get(peerId)
            // 恢复 camera transceiver
            if (tRefs?.camera) {
              tRefs.camera.sender.replaceTrack(videoTrack).catch(console.error)
            }
            // 停止 screen transceiver
            if (tRefs?.screen) {
              tRefs.screen.sender.replaceTrack(null).catch(console.error)
              tRefs.screen.direction = 'inactive'
            }
            void pc // reference to avoid lint
          })
        }
      }
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current
      }
      setIsScreenSharing(false)
    } else {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          console.error('getDisplayMedia 不可用，需要 HTTPS 或 localhost')
          setMediaError({ type: 'camera', reason: 'unknown', message: '屏幕共享需要 HTTPS 或 localhost 环境' })
          setShowPermissionGuide(true)
          return
        }

        const res = settings?.resolution ?? screenShareSettings.resolution
        const fps = settings?.frameRate ?? screenShareSettings.frameRate
        const { width, height } = RESOLUTION_MAP[res]

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: fps, max: fps },
            width: { ideal: width },
            height: { ideal: height },
          } as MediaTrackConstraints,
          audio: false,
        })
        screenStreamRef.current = screenStream
        const videoTrack = screenStream.getVideoTracks()[0]

        // 设置 contentHint 优先动态内容
        if ('contentHint' in videoTrack) {
          (videoTrack as MediaStreamTrack & { contentHint: string }).contentHint = 'motion'
        }

        // 通过 transceiver 发送屏幕共享
        Object.entries(peerConnectionsRef.current).forEach(([peerId, pc]) => {
          const tRefs = transceiverMapRef.current.get(peerId)
          if (tRefs?.screen) {
            tRefs.screen.sender.replaceTrack(videoTrack).catch(console.error)
            tRefs.screen.direction = 'sendrecv'
          } else {
            const transceiver = pc.addTransceiver(videoTrack, { direction: 'sendrecv' })
            if (tRefs) tRefs.screen = transceiver
            waitForMidAndBroadcast(transceiver, peerId, 'screen')
          }
        })

        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream
        videoTrack.onended = () => toggleScreenShare()
        setIsScreenSharing(true)
      } catch (err) {
        console.error('屏幕共享失败:', err)
      }
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
    { id: 'local', isLocal: true, stream: localStreamRef.current, name: displayName, isSpeaking, isCreator: isCreatorRef.current },
    ...remoteStreams.map(rs => ({ id: rs.peerId, isLocal: false, stream: rs.stream, name: rs.participant.name, isSpeaking: rs.isSpeaking, isCreator: rs.participant.is_creator })),
  ]

  // =============================================
  // 错误页面
  // =============================================

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

  // =============================================
  // 连接中
  // =============================================

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

  // =============================================
  // 主页面
  // =============================================

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
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
          >
            <div className="flex items-center gap-4">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={leaveMeeting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-lg border border-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                <ArrowLeft size={16} /> 离开
              </motion.button>
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-lg border border-white/10">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-white/80 text-sm">房间: {roomId}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={copyShareLink}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-lg border border-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                {copied ? '已复制' : '复制链接'}
              </motion.button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setShowParticipants(!showParticipants)}
                className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 backdrop-blur-lg border border-white/10 text-white hover:bg-white/20 transition-colors">
                <Users size={16} className="text-white/60" />
                <span className="text-white/80 text-sm">{participants.length + 1}</span>
              </motion.button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={toggleFullscreen}
                className="p-2 rounded-xl bg-white/10 backdrop-blur-lg border border-white/10 text-white hover:bg-white/20 transition-colors">
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </motion.button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* 视频网格 + 参与者侧边栏 */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* 视频网格 */}
        <div className="flex-1 p-3 overflow-auto">
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
                  } ${item.isSpeaking ? 'ring-2 ring-green-500/70 shadow-lg shadow-green-500/20' : ''}`}
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    animation: item.isSpeaking ? 'speaking-pulse 1.5s ease-in-out infinite' : undefined,
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
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                          className="w-16 h-16 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500/25 to-purple-500/25 backdrop-blur-xl border border-white/10 flex items-center justify-center">
                          <span className="text-2xl font-bold text-white/90">{item.name[0]?.toUpperCase()}</span>
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
                        {item.isCreator && <span className="text-[10px] text-yellow-400 ml-1">主持人</span>}
                      </div>
                      <div className="flex gap-1">
                        {item.isSpeaking && (
                          <div className="p-1 rounded-md bg-green-500/70">
                            <Mic size={10} className="text-white" />
                          </div>
                        )}
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

        {/* 参与者侧边栏 */}
        <AnimatePresence>
          {showParticipants && (
            <motion.aside
              initial={{ x: 280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 280, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-[280px] shrink-0 h-full overflow-y-auto p-4"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                backdropFilter: 'blur(16px)',
                borderLeft: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium text-sm">参与者 ({participants.length + 1})</h3>
                <button onClick={() => setShowParticipants(false)} className="text-white/40 hover:text-white/80 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <ul className="space-y-2">
                {/* 本地用户 */}
                <li className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-white/90">{displayName[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{displayName}</p>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-blue-400">我</span>
                      {isCreatorRef.current && <span className="text-[10px] text-yellow-400">主持人</span>}
                    </div>
                  </div>
                  {isSpeaking && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
                </li>
                {/* 远程参与者 */}
                {remoteStreams.map(rs => (
                  <li key={rs.peerId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center shrink-0">
                      {rs.participant.user_info.avatar_url ? (
                        <img src={rs.participant.user_info.avatar_url} alt="" className="w-full h-full rounded-lg object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-white/90">{rs.participant.name[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{rs.participant.name}</p>
                      {rs.participant.is_creator && <span className="text-[10px] text-yellow-400">主持人</span>}
                    </div>
                    {rs.isSpeaking && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
                  </li>
                ))}
              </ul>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* 底部控制栏 */}
      <AnimatePresence>
        {showControls && (
          <motion.footer
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="relative z-20 py-6 px-8"
            style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
          >
            <div className="flex items-center justify-center gap-3">
              {/* 静音 */}
              <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} onClick={toggleMute}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20'
                }`}>
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </motion.button>

              {/* 视频 */}
              <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} onClick={toggleVideo}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  !isVideoEnabled ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/30' : 'bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20'
                }`}>
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </motion.button>

              {/* 挂断 */}
              <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} onClick={leaveMeeting}
                className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/35">
                <PhoneOff size={22} />
              </motion.button>

              {/* 屏幕共享 */}
              <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
                onClick={() => isScreenSharing ? toggleScreenShare() : setShowScreenShareSettings(true)}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                  isScreenSharing ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20'
                }`}>
                <Monitor size={20} />
              </motion.button>

              {/* 设置 */}
              <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
                className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20 flex items-center justify-center">
                <Settings size={20} />
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

      {/* 屏幕共享设置弹窗 */}
      <Dialog open={showScreenShareSettings} onOpenChange={setShowScreenShareSettings}>
        <DialogContent className="max-w-sm bg-gray-900/95 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>屏幕共享设置</DialogTitle>
            <DialogDescription className="text-gray-400">选择分辨率和帧率</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm text-gray-300 mb-2 block">分辨率</label>
              <div className="grid grid-cols-3 gap-2">
                {(['1080p', '2k', '4k'] as ScreenShareResolution[]).map(res => {
                  const available = availableResolutions.includes(res)
                  const { width, height } = RESOLUTION_MAP[res]
                  return (
                    <button key={res} disabled={!available}
                      onClick={() => setScreenShareSettings(s => ({ ...s, resolution: res }))}
                      className={`p-2 rounded-lg text-center text-sm transition-all ${
                        screenShareSettings.resolution === res
                          ? 'bg-blue-500/30 border-blue-500/60 border text-blue-300'
                          : available
                            ? 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                            : 'bg-white/5 border border-white/5 text-white/20 cursor-not-allowed'
                      }`}>
                      <div className="font-medium">{res}</div>
                      <div className="text-[10px] text-white/40">{width}×{height}</div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-2 block">帧率</label>
              <div className="grid grid-cols-2 gap-2">
                {([60, 120] as ScreenShareFrameRate[]).map(fps => (
                  <button key={fps}
                    onClick={() => setScreenShareSettings(s => ({ ...s, frameRate: fps }))}
                    className={`p-2 rounded-lg text-center text-sm transition-all ${
                      screenShareSettings.frameRate === fps
                        ? 'bg-blue-500/30 border-blue-500/60 border text-blue-300'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                    }`}>
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={() => { setShowScreenShareSettings(false); toggleScreenShare(screenShareSettings) }}>
              开始共享
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 权限引导弹窗 */}
      <Dialog open={showPermissionGuide} onOpenChange={setShowPermissionGuide}>
        <DialogContent className="max-w-md bg-gray-900/95 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert size={20} className="text-yellow-400" />
              媒体权限被拒绝
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {mediaError?.message || '需要授权才能使用摄像头和麦克风'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-yellow-400 shrink-0 mt-0.5" />
                <div className="text-sm text-gray-300 space-y-2">
                  <p>请按照以下步骤开启权限：</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-400">
                    <li>点击浏览器地址栏左侧的锁定图标</li>
                    <li>找到"摄像头"和"麦克风"选项</li>
                    <li>将权限设置为"允许"</li>
                    <li>刷新页面</li>
                  </ol>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-white/10 text-white hover:bg-white/10" onClick={() => setShowPermissionGuide(false)}>
                暂不开启
              </Button>
              <Button className="flex-1" onClick={() => { window.location.reload() }}>
                刷新页面
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 发言脉冲动画 CSS */}
      <style>{`
        @keyframes speaking-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.3); }
          50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
        }
      `}</style>
    </div>
  )
}
