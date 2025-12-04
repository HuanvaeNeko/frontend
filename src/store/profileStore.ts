import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { profileApi, type UserProfile, type UpdateProfileRequest, type ChangePasswordRequest } from '../api/profile'

interface ProfileState {
  profile: UserProfile | null
  isLoading: boolean
  error: string | null

  // Actions
  loadProfile: () => Promise<void>
  updateProfile: (updates: UpdateProfileRequest) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  changePassword: (passwordData: ChangePasswordRequest) => Promise<void>
  clearProfile: () => void
  clearError: () => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      isLoading: false,
      error: null,

      loadProfile: async () => {
        set({ isLoading: true, error: null })
        try {
          const profile = await profileApi.getProfile()
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
          await profileApi.updateProfile(updates)
          // 重新加载完整的 profile
          const profile = await profileApi.getProfile()
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
              profile: { ...currentProfile, user_avatar_url: avatar_url },
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

      clearProfile: () => {
        set({
          profile: null,
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
      }),
    }
  )
)
