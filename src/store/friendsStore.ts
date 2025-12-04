import { create } from 'zustand'
import { friendsApi, type Friend, type PendingRequest, type SentRequest } from '../api/friends'

interface FriendsState {
  friends: Friend[]
  pendingRequests: PendingRequest[]  // 待处理的请求（别人发给我的）
  sentRequests: SentRequest[]        // 已发送的请求（我发给别人的）
  isLoading: boolean
  error: string | null

  // Actions
  loadFriends: () => Promise<void>
  loadPendingRequests: () => Promise<void>
  loadSentRequests: () => Promise<void>
  sendFriendRequest: (targetUserId: string, reason?: string) => Promise<void>
  approveFriendRequest: (applicantUserId: string, approvedReason?: string) => Promise<void>
  rejectFriendRequest: (applicantUserId: string, rejectReason?: string) => Promise<void>
  removeFriend: (friendUserId: string, removeReason?: string) => Promise<void>
  clearError: () => void
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  pendingRequests: [],
  sentRequests: [],
  isLoading: false,
  error: null,

  loadFriends: async () => {
    set({ isLoading: true, error: null })
    try {
      const friends = await friendsApi.getFriendsList()
      set({ friends, isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载好友列表失败'
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
      const errorMessage = error instanceof Error ? error.message : '加载好友请求失败'
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
      const errorMessage = error instanceof Error ? error.message : '加载已发送请求失败'
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
      const errorMessage = error instanceof Error ? error.message : '发送好友请求失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  approveFriendRequest: async (applicantUserId: string, approvedReason?: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.approveFriendRequest(applicantUserId, approvedReason)
      // 重新加载好友列表和请求列表
      await get().loadFriends()
      await get().loadPendingRequests()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '同意好友请求失败'
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
      const errorMessage = error instanceof Error ? error.message : '拒绝好友请求失败'
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
      const errorMessage = error instanceof Error ? error.message : '删除好友失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))
