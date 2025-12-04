import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import AiChat from './pages/AiChat'
import GroupChat from './pages/GroupChat'
import VideoMeeting from './pages/VideoMeeting'
import Settings from './pages/Settings'
import Devices from './pages/Devices'
import Friends from './pages/Friends'
import Profile from './pages/Profile'

function App() {
  const { checkTokenExpiry, refreshAccessToken, refreshToken } = useAuthStore()

  // 自动刷新 Token
  useEffect(() => {
    const interval = setInterval(() => {
      if (checkTokenExpiry() && refreshToken) {
        refreshAccessToken().catch(console.error)
      }
    }, 60000) // 每分钟检查一次

    return () => clearInterval(interval)
  }, [checkTokenExpiry, refreshAccessToken, refreshToken])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-chat"
        element={
          <ProtectedRoute>
            <AiChat />
          </ProtectedRoute>
        }
      />
      <Route
        path="/group-chat"
        element={
          <ProtectedRoute>
            <GroupChat />
          </ProtectedRoute>
        }
      />
      <Route
        path="/video-meeting"
        element={
          <ProtectedRoute>
            <VideoMeeting />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/devices"
        element={
          <ProtectedRoute>
            <Devices />
          </ProtectedRoute>
        }
      />
      <Route
        path="/friends"
        element={
          <ProtectedRoute>
            <Friends />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App