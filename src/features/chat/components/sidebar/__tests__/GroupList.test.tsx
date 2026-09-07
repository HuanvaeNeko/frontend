import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
vi.mock('@/i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'zh', t: (key: string) => key }),
}))

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
