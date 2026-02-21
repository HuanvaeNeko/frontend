import { create } from 'zustand'
import { groupsApi, type Group, type MyGroup, type GroupMember, type GroupNotice } from '../api/groups'

interface GroupState {
  // 我的群聊列表
  myGroups: MyGroup[]
  
  // 当前选中的群
  selectedGroup: MyGroup | null
  
  // 当前群的成员列表
  currentGroupMembers: GroupMember[]
  
  // 当前群的公告列表
  currentGroupNotices: GroupNotice[]
  
  // 加载状态
  isLoading: boolean
  error: string | null

  // Actions
  loadMyGroups: () => Promise<void>
  loadGroupMembers: (groupId: string) => Promise<void>
  loadGroupNotices: (groupId: string) => Promise<void>
  selectGroup: (group: MyGroup | null) => void
  createGroup: (name: string, description?: string, joinMode?: string) => Promise<{ group_id: string; group_name: string; created_at: string }>
  searchGroups: (query: string) => Promise<Group[]>
  updateGroup: (groupId: string, updates: Partial<Group>) => Promise<void>
  clearError: () => void
}

export const useGroupStore = create<GroupState>((set, get) => ({
  myGroups: [],
  selectedGroup: null,
  currentGroupMembers: [],
  currentGroupNotices: [],
  isLoading: false,
  error: null,

  loadMyGroups: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await groupsApi.getMyGroups()
      set({ 
        myGroups: response,
        isLoading: false 
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载群聊列表失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  loadGroupMembers: async (groupId: string) => {
    set({ isLoading: true, error: null })
    try {
      const data = await groupsApi.getMembers(groupId)
      set({ 
        currentGroupMembers: data.members,
        isLoading: false 
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载群成员失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  loadGroupNotices: async (groupId: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await groupsApi.getNotices(groupId)
      set({ 
        currentGroupNotices: response,
        isLoading: false 
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载群公告失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  selectGroup: (group: MyGroup | null) => {
    set({ selectedGroup: group })
    if (group) {
      // 选中群后自动加载成员和公告
      get().loadGroupMembers(group.group_id).catch(console.error)
      get().loadGroupNotices(group.group_id).catch(console.error)
    } else {
      set({ 
        currentGroupMembers: [],
        currentGroupNotices: [] 
      })
    }
  },

  createGroup: async (name: string, description?: string, joinMode?: string) => {
    set({ isLoading: true, error: null })
    try {
      const group = await groupsApi.createGroup({ 
        group_name: name,
        group_description: description,
        join_mode: joinMode as 'open' | 'approval_required' | 'invite_only' | 'admin_invite_only' | 'closed'
      })
      // 重新加载群列表
      await get().loadMyGroups()
      set({ isLoading: false })
      return group
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建群聊失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  searchGroups: async (query: string) => {
    set({ isLoading: true, error: null })
    try {
      const groups = await groupsApi.searchGroups(query)
      set({ isLoading: false })
      return groups
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '搜索群聊失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  updateGroup: async (groupId: string, updates: Partial<Group>) => {
    set({ isLoading: true, error: null })
    try {
      await groupsApi.updateGroup(groupId, {
        group_name: updates.group_name,
        group_description: updates.group_description,
        group_avatar_url: updates.group_avatar_url,
      })
      // 重新加载群列表
      await get().loadMyGroups()
      set({ isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新群信息失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))
