import { create } from 'zustand'
import { groupsApi, type Group, type MyGroup, type GroupMember, type GroupNotice } from '../api/groups'
import { loadGroups } from '@/data'

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
  /**
   * 选中群之后自动拉成员/公告失败时的信息，独立于上面共享的 `error`。
   *
   * 不合用同一个字段：`error` 被 `createGroup`/`searchGroups`/`updateGroup`
   * 共用，而这三个动作在调用点（`GroupList.tsx`）已经各自 try/catch 并弹了
   * toast——如果 `selectGroup` 的失败也写进同一个 `error`，给它接一个消费方
   * 就会对同一次失败弹两次 toast。这个字段只服务 `loadGroupMembers`/
   * `loadGroupNotices`（全仓唯二调用点是 `selectGroup`），互不干扰。
   */
  selectionError: string | null

  // Actions
  loadMyGroups: () => Promise<void>
  loadGroupMembers: (groupId: string) => Promise<void>
  loadGroupNotices: (groupId: string) => Promise<void>
  selectGroup: (group: MyGroup | null) => void
  createGroup: (name: string, description?: string, joinMode?: string) => Promise<{ group_id: string; group_name: string; created_at: string }>
  searchGroups: (query: string) => Promise<Group[]>
  updateGroup: (groupId: string, updates: Partial<Group>) => Promise<void>
  clearError: () => void
  clearSelectionError: () => void
}

export const useGroupStore = create<GroupState>((set, get) => ({
  myGroups: [],
  selectedGroup: null,
  currentGroupMembers: [],
  currentGroupNotices: [],
  isLoading: false,
  error: null,
  selectionError: null,

  loadMyGroups: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await loadGroups()
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
    set({ isLoading: true, selectionError: null })
    try {
      const data = await groupsApi.getMembers(groupId)
      set({
        currentGroupMembers: data.members,
        isLoading: false
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载群成员失败'
      set({ selectionError: errorMessage, isLoading: false })
      throw error
    }
  },

  loadGroupNotices: async (groupId: string) => {
    set({ isLoading: true, selectionError: null })
    try {
      const response = await groupsApi.getNotices(groupId)
      set({
        currentGroupNotices: response,
        isLoading: false
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载群公告失败'
      set({ selectionError: errorMessage, isLoading: false })
      throw error
    }
  },

  selectGroup: (group: MyGroup | null) => {
    set({ selectedGroup: group })
    if (group) {
      // 选中群后自动加载成员和公告。
      //
      // `.catch(console.error)` 曾经是本模块吞异常的地方之一：
      // loadGroupMembers/loadGroupNotices 已经把失败写进 `selectionError`
      // （并 rethrow），但这里选了 console.error 而不是任何 UI 消费，结果和
      // `apiEnvelope.ts` 开篇讲的"功能正常但没有数据"是同一种表现——只是
      // 控制台里多一行没人看的日志。现在 `selectionError` 由 GroupList.tsx
      // 消费（toast + clearSelectionError），这里只需要防止未处理的 promise
      // rejection，不必再重复打印。
      // 注意：两次调用共享同一个 `selectionError`，后失败的一个会覆盖先失败
      // 的那条消息——如果两者都失败，只看得到最后一条。这是本批刻意接受的
      // 范围（不为每个子加载单独分列错误状态），但结果是"失败"而不是
      // "什么都没发生"，比现状是净改善。
      get().loadGroupMembers(group.group_id).catch(() => {})
      get().loadGroupNotices(group.group_id).catch(() => {})
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

  clearSelectionError: () => {
    set({ selectionError: null })
  },
}))
