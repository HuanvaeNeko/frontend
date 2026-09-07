import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { DesktopSidebar } from '../Navigation'

/**
 * 侧栏头像是全仓**唯一**一个裸 `<img>` 的头像渲染点，另外两个走 Radix `<Avatar>`。
 * 这个差别是有后果的，两边都不能靠传闻：
 *
 * - Radix `<AvatarImage src="">`：1.2.6 的 `useImageLoadingStatus` 第一句就是
 *   `if (!src) { setLoadingStatus('error'); return }`，**不** `new window.Image()`、
 *   不发任何请求（`node_modules/@radix-ui/react-avatar/dist/index.mjs`）。
 * - 裸 `<img src="">`：没有那层短路。React 会打
 *   `An empty string ("") was passed to the src attribute`，浏览器还会把当前页面
 *   当成图片再下载一遍。而且这里没有 `<AvatarFallback>` 兜底，坏 src 留下的是碎图标。
 *
 * 所以本文件钉的是两件事：**空值一律不渲染 `<img>`**；有值时渲染出去的是
 * **绝对**地址。
 *
 * 存量相对路径现在有**两道**防线，本文件把它们分开钉，各自能被单独打红：
 * - `auth-storage` 的 persist migrate（`migrateAuthPersist`）把落盘的旧值搬成绝对；
 * - 本组件读的时候再过一次 `toAbsoluteApiUrl`（幂等，每次渲染重新求值），
 *   兜住迁移之后又变回相对的来源（换基址、将来新的写入点）。
 */

const renderSidebar = () =>
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '*', element: <DesktopSidebar /> }], {
        initialEntries: ['/app/chat'],
      })}
    />,
  )

const avatarImg = () => document.querySelector('img[alt="Avatar"]')

const PROFILE = {
  user_id: 'u1',
  user_nickname: '测试用户',
  user_email: null,
  user_signature: null,
  user_avatar_url: null as string | null,
  admin: 'false',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

/** React 19 dev 构建里那句警告的**原文**（`react-dom/cjs/react-dom-client.development.js`）。 */
const EMPTY_SRC_WARNING = 'An empty string ("") was passed to the %s attribute'

let consoleError: ReturnType<typeof vi.spyOn>

const emptySrcWarnings = () =>
  consoleError.mock.calls.filter((args: unknown[]) => String(args[0]).includes(EMPTY_SRC_WARNING))

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: null,
    isAuthenticated: true,
    tokenExpiry: Date.now() + 3600_000,
    user: { user_id: 'u1', nickname: '测试用户' },
  })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DesktopSidebar 的头像', () => {
  it('有绝对地址时逐字渲染成 <img src>', () => {
    // 正对照。没有它，下面几条「不渲染 img」在组件整个坏掉时也会绿。
    const src = `${getApiBaseUrl()}/avatars/u1.png?t=1706000000`
    useProfileStore.setState({ profile: { ...PROFILE, user_avatar_url: src } })

    renderSidebar()

    expect(avatarImg()?.getAttribute('src')).toBe(src)
  })

  it('正对照：裸 <img src=""> 确实会让 React 打出那句警告', () => {
    // 没有这一条，下一条的「没有警告」在 React 根本不警告、或 spy 没接上时同样会绿。
    // 顺带钉住 React 自己给的处方——「either do not render the element at all
    // or pass null」——正是下一条实现所做的事。
    render(<img src="" alt="control" />)

    expect(emptySrcWarnings().length).toBe(1)
  })

  it('profile 的头像是空串时不渲染 <img>，也不触发那句 React 警告', () => {
    // 空串会从落盘数据、后端样例（群模块两份样例给的就是 `""`）里进来。
    useProfileStore.setState({ profile: { ...PROFILE, user_avatar_url: '' } })

    renderSidebar()

    expect(avatarImg()).toBeNull()
    expect(document.querySelector('img[src=""]')).toBeNull()
    expect(emptySrcWarnings()).toEqual([])
    // 兜底块顶上，用户看到首字母而不是碎图标。
    expect(document.body.textContent).toContain('测')
  })

  it('两个来源都没有头像时同样不渲染 <img>', () => {
    useAuthStore.setState({ user: { user_id: 'u1', nickname: '测试用户' } })
    useProfileStore.setState({ profile: { ...PROFILE, user_avatar_url: null } })

    renderSidebar()

    expect(avatarImg()).toBeNull()
  })

  it('profile 没有头像时回落到 authStore 那份（已经是绝对地址时原样用，补基址幂等）', () => {
    // `||` 而不是 `??`：空串必须继续往后找，而不是被当成一个有效地址用掉。
    useAuthStore.setState({
      user: {
        user_id: 'u1',
        nickname: '测试用户',
        avatar_url: `${getApiBaseUrl()}/avatars/u1.png?t=1`,
      },
    })
    useProfileStore.setState({ profile: { ...PROFILE, user_avatar_url: '' } })

    renderSidebar()

    expect(avatarImg()?.getAttribute('src')).toBe(`${getApiBaseUrl()}/avatars/u1.png?t=1`)
  })

  it('存量 auth-storage（v0，相对路径）rehydrate 之后渲染出绝对地址', async () => {
    // 这不是假想的形状，是**当前线上每一个用户**的形状：给 `login` 加补基址的那个
    // 提交还在本分支上、没进 main；`refreshAccessToken` 也从不重写 `user`。
    // 所以存量落盘值就是后端原样给的相对路径。
    //
    // 它非空 ⇒ `||` 会选中它 ⇒ 本组件那个首字母兜底根本不会触发，用户拿到的正是
    // 兜底本该防住的碎图标（裸 `<img>` 会拿相对路径去请求前端自己的源）。
    //
    // 这一条走完整的 localStorage → rehydrate 链路，钉的是 **migrate 那一层**：
    // 把 `authStore` 的 `migrate: migrateAuthPersist` 拿掉 → 中间那条正对照红。
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: {
          accessToken: 'AT',
          refreshToken: null,
          tokenExpiry: Date.now() + 3600_000,
          isAuthenticated: true,
          user: { user_id: 'u1', nickname: '测试用户', avatar_url: 'avatars/u1.png?t=1' },
        },
        version: 0,
      }),
    )
    await useAuthStore.persist.rehydrate()
    // 迁移已经把落盘的相对路径搬成绝对地址——这一层要紧，因为落盘值还有一个
    // **不经过本组件**的消费点：`VideoMeeting` 把 `user?.avatar_url` 发给后端当
    // 会议里的头像地址，读时归一救不到那里。
    expect(useAuthStore.getState().user?.avatar_url).toBe(`${getApiBaseUrl()}/avatars/u1.png?t=1`)

    useProfileStore.setState({ profile: { ...PROFILE, user_avatar_url: null } })

    renderSidebar()

    expect(avatarImg()?.getAttribute('src')).toBe(`${getApiBaseUrl()}/avatars/u1.png?t=1`)
  })

  it('authStore 里就是相对路径时，读的时候补基址（不指望 migrate 跑过）', () => {
    // 第二道防线，单独钉：直接把相对路径 setState 进 store，绕开 persist / migrate。
    // migrate 只在版本号对不上时跑一次，且把值冻结在跑的那一刻的基址上——本项目会
    // 故意改基址（本地无 SNI 反代）。把 `avatarSrc` 上的 `toAbsoluteApiUrl` 拿掉 → 本条红。
    useAuthStore.setState({
      user: { user_id: 'u1', nickname: '测试用户', avatar_url: 'avatars/u1.png?t=3' },
    })
    useProfileStore.setState({ profile: { ...PROFILE, user_avatar_url: null } })

    renderSidebar()

    expect(avatarImg()?.getAttribute('src')).toBe(`${getApiBaseUrl()}/avatars/u1.png?t=3`)
  })

  it('profile 落盘的相对路径同样在读的时候补基址（不指望 persist migrate 跑过）', () => {
    // migrate 只在版本号对不上时跑一次，而且会把值冻结在跑的那一刻的基址上——
    // 本项目会故意改基址（本地无 SNI 反代）。读时归一每次渲染重新求值。
    useAuthStore.setState({ user: { user_id: 'u1', nickname: '测试用户' } })
    useProfileStore.setState({ profile: { ...PROFILE, user_avatar_url: 'avatars/u1.png?t=2' } })

    renderSidebar()

    expect(avatarImg()?.getAttribute('src')).toBe(`${getApiBaseUrl()}/avatars/u1.png?t=2`)
  })
})
