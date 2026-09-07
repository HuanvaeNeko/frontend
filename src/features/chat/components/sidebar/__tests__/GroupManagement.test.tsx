import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Group, GroupMember, GroupNotice, JoinRequest } from '@/features/chat/api/groups'
import GroupManagement from '../GroupManagement'

/**
 * 三个吞异常调用点之三（GroupManagement 的 loadMembers/loadNotices/
 * loadJoinRequests）此前都是 `catch (err) { console.error(...) }`——请求失败
 * 和"这个群/这次查询真的没有数据"渲染出同一句"暂无 XXX"，用户和监控都看不
 * 出区别。8ee9115 把三者都改成 loading/空/失败三态分开渲染，但直到本文件
 * 之前，`GroupManagement.test.tsx` 根本不存在：production 代码有三态，
 * 测试仍然是零。
 *
 * 本文件直接渲染组件（`groupsApi` 用 vi.mock 打到调用边界，不进它的内部
 * 解包逻辑——那部分已经在 groups.test.ts 里覆盖），对成员/公告/加入申请
 * 三个列表分别断言 loading / 空 / 失败三态互不相同。关键断言：失败态绝不能
 * 和空态渲染出同一段文案——一个测试如果在 promise 被拒绝时也能通过并显示
 * "暂无成员"，就没有测出任何东西。
 */

const { groupsApiMock, toastMock, authState } = vi.hoisted(() => ({
  groupsApiMock: {
    getGroupDetail: vi.fn(),
    getMembers: vi.fn(),
    getNotices: vi.fn(),
    getJoinRequests: vi.fn(),
    approveJoinRequest: vi.fn(),
    rejectJoinRequest: vi.fn(),
    leaveGroup: vi.fn(),
    disbandGroup: vi.fn(),
    updateGroup: vi.fn(),
    updateJoinMode: vi.fn(),
    uploadGroupAvatar: vi.fn(),
    inviteMembers: vi.fn(),
    removeMember: vi.fn(),
    setAdmin: vi.fn(),
    removeAdmin: vi.fn(),
    muteMember: vi.fn(),
    unmuteMember: vi.fn(),
    transferOwner: vi.fn(),
    createNotice: vi.fn(),
    deleteNotice: vi.fn(),
  },
  toastMock: vi.fn(),
  authState: { user: { user_id: 'me' } as { user_id: string } | null },
}))

vi.mock('@/features/chat/api/groups', async () => {
  const actual = await vi.importActual<typeof import('@/features/chat/api/groups')>('@/features/chat/api/groups')
  return { ...actual, groupsApi: groupsApiMock }
})

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: () => authState,
}))

const GROUP: Group = {
  group_id: 'g1',
  group_name: '测试群',
  group_avatar_url: '',
  group_description: '',
  member_count: 1,
  status: 'active',
  join_mode: 'approval_required',
  created_at: '2026-01-01T00:00:00Z',
}

const OWNER_MEMBER: GroupMember = {
  user_id: 'me',
  user_nickname: '我',
  user_avatar_url: null,
  role: 'owner',
  group_nickname: null,
  joined_at: '2026-01-01T00:00:00Z',
  join_method: 'create',
  muted_until: null,
}

const NOTICE: GroupNotice = {
  id: 'n1',
  title: '欢迎',
  content: '欢迎加入群聊',
  publisher_id: 'me',
  publisher_nickname: '我',
  published_at: '2026-01-01T00:00:00Z',
  is_pinned: false,
  updated_at: '2026-01-01T00:00:00Z',
}

const REQUEST: JoinRequest = {
  request_id: 'r1',
  user_id: 'u2',
  user_nickname: '小李',
  user_avatar_url: undefined,
  message: null,
  reason: '想加入',
  created_at: '2026-01-01T00:00:00Z',
}

/** 一个可以从测试代码手动 resolve/reject 的 promise，用来钉住"加载中"这一帧。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  Object.values(groupsApiMock).forEach(fn => fn.mockReset())
  toastMock.mockReset()
  authState.user = { user_id: 'me' }
  // 默认：群信息立刻返回，不然顶层 `loading` 永远是 true，标签页和三态内容
  // 根本不会挂载。
  groupsApiMock.getGroupDetail.mockResolvedValue(GROUP)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GroupManagement 成员列表三态（loadMembers → membersError）', () => {
  it('加载中：既不是"暂无成员"也不是失败文案', async () => {
    const membersDeferred = deferred<{ members: GroupMember[]; total: number }>()
    groupsApiMock.getMembers.mockReturnValue(membersDeferred.promise)
    groupsApiMock.getNotices.mockResolvedValue([])

    const { container } = render(<GroupManagement groupId="g1" />)
    ;(await screen.findByText('成员管理')).click()

    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeTruthy())
    expect(screen.queryByText('暂无成员')).not.toBeInTheDocument()
    expect(screen.queryByText(/加载成员失败/)).not.toBeInTheDocument()

    membersDeferred.resolve({ members: [], total: 0 })
    await waitFor(() => expect(screen.getByText('暂无成员')).toBeInTheDocument())
  })

  it('请求失败：显示"加载成员失败：<原因>" + 重试按钮，绝不是"暂无成员"', async () => {
    groupsApiMock.getMembers.mockRejectedValueOnce(new Error('网络错误，请稍后重试'))
    groupsApiMock.getNotices.mockResolvedValue([])

    render(<GroupManagement groupId="g1" />)
    ;(await screen.findByText('成员管理')).click()

    await waitFor(() => expect(screen.getByText('加载成员失败：网络错误，请稍后重试')).toBeInTheDocument())
    expect(screen.getByText('重试')).toBeInTheDocument()
    expect(screen.queryByText('暂无成员')).not.toBeInTheDocument()
  })

  it('真正的空列表：显示"暂无成员"，不显示错误或重试', async () => {
    groupsApiMock.getMembers.mockResolvedValueOnce({ members: [], total: 0 })
    groupsApiMock.getNotices.mockResolvedValue([])

    render(<GroupManagement groupId="g1" />)
    ;(await screen.findByText('成员管理')).click()

    await waitFor(() => expect(screen.getByText('暂无成员')).toBeInTheDocument())
    expect(screen.queryByText('重试')).not.toBeInTheDocument()
    expect(screen.queryByText(/加载成员失败/)).not.toBeInTheDocument()
  })

  it('成功：渲染真实成员数据（姓名），不是"没抛错"就算数', async () => {
    groupsApiMock.getMembers.mockResolvedValueOnce({ members: [OWNER_MEMBER], total: 1 })
    groupsApiMock.getNotices.mockResolvedValue([])

    render(<GroupManagement groupId="g1" />)
    ;(await screen.findByText('成员管理')).click()

    // "我"在头像兜底（displayName[0]）和成员名两处都会出现（单字昵称的头像
    // 首字母就是它本身），用 getAllByText 而不是 getByText 避免"多个元素"报错。
    await waitFor(() => expect(screen.getAllByText('我').length).toBeGreaterThan(0))
    expect(screen.queryByText('暂无成员')).not.toBeInTheDocument()
    expect(screen.queryByText(/加载成员失败/)).not.toBeInTheDocument()
  })
})

describe('GroupManagement 公告列表三态（loadNotices → noticesError）', () => {
  it('加载中：既不是"暂无公告"也不是失败文案', async () => {
    const noticesDeferred = deferred<GroupNotice[]>()
    groupsApiMock.getMembers.mockResolvedValue({ members: [], total: 0 })
    groupsApiMock.getNotices.mockReturnValue(noticesDeferred.promise)

    const { container } = render(<GroupManagement groupId="g1" />)
    ;(await screen.findByText('群公告')).click()

    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeTruthy())
    expect(screen.queryByText('暂无公告')).not.toBeInTheDocument()
    expect(screen.queryByText(/加载公告失败/)).not.toBeInTheDocument()

    noticesDeferred.resolve([])
    await waitFor(() => expect(screen.getByText('暂无公告')).toBeInTheDocument())
  })

  it('请求失败：显示"加载公告失败：<原因>" + 重试按钮，绝不是"暂无公告"', async () => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [], total: 0 })
    groupsApiMock.getNotices.mockRejectedValueOnce(new Error('服务器错误'))

    render(<GroupManagement groupId="g1" />)
    ;(await screen.findByText('群公告')).click()

    await waitFor(() => expect(screen.getByText('加载公告失败：服务器错误')).toBeInTheDocument())
    expect(screen.getByText('重试')).toBeInTheDocument()
    expect(screen.queryByText('暂无公告')).not.toBeInTheDocument()
  })

  it('真正的空列表：显示"暂无公告"，不显示错误或重试', async () => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [], total: 0 })
    groupsApiMock.getNotices.mockResolvedValueOnce([])

    render(<GroupManagement groupId="g1" />)
    ;(await screen.findByText('群公告')).click()

    await waitFor(() => expect(screen.getByText('暂无公告')).toBeInTheDocument())
    expect(screen.queryByText('重试')).not.toBeInTheDocument()
    expect(screen.queryByText(/加载公告失败/)).not.toBeInTheDocument()
  })

  it('成功：渲染真实公告数据（标题），不是"没抛错"就算数', async () => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [], total: 0 })
    groupsApiMock.getNotices.mockResolvedValueOnce([NOTICE])

    render(<GroupManagement groupId="g1" />)
    ;(await screen.findByText('群公告')).click()

    await waitFor(() => expect(screen.getByText('欢迎')).toBeInTheDocument())
    expect(screen.queryByText('暂无公告')).not.toBeInTheDocument()
    expect(screen.queryByText(/加载公告失败/)).not.toBeInTheDocument()
  })
})

describe('GroupManagement 加入申请三态（loadJoinRequests → requestsError）', () => {
  // 加入申请 tab 只对管理员可见，且挂载时的自动加载看的是挂载那一刻的
  // `isAdmin`（当时 `members` 还是空数组，必然是 false）——所以这里统一走
  // tab 里始终存在的"刷新"按钮手动触发，不依赖首次挂载的自动加载时序。
  const openRequestsTabAndRefresh = async () => {
    // 该标签按钮还挂着一个 badge（`joinRequests.length`）：数字 0 是 falsy 但
    // React 仍会把它渲染成一个独立的文本节点，导致按钮的拼接文本是
    // "加入申请0" 而不是精确的 "加入申请"，只能用前缀匹配。
    ;(await screen.findByText(/^加入申请/)).click()
    ;(await screen.findByText('刷新')).click()
  }

  beforeEach(() => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [OWNER_MEMBER], total: 1 })
    groupsApiMock.getNotices.mockResolvedValue([])
  })

  it('加载中：既不是"暂无加入申请"也不是失败文案', async () => {
    const requestsDeferred = deferred<JoinRequest[]>()
    groupsApiMock.getJoinRequests.mockReturnValue(requestsDeferred.promise)

    const { container } = render(<GroupManagement groupId="g1" />)
    await openRequestsTabAndRefresh()

    await waitFor(() => expect(container.querySelectorAll('.animate-spin').length).toBeGreaterThan(0))
    expect(screen.queryByText('暂无加入申请')).not.toBeInTheDocument()
    expect(screen.queryByText(/加载加入申请失败/)).not.toBeInTheDocument()

    requestsDeferred.resolve([])
    await waitFor(() => expect(screen.getByText('暂无加入申请')).toBeInTheDocument())
  })

  it('请求失败：显示"加载加入申请失败：<原因>" + 重试按钮，绝不是"暂无加入申请"', async () => {
    groupsApiMock.getJoinRequests.mockRejectedValueOnce(new Error('权限不足'))

    render(<GroupManagement groupId="g1" />)
    await openRequestsTabAndRefresh()

    await waitFor(() => expect(screen.getByText('加载加入申请失败：权限不足')).toBeInTheDocument())
    expect(screen.getByText('重试')).toBeInTheDocument()
    expect(screen.queryByText('暂无加入申请')).not.toBeInTheDocument()
  })

  it('真正的空列表：显示"暂无加入申请"，不显示错误或重试', async () => {
    groupsApiMock.getJoinRequests.mockResolvedValueOnce([])

    render(<GroupManagement groupId="g1" />)
    await openRequestsTabAndRefresh()

    await waitFor(() => expect(screen.getByText('暂无加入申请')).toBeInTheDocument())
    expect(screen.queryByText('重试')).not.toBeInTheDocument()
    expect(screen.queryByText(/加载加入申请失败/)).not.toBeInTheDocument()
  })

  it('成功：渲染真实申请数据（用户昵称），不是"没抛错"就算数', async () => {
    groupsApiMock.getJoinRequests.mockResolvedValueOnce([REQUEST])

    render(<GroupManagement groupId="g1" />)
    await openRequestsTabAndRefresh()

    await waitFor(() => expect(screen.getByText('小李')).toBeInTheDocument())
    expect(screen.queryByText('暂无加入申请')).not.toBeInTheDocument()
    expect(screen.queryByText(/加载加入申请失败/)).not.toBeInTheDocument()
  })
})
