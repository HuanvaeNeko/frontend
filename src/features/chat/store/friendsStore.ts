import { create } from 'zustand'
import { friendsApi, type Friend, type PendingRequest, type SentRequest } from '../api/friends'
import { isAuthError } from '@/api/apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'
import { loadFriends } from '@/data'
import { registerPristineStoreReset } from '@/lib/sessionScope'

interface FriendsState {
  friends: Friend[]
  pendingRequests: PendingRequest[]  // 待处理的请求（别人发给我的）
  sentRequests: SentRequest[]        // 已发送的请求（我发给别人的）
  onlineStatus: Map<string, boolean> // 好友在线状态
  isLoading: boolean
  error: string | null

  // Actions
  loadFriends: () => Promise<void>
  loadPendingRequests: () => Promise<void>
  loadSentRequests: () => Promise<void>
  sendFriendRequest: (targetUserId: string, reason?: string) => Promise<void>
  approveFriendRequest: (applicantUserId: string) => Promise<void>
  rejectFriendRequest: (applicantUserId: string, rejectReason?: string) => Promise<void>
  removeFriend: (friendUserId: string, removeReason?: string) => Promise<void>
  setOnlineStatus: (userId: string, isOnline: boolean) => void
  isOnline: (userId: string) => boolean
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

/**
 * 处理 API 错误，认证错误静默重定向。
 *
 * 返回 `null` 表示「已经跳登录页、不必再写 `store.error`」。
 * **它不表示成功**：七个调用点在这之后**一律 `throw error`**。
 *
 * 原来 `null` 分支是 `set({isLoading:false}); return`，promise 因此 resolve，
 * 于是 `FriendList.handleApprove` 里 `await approveFriendRequest(...)` 后面
 * 那句「成功 / 已添加好友」照弹——同一刻 `clearAuth()` 已执行、页面在跳登录页。
 * 会话失效被报告成"加好友成功"。跳转不是同步中断，rethrow 之后调用方的 catch
 * 照常跑；而且 `silentRedirectToLogin` 在已经处于登录页时什么都不做，
 * 那种情况下 `return` 就是纯粹的谎报。
 *
 * ## 钉住它的是哪些用例
 *
 * `store/__tests__/friendsStore.test.ts` 的两个 `it.each`：七个 action ×
 * 两条分支（认证 401 → 仍 reject；403 → 写 `store.error` 且仍 reject）。
 * **表驱动是必要的，不是风格**：上一版只钉了 4 个点，把
 * `approveFriendRequest`（也就是上面这段话举的例子本身）换回退化写法，
 * 那 4 条用例全绿（审阅者在完整套件上复现的是 508 条全绿）。
 * 现在这 14 个点逐个实测过：任一处退化，对应 action 那条用例必红。
 *
 * 注意上面那个例子的**组件那一半没有被钉**：`FriendList.test.tsx` 用
 * `vi.mock` 把整个 friendsStore 换成了假对象，其 `approveFriendRequest`
 * 恒 resolve，所以本文件怎么改它都不会红；那边现有的用例只覆盖渲染与
 * 「点同意时传的是 `request_user_id`」，`handleApprove` 的 toast 分支
 * （成功弹绿、失败弹红）一条都没测。别把它当成本行的证据。
 */
const handleApiError = (error: unknown, defaultMessage: string): string | null => {
  if (error instanceof Error && isAuthError(error)) {
    silentRedirectToLogin()
    return null // 返回 null 表示已静默处理
  }
  return error instanceof Error ? error.message : defaultMessage
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  pendingRequests: [],
  sentRequests: [],
  onlineStatus: new Map(),
  isLoading: false,
  error: null,

  loadFriends: async () => {
    set({ isLoading: true, error: null })
    try {
      const friends = await loadFriends()
      set({ friends, isLoading: false })
    } catch (error) {
      const errorMessage = handleApiError(error, '加载好友列表失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  loadPendingRequests: async () => {
    set({ isLoading: true, error: null })
    try {
      const pendingRequests = await friendsApi.getPendingRequests()
      set({ pendingRequests, isLoading: false })
    } catch (error) {
      const errorMessage = handleApiError(error, '加载好友请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  loadSentRequests: async () => {
    set({ isLoading: true, error: null })
    try {
      const sentRequests = await friendsApi.getSentRequests()
      set({ sentRequests, isLoading: false })
    } catch (error) {
      const errorMessage = handleApiError(error, '加载已发送请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  sendFriendRequest: async (targetUserId: string, reason?: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.sendFriendRequest(targetUserId, reason)
      // 重新加载已发送请求列表
      await get().loadSentRequests()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = handleApiError(error, '发送好友请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  // 后端 approve 的请求体只有 { user_id, applicant_user_id }
  // （backend-docs/friends/好友添加删除.md:25-32），不收集通过理由，
  // 所以这里也不再往下透传一个永远不会被消费的 approvedReason。
  approveFriendRequest: async (applicantUserId: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.approveFriendRequest(applicantUserId)
      // 重新加载好友列表和请求列表
      await get().loadFriends()
      await get().loadPendingRequests()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = handleApiError(error, '同意好友请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  rejectFriendRequest: async (applicantUserId: string, rejectReason?: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.rejectFriendRequest(applicantUserId, rejectReason)
      // 重新加载请求列表
      await get().loadPendingRequests()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = handleApiError(error, '拒绝好友请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  removeFriend: async (friendUserId: string, removeReason?: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.removeFriend(friendUserId, removeReason)
      // 重新加载好友列表
      await get().loadFriends()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = handleApiError(error, '删除好友失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  setOnlineStatus: (userId: string, isOnline: boolean) => {
    const onlineStatus = new Map(get().onlineStatus)
    onlineStatus.set(userId, isOnline)
    set({ onlineStatus })
  },

  // ⚠️ 已知缺口（本轮不修，属于"缺功能"而非解包 bug）：
  // `GET /api/friends/presence` 首屏快照与顶层 `presence_update` 推送
  // （backend-docs/friends/好友添加删除.md:443-509）前端都还没接，
  // `setOnlineStatus` 至今零调用点，`onlineStatus` 恒为空 Map，
  // 于是这里的 `|| false` 把「从未拿到过数据」显示成「离线」——
  // 所有好友的状态点永远是灰的。修的时候要连 `boolean | undefined`
  // （未知 ≠ 离线）一起改，不要只补一个接口。
  isOnline: (userId: string) => {
    return get().onlineStatus.get(userId) || false
  },

  clearError: () => {
    set({ error: null })
  },
}))

// 会话结束时恢复到初始状态。本 store 没有 persist，所以 `create()` 刚返回时的
// `getState()` 就是干净的初始快照，不需要在这里再抄一遍字段名单——将来往
// state 里加字段，重置自动覆盖它。
registerPristineStoreReset(useFriendsStore)
