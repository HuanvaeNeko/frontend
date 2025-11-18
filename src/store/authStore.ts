import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthStore, LoginRequest, RegisterRequest, User } from '../types/auth'
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

          const data = await response.json()
          
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
        } catch (error) {
          console.error('Login error:', error)
          throw error
        }
      },

      register: async (data: RegisterRequest) => {
        try {
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

          // 注册成功后自动登录
          await get().login({
            user_id: data.user_id,
            password: data.password,
          })
        } catch (error) {
          console.error('Register error:', error)
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
