import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { UnifiedConversation } from '@/features/chat/hooks/useUnifiedConversations'
import { UnifiedList } from '../UnifiedList'

/**
 * 本文件的断言直接写字面中文（不是 FriendList/GroupList 那种把 `t` mock 成回显
 * key 的写法），因为要证的是"文案真的说了那句话"(99+、[群聊]、取消置顶……)而不
 * 只是"接了某个 key"。所以这里对 `@/i18n/I18nProvider` 的 mock 让 `t` 对**真实**
 * `zhCN` 字典做路径查找，而不是新造一份平行的中文字符串——字典改了，这里跟着改，
 * 不会出现"组件测试还是绿的，但文案已经对不上 messages.ts"这种两份拷贝各说各话。
 *
 * 用动态 import 在工厂函数里取字典，而不是在文件顶层 `import { messages }`：
 * `vi.mock` 的工厂会被提升到所有 import 之前执行，顶层引用虽然通过模块求值顺序也
 * 能拿到值，但动态 import 不依赖这层隐含顺序，读起来也更直接。
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

const conv = (id: string, extra: Partial<UnifiedConversation> = {}): UnifiedConversation => ({
  id, kind: id.startsWith('f-') ? 'friend' : 'group', targetId: id.slice(2), name: id, avatarUrl: null,
  preview: null, lastMessageTime: null, unreadCount: 0, pinned: false, ...extra,
})

const noop = () => {}
const base = {
  status: 'ready' as const, selectedId: null, onSelect: noop, onTogglePin: noop, onMarkRead: noop,
  onRetry: noop, onCreateGroup: noop, onAddFriend: noop, onJoinGroup: noop,
}

describe('UnifiedList', () => {
  it('三态：loading / error（可重试）/ empty 各自渲染，且互斥', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<UnifiedList {...base} conversations={[]} status="loading" />)
    // loading 状态：加载中文案存在，其他两态文案缺席
    expect(screen.getByText('加载中...')).toBeInTheDocument()
    expect(screen.queryByText(/加载失败/)).toBeNull()
    expect(screen.queryByText(/还没有会话/)).toBeNull()
    rerender(<UnifiedList {...base} conversations={[]} status="error" error="网络断了" onRetry={onRetry} />)
    // error 状态：加载失败文案存在，其他两态文案缺席
    expect(screen.getByText(/加载失败/)).toBeInTheDocument()
    expect(screen.queryByText('加载中...')).toBeNull()
    expect(screen.queryByText(/还没有会话/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<UnifiedList {...base} conversations={[]} status="ready" />)
    // ready-empty 状态：空态文案存在，其他两态文案缺席
    expect(screen.getByText(/还没有会话/)).toBeInTheDocument()
    expect(screen.queryByText('加载中...')).toBeNull()
    expect(screen.queryByText(/加载失败/)).toBeNull()
  })

  it('卡片显示名字、预览、未读角标（99+ 截断）、[群聊] 标记与置顶标识', () => {
    render(
      <UnifiedList
        {...base}
        conversations={[
          conv('g-g1', { name: '读书会', preview: '张三: 明天见', unreadCount: 120, pinned: true }),
          conv('f-alice', { name: '小爱', preview: '在吗', unreadCount: 2 }),
        ]}
      />,
    )
    expect(screen.getByText('读书会')).toBeInTheDocument()
    expect(screen.getByText('张三: 明天见')).toBeInTheDocument()
    expect(screen.getByText('99+')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('[群聊]')).toBeInTheDocument()
    // 正对照：两张卡片只有一张置顶——getAllByTitle 恰好 1，证明标识不是恒渲染
    expect(screen.getAllByTitle('已置顶')).toHaveLength(1)
  })

  it('点击卡片回调 onSelect(id)；选中项带 data-selected', () => {
    const onSelect = vi.fn()
    render(<UnifiedList {...base} onSelect={onSelect} selectedId="f-alice" conversations={[conv('f-alice', { name: '小爱' }), conv('f-bob', { name: '小波' })]} />)
    fireEvent.click(screen.getByText('小波'))
    expect(onSelect).toHaveBeenCalledWith('f-bob')
    expect(screen.getByTestId('conversation-f-alice')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('conversation-f-bob')).toHaveAttribute('data-selected', 'false')
  })

  it('搜索框按名字与预览过滤（本地，不分大小写），无匹配时显示提示', () => {
    render(<UnifiedList {...base} conversations={[conv('f-alice', { name: 'Alice', preview: '在吗' }), conv('f-bob', { name: 'Bob', preview: '明天见' })]} />)
    fireEvent.change(screen.getByPlaceholderText('搜索会话'), { target: { value: 'ali' } })
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('搜索会话'), { target: { value: '明天' } })
    expect(screen.getByText('Bob')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('搜索会话'), { target: { value: 'zzz' } })
    expect(screen.getByText('没有匹配的会话')).toBeInTheDocument()
  })

  it('右键菜单：置顶/取消置顶文案随状态变，标记已读回调', async () => {
    const onTogglePin = vi.fn()
    const onMarkRead = vi.fn()
    render(<UnifiedList {...base} onTogglePin={onTogglePin} onMarkRead={onMarkRead} conversations={[conv('f-alice', { name: '小爱', pinned: true, unreadCount: 3 })]} />)
    fireEvent.contextMenu(screen.getByText('小爱'))
    fireEvent.click(await screen.findByText('取消置顶'))
    expect(onTogglePin).toHaveBeenCalledWith('f-alice')
    fireEvent.contextMenu(screen.getByText('小爱'))
    fireEvent.click(await screen.findByText('标记已读'))
    expect(onMarkRead).toHaveBeenCalledWith('f-alice')
  })

  it('「添加」菜单三项各自回调', async () => {
    const onCreateGroup = vi.fn(); const onAddFriend = vi.fn(); const onJoinGroup = vi.fn()
    render(<UnifiedList {...base} conversations={[]} onCreateGroup={onCreateGroup} onAddFriend={onAddFriend} onJoinGroup={onJoinGroup} />)
    // Radix DropdownMenuTrigger 在 happy-dom 下不响应裸 fireEvent.click(内部靠
    // onPointerDown 开合),要用 user-event 补全 pointerdown→pointerup→click 序列——
    // 这条和 Step 1 里针对菜单项 onSelect 的说明是同一件事,这里连 trigger 本身也中招。
    await userEvent.click(screen.getByRole('button', { name: '添加' }))
    await userEvent.click(await screen.findByText('创建群聊'))
    expect(onCreateGroup).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: '添加' }))
    await userEvent.click(await screen.findByText('添加好友'))
    expect(onAddFriend).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: '添加' }))
    await userEvent.click(await screen.findByText('加入群'))
    expect(onJoinGroup).toHaveBeenCalledTimes(1)
  })
})
