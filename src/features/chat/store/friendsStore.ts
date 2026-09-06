import { create } from 'zustand'
import { friendsApi, type Friend, type PendingRequest, type SentRequest } from '../api/friends'
import { isAuthError } from '@/api/apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'
import { loadFriends } from '@/data'

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
 * 处理 API 错误，认证错误静默重定向
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
      if (errorMessage === null) {
        set({ isLoading: false })
        return
      }
      set({ error: errorMessage, isLoading: false })
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
      if (errorMessage === null) {
        set({ isLoading: false })
        return
      }
      set({ error: errorMessage, isLoading: false })
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
      if (errorMessage === null) {
        set({ isLoading: false })
        return
      }
      set({ error: errorMessage, isLoading: false })
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
      if (errorMessage === null) {
        set({ isLoading: false })
        return
      }
      set({ error: errorMessage, isLoading: false })
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
      if (errorMessage === null) {
        set({ isLoading: false })
        return
      }
      set({ error: errorMessage, isLoading: false })
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
      if (errorMessage === null) {
        set({ isLoading: false })
        return
      }
      set({ error: errorMessage, isLoading: false })
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
      if (errorMessage === null) {
        set({ isLoading: false })
        return
      }
      set({ error: errorMessage, isLoading: false })
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
