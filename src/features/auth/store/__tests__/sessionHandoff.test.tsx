import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DesktopSidebar } from '@/components/layout/app-shell/Navigation'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { friendsApi, type PendingRequest } from '@/features/chat/api/friends'
import { groupsApi, type GroupMember } from '@/features/chat/api/groups'
import { messagesApi, type SyncMessagesResponse } from '@/features/chat/api/messages'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { profileApi, type UserProfile } from '@/features/profile/api/profile'
import { makeProfile } from '@/features/profile/api/__tests__/profileFixture'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { fetchWithAuth } from '@/api/apiClient'
import { ApiError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { useApiConfigStore } from '@/store/apiConfig'
import { useWSStore } from '@/store/wsStore'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../authStore'

/**
 * 换人：A 登录 → 用一会儿 → 登出 → B 登录。B 那边不该看见 A 的任何东西。
 *
 * 这是本次修复的端到端用例：把 `clearAuth` 里那一行 `endSession()` 拿掉，
 * 下面三条全红。此前 `clearAuth` 只清
 * `auth-storage` 自己那五个字段，于是：
 * - `profile-storage` 原样留着，`Navigation` 挂在每个 `/app` 页面上，直接拿它渲染
 *   头像和昵称首字母，而只有三个页面会调 `loadProfile()`——所以 B 在 `/app/settings`、
 *   `/app/devices`、`/app/webrtc` 上，整场访问看到的都是 A 的头像；
 * - `api-config-storage` 原样留着，B 的 AI 请求会带着 A 的 `X-API-Key` 发出去。
 *
 * 断言分两侧：**落盘**（下一次整页加载后仍然存在的那一半）和**屏幕**
 * （客户端跳转的登出路径上，内存副本会一路活到 B 的会话里）。两侧都配了正对照：
 * A 登录后先断言这些东西**确实在**，否则"清干净了"可能只是从来没写进去过。
 */

const loginEnvelope = (user: { nickname: string; avatar?: string }) => ({
  success: true,
  code: 200,
  data: {
    access_token: `AT-${user.nickname}`,
    refresh_token: `RT-${user.nickname}`,
    expires_in: 3600,
    user_nickname: user.nickname,
    user_email: `${user.nickname}@example.com`,
    user_avatar_url: user.avatar,
  },
})

const profileOf = (userId: string, nickname: string, avatar: string | null): UserProfile =>
  makeProfile({
    user_id: userId,
    user_nickname: nickname,
    user_email: `${nickname}@example.com`,
    user_signature: `${nickname} 的签名`,
    user_avatar_url: avatar,
  })

const renderSidebar = () =>
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '*', element: <DesktopSidebar /> }], {
        initialEntries: ['/app/chat'],
      })}
    />,
  )

const avatarImg = () => document.querySelector('img[alt="Avatar"]')

let fetchMock: ReturnType<typeof vi.fn>

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** 一个手动控制何时落地的 fetch 响应。 */
const deferredResponse = () => {
  let release!: (response: Response) => void
  let fail!: (error: unknown) => void
  const promise = new Promise<Response>((resolve, reject) => {
    release = resolve
    fail = reject
  })
  return { promise, release, fail }
}

/** 一个手动控制何时落地的任意值。 */
const deferred = <T,>() => {
  let release!: (value: T) => void
  let fail!: (error: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    release = resolve
    fail = reject
  })
  return { promise, release, fail }
}

const loginAs = async (nickname: string) => {
  fetchMock.mockResolvedValueOnce(jsonResponse(loginEnvelope({ nickname })))
  await useAuthStore.getState().login({ user_id: nickname, password: 'p' })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setApiShapeErrorReporter(() => {})
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(authApi, 'logout').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('A 登出、B 登录', () => {
  it('A 的落盘副本一个都不剩，设备级偏好照旧', async () => {
    // ---- A 的一场完整会话 ----
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(loginEnvelope({ nickname: 'alice', avatar: 'avatars/alice.png' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    vi.spyOn(profileApi, 'getProfile').mockResolvedValue(
      profileOf('alice', 'Alice', `${getApiBaseUrl()}/avatars/alice.png`),
    )
    await useProfileStore.getState().loadProfile()

    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-alice', useCustomApi: true })
    // 设备级偏好 + 账号级偏好各一个，落在同一个 app-settings 键里
    useSettingsStore.getState().setSetting('theme', 'dark')
    useSettingsStore.getState().setSetting('showOnlineStatus', false)
    // 两个手写键：一个账号级（Navigation 写的最后访问路径），一个设备级（记住我）
    localStorage.setItem('last_visited_path', '/app/devices')
    localStorage.setItem('huanvae-remember-user_id', 'alice')
    localStorage.setItem('huanvae.api-base-url', getApiBaseUrl())

    // 正对照：这些东西**确实**落了盘。没有这一段，下面的 toBeNull 可能只是
    // 因为它们从来没被写进去过。
    expect(localStorage.getItem('profile-storage')).toContain('Alice')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-alice')
    expect(localStorage.getItem('auth-storage')).toContain('AT-alice')

    // ---- 登出 ----
    await useAuthStore.getState().logout()

    expect(localStorage.getItem('profile-storage')).toBeNull()
    expect(localStorage.getItem('api-config-storage')).toBeNull()
    expect(localStorage.getItem('last_visited_path')).toBeNull()
    // auth-storage 此前也只是被写成一串 null 而不是删掉；现在整键消失。
    expect(localStorage.getItem('auth-storage')).toBeNull()

    // 设备级的活下来：主题（`root.tsx` 的预水合脚本在 React 挂载前就读它）、
    // 后端基址（本项目会故意改它走本地反代）、以及用户显式勾选的「记住我」。
    const settings = JSON.parse(localStorage.getItem('app-settings') as string) as {
      state: Record<string, unknown>
    }
    expect(settings.state.theme).toBe('dark')
    expect(localStorage.getItem('huanvae.api-base-url')).toBe(getApiBaseUrl())
    expect(localStorage.getItem('huanvae-remember-user_id')).toBe('alice')
    // 同一个键里的账号级字段跟着账号走
    expect(settings.state).not.toHaveProperty('showOnlineStatus')
  })

  it('B 的屏幕上不会出现 A 的头像，内存里也没有 A 的 AI 密钥', async () => {
    // ---- A ----
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(loginEnvelope({ nickname: 'alice', avatar: 'avatars/alice.png' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })
    vi.spyOn(profileApi, 'getProfile').mockResolvedValue(
      profileOf('alice', 'Alice', `${getApiBaseUrl()}/avatars/alice.png`),
    )
    await useProfileStore.getState().loadProfile()
    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-alice', useCustomApi: true })

    // 正对照：A 的头像**确实**渲染出来了。
    const alice = renderSidebar()
    expect(avatarImg()?.getAttribute('src')).toContain('avatars/alice.png')
    alice.unmount()

    // ---- 登出（登出按钮走的就是这条：authStore.logout，没有重定向、不整页加载）----
    await useAuthStore.getState().logout()

    // ---- B 登录，但**不**加载他自己的资料 ----
    // 这正是泄露原本发生的时序：`loadProfile()` 只有三个页面会调，B 一进
    // /app/settings 之类的页面，侧栏就已经在渲染了。
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(loginEnvelope({ nickname: 'bob' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await useAuthStore.getState().login({ user_id: 'bob', password: 'p' })

    renderSidebar()

    expect(useProfileStore.getState().profile).toBeNull()
    expect(avatarImg()).toBeNull()
    // 首字母兜底顶上，而且是 B 的。按元素文本精确匹配而不是搜 body.textContent：
    // 侧栏里有一条 'AI 助手' 的 tooltip 文案，虽然 Radix 不展开时不挂载，
    // 但拿整段 textContent 做包含判断迟早会被它搞成假红/假绿。
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.queryByText('A')).toBeNull()

    // B 的 AI 请求不会带上 A 的密钥：`AiChatPage` 的条件是
    // `useCustomApi && aiApiKey`，两个都回到了默认值。
    expect(useApiConfigStore.getState().aiApiKey).toBe('')
    expect(useApiConfigStore.getState().useCustomApi).toBe(false)
  })

  it('内存里的会话、好友、AI 配置、账号级设置一并归零，设备级设置不动', async () => {
    // 这一条只看内存：上面两条覆盖的是落盘。两者的分工是有必要的——
    // 登出按钮（`Navigation` 的 `onClick={logout}`）和撤销当前设备走的是
    // 客户端跳转，**不整页加载**，内存副本会一路活到下一个人的会话里。
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(loginEnvelope({ nickname: 'alice' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    useChatStore.getState().setMessageInput('A 还没发出去的话')
    useChatStore.getState().setConversations([
      { id: 'c1', type: 'friend', name: 'A 的会话', lastMessage: '只有 A 看得到', unreadCount: 3 },
    ])
    useFriendsStore.setState({ friends: [], error: 'A 的错误' })
    useGroupStore.setState({ selectionError: 'A 的群拉取失败' })
    useSettingsStore.getState().setSetting('theme', 'dark')
    useSettingsStore.getState().setSetting('showOnlineStatus', false)
    const socket = { close: vi.fn(), onclose: null, onerror: null, onmessage: null, onopen: null }
    useWSStore.setState({ ws: socket as unknown as WebSocket, connected: true })

    // 正对照：写进去了。
    expect(useChatStore.getState().conversations).toHaveLength(1)
    expect(useSettingsStore.getState().showOnlineStatus).toBe(false)

    await useAuthStore.getState().logout()

    expect(useChatStore.getState().messageInput).toBe('')
    expect(useChatStore.getState().conversations).toEqual([])
    expect(useFriendsStore.getState().error).toBeNull()
    expect(useGroupStore.getState().selectionError).toBeNull()
    // 账号级设置回默认，设备级设置原样留着——同一个 store 里的两个字段，
    // 差分说明清的不是"整个 store"。
    expect(useSettingsStore.getState().showOnlineStatus).toBe(true)
    expect(useSettingsStore.getState().theme).toBe('dark')
    // 用上一个账号 token 建立的连接被真的关掉，而不只是把 ws 字段设成 null：
    // 留着不关的话它会继续投递消息、继续指数退避重连。
    expect(socket.close).toHaveBeenCalledWith(1000, 'User disconnect')
    expect(useWSStore.getState().connected).toBe(false)
  })
})

/**
 * 「会话结束」和「这一次请求没成」是两件事，而它们的错误代价**不对称**：
 * 清少了会泄露给下一个人，清多了会毁掉一份不可恢复的数据——
 * `api-config-storage` 里的 `aiApiKey` 是用户自己敲进去的第三方密钥，
 * 只有他知道，应用无从恢复。此前 `performRefresh` 的 catch 同时罩着 fetch 与
 * readEnvelope，一律 `clearAuth()`，于是**网络抖一下**就把它销毁了。
 *
 * 下面两条是同一段时序的差分：唯一的差别是刷新请求的失败形态。
 */
describe('会话结束 vs 只是拿不到票据', () => {
  const loginAliceWithKey = async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(loginEnvelope({ nickname: 'alice' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })
    vi.spyOn(profileApi, 'getProfile').mockResolvedValue(profileOf('alice', 'Alice', null))
    await useProfileStore.getState().loadProfile()
    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-alice', useCustomApi: true })
    // 正对照：密钥确实落了盘。没有这一段，下面的"还在"可能只是从没写进去过。
    expect(localStorage.getItem('api-config-storage')).toContain('sk-alice')
  }

  it('刷新时网络断了：票据清掉，用户自备的 aiApiKey 一个字节都不动', async () => {
    await loginAliceWithKey()

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow()

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-alice')
    expect(useApiConfigStore.getState().useCustomApi).toBe(true)
    expect(localStorage.getItem('api-config-storage')).toContain('sk-alice')
    // 同一个人的资料也没被毁：他重新登录后侧栏、草稿、AI 配置都在原处
    expect(useProfileStore.getState().profile?.user_nickname).toBe('Alice')
  })

  it('刷新端点回 401：这才是会话结束，密钥跟着账号一起消失', async () => {
    await loginAliceWithKey()

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, code: 401, error: 'Token 无效或已过期' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow()

    expect(useApiConfigStore.getState().aiApiKey).toBe('')
    expect(localStorage.getItem('api-config-storage')).toBeNull()
    expect(useProfileStore.getState().profile).toBeNull()
  })
})

/**
 * 登出并不取消飞在半空的请求。`endSession()` 是一个**时点**，它跑完之后落地的
 * `set()` 会把上一个人的数据重新写进内存并 persist 回盘。
 *
 * `loadProfile` 这一条尤其能看见后果：`Navigation` 挂在每个 `/app` 页面上，
 * 直接拿 `profileStore.profile` 渲染头像和昵称首字母。
 */
describe('登出那一刻还在飞的请求', () => {
  it('loadProfile 在 endSession 之后才返回：既不写内存也不写盘', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(loginEnvelope({ nickname: 'alice' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    let release!: (profile: UserProfile) => void
    vi.spyOn(profileApi, 'getProfile').mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        release = resolve
      }),
    )
    const inFlight = useProfileStore.getState().loadProfile()

    await useAuthStore.getState().logout()
    // 正对照：登出这一刻确实清干净了
    expect(useProfileStore.getState().profile).toBeNull()
    expect(localStorage.getItem('profile-storage')).toBeNull()

    release(profileOf('alice', 'Alice', 'avatars/alice.png'))
    await inFlight

    expect(useProfileStore.getState().profile).toBeNull()
    expect(localStorage.getItem('profile-storage')).toBeNull()
    // B 的屏幕上不会出现 A 的昵称首字母
    renderSidebar()
    expect(screen.queryByText('A')).toBeNull()
  })

  it('正对照：会话没结束时，同样的时序会正常写进 store 与盘', async () => {
    // 没有这一条，上面那条可以被"loadProfile 永远不写 store"骗过去。
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(loginEnvelope({ nickname: 'alice' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    let release!: (profile: UserProfile) => void
    vi.spyOn(profileApi, 'getProfile').mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        release = resolve
      }),
    )
    const inFlight = useProfileStore.getState().loadProfile()

    release(profileOf('alice', 'Alice', 'avatars/alice.png'))
    await inFlight

    expect(useProfileStore.getState().profile?.user_nickname).toBe('Alice')
    expect(localStorage.getItem('profile-storage')).toContain('Alice')
  })
})

/**
 * 换人这件事有**两个**时点：A 的会话结束，和 B 的会话开始。上面几组用例钉的都是
 * 前一个；这一组钉后一个——「一次写入必须属于当前活着的那一场会话」这条不变量
 * （定义在 `lib/sessionScope.ts` 顶部）在**会话开始**那一侧同样要成立。
 *
 * 三条都是同一个形状：A 在自己的会话里发出一个请求，请求还在飞的时候会话换人，
 * 响应落在 B 的会话里。三条分别走三条不同的路：刷新成功、内存副本、以及
 * 一份 `fetchWithAuth` 副本的 401 分支。
 */
describe('会话边界：属于上一场会话的写入落在 B 的会话里', () => {
  it('clearCredentials 之后 B 登录：A 那次刷新轮换出来的新 token 进不了 auth-storage', async () => {
    await loginAs('alice')

    const pending = deferredResponse()
    fetchMock.mockImplementationOnce(() => pending.promise)
    const aliceRefresh = useAuthStore.getState().refreshAccessToken()

    // 第三档：只丢票据、不结束会话，所以**不**经过 endSession()。
    useAuthStore.getState().clearCredentials()

    await loginAs('bob')
    // 正对照：B 的 token 确实落了盘。没有这一句，下面的 not.toContain
    // 可能只是因为 auth-storage 从头到尾就没被写过。
    expect(localStorage.getItem('auth-storage')).toContain('AT-bob')

    pending.release(
      jsonResponse({
        success: true,
        code: 200,
        data: { access_token: 'AT-ALICE-NEW', refresh_token: 'RT-ALICE-NEW', expires_in: 3600 },
      }),
    )
    const settled = await aliceRefresh.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    )

    expect(localStorage.getItem('auth-storage')).not.toContain('AT-ALICE-NEW')
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useAuthStore.getState().refreshToken).toBe('RT-bob')
    // 落地时那场会话已经不在了，所以这次刷新只能失败——它换回来的那对 token
    // 属于一个不再存在的人。
    expect(settled).toBe('rejected')
  })

  it('传输层刷新失败留下的内存副本（含明文 aiApiKey）进不了 B 的会话', async () => {
    await loginAs('alice')
    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-alice', useCustomApi: true })
    // 正对照：内存和盘上**都**确实有。缺内存那一句的话，下面的 toBe('') 可以被
    // "setApiConfig 根本没写进内存" 骗过去。
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-alice')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-alice')

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow()
    // 第三档确实没毁掉它——这正是它存在的理由，网络抖一下不该销毁一份
    // 只有用户自己知道、应用无从恢复的数据。
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-alice')

    await loginAs('bob')

    // 但它只能活到**下一场会话开始**为止：B 的 AI 请求不会带上 A 的 X-API-Key。
    expect(useApiConfigStore.getState().aiApiKey).toBe('')
    expect(useApiConfigStore.getState().useCustomApi).toBe(false)
    expect(localStorage.getItem('api-config-storage')).toBeNull()
  })

  it('A 登出前发出的请求在 B 的会话里才 401：不刷新、不登出、不清 B 的盘', async () => {
    await loginAs('alice')

    const pending = deferredResponse()
    fetchMock.mockImplementationOnce(() => pending.promise)
    const aliceDevices = authApi.getDevices()

    useAuthStore.getState().clearAuth()
    await loginAs('bob')
    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-bob', useCustomApi: true })

    // 正对照：B 的会话是活的，而且他的密钥确实落了盘。
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')

    // 这一条是给"万一真的去刷新了"准备的：刷新会失败，于是 401 分支会走到
    // clearAuth() + 清盘。它没被消费，正是下面 toHaveBeenCalledTimes(3) 的含义。
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    pending.release(
      jsonResponse({ success: false, code: 401, error: 'Token 无效或已过期' }, 401),
    )

    await expect(aliceDevices).rejects.toThrow()

    // 三次 fetch = alice 登录 + devices + bob 登录。第四次（刷新）没有发生，
    // 也就是说这条 401 一步都没往下走。
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-bob')
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('B 自己的刷新不会被 A 那一次还在飞的刷新代答', async () => {
    // 单飞锁（`refreshInFlight`）是 7ee0598 为压级联登出加的，它是模块级的，
    // 于是换人之后 B 的第一次刷新会拿到 A 那一次的 promise：A 失败 = B 失败，
    // 而每一份 fetchWithAuth 都把"刷新失败"当成"该登出了"。
    await loginAs('alice')

    const pending = deferredResponse()
    fetchMock.mockImplementationOnce(() => pending.promise)
    const aliceRefresh = useAuthStore.getState().refreshAccessToken()

    useAuthStore.getState().clearAuth()
    await loginAs('bob')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        code: 200,
        data: { access_token: 'AT-bob-2', refresh_token: 'RT-bob-2', expires_in: 3600 },
      }),
    )
    const bobRefresh = useAuthStore.getState().refreshAccessToken()

    // A 那一次现在才失败。
    pending.fail(new TypeError('Failed to fetch'))
    await expect(aliceRefresh).rejects.toThrow()

    // B 那一次是**另一个** promise，正常拿到自己的新 token。
    await bobRefresh
    expect(useAuthStore.getState().accessToken).toBe('AT-bob-2')
    expect(useAuthStore.getState().refreshToken).toBe('RT-bob-2')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('A 那一次迟到的结算不会把 B 的单飞锁槽位抹掉', async () => {
    // 上一条钉的是"B 不会拿到 A 的 promise"，这一条钉的是反方向：A 结算时那句
    // `refreshInFlight = null` 若不认自己占的是不是当前这个槽位，就会把 B 已经
    // 放进去的那一次抹掉——单飞锁在换人后的头一个 RTT 内失效，7ee0598 修掉的
    // 级联刷新（一批并发请求各发一次 refresh、互相作废对方的 token）原样复发。
    const aliceCall = deferredResponse()
    const bobCall = deferredResponse()

    await loginAs('alice')
    fetchMock.mockImplementationOnce(() => aliceCall.promise)
    const aliceRefresh = useAuthStore.getState().refreshAccessToken()

    useAuthStore.getState().clearAuth()
    await loginAs('bob')

    fetchMock.mockImplementationOnce(() => bobCall.promise)
    const bobRefresh = useAuthStore.getState().refreshAccessToken()
    // 到这里一共 4 次 fetch：alice 登录、alice 刷新、bob 登录、bob 刷新。
    expect(fetchMock).toHaveBeenCalledTimes(4)

    // A 那一次现在才落地并结算（会话已经不是它那一场，所以 reject）。
    aliceCall.release(
      jsonResponse({
        success: true,
        code: 200,
        data: { access_token: 'AT-ALICE-NEW', refresh_token: 'RT-ALICE-NEW', expires_in: 3600 },
      }),
    )
    await expect(aliceRefresh).rejects.toThrow(/session end/)

    // B 的槽位必须还在：他的并发调用者继续共享同一次请求，不另发。
    const alsoBob = useAuthStore.getState().refreshAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(4)

    bobCall.release(
      jsonResponse({
        success: true,
        code: 200,
        data: { access_token: 'AT-bob-2', refresh_token: 'RT-bob-2', expires_in: 3600 },
      }),
    )
    await Promise.all([bobRefresh, alsoBob])
    // 正对照：那一次共享的请求确实成功了，不是"根本没发过所以也没多发"。
    expect(useAuthStore.getState().accessToken).toBe('AT-bob-2')
  })
})

/**
 * 三个 store 的跨会话暴露面，端到端各钉一条。
 *
 * 逐个 action 的表驱动用例在各自的 store 测试里
 * （`friendsStore.test.ts` / `groupStore.test.ts` / `chatStore.test.ts` 的
 * 「跨会话边界」几组）。这里补的是**整条路**：真的走 `login` / `clearAuth` /
 * `login`，而不是 `useAuthStore.setState` 直接摆状态；`FriendList` 之类的渲染点
 * 读的正是这些 store 的内存副本。
 *
 * 审阅者复现这条 bug 时的原始形状就是下面第一条：登录 alice →
 * `friendsApi.getPendingRequests` 返回一个还没落地的 promise →
 * `loadPendingRequests()` → `clearAuth()` → 登录 bob → 让 A 的那一行落地。
 * 在 8c048b8 那棵树上它报的是
 * `expected [ { request_id: 'r1', …(5) } ] to deeply equal []`。
 */
describe('三个 store：上一场会话的响应落在 B 的会话里', () => {
  it('friendsStore：A 的待处理好友请求不会出现在 B 的内存里', async () => {
    await loginAs('alice')

    const pending = deferred<PendingRequest[]>()
    vi.spyOn(friendsApi, 'getPendingRequests').mockReturnValue(pending.promise)
    const inFlight = useFriendsStore.getState().loadPendingRequests()

    useAuthStore.getState().clearAuth()
    await loginAs('bob')

    // 正对照：B 确实登进来了，而且这一刻列表确实是空的——没有这两句，
    // 下面的 toEqual([]) 可能只是"这份数据从来没被写进去过"。
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useFriendsStore.getState().pendingRequests).toEqual([])

    pending.release([
      {
        request_id: 'r1',
        request_user_id: 'carol',
        request_message: 'A 的申请人',
        request_time: '2026-01-01T00:00:00Z',
        requester_nickname: 'Carol',
        requester_avatar_url: null,
      },
    ])
    await inFlight

    // 泄露的是申请人 ID、昵称和申请留言，`FriendList` 直接渲染它们。
    expect(useFriendsStore.getState().pendingRequests).toEqual([])
  })

  it('groupStore：A 那个群的成员名单不会出现在 B 的内存里', async () => {
    await loginAs('alice')

    const pending = deferred<{ members: GroupMember[]; total: number }>()
    vi.spyOn(groupsApi, 'getMembers').mockReturnValue(pending.promise)
    const inFlight = useGroupStore.getState().loadGroupMembers('alice-g1')

    useAuthStore.getState().clearAuth()
    await loginAs('bob')

    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useGroupStore.getState().currentGroupMembers).toEqual([])

    pending.release({
      members: [
        {
          user_id: 'alice-member',
          user_nickname: 'A 的群友',
          user_avatar_url: null,
          role: 'member',
          group_nickname: null,
          joined_at: '2026-01-01T00:00:00Z',
          join_method: 'search',
          muted_until: null,
        },
      ],
      total: 1,
    })
    await inFlight

    expect(useGroupStore.getState().currentGroupMembers).toEqual([])
  })

  it('chatStore：A 的私聊正文不会写进 B 那条同名会话', async () => {
    // 本地会话 id 会撞：A 和 B 各自都跟 carol 聊过，两边那条会话的本地 id
    // 都是 'carol'，而反查表是**发请求时**建的（属于 A）。
    await loginAs('alice')
    const carolConv = { id: 'carol', type: 'friend' as const, name: 'Carol', unreadCount: 0 }
    useChatStore.getState().setConversations([carolConv])

    let capturedId = ''
    const pending = deferred<SyncMessagesResponse>()
    vi.spyOn(messagesApi, 'syncMessages').mockImplementation((requests) => {
      capturedId = requests[0].conversation_id
      return pending.promise
    })
    const inFlight = useChatStore.getState().syncMessages()
    await vi.waitFor(() => expect(capturedId).not.toBe(''))

    useAuthStore.getState().clearAuth()
    await loginAs('bob')
    useChatStore.getState().setConversations([carolConv])

    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useChatStore.getState().conversations[0]).toEqual(carolConv)

    pending.release({
      conversations: [
        {
          conversation_id: capturedId,
          conversation_type: 'friend',
          messages: [
            {
              message_uuid: 'm-alice-carol',
              sender_id: 'carol',
              receiver_id: 'alice',
              message_content: 'A 和 carol 的私聊内容',
              message_type: 'text',
              file_uuid: null,
              file_url: null,
              file_size: null,
              file_hash: null,
              filename: null,
              content_type: null,
              image_width: null,
              image_height: null,
              seq: 999,
              send_time: '2026-09-07T03:00:00Z',
            },
          ],
          latest_seq: 999,
          has_more: false,
        },
      ],
    })
    await expect(inFlight).rejects.toThrow(/session end/)

    expect(useChatStore.getState().conversations[0]).toEqual(carolConv)
  })

  it('friendsStore：A 的 401 不会调到 B 的 clearAuth()', async () => {
    // `handleApiError` 的认证分支带一个**写入之外的副作用**：
    // `silentRedirectToLogin()` → `clearAuth()` → 反向名单清盘。
    // 只挡住 `set()` 的话这一条依然会把刚登录的 B 连同他的 aiApiKey 清掉。
    await loginAs('alice')

    const pending = deferred<PendingRequest[]>()
    vi.spyOn(friendsApi, 'getPendingRequests').mockReturnValue(pending.promise)
    const inFlight = useFriendsStore.getState().loadPendingRequests()

    useAuthStore.getState().clearAuth()
    await loginAs('bob')
    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-bob', useCustomApi: true })

    // 正对照：B 的密钥确实落了盘。
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')

    pending.fail(
      new ApiError('未认证或 Token 无效', {
        status: 401,
        code: 401,
        endpoint: 'GET /api/friends/requests/pending',
      }),
    )
    await expect(inFlight).rejects.toThrow('未认证或 Token 无效')

    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-bob')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')
  })
})

/**
 * `apiClient` 曾经在 `authStore.refreshInFlight` **之上**还压着第二把单飞锁
 * （模块级的 `isRefreshing` / `refreshPromise`），而只有下面那一把是会话内的。
 * 于是 B 自己的 401 会拿到 A 那一次的刷新 promise：A 断网 = B 被登出。
 *
 * 修法是把上面那把删掉（去重本来就发生在下面那个漏斗里），所以这条用例同时也是
 * 「别再加回来」的守门人。
 */
describe('apiClient 的刷新去重只有一把锁，而且是会话内的', () => {
  it('B 自己的 401 不会被 A 那一次 apiClient 刷新代答', async () => {
    await loginAs('alice')

    // A 的请求收到 401 → `tryRefreshToken()` → 刷新请求挂起。
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
    const aliceRefreshCall = deferredResponse()
    fetchMock.mockImplementationOnce(() => aliceRefreshCall.promise)
    const aliceReq = fetchWithAuth(`${getApiBaseUrl()}/api/friends`)
    // 等到 A 的刷新**真的**发出去了：alice 登录 + A 的请求 + A 的刷新 = 3 次。
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    useAuthStore.getState().clearAuth()
    await loginAs('bob')
    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-bob', useCustomApi: true })
    // 正对照：B 的密钥确实落了盘。
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')

    // B 自己的一次 401：应当由 **B 自己的**刷新来回答，然后原样重发。
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        code: 200,
        data: { access_token: 'AT-bob-2', refresh_token: 'RT-bob-2', expires_in: 3600 },
      }),
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, code: 200, data: [] }))
    const bobReq = fetchWithAuth(`${getApiBaseUrl()}/api/friends`)

    // A 那一次现在才失败（断网）。加回那把模块级锁的话，这一句会同时判决 B：
    // 实测是 `isAuthenticated=false`、`accessToken=null`、`api-config-storage=null`。
    aliceRefreshCall.fail(new TypeError('Failed to fetch'))
    await expect(aliceReq).rejects.toThrow()

    const bobResponse = await bobReq
    expect(bobResponse.status).toBe(200)
    expect(useAuthStore.getState().accessToken).toBe('AT-bob-2')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-bob')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')
  })
})
