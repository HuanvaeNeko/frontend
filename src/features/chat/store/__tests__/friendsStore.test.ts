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
const loggedIn = () => useAuthStore.getState().isAuthenticated

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
  {
    action: 'loadBlacklist',
    endpoint: 'GET /api/friends/blacklist',
    stub: (error: Error) => vi.spyOn(friendsApi, 'getBlacklist').mockRejectedValue(error),
    run: () => useFriendsStore.getState().loadBlacklist(),
  },
  {
    action: 'addBlacklist',
    endpoint: 'POST /api/friends/blacklist',
    stub: (error: Error) => vi.spyOn(friendsApi, 'addBlacklist').mockRejectedValue(error),
    run: () => useFriendsStore.getState().addBlacklist('u2'),
  },
  {
    action: 'removeBlacklist',
    endpoint: 'DELETE /api/friends/blacklist/{target_user_id}',
    stub: (error: Error) => vi.spyOn(friendsApi, 'removeBlacklist').mockRejectedValue(error),
    run: () => useFriendsStore.getState().removeBlacklist('u2'),
  },
] as const

beforeEach(() => {
  localStorage.clear()
  replaceSpy.mockClear()
  // 会话制下 fetchWithAuth 不再读 token——同源 cookie 自动带上。
  useAuthStore.setState({ isAuthenticated: true, user: { user_id: 'me' } })
  useFriendsStore.setState({ friends: [], pendingRequests: [], sentRequests: [], isLoading: false, error: null, blacklist: [], blacklistLoaded: false })
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

/**
 * 七个 action 的第三条分支：响应落地时**会话已经换人**。
 *
 * 上面两个 `it.each` 钉的是"失败怎么收尾"，这一组钉的是"这份数据/这次失败还
 * 属不属于当前这场会话"。审阅者复现的形状就在这里：A 登录 → `loadPendingRequests()`
 * 发出 → `clearAuth()` → B 登录 → A 的响应落地，`set({pendingRequests})` 把
 * A 的申请人 ID、昵称、申请留言写进 B 的内存，`FriendList` 直接渲染。
 * 跨账号**暴露**，而不只是一格脏状态。
 *
 * 两条分支各自钉一遍，因为它们由**不同**的两行守着：
 * - 落地成功 ⇐ `set()` 之前那句 `if (!stillMine()) return`；
 * - 落地失败 ⇐ catch 里那句 `if (!stillMine()) throw error`，它必须在
 *   `handleApiError` **之前**——那个函数会 `clearAuth()`，把刚登录的 B 清掉。
 *   只挡住 `set()` 的话这一条依然红。
 */
describe('friendsStore 跨会话边界：上一场会话的响应落在下一场里', () => {
  const ALICE_FRIEND = {
    friend_id: 'alice-friend',
    friend_nickname: 'A 的好友',
    friend_avatar_url: null,
    add_time: '2026-01-01T00:00:00Z',
    approve_reason: null,
    friend_remark: null,
    is_blacklisted: false,
    is_special_care: false,
  }
  const ALICE_PENDING = {
    request_id: 'r1',
    request_user_id: 'carol',
    request_message: 'A 的申请人',
    request_time: '2026-01-01T00:00:00Z',
    requester_nickname: 'Carol',
    requester_avatar_url: null,
  }
  const ALICE_SENT = {
    request_id: 's1',
    sent_to_user_id: 'dave',
    sent_message: 'A 发出去的申请',
    sent_time: '2026-01-01T00:00:00Z',
    sent_to_nickname: 'Dave',
    sent_to_avatar_url: null,
  }
  const ALICE_BLACKLISTED = { user_id: 'evil', user_nickname: 'A 拉黑的人', user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }

  /** `create()` 刚返回时的状态，也就是 `registerPristineStoreReset` 的重置目标。 */
  const PRISTINE = {
    friends: [],
    pendingRequests: [],
    sentRequests: [],
    onlineStatus: new Map<string, boolean>(),
    isLoading: false,
    error: null,
    blacklist: [],
    blacklistLoaded: false,
  }

  const snapshot = () => {
    const state = useFriendsStore.getState()
    return {
      friends: state.friends,
      pendingRequests: state.pendingRequests,
      sentRequests: state.sentRequests,
      onlineStatus: state.onlineStatus,
      isLoading: state.isLoading,
      error: state.error,
      blacklist: state.blacklist,
      blacklistLoaded: state.blacklistLoaded,
    }
  }

  const deferred = () => {
    let release!: (value: never) => void
    let fail!: (error: unknown) => void
    const promise = new Promise<never>((resolve, reject) => {
      release = resolve as (value: never) => void
      fail = reject
    })
    return { promise, release, fail }
  }

  /**
   * 三个列表接口一律返回 **A 的**数据，于是"漏了一处守卫"在七条用例里的表现
   * 是同一个：A 的行出现在 B 的 store 里。四个写操作各自 defer 的是它们自己那
   * 一次调用，后面的列表重载走这三个桩。
   */
  const stubAliceLists = () => {
    vi.spyOn(friendsApi, 'getFriendsList').mockResolvedValue([ALICE_FRIEND])
    vi.spyOn(friendsApi, 'getPendingRequests').mockResolvedValue([ALICE_PENDING])
    vi.spyOn(friendsApi, 'getSentRequests').mockResolvedValue([ALICE_SENT])
    vi.spyOn(friendsApi, 'getBlacklist').mockResolvedValue([ALICE_BLACKLISTED])
  }

  /** A 登出 → B 登录。世代号跨过两个边界，闸门在 B 这一侧重新开着。 */
  const crossToBob = async () => {
    useAuthStore.getState().clearAuth()
    // 会话制下 authStore.login 打同源 BFF，响应形状是 `{data: {user}}`——
    // 没有 token 三件套。
    const loginResponse = new Response(
      JSON.stringify({
        success: true,
        code: 200,
        data: { user: { user_id: 'bob' } },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(loginResponse))
    await useAuthStore.getState().login({ user_id: 'bob', password: 'p' })
    vi.unstubAllGlobals()
  }

  const CROSS_ACTIONS = [
    { action: 'loadFriends', defer: 'getFriendsList', landed: [ALICE_FRIEND] },
    { action: 'loadPendingRequests', defer: 'getPendingRequests', landed: [ALICE_PENDING] },
    { action: 'loadSentRequests', defer: 'getSentRequests', landed: [ALICE_SENT] },
    { action: 'sendFriendRequest', defer: 'sendFriendRequest', landed: undefined },
    { action: 'approveFriendRequest', defer: 'approveFriendRequest', landed: undefined },
    { action: 'rejectFriendRequest', defer: 'rejectFriendRequest', landed: undefined },
    { action: 'removeFriend', defer: 'removeFriend', landed: undefined },
    { action: 'loadBlacklist', defer: 'getBlacklist', landed: [ALICE_BLACKLISTED] },
    { action: 'addBlacklist', defer: 'addBlacklist', landed: undefined },
    { action: 'removeBlacklist', defer: 'removeBlacklist', landed: undefined },
  ] as const

  const runOf = (action: (typeof CROSS_ACTIONS)[number]['action']): Promise<void> => {
    const store = useFriendsStore.getState()
    switch (action) {
      case 'loadFriends':
        return store.loadFriends()
      case 'loadPendingRequests':
        return store.loadPendingRequests()
      case 'loadSentRequests':
        return store.loadSentRequests()
      case 'sendFriendRequest':
        return store.sendFriendRequest('u2')
      case 'approveFriendRequest':
        return store.approveFriendRequest('u2')
      case 'rejectFriendRequest':
        return store.rejectFriendRequest('u2')
      case 'removeFriend':
        return store.removeFriend('u2')
      case 'loadBlacklist':
        return store.loadBlacklist()
      case 'addBlacklist':
        return store.addBlacklist('u2')
      case 'removeBlacklist':
        return store.removeBlacklist('u2')
    }
  }

  it.each(CROSS_ACTIONS)(
    '$action：落地成功时一个字都不写进 B 的 store',
    async ({ action, defer, landed }) => {
      stubAliceLists()
      const pending = deferred()
      vi.spyOn(friendsApi, defer).mockReturnValue(pending.promise)

      const inFlight = runOf(action)
      await crossToBob()

      // 正对照：换人这一刻 B 确实登进来了，而且 store 确实是干净的——
      // 没有这两句，下面的 toEqual(PRISTINE) 可能只是"从来没写进去过"。
      expect(useAuthStore.getState().user?.user_id).toBe('bob')
      expect(snapshot()).toEqual(PRISTINE)

      pending.release(landed as never)
      await inFlight

      expect(snapshot()).toEqual(PRISTINE)
    },
  )

  it.each(CROSS_ACTIONS)(
    '$action：落地失败时不去清 B 的会话',
    async ({ action, defer }) => {
      stubAliceLists()
      const pending = deferred()
      vi.spyOn(friendsApi, defer).mockReturnValue(pending.promise)

      const inFlight = runOf(action)
      await crossToBob()

      // 正对照：B 登进来了；`replaceSpy` 的接线在同一个 describe 的最后一条
      // 用例里被证明有效（同一个 beforeEach 里挂的同一个 spy）。
      expect(useAuthStore.getState().user?.user_id).toBe('bob')
      replaceSpy.mockClear()

      pending.fail(sessionExpired('GET /api/friends'))
      await expect(inFlight).rejects.toThrow('未认证或 Token 无效')

      // `handleApiError` 一步都没走到：B 没被清盘，也没被踢去登录页。
      expect(useAuthStore.getState().user?.user_id).toBe('bob')
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(replaceSpy).not.toHaveBeenCalled()
      expect(snapshot()).toEqual(PRISTINE)
    },
  )

  /**
   * 四个复合 action 的**第二**道守卫：主调用已经回来了（那时还是 A 的会话），
   * 会话是在内层列表重载**期间**换的。内层 action 自己钉的是 A 那一场，判假后
   * 静默 return，于是外层那句收尾的 `set({isLoading:false})` 是这条时序里
   * 唯一还会落到 B 身上的写入——它会把 B 自己那次正在转圈的操作提前关掉。
   *
   * 上面「落地成功」那一组钉不到这一道：那里主调用就已经落在 B 的会话里了，
   * 第一道守卫直接 return，第二道根本走不到。
   */
  const COMPOSITE_ACTIONS = [
    {
      name: 'sendFriendRequest 的 loadSentRequests',
      action: 'sendFriendRequest',
      primary: 'sendFriendRequest',
      innerDefer: 'getSentRequests',
    },
    {
      name: 'approveFriendRequest 的第一次重载 loadFriends',
      action: 'approveFriendRequest',
      primary: 'approveFriendRequest',
      innerDefer: 'getFriendsList',
    },
    {
      // approve 有**两次**内层重载，两次之后各有一道守卫。只钉第一次的话，
      // 第二次那道（`loadPendingRequests()` 与收尾 `set` 之间）没有任何用例
      // 钉住——实测删掉它 35 条全绿。
      name: 'approveFriendRequest 的第二次重载 loadPendingRequests',
      action: 'approveFriendRequest',
      primary: 'approveFriendRequest',
      innerDefer: 'getPendingRequests',
    },
    {
      name: 'rejectFriendRequest 的 loadPendingRequests',
      action: 'rejectFriendRequest',
      primary: 'rejectFriendRequest',
      innerDefer: 'getPendingRequests',
    },
    {
      name: 'removeFriend 的 loadFriends',
      action: 'removeFriend',
      primary: 'removeFriend',
      innerDefer: 'getFriendsList',
    },
  ] as const

  it.each(COMPOSITE_ACTIONS)(
    '$name 期间换人：收尾的 isLoading 不写进 B 的 store',
    async ({ action, primary, innerDefer }) => {
      stubAliceLists()
      vi.spyOn(friendsApi, primary).mockResolvedValue(undefined)
      const innerPending = deferred()
      const innerSpy = vi.spyOn(friendsApi, innerDefer).mockReturnValue(innerPending.promise)

      const inFlight = runOf(action)
      // 等到那次内层重载**真的**发出去了——不数微任务：approve 的第二次重载
      // 前面还隔着一整轮 loadFriends。
      await vi.waitFor(() => expect(innerSpy).toHaveBeenCalled())

      await crossToBob()

      // B 自己有一次操作正在转圈。正对照：这一刻它确实是 true。
      useFriendsStore.setState({ isLoading: true })
      expect(useFriendsStore.getState().isLoading).toBe(true)

      innerPending.release([] as never)
      await inFlight

      // A 那次迟到的收尾没有把 B 的转圈关掉。
      expect(useFriendsStore.getState().isLoading).toBe(true)
    },
  )

  it('正对照：同一场会话里落地的 401 照旧清盘并跳登录页', async () => {
    // 上面那条 `expect(replaceSpy).not.toHaveBeenCalled()` 的正对照：
    // 同样的接线、同样的错误，只是中途**没有**换人。
    stubAliceLists()
    const pending = deferred()
    vi.spyOn(friendsApi, 'getPendingRequests').mockReturnValue(pending.promise)

    const inFlight = useFriendsStore.getState().loadPendingRequests()
    pending.fail(sessionExpired('GET /api/friends/requests/pending'))
    await expect(inFlight).rejects.toThrow('未认证或 Token 无效')

    expect(loggedIn()).toBe(false)
    expect(replaceSpy).toHaveBeenCalledWith(ROUTES.auth.login)
  })
})

/**
 * `hasLoaded`：区分"从没问过后端"与"问过了，结果就是这样"——`useRouteConversation`
 * 靠它判断深链冷启动（刷新 / 书签 / 登录后 last_visited_path 恢复）时该显示 loading
 * 还是 missing，见该 hook 与本 store 里的注释。正/负各一条：成功落地一条，
 * 失败落地一条，两条都从显式的 `hasLoaded: false` 起步，不依赖套件里前面用例
 * 留下的状态。
 */
describe('friendsStore.hasLoaded：区分"没加载过"与"加载过，结果确实是这样"', () => {
  it('初始为 false；loadFriends 成功落地后变 true', async () => {
    useFriendsStore.setState({ hasLoaded: false })
    expect(useFriendsStore.getState().hasLoaded).toBe(false)

    vi.spyOn(friendsApi, 'getFriendsList').mockResolvedValue([])
    await useFriendsStore.getState().loadFriends()

    expect(useFriendsStore.getState().hasLoaded).toBe(true)
  })

  it('loadFriends 失败（非认证错误）后也变 true——已经问过后端一次，这次问到的是个错误', async () => {
    useFriendsStore.setState({ hasLoaded: false })

    vi.spyOn(friendsApi, 'getFriendsList').mockRejectedValue(permissionDenied('GET /api/friends'))
    await expect(useFriendsStore.getState().loadFriends()).rejects.toThrow('权限不足')

    expect(useFriendsStore.getState().hasLoaded).toBe(true)
  })
})

describe('friendsStore 黑名单：成功后翻转 friends[].is_blacklisted 并同步 blacklist 列表', () => {
  const FRIEND = { friend_id: 'u2', friend_nickname: '李四', friend_avatar_url: 'https://cdn.test/u2.png', add_time: '2026-01-01T00:00:00Z', approve_reason: null, friend_remark: '小四', is_blacklisted: false, is_special_care: false }

  it('loadBlacklist 写 blacklist 与 blacklistLoaded，不碰 isLoading', async () => {
    vi.spyOn(friendsApi, 'getBlacklist').mockResolvedValue([{ user_id: 'u9', user_nickname: null, user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }])
    await useFriendsStore.getState().loadBlacklist()
    expect(useFriendsStore.getState().blacklist.map((u) => u.user_id)).toEqual(['u9'])
    expect(useFriendsStore.getState().blacklistLoaded).toBe(true)
    expect(useFriendsStore.getState().isLoading).toBe(false)
  })
  it('addBlacklist 成功：is_blacklisted 翻成 true，用备注名与头像本地补一条，不重拉', async () => {
    useFriendsStore.setState({ friends: [FRIEND] })
    const add = vi.spyOn(friendsApi, 'addBlacklist').mockResolvedValue(undefined)
    const get = vi.spyOn(friendsApi, 'getBlacklist')
    await useFriendsStore.getState().addBlacklist('u2')
    expect(add).toHaveBeenCalledWith('u2')
    expect(get).not.toHaveBeenCalled()
    expect(useFriendsStore.getState().friends[0].is_blacklisted).toBe(true)
    const entry = useFriendsStore.getState().blacklist[0]
    expect(entry.user_id).toBe('u2')
    expect(entry.user_nickname).toBe('小四')
    expect(entry.user_avatar_url).toBe('https://cdn.test/u2.png')
    expect(Number.isNaN(new Date(entry.created_at).getTime())).toBe(false)
  })
  it('addBlacklist 失败：不翻转、列表不变、reject（正对照）', async () => {
    useFriendsStore.setState({ friends: [FRIEND] })
    vi.spyOn(friendsApi, 'addBlacklist').mockRejectedValue(permissionDenied('POST /api/friends/blacklist'))
    await expect(useFriendsStore.getState().addBlacklist('u2')).rejects.toThrow('权限不足')
    expect(useFriendsStore.getState().friends[0].is_blacklisted).toBe(false)
    expect(useFriendsStore.getState().blacklist).toEqual([])
  })
  it('removeBlacklist 成功：翻回 false 并从 blacklist 移除；不是好友的人只动列表', async () => {
    useFriendsStore.setState({ friends: [{ ...FRIEND, is_blacklisted: true }], blacklist: [{ user_id: 'u2', user_nickname: '李四', user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }, { user_id: 'u9', user_nickname: null, user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }] })
    vi.spyOn(friendsApi, 'removeBlacklist').mockResolvedValue(undefined)
    await useFriendsStore.getState().removeBlacklist('u2')
    expect(useFriendsStore.getState().friends[0].is_blacklisted).toBe(false)
    expect(useFriendsStore.getState().blacklist.map((u) => u.user_id)).toEqual(['u9'])
    await useFriendsStore.getState().removeBlacklist('u9')
    expect(useFriendsStore.getState().blacklist).toEqual([])
    expect(useFriendsStore.getState().friends[0].is_blacklisted).toBe(false)
  })
  it('登出归零：blacklist 与 blacklistLoaded 随 registerPristineStoreReset 回到初值', async () => {
    useFriendsStore.setState({ blacklist: [{ user_id: 'u2', user_nickname: null, user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }], blacklistLoaded: true })
    useAuthStore.getState().clearAuth()
    expect(useFriendsStore.getState().blacklist).toEqual([])
    expect(useFriendsStore.getState().blacklistLoaded).toBe(false)
  })
})
