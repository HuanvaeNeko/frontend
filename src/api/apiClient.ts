import { useAuthStore } from '../store/authStore'
import { getApiBaseUrl } from '../utils/apiConfig'

const BASE_URL = getApiBaseUrl()

// 请求超时时间（毫秒）
const REQUEST_TIMEOUT = 30000

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

/**
 * 带超时控制的 fetch 封装
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeout: number = REQUEST_TIMEOUT
): Promise<Response> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接')
    }
    throw error
  }
}

/**
 * 带自动重试和超时的 fetch 封装
 */
export const fetchWithAuth = async (
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

  let response = await fetchWithTimeout(url, {
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
      response = await fetchWithTimeout(url, {
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

/**
 * 通用 API 客户端，自动处理认证和超时
 */
export const apiClient = {
  get: async (path: string, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, { ...options, method: 'GET' })
  },

  post: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  put: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  delete: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, {
      ...options,
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    })
  },
}

