import { useAuthStore } from '../store/authStore'
import { getAuthApiUrl } from '../utils/apiConfig'

const AUTH_BASE_URL = getAuthApiUrl()

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

export const authApi = {
  // 登录
  login: async (credentials: { user_id: string; password: string; device_info?: string; mac_address?: string }) => {
    const response = await fetch(`${AUTH_BASE_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...credentials,
        device_info: credentials.device_info || navigator.userAgent,
        mac_address: credentials.mac_address || 'unknown',
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '登录失败' }))
      throw new Error(error.message || '登录失败')
    }

    return response.json()
  },

  // 注册
  register: async (data: { user_id: string; nickname: string; email: string; password: string }) => {
    const response = await fetch(`${AUTH_BASE_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '注册失败' }))
      throw new Error(error.message || '注册失败')
    }

    return response.json()
  },

  // 刷新 Token
  refreshToken: async (refreshToken: string) => {
    const response = await fetch(`${AUTH_BASE_URL}/refresh`, {
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
    const response = await fetchWithAuth(`${AUTH_BASE_URL}/logout`, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Logout failed')
    }

    return response.json()
  },

  // 获取设备列表
  getDevices: async () => {
    const response = await fetchWithAuth(`${AUTH_BASE_URL}/devices`, {
      method: 'GET',
    })

    if (!response.ok) {
      throw new Error('Failed to fetch devices')
    }

    return response.json()
  },

  // 撤销设备
  revokeDevice: async (deviceId: string) => {
    const response = await fetchWithAuth(`${AUTH_BASE_URL}/devices/${deviceId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to revoke device')
    }

    return response.json()
  },
}

// 通用 API 客户端，自动处理认证
export const apiClient = {
  get: async (url: string, options?: RequestInit) => {
    return fetchWithAuth(url, { ...options, method: 'GET' })
  },

  post: async (url: string, data?: any, options?: RequestInit) => {
    return fetchWithAuth(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  put: async (url: string, data?: any, options?: RequestInit) => {
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
