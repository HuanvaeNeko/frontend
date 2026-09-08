import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  applyProfileEdits,
  profileApi,
  type UserProfile,
  type UpdateProfileRequest,
} from '../api/profile'
import { isAuthError } from '@/api/apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { ROUTES } from '@/lib/routes'
import {
  currentSessionGeneration,
  isSameSession,
  registerSessionReset,
  sessionScopedLocalStorage,
} from '@/lib/sessionScope'

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
  setBackgroundUrl: (url: string | null) => void
  resetBackground: () => Promise<void>
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
 * 会话绑定：发起时记下世代号，落地前对照。
 *
 * 三个 action 都是「异步取数 → 回来 `set({profile})`」的形状，而登出并不会取消
 * 飞在半空的请求。`endSession()` 是一个**时点**：它跑完之后落地的那次 `set()` 会把
 * 上一个人的 profile 重新写进内存（`Navigation` 挂在每个 `/app` 页面上，直接拿它
 * 渲染头像和昵称）并 persist 回 `profile-storage`。落盘那一半 `sessionScopedLocalStorage`
 * 的闸门也拦得住，但内存那一半只能在这里挡——而屏幕上的头像读的正是内存。
 *
 * 判假时**什么都不写**（包括 `isLoading`）：会话已经结束，`clearProfile()` 刚把
 * 这个 store 整体归零，再写一次只会把它从"干净"改回"脏"。
 */
const sessionBound = (): (() => boolean) => {
  const generation = currentSessionGeneration()
  return () => isSameSession(generation)
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
        const stillMine = sessionBound()
        set({ isLoading: true, error: null })
        try {
          const profile = await profileApi.getProfile()
          if (!stillMine()) return
          set({ profile, isLoading: false })
        } catch (error) {
          if (!stillMine()) throw error
          settleError(error, '加载个人资料失败', set)
          throw error
        }
      },

      /**
       * ⚠️ **PUT 与随后那次读回不在同一个 `try` 里，这是有意的。**
       *
       * 两步塞回同一个 `try` 会复活 P2 已经在头像那条路径上修掉的形态
       * （`ProfilePage.handleAvatarChange` 的 JSDoc 逐字写着这句话，它自己那次
       * `loadProfile()` 也确实带着独立的 `.catch`）：PUT 已经 200、后端**已经提交**，
       * 而 GET 500 会让调用方弹一条红色的「保存失败」，GET 401 更进一步——
       * `settleError` 认出认证错误，一次成功的保存以无解释登出收场。
       *
       * 所以 200 之后这条路径上**没有失败出口**：先按 {@link applyProfileEdits}
       * 把这次已提交的修改落到内存里（`PrivacySettings` 的开关读的就是它），
       * 再去拉齐其余字段；拉不到就只留一条 `console.error`。
       */
      updateProfile: async (updates: UpdateProfileRequest) => {
        const stillMine = sessionBound()
        set({ isLoading: true, error: null })
        try {
          await profileApi.updateProfile(updates)
        } catch (error) {
          if (!stillMine()) throw error
          settleError(error, '更新个人资料失败', set)
          throw error
        }

        // 这道闸挡的是"PUT 落地时已经换人"：接着往下会拿**当前**这个人的凭证发一次
        // GET，并把上一个人的修改写进他的 store。判假时什么都不写（理由同 sessionBound）。
        if (!stillMine()) return
        const current = get().profile
        if (current) set({ profile: applyProfileEdits(current, updates) })

        // 重新加载完整的 profile：拿 `updated_at` 等这次没改的字段。
        const reloaded = await profileApi.getProfile().catch((error: unknown) => {
          console.error('个人资料已保存，重新拉取完整资料失败:', error)
          return null
        })
        if (!stillMine()) return
        set(reloaded ? { profile: reloaded, isLoading: false } : { isLoading: false })
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
        const stillMine = sessionBound()
        set({ isLoading: true, error: null })
        try {
          const { file_url } = await profileApi.uploadAvatar(file)
          if (!stillMine()) return
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
          if (!stillMine()) throw error
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

      /**
       * 资料背景图上传成功的落点，与 {@link setAvatarUrl} 逐条同型、同理由。
       *
       * `url` 是 `upload/confirm` 返回的 `file_url`，在 `storageApi` 出口
       * （`confirmUploadResponse` 里的 `toAbsoluteApiUrl`）已经是绝对地址，这里不再拼。
       * 后端在 confirm 那一步已经把它写进 `users."user-background-url"`
       * （`个人资料管理.md:410-411`、:421 的落点表），所以这只是把屏幕对齐到
       * **已经落库**的事实上，不是乐观更新。
       *
       * ## 为什么参数收 `string | null` 而 `setAvatarUrl` 只收 `string`
       *
       * 背景图有一个头像没有的状态：**恢复默认封面**。`null` 就是那个状态
       * （`个人资料管理.md:464`「后端将 `background_url` 置为 `null`」、
       * 字段表 doc:99「null=默认封面」）。
       *
       * 🔴 **不要传 `DELETE /api/profile/background` 响应里的那个 `""`。**
       * doc:491 逐字：「恒为空字符串 `""`……前端不应拼接此值展示图片」。
       * 重置那条路径走 {@link ProfileState.resetBackground}，它写进去的是 `null`。
       * 万一 `""` 还是从别处漏进来，渲染点的 {@link coverImageSrc} 是第二道
       * ——它把 `''` 和 `null` 判成同一个"默认封面"，`??` 做不到这一点。
       *
       * `profile` 还是 `null` 时什么都不做，理由同 {@link setAvatarUrl}。
       */
      setBackgroundUrl: (url: string | null) => {
        const currentProfile = get().profile
        if (!currentProfile) return
        set({ profile: { ...currentProfile, background_url: url } })
      },

      /**
       * 把资料背景图重置为默认封面
       * DELETE /api/profile/background（`个人资料管理.md:458-492`）
       *
       * ## 为什么这一条进了 store，而上传背景图没有
       *
       * 判据与 `uploadAvatar` 那段 JSDoc 里写的是同一条：本 store 的 `isLoading`
       * 同时驱动两个资料页的「保存更改」按钮。**上传**要报进度、可能持续好几秒，
       * 接进来会让整段传输期间保存按钮转圈变灰，所以它留在组件里自管局部态
       * （`uploadBackground` 与 `uploadAvatar` 同型）。**重置**是一次没有进度的
       * DELETE，占用 `isLoading` 的时长与 {@link ProfileState.updateProfile} 自己
       * 那一次 PUT 同量级——那一条本来就这么用，所以这里不构成新的串扰。
       *
       * ## ⚠️ DELETE 与随后那次读回**不在同一个 `try` 里**，这是有意的
       *
       * 与 `updateProfile` 逐条同构。DELETE 一旦 200，后端就已经把
       * `users."user-background-url"` 置成 `null` 了（doc:464），这次重置**已经提交**。
       * 把读回塞回同一个 `try` 会复活那个形态：读回 500 ⇒ 调用点弹一条红色的
       * 「重置失败」而封面其实已经没了；读回 401 ⇒ `settleError` 认出认证错误，
       * 一次成功的重置以**无解释登出**收场。
       *
       * 所以 200 之后这条路径上没有失败出口：先把 `background_url` 打成 `null`
       * （封面区读的就是它），再去拉齐 `updated_at` 等其余字段；拉不到只留一条
       * `console.error`。
       *
       * 🔴 写进去的是 `null`，**不是**响应里那个 `""`——`profileApi.resetBackground`
       * 返回 `void`，那个 `""` 连出 api 层都不会（doc:491「前端不应拼接此值展示图片」）。
       *
       * 三道会话闸与 `updateProfile` 逐条同型，位置是：`settleError` 之前、
       * 本地补丁那次 `set()` 之前、读回落地那次 `set()` 之前。一场已经死掉的会话
       * 不能替**当前**这个人清凭证跳登录页，也不能把它的重置结果或读回写进
       * 当前这个人的资料。三道各有一条用例，删掉任何一道都会有一条变红
       * （`profileStore.test.ts` 的「resetBackground 的每一道闸」）。
       */
      resetBackground: async () => {
        const stillMine = sessionBound()
        set({ isLoading: true, error: null })
        try {
          await profileApi.resetBackground()
        } catch (error) {
          if (!stillMine()) throw error
          settleError(error, '重置资料背景图失败', set)
          throw error
        }

        if (!stillMine()) return
        const current = get().profile
        if (current) set({ profile: { ...current, background_url: null } })

        const reloaded = await profileApi.getProfile().catch((error: unknown) => {
          console.error('资料背景图已重置，重新拉取完整资料失败:', error)
          return null
        })
        if (!stillMine()) return
        set(reloaded ? { profile: reloaded, isLoading: false } : { isLoading: false })
      },

      /**
       * 把本 store 恢复成"没有登录过任何人"的状态。
       *
       * 它此前**零调用点**——写好了，没人接——于是登出之后 `profile` 原封不动地
       * 留在内存和 `profile-storage` 里，下一个登录的人在每一个 `/app` 页面的侧栏上
       * 看到的是上一个人的昵称首字母和头像（`Navigation` 挂在所有 `/app` 页面上，
       * 而只有 `ChatPage` / `ProfilePage` / `ProfileModal` 三处会调 `loadProfile()`）。
       * 现在它的调用点是本文件底部登记给 `endSession` 的那一个，不需要谁再去接。
       *
       * `isLoading` 一并归零：登出时若正好有一个 `loadProfile()` 在飞，
       * 它的 `set({isLoading:false})` 会在 reject 之后才到，中间这段时间
       * 两个页面的"保存更改"按钮是灰的。
       */
      clearProfile: () => {
        set({
          profile: null,
          isLoading: false,
          error: null,
        })
      },

      clearError: () => {
        set({ error: null })
      },
    }),
    {
      name: 'profile-storage',
      storage: createJSONStorage(() => sessionScopedLocalStorage),
      partialize: (state) => ({
        profile: state.profile,
      }),
      version: PROFILE_PERSIST_VERSION,
      migrate: migrateProfilePersist,
    }
  )
)

// 会话结束时把 profile 从内存里也清掉。`profile-storage` 的落盘副本由
// `endSession` 的反向名单负责，这里补的是内存那一半——`authStore.logout` 和
// `DevicesPage` 撤销当前设备走的是客户端跳转，不整页加载，内存里的 profile
// 会一路活到下一个人的会话里。
registerSessionReset(() => {
  useProfileStore.getState().clearProfile()
})
