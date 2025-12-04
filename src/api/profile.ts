import { getApiBaseUrl } from '../utils/apiConfig'
import { useAuthStore } from '../store/authStore'

const PROFILE_BASE_URL = `${getApiBaseUrl()}/api/profile`

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

// 带自动重试的 fetch 封装
const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const authStore = useAuthStore.getState()
  
  // 检查 Token 是否即将过期，如果是则刷新
  if (authStore.checkTokenExpiry() && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
    } catch (error) {
      console.error('Failed to refresh token:', error)
    }
  }

  const headers = getAuthHeaders()
  
  let response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  // 如果 Token 过期，尝试刷新后重试一次
  if (response.status === 401 && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
      const newHeaders = getAuthHeaders()
      response = await fetch(url, {
        ...options,
        headers: {
          ...newHeaders,
          ...options.headers,
        },
      })
    } catch (error) {
      console.error('Token refresh failed, redirecting to login')
      authStore.clearAuth()
      window.location.href = '/login'
      throw error
    }
  }

  return response
}

export interface UserProfile {
  user_id: string
  nickname: string
  email: string
  avatar?: string
  bio?: string
  phone?: string
  birthday?: string
  gender?: 'male' | 'female' | 'other'
  location?: string
  created_at?: string
  updated_at?: string
}

export interface UpdateProfileRequest {
  nickname?: string
  email?: string
  avatar?: string
  bio?: string
  phone?: string
  birthday?: string
  gender?: 'male' | 'female' | 'other'
  location?: string
}

export interface ChangePasswordRequest {
  old_password: string
  new_password: string
}

export const profileApi = {
  // 获取个人资料
  getProfile: async (userId?: string): Promise<UserProfile> => {
    const url = userId 
      ? `${PROFILE_BASE_URL}/${userId}` 
      : `${PROFILE_BASE_URL}/me`
    
    console.log('👤 获取个人资料:', url)
    const response = await fetchWithAuth(url, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取个人资料失败 (${response.status})` 
      }))
      console.error('获取个人资料失败:', error)
      throw new Error(error.message || '获取个人资料失败')
    }

    const data = await response.json()
    return data.profile || data
  },

  // 更新个人资料
  updateProfile: async (updates: UpdateProfileRequest): Promise<UserProfile> => {
    console.log('✏️ 更新个人资料:', updates)
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}/me`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `更新个人资料失败 (${response.status})` 
      }))
      console.error('更新个人资料失败:', error)
      throw new Error(error.message || '更新个人资料失败')
    }

    const data = await response.json()
    console.log('✅ 个人资料更新成功')
    return data.profile || data
  },

  // 上传头像
  uploadAvatar: async (file: File): Promise<{ avatar_url: string }> => {
    console.log('📸 上传头像:', file.name)
    
    const formData = new FormData()
    formData.append('avatar', file)

    const authStore = useAuthStore.getState()
    const accessToken = authStore.accessToken

    const response = await fetch(`${PROFILE_BASE_URL}/avatar`, {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `上传头像失败 (${response.status})` 
      }))
      console.error('上传头像失败:', error)
      throw new Error(error.message || '上传头像失败')
    }

    const data = await response.json()
    console.log('✅ 头像上传成功')
    return data
  },

  // 修改密码
  changePassword: async (passwordData: ChangePasswordRequest): Promise<void> => {
    console.log('🔐 修改密码')
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}/password`, {
      method: 'PUT',
      body: JSON.stringify(passwordData),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `修改密码失败 (${response.status})` 
      }))
      console.error('修改密码失败:', error)
      throw new Error(error.message || '修改密码失败')
    }

    console.log('✅ 密码修改成功')
  },

  // 删除账号
  deleteAccount: async (password: string): Promise<void> => {
    console.log('🗑️ 删除账号')
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}/me`, {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `删除账号失败 (${response.status})` 
      }))
      console.error('删除账号失败:', error)
      throw new Error(error.message || '删除账号失败')
    }

    console.log('✅ 账号已删除')
  },

  // 获取用户统计信息
  getUserStats: async (): Promise<{
    friends_count: number
    messages_count: number
    groups_count: number
    storage_used: number
  }> => {
    console.log('📊 获取用户统计信息')
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}/stats`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取统计信息失败 (${response.status})` 
      }))
      console.error('获取统计信息失败:', error)
      throw new Error(error.message || '获取统计信息失败')
    }

    const data = await response.json()
    return data.stats || data
  },
}

