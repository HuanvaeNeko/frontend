import { create } from 'zustand'
import { friendsApi, type Friend, type FriendRequest } from '../api/friends'

interface FriendsState {
  friends: Friend[]
  friendRequests: FriendRequest[]
  blockedUsers: Friend[]
  isLoading: boolean
  error: string | null

  // Actions
  loadFriends: () => Promise<void>
  loadFriendRequests: () => Promise<void>
  loadBlockedUsers: () => Promise<void>
  searchUsers: (query: string) => Promise<Friend[]>
  sendFriendRequest: (toUserId: string, message?: string) => Promise<void>
  acceptFriendRequest: (requestId: string) => Promise<void>
  rejectFriendRequest: (requestId: string) => Promise<void>
  deleteFriend: (friendUserId: string) => Promise<void>
  blockUser: (userId: string) => Promise<void>
  unblockUser: (userId: string) => Promise<void>
  clearError: () => void
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  friendRequests: [],
  blockedUsers: [],
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

  loadFriendRequests: async () => {
    set({ isLoading: true, error: null })
    try {
      const friendRequests = await friendsApi.getFriendRequests()
      set({ friendRequests, isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载好友请求失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  loadBlockedUsers: async () => {
    set({ isLoading: true, error: null })
    try {
      const blockedUsers = await friendsApi.getBlockedUsers()
      set({ blockedUsers, isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载屏蔽列表失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  searchUsers: async (query: string) => {
    set({ isLoading: true, error: null })
    try {
      const users = await friendsApi.searchUsers(query)
      set({ isLoading: false })
      return users
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '搜索用户失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  sendFriendRequest: async (toUserId: string, message?: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.sendFriendRequest(toUserId, message)
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '发送好友请求失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  acceptFriendRequest: async (requestId: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.acceptFriendRequest(requestId)
      // 重新加载好友列表和请求列表
      await get().loadFriends()
      await get().loadFriendRequests()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '接受好友请求失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  rejectFriendRequest: async (requestId: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.rejectFriendRequest(requestId)
      // 重新加载请求列表
      await get().loadFriendRequests()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '拒绝好友请求失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  deleteFriend: async (friendUserId: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.deleteFriend(friendUserId)
      // 重新加载好友列表
      await get().loadFriends()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除好友失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  blockUser: async (userId: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.blockUser(userId)
      // 重新加载相关列表
      await get().loadFriends()
      await get().loadBlockedUsers()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '屏蔽用户失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  unblockUser: async (userId: string) => {
    set({ isLoading: true, error: null })
    try {
      await friendsApi.unblockUser(userId)
      // 重新加载屏蔽列表
      await get().loadBlockedUsers()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '取消屏蔽失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))

