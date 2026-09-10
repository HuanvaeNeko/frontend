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
import { ApiError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { useApiConfigStore } from '@/store/apiConfig'
import { useWSStore } from '@/store/wsStore'
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

// 会话制下 `authStore.login` 打的是同源 BFF，响应形状是 `{data: {user}}`——
// 没有 token 三件套。这里的 nickname 参数同时兼作 user_id：全部调用点
// （`loginAs` / 下面手写的三处）都是 `nickname === credentials.user_id`，
// 与迁移前的写法保持一致。
const loginEnvelope = (user: { nickname: string; avatar?: string }) => ({
  success: true,
  code: 200,
  data: {
    user: {
      user_id: user.nickname,
      nickname: user.nickname,
      email: `${user.nickname}@example.com`,
      avatar_url: user.avatar,
    },
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
    // 因为它们从来没被写进去过。会话制下 auth-storage 只落 `user`（没有 token
    // 可落了），断言换成检查 user_id 字符串本身。
    expect(localStorage.getItem('profile-storage')).toContain('Alice')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-alice')
    expect(localStorage.getItem('auth-storage')).toContain('alice')

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
 * 「会话结束」和「这一次问不到 BFF」是两件事，而它们的错误代价**不对称**：
 * 清少了会泄露给下一个人，清多了会毁掉一份不可恢复的数据——
 * `api-config-storage` 里的 `aiApiKey` 是用户自己敲进去的第三方密钥，
 * 只有他知道，应用无从恢复。此前（refreshAccessToken 时代）这个分档钉在刷新
 * 的 catch 上；BFF 会话层落地后客户端不再持有任何 token，`refreshAccessToken`
 * 整个被删掉，同一个分档现在钉在 `restoreSession` 上——它的 401 分支
 * （会话结束）与 502 / 网络失败分支（只是问不到）在 `authStore.test.ts` 已经
 * 各自钉过 authStore 自己的状态，这里补的是**跨 store** 那一半：`clearAuth()`
 * 触发的反向名单清盘是否真的只在 401 时发生。
 *
 * 下面两条是同一段时序的差分：唯一的差别是 `GET /api/session` 的响应。
 */
describe('会话结束 vs 只是问不到 BFF', () => {
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

  it('restoreSession 网络断了：不登出，用户自备的 aiApiKey 一个字节都不动', async () => {
    await loginAliceWithKey()

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-alice')
    expect(useApiConfigStore.getState().useCustomApi).toBe(true)
    expect(localStorage.getItem('api-config-storage')).toContain('sk-alice')
    // 同一个人的资料也没被毁：侧栏、草稿、AI 配置都在原处
    expect(useProfileStore.getState().profile?.user_nickname).toBe('Alice')
  })

  it('restoreSession 收到 401：这才是会话结束，密钥跟着账号一起消失', async () => {
    await loginAliceWithKey()

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, code: 401, error: '会话已失效，请重新登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
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

// ⚠️ 「会话边界：属于上一场会话的写入落在 B 的会话里」曾经是一整组（四条）
// 钉在这里：`clearCredentials` 之后 B 登录、传输层刷新失败留下的内存副本、
// B 自己的刷新不被 A 代答、A 迟到的结算不抹掉 B 的单飞锁槽位——四条钉的
// 全部是 `refreshAccessToken` 的单飞锁（`refreshInFlight`）与会话世代号
// （`isSameSession`）如何在**换人**这个时点互相保护。
//
// BFF 会话层落地后 `refreshAccessToken` / `clearCredentials` / `refreshInFlight`
// 整个被删掉——客户端手里已经没有 token，也没有单飞锁可言，这四条钉的漏洞
// 连成因都不存在了：没有刷新调用，就没有"A 那次还在飞的刷新落在 B 的会话里"
// 这回事。`restoreSession` 是它在会话制下唯一的近亲，但它没有单飞锁（今天也
// 没有并发调用点会撞上它），四条里"单飞锁跨会话代答/被抹掉"的核心断言在这个
// 前提下无从复现。
//
// 与本文件顶部"⚠️ 三个 store 的跨会话暴露面…"那条同一个模式：Task 11 之后
// `fetchWithAuth` 退化成同源裸 fetch，不再按会话世代号分诊 401——见
// `authedFetch.test.ts` 顶部对 `sessionScopedFetchWithAuth.test.ts` 的说明。

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
    expect(useAuthStore.getState().user?.user_id).toBe('bob')
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

    expect(useAuthStore.getState().user?.user_id).toBe('bob')
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

    expect(useAuthStore.getState().user?.user_id).toBe('bob')
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

    expect(useAuthStore.getState().user?.user_id).toBe('bob')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-bob')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-bob')
  })
})

// ⚠️ 「apiClient 的刷新去重只有一把锁，而且是会话内的」曾经钉在这里：直接调
// `fetchWithAuth` 两次，验证 B 自己的 401 不会被 A 那一次还在飞的刷新代答。
// Task 11 把 `fetchWithAuth` 退化成同源裸 fetch 之后，它不再在 401 上发起任何
// 刷新——这条用例守的那个漏洞（模块级单飞锁跨会话代答）连成因都不存在了：
// 没有刷新调用，就没有可以被跨会话代答的刷新 promise。`authStore.refreshInFlight`
// 自身的会话内去重仍由 `authStore` 的测试覆盖，与 `fetchWithAuth` 无关。
