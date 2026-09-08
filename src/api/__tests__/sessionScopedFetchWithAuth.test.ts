import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchDiscovery, parseDiscoveryGroupCard } from '@/api/discovery'
import { storageApi } from '@/api/storage'
import { authApi } from '@/features/auth/api/auth'
import { lowcodeApi } from '@/features/lowcode/api/lowcode'
import { friendsApi } from '@/features/chat/api/friends'
import { groupMessagesApi } from '@/features/chat/api/groupMessages'
import { groupsApi } from '@/features/chat/api/groups'
import { messagesApi } from '@/features/chat/api/messages'
import { useAuthStore } from '@/features/auth/store/authStore'
import { profileApi } from '@/features/profile/api/profile'
import { webrtcApi } from '@/features/webrtc/api/webrtc'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { useApiConfigStore } from '@/store/apiConfig'

/**
 * 十个模块的 401 分支：每个模块**各钉一条**。
 *
 * ## 合并之后这张表钉的是另一件事了
 *
 * 合并前全仓有十份 `fetchWithAuth` 定义，这张表（当时八行）钉的是
 * 「**每一份副本**都在 401 分支上接了 `isLiveSession()`」——十段独立的代码，
 * 公共用例只能证明"至少有一份接了"，所以必须一份一条。
 *
 * 现在只剩一份（`src/api/authedFetch.ts`），那个理由消失了。**表没有变成
 * 八条重复断言，它换了个命题**：
 *
 *   「**每个模块都还走在那一份上**。」
 *
 * 这正是当初漂移的形状——十份副本不是一次写出来的，是一个模块一个模块抄出来
 * 的，而抄的那一刻没有任何东西会红。今天谁再抄一份回去、或者在某个模块里
 * 直接调裸 `fetch`，那个模块的行 **就会指名道姓地报出来**：那份新代码不会带
 * `isLiveSession()`（副本从来不带），于是「上一场会话的 401」立刻变红。
 * 静态的那一半（"全仓只允许有一处定义"）由本文件末尾
 * describe「合并之后全仓只剩一份 fetchWithAuth」守着；行为的这一半由这张表守。
 *
 * 所以行数从 8 补到 10：合并前在别处各自有用例的两份
 * （`features/auth/api/auth.ts` 在 `sessionHandoff.test.tsx`、
 * `api/apiClient.ts` 在 `apiClient.test.ts`）现在也进表，
 * 让「十个模块」与合并掉的「十份副本」逐一对得上。那两条原用例**都保留**：
 * 它们各自还钉着别的东西（前者从 store 侧驱动、后者直接调那个导出符号）。
 *
 * ## 这一行比 `performRefresh` 的世代号对照多挡住了什么
 *
 * `authStore.performRefresh` 的 catch 已经对照世代号：上一场会话里发出的刷新
 * 落地时不会去清当前这个人的票据。但那条只管「一次**已经发出**的刷新落地时
 * 怎么办」。本行管的是另一件事——上一场会话的 401 回来时，**要不要发起一次
 * 新的刷新**。不挡的话，`refreshAccessToken()` 用的是 **B 的** refresh token，
 * 属于 B 的一次刷新，世代号对照全程判真，于是：
 *
 * 1. 刷新成功 ⇒ A 的那条请求被**带着 B 的 access token 原样重发**。跨会话重放：
 *    请求内容是 A 的（`POST /api/friends/remove` 带着 A 那个好友的 id、
 *    `DELETE /api/groups/{A 的群}/members/{某人}`、`POST /api/messages` 的一条
 *    A 写的消息），身份却是 B 的。世代号对照拦不住，它只看写入不看请求。
 * 2. 刷新失败（B 的网络抖一下就够）⇒ catch 跑 `clearAuth()` +
 *    `window.location.href = /app/login`：刚登录的 B 被清盘并踢回登录页，
 *    起因是 A 的一条早就该被忽略的 401。
 * 3. 无论成败，都白轮换一次 B 的 token。
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
 * 每个模块挑一个 GET：只要**经这个模块**走到那份 `fetchWithAuth` 就够，
 * 具体端点不重要。十个调用最终都会 reject（401 / 500 都不是合法响应），
 * 所以下面统一 `rejects.toThrow()`，不依赖各自的解包形状。
 *
 * `profile.ts` 挑 `GET /api/profile`：401 分支上那个
 * `!isBusiness401Request(...)` 合取项查的白名单里只有
 * `PUT /api/profile/password`，所以 GET 照常走刷新重试，与其余九个一致。
 *
 * `api/apiClient.ts` 那行经 `lowcodeApi.getOperators()` 走：`apiClient` 的四个
 * 动词方法是它唯一的生产入口（`lowcode.ts` / `diagnostic.ts` 两个消费者），
 * 直接调 `apiClient.get` 只会拿到一个 `Response`、不会 reject，
 * 而 `lowcodeApi` 那层会把非 2xx 抛成可见错误——正好配这两条用例的形状。
 * 它同时是全仓唯一带超时（30 秒）的调用点，顺带覆盖了那条路。
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
  { module: 'features/profile/api/profile.ts', call: () => profileApi.getProfile() },
  { module: 'features/auth/api/auth.ts', call: () => authApi.getDevices() },
  { module: 'api/apiClient.ts', call: () => lowcodeApi.getOperators() },
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

/**
 * 上面那张表守的是**行为**（每个模块的请求确实走在那一份上）。这一条守的是
 * **结构**：全仓只允许存在一处 `fetchWithAuth` 定义。
 *
 * 两者都需要，因为它们各自都有漏洞：
 * - 只有行为表：谁新写一个模块、抄一份副本进去，表里没有它的行，没人会红。
 * - 只有本条：某个模块可以 import 了那一份却不用它（或某条路径绕开走裸
 *   `fetch`），定义数依然是 1。
 *
 * 漂移就是这么发生的：十份副本不是一次写出来的，是一个模块一个模块抄出来的，
 * 而抄的那一刻没有任何东西会红。
 */
describe('合并之后全仓只剩一份 fetchWithAuth', () => {
  // vitest 从仓库根运行（`vitest.config.ts` 就在根上）。
  const SRC = join(process.cwd(), 'src')

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        return entry === '__tests__' ? [] : sourceFiles(full)
      }
      return /\.tsx?$/.test(entry) ? [full] : []
    })

  it('`const fetchWithAuth =` 只出现在 api/authedFetch.ts 一个文件里', () => {
    const definers = sourceFiles(SRC)
      .filter((file) => /\bconst fetchWithAuth\s*=/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .sort()

    // 合并前这里是十个文件（apiClient / auth / profile / friends / messages /
    // groupMessages / groups / webrtc / storage / discovery）。
    expect(definers).toEqual(['api/authedFetch.ts'])
  })

  it('正对照：扫描确实看得见源码（否则上一条在扫了个空目录时也会绿）', () => {
    // 上一条断言的是一个"只有一项"的集合，而扫不到任何文件时它会退化成
    // `[] !== ['api/authedFetch.ts']` —— 那当然会红。真正危险的是反过来：
    // 正则永远匹配不上（比如改了写法），集合恒为空。所以这里正向证明扫描器
    // 在同一批文件上能认出一个已知存在的符号。
    const withPinSession = sourceFiles(SRC).filter((file) =>
      readFileSync(file, 'utf8').includes('pinSession'),
    )
    expect(withPinSession.length).toBeGreaterThan(0)
    expect(sourceFiles(SRC).length).toBeGreaterThan(100)
  })
})
