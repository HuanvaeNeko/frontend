import { useAuthStore } from '../store/authStore'
import { getApiBaseUrl } from '../lib/apiConfig'

const BASE_URL = getApiBaseUrl()

// 请求超时时间（毫秒）
const REQUEST_TIMEOUT = 30000

/**
 * 认证错误类
 * 用于区分认证相关的错误和其他错误
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

// 标记是否正在进行 Token 刷新（防止并发刷新）
let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

// 认证相关错误的标识
const AUTH_ERROR_MESSAGES = [
  'token',
  '无效',
  '过期',
  'expired',
  'invalid',
  'unauthorized',
  '登录',
  'login',
  '认证',
  'authentication',
]

/**
 * 判断是否是认证相关的错误
 */
const isAuthError = (error: Error | string): boolean => {
  // AuthenticationError 直接返回 true
  if (error instanceof AuthenticationError) {
    return true
  }
  
  const message = typeof error === 'string' ? error : error.message
  const lowerMessage = message.toLowerCase()
  return AUTH_ERROR_MESSAGES.some(keyword => lowerMessage.includes(keyword.toLowerCase()))
}

/**
 * 静默重定向到登录页面
 * 不抛出错误，不显示 Toast
 */
const silentRedirectToLogin = () => {
  const authStore = useAuthStore.getState()
  authStore.clearAuth()
  
  // 使用 replace 而不是 href，避免在历史记录中留下痕迹
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.replace('/login')
  }
}

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
      throw new Error('请求超时，请检查网络连接', { cause: error })
    }
    throw error
  }
}

/**
 * 尝试刷新 Token
 * 返回 true 表示刷新成功，false 表示刷新失败
 */
const tryRefreshToken = async (): Promise<boolean> => {
  const authStore = useAuthStore.getState()
  
  if (!authStore.refreshToken) {
    return false
  }

  // 如果已经在刷新中，等待刷新完成
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      await authStore.refreshAccessToken()
      return true
    } catch (error) {
      console.warn('Token 刷新失败:', error)
      return false
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * 带自动重试和超时的 fetch 封装
 * 当遇到认证错误时，自动尝试刷新 Token 或静默重定向到登录页面
 */
export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {},
  skipAuthRedirect = false
): Promise<Response> => {
  const authStore = useAuthStore.getState()

  // 检查 Token 是否即将过期，如果是则预先刷新
  if (authStore.checkTokenExpiry() && authStore.refreshToken) {
    const refreshed = await tryRefreshToken()
    if (!refreshed && !skipAuthRedirect) {
      silentRedirectToLogin()
      // 抛出错误让调用者知道认证失败，而不是让 Promise 永久挂起
      throw new AuthenticationError('Token 刷新失败，正在重定向到登录页面')
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
  if (response.status === 401) {
    const refreshed = await tryRefreshToken()
    
    if (refreshed) {
      // 刷新成功，重试请求
      const newHeaders = getAuthHeaders()
      response = await fetchWithTimeout(url, {
        ...options,
        headers: {
          ...newHeaders,
          ...options.headers,
        },
      })
      
      // 如果刷新后仍然 401，说明 refresh token 也无效
      if (response.status === 401) {
        if (!skipAuthRedirect) {
          silentRedirectToLogin()
        }
        // 无论是否跳过重定向，都抛出明确的认证错误
        throw new AuthenticationError('Token 刷新后认证仍然失败')
      }
    } else {
      if (!skipAuthRedirect) {
        // 刷新失败，静默重定向
        silentRedirectToLogin()
      }
      // 无论是否跳过重定向，都抛出明确的认证错误
      throw new AuthenticationError('Token 刷新失败，需要重新登录')
    }
  }

  return response
}

/**
 * 安全的 API 调用包装器
 * 自动处理认证错误，不会向用户显示认证相关的错误提示
 */
export const safeApiCall = async <T>(
  apiCall: () => Promise<T>,
  options?: {
    onAuthError?: () => void
    skipAuthRedirect?: boolean
  }
): Promise<T | null> => {
  try {
    return await apiCall()
  } catch (error) {
    if (error instanceof Error && isAuthError(error)) {
      // 认证错误，静默处理
      if (options?.onAuthError) {
        options.onAuthError()
      } else if (!options?.skipAuthRedirect) {
        silentRedirectToLogin()
      }
      return null
    }
    // 非认证错误，继续抛出
    throw error
  }
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

export { isAuthError }
