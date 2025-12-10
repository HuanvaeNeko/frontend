import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthStore, LoginRequest, RegisterRequest } from '../types/auth'
import { authApi } from '../api/auth'
import { getAuthApiUrl } from '../utils/apiConfig'

const AUTH_BASE_URL = getAuthApiUrl()

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
          const requestBody = {
            user_id: credentials.user_id,
            password: credentials.password,
            device_info: credentials.device_info || navigator.userAgent,
            mac_address: credentials.mac_address || 'unknown',
          }

          console.log('🔐 登录请求 URL:', `${AUTH_BASE_URL}/login`)
          console.log('🔐 登录请求数据:', { ...requestBody, password: '***' })

          // 添加超时控制
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时

          try {
            const response = await fetch(`${AUTH_BASE_URL}/login`, {
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
              nickname: '',
              email: '',
            },
          })
          } catch (fetchError) {
            clearTimeout(timeoutId)
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              throw new Error('请求超时，请检查网络连接或后端服务是否正常')
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
          const requestBody = {
            user_id: data.user_id,
            nickname: data.nickname,
            email: data.email,
            password: data.password,
          }

          console.log('📝 注册请求 URL:', `${AUTH_BASE_URL}/register`)
          console.log('📝 注册请求数据:', { ...requestBody, password: '***' })

          // 添加超时控制
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)

          try {
            const response = await fetch(`${AUTH_BASE_URL}/register`, {
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
              throw new Error('请求超时，请检查网络连接或后端服务是否正常')
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
        
        if (!refreshToken) {
          throw new Error('No refresh token available')
        }

        try {
          const response = await fetch(`${AUTH_BASE_URL}/refresh`, {
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
      storage: createJSONStorage(() => localStorage),
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
