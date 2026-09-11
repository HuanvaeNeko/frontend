import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@/features/chat/store/chatStore'
import { AppShell } from '../AppShell'
import { stubViewport } from './viewportStub'

/**
 * 不 mock `@/i18n/I18nProvider` 的话，`useI18n()` 在没有 `<I18nProvider>` 包裹时
 * 落到 context 的默认值 `t: (key) => key`——本质就是一个恒等 mock，会让下面所有
 * 断言字面中文（'返回列表'/'消息'/'联系人'/'更多功能'/'我的文件'……）的用例全部落空。
 * 跟 `Sidebar.test.tsx` 同一个理由、同一个写法：对真实 `zhCN` 字典做路径查找，而
 * 不是新造一份平行的中文字符串——字典改了，这里跟着改。
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

const renderAt = (path: string, activeTab: 'chat' | 'contacts' | 'settings' = 'chat') =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <AppShell activeTab={activeTab} list={<div>LIST</div>}><div>CONTENT</div></AppShell> }], { initialEntries: [path] })} />)

describe('AppShell 的折叠', () => {
  beforeEach(() => useChatStore.setState({ selectedConversation: { id: 'alice', type: 'friend', name: '小爱', unreadCount: 0 } }))
  afterEach(() => vi.unstubAllGlobals())

  it('桌面：三栏都在，没有返回条与底部条', () => {
    stubViewport(1440)
    renderAt('/app/chat/f-alice')
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('list-column')).toHaveTextContent('LIST')
    expect(screen.getByTestId('content-column')).toHaveTextContent('CONTENT')
    expect(screen.queryByTestId('fold-back-bar')).toBeNull()
    expect(screen.queryByTestId('mobile-tab-bar')).toBeNull()
  })

  it('平板无选中：侧栏 + 列表，内容停在 hidden 容器里', () => {
    stubViewport(900)
    renderAt('/app/chat')
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('list-column')).toHaveTextContent('LIST')
    expect(screen.queryByTestId('content-column')).toBeNull()
    expect(screen.getByText('CONTENT').closest('[hidden]')).not.toBeNull()
  })

  it('平板有选中：侧栏 + 内容，顶部返回条链接回 /app/chat 并带会话名；列表不渲染', () => {
    stubViewport(900)
    renderAt('/app/chat/f-alice')
    expect(screen.getByTestId('content-column')).toHaveTextContent('CONTENT')
    expect(screen.queryByTestId('list-column')).toBeNull()
    const bar = screen.getByTestId('fold-back-bar')
    expect(bar).toHaveTextContent('小爱')
    expect(screen.getByRole('link', { name: '返回列表' })).toHaveAttribute('href', '/app/chat')
  })

  it('手机：没有侧栏，有底部条（聊天 / 联系人 / 更多）；有选中时底部条让位给内容', () => {
    stubViewport(390)
    const first = renderAt('/app/contacts', 'contacts')
    expect(screen.queryByTestId('sidebar')).toBeNull()
    const bar = screen.getByTestId('mobile-tab-bar')
    expect(bar).toHaveTextContent('消息')
    expect(bar).toHaveTextContent('联系人')
    expect(screen.getByRole('link', { name: '联系人' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '消息' })).not.toHaveAttribute('aria-current')
    first.unmount()
    renderAt('/app/contacts/friends/alice', 'contacts')
    expect(screen.queryByTestId('mobile-tab-bar')).toBeNull()
    expect(screen.getByRole('link', { name: '返回列表' })).toHaveAttribute('href', '/app/contacts')
  })

  it('手机：模态框路由（/app/files）+ 记住的 tab 时，高亮与 aria-current 一致（底部条 Link 而非 NavLink 驱动，终审 finding #9）', () => {
    stubViewport(390)
    // /app/files 跟 chat/contacts 的路径都不匹配：如果 aria-current 是 NavLink 自己
    // 按 URL 算的，两个 tab 此刻都不会有 aria-current；这里断言"有且仅有 activeTab
    // 指向的那个"，证明驱动它的是 activeTab 这个 prop，不是 URL 匹配。
    renderAt('/app/files', 'contacts')
    expect(screen.getByRole('link', { name: '联系人' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '消息' })).not.toHaveAttribute('aria-current')
  })

  it('手机「更多」列出五个工具 + 个人资料 + 设置', async () => {
    stubViewport(390)
    renderAt('/app/chat')
    screen.getByRole('button', { name: '更多功能' }).click()
    expect(await screen.findByRole('link', { name: '我的文件' })).toHaveAttribute('href', '/app/files')
    expect(screen.getByRole('link', { name: 'AI 助手' })).toHaveAttribute('href', '/app/ai-chat')
    expect(screen.getByRole('link', { name: '个人资料' })).toHaveAttribute('href', '/app/profile')
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/app/settings')
  })
})
