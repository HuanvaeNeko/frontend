import { getApiBaseUrl } from '../lib/apiConfig'
import { useAuthStore } from '../store/authStore'
import { ROUTES } from '@/lib/routes'

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
      window.location.href = ROUTES.auth.login
      throw error
    }
  }

  return response
}

// ============================================
// 类型定义
// ============================================

export interface UserProfile {
  user_id: string
  user_nickname: string
  user_email: string | null
  user_signature: string | null
  user_avatar_url: string | null
  admin: string
  created_at: string
  updated_at: string
}

export interface UpdateProfileRequest {
  nickname?: string
  email?: string
  signature?: string
}

export interface ChangePasswordRequest {
  old_password: string
  new_password: string
}

export interface AvatarUploadResponse {
  avatar_url: string
  message: string
}

// ============================================
// API 方法
// ============================================

export const profileApi = {
  /**
   * 获取个人信息
   * GET /api/profile
   */
  getProfile: async (): Promise<UserProfile> => {
    console.log('👤 获取个人资料')
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取个人资料失败 (${response.status})` 
      }))
      console.error('获取个人资料失败:', error)
      throw new Error(error.message || error.error || '获取个人资料失败')
    }

    const data = await response.json()
    return data.data || data
  },

  /**
   * 更新个人信息
   * PUT /api/profile
   * 请求体: { email?, signature? }
   */
  updateProfile: async (updates: UpdateProfileRequest): Promise<{ message: string }> => {
    console.log('✏️ 更新个人资料:', updates)
    const body: Record<string, string | undefined> = {}
    if (updates.nickname !== undefined) body.nickname = updates.nickname
    if (updates.email !== undefined) body.email = updates.email
    if (updates.signature !== undefined) body.signature = updates.signature
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `更新个人资料失败 (${response.status})` 
      }))
      console.error('更新个人资料失败:', error)
      throw new Error(error.message || error.error || '更新个人资料失败')
    }

    const data = await response.json()
    console.log('✅ 个人资料更新成功')
    return data
  },

  /**
   * 修改密码
   * PUT /api/profile/password
   * 请求体: { old_password, new_password }
   */
  changePassword: async (passwordData: ChangePasswordRequest): Promise<{ message: string }> => {
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
      throw new Error(error.message || error.error || '修改密码失败')
    }

    const data = await response.json()
    console.log('✅ 密码修改成功')
    return data
  },

  /**
   * 上传头像
   * POST /api/profile/avatar
   * 请求体: multipart/form-data (avatar 或 file 字段)
   * 支持格式: jpg, jpeg, png, gif, webp
   * 大小限制: 最大 10MB
   */
  uploadAvatar: async (file: File): Promise<AvatarUploadResponse> => {
    console.log('📸 上传头像:', file.name)
    
    // 验证文件大小
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      throw new Error(`文件太大，最大 10MB，当前: ${(file.size / 1024 / 1024).toFixed(2)} MB`)
    }
    
    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      throw new Error('不支持的文件格式，支持: jpg, jpeg, png, gif, webp')
    }
    
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
      throw new Error(error.message || error.error || '上传头像失败')
    }

    const data = await response.json()
    console.log('✅ 头像上传成功:', data.avatar_url ?? data.data?.avatar_url)
    // 后端返回 { avatar_url, message } 或 { data: { avatar_url }, message }
    const resolved = data.avatar_url != null ? data : (data.data ?? data)
    return {
      avatar_url: resolved.avatar_url ?? '',
      message: resolved.message ?? 'Avatar uploaded successfully',
    }
  },
}
