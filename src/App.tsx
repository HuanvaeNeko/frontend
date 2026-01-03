import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useEffect, useState, useCallback, Suspense, lazy } from 'react'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ProtectedRoute'
import { Toaster } from './components/ui/toaster'
import { UpdatePrompt } from './components/UpdatePrompt'
import LoadingAnimation from './components/LoadingAnimation'
import MaintenancePage from './components/MaintenancePage'
import { getApiBaseUrl } from './utils/apiConfig'

// 后端连接错误类型
interface BackendError {
  message: string
  details?: string
  status?: number
  url?: string
  timestamp?: string
}

// 懒加载页面组件
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const Home = lazy(() => import('./pages/Home'))
const AiChat = lazy(() => import('./pages/AiChat'))
const GroupChat = lazy(() => import('./pages/GroupChat'))
const VideoMeeting = lazy(() => import('./pages/VideoMeeting'))
const Settings = lazy(() => import('./pages/Settings'))
const Devices = lazy(() => import('./pages/Devices'))
const Friends = lazy(() => import('./pages/Friends'))
const Profile = lazy(() => import('./pages/Profile'))
const NotFound = lazy(() => import('./pages/NotFound'))

// 受保护路由布局
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoadingAnimation />}>
        <Outlet />
      </Suspense>
    </ProtectedRoute>
  )
}

// 公开路由布局
function PublicLayout() {
  return (
    <Suspense fallback={<LoadingAnimation />}>
      <Outlet />
    </Suspense>
  )
}

function App() {
  const { checkTokenExpiry, refreshAccessToken, refreshToken } = useAuthStore()
  
  // 后端连接状态
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [backendError, setBackendError] = useState<BackendError | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)

  // 检查后端连接
  const checkBackendConnection = useCallback(async () => {
    const baseUrl = getApiBaseUrl()
    const checkUrl = `${baseUrl}/api/auth/devices`
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      const response = await fetch(checkUrl, {
        method: 'GET',
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      if (response.status < 500) {
        setBackendStatus('connected')
        setBackendError(null)
        return true
      } else {
        let errorDetails = ''
        try {
          errorDetails = await response.text()
        } catch {
          errorDetails = '无法读取响应内容'
        }
        
        setBackendError({
          message: `服务器内部错误 (${response.status} ${response.statusText})`,
          status: response.status,
          url: checkUrl,
          details: errorDetails,
          timestamp: new Date().toLocaleString('zh-CN'),
        })
        setBackendStatus('error')
        return false
      }
    } catch (error) {
      let errorMessage = '无法连接到服务器'
      let errorDetails = ''
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = '连接超时'
          errorDetails = '请求超过 10 秒未响应'
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = '网络连接失败'
          errorDetails = '请检查网络连接或服务器是否正常运行\n\n可能的原因：\n• 服务器未启动\n• 网络连接断开\n• CORS 配置问题'
        } else {
          errorMessage = error.message
          errorDetails = error.stack || ''
        }
      }
      
      setBackendError({
        message: errorMessage,
        details: errorDetails,
        url: checkUrl,
        timestamp: new Date().toLocaleString('zh-CN'),
      })
      setBackendStatus('error')
      return false
    }
  }, [])

  // 重试连接
  const handleRetry = useCallback(async () => {
    setIsRetrying(true)
    await checkBackendConnection()
    setIsRetrying(false)
  }, [checkBackendConnection])

  // 初始检查后端连接
  useEffect(() => {
    void checkBackendConnection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  // 自动刷新 Token
  useEffect(() => {
    if (backendStatus !== 'connected') return
    
    const interval = setInterval(() => {
      if (checkTokenExpiry() && refreshToken) {
        refreshAccessToken().catch(console.error)
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [checkTokenExpiry, refreshAccessToken, refreshToken, backendStatus])

  // 正在检查连接状态
  if (backendStatus === 'checking') {
    return <LoadingAnimation />
  }

  // 后端连接失败，显示维护页面
  if (backendStatus === 'error' && backendError) {
    return (
      <MaintenancePage
        error={backendError}
        onRetry={handleRetry}
        isRetrying={isRetrying}
      />
    )
  }

  return (
    <>
      <Routes>
        {/* 公开路由 */}
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/404" element={<NotFound />} />
        </Route>
        
        {/* 受保护的路由 */}
        <Route element={<ProtectedLayout />}>
          {/* 聊天相关 */}
          <Route path="/" element={<ChatPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:friendId" element={<ChatPage />} />
          
          {/* 群聊 */}
          <Route path="/group-chat" element={<GroupChat />} />
          <Route path="/group-chat/:groupId" element={<GroupChat />} />
          
          {/* AI 聊天 */}
          <Route path="/ai-chat" element={<AiChat />} />
          
          {/* 视频会议 */}
          <Route path="/video-meeting" element={<VideoMeeting />} />
          <Route path="/video-meeting/:roomId" element={<VideoMeeting />} />
          
          {/* 用户相关 */}
          <Route path="/home" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/friends" element={<Friends />} />
          
          {/* 设置相关 */}
          <Route path="/settings" element={<Settings />} />
          <Route path="/devices" element={<Devices />} />
        </Route>
        
        {/* 未匹配路由重定向到 404 */}
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
      
      <Toaster />
      <UpdatePrompt autoUpdateDelay={3000} />
    </>
  )
}

export default App
