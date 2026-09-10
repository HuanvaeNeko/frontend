import { create } from 'zustand'
import { groupsApi, type MyGroup, type GroupMember, type GroupNotice } from '../api/groups'
import { loadGroups } from '@/data'
import { pinSession, registerPristineStoreReset } from '@/lib/sessionScope'

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
  /**
   * `loadMyGroups` 是否已经完整跑完过一次（成功或失败都算）。
   *
   * 与 `friendsStore.hasLoaded` 是同一个理由、同一个用法：区分"从没问过后端"与
   * "问过了，结果就是没有"，供 `useRouteConversation` 判断深链冷启动时该显示
   * loading 还是 missing——`AppShellLayout` 的挂载 effect 要等首轮渲染跑完才会
   * 触发 `loadMyGroups()`，那一帧 `isLoading` 还是初始的 `false`。
   *
   * 本 store 的 `loadMyGroups` catch 块里没有 `friendsStore.handleApiError` 那种
   * 会触发 `clearAuth()`/会话重置的副作用，所以两条分支都可以直接写
   * `hasLoaded: true`，不需要像 `friendsStore.loadFriends` 那样另外分支。
   */
  hasLoaded: boolean
  error: string | null
  /**
   * 选中群之后自动拉成员/公告失败时的信息，独立于上面共享的 `error`。
   *
   * 不合用同一个字段：`error` 被 `createGroup`/`updateGroup` 共用，而这两个
   * 动作在调用点（`GroupList.tsx`）已经各自 try/catch 并弹了 toast——如果
   * `selectGroup` 的失败也写进同一个 `error`，给它接一个消费方就会对同一次
   * 失败弹两次 toast。这个字段只服务 `loadGroupMembers`/`loadGroupNotices`
   * （全仓唯二调用点是 `selectGroup`），互不干扰。
   *
   * 📌 曾经还有第三个共用方 `searchGroups`：那是一个零消费方的转发 action
   * （`GroupList.tsx` 直接调 `groupsApi.searchGroups`），且签名漏了 `limit`，
   * 于是它转发的请求和真实发出的请求长得不一样。批 6 复核时删除，不是收窄。
   */
  selectionError: string | null

  // Actions
  loadMyGroups: () => Promise<void>
  loadGroupMembers: (groupId: string) => Promise<void>
  loadGroupNotices: (groupId: string) => Promise<void>
  selectGroup: (group: MyGroup | null) => void
  /**
   * 第三个形参是「是否需要入群审核」。批 3 之前它是五档 `joinMode?: string`，
   * 随 `groups."join-mode"` 列（migration 043 DROP）一起删掉，
   * 见 backend-docs/groups/群聊管理.md:64-75。不传 ⇒ 后端默认 `true`（需审核）。
   */
  createGroup: (name: string, description?: string, joinApprovalRequired?: boolean) => Promise<{ group_id: string; group_name: string; created_at: string }>
  /**
   * 形参就是 `PUT /api/groups/{group_id}` 的请求体（doc:227-231），不是
   * `Partial<Group>`：本 action 只做转发，而 `Group` 上的 `group_description`
   * / `group_avatar_url` 是 `string | null`（读侧的"未设置"），请求体侧
   * 没有 `null` 这一档——沿用 `Partial<Group>` 会逼出一个把"清空简介"
   * 悄悄变成"不改"的 `?? undefined`。
   */
  updateGroup: (groupId: string, updates: { group_name?: string; group_description?: string; group_avatar_url?: string }) => Promise<void>
  clearError: () => void
  clearSelectionError: () => void
}

/**
 * ## 五个异步 action 开头那句 `const stillMine = pinSession()`
 *
 * 和 `friendsStore` / `profileStore` 是同一个形状，理由也是同一条：登出**不取消**
 * 飞在半空的请求，A 那次响应会在 B 登录之后落地并写进 B 的内存。本 store 没有
 * persist，落盘闸门（`sessionScopedLocalStorage`）根本不经过它。
 *
 * **哪几片今天真的会被看见**（别把这段读成"每一片都在泄露"）：
 * - `myGroups` —— `GroupList.tsx` 直接渲染，每一行是群名、群头像、
 *   `last_message_content`（群里最后一条消息的正文）与未读数。A 的群列表出现在
 *   B 的侧栏里，这一片是**活的**。
 * - `selectionError` —— `GroupList.tsx` 有一个 `useEffect` 把它弹成 destructive
 *   toast，所以 B 会看到一条关于 A 那个群的报错。也是活的。
 * - `currentGroupMembers` / `currentGroupNotices` —— **今天零渲染点**
 *   （`grep -rn 'currentGroupMembers' src`：除本文件与测试外没有读它的地方；
 *   `GroupManagement.tsx` 用的是自己的局部 `useState`，直接调
 *   `groupsApi.getMembers`）。所以这两片的跨会话写入眼下**看不见**，
 *   守卫是为"接上渲染点的那一天"准备的。写清楚这一点，是因为把它说成
 *   "成员名单会显示在下一个人屏幕上"就是一句今天不成立的话。
 *
 * 失败那一侧同样要挡：本 store 的 catch 里没有 `clearAuth()`（不像
 * `friendsStore.handleApiError`），但 `set({error})` / `set({selectionError})`
 * 一样是往下一个人的 store 里写。
 *
 * 钉住它的用例：`store/__tests__/groupStore.test.ts` 的「跨会话边界」三组 `it.each`
 * （落地成功 / 落地失败 / 复合 action 内层重载期间换人）。
 */
export const useGroupStore = create<GroupState>((set, get) => ({
  myGroups: [],
  selectedGroup: null,
  currentGroupMembers: [],
  currentGroupNotices: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  selectionError: null,

  loadMyGroups: async () => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      const response = await loadGroups()
      if (!stillMine()) return
      set({
        myGroups: response,
        isLoading: false,
        hasLoaded: true,
      })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = error instanceof Error ? error.message : '加载群聊列表失败'
      set({ error: errorMessage, isLoading: false, hasLoaded: true })
      throw error
    }
  },

  loadGroupMembers: async (groupId: string) => {
    const stillMine = pinSession()
    set({ isLoading: true, selectionError: null })
    try {
      const data = await groupsApi.getMembers(groupId)
      if (!stillMine()) return
      set({
        currentGroupMembers: data.members,
        isLoading: false
      })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = error instanceof Error ? error.message : '加载群成员失败'
      set({ selectionError: errorMessage, isLoading: false })
      throw error
    }
  },

  loadGroupNotices: async (groupId: string) => {
    const stillMine = pinSession()
    set({ isLoading: true, selectionError: null })
    try {
      const response = await groupsApi.getNotices(groupId)
      if (!stillMine()) return
      set({
        currentGroupNotices: response,
        isLoading: false
      })
    } catch (error) {
      if (!stillMine()) throw error
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

  createGroup: async (name: string, description?: string, joinApprovalRequired?: boolean) => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      const group = await groupsApi.createGroup({
        group_name: name,
        group_description: description,
        join_approval_required: joinApprovalRequired
      })
      // 会话已经不是发起时那一场：不写、也不再发起后面那次列表重载。
      if (!stillMine()) return group
      // 重新加载群列表
      await get().loadMyGroups()
      if (stillMine()) set({ isLoading: false })
      return group
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = error instanceof Error ? error.message : '创建群聊失败'
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  updateGroup: async (groupId: string, updates: { group_name?: string; group_description?: string; group_avatar_url?: string }) => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      await groupsApi.updateGroup(groupId, {
        group_name: updates.group_name,
        group_description: updates.group_description,
        group_avatar_url: updates.group_avatar_url,
      })
      if (!stillMine()) return
      // 重新加载群列表
      await get().loadMyGroups()
      if (!stillMine()) return
      set({ isLoading: false })
    } catch (error) {
      if (!stillMine()) throw error
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

// 会话结束时恢复到初始状态。本 store 没有 persist，所以 `create()` 刚返回时的
// `getState()` 就是干净的初始快照，不需要在这里再抄一遍字段名单——将来往
// state 里加字段，重置自动覆盖它。
registerPristineStoreReset(useGroupStore)
