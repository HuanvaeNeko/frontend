import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { 
  faRobot, 
  faComments, 
  faVideo, 
  faCog,
  faSignOutAlt,
  faUser,
  faLaptop
} from '@fortawesome/free-solid-svg-icons'
import { useAuthStore } from '../store/authStore'

export default function Home() {
  const navigate = useNavigate()
  const { user, logout, isAuthenticated } = useAuthStore()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* 顶部用户信息栏 */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white">
              <FontAwesomeIcon icon={faUser} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {user?.nickname || user?.user_id || '用户'}
              </h2>
              <p className="text-sm text-gray-600">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/devices')}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faLaptop} />
              设备管理
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faSignOutAlt} />
              登出
            </button>
          </div>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">HuanVae Chat</h1>
          <p className="text-xl text-gray-600">AI聊天 · 群聊 · 音视频会议</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* AI 聊天 */}
          <div 
            onClick={() => navigate('/ai-chat')}
            className="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow transform hover:scale-105"
          >
            <div className="text-6xl mb-4 text-center text-blue-500">
              <FontAwesomeIcon icon={faRobot} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3 text-center">AI 聊天</h2>
            <p className="text-gray-600 text-center">与 AI 助手进行智能对话</p>
          </div>

          {/* 群聊 */}
          <div 
            onClick={() => navigate('/group-chat')}
            className="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow transform hover:scale-105"
          >
            <div className="text-6xl mb-4 text-center text-blue-500">
              <FontAwesomeIcon icon={faComments} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3 text-center">群聊</h2>
            <p className="text-gray-600 text-center">与朋友实时群组聊天</p>
          </div>

          {/* 音视频会议 */}
          <div 
            onClick={() => navigate('/video-meeting')}
            className="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow transform hover:scale-105"
          >
            <div className="text-6xl mb-4 text-center text-blue-500">
              <FontAwesomeIcon icon={faVideo} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3 text-center">视频会议</h2>
            <p className="text-gray-600 text-center">高清音视频会议体验</p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/settings')}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            <FontAwesomeIcon icon={faCog} className="mr-2" />
            API 配置
          </button>
        </div>
      </div>
    </div>
  )
}