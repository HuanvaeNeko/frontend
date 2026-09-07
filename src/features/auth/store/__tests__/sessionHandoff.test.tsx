import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DesktopSidebar } from '@/components/layout/app-shell/Navigation'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { profileApi, type UserProfile } from '@/features/profile/api/profile'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
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

const profileOf = (userId: string, nickname: string, avatar: string | null): UserProfile => ({
  user_id: userId,
  user_nickname: nickname,
  user_email: `${nickname}@example.com`,
  user_signature: `${nickname} 的签名`,
  user_avatar_url: avatar,
  admin: 'false',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
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
