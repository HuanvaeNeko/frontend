import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { 
  faArrowLeft, 
  faMicrophone,
  faMicrophoneSlash,
  faVideo,
  faVideoSlash,
  faPhoneSlash,
  faUsers,
  faUser
} from '@fortawesome/free-solid-svg-icons'
import type { MeetingParticipant } from '../types'

// 预览数据
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
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const roomId = 'meeting-1'
  const userName = `用户${Math.floor(Math.random() * 1000)}`

  useEffect(() => {
    // 添加本地参与者
    setParticipants(prev => [
      { id: 'local', userName, videoEnabled: isVideoEnabled, audioEnabled: !isMuted },
      ...prev
    ])
  }, [])

  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  const toggleVideo = () => {
    setIsVideoEnabled(!isVideoEnabled)
    setParticipants(prev => 
      prev.map(p => 
        p.id === 'local' ? { ...p, videoEnabled: !isVideoEnabled } : p
      )
    )
  }

  const leaveMeeting = () => {
    navigate('/')
  }

  const remoteParticipants = participants.filter(p => p.id !== 'local')

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="text-gray-300 hover:text-white"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
            返回首页
          </button>
          <h1 className="text-xl font-bold text-white">视频会议</h1>
          <span className="text-sm text-gray-400">房间: {roomId}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-300">
            <FontAwesomeIcon icon={faUsers} className="mr-1" />
            参与者: {participants.length} 人
          </div>
          <button
            onClick={toggleMute}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isMuted 
                ? 'bg-red-600 text-white hover:bg-red-700' 
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            <FontAwesomeIcon icon={isMuted ? faMicrophoneSlash : faMicrophone} className="mr-2" />
            {isMuted ? '已静音' : '未静音'}
          </button>
          <button
            onClick={toggleVideo}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              !isVideoEnabled 
                ? 'bg-red-600 text-white hover:bg-red-700' 
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            <FontAwesomeIcon icon={isVideoEnabled ? faVideo : faVideoSlash} className="mr-2" />
            {isVideoEnabled ? '视频开启' : '视频关闭'}
          </button>
          <button
            onClick={leaveMeeting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <FontAwesomeIcon icon={faPhoneSlash} className="mr-2" />
            离开会议
          </button>
        </div>
      </header>

      {/* 视频区域 */}
      <div className="flex-1 p-4 overflow-auto">
        <div className={`grid gap-4 ${
          participants.length === 1 ? 'grid-cols-1' :
          participants.length === 2 ? 'grid-cols-2' :
          participants.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
        }`}>
          {/* 本地视频 */}
          <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
              <FontAwesomeIcon icon={faUser} className="mr-1" />
              {userName} (我)
            </div>
            {!isVideoEnabled && (
              <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <FontAwesomeIcon icon={faUser} className="text-6xl mb-2 text-gray-400" />
                  <div className="text-white">{userName}</div>
                </div>
              </div>
            )}
          </div>

          {/* 远程视频 */}
          {remoteParticipants.map((participant) => (
            <div
              key={participant.id}
              className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video"
            >
              <div className="w-full h-full bg-gray-700" />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
                <FontAwesomeIcon icon={faUser} className="mr-1" />
                {participant.userName}
              </div>
              {!participant.videoEnabled && (
                <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                  <div className="text-center">
                    <FontAwesomeIcon icon={faUser} className="text-6xl mb-2 text-gray-400" />
                    <div className="text-white">{participant.userName}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 控制栏 */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-center gap-4">
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isMuted 
              ? 'bg-red-600 text-white hover:bg-red-700' 
              : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
        >
          <FontAwesomeIcon icon={isMuted ? faMicrophoneSlash : faMicrophone} />
        </button>
        <button
          onClick={toggleVideo}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            !isVideoEnabled 
              ? 'bg-red-600 text-white hover:bg-red-700' 
              : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
        >
          <FontAwesomeIcon icon={isVideoEnabled ? faVideo : faVideoSlash} />
        </button>
        <button
          onClick={leaveMeeting}
          className="w-12 h-12 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center justify-center"
        >
          <FontAwesomeIcon icon={faPhoneSlash} />
        </button>
      </div>
    </div>
  )
}
