import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { profileApi, type UserProfile, type UpdateProfileRequest } from '../api/profile'
import { isAuthError } from '@/api/apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'

/**
 * profile store 的状态与 action 契约。
 *
 * ## 这里为什么**没有** `changePassword`
 *
 * 曾经有一个，**零非测试调用点**：两个 UI（`ProfilePage.tsx:99`、
 * `ProfileModal.tsx:404`）都直接 `await profileApi.changePassword(...)`，
 * 自己管 `changingPassword` 局部态、自己弹 toast，从不读本 store 的
 * `isLoading` / `error`。删掉它而不是把 UI 接过来，理由：
 *
 * 1. 改密码**不产生本 store 持有的任何状态**——`profile` 一个字段都不变。
 *    接进来只会让两个 UI 共享全局 `isLoading`，与头像上传/资料加载互相串扰。
 * 2. 接进来等于给改密码新增一条 `settleError` → `silentRedirectToLogin()` 的
 *    静默登出路径，而它唯一的护栏是端点白名单。真正的护栏应该、而且已经
 *    落在更靠下的一层：`profile.ts` 那份 `fetchWithAuth` 的 401 分支
 *    （`isBusiness401Request`），它对**所有**调用方生效，不管走不走 store。
 * 3. 留着不用最糟：它让"白名单保护了改密码"这句话在 review 里读起来是真的，
 *    而实际执行的代码里没有它——本批修的就是这个偏差。
 *
 * 要改密码的行为（比如统一 toast 文案），改那两个组件；要改 401 语义，
 * 改 `apiClient.ts` 的 `BUSINESS_401_ENDPOINTS`。别在这里重新长出第三条路径。
 */
interface ProfileState {
  profile: UserProfile | null
  isLoading: boolean
  error: string | null

  // Actions
  loadProfile: () => Promise<void>
  updateProfile: (updates: UpdateProfileRequest) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  clearProfile: () => void
  clearError: () => void
}

/**
 * 静默重定向到登录页面
 */
const silentRedirectToLogin = () => {
  const authStore = useAuthStore.getState()
  authStore.clearAuth()

  if (typeof window !== 'undefined' && window.location.pathname !== ROUTES.auth.login) {
    window.location.replace(ROUTES.auth.login)
  }
}

type SetProfileState = (partial: Partial<ProfileState>) => void

/**
 * 失败收尾：写 store 状态，认证失败时另外跳登录页。
 *
 * **调用方必须紧接着 `throw error`。** 这不是风格问题：三个 action 的认证
 * 分支原来是 `set({isLoading:false}); silentRedirectToLogin(); return`，
 * `return` 让 promise **resolve**，于是
 * `ProfilePage.handleSubmit` 的 `await updateProfile(...)` 顺利往下走，
 * 弹出绿色的「成功 / 个人资料已更新」——同一刻 `clearAuth()` 已经执行、
 * 页面正在跳登录页。一次被后端拒绝的编辑，用户得到的是"成功"加"无解释登出"。
 *
 * `silentRedirectToLogin()` 之后 rethrow 是**能被观测到的**：
 * `location.replace()` 不会同步中断 JS，当前这一拍照常跑完，promise 照常
 * reject，调用方的 catch 照常执行。何况 `silentRedirectToLogin` 自带
 * `pathname !== '/app/login'` 的守卫——已经在登录页时它**什么都不做**，
 * 那时 `return` 就是纯粹的"失败被报告成成功"。
 *
 * 认证分支刻意**不写 `store.error`**：跳转本身就是回答，错误文案由调用方
 * 从 rethrow 的 error 上拿（`ProfilePage` / `ProfileModal` 的 catch 已经
 * 在弹 destructive toast，无需改动）。
 */
const settleError = (error: unknown, defaultMessage: string, set: SetProfileState): void => {
  if (error instanceof Error && isAuthError(error)) {
    set({ isLoading: false })
    silentRedirectToLogin()
    return
  }
  set({ error: error instanceof Error ? error.message : defaultMessage, isLoading: false })
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
          settleError(error, '加载个人资料失败', set)
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
          settleError(error, '更新个人资料失败', set)
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
          settleError(error, '上传头像失败', set)
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
