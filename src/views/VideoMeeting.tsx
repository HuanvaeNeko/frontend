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
  const participantsRef = useRef<Participant[]>([])
  
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

  useEffect(() => {
    participantsRef.current = participants
  }, [participants])

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
      if (!hasVideo && !hasAudio) {
        setMediaError({ type: 'camera', reason: 'not_found', message: '未检测到摄像头或麦克风' })
        setIsVideoEnabled(false)
        setIsMuted(true)
        return
      }
      const constraints: MediaStreamConstraints = {}
      if (hasVideo) constraints.video = true
      if (hasAudio) constraints.audio = true
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      setIsVideoEnabled(hasVideo)
      setIsMuted(!hasAudio)
      if (hasAudio) startVolumeDetection(stream)
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
      const participant = participantsRef.current.find(p => p.id === peerId)
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
      <div className="min-h-screen bg-[#0c0e12] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="text-center max-w-sm"
        >
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <PhoneOff size={28} className="text-red-400" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">无法加入会议</h1>
          <p className="text-[13px] text-zinc-400 mb-8 leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/chat')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-white/90 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={16} />
            返回聊天
          </button>
        </motion.div>
      </div>
    )
  }

  // =============================================
  // 连接中
  // =============================================

  if (isConnecting) {
    return (
      <div className="min-h-screen bg-[#0c0e12] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-zinc-600/80 border-t-teal-400"
          />
          <p className="text-white/90 text-sm font-medium">正在加入会议</p>
          <p className="text-zinc-500 text-xs font-mono mt-1.5">{roomId}</p>
        </motion.div>
      </div>
    )
  }

  // =============================================
  // 主页面
  // =============================================

  return (
    <div className={`${isFullscreen ? 'fixed inset-0' : 'min-h-screen'} bg-[#0c0e12] flex flex-col overflow-hidden`}>
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ y: -56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -56, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 z-20 h-14 px-4 flex items-center justify-between border-b border-white/[0.06]"
          >
            <div className="flex items-center gap-3">
              <button type="button" onClick={leaveMeeting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-400 text-sm font-medium hover:text-white hover:bg-white/[0.06] transition-colors">
                <ArrowLeft size={18} /> 离开
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse" />
                <span className="text-zinc-300 text-xs font-mono">{roomId}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={copyShareLink}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-400 text-sm hover:text-white hover:bg-white/[0.06] transition-colors">
                {copied ? <Check size={16} className="text-teal-400" /> : <Copy size={16} />}
                <span className="hidden sm:inline">{copied ? '已复制' : '复制链接'}</span>
              </button>
              <button type="button" onClick={() => setShowParticipants(!showParticipants)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-400 text-sm hover:text-white hover:bg-white/[0.06] transition-colors">
                <Users size={18} /><span>{participants.length + 1}</span>
              </button>
              <button type="button" onClick={toggleFullscreen}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 p-4 overflow-auto">
          <div className={`grid gap-4 h-full content-center ${
            allStreams.length === 1 ? 'grid-cols-1 max-w-xl mx-auto' :
            allStreams.length === 2 ? 'grid-cols-2 max-w-3xl mx-auto' :
            allStreams.length <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
          }`}>
            {allStreams.map((item, index) => {
              const videoTracks = item.stream?.getVideoTracks() || []
              const hasVideo = videoTracks.length > 0 && videoTracks[0]?.enabled
              const isActive = activeVideoId === item.id
              const isLocal = item.isLocal
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05, duration: 0.2 }}
                  onClick={() => setActiveVideoId(isActive ? null : item.id)}
                  className={`relative rounded-2xl overflow-hidden bg-zinc-900/80 border min-h-[200px] transition-all duration-200 cursor-pointer ${
                    isActive ? 'ring-2 ring-teal-400/50 border-teal-400/30' : 'border-white/[0.06]'
                  } ${item.isSpeaking ? 'ring-2 ring-teal-400/40 shadow-[0_0_24px_rgba(20,184,166,0.15)]' : ''}`}
                  style={item.isSpeaking ? { animation: 'meeting-speaking 2s ease-in-out infinite' } : undefined}
                >
                  {hasVideo ? (
                    <video
                      ref={isLocal ? localVideoRef : undefined}
                      autoPlay
                      muted={isLocal}
                      playsInline
                      className="w-full h-full min-h-[200px] object-cover"
                    />
                  ) : (
                    <div className="w-full h-full min-h-[200px] flex items-center justify-center bg-zinc-900/60">
                      <div className="text-center">
                        <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
                          <span className="text-lg font-semibold text-teal-300/90">{(item.name?.[0] || '?').toUpperCase()}</span>
                        </div>
                        <p className="text-zinc-400 text-sm">{item.name}</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/70 to-transparent">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-white text-xs font-medium truncate">{item.name}</span>
                        {item.isLocal && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300">我</span>}
                        {item.isCreator && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">主持</span>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.isSpeaking && <span className="p-1 rounded bg-teal-500/30" title="正在说话"><Mic size={10} className="text-teal-300" /></span>}
                        {item.isLocal && isMuted && <span className="p-1 rounded bg-red-500/20"><MicOff size={10} className="text-red-400" /></span>}
                        {item.isLocal && !isVideoEnabled && <span className="p-1 rounded bg-amber-500/20"><VideoOff size={10} className="text-amber-400" /></span>}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>

        <AnimatePresence>
          {showParticipants && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="shrink-0 h-full overflow-hidden border-l border-white/[0.06] bg-black/20"
            >
              <div className="w-[260px] h-full overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-zinc-300 text-sm font-medium">参与者 · {participants.length + 1}</h3>
                  <button type="button" onClick={() => setShowParticipants(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06]">
                    <X size={16} />
                  </button>
                </div>
                <ul className="space-y-1">
                  <li className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.04]">
                    <div className="w-9 h-9 rounded-full bg-teal-500/20 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-teal-300">{(displayName?.[0] || '?').toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{displayName}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <span className="text-teal-400">我</span>
                        {isCreatorRef.current && <span className="text-amber-400">主持人</span>}
                      </div>
                    </div>
                    {isSpeaking && <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />}
                  </li>
                  {remoteStreams.map(rs => (
                    <li key={rs.peerId} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                      <div className="w-9 h-9 rounded-full bg-zinc-600/40 flex items-center justify-center shrink-0 overflow-hidden">
                        {rs.participant.user_info.avatar_url ? (
                          <img src={rs.participant.user_info.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-zinc-400">{(rs.participant.name?.[0] || '?').toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{rs.participant.name}</p>
                        {rs.participant.is_creator && <span className="text-[10px] text-amber-400">主持人</span>}
                      </div>
                      {rs.isSpeaking && <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showControls && (
          <motion.footer
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 z-20 py-4 px-4 border-t border-white/[0.06] bg-black/30 relative"
          >
            <div className="flex items-center justify-center gap-2 max-w-lg mx-auto">
              <button type="button" onClick={toggleMute}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  isMuted ? 'bg-red-500/90 text-white' : 'bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]'
                }`}>
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button type="button" onClick={toggleVideo}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  !isVideoEnabled ? 'bg-amber-500/90 text-white' : 'bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]'
                }`}>
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
              <button type="button" onClick={leaveMeeting}
                className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                <PhoneOff size={20} />
              </button>
              <button type="button"
                onClick={() => isScreenSharing ? toggleScreenShare() : setShowScreenShareSettings(true)}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  isScreenSharing ? 'bg-teal-500/90 text-white' : 'bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]'
                }`}>
                <Monitor size={20} />
              </button>
              <button type="button"
                className="w-11 h-11 rounded-full bg-white/[0.08] text-zinc-400 hover:bg-white/[0.12] flex items-center justify-center">
                <Settings size={18} />
              </button>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-zinc-500 text-xs font-mono">
              <Clock size={14} />
              {formatDuration(meetingDuration)}
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      <Dialog open={showScreenShareSettings} onOpenChange={setShowScreenShareSettings}>
        <DialogContent className="max-w-sm bg-[#111318] border-white/[0.08] text-white">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">屏幕共享设置</DialogTitle>
            <DialogDescription className="text-zinc-400">选择分辨率和帧率</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">分辨率</label>
              <div className="grid grid-cols-3 gap-2">
                {(['1080p', '2k', '4k'] as ScreenShareResolution[]).map(res => {
                  const available = availableResolutions.includes(res)
                  const { width, height } = RESOLUTION_MAP[res]
                  return (
                    <button key={res} disabled={!available}
                      onClick={() => setScreenShareSettings(s => ({ ...s, resolution: res }))}
                      className={`p-2.5 rounded-xl text-center text-sm transition-colors ${
                        screenShareSettings.resolution === res
                          ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                          : available
                            ? 'bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                            : 'bg-white/[0.03] border border-white/[0.04] text-zinc-600 cursor-not-allowed'
                      }`}>
                      <div className="font-medium">{res}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{width}×{height}</div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">帧率</label>
              <div className="grid grid-cols-2 gap-2">
                {([60, 120] as ScreenShareFrameRate[]).map(fps => (
                  <button key={fps}
                    onClick={() => setScreenShareSettings(s => ({ ...s, frameRate: fps }))}
                    className={`p-2.5 rounded-xl text-center text-sm transition-colors ${
                      screenShareSettings.frameRate === fps
                        ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                        : 'bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                    }`}>
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full rounded-xl bg-teal-500 hover:bg-teal-600 text-white" onClick={() => { setShowScreenShareSettings(false); toggleScreenShare(screenShareSettings) }}>
              开始共享
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPermissionGuide} onOpenChange={setShowPermissionGuide}>
        <DialogContent className="max-w-md bg-[#111318] border-white/[0.08] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <ShieldAlert size={20} className="text-amber-400" />
              媒体权限被拒绝
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {mediaError?.message || '需要授权才能使用摄像头和麦克风'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-zinc-300 space-y-2">
                  <p>请按照以下步骤开启权限：</p>
                  <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                    <li>点击浏览器地址栏左侧的锁定图标</li>
                    <li>找到「摄像头」和「麦克风」选项</li>
                    <li>将权限设置为「允许」</li>
                    <li>刷新页面</li>
                  </ol>
                  <p className="text-zinc-500 text-xs mt-2">
                    若部署在 Cloudflare Pages，请确认站点 <code className="bg-white/10 px-1 rounded">_headers</code> 中
                    Permissions-Policy 包含 <code className="bg-white/10 px-1 rounded">camera=(self), microphone=(self)</code>。
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl border-white/[0.1] text-zinc-300 hover:bg-white/[0.06]" onClick={() => setShowPermissionGuide(false)}>
                暂不开启
              </Button>
              <Button className="flex-1 rounded-xl bg-teal-500 hover:bg-teal-600 text-white" onClick={() => { window.location.reload() }}>
                刷新页面
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes meeting-speaking {
          0%, 100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.25); }
          50% { box-shadow: 0 0 0 6px rgba(20, 184, 166, 0); }
        }
      `}</style>
    </div>
  )
}
