import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, ApiShapeError } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { friendsApi } from '../../api/friends'
import { useFriendsStore } from '../friendsStore'

/**
 * `friendsStore.handleApiError` 返回 `null` 的那条分支。
 *
 * 修复前它是 `set({isLoading:false}); return`——promise resolve，于是
 * `FriendList.handleApprove` 里 `await approveFriendRequest(...)` 之后那句
 * 「成功 / 已添加好友」照弹，而同一刻 `clearAuth()` 已执行、页面在跳登录页。
 *
 * 所以认证用例断的是 **rejects**，不是"跳了登录页"：只断言 `location.replace`
 * 被调用的话，`return` 版本同样通过。
 */

const replaceSpy = vi.fn()
const loggedIn = () => useAuthStore.getState().accessToken !== null

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

describe('friendsStore 的认证分支', () => {
  it('401 会话失效：跳登录页，但 action 依然 reject', async () => {
    vi.spyOn(friendsApi, 'getPendingRequests').mockRejectedValue(
      new ApiError('未认证或 Token 无效', {
        status: 401,
        code: 401,
        endpoint: 'GET /api/friends/requests/pending',
      }),
    )

    await expect(useFriendsStore.getState().loadPendingRequests()).rejects.toThrow('未认证或 Token 无效')

    expect(loggedIn()).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
    expect(useFriendsStore.getState().isLoading).toBe(false)
    // 认证分支不写 store.error（跳转本身就是回答），错误由 rethrow 交给调用方。
    expect(useFriendsStore.getState().error).toBeNull()
  })

  it('前端哨兵「用户未登录」同样跳登录页且 reject', async () => {
    // friends.ts 在拿不到自己的 user_id 时抛的正是这条裸 Error，请求根本没发出去。
    vi.spyOn(friendsApi, 'sendFriendRequest').mockRejectedValue(new Error('用户未登录'))

    await expect(useFriendsStore.getState().sendFriendRequest('u2')).rejects.toThrow('用户未登录')

    expect(loggedIn()).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })
})

describe('friendsStore 的非认证失败', () => {
  it('403 权限不足是可见错误，不静默登出', async () => {
    vi.spyOn(friendsApi, 'approveFriendRequest').mockRejectedValue(
      new ApiError('权限不足', {
        status: 403,
        code: 403,
        endpoint: 'POST /api/friends/requests/approve',
      }),
    )

    await expect(useFriendsStore.getState().approveFriendRequest('u2')).rejects.toThrow('权限不足')

    expect(useFriendsStore.getState().error).toBe('权限不足')
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
