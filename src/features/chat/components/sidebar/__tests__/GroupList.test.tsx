import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GroupInvitation } from '@/features/chat/api/groups'
import GroupList from '../GroupList'

/**
 * 六个吞异常调用点之一：`loadInvitations`（`GroupList.tsx`）此前是
 * `catch (error) { console.error(...) }`——请求失败和"这个用户真的没有收到
 * 邀请"渲染出同一个画面（`noInvites` 空状态），用户和监控都看不出区别。
 * 这正是 `apiEnvelope.ts` 开篇讲的那类 bug 在 groups 模块的复现点之一
 * （scratchpad/groups-plan.md §6）。
 *
 * 本测试直接渲染组件，断言失败态、空态、成功态三者互不相同——只断言
 * "没有崩溃"或"渲染了点什么"不能证明三态被正确区分开。
 *
 * framer-motion 换成直通 mock：本组件的邀请列表用 `AnimatePresence` +
 * `motion.div` 做进场动画，而这里的数据是异步落地（`loadInvitations` 的
 * `useEffect`），真实动画在 `waitFor` 断言完成、测试清理卸载组件时还没跑完，
 * happy-dom 的 Animation.cancel() 会抛一个不会被任何人 catch 的
 * `AbortError`，污染整个测试进程（与本批要验证的信封解包逻辑无关，纯粹是
 * happy-dom 对 Web Animations API 的实现细节）。直通渲染成普通标签，
 * 不影响下面断言的文案/结构。
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
    function MockMotionComponent(props: MotionProps) {
      const { rest, children } = stripMotionProps(props)
      return react.createElement(tag, rest, children as React.ReactNode)
    }
  return {
    motion: new Proxy({} as Record<string, unknown>, {
      get: (_target, tag: string) => passthrough(tag),
    }),
    AnimatePresence: ({ children }: MotionProps) => children,
  }
})

const { groupStoreState, toastMock, getInvitationsMock } = vi.hoisted(() => ({
  groupStoreState: {
    myGroups: [] as unknown[],
    isLoading: false,
    selectionError: null as string | null,
    clearSelectionError: vi.fn(),
    createGroup: vi.fn(async () => ({ group_id: 'g1', group_name: 'x', created_at: '' })),
    loadMyGroups: vi.fn(async () => {}),
    selectGroup: vi.fn(),
  },
  toastMock: vi.fn(),
  getInvitationsMock: vi.fn(),
}))

vi.mock('@/features/chat/store/groupStore', () => ({
  useGroupStore: Object.assign(() => groupStoreState, { getState: () => groupStoreState }),
}))

vi.mock('@/features/chat/store/chatStore', () => ({
  useChatStore: () => ({ setSelectedConversation: vi.fn(), selectedConversation: null }),
}))

vi.mock('@/features/chat/api/groups', () => ({
  groupsApi: {
    getInvitations: getInvitationsMock,
    searchGroups: vi.fn(),
    applyToJoin: vi.fn(),
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
  },
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

// t 直接回显 key：断言与语言环境无关，且"这个文案还在不在"看得最清楚。
// `t` 提到 mock 工厂外层、每次 `useI18n()` 调用返回同一个引用，而不是内联在
// 返回对象里新建一个箭头函数——下面 selectionError→toast 的 useEffect 依赖
// 数组里就有 `t`，如果这里每次渲染给一个新引用，`selectionError` 有没有留在
// 依赖数组里就测不出来了（不管数组对不对，`t` 的引用变化都会让 effect 重跑）。
vi.mock('@/i18n/I18nProvider', () => {
  const t = (key: string) => key
  return { useI18n: () => ({ locale: 'zh', t }) }
})

const INVITATION: GroupInvitation = {
  request_id: 'r1',
  group_id: 'g1',
  group_name: 'Test Group',
  group_avatar_url: null,
  inviter_id: 'u1',
  inviter_nickname: 'Alice',
  inviter_avatar_url: null,
  message: null,
  created_at: '2026-01-01T00:00:00Z',
  expires_at: null,
}

beforeEach(() => {
  getInvitationsMock.mockReset()
  toastMock.mockReset()
  groupStoreState.selectionError = null
  groupStoreState.clearSelectionError.mockReset()
  groupStoreState.createGroup.mockClear()
  // 真实 store 里 `clearSelectionError` 会把 `selectionError` 写回 null——
  // mock 也照做，这样下面的测试才能断言"清除之后不会再弹一次 toast"，而不是
  // 因为 mock 本身什么都不做而巧合地只弹一次。
  groupStoreState.clearSelectionError.mockImplementation(() => {
    groupStoreState.selectionError = null
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GroupList 群邀请 tab 的三态', () => {
  it('请求失败：显示错误文案 + 重试按钮，绝不显示"暂无群邀请"', async () => {
    getInvitationsMock.mockRejectedValueOnce(new Error('网络错误，请稍后重试'))

    render(<GroupList subTab="invites" searchQuery="" />)

    await waitFor(() => expect(screen.getByText('网络错误，请稍后重试')).toBeInTheDocument())
    expect(screen.getByText('chat.groupList.retry')).toBeInTheDocument()
    // 失败态与空态互斥：不能两句话同屏，也不能把失败悄悄渲染成空态。
    expect(screen.queryByText('chat.groupList.noInvites')).not.toBeInTheDocument()
  })

  it('真正的空列表：显示"暂无群邀请"，不显示错误或重试', async () => {
    getInvitationsMock.mockResolvedValueOnce([])

    render(<GroupList subTab="invites" searchQuery="" />)

    await waitFor(() => expect(screen.getByText('chat.groupList.noInvites')).toBeInTheDocument())
    expect(screen.queryByText('chat.groupList.retry')).not.toBeInTheDocument()
  })

  it('成功：渲染真实邀请数据（行数与字段值），不是"没抛错"就算数', async () => {
    getInvitationsMock.mockResolvedValueOnce([INVITATION])

    render(<GroupList subTab="invites" searchQuery="" />)

    await waitFor(() => expect(screen.getByText('Test Group')).toBeInTheDocument())
    expect(screen.queryByText('chat.groupList.noInvites')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.groupList.retry')).not.toBeInTheDocument()
  })
})

/**
 * groupStore.selectGroup 的两处 `.catch(() => {})`：真正吞异常的不是这两个
 * catch 本身（它们只是防止 unhandled rejection），而是它们依赖
 * `loadGroupMembers`/`loadGroupNotices` 把失败写进 `selectionError` 并
 * rethrow，再由这里的 `useEffect` 消费成 toast。这条链此前零测试覆盖——
 * `selectionError`/`clearSelectionError` 在上面的 mock 里从一开始就存在，
 * 但从未被断言过。
 *
 * 按规则不 mock `groupsApi`：这里连 store 本身都是 mock 的（跟本文件其余
 * 测试一致），只测 `GroupList.tsx` 消费 `selectionError` 这一段 wiring——
 * store 自己把失败写进 `selectionError` 并 rethrow 这件事，由
 * `groupStore.ts` 的真实实现保证（`loadGroupMembers`/`loadGroupNotices`
 * 的 catch 分支），不在本文件重复验证。
 */
describe('GroupList selectionError → toast 消费（groupStore.selectGroup 失败提示）', () => {
  it('selectionError 出现时 toast 只弹一次，随后被清除', async () => {
    const { rerender } = render(<GroupList subTab="main" searchQuery="" />)
    expect(toastMock).not.toHaveBeenCalled()

    groupStoreState.selectionError = '加载群成员失败：网络错误'
    rerender(<GroupList subTab="main" searchQuery="" />)

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1))
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: '加载群成员失败：网络错误',
        variant: 'destructive',
      })
    )
    expect(groupStoreState.clearSelectionError).toHaveBeenCalledTimes(1)
    expect(groupStoreState.selectionError).toBeNull()

    // 清除之后，一次和 selectionError 无关的重渲染不应该让 toast 再弹一次——
    // 否则用户选中一个群会看到同一条错误反复弹出。
    rerender(<GroupList subTab="main" searchQuery="" />)
    expect(toastMock).toHaveBeenCalledTimes(1)
  })

  it('两次独立失败各弹一次 toast，不会被前一次"吃掉"', async () => {
    const { rerender } = render(<GroupList subTab="main" searchQuery="" />)

    groupStoreState.selectionError = '第一次失败'
    rerender(<GroupList subTab="main" searchQuery="" />)
    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1))

    groupStoreState.selectionError = '第二次失败'
    rerender(<GroupList subTab="main" searchQuery="" />)
    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(2))
    expect(toastMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ description: '第二次失败' })
    )
    expect(groupStoreState.clearSelectionError).toHaveBeenCalledTimes(2)
  })
})


describe('GroupList 建群对话框：join_mode 五档 → join_approval_required 布尔', () => {
  /** 打开建群对话框并填好群名。 */
  const openCreateDialog = async () => {
    fireEvent.click(await screen.findByText('chat.groupList.createGroup'))
    const nameInput = await screen.findByPlaceholderText('chat.groupList.enterGroupNamePlaceholder')
    fireEvent.change(nameInput, { target: { value: '我的群聊' } })
    return nameInput
  }

  it('只有两档，五档里被取消的那三档不再出现', async () => {
    render(<GroupList subTab="main" searchQuery="" />)
    await openCreateDialog()

    const select = screen.getByLabelText('chat.groupList.joinApprovalLabel') as HTMLSelectElement
    expect(Array.from(select.options).map(o => o.value)).toEqual(['required', 'open'])
    // 五档模型的三个 i18n key 已随类型一起删除（doc:64-75：invite_only /
    // admin_invite_only / closed 无替代）。
    expect(screen.queryByText('chat.groupList.joinModeInviteOnlyDesc')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.groupList.joinModeLabel')).not.toBeInTheDocument()
  })

  it('默认值是「需要审核」——与后端不传该字段时的默认一致（doc:60）', async () => {
    render(<GroupList subTab="main" searchQuery="" />)
    await openCreateDialog()

    expect(screen.getByLabelText('chat.groupList.joinApprovalLabel')).toHaveValue('required')

    fireEvent.click(screen.getByText('chat.groupList.create'))

    await waitFor(() => expect(groupStoreState.createGroup).toHaveBeenCalledTimes(1))
    expect(groupStoreState.createGroup).toHaveBeenCalledWith('我的群聊', undefined, true)
  })

  it('选「无需审核」时第三个实参是 false（不是字符串 "open"）', async () => {
    render(<GroupList subTab="main" searchQuery="" />)
    await openCreateDialog()

    fireEvent.change(screen.getByLabelText('chat.groupList.joinApprovalLabel'), {
      target: { value: 'open' },
    })
    fireEvent.click(screen.getByText('chat.groupList.create'))

    await waitFor(() => expect(groupStoreState.createGroup).toHaveBeenCalledTimes(1))
    expect(groupStoreState.createGroup).toHaveBeenCalledWith('我的群聊', undefined, false)
  })
})
