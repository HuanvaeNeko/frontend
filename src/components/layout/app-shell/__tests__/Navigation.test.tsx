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
 * 所以本文件钉的是：**空值一律不渲染 `<img>`**，有值时逐字渲染。
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

  it('profile 没有头像时回落到 authStore 那份（它在登录时已补过基址）', () => {
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
})
