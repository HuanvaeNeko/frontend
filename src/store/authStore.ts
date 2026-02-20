import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthStore, LoginRequest, RegisterRequest } from '../types/auth'
import { authApi } from '../api/auth'
import { getAuthApiUrl } from '../lib/apiConfig'

// 仅在客户端使用 localStorage，避免 Next.js SSR 报错并保证刷新后正确恢复登录状态
const safeStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(name, value)
    } catch {
      // ignore
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(name)
    } catch {
      // ignore
    }
  },
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      tokenExpiry: null,

      login: async (credentials: LoginRequest) => {
        try {
          const authBaseUrl = getAuthApiUrl()
          const requestBody = {
            user_id: credentials.user_id,
            password: credentials.password,
            device_info: credentials.device_info || navigator.userAgent,
            mac_address: credentials.mac_address || 'unknown',
          }

          console.log('🔐 登录请求 URL:', `${authBaseUrl}/login`)
          console.log('🔐 登录请求数据:', { ...requestBody, password: '***' })

          // 添加超时控制
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时

          try {
            const response = await fetch(`${authBaseUrl}/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            })

            clearTimeout(timeoutId)

            console.log('🔐 登录响应状态:', response.status, response.statusText)

          if (!response.ok) {
            const errorText = await response.text()
            console.error('🔐 登录失败响应:', errorText)
            
            let errorData
            try {
              errorData = JSON.parse(errorText)
            } catch {
              errorData = { message: errorText || `登录失败 (${response.status})` }
            }
            
            const errorMessage = errorData.message || errorData.error || `登录失败 (${response.status}: ${response.statusText})`
            throw new Error(errorMessage)
          }

          const data = await response.json()
          console.log('🔐 登录成功，Token 已获取')
          
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isAuthenticated: true,
            tokenExpiry: Date.now() + data.expires_in * 1000,
            user: {
              user_id: credentials.user_id,
              nickname: data.nickname || '',
              email: data.email || '',
              avatar_url: data.avatar_url,
              signature: data.signature,
            },
          })
          } catch (fetchError) {
            clearTimeout(timeoutId)
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              throw new Error('请求超时，请检查网络连接或后端服务是否正常', { cause: fetchError })
            }
            throw fetchError
          }
        } catch (error) {
          console.error('❌ 登录错误:', error)
          throw error
        }
      },

      register: async (data: RegisterRequest) => {
        try {
          const authBaseUrl = getAuthApiUrl()
          const requestBody = {
            user_id: data.user_id,
            nickname: data.nickname,
            email: data.email,
            password: data.password,
          }

          console.log('📝 注册请求 URL:', `${authBaseUrl}/register`)
          console.log('📝 注册请求数据:', { ...requestBody, password: '***' })

          // 添加超时控制
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)

          try {
            const response = await fetch(`${authBaseUrl}/register`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            })

            clearTimeout(timeoutId)

            console.log('📝 注册响应状态:', response.status, response.statusText)

          if (!response.ok) {
            const errorText = await response.text()
            console.error('📝 注册失败响应:', errorText)
            
            let errorData
            try {
              errorData = JSON.parse(errorText)
            } catch {
              errorData = { message: errorText || `注册失败 (${response.status})` }
            }
            
            const errorMessage = errorData.message || errorData.error || `注册失败 (${response.status}: ${response.statusText})`
            throw new Error(errorMessage)
          }

          console.log('📝 注册成功，准备自动登录')

          // 注册成功后自动登录
          await get().login({
            user_id: data.user_id,
            password: data.password,
          })
          } catch (fetchError) {
            clearTimeout(timeoutId)
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              throw new Error('请求超时，请检查网络连接或后端服务是否正常', { cause: fetchError })
            }
            throw fetchError
          }
        } catch (error) {
          console.error('❌ 注册错误:', error)
          throw error
        }
      },

      logout: async () => {
        const { accessToken } = get()
        
        if (accessToken) {
          try {
            await authApi.logout()
          } catch (error) {
            console.error('Logout error:', error)
          }
        }

        get().clearAuth()
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()
        const authBaseUrl = getAuthApiUrl()
        
        if (!refreshToken) {
          throw new Error('No refresh token available')
        }

        try {
          const response = await fetch(`${authBaseUrl}/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              refresh_token: refreshToken,
            }),
          })

          if (!response.ok) {
            throw new Error('Token refresh failed')
          }

          const data = await response.json()
          
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenExpiry: Date.now() + data.expires_in * 1000,
          })
        } catch (error) {
          console.error('Token refresh error:', error)
          get().clearAuth()
          throw error
        }
      },

      setTokens: ({ accessToken, refreshToken, expiresIn }) => {
        set({
          accessToken,
          refreshToken,
          isAuthenticated: true,
          tokenExpiry: Date.now() + expiresIn * 1000,
        })
      },

      clearAuth: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          tokenExpiry: null,
        })
      },

      checkTokenExpiry: () => {
        const { tokenExpiry } = get()
        if (!tokenExpiry) return false
        
        // 如果 Token 在 5 分钟内过期，返回 true（需要刷新）
        const fiveMinutes = 5 * 60 * 1000
        return Date.now() >= tokenExpiry - fiveMinutes
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        tokenExpiry: state.tokenExpiry,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
