import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    updateJoinPolicy: vi.fn(),
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

/** `GET /{group_id}` 的 `GroupInfo`，八字段照抄 doc:175-190 的响应样例。 */
const GROUP: Group = {
  group_id: 'g1',
  group_name: '测试群',
  group_avatar_url: null,
  group_description: '',
  member_count: 1,
  status: 'active',
  creator_id: 'me',
  created_at: '2026-01-01T00:00:00Z',
  join_approval_required: true,
  admin_can_approve: true,
  card_share_scope: 'all_members',
  qr_show_scope: 'all_members',
  search_scope: 'everyone',
  allow_join_via_qr: true,
  allow_join_via_search: true,
  allow_join_via_referral: true,
}

const ADMIN_MEMBER: GroupMember = {
  user_id: 'me',
  user_nickname: '我',
  user_avatar_url: null,
  role: 'admin',
  group_nickname: null,
  joined_at: '2026-01-01T00:00:00Z',
  join_method: 'apply',
  muted_until: null,
}

/** 另一个管理员，用来验证「管理员不能动管理员」。 */
const OTHER_ADMIN: GroupMember = {
  user_id: 'u3',
  user_nickname: '老王',
  user_avatar_url: null,
  role: 'admin',
  group_nickname: null,
  joined_at: '2026-01-01T00:00:00Z',
  join_method: 'apply',
  muted_until: null,
}

/** 一个普通成员，作为「管理员能动谁」的对照组。 */
const PLAIN_MEMBER: GroupMember = {
  user_id: 'u4',
  user_nickname: '小张',
  user_avatar_url: null,
  role: 'member',
  group_nickname: null,
  joined_at: '2026-01-01T00:00:00Z',
  join_method: 'apply',
  muted_until: null,
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

/**
 * 一条主动申请。附言字段名是 `message`——后端从来没有过一个叫 `reason` 的
 * 响应字段（doc:1051 apply 请求体、doc:1367 SentJoinRequestInfo 都是 message；
 * `reason` 只是 `POST …/reject` 的**请求体**字段）。批 4 之前这个 fixture 用
 * 的是 `reason`，那是照着坏代码造的 mock：它让"UI 读错字段"这件事测不出来。
 */
const REQUEST: JoinRequest = {
  request_id: 'r1',
  user_id: 'u2',
  user_nickname: '小李',
  user_avatar_url: null,
  message: '想加入',
  request_type: 'search_apply',
  user_accepted: false,
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

/**
 * `loadGroupInfo` 此前是不带绑定的 `catch {}`：`getGroupDetail` 抛出的所有信息
 * ——后端原文（403「你不是本群成员」、404「群聊不存在」）与
 * `groupDetailResponse` 逐字段校验失败的精确文案（如
 * 「join_approval_required 缺失或不是布尔值」）——全部被吞掉，用户和监控看到的
 * 永远是同一句「加载群信息失败」。这是 `handleUpdateJoinPolicy` 已经修过的
 * 同一种症状（见那个 describe 块），这里补上对称的覆盖。
 */
describe('GroupManagement 群信息加载失败（loadGroupInfo）', () => {
  beforeEach(() => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [], total: 0 })
    groupsApiMock.getNotices.mockResolvedValue([])
  })

  it('后端错误原文能透出到 toast，不再是固定的"加载群信息失败"', async () => {
    groupsApiMock.getGroupDetail.mockRejectedValueOnce(
      Object.assign(new Error('你不是本群成员'), { name: 'ApiError', status: 403 }),
    )

    render(<GroupManagement groupId="g1" />)

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: '你不是本群成员', variant: 'destructive' }),
      ),
    )
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: '加载群信息失败' }),
    )
  })

  it('parser 校验错误（字段精确文案）与非 Error 的意外失败弹出不同的文案，不是同一句兜底', async () => {
    // parser 错误：groups.ts 的运行时校验（例如 joinPolicyOf 里 bool() 拿不到
    // 布尔值时）抛出的字段精确文案，是一个真正的 Error，message 就是诊断信息本身。
    groupsApiMock.getGroupDetail.mockRejectedValueOnce(
      new Error('join_approval_required 缺失或不是布尔值'),
    )

    const { unmount } = render(<GroupManagement groupId="g1" />)
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'join_approval_required 缺失或不是布尔值' }),
      ),
    )
    unmount()

    // 非 Error 的意外失败（`err instanceof Error` 为 false，模拟一种完全没预料到
    // 的失败形态）：退到通用兜底文案。这句必须和上面的 parser 精确文案不一样——
    // 否则两种成因完全不同的失败又会被渲染成同一个画面，就是本发现要修的问题。
    toastMock.mockReset()
    groupsApiMock.getGroupDetail.mockRejectedValueOnce('network down')
    render(<GroupManagement groupId="g2" />)
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: '加载群信息失败' }),
      ),
    )
  })
})

describe('GroupManagement 入群策略面板（批 3：五档 join_mode → 八字段 join-policy）', () => {
  beforeEach(() => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [OWNER_MEMBER], total: 1 })
    groupsApiMock.getNotices.mockResolvedValue([])
    groupsApiMock.getJoinRequests.mockResolvedValue([])
  })

  it('八个控件全部渲染，取值来自 getGroupDetail，不再有五档下拉框', async () => {
    groupsApiMock.getGroupDetail.mockResolvedValue({
      ...GROUP,
      join_approval_required: true,
      admin_can_approve: false,
      card_share_scope: 'admins',
      qr_show_scope: 'owner_only',
      search_scope: 'everyone',
      allow_join_via_qr: true,
      allow_join_via_search: false,
      allow_join_via_referral: true,
    })

    render(<GroupManagement groupId="g1" />)

    await screen.findByText('入群策略')

    expect(screen.getByLabelText(/需要入群审核/)).toBeChecked()
    expect(screen.getByLabelText(/允许管理员参与审核/)).not.toBeChecked()
    expect(screen.getByLabelText('谁能分享群卡片')).toHaveValue('admins')
    expect(screen.getByLabelText('谁能展示群二维码')).toHaveValue('owner_only')
    expect(screen.getByLabelText('谁能搜到这个群')).toHaveValue('everyone')
    expect(screen.getByLabelText('允许扫码加群')).toBeChecked()
    expect(screen.getByLabelText('允许搜索群 ID 加群')).not.toBeChecked()
    expect(screen.getByLabelText(/允许好友推荐加群/)).toBeChecked()

    // 已删除的五档模型不能有任何残留入口。
    expect(screen.queryByText('入群模式')).not.toBeInTheDocument()
    expect(screen.queryByText('仅管理员邀请')).not.toBeInTheDocument()
    expect(screen.queryByText('禁止入群')).not.toBeInTheDocument()
  })

  it('拨动开关只发那一个字段——未出现的字段由后端保持原值', async () => {
    groupsApiMock.updateJoinPolicy.mockResolvedValue({
      join_approval_required: false,
      admin_can_approve: true,
      card_share_scope: 'all_members',
      qr_show_scope: 'all_members',
      search_scope: 'everyone',
      allow_join_via_qr: true,
      allow_join_via_search: true,
      allow_join_via_referral: true,
    })

    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.click(screen.getByLabelText(/需要入群审核/))

    await waitFor(() => expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledTimes(1))
    expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledWith('g1', { join_approval_required: false })
  })

  it('三档 scope 下拉发的是自己那一个键和选中的档位', async () => {
    groupsApiMock.updateJoinPolicy.mockResolvedValue({
      ...GROUP,
      search_scope: 'owner_only',
    })

    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.change(screen.getByLabelText('谁能搜到这个群'), { target: { value: 'owner_only' } })

    await waitFor(() => expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledTimes(1))
    expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledWith('g1', { search_scope: 'owner_only' })
  })

  it('响应的完整八值回填面板（不是本地乐观拼接）', async () => {
    // 只改了 admin_can_approve，但服务端连带回了另外几个不同的值——
    // 面板必须显示服务端说的那一套。乐观拼接会让 qr_show_scope 停在旧值。
    groupsApiMock.updateJoinPolicy.mockResolvedValue({
      join_approval_required: false,
      admin_can_approve: false,
      card_share_scope: 'owner_only',
      qr_show_scope: 'admins',
      search_scope: 'owner_only',
      allow_join_via_qr: false,
      allow_join_via_search: false,
      allow_join_via_referral: false,
    })

    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.click(screen.getByLabelText(/允许管理员参与审核/))

    await waitFor(() => expect(screen.getByLabelText(/需要入群审核/)).not.toBeChecked())
    expect(screen.getByLabelText(/允许管理员参与审核/)).not.toBeChecked()
    expect(screen.getByLabelText('谁能分享群卡片')).toHaveValue('owner_only')
    expect(screen.getByLabelText('谁能展示群二维码')).toHaveValue('admins')
    expect(screen.getByLabelText('谁能搜到这个群')).toHaveValue('owner_only')
    expect(screen.getByLabelText('允许扫码加群')).not.toBeChecked()
    expect(screen.getByLabelText('允许搜索群 ID 加群')).not.toBeChecked()
    expect(screen.getByLabelText(/允许好友推荐加群/)).not.toBeChecked()
  })

  it('403 弹出后端原文，不是固定的一句"更新失败"', async () => {
    // 这个端点仅群主可用（doc:477），403 是常规失败。旧代码 catch 掉异常后
    // 恒弹"更新失败"，连 err.message 都不读——那正是本批要修的症状。
    const forbidden = Object.assign(new Error('只有群主可以修改入群策略'), {
      name: 'ApiError',
      status: 403,
    })
    groupsApiMock.updateJoinPolicy.mockRejectedValueOnce(forbidden)

    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.click(screen.getByLabelText(/允许扫码加群/))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: '只有群主可以修改入群策略', variant: 'destructive' }),
      ),
    )
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: '更新失败' }),
    )
  })

  it('失败时面板不留下一个后端没接受的状态', async () => {
    groupsApiMock.updateJoinPolicy.mockRejectedValueOnce(new Error('群聊不存在'))

    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    expect(screen.getByLabelText(/需要入群审核/)).toBeChecked()
    fireEvent.click(screen.getByLabelText(/需要入群审核/))

    await waitFor(() => expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalled())
    await waitFor(() => expect(toastMock).toHaveBeenCalled())
    expect(screen.getByLabelText(/需要入群审核/)).toBeChecked()
  })

  it('管理员看不到这个面板——端点仅群主可用（doc:477）', async () => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [ADMIN_MEMBER], total: 1 })

    render(<GroupManagement groupId="g1" />)

    await screen.findByText('群信息')
    expect(screen.queryByText('入群策略')).not.toBeInTheDocument()
  })
})

/**
 * 八个控件里只有 `join_approval_required`（上面「拨动开关只发那一个字段」）与
 * `search_scope`（上面「三档 scope 下拉发的是自己那一个键和选中的档位」）钉住了
 * 「派发的 patch 用的是哪一个键」。剩下六个此前只在渲染测试里被读值覆盖——
 * 那能抓住「读错了字段」，抓不住「写错了字段」：把某个控件的
 * `onCheckedChange`/`onChange` 里的 patch 键换成另一个同类型的合法字段，
 * `tsc` 与全部 324 条测试都会绿灯，因为两个值都是合法的布尔/枚举，后端照单全收。
 * 这六条各自断言 `updateJoinPolicy` 被调用时的**精确 patch 对象**，让这种调换
 * 必然在这里死掉。
 */
describe('GroupManagement 入群策略：六个此前未钉住派发键的控件', () => {
  beforeEach(() => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [OWNER_MEMBER], total: 1 })
    groupsApiMock.getNotices.mockResolvedValue([])
    groupsApiMock.getJoinRequests.mockResolvedValue([])
    groupsApiMock.updateJoinPolicy.mockResolvedValue(GROUP)
  })

  it('允许管理员参与审核 拨动只发 admin_can_approve', async () => {
    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.click(screen.getByLabelText(/允许管理员参与审核/))

    await waitFor(() => expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledTimes(1))
    expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledWith('g1', { admin_can_approve: false })
  })

  it('谁能分享群卡片 下拉只发 card_share_scope', async () => {
    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.change(screen.getByLabelText('谁能分享群卡片'), { target: { value: 'owner_only' } })

    await waitFor(() => expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledTimes(1))
    expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledWith('g1', { card_share_scope: 'owner_only' })
  })

  it('谁能展示群二维码 下拉只发 qr_show_scope', async () => {
    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.change(screen.getByLabelText('谁能展示群二维码'), { target: { value: 'admins' } })

    await waitFor(() => expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledTimes(1))
    expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledWith('g1', { qr_show_scope: 'admins' })
  })

  it('允许扫码加群 拨动只发 allow_join_via_qr', async () => {
    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.click(screen.getByLabelText('允许扫码加群'))

    await waitFor(() => expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledTimes(1))
    expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledWith('g1', { allow_join_via_qr: false })
  })

  it('允许搜索群 ID 加群 拨动只发 allow_join_via_search', async () => {
    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.click(screen.getByLabelText('允许搜索群 ID 加群'))

    await waitFor(() => expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledTimes(1))
    expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledWith('g1', { allow_join_via_search: false })
  })

  it('允许好友推荐加群 拨动只发 allow_join_via_referral', async () => {
    render(<GroupManagement groupId="g1" />)
    await screen.findByText('入群策略')

    fireEvent.click(screen.getByLabelText(/允许好友推荐加群/))

    await waitFor(() => expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledTimes(1))
    expect(groupsApiMock.updateJoinPolicy).toHaveBeenCalledWith('g1', { allow_join_via_referral: false })
  })
})

describe('GroupManagement 加入申请页签的可见性看 admin_can_approve', () => {
  beforeEach(() => {
    groupsApiMock.getNotices.mockResolvedValue([])
    groupsApiMock.getJoinRequests.mockResolvedValue([])
  })

  it('admin_can_approve=false 时管理员看不到页签（旧代码给他渲染一个必 403 的入口）', async () => {
    groupsApiMock.getGroupDetail.mockResolvedValue({ ...GROUP, admin_can_approve: false })
    groupsApiMock.getMembers.mockResolvedValue({ members: [ADMIN_MEMBER], total: 1 })

    const { container } = render(<GroupManagement groupId="g1" />)

    // 必须等成员列表落地，否则 `isAdmin` 还是初始的 false，"看不到页签"
    // 会因为"还不知道我是谁"而假通过。上传头像的 file input 只在 isAdmin
    // 为真时挂载（组件里 `{isAdmin && (<input type="file" …>)}`），
    // 拿它当"角色已就位"的信号。
    await waitFor(() => expect(container.querySelector('input[type="file"]')).toBeTruthy())
    expect(screen.queryByText(/^加入申请/)).not.toBeInTheDocument()
  })

  it('admin_can_approve=true 时管理员看得到页签', async () => {
    groupsApiMock.getGroupDetail.mockResolvedValue({ ...GROUP, admin_can_approve: true })
    groupsApiMock.getMembers.mockResolvedValue({ members: [ADMIN_MEMBER], total: 1 })

    render(<GroupManagement groupId="g1" />)

    await waitFor(() => expect(screen.getByText(/^加入申请/)).toBeInTheDocument())
  })

  it('群主在 admin_can_approve=false 时仍然看得到页签（doc:543：仅群主）', async () => {
    groupsApiMock.getGroupDetail.mockResolvedValue({ ...GROUP, admin_can_approve: false })
    groupsApiMock.getMembers.mockResolvedValue({ members: [OWNER_MEMBER], total: 1 })

    render(<GroupManagement groupId="g1" />)

    await waitFor(() => expect(screen.getByText(/^加入申请/)).toBeInTheDocument())
  })
})

describe('GroupManagement 成员行：管理员不能动管理员（doc:840-842 / :976-978）', () => {
  beforeEach(() => {
    groupsApiMock.getNotices.mockResolvedValue([])
    groupsApiMock.getJoinRequests.mockResolvedValue([])
  })

  const openMembers = async () => {
    ;(await screen.findByText('成员管理')).click()
  }

  it('管理员对另一个管理员：不渲染任何操作按钮', async () => {
    groupsApiMock.getMembers.mockResolvedValue({
      members: [ADMIN_MEMBER, OTHER_ADMIN, PLAIN_MEMBER],
      total: 3,
    })

    render(<GroupManagement groupId="g1" />)
    await openMembers()

    const otherAdminRow = (await screen.findByText('老王')).closest('div.flex.items-center.gap-3')
    expect(otherAdminRow).not.toBeNull()
    expect((otherAdminRow as HTMLElement).querySelectorAll('button')).toHaveLength(0)
  })

  it('同一个管理员对普通成员：按钮照常渲染（对照组，证明上一条不是整块消失）', async () => {
    groupsApiMock.getMembers.mockResolvedValue({
      members: [ADMIN_MEMBER, OTHER_ADMIN, PLAIN_MEMBER],
      total: 3,
    })

    render(<GroupManagement groupId="g1" />)
    await openMembers()

    const plainRow = (await screen.findByText('小张')).closest('div.flex.items-center.gap-3')
    expect(plainRow).not.toBeNull()
    expect((plainRow as HTMLElement).querySelectorAll('button').length).toBeGreaterThan(0)
  })

  it('群主对管理员：按钮照常渲染（群主可动任何成员）', async () => {
    groupsApiMock.getMembers.mockResolvedValue({
      members: [OWNER_MEMBER, OTHER_ADMIN],
      total: 2,
    })

    render(<GroupManagement groupId="g1" />)
    await openMembers()

    const otherAdminRow = (await screen.findByText('老王')).closest('div.flex.items-center.gap-3')
    expect((otherAdminRow as HTMLElement).querySelectorAll('button').length).toBeGreaterThan(0)
  })
})

/**
 * 批 4：`POST /{group_id}/invite` 把逐个被邀请人的成败放在 HTTP 200 的
 * `data.results[]` 里（doc:733-752 行为矩阵与 2026-08-21 前置行、doc:782-796
 * 响应样例）。旧调用点 `await groupsApi.inviteMembers(...)` 不接返回值、无条件
 * 弹「邀请已发送」——邀请 3 个人 3 个全被群设置挡掉，和 3 个全发出去，屏幕上
 * 完全一样。这里每条都断言**两种结局渲染得不一样**，不是断言"没抛错"。
 */
describe('GroupManagement 邀请成员：逐条结果落地到 UI', () => {
  const OK_ROW = { user_id: 'user_b', success: true, message: '邀请已发送，待对方同意' }
  const FAIL_ROW = { user_id: 'user_c', success: false, message: '该群未开放好友推荐加群' }

  beforeEach(() => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [OWNER_MEMBER], total: 1 })
    groupsApiMock.getNotices.mockResolvedValue([])
    groupsApiMock.getJoinRequests.mockResolvedValue([])
  })

  const openInviteDialogAndSubmit = async (userIds: string) => {
    ;(await screen.findByText('成员管理')).click()
    fireEvent.click(await screen.findByText('邀请成员'))
    fireEvent.change(await screen.findByPlaceholderText('user1, user2, user3'), {
      target: { value: userIds },
    })
    fireEvent.click(screen.getByText('邀请'))
  }

  it('全部失败：destructive toast + 后端逐字文案，且绝不出现「邀请已发送」那句固定文案', async () => {
    groupsApiMock.inviteMembers.mockResolvedValueOnce({ results: [FAIL_ROW] })

    render(<GroupManagement groupId="g1" />)
    await openInviteDialogAndSubmit('user_c')

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '邀请失败',
          description: 'user_c：该群未开放好友推荐加群',
          variant: 'destructive',
        }),
      ),
    )
    // 旧实现那句无条件的成功提示：一次都不能出现。
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: '邀请已发送' }),
    )
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
    // 全失败时不能关弹窗、不能清空输入框——否则用户连刚邀请了谁都找不回来。
    expect(screen.getByPlaceholderText('user1, user2, user3')).toHaveValue('user_c')
  })

  it('部分失败：标题给出成功/失败人数，描述是失败那几行的后端文案，且弹窗不关、输入框不清', async () => {
    groupsApiMock.inviteMembers.mockResolvedValueOnce({ results: [OK_ROW, FAIL_ROW] })

    render(<GroupManagement groupId="g1" />)
    await openInviteDialogAndSubmit('user_b, user_c')

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '1 人已邀请，1 人失败',
          description: 'user_c：该群未开放好友推荐加群',
          variant: 'destructive',
        }),
      ),
    )
    // 部分失败与全部失败共用同一条纪律：用户必须还能看到自己刚输入的
    // user id，弹窗也不能被悄悄关掉——否则失败了一半的那几个人是谁，
    // 用户自己都找不回来。
    expect(screen.getByPlaceholderText('user1, user2, user3')).toHaveValue('user_b, user_c')
  })

  it('全部成功：成功 toast 用的是后端文案，并且这时才关弹窗清输入框', async () => {
    groupsApiMock.inviteMembers.mockResolvedValueOnce({ results: [OK_ROW] })

    render(<GroupManagement groupId="g1" />)
    await openInviteDialogAndSubmit('user_b')

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: '成功', description: 'user_b：邀请已发送，待对方同意' }),
      ),
    )
    // 三种结局的 toast 必须互不相同：这一条与上面两条的 title/variant 都不同。
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    )
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('user1, user2, user3')).not.toBeInTheDocument(),
    )
  })

  it('整批失败（非 200）仍然透出后端原文，而不是一句固定的「邀请失败」', async () => {
    groupsApiMock.inviteMembers.mockRejectedValueOnce(new Error('群聊不存在或已解散'))

    render(<GroupManagement groupId="g1" />)
    await openInviteDialogAndSubmit('user_b')

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: '群聊不存在或已解散', variant: 'destructive' }),
      ),
    )
  })
})

/**
 * 批 4：待审列表自 2026-08-17 起混着邀请类的行（doc:1258-1260、doc:2301-2302），
 * 而 UI 把每一行都渲染成「某某申请入群」。同时申请附言的字段名是 `message`，
 * 旧代码读的 `reason` 是一个从不存在的响应字段 ⇒ 附言整块不渲染，审批人在盲批。
 */
describe('GroupManagement 待审申请行：附言字段与四类 request_type', () => {
  const INVITE_ROW: JoinRequest = {
    request_id: 'r2',
    user_id: 'u5',
    user_nickname: '王五',
    user_avatar_url: null,
    message: null,
    request_type: 'owner_invite',
    user_accepted: true,
    created_at: '2026-01-02T00:00:00Z',
  }

  const openRequestsTabAndRefresh = async () => {
    ;(await screen.findByText(/^加入申请/)).click()
    ;(await screen.findByText('刷新')).click()
  }

  beforeEach(() => {
    groupsApiMock.getMembers.mockResolvedValue({ members: [OWNER_MEMBER], total: 1 })
    groupsApiMock.getNotices.mockResolvedValue([])
  })

  it('渲染申请人写的附言（后端字段 message），不是恒 undefined 的 reason', async () => {
    groupsApiMock.getJoinRequests.mockResolvedValue([REQUEST])

    render(<GroupManagement groupId="g1" />)
    await openRequestsTabAndRefresh()

    await waitFor(() => expect(screen.getByText('想加入')).toBeInTheDocument())
  })

  it('主动申请与邀请落的行说明文案不同，且两行都能点同意', async () => {
    groupsApiMock.getJoinRequests.mockResolvedValue([REQUEST, INVITE_ROW])

    render(<GroupManagement groupId="g1" />)
    await openRequestsTabAndRefresh()

    const applyRow = (await screen.findByText('小李')).closest('.pt-4') as HTMLElement
    const inviteRow = (await screen.findByText('王五')).closest('.pt-4') as HTMLElement
    expect(applyRow).not.toBeNull()
    expect(inviteRow).not.toBeNull()

    // 关键断言：两行的说明文案**不相同**。旧实现把两行都写成「申请时间: …」，
    // 只断言"渲染出两行"的话它照样通过。
    expect(applyRow.textContent).toContain('主动申请入群')
    expect(inviteRow.textContent).toContain('由群成员邀请')
    expect(inviteRow.textContent).not.toContain('主动申请入群')

    // 四类 request_type 现在都能批（doc:1276-1288），不能给邀请行禁用按钮。
    expect(applyRow.querySelectorAll('button').length).toBeGreaterThan(0)
    expect(inviteRow.querySelectorAll('button').length).toBeGreaterThan(0)
  })

  it('user_accepted 决定邀请行的措辞：已同意 / 还等对方确认', async () => {
    groupsApiMock.getJoinRequests.mockResolvedValue([
      INVITE_ROW,
      { ...INVITE_ROW, request_id: 'r3', user_id: 'u6', user_nickname: '赵六', user_accepted: false },
    ])

    render(<GroupManagement groupId="g1" />)
    await openRequestsTabAndRefresh()

    const accepted = (await screen.findByText('王五')).closest('.pt-4') as HTMLElement
    const waiting = (await screen.findByText('赵六')).closest('.pt-4') as HTMLElement

    expect(accepted.textContent).toContain('对方已同意，待你审批')
    expect(waiting.textContent).toContain('等待对方确认')
    expect(waiting.textContent).not.toContain('对方已同意')
  })

  it('昵称为 null 的行退到 user_id 渲染，而不是整个列表崩掉', async () => {
    groupsApiMock.getJoinRequests.mockResolvedValue([{ ...REQUEST, user_nickname: null }])

    render(<GroupManagement groupId="g1" />)
    await openRequestsTabAndRefresh()

    await waitFor(() => expect(screen.getAllByText('u2').length).toBeGreaterThan(0))
    expect(screen.queryByText(/加载加入申请失败/)).not.toBeInTheDocument()
  })
})
