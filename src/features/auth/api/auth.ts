import { useAuthStore } from '@/features/auth/store/authStore'
import { getAuthApiUrl } from '@/lib/apiConfig'
import { ROUTES } from '@/lib/routes'

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

// 设备列表响应（与后端 GET /api/auth/devices 一致）
export interface DeviceInfo {
  device_id: string
  device_info?: string
  ip_address?: string
  last_active_at?: string
  created_at?: string
  is_current: boolean
}

export interface GetDevicesResponse {
  devices: DeviceInfo[]
}

export const authApi = {
  // 登录
  login: async (credentials: { user_id: string; password: string; device_info?: string; mac_address?: string }) => {
    const authBaseUrl = getAuthApiUrl()
    const requestBody = {
      user_id: credentials.user_id,  // 使用下划线，不是连字符
      password: credentials.password,
      device_info: credentials.device_info || navigator.userAgent,
      mac_address: credentials.mac_address || 'unknown',
    }
    
    console.log('登录请求:', { ...requestBody, password: '***' })
    
    const response = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `登录失败 (${response.status})` 
      }))
      console.error('登录失败:', error)
      
      // 提取错误信息
      let errorMessage = error.message || error.error || '登录失败'
      if (error.details) {
        errorMessage += ': ' + JSON.stringify(error.details)
      }
      
      throw new Error(errorMessage)
    }

    return response.json()
  },

  // 注册
  register: async (data: { user_id: string; nickname: string; email: string; password: string }) => {
    const authBaseUrl = getAuthApiUrl()
    const requestBody = {
      user_id: data.user_id,  // 使用下划线，不是连字符
      nickname: data.nickname,
      email: data.email,
      password: data.password,
    }
    
    console.log('注册请求:', requestBody)
    
    const response = await fetch(`${authBaseUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `注册失败 (${response.status})` 
      }))
      console.error('注册失败:', error)
      
      // 提取错误信息
      let errorMessage = error.message || error.error || '注册失败'
      if (error.details) {
        errorMessage += ': ' + JSON.stringify(error.details)
      }
      
      throw new Error(errorMessage)
    }

    return response.json()
  },

  // 刷新 Token
  refreshToken: async (refreshToken: string) => {
    const authBaseUrl = getAuthApiUrl()
    const response = await fetch(`${authBaseUrl}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    return response.json()
  },

  // 登出
  logout: async () => {
    const authBaseUrl = getAuthApiUrl()
    const response = await fetchWithAuth(`${authBaseUrl}/logout`, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Logout failed')
    }

    return response.json()
  },

  // 获取设备列表
  // GET /api/auth/devices，响应 { devices: DeviceInfo[] }
  getDevices: async (): Promise<GetDevicesResponse> => {
    const authBaseUrl = getAuthApiUrl()
    const response = await fetchWithAuth(`${authBaseUrl}/devices`, {
      method: 'GET',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || errorData.message || '获取设备列表失败')
    }

    const data = await response.json()
    return {
      devices: Array.isArray(data.devices) ? data.devices : [],
    }
  },

  // 撤销设备
  // DELETE /api/auth/devices/{device_id}
  revokeDevice: async (deviceId: string): Promise<void> => {
    const authBaseUrl = getAuthApiUrl()
    const response = await fetchWithAuth(`${authBaseUrl}/devices/${deviceId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || errorData.message || '撤销设备失败')
    }
  },
}

// 通用 API 客户端，自动处理认证
export const apiClient = {
  get: async (url: string, options?: RequestInit) => {
    return fetchWithAuth(url, { ...options, method: 'GET' })
  },

  post: async (url: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  put: async (url: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  delete: async (url: string, options?: RequestInit) => {
    return fetchWithAuth(url, { ...options, method: 'DELETE' })
  },
}
