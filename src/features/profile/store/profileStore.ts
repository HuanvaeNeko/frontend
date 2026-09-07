import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { profileApi, type UserProfile, type UpdateProfileRequest } from '../api/profile'
import { isAuthError } from '@/api/apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { ROUTES } from '@/lib/routes'

/**
 * profile store 的状态与 action 契约。
 *
 * ## 这里为什么**没有** `changePassword`
 *
 * 曾经有一个，**零非测试调用点**：两个 UI（`ProfilePage.tsx:99`、
 * `ProfileModal.tsx:404`）都直接 `await profileApi.changePassword(...)`，
 * 自己管 `changingPassword` 局部态、自己弹 toast，改密码这条路径上
 * 从不读本 store 的 `isLoading` / `error`。删掉它而不是把 UI 接过来，理由：
 *
 * 1. 改密码**不产生本 store 持有的任何状态**——`profile` 一个字段都不变。
 *    接进来只会让两个 UI 共享全局 `isLoading`，与头像上传/资料加载互相串扰——
 *    而它们**本来就绑着**这个 `isLoading`（`ProfilePage.tsx:35`、
 *    `ProfileModal.tsx:187` 都从本 store 解构它，用来禁用保存按钮 / 转圈），
 *    所以串扰不是假设：改密码期间保存按钮会跟着转圈变灰。
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
  setAvatarUrl: (url: string) => void
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

/**
 * 落盘格式版本。`1` = `profile.user_avatar_url` 是**绝对地址**。
 *
 * 版本号从"没有版本号"（zustand 视作 `0`）跳到 `1`，是因为本批之前落盘的
 * `user_avatar_url` 是后端原样给的**相对路径**（`avatars/{uid}.png?t=…`，
 * `个人资料管理.md:98`）。补基址现在做在 `getProfile` 的出口，但**已经在**
 * 用户 localStorage 里的那些旧值不会自己变好：`profile` 是持久化字段，刷新后
 * 立刻被 rehydrate 出来渲染，而 `Navigation` 在每个 `/app` 页面上都挂着，
 * 会先于任何 `loadProfile()` 用那个相对路径发一次注定 404 的图片请求。
 *
 * ⚠️ 这一层现在是**两道防线里窄的那道**，不再是承重件：`Navigation` 已改成在
 * **读的时候**过一次 `toAbsoluteApiUrl`（幂等，每次渲染重新求值）。迁移只跑一次，
 * 把值冻结成迁移那一刻 `getApiBaseUrl()` 的结果——而本项目会**故意改基址**
 * （本地无 SNI 反代），冻下来的那份此后不会再被重新审视
 * （`toAbsoluteApiUrl` 的 `rewriteCanonicalApiOrigin` 只认正式域名的 origin）。
 * 留着它是为了让落盘数据本身也是干净的，以及给 `Navigation` 之外将来直接读
 * `profile.user_avatar_url` 的渲染点兜底。
 */
const PROFILE_PERSIST_VERSION = 1

/**
 * 把落盘的旧值搬到当前格式：只做一件事——`user_avatar_url` 补基址。
 *
 * `toAbsoluteApiUrl` 幂等（已带协议的地址原样返回），所以对已经是绝对地址的值
 * 是 no-op；`null` / 空串 → `undefined` → 归一回 `null`。
 *
 * 形状不认识时（不是对象、`profile` 不是对象）**原样返回**：迁移函数不是校验层，
 * 在这里编造一个默认 state 只会把"落盘数据坏了"变成一个看不见的状态。
 */
export function migrateProfilePersist(persisted: unknown): unknown {
  if (typeof persisted !== 'object' || persisted === null) return persisted
  const state = persisted as { profile?: unknown }
  if (typeof state.profile !== 'object' || state.profile === null) return persisted

  const profile = state.profile as { user_avatar_url?: unknown }
  if (typeof profile.user_avatar_url !== 'string') return persisted

  return {
    ...state,
    profile: { ...profile, user_avatar_url: toAbsoluteApiUrl(profile.user_avatar_url) ?? null },
  }
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

      /**
       * ⚠️ 字段名是 **`file_url`**：旧的 `avatar_url` 随
       * `POST /api/profile/avatar` 一起在 2026-08-28 删除
       * （`个人资料管理.md:352-355`），confirm 返回的是 `file_url`
       * （doc:396-409，形态逐字相同，已在 api 出口补成绝对地址）。
       * 这里此前解构的正是那个不再存在的名字，`user_avatar_url` 会被写成
       * `undefined`——比 404 更难查，因为上传"成功"了。
       *
       * ⚠️ **本 action 今天没有非测试调用点**：两个 UI
       * （`ProfilePage` / `ProfileModal` 的 `handleAvatarChange`）都直接
       * `await profileApi.uploadAvatar(...)`，自管局部 `uploadingAvatar` 与进度。
       * 保持那样是有意的——本 store 的 `isLoading` 同时驱动"保存更改"按钮
       * （`ProfilePage` / `ProfileModal` 都从本 store 解构它），把头像上传接进来
       * 会让传头像时保存按钮跟着转圈变灰。这和 `changePassword` 被删掉的理由
       * 是同一条（见本文件顶部），区别在于那一条是无状态操作，而这一条**确实**
       * 产生本 store 持有的状态（`profile.user_avatar_url`），所以留着而不是删掉。
       */
      uploadAvatar: async (file: File) => {
        set({ isLoading: true, error: null })
        try {
          const { file_url } = await profileApi.uploadAvatar(file)
          // 更新当前 profile 中的头像
          const currentProfile = get().profile
          if (currentProfile) {
            set({
              profile: { ...currentProfile, user_avatar_url: file_url },
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

      /**
       * 把 confirm 返回的 `file_url` 写进 store —— 上传成功的**唯一**落点。
       *
       * 存在的理由：两个 UI 都直接调 `profileApi.uploadAvatar`（不走上面那个
       * action，理由见它的注释），拿到 `file_url` 之后必须有个地方放。此前它们
       * 把返回值**丢掉**，指望紧接着那次 `loadProfile()` 把新头像捞回来——那次
       * GET 一旦失败（500 / 401 都出现过），一次**已经完成**的上传就在屏幕上
       * 变成了「上传失败」，而后端此刻已经把这个地址写进
       * `users."user-avatar-url"` 了（`个人资料管理.md:411`）。
       *
       * `file_url` 在 `storageApi` 出口已经是绝对地址（`confirmUploadResponse`
       * 里过的 `toAbsoluteApiUrl`），这里不再拼一次。
       *
       * `profile` 还是 `null` 时**什么都不做**：没有可打补丁的对象，凭一个 URL
       * 造半个 `UserProfile` 只会让"资料已加载"变成一句谎话；那种时序下
       * 紧接着的 `loadProfile()` 本来就会把整份资料（含新头像）带回来。
       */
      setAvatarUrl: (url: string) => {
        const currentProfile = get().profile
        if (!currentProfile) return
        set({ profile: { ...currentProfile, user_avatar_url: url } })
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
      version: PROFILE_PERSIST_VERSION,
      migrate: migrateProfilePersist,
    }
  )
)
