import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { makeProfile } from '@/features/profile/api/__tests__/profileFixture'
import { Sidebar } from '../Sidebar'

/**
 * 不 mock `@/i18n/I18nProvider` 的话，`useI18n()` 在没有 `<I18nProvider>` 包裹时
 * 落到 context 的默认值 `t: (key) => key`——本质就是一个恒等 mock，会让下面所有
 * 断言字面中文（'消息'/'联系人'/'更多功能'……）的用例全部落空。跟 Task 4
 * （`UnifiedList.test.tsx`）同一个理由、同一个写法：对真实 `zhCN` 字典做路径查找，
 * 而不是新造一份平行的中文字符串——字典改了，这里跟着改。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

/**
 * framer-motion 换成直通 mock：`SidebarMorePanel` 用 `AnimatePresence` + `motion.div`
 * 做进/退场动画，而「钉住布局」那组用例会在动画播放中途触发下一次状态变化（例如
 * 面板刚打开就再点一次收起）。跟 `GroupList.test.tsx` 同一个理由：真实动画在
 * `waitFor` 断言完成、测试清理卸载组件时可能还没播完，happy-dom 的
 * `Animation.cancel()` 会抛一个没有人 catch 的 `AbortError`，污染整个测试进程，
 * 与本批要验证的拖拽归约逻辑无关。用 `forwardRef` 直通（而不是普通函数组件）是
 * 因为 `SidebarMorePanel` 把 `ref` 转给它的 `motion.div`，`Sidebar` 的"点面板外
 * 收起"逻辑靠这个 ref 判断点击是否落在面板内——普通函数组件接 `ref` 会静默丢失
 * 转发，还会让 React 报"Function components cannot be given refs"的警告。
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

const renderAt = (path: string, activeTab: 'chat' | 'contacts') =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <Sidebar activeTab={activeTab} /> }], { initialEntries: [path] })} />)

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    useChatStore.setState({ totalUnreadCount: 0 })
    useFriendsStore.setState({ pendingRequests: [] })
    useProfileStore.setState({ profile: makeProfile({ user_nickname: '爱丽丝', user_avatar_url: 'https://cdn.test/a.png' }) })
  })

  it('两个 tab 链接到 /app/chat 与 /app/contacts，当前 tab 带 aria-current', () => {
    renderAt('/app/chat', 'chat')
    expect(screen.getByRole('link', { name: '消息' })).toHaveAttribute('href', '/app/chat')
    expect(screen.getByRole('link', { name: '联系人' })).toHaveAttribute('href', '/app/contacts')
    expect(screen.getByRole('link', { name: '消息' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '联系人' })).not.toHaveAttribute('aria-current')
  })

  it('URL 与 activeTab 不一致时（模态框路由下会出现，URL 变了但记住的 tab 没变）：aria-current 与高亮都跟 activeTab 走，不跟 URL 走', () => {
    // /app/files 跟 chat/contacts 都不匹配，如果 aria-current 是靠 NavLink 自己按 URL
    // 算的，两个 tab 此刻都不会有 aria-current；这里两次都断言"有且仅有 activeTab
    // 指向的那个"，证明驱动它的是 prop 而不是 URL 匹配。
    const first = renderAt('/app/files', 'contacts')
    expect(screen.getByRole('link', { name: '联系人' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '消息' })).not.toHaveAttribute('aria-current')
    first.unmount()

    renderAt('/app/files', 'chat')
    expect(screen.getByRole('link', { name: '消息' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '联系人' })).not.toHaveAttribute('aria-current')
  })

  it('未读总数与待处理申请数各自成角标（99+ 截断）；为 0 时不渲染', () => {
    useChatStore.setState({ totalUnreadCount: 120 })
    useFriendsStore.setState({ pendingRequests: [{ request_id: 'r1' } as never, { request_id: 'r2' } as never] })
    const first = renderAt('/app/chat', 'chat')
    expect(screen.getByTestId('badge-chat')).toHaveTextContent('99+')
    expect(screen.getByTestId('badge-contacts')).toHaveTextContent('2')
    first.unmount()
    useChatStore.setState({ totalUnreadCount: 0 })
    useFriendsStore.setState({ pendingRequests: [] })
    renderAt('/app/chat', 'chat')
    expect(screen.queryByTestId('badge-chat')).toBeNull()
    expect(screen.queryByTestId('badge-contacts')).toBeNull()
  })

  it('头像链接到 /app/profile，用绝对地址渲染 img', () => {
    renderAt('/app/chat', 'chat')
    const avatar = screen.getByRole('link', { name: '个人资料' })
    expect(avatar).toHaveAttribute('href', '/app/profile')
    expect(avatar.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/a.png')
  })

  it('「更多」面板列出五个工具并链接到各自 URL；设置链接到 /app/settings', async () => {
    renderAt('/app/chat', 'chat')
    screen.getByRole('button', { name: '更多功能' }).click()
    expect(await screen.findByRole('link', { name: '视频会议' })).toHaveAttribute('href', '/app/meeting')
    expect(screen.getByRole('link', { name: '我的文件' })).toHaveAttribute('href', '/app/files')
    expect(screen.getByRole('link', { name: '机器人' })).toHaveAttribute('href', '/app/bots')
    expect(screen.getByRole('link', { name: '小程序' })).toHaveAttribute('href', '/app/miniapps')
    expect(screen.getByRole('link', { name: 'AI 助手' })).toHaveAttribute('href', '/app/ai-chat')
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/app/settings')
  })
})

describe('Sidebar：钉住布局', () => {
  it('localStorage 里钉住的工具出现在侧栏本体，「更多」面板只剩其余项并按存的顺序排', async () => {
    localStorage.setItem('huanvae.sidebar-layout', '{"pinned":["files"],"more":["ai","meeting","bots","miniapps"]}')
    renderAt('/app/chat', 'chat')
    const aside = within(screen.getByTestId('sidebar'))
    expect(aside.getByRole('link', { name: '我的文件' })).toHaveAttribute('href', '/app/files')
    screen.getByRole('button', { name: '更多功能' }).click()
    const panel = within(await screen.findByTestId('sidebar-more-panel'))
    expect(panel.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/app/ai-chat', '/app/meeting', '/app/bots', '/app/miniapps'])
    expect(panel.queryByRole('link', { name: '我的文件' })).toBeNull()
  })

  it('坏掉的布局值不影响渲染：回到默认（无钉住，五个都在面板里）', async () => {
    localStorage.setItem('huanvae.sidebar-layout', '{"pinned":"files"}')
    renderAt('/app/chat', 'chat')
    expect(within(screen.getByTestId('sidebar')).queryByRole('link', { name: '我的文件' })).toBeNull()
    screen.getByRole('button', { name: '更多功能' }).click()
    expect(within(await screen.findByTestId('sidebar-more-panel')).getAllByRole('link')).toHaveLength(5)
  })

  it('再点「更多」或点面板外收起', async () => {
    renderAt('/app/chat', 'chat')
    const more = screen.getByRole('button', { name: '更多功能' })
    more.click()
    expect(await screen.findByTestId('sidebar-more-panel')).toBeInTheDocument()
    more.click()
    await waitFor(() => expect(screen.queryByTestId('sidebar-more-panel')).toBeNull())
    more.click()
    await screen.findByTestId('sidebar-more-panel')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await waitFor(() => expect(screen.queryByTestId('sidebar-more-panel')).toBeNull())
  })

  it('Esc 收起面板并把焦点还给「更多」按钮', async () => {
    renderAt('/app/chat', 'chat')
    const more = screen.getByRole('button', { name: '更多功能' })
    more.click()
    const panel = await screen.findByTestId('sidebar-more-panel')
    expect(panel).toBeInTheDocument()
    // 打开时焦点应该移进面板
    expect(document.activeElement).toBe(panel)
    // 按 Escape
    fireEvent.keyDown(document, { key: 'Escape' })
    // 面板应该关闭
    await waitFor(() => expect(screen.queryByTestId('sidebar-more-panel')).toBeNull())
    // 焦点应该回到「更多」按钮
    expect(document.activeElement).toBe(more)
  })
})
