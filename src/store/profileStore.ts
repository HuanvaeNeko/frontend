import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { profileApi, type UserProfile, type UpdateProfileRequest, type ChangePasswordRequest } from '../api/profile'

interface ProfileState {
  profile: UserProfile | null
  stats: {
    friends_count: number
    messages_count: number
    groups_count: number
    storage_used: number
  } | null
  isLoading: boolean
  error: string | null

  // Actions
  loadProfile: (userId?: string) => Promise<void>
  updateProfile: (updates: UpdateProfileRequest) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  changePassword: (passwordData: ChangePasswordRequest) => Promise<void>
  deleteAccount: (password: string) => Promise<void>
  loadStats: () => Promise<void>
  clearProfile: () => void
  clearError: () => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      stats: null,
      isLoading: false,
      error: null,

      loadProfile: async (userId?: string) => {
        set({ isLoading: true, error: null })
        try {
          const profile = await profileApi.getProfile(userId)
          set({ profile, isLoading: false })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '加载个人资料失败'
          set({ error: errorMessage, isLoading: false })
          throw error
        }
      },

      updateProfile: async (updates: UpdateProfileRequest) => {
        set({ isLoading: true, error: null })
        try {
          const profile = await profileApi.updateProfile(updates)
          set({ profile, isLoading: false })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '更新个人资料失败'
          set({ error: errorMessage, isLoading: false })
          throw error
        }
      },

      uploadAvatar: async (file: File) => {
        set({ isLoading: true, error: null })
        try {
          const { avatar_url } = await profileApi.uploadAvatar(file)
          // 更新当前 profile 中的头像
          const currentProfile = get().profile
          if (currentProfile) {
            set({ 
              profile: { ...currentProfile, avatar: avatar_url },
              isLoading: false 
            })
          } else {
            set({ isLoading: false })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '上传头像失败'
          set({ error: errorMessage, isLoading: false })
          throw error
        }
      },

      changePassword: async (passwordData: ChangePasswordRequest) => {
        set({ isLoading: true, error: null })
        try {
          await profileApi.changePassword(passwordData)
          set({ isLoading: false })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '修改密码失败'
          set({ error: errorMessage, isLoading: false })
          throw error
        }
      },

      deleteAccount: async (password: string) => {
        set({ isLoading: true, error: null })
        try {
          await profileApi.deleteAccount(password)
          get().clearProfile()
          set({ isLoading: false })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '删除账号失败'
          set({ error: errorMessage, isLoading: false })
          throw error
        }
      },

      loadStats: async () => {
        set({ isLoading: true, error: null })
        try {
          const stats = await profileApi.getUserStats()
          set({ stats, isLoading: false })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '加载统计信息失败'
          set({ error: errorMessage, isLoading: false })
          throw error
        }
      },

      clearProfile: () => {
        set({
          profile: null,
          stats: null,
          error: null,
        })
      },

      clearError: () => {
        set({ error: null })
      },
    }),
    {
      name: 'profile-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        profile: state.profile,
        stats: state.stats,
      }),
    }
  )
)

