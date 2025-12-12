import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, useCallback, Suspense, lazy } from 'react'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ProtectedRoute'
import { Toaster } from './components/ui/toaster'
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

// 加载状态组件
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <LoadingAnimation />
    </div>
  )
}

// 受保护的懒加载页面包装器
function ProtectedLazy({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ProtectedRoute>
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
    // 使用 /api/auth/devices 或任意一个 API 端点来检测服务可用性
    // 即使返回 401 也说明服务器是可用的
    const checkUrl = `${baseUrl}/api/auth/devices`
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
      
      const response = await fetch(checkUrl, {
        method: 'GET',
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      // 只要服务器响应了（即使是 401/403/404），就说明后端是可用的
      // 只有完全无法连接或返回 5xx 服务器错误时才认为是维护状态
      if (response.status < 500) {
        setBackendStatus('connected')
        setBackendError(null)
        return true
      } else {
        // 服务器返回 5xx 错误
        let errorDetails = ''
        try {
          const errorBody = await response.text()
          errorDetails = errorBody
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
    checkBackendConnection()
  }, [checkBackendConnection])
  
  // 自动刷新 Token
  useEffect(() => {
    if (backendStatus !== 'connected') return
    
    const interval = setInterval(() => {
      if (checkTokenExpiry() && refreshToken) {
        refreshAccessToken().catch(console.error)
      }
    }, 60000) // 每分钟检查一次

    return () => clearInterval(interval)
  }, [checkTokenExpiry, refreshAccessToken, refreshToken, backendStatus])

  // 正在检查连接状态
  if (backendStatus === 'checking') {
    return <PageLoader />
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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* 受保护的路由 */}
          <Route
            path="/"
            element={
              <ProtectedLazy>
                <ChatPage />
              </ProtectedLazy>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedLazy>
                <ChatPage />
              </ProtectedLazy>
            }
          />
          <Route
            path="/chat/:friendId"
            element={
              <ProtectedLazy>
                <ChatPage />
              </ProtectedLazy>
            }
          />
          <Route
            path="/home"
            element={
              <ProtectedLazy>
                <Home />
              </ProtectedLazy>
            }
          />
          <Route
            path="/ai-chat"
            element={
              <ProtectedLazy>
                <AiChat />
              </ProtectedLazy>
            }
          />
          <Route
            path="/group-chat"
            element={
              <ProtectedLazy>
                <GroupChat />
              </ProtectedLazy>
            }
          />
          <Route
            path="/group-chat/:groupId"
            element={
              <ProtectedLazy>
                <GroupChat />
              </ProtectedLazy>
            }
          />
          <Route
            path="/video-meeting"
            element={
              <ProtectedLazy>
                <VideoMeeting />
              </ProtectedLazy>
            }
          />
          <Route
            path="/video-meeting/:roomId"
            element={
              <ProtectedLazy>
                <VideoMeeting />
              </ProtectedLazy>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedLazy>
                <Settings />
              </ProtectedLazy>
            }
          />
          <Route
            path="/devices"
            element={
              <ProtectedLazy>
                <Devices />
              </ProtectedLazy>
            }
          />
          <Route
            path="/friends"
            element={
              <ProtectedLazy>
                <Friends />
              </ProtectedLazy>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedLazy>
                <Profile />
              </ProtectedLazy>
            }
          />
          
          {/* 404 页面 */}
          <Route path="/404" element={<NotFound />} />
          
          {/* 未匹配路由重定向到 404 */}
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}

export default App
