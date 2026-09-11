import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubViewport } from '@/components/shell/__tests__/viewportStub'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { usePinnedStore } from '@/features/chat/store/pinnedStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useWSStore } from '@/store/wsStore'
import AppShellLayout from '../app-shell'

/**
 * 同 Sidebar.test.tsx / AppShell.test.tsx：不 mock `@/i18n/I18nProvider` 的话
 * `useI18n()` 落到 context 默认值 `t: (key) => key`，断言不了字面中文（"添加"/
 * "标记已读"/"小爱"……）。对真实 `zhCN` 字典做路径查找，字典改了这里跟着改。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    const raw = typeof value === 'string' ? value : key
    if (!params) return raw
    return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

/**
 * 同 Sidebar.test.tsx：`SidebarMorePanel` 用 `AnimatePresence`/`motion.div` 做
 * 进/退场动画；真实动画在断言、或测试清理卸载组件时可能还没播完，happy-dom 的
 * `Animation.cancel()` 会抛一个没人 catch 的 `AbortError`，污染整个测试进程，
 * 与本文件要验证的接线逻辑无关。`forwardRef` 直通是因为 `SidebarMorePanel` 把
 * `ref` 转给它的 `motion.div`。
 */
vi.mock('framer-motion', async () => {
  const react = await import('react')
  type MotionProps = Record<string, unknown> & { children?: unknown }
  const stripMotionProps = ({
    initial: _initial,
    animate: _animate,
    exit: _exit,
    variants: _variants,
    transition: _transition,
    custom: _custom,
    layout: _layout,
    layoutId: _layoutId,
    children,
    ...rest
  }: MotionProps) => ({ rest, children })
  const passthrough = (tag: string) =>
    react.forwardRef(function MockMotionComponent(props: MotionProps, ref: React.Ref<unknown>) {
      const { rest, children } = stripMotionProps(props)
      return react.createElement(tag, { ...rest, ref }, children as React.ReactNode)
    })
  return {
    motion: new Proxy({} as Record<string, unknown>, {
      get: (_target, tag: string) => passthrough(tag),
    }),
    AnimatePresence: ({ children }: MotionProps) => children,
  }
})

const friend = (id: string, nickname: string, remark: string | null = null) => ({
  friend_id: id,
  friend_nickname: nickname,
  friend_avatar_url: null,
  add_time: '2026-01-01T00:00:00Z',
  approve_reason: null,
  friend_remark: remark,
  is_blacklisted: false,
  is_special_care: false,
})

/**
 * 路由结构按生产 `src/app/routes.ts` 简化：`AppShellLayout` 作为不带 path 的父
 * 元素（等价于 `layout()`），两条子路由只用占位内容——`AppShellLayout` 的列表栏
 * 由 `useShellTab()` 按 `pathname` 独立决定（不依赖子路由渲染了什么），子路由本身
 * 只用来让 `<Outlet/>` 匹配得上、不报"no route matched"。
 */
const renderShell = (initialPath: string) => {
  const router = createMemoryRouter(
    [
      {
        element: <AppShellLayout />,
        children: [
          { path: '/app/chat', element: <div>OUTLET</div> },
          { path: '/app/contacts', element: <div>CONTACTS</div> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

describe('AppShellLayout（app-shell.tsx 接线，终审 finding #8）', () => {
  // 类型从这两个带显式参数类型的初始化器推出：裸 `vi.fn()`（或 `ReturnType<typeof vi.fn>`
  // 这种不给类型参数的写法）会落到 `Mock<Procedure | Constructable>`，跟 WSState 上
  // `connect`/`sendMarkRead` 的具体函数签名对不上，喂给 `setState` 时 tsc 会报错。
  let sendMarkRead = vi.fn((_targetType: 'friend' | 'group', _targetId: string) => {})
  let connect = vi.fn(() => {})

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()

    useAuthStore.setState({ user: { user_id: 'me', nickname: 'Me', avatar_url: null } as never, isAuthenticated: true })
    useProfileStore.setState({ profile: null, loadProfile: vi.fn(async () => {}) })
    useFriendsStore.setState({
      friends: [friend('alice', '爱丽丝', '小爱')],
      isLoading: false,
      hasLoaded: true,
      error: null,
      pendingRequests: [],
      loadFriends: vi.fn(async () => {}),
      loadPendingRequests: vi.fn(async () => {}),
      loadSentRequests: vi.fn(async () => {}),
    })
    useGroupStore.setState({
      myGroups: [],
      isLoading: false,
      hasLoaded: true,
      error: null,
      loadMyGroups: vi.fn(async () => {}),
    })
    useChatStore.setState({
      unreadSummary: {
        total_count: 5,
        friend_unreads: [{ friend_id: 'alice', unread_count: 5, last_message_preview: '在吗', last_message_time: '2026-09-10T08:00:00Z' }],
        group_unreads: [],
      },
    })
    usePinnedStore.getState().reset()

    sendMarkRead = vi.fn((_targetType: 'friend' | 'group', _targetId: string) => {})
    connect = vi.fn(() => {})
    useWSStore.setState({ connect, sendMarkRead })
  })

  it('右键会话卡片点"标记已读"：发 WS mark_read 并清本地未读角标；正对照：点"置顶"不发 WS（finding #1）', async () => {
    stubViewport(1440)
    renderShell('/app/chat')
    const card = () => screen.getByTestId('conversation-f-alice')
    expect(within(card()).getByText('5')).toBeInTheDocument()

    fireEvent.contextMenu(screen.getByText('小爱'))
    fireEvent.click(await screen.findByText('标记已读'))
    expect(sendMarkRead).toHaveBeenCalledWith('friend', 'alice')
    expect(sendMarkRead).toHaveBeenCalledTimes(1)
    // chatStore.markRead 的效果可见：本地未读角标清零
    expect(within(card()).queryByText('5')).toBeNull()

    fireEvent.contextMenu(screen.getByText('小爱'))
    fireEvent.click(await screen.findByText('置顶'))
    // 正对照：置顶是完全不同的动作，不该触发 sendMarkRead
    expect(sendMarkRead).toHaveBeenCalledTimes(1)
  })

  it('"+" 菜单三项各自导航到字面 URL（finding #8）', async () => {
    stubViewport(1440)

    const first = renderShell('/app/chat')
    await userEvent.click(screen.getByRole('button', { name: '添加' }))
    await userEvent.click(await screen.findByText('添加好友'))
    await waitFor(() => expect(first.router.state.location.pathname + first.router.state.location.search).toBe('/app/contacts?add=friend'))
    first.unmount()

    const second = renderShell('/app/chat')
    await userEvent.click(screen.getByRole('button', { name: '添加' }))
    await userEvent.click(await screen.findByText('创建群聊'))
    await waitFor(() => expect(second.router.state.location.pathname + second.router.state.location.search).toBe('/app/contacts?tab=groups&add=create-group'))
    second.unmount()

    const third = renderShell('/app/chat')
    await userEvent.click(screen.getByRole('button', { name: '添加' }))
    await userEvent.click(await screen.findByText('加入群'))
    await waitFor(() => expect(third.router.state.location.pathname + third.router.state.location.search).toBe('/app/contacts?tab=groups&add=join-group'))
  })

  it('挂载后把当前路径写进 localStorage.last_visited_path（原 Navigation.tsx 的"上次访问路径"）', () => {
    stubViewport(1440)
    renderShell('/app/chat')
    expect(localStorage.getItem('last_visited_path')).toBe('/app/chat')
  })
})
