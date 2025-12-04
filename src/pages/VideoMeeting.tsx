import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Settings,
  Clock
} from 'lucide-react'
import type { MeetingParticipant } from '../types'

const mockParticipants: MeetingParticipant[] = [
  { id: '1', userName: 'Alice', videoEnabled: true, audioEnabled: true },
  { id: '2', userName: 'Bob', videoEnabled: true, audioEnabled: false },
  { id: '3', userName: 'Charlie', videoEnabled: false, audioEnabled: true }
]

export default function VideoMeeting() {
  const navigate = useNavigate()
  const [participants, setParticipants] = useState<MeetingParticipant[]>(mockParticipants)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const roomId = 'meeting-1'
  const userName = `用户${Math.floor(Math.random() * 1000)}`

  useEffect(() => {
    setParticipants(prev => [
      { id: 'local', userName, videoEnabled: isVideoEnabled, audioEnabled: !isMuted },
      ...prev
    ])

    // 自动隐藏控制栏
    let timeout: NodeJS.Timeout
    const resetTimer = () => {
      setShowControls(true)
      clearTimeout(timeout)
      timeout = setTimeout(() => setShowControls(false), 3000)
    }

    window.addEventListener('mousemove', resetTimer)
    resetTimer()

    return () => {
      window.removeEventListener('mousemove', resetTimer)
      clearTimeout(timeout)
    }
  }, [])

  const toggleMute = () => setIsMuted(!isMuted)
  const toggleVideo = () => {
    setIsVideoEnabled(!isVideoEnabled)
    setParticipants(prev => 
      prev.map(p => 
        p.id === 'local' ? { ...p, videoEnabled: !isVideoEnabled } : p
      )
    )
  }
  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)
  const leaveMeeting = () => navigate('/')

  const getAvatarColor = (name: string) => {
    const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500']
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0' : 'min-h-screen'} bg-gradient-to-br from-neutral via-neutral-focus to-neutral flex flex-col`}>
      {/* 顶部导航栏 */}
      <div className={`navbar bg-neutral-content/10 backdrop-blur-xl text-neutral-content transition-all ${showControls ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex-1">
          <button 
            onClick={leaveMeeting}
            className="btn btn-ghost gap-2"
          >
            <ArrowLeft size={20} />
            离开
          </button>
          <div className="flex items-center gap-3 ml-4">
            <div className="badge badge-success gap-2 badge-lg">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              会议进行中
            </div>
            <div className="text-sm">
              <span className="opacity-70">房间:</span> <span className="font-bold">{roomId}</span>
            </div>
          </div>
        </div>
        <div className="flex-none gap-2">
          <div className="badge badge-ghost badge-lg gap-2">
            <Users size={20} />
            {participants.length} 人
          </div>
          <button className="btn btn-ghost btn-sm gap-2">
            <Monitor size={20} />
            共享屏幕
          </button>
          <button onClick={toggleFullscreen} className="btn btn-ghost btn-sm gap-2">
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>

      {/* 视频网格区域 */}
      <div className="flex-1 p-4 overflow-auto">
        <div className={`grid gap-4 h-full ${
          participants.length === 1 ? 'grid-cols-1' :
          participants.length === 2 ? 'grid-cols-2' :
          participants.length <= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-3'
        }`}>
          {participants.map((participant, index) => {
            const isLocal = participant.id === 'local'
            const avatarColor = getAvatarColor(participant.userName)
            
            return (
              <div
                key={participant.id}
                className="relative bg-neutral-focus rounded-2xl overflow-hidden shadow-2xl group"
              >
                {/* 视频或头像 */}
                {participant.videoEnabled ? (
            <video
                    ref={isLocal ? localVideoRef : undefined}
              autoPlay
                    muted={isLocal}
              playsInline
              className="w-full h-full object-cover"
            />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral to-neutral-focus">
                    <div className="text-center">
                      <div className="avatar placeholder mb-4">
                        <div className={`${avatarColor} text-white rounded-full w-32`}>
                          <span className="text-5xl font-bold">
                            {participant.userName[0].toUpperCase()}
                          </span>
                        </div>
            </div>
                      <p className="text-neutral-content text-xl font-bold">{participant.userName}</p>
                </div>
              </div>
            )}

                {/* 参与者信息叠加层 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>

                {/* 底部信息栏 */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <div className="badge badge-neutral gap-2 shadow-lg">
                    <User size={32} />
                {participant.userName}
                    {isLocal && <span className="text-xs">(我)</span>}
                  </div>
                  <div className="flex gap-2">
                    {!participant.audioEnabled && (
                      <div className="badge badge-error gap-1">
                        <MicOff size={12} />
              </div>
                    )}
              {!participant.videoEnabled && (
                      <div className="badge badge-warning gap-1">
                        <VideoOff size={12} />
                      </div>
                    )}
                  </div>
                </div>

                {/* 局部控制按钮 */}
                {index === 0 && (
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="btn btn-sm btn-circle btn-ghost bg-black/30 backdrop-blur-sm">
                      <Settings size={16} />
                    </button>
                </div>
              )}
            </div>
            )
          })}
        </div>
      </div>

      {/* 底部控制栏 */}
      <div className={`bg-neutral-content/10 backdrop-blur-xl p-6 transition-all ${showControls ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-center gap-4">
          {/* 静音控制 */}
          <div className="tooltip tooltip-top" data-tip={isMuted ? "取消静音" : "静音"}>
        <button
          onClick={toggleMute}
              className={`btn btn-circle btn-lg ${
            isMuted 
                  ? 'btn-error hover:btn-error/80' 
                  : 'bg-neutral-content/20 hover:bg-neutral-content/30 border-0 text-white'
          }`}
        >
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
          </div>

          {/* 视频控制 */}
          <div className="tooltip tooltip-top" data-tip={isVideoEnabled ? "关闭视频" : "开启视频"}>
        <button
          onClick={toggleVideo}
              className={`btn btn-circle btn-lg ${
            !isVideoEnabled 
                  ? 'btn-error hover:btn-error/80' 
                  : 'bg-neutral-content/20 hover:bg-neutral-content/30 border-0 text-white'
          }`}
        >
              {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
        </button>
          </div>

          {/* 挂断 */}
          <div className="tooltip tooltip-top" data-tip="离开会议">
        <button
          onClick={leaveMeeting}
              className="btn btn-circle btn-lg btn-error hover:btn-error/80"
            >
              <PhoneOff size={24} />
            </button>
          </div>

          {/* 共享屏幕 */}
          <div className="tooltip tooltip-top" data-tip="共享屏幕">
            <button
              className="btn btn-circle btn-lg bg-neutral-content/20 hover:bg-neutral-content/30 border-0 text-white"
        >
              <Monitor size={24} />
        </button>
          </div>
        </div>

        {/* 会议时长 */}
        <div className="text-center mt-4">
          <div className="badge badge-ghost badge-lg text-neutral-content">
            <Clock size={16} className="mr-2" />
            00:15:42
          </div>
        </div>
      </div>
    </div>
  )
}
