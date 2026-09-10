import { render, screen } from '@testing-library/react'
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

const renderAt = (path: string, activeTab: 'chat' | 'contacts') =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <Sidebar activeTab={activeTab} /> }], { initialEntries: [path] })} />)

describe('Sidebar', () => {
  beforeEach(() => {
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
