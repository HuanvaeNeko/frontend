import { create } from 'zustand'
import { friendsApi, type Friend, type PendingRequest, type SentRequest } from '../api/friends'
import { isAuthError } from '@/api/apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'
import { loadFriends } from '@/data'
import { pinSession, registerPristineStoreReset } from '@/lib/sessionScope'

interface FriendsState {
  friends: Friend[]
  pendingRequests: PendingRequest[]  // 待处理的请求（别人发给我的）
  sentRequests: SentRequest[]        // 已发送的请求（我发给别人的）
  onlineStatus: Map<string, boolean> // 好友在线状态
  isLoading: boolean
  /**
   * `loadFriends` 是否已经完整跑完过一次（成功或失败都算，见该 action 内的注释）。
   *
   * 区分"从没问过后端"（`isLoading===false && hasLoaded===false`，store 刚创建或
   * 刚被会话重置清空）与"问过了，结果就是没有"（`isLoading===false && hasLoaded===true`）
   * ——`useRouteConversation` 靠这一位判断深链冷启动时该显示 loading 还是 missing：
   * `AppShellLayout` 的 `useShellBootstrap` effect 要等整棵树挂载完才会跑，
   * 而 React 会先完整跑完一遍首次渲染，那一刻两个 store 的 `isLoading` 还是初始的
   * `false`——如果只看 `isLoading`，`ChatConversation` 会在第一帧就判 missing 并把
   * 深链 replace 掉。
   */
  hasLoaded: boolean
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
 *
 * ## ⚠️ 调用它之前必须先过 `stillMine()` 那道闸（见下面 store 上的注释）
 *
 * 它的认证分支带一个**写入之外的副作用**：`silentRedirectToLogin()` →
 * `clearAuth()` → 反向名单清盘。上一场会话的 401 落在当前这场会话里时，
 * 被清掉的是**刚登录的那个人**（连同他的 `aiApiKey`）。世代号挡得住 `set()`，
 * 挡不住这一条，所以七个 catch 各自在调本函数之前先 `if (!stillMine()) throw error`。
 */
const handleApiError = (error: unknown, defaultMessage: string): string | null => {
  if (error instanceof Error && isAuthError(error)) {
    silentRedirectToLogin()
    return null // 返回 null 表示已静默处理
  }
  return error instanceof Error ? error.message : defaultMessage
}

/**
 * ## 七个 action 开头那句 `const stillMine = pinSession()`
 *
 * 都是「异步取数 → 回来 `set(...)`」的形状，而登出**不取消**飞在半空的请求。
 * 没有这道闸时，A 的 `getPendingRequests` 在 B 登录之后落地，
 * `set({pendingRequests})` 把 A 的申请人 ID / 昵称 / 申请留言写进 B 的内存，
 * `FriendList` 直接渲染它们——这是跨账号**暴露**，不只是"脏了一格状态"。
 * 本 store 没有 persist，落盘闸门（`sessionScopedLocalStorage`）根本不经过它，
 * 内存这一半只能在这里挡。
 *
 * **两半都要挡**，和 `profileStore` 的三个 action 逐字同型：
 * - `set()` 之前 `if (!stillMine()) return` —— 判假时一个字都不写。会话结束时
 *   `registerPristineStoreReset` 刚把这个 store 归零，再写只会把它从"干净"改回"脏"；
 * - catch 里 `if (!stillMine()) throw error` —— 位置在 {@link handleApiError}
 *   **之前**，因为那个函数会 `clearAuth()`（见它的注释）。只挡 `set()` 是不够的。
 *
 * 复合 action（`sendFriendRequest` / `approve` / `reject` / `removeFriend`）的规则是
 * **每一个 `await` 之后都重新问一次**，不是"开头钉一次就够"：
 * - 主调用之后判假 ⇒ 就地 return，连后面那次列表重载都不发出去。不挡的话，
 *   那次重载会在**当前**这场会话里发一个新请求，写的是当前这个人的数据——
 *   数据本身不脏，但它是一场已经结束的会话发起的写入；
 * - 每次内层重载之后再判一次 ⇒ 内层 action 判假时是**静默 return**，
 *   外层若不挡，`approveFriendRequest` 会接着发第二个请求，而那句收尾的
 *   `set({isLoading:false})` 会把 B 自己正在转的圈提前关掉。
 *
 * 钉住它的用例：`store/__tests__/friendsStore.test.ts` 的「跨会话边界」三组
 * `it.each`（七个 action × 落地成功 / 七个 action × 落地失败 / 四个复合 action
 * 的五次内层重载各一条），外加同一个 describe 末尾那条正对照
 * 「同一场会话里落地的 401 照旧清盘并跳登录页」——没有它，
 * 那句 `expect(replaceSpy).not.toHaveBeenCalled()` 可能只是 spy 没接上。
 * 十九处守卫逐个删过一遍，每一处都有用例变红。
 */
export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  pendingRequests: [],
  sentRequests: [],
  onlineStatus: new Map(),
  isLoading: false,
  hasLoaded: false,
  error: null,

  loadFriends: async () => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      const friends = await loadFriends()
      if (!stillMine()) return
      set({ friends, isLoading: false, hasLoaded: true })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = handleApiError(error, '加载好友列表失败')
      // ⚠️ 认证分支（errorMessage === null）不写 hasLoaded：`handleApiError` 在上面
      // 这一行内部已经调过 `silentRedirectToLogin → clearAuth → endSession`，本 store
      // 被 `registerPristineStoreReset` 同步清回了 pristine（hasLoaded 已经是 false）。
      // `stillMine()` 挡不住这一下——它是本次调用自己触发的重置，不是"另一场会话
      // 抢先结束"，检查点在它之前就已经通过。这里如果照抄非认证分支写一个
      // `hasLoaded: true`，就是往刚清空的 store 上立刻叠一次脏写：页面正在整页跳转
      // 去登录页，剩下这半秒内存里的状态没有意义，但语义上会变成"这场（即将作废的）
      // 会话已经问完后端"，与"会话重置后的初始状态"矛盾。非认证分支才是真正问到了
      // 后端、拿到了确定结果（哪怕是错误），只有它算"加载完成"。
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false, hasLoaded: true })
      throw error
    }
  },

  loadPendingRequests: async () => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      const pendingRequests = await friendsApi.getPendingRequests()
      if (!stillMine()) return
      set({ pendingRequests, isLoading: false })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = handleApiError(error, '加载好友请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  loadSentRequests: async () => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      const sentRequests = await friendsApi.getSentRequests()
      if (!stillMine()) return
      set({ sentRequests, isLoading: false })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = handleApiError(error, '加载已发送请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  sendFriendRequest: async (targetUserId: string, reason?: string) => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      await friendsApi.sendFriendRequest(targetUserId, reason)
      // 会话已经不是发起时那一场：不写、也不再发起后面那次列表重载。
      if (!stillMine()) return
      // 重新加载已发送请求列表
      await get().loadSentRequests()
      if (!stillMine()) return
      set({ isLoading: false })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = handleApiError(error, '发送好友请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  // 后端 approve 的请求体只有 { user_id, applicant_user_id }
  // （backend-docs/friends/好友添加删除.md:25-32），不收集通过理由，
  // 所以这里也不再往下透传一个永远不会被消费的 approvedReason。
  approveFriendRequest: async (applicantUserId: string) => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      await friendsApi.approveFriendRequest(applicantUserId)
      if (!stillMine()) return
      // 重新加载好友列表和请求列表
      await get().loadFriends()
      if (!stillMine()) return
      await get().loadPendingRequests()
      if (!stillMine()) return
      set({ isLoading: false })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = handleApiError(error, '同意好友请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  rejectFriendRequest: async (applicantUserId: string, rejectReason?: string) => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      await friendsApi.rejectFriendRequest(applicantUserId, rejectReason)
      if (!stillMine()) return
      // 重新加载请求列表
      await get().loadPendingRequests()
      if (!stillMine()) return
      set({ isLoading: false })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = handleApiError(error, '拒绝好友请求失败')
      set(errorMessage === null ? { isLoading: false } : { error: errorMessage, isLoading: false })
      throw error
    }
  },

  removeFriend: async (friendUserId: string, removeReason?: string) => {
    const stillMine = pinSession()
    set({ isLoading: true, error: null })
    try {
      await friendsApi.removeFriend(friendUserId, removeReason)
      if (!stillMine()) return
      // 重新加载好友列表
      await get().loadFriends()
      if (!stillMine()) return
      set({ isLoading: false })
    } catch (error) {
      if (!stillMine()) throw error
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
