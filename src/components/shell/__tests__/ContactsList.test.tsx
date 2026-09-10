import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { ContactsList } from '../ContactsList'

// 旧的 FriendList / GroupList 只在「添加」与「申请」面板里复用：把它们换成探针，
// 断言渲染了哪个、subTab 是什么——不测它们的内部
vi.mock('@/features/chat/components/sidebar/FriendList', () => ({
  default: (p: { subTab: string }) => <div data-testid="friend-list" data-subtab={p.subTab} />,
}))
vi.mock('@/features/chat/components/sidebar/GroupList', () => ({
  default: (p: { subTab: string; initialCreateOpen?: boolean }) => <div data-testid="group-list" data-subtab={p.subTab} data-create={String(!!p.initialCreateOpen)} />,
}))

/**
 * 不 mock `@/i18n/I18nProvider` 的话，`useI18n()` 在没有 `<I18nProvider>` 包裹时
 * 落到 context 的默认值 `t: (key) => key`——本质就是一个恒等 mock，会让下面
 * 断言字面中文（搜索联系人 / 没有匹配的联系人）的用例落空。与 `UnifiedList.test.tsx`
 * / `Sidebar.test.tsx` 同一个理由、同一个写法：对真实 `zhCN` 字典做路径查找。
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
 * 路由结构按 `src/app/routes.ts` 里 `app/contacts` 之下真实的嵌套（`friends/:userId`、
 * `groups/:groupId`）搭建，不是单条 splat `/app/contacts/*`：`ContactsList` 读的是
 * `useParams()` 的 `userId`/`groupId`（spec 的「选中态只认路由」），而 RR 的
 * `useParams()` 取的是**当前分支最深一级匹配**的累计 params
 * （`matches[matches.length-1].params`，`node_modules/react-router/dist/development/lib/hooks.js`）。
 * 单条 splat 路由只会匹配出 `{'*': 'friends/alice'}`，没有 `userId` 这个键——
 * 已用一对最小复现脚本实测过这个区别（`Probe` 组件在两种路由结构下打印的
 * `useParams()`）：splat 路由拿到的是 `{"*":"friends/alice"}`，而下面这种父路由
 * 挂子路由的写法（即便父路由自己的 element 不渲染 `<Outlet/>`，父子也不在同一个
 * 组件里）拿到的是 `{"userId":"alice"}`——与生产路由树（`AppShellLayout` 不经过
 * 自己的 `<Outlet/>` 就能在 `list` 插槽里用 `useParams()` 读到 `conversationId`，
 * 见 `app-shell.tsx` 的 `ChatListColumn`）同一个机制。子路由的 `element` 内容本身
 * 从不渲染（`ContactsList` 不含 `<Outlet/>`），只用来让 RR 把这段 URL 匹配出
 * `userId`/`groupId`。
 */
const renderAt = (url: string) =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: '/app/contacts',
            element: <ContactsList />,
            children: [
              { path: 'friends/:userId', element: <div /> },
              { path: 'groups/:groupId', element: <div /> },
            ],
          },
        ],
        { initialEntries: [url] },
      )}
    />,
  )

const friend = (id: string, nickname: string, remark: string | null = null) => ({
  friend_id: id, friend_nickname: nickname, friend_avatar_url: null, add_time: '2026-01-01T00:00:00Z',
  approve_reason: null, friend_remark: remark, is_blacklisted: false, is_special_care: false,
})

describe('ContactsList', () => {
  beforeEach(() => {
    useFriendsStore.setState({ friends: [friend('alice', '爱丽丝', '小爱'), friend('bob', '鲍勃')], isLoading: false, error: null })
    useGroupStore.setState({ myGroups: [{ group_id: 'g1', group_name: '读书会', group_avatar_url: null, role: 'member', unread_count: null, last_message_content: null, last_message_time: null }] as never, isLoading: false })
  })

  it('默认好友 tab：每个好友一行，名字备注优先，链接到 /app/contacts/friends/:id，当前项 data-selected', () => {
    renderAt('/app/contacts/friends/alice')
    expect(screen.getByRole('link', { name: /小爱/ })).toHaveAttribute('href', '/app/contacts/friends/alice')
    expect(screen.getByRole('link', { name: /鲍勃/ })).toHaveAttribute('href', '/app/contacts/friends/bob')
    expect(screen.getByTestId('contact-f-alice')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('contact-f-bob')).toHaveAttribute('data-selected', 'false')
    expect(screen.queryByTestId('friend-list')).toBeNull()   // 没有 add 参数不渲染旧面板
  })

  it('?tab=groups：群行链接到 /app/contacts/groups/:id；?tab=requests：申请面板复用旧组件', () => {
    renderAt('/app/contacts?tab=groups')
    expect(screen.getByRole('link', { name: /读书会/ })).toHaveAttribute('href', '/app/contacts/groups/g1')
    expect(screen.queryByRole('link', { name: /小爱/ })).toBeNull()
    renderAt('/app/contacts?tab=requests')
    const lists = screen.getAllByTestId('friend-list').map((el) => el.getAttribute('data-subtab'))
    expect(lists).toEqual(['new', 'sent'])
    expect(screen.getByTestId('group-list')).toHaveAttribute('data-subtab', 'invites')
  })

  it('?add=friend / join-group / create-group 各自渲染对应旧面板', () => {
    renderAt('/app/contacts?add=friend')
    expect(screen.getByTestId('friend-list')).toHaveAttribute('data-subtab', 'new')
    renderAt('/app/contacts?tab=groups&add=join-group')
    expect(screen.getAllByTestId('group-list').at(-1)).toHaveAttribute('data-subtab', 'join')
    renderAt('/app/contacts?tab=groups&add=create-group')
    expect(screen.getAllByTestId('group-list').at(-1)).toHaveAttribute('data-create', 'true')
  })

  it('搜索框按名字过滤；无匹配给提示', () => {
    renderAt('/app/contacts')
    fireEvent.change(screen.getByPlaceholderText('搜索联系人'), { target: { value: '鲍' } })
    expect(screen.getByRole('link', { name: /鲍勃/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /小爱/ })).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('搜索联系人'), { target: { value: 'zzz' } })
    expect(screen.getByText('没有匹配的联系人')).toBeInTheDocument()
  })
})
