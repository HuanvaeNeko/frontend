import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, ApiShapeError } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { friendsApi } from '../../api/friends'
import { useFriendsStore } from '../friendsStore'

/**
 * `friendsStore` 七个 action 的失败收尾，**逐个**钉。
 *
 * 那一行
 *   `set(errorMessage === null ? {isLoading:false} : {error, isLoading:false}); throw error`
 * 是复制了七份的同一行，两条分支各有一种退化：
 * - `handleApiError` 返回 `null`（认证失败）时退回 `set({isLoading:false}); return`
 *   —— promise **resolve**，于是 `FriendList.handleApprove` 里
 *   `await approveFriendRequest(...)` 后面那句「成功 / 已添加好友」照弹，
 *   而同一刻 `clearAuth()` 已执行、页面在跳登录页；
 * - 非 `null` 时漏掉 `throw` —— 失败被报告成成功，只是没跳转。
 *
 * 之前这两条分支合计只钉了 4 个点（认证：loadPendingRequests / sendFriendRequest；
 * 非认证：approveFriendRequest / loadFriends）。把 `approveFriendRequest` 的
 * **认证**分支换回退化写法，那 4 条依旧全绿（本次实测；审阅者在完整套件上
 * 复现的是 508 条全绿）。所以这里改成表驱动：七个 action × 两条分支，一个不漏。
 *
 * 认证用例断的是 **rejects**，不是"跳了登录页"：只断言 `location.replace`
 * 被调用的话，`return` 版本同样通过，等于没测。
 */

const replaceSpy = vi.fn()
const loggedIn = () => useAuthStore.getState().accessToken !== null

/** 会话失效：401。endpoint 逐字取自 `src/features/chat/api/friends.ts` 的抛出点。 */
const sessionExpired = (endpoint: string) =>
  new ApiError('未认证或 Token 无效', { status: 401, code: 401, endpoint })

/** 普通拒绝：403 权限不足。本后端的 403 不是 token 失效，必须是可见错误。 */
const permissionDenied = (endpoint: string) =>
  new ApiError('权限不足', { status: 403, code: 403, endpoint })

/**
 * 七个 action 与它们各自会失败的那一次上游调用。
 *
 * `loadFriends` 走 `@/data` 的 `loadFriends()`，它当前直接透传
 * `friendsApi.getFriendsList()`（`src/data/conversations.ts:11-13`），所以打桩打在
 * `friendsApi` 上对两层都成立。
 *
 * 四个写操作——`sendFriendRequest` / `approveFriendRequest` / `rejectFriendRequest` /
 * `removeFriend`——成功后还会去重新加载列表（`friendsStore.ts:126`、`:143-144`、
 * `:158`、`:172`），这里让**第一次**调用就失败，命中的正是本 action 自己的 catch。
 */
const ACTIONS = [
  {
    action: 'loadFriends',
    endpoint: 'GET /api/friends',
    stub: (error: Error) => vi.spyOn(friendsApi, 'getFriendsList').mockRejectedValue(error),
    run: () => useFriendsStore.getState().loadFriends(),
  },
  {
    action: 'loadPendingRequests',
    endpoint: 'GET /api/friends/requests/pending',
    stub: (error: Error) => vi.spyOn(friendsApi, 'getPendingRequests').mockRejectedValue(error),
    run: () => useFriendsStore.getState().loadPendingRequests(),
  },
  {
    action: 'loadSentRequests',
    endpoint: 'GET /api/friends/requests/sent',
    stub: (error: Error) => vi.spyOn(friendsApi, 'getSentRequests').mockRejectedValue(error),
    run: () => useFriendsStore.getState().loadSentRequests(),
  },
  {
    action: 'sendFriendRequest',
    endpoint: 'POST /api/friends/requests',
    stub: (error: Error) => vi.spyOn(friendsApi, 'sendFriendRequest').mockRejectedValue(error),
    run: () => useFriendsStore.getState().sendFriendRequest('u2'),
  },
  {
    action: 'approveFriendRequest',
    endpoint: 'POST /api/friends/requests/approve',
    stub: (error: Error) => vi.spyOn(friendsApi, 'approveFriendRequest').mockRejectedValue(error),
    run: () => useFriendsStore.getState().approveFriendRequest('u2'),
  },
  {
    action: 'rejectFriendRequest',
    endpoint: 'POST /api/friends/requests/reject',
    stub: (error: Error) => vi.spyOn(friendsApi, 'rejectFriendRequest').mockRejectedValue(error),
    run: () => useFriendsStore.getState().rejectFriendRequest('u2'),
  },
  {
    action: 'removeFriend',
    endpoint: 'POST /api/friends/remove',
    stub: (error: Error) => vi.spyOn(friendsApi, 'removeFriend').mockRejectedValue(error),
    run: () => useFriendsStore.getState().removeFriend('u2'),
  },
] as const

beforeEach(() => {
  localStorage.clear()
  replaceSpy.mockClear()
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: 'RT',
    isAuthenticated: true,
    user: { user_id: 'me' },
    tokenExpiry: Date.now() + 3600_000,
  })
  useFriendsStore.setState({ friends: [], pendingRequests: [], sentRequests: [], isLoading: false, error: null })
  vi.spyOn(window.location, 'replace').mockImplementation(replaceSpy)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('friendsStore 的认证分支（handleApiError 返回 null）', () => {
  it.each(ACTIONS)('$action：跳登录页，但 action 依然 reject', async ({ endpoint, stub, run }) => {
    stub(sessionExpired(endpoint))

    await expect(run()).rejects.toThrow('未认证或 Token 无效')

    expect(loggedIn()).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
    expect(useFriendsStore.getState().isLoading).toBe(false)
    // 认证分支不写 store.error（跳转本身就是回答），错误由 rethrow 交给调用方。
    expect(useFriendsStore.getState().error).toBeNull()
  })

  it('前端哨兵「用户未登录」同样跳登录页且 reject', async () => {
    // friends.ts 在拿不到自己的 user_id 时抛的正是这条裸 Error，请求根本没发出去。
    // 它走的是 isAuthError 的第 3 档（哨兵整串相等），与上面的状态码档不是同一条路。
    vi.spyOn(friendsApi, 'sendFriendRequest').mockRejectedValue(new Error('用户未登录'))

    await expect(useFriendsStore.getState().sendFriendRequest('u2')).rejects.toThrow('用户未登录')

    expect(loggedIn()).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })
})

describe('friendsStore 的非认证失败（handleApiError 返回文案）', () => {
  it.each(ACTIONS)('$action：403 是可见错误，不静默登出', async ({ endpoint, stub, run }) => {
    stub(permissionDenied(endpoint))

    await expect(run()).rejects.toThrow('权限不足')

    expect(useFriendsStore.getState().error).toBe('权限不足')
    expect(useFriendsStore.getState().isLoading).toBe(false)
    expect(loggedIn()).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('形状漂移（HTTP 200 的 ApiShapeError）也不该登出', async () => {
    vi.spyOn(friendsApi, 'getFriendsList').mockRejectedValue(
      new ApiShapeError('GET /api/friends: data 应为数组', {
        status: 200,
        endpoint: 'GET /api/friends',
      }),
    )

    await expect(useFriendsStore.getState().loadFriends()).rejects.toThrow('data 应为数组')

    expect(useFriendsStore.getState().error).toContain('data 应为数组')
    expect(loggedIn()).toBe(true)
    expect(replaceSpy).not.toHaveBeenCalled()
  })
})
