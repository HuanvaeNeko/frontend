import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchDiscovery, parseDiscoveryGroupCard } from '@/api/discovery'
import { storageApi } from '@/api/storage'
import { friendsApi } from '@/features/chat/api/friends'
import { groupMessagesApi } from '@/features/chat/api/groupMessages'
import { groupsApi } from '@/features/chat/api/groups'
import { messagesApi } from '@/features/chat/api/messages'
import { useAuthStore } from '@/features/auth/store/authStore'
import { webrtcApi } from '@/features/webrtc/api/webrtc'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { useApiConfigStore } from '@/store/apiConfig'

/**
 * 七份 `fetchWithAuth` 副本的 401 分支：`pinSession()` 那一行各自钉一遍。
 *
 * ## 这一行比 `performRefresh` 的世代号对照多挡住了什么
 *
 * `authStore.performRefresh` 的 catch 已经对照世代号，**每一份副本都白拿**这层
 * 保护：上一场会话里发出的刷新落地时不会去清当前这个人的票据。但那条只管
 * 「一次**已经发出**的刷新落地时怎么办」。本行管的是另一件事——上一场会话的 401
 * 回来时，**要不要发起一次新的刷新**。不挡的话，`refreshAccessToken()` 用的是
 * **B 的** refresh token，属于 B 的一次刷新，世代号对照全程判真，于是：
 *
 * 1. 刷新成功 ⇒ A 的那条请求被**带着 B 的 access token 原样重发**。跨会话重放：
 *    请求内容是 A 的（`POST /api/friends/remove` 带着 A 那个好友的 id、
 *    `DELETE /api/groups/{A 的群}/members/{某人}`、`POST /api/messages` 的一条
 *    A 写的消息），身份却是 B 的。世代号对照拦不住，它只看写入不看请求。
 *    这三个端点逐字取自 `friends.ts` / `groups.ts` / `messages.ts` 的抛出点与
 *    请求拼接处。
 * 2. 刷新失败（B 的网络抖一下就够）⇒ 副本的 catch 跑 `clearAuth()` +
 *    `window.location.href = /app/login`：刚登录的 B 被清盘并踢回登录页，
 *    起因是 A 的一条早就该被忽略的 401。
 * 3. 无论成败，都白轮换一次 B 的 token。
 *
 * 所以这一行**不是**冗余，下面每一份都实测过：把那个合取项删掉，对应模块的
 * 「上一场会话的 401」用例必红（第 4 次 fetch 会发生）。
 *
 * ## 为什么每份各钉一条，而不是抽一条公共用例
 *
 * 十份副本是十段各自独立的代码，公共用例只能证明"至少有一份接了"。
 * 「多份 fetchWithAuth 合一」正在另一个 worktree 里进行——合并之后接手的那一份
 * 仍然要让这七条全绿，任何一份在合并中把 `isLiveSession()` 丢掉，
 * 这张表就会指名道姓地报出是哪个模块。
 */

const loginEnvelope = (nickname: string) => ({
  success: true,
  code: 200,
  data: {
    access_token: `AT-${nickname}`,
    refresh_token: `RT-${nickname}`,
    expires_in: 3600,
  },
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const unauthorized = () =>
  jsonResponse({ success: false, code: 401, error: 'Token 无效或已过期' }, 401)

/** 一个手动控制何时落地的 fetch 响应。 */
const deferredResponse = () => {
  let release!: (response: Response) => void
  const promise = new Promise<Response>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

let fetchMock: ReturnType<typeof vi.fn>

const loginAs = async (nickname: string) => {
  fetchMock.mockResolvedValueOnce(jsonResponse(loginEnvelope(nickname)))
  await useAuthStore.getState().login({ user_id: nickname, password: 'p' })
}

/**
 * 每份副本挑一个 GET：只要走到那一份 `fetchWithAuth` 就够，具体端点不重要。
 * 七个调用最终都会 reject（401 / 500 都不是合法响应），所以下面统一
 * `.catch(() => {})` 或 `rejects.toThrow()`，不依赖各自的解包形状。
 */
const COPIES: ReadonlyArray<{ readonly module: string; readonly call: () => Promise<unknown> }> = [
  { module: 'features/chat/api/friends.ts', call: () => friendsApi.getFriendsList() },
  { module: 'features/chat/api/messages.ts', call: () => messagesApi.getMessages('friend-1') },
  {
    module: 'features/chat/api/groupMessages.ts',
    call: () => groupMessagesApi.getMessages('group-1'),
  },
  { module: 'features/chat/api/groups.ts', call: () => groupsApi.getMyGroups() },
  { module: 'features/webrtc/api/webrtc.ts', call: () => webrtcApi.getIceServers() },
  { module: 'api/storage.ts', call: () => storageApi.getFileList() },
  {
    module: 'api/discovery.ts',
    call: () =>
      searchDiscovery({ keyword: 'k', section: 'groups', row: parseDiscoveryGroupCard }),
  },
]

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setApiShapeErrorReporter(() => {})
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe.each(COPIES)('$module 的 401 分支', ({ call }) => {
  it('上一场会话的 401：不刷新、不重发、不动当前这个人的会话', async () => {
    await loginAs('alice')

    const pending = deferredResponse()
    fetchMock.mockImplementationOnce(() => pending.promise)
    const aliceCall = call()
    // 等这份副本**真的**把请求发出去了（alice 登录 + 这一次 = 2）。
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    useAuthStore.getState().clearAuth()
    await loginAs('bob')
    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-bob', useCustomApi: true })

    // 正对照：B 的会话是活的，他的密钥确实落了盘，而且到这里刚好 3 次 fetch。
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')

    // 这一条是给"万一真的去刷新了"准备的：那次刷新会失败，于是副本的 catch 会走到
    // `clearAuth()` + 跳登录页。它没被消费，正是下面 toHaveBeenCalledTimes(3) 的含义。
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    pending.release(unauthorized())

    await expect(aliceCall).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useAuthStore.getState().refreshToken).toBe('RT-bob')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-bob')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')
  })

  it('正对照：同一场会话里的 401 照常刷新并重发一次', async () => {
    // 没有这一条，上面那条可以被"这份副本根本没有 401 刷新分支"骗过去——
    // 那样 `isLiveSession()` 删不删都是 3 次 fetch。
    await loginAs('alice')

    fetchMock.mockResolvedValueOnce(unauthorized())
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        code: 200,
        data: { access_token: 'AT-alice-2', refresh_token: 'RT-alice-2', expires_in: 3600 },
      }),
    )
    // 重发的响应是什么形状无所谓：这条用例只看"刷新与重发发生了没有"。
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, code: 500, error: '重发也失败' }, 500))

    await expect(call()).rejects.toThrow()

    // alice 登录 + 请求 + 刷新 + 重发 = 4
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(useAuthStore.getState().accessToken).toBe('AT-alice-2')
    expect(useAuthStore.getState().refreshToken).toBe('RT-alice-2')
  })
})
