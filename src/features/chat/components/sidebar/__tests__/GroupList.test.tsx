import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GroupInvitation, SentJoinRequest } from '@/features/chat/api/groups'
import type { DiscoveryGroupCard } from '@/api/discovery'
import { ApiError } from '@/lib/apiEnvelope'
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

const {
  groupStoreState,
  toastMock,
  getInvitationsMock,
  searchGroupsMock,
  applyToJoinMock,
  acceptInvitationMock,
  getSentJoinRequestsMock,
} = vi.hoisted(() => ({
  groupStoreState: {
    myGroups: [] as { group_id: string }[],
    isLoading: false,
    selectionError: null as string | null,
    clearSelectionError: vi.fn(),
    createGroup: vi.fn(async () => ({ group_id: 'g1', group_name: 'x', created_at: '' })),
    loadMyGroups: vi.fn(async () => {}),
    selectGroup: vi.fn(),
  },
  toastMock: vi.fn(),
  getInvitationsMock: vi.fn(),
  searchGroupsMock: vi.fn(),
  applyToJoinMock: vi.fn(),
  acceptInvitationMock: vi.fn(),
  getSentJoinRequestsMock: vi.fn(),
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
    searchGroups: searchGroupsMock,
    applyToJoin: applyToJoinMock,
    acceptInvitation: acceptInvitationMock,
    declineInvitation: vi.fn(),
    getSentJoinRequests: getSentJoinRequestsMock,
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
  searchGroupsMock.mockReset()
  applyToJoinMock.mockReset()
  acceptInvitationMock.mockReset()
  getSentJoinRequestsMock.mockReset()
  // 默认空列表：「加入群聊」页一挂载就会拉这个端点，不给默认值的话每一条
  // 既有搜索/申请用例都会撞进 sentError 失败态。
  getSentJoinRequestsMock.mockResolvedValue([])
  groupStoreState.loadMyGroups.mockReset()
  groupStoreState.loadMyGroups.mockResolvedValue(undefined)
  groupStoreState.myGroups = []
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
  /**
   * 加载态此前没有任何断言：把 `loadingInvites ?` 改成 `false ?`，整套 35 条
   * 一条都不红——请求还在飞的时候界面会安静地渲染成「暂无群邀请」，和
   * 「确实没有邀请」一模一样。失败/空这一对早就分开了，加载/空这一对没有。
   *
   * 断言落在 `data-testid` 上而不是"转圈图标"：这一态没有任何文案，`Loader2`
   * 也不是这个组件里唯一一个（刷新按钮、申请按钮各有一个），按 class 找会
   * 找到不相干的那些。
   */
  it('请求还在飞：显示加载态，既不显示"暂无群邀请"也不显示错误', async () => {
    let resolveInvites: (rows: GroupInvitation[]) => void = () => {}
    getInvitationsMock.mockReturnValueOnce(
      new Promise<GroupInvitation[]>((resolve) => {
        resolveInvites = resolve
      }),
    )

    render(<GroupList subTab="invites" searchQuery="" />)

    expect(screen.getByTestId('invites-loading')).toBeInTheDocument()
    expect(screen.queryByText('chat.groupList.noInvites')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.groupList.retry')).not.toBeInTheDocument()

    // 落地之后加载态必须让位：三态互斥，不能两态同屏。
    resolveInvites([])
    await waitFor(() => expect(screen.getByText('chat.groupList.noInvites')).toBeInTheDocument())
    expect(screen.queryByTestId('invites-loading')).not.toBeInTheDocument()
  })

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


describe('GroupList 建群入口', () => {
  it('点「创建群聊」打开对话框（表单标题出现），再点取消关闭', async () => {
    render(<GroupList subTab="main" searchQuery="" />)
    fireEvent.click(await screen.findByText('chat.groupList.createGroup'))
    expect(await screen.findByRole('heading', { name: 'chat.groupList.createGroup' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('chat.groupList.cancel'))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'chat.groupList.createGroup' })).toBeNull())
  })
})

/**
 * 批 4：`POST /{group_id}/apply` 的 `source` 是必填的（doc:1049-1062，服务端
 * 【有意不给默认值】，缺失一律 400），返回的 `data.status` 是「本次到底进群
 * 了没有」的唯一判据（doc:1128-1132）。旧调用点一个字都不发 `source`，也不读
 * 返回值，转而用已被 migration 043 删掉的 `join_mode` 猜结果 ⇒ 恒显示
 * 「申请已提交」，免审核群里加群成功也不刷新群列表。
 */
describe('GroupList 申请入群：source 必填 + status 两态', () => {
  // discovery 的 GroupCard（`发现搜索.md:100-107`），不是群模块的 GroupBase：
  // 头像键是 `avatar_url`，另有 `join_approval_required` / `is_member`。
  const SEARCH_RESULT: DiscoveryGroupCard = {
    group_id: 'g1',
    group_name: 'Test Group',
    avatar_url: null,
    member_count: 3,
    join_approval_required: true,
    is_member: false,
  }

  const searchThenApply = async (reason?: string) => {
    fireEvent.change(await screen.findByPlaceholderText('chat.groupList.enterGroupKeywordPlaceholder'), {
      target: { value: 'g1' },
    })
    fireEvent.click(screen.getByText('chat.groupList.search'))
    const reasonInput = await screen.findByPlaceholderText('chat.groupList.applyReasonPlaceholder')
    if (reason !== undefined) {
      fireEvent.change(reasonInput, { target: { value: reason } })
    }
    fireEvent.click(screen.getByText('chat.groupList.applyJoin'))
  }

  beforeEach(() => {
    searchGroupsMock.mockResolvedValue([SEARCH_RESULT])
  })

  it('搜索结果卡片按 join_approval_required 显示审核角标（不是按已删的 join_mode 猜）', async () => {
    render(<GroupList subTab="join" searchQuery="" />)
    fireEvent.change(
      await screen.findByPlaceholderText('chat.groupList.enterGroupKeywordPlaceholder'),
      { target: { value: 'Test Group' } },
    )
    fireEvent.click(screen.getByText('chat.groupList.search'))

    expect(await screen.findByText('chat.groupList.needApproval')).toBeTruthy()
    expect(screen.queryByText('chat.groupList.noApproval')).toBeNull()
  })

  it('join_approval_required=false ⇒ 角标是「免审核」，两种状态在屏幕上必须能区分', async () => {
    searchGroupsMock.mockResolvedValue([{ ...SEARCH_RESULT, join_approval_required: false }])

    render(<GroupList subTab="join" searchQuery="" />)
    fireEvent.change(
      await screen.findByPlaceholderText('chat.groupList.enterGroupKeywordPlaceholder'),
      { target: { value: 'Test Group' } },
    )
    fireEvent.click(screen.getByText('chat.groupList.search'))

    expect(await screen.findByText('chat.groupList.noApproval')).toBeTruthy()
    expect(screen.queryByText('chat.groupList.needApproval')).toBeNull()
  })

  it('输入框文案说的是「完整群名或群 ID」——发现搜索是完全匹配，不是子串联想', async () => {
    // 这一条盯的是产品语义上的静默失败：文案若还写「输入群ID」或暗示模糊搜索，
    // 用户输入子串永远返回空，看起来就是搜索功能坏了。
    render(<GroupList subTab="join" searchQuery="" />)

    expect(
      await screen.findByPlaceholderText('chat.groupList.enterGroupKeywordPlaceholder'),
    ).toBeTruthy()
    expect(screen.queryByPlaceholderText('chat.groupList.enterGroupIdPlaceholder')).toBeNull()
  })

  it('请求带上 source（本入口是搜索）与附言，三个实参逐个断言', async () => {
    applyToJoinMock.mockResolvedValueOnce({ status: 'pending', message: '申请已提交，等待管理员审核' })

    render(<GroupList subTab="join" searchQuery="" />)
    await searchThenApply('想加入')

    await waitFor(() => expect(applyToJoinMock).toHaveBeenCalledTimes(1))
    expect(applyToJoinMock).toHaveBeenCalledWith('g1', 'search', '想加入')
  })

  it('status=joined ⇒ 文案是「已加入群聊」并刷新群列表（免审核群里人已经进去了）', async () => {
    applyToJoinMock.mockResolvedValueOnce({ status: 'joined', message: '已成功加入群聊' })

    render(<GroupList subTab="join" searchQuery="" />)
    await searchThenApply('想加入')

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'chat.groupList.joinSuccess' }),
      ),
    )
    // 旧实现恒弹「申请已提交」：这一条必须一次都没出现，否则两种结局又塌成一种。
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: 'chat.groupList.applySubmitted' }),
    )
    expect(groupStoreState.loadMyGroups).toHaveBeenCalledTimes(1)
  })

  it('status=pending ⇒ 文案是「申请已提交」，且不刷新群列表（人还没进去）', async () => {
    applyToJoinMock.mockResolvedValueOnce({ status: 'pending', message: '申请已提交，等待管理员审核' })

    render(<GroupList subTab="join" searchQuery="" />)
    await searchThenApply('想加入')

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'chat.groupList.applySubmitted' }),
      ),
    )
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: 'chat.groupList.joinSuccess' }),
    )
    expect(groupStoreState.loadMyGroups).not.toHaveBeenCalled()
  })

  it('没填附言时第三个实参是 undefined（不发 message 键）', async () => {
    applyToJoinMock.mockResolvedValueOnce({ status: 'pending', message: 'x' })

    render(<GroupList subTab="join" searchQuery="" />)
    await searchThenApply()

    await waitFor(() => expect(applyToJoinMock).toHaveBeenCalledTimes(1))
    expect(applyToJoinMock).toHaveBeenCalledWith('g1', 'search', undefined)
  })

  it('403 按「状态码 + 本次的 source」给出可解释的文案，不 match 消息体字符串', async () => {
    // doc:1093-1099：后端这条 403 的 error/message 恒为通用「权限不足」。
    applyToJoinMock.mockRejectedValueOnce(
      new ApiError('权限不足', { status: 403, endpoint: 'POST /api/groups/{group_id}/apply' }),
    )

    render(<GroupList subTab="join" searchQuery="" />)
    await searchThenApply('想加入')

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'chat.groupList.joinClosedSearch',
          variant: 'destructive',
        }),
      ),
    )
    // 通用的「权限不足」对用户什么也没解释，不能就这么原样丢出去。
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ description: '权限不足' }))
  })

  it('非 403 的失败仍然透出后端原文（例如「已是该群成员」）', async () => {
    applyToJoinMock.mockRejectedValueOnce(
      new ApiError('已是该群成员', { status: 400, endpoint: 'POST /api/groups/{group_id}/apply' }),
    )

    render(<GroupList subTab="join" searchQuery="" />)
    await searchThenApply('想加入')

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: '已是该群成员', variant: 'destructive' }),
      ),
    )
  })
})

/**
 * 批 6 复核：`is_member` 与"多条结果"这两件事各自都是**到货了却没人消费**。
 *
 * - `parseDiscoveryGroupCard` 严格解析 `is_member`（缺失即抛，把整次搜索打挂），
 *   而渲染处无条件给出「申请加入」。已在群里的人点下去，后端必回
 *   400「已是该群成员」（`群聊管理.md:1089`）——一个只能靠报错才能知道的答案，
 *   本地明明已经拿到了。字段要么消费、要么别强解析，不能两头都不占。
 * - 请求带 `limit=20`（`discovery.ts` 的 `clampDiscoveryLimit`），旧渲染只取
 *   `results[0]`。完全匹配允许同名群同时命中（`发现搜索.md:164`），于是"要 20 条、
 *   丢 19 条、屏幕上不着一字"。
 *
 * 这一组是它们各自的变异闸门：把 `is_member` 门控改回无条件渲染、或把渲染改回
 * 只画 `searchResults[0]`，下面必须有用例红掉。
 */
describe('GroupList 搜索结果：is_member 门控 + 多条结果全部渲染', () => {
  const card = (over: Partial<DiscoveryGroupCard> = {}): DiscoveryGroupCard => ({
    group_id: 'g1',
    group_name: 'Test Group',
    avatar_url: null,
    member_count: 3,
    join_approval_required: true,
    is_member: false,
    ...over,
  })

  const search = async (keyword = 'Test Group') => {
    fireEvent.change(
      await screen.findByPlaceholderText('chat.groupList.enterGroupKeywordPlaceholder'),
      { target: { value: keyword } },
    )
    fireEvent.click(screen.getByText('chat.groupList.search'))
  }

  it('is_member=true ⇒ 显示「你已在该群」，不给必被 400 拒掉的「申请加入」', async () => {
    searchGroupsMock.mockResolvedValue([card({ is_member: true })])

    render(<GroupList subTab="join" searchQuery="" />)
    await search()

    expect(await screen.findByText('chat.groupList.alreadyMember')).toBeTruthy()
    // 按钮和附言输入框都必须不在：只把按钮 disable 掉仍然是在邀请用户去撞一次 400。
    expect(screen.queryByText('chat.groupList.applyJoin')).toBeNull()
    expect(screen.queryByPlaceholderText('chat.groupList.applyReasonPlaceholder')).toBeNull()
  })

  it('is_member=false ⇒ 照常给「申请加入」，且不说「你已在该群」', async () => {
    // 上一条的对照：否则把门控写成恒 true 也能让上一条绿。
    searchGroupsMock.mockResolvedValue([card({ is_member: false })])

    render(<GroupList subTab="join" searchQuery="" />)
    await search()

    expect(await screen.findByText('chat.groupList.applyJoin')).toBeTruthy()
    expect(screen.queryByText('chat.groupList.alreadyMember')).toBeNull()
  })

  it('三条同名结果全部渲染，并给出计数——不是只画第一条', async () => {
    searchGroupsMock.mockResolvedValue([
      card({ group_id: 'g1', group_name: '技术交流群' }),
      card({ group_id: 'g2', group_name: '技术交流群' }),
      card({ group_id: 'g3', group_name: '技术交流群' }),
    ])

    render(<GroupList subTab="join" searchQuery="" />)
    await search('技术交流群')

    await waitFor(() => expect(screen.getAllByText('技术交流群')).toHaveLength(3))
    expect(screen.getAllByText('chat.groupList.applyJoin')).toHaveLength(3)
    expect(screen.getByText('chat.groupList.matchedGroupCount')).toBeTruthy()
  })

  it('点第二张卡片申请的是第二个群——旧实现只留 results[0]，这里会打到 g1', async () => {
    applyToJoinMock.mockResolvedValueOnce({ status: 'pending', message: 'x' })
    searchGroupsMock.mockResolvedValue([
      card({ group_id: 'g1', group_name: '同名群' }),
      card({ group_id: 'g2', group_name: '同名群' }),
    ])

    render(<GroupList subTab="join" searchQuery="" />)
    await search('同名群')

    await waitFor(() => expect(screen.getAllByText('chat.groupList.applyJoin')).toHaveLength(2))
    fireEvent.click(screen.getAllByText('chat.groupList.applyJoin')[1])

    await waitFor(() => expect(applyToJoinMock).toHaveBeenCalledTimes(1))
    expect(applyToJoinMock).toHaveBeenCalledWith('g2', 'search', undefined)
  })

  it('附言按卡片各存各的：在第二张里打的字不会跟着第一张一起发出去', async () => {
    applyToJoinMock.mockResolvedValueOnce({ status: 'pending', message: 'x' })
    searchGroupsMock.mockResolvedValue([
      card({ group_id: 'g1', group_name: '同名群' }),
      card({ group_id: 'g2', group_name: '同名群' }),
    ])

    render(<GroupList subTab="join" searchQuery="" />)
    await search('同名群')

    await waitFor(() =>
      expect(screen.getAllByPlaceholderText('chat.groupList.applyReasonPlaceholder')).toHaveLength(2),
    )
    const reasons = screen.getAllByPlaceholderText('chat.groupList.applyReasonPlaceholder')
    fireEvent.change(reasons[1], { target: { value: '想加入第二个' } })
    // 第一张的输入框必须还是空的——共用一个 string 时这里会同步变成同一句话
    expect((reasons[0] as HTMLInputElement).value).toBe('')

    fireEvent.click(screen.getAllByText('chat.groupList.applyJoin')[1])
    await waitFor(() => expect(applyToJoinMock).toHaveBeenCalledTimes(1))
    expect(applyToJoinMock).toHaveBeenCalledWith('g2', 'search', '想加入第二个')
  })

  it('多条结果里混着已入群的：只有那一张换成「你已在该群」，其余照常可申请', async () => {
    searchGroupsMock.mockResolvedValue([
      card({ group_id: 'g1', group_name: '同名群', is_member: true }),
      card({ group_id: 'g2', group_name: '同名群', is_member: false }),
    ])

    render(<GroupList subTab="join" searchQuery="" />)
    await search('同名群')

    expect(await screen.findByText('chat.groupList.alreadyMember')).toBeTruthy()
    // 门控必须是逐卡片的，不是"整批里有一个已入群就全部关掉"
    expect(screen.getAllByText('chat.groupList.alreadyMember')).toHaveLength(1)
    expect(screen.getAllByText('chat.groupList.applyJoin')).toHaveLength(1)
  })
})

/**
 * 批 4：accept 成功 ≠ 入群（doc:1194-1203）。两种结局的 HTTP、信封 `success`、
 * 内层 `data.success` 全都相同，判据只能是 accept 之后重新拉的
 * `GET /api/groups/my` 里有没有这个 group_id。旧实现无条件弹「已加入群聊」
 * 并把这条邀请从列表里删掉——用户被告知进群了、邀请消失了、群列表里却没有
 * 这个群，且再没有任何入口能看到「我已同意、正在等审批」。
 */
describe('GroupList 接受邀请：已入群 / 待审批 / 无法确认三态', () => {
  const acceptFirstInvite = async () => {
    await screen.findByText('Test Group')
    // 邀请行上两个按钮：第一个是同意（Check），第二个是拒绝。
    const row = screen.getByText('Test Group').closest('.p-4') as HTMLElement
    fireEvent.click(row.querySelectorAll('button')[0])
  }

  beforeEach(() => {
    getInvitationsMock.mockResolvedValue([INVITATION])
    acceptInvitationMock.mockResolvedValue({ success: true, message: '已成功加入群聊' })
  })

  it('复核后群在列表里 ⇒ 「已加入群聊」，该邀请行移除', async () => {
    groupStoreState.loadMyGroups.mockImplementation(async () => {
      groupStoreState.myGroups = [{ group_id: 'g1' }]
    })

    render(<GroupList subTab="invites" searchQuery="" />)
    await acceptFirstInvite()

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'chat.groupList.joinedViaInvite' }),
      ),
    )
    await waitFor(() => expect(screen.queryByText('Test Group')).not.toBeInTheDocument())
  })

  it('复核后群不在列表里 ⇒ 「等待管理员审核」，邀请行留在界面上', async () => {
    // 这一条就是本批要修的那个 bug：后端返回的内层 success 同样是 true、
    // HTTP 同样是 200，只有「我到底在不在群里」不同。
    acceptInvitationMock.mockResolvedValue({
      success: true,
      message: '已同意邀请，等待管理员审核',
    })
    groupStoreState.loadMyGroups.mockImplementation(async () => {
      groupStoreState.myGroups = []
    })

    render(<GroupList subTab="invites" searchQuery="" />)
    await acceptFirstInvite()

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'chat.groupList.inviteAcceptedPendingApproval',
        }),
      ),
    )
    // 关键：与上一条的文案**不同**，且这一行不能消失——它是用户唯一能看到
    // 「我已同意、正在等审批」的地方。
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: 'chat.groupList.joinedViaInvite' }),
    )
    expect(screen.getByText('Test Group')).toBeInTheDocument()
    expect(screen.getByText('chat.groupList.inviteAcceptedPendingApproval')).toBeInTheDocument()
  })

  it('复核本身失败 ⇒ 第三种文案（既不说已加入，也不说接受失败）', async () => {
    groupStoreState.loadMyGroups.mockRejectedValue(new Error('加载群聊列表失败'))

    render(<GroupList subTab="invites" searchQuery="" />)
    await acceptFirstInvite()

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'chat.groupList.inviteAcceptedUnconfirmed' }),
      ),
    )
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: 'chat.groupList.joinedViaInvite' }),
    )
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: 'chat.groupList.acceptInviteFailed' }),
    )
    expect(screen.getByText('Test Group')).toBeInTheDocument()
  })

  /**
   * 批 4 findings：accept 的 403 此前落回 `error.message`，那正是后端给的
   * 通用「权限不足」（doc:1093-1099 没有为这个端点单独定义文案）——用户
   * 点了同意，得到一句什么都没解释的错误。`describeAcceptError` 是
   * `describeApplyError` 的 accept 侧双胞胎：同一道 403（doc:749-751、
   * :1097-1099，群主关掉 allow_join_via_referral 之后存量 member_invite
   * 不可 accept）现在给出具体解释，不再原样透出后端的通用文案。
   */
  it('accept 自己失败（403：群主关掉好友推荐后存量 member_invite 不可 accept）给出具体解释', async () => {
    acceptInvitationMock.mockRejectedValueOnce(
      new ApiError('权限不足', {
        status: 403,
        endpoint: 'POST /api/groups/invitations/{request_id}/accept',
      }),
    )

    render(<GroupList subTab="invites" searchQuery="" />)
    await acceptFirstInvite()

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'chat.groupList.inviteAcceptClosed',
          variant: 'destructive',
        }),
      ),
    )
    // 通用的「权限不足」对用户什么也没解释，不能就这么原样丢出去——
    // 这一条是本次要修的原始症状，必须一次都不出现。
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ description: '权限不足' }))
    expect(groupStoreState.loadMyGroups).not.toHaveBeenCalled()
    expect(screen.getByText('Test Group')).toBeInTheDocument()
  })

  it('accept 非 403 的失败仍然透出后端原文（不是每个错误都套用 403 的解释）', async () => {
    acceptInvitationMock.mockRejectedValueOnce(
      new ApiError('邀请已过期', {
        status: 400,
        endpoint: 'POST /api/groups/invitations/{request_id}/accept',
      }),
    )

    render(<GroupList subTab="invites" searchQuery="" />)
    await acceptFirstInvite()

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: '邀请已过期', variant: 'destructive' }),
      ),
    )
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: 'chat.groupList.inviteAcceptClosed' }),
    )
  })

  /**
   * 批 4 finding 6：待审批行**两个**按钮都被换成状态说明，不只是「同意」。
   * 「拒绝」被一并去掉是刻意的（见 GroupList.tsx 里那段注释），这里钉住
   * 现在的行为——回归成"只去掉同意，拒绝还在"不该被悄悄放过。
   */
  it('待审批行不渲染任何按钮（同意、拒绝都被换成状态说明）', async () => {
    groupStoreState.loadMyGroups.mockImplementation(async () => {
      groupStoreState.myGroups = []
    })

    render(<GroupList subTab="invites" searchQuery="" />)
    await acceptFirstInvite()

    await waitFor(() =>
      expect(screen.getByText('chat.groupList.inviteAcceptedPendingApproval')).toBeInTheDocument(),
    )
    const row = screen.getByText('Test Group').closest('.p-4') as HTMLElement
    expect(row.querySelectorAll('button')).toHaveLength(0)
  })
})

/**
 * 批 7：`GET /api/groups/requests/sent` 接进「加入群聊」页。
 *
 * 三态与群邀请那一组同构，且理由相同：请求失败和"确实没有申请"必须在屏幕上
 * 长得不一样。另外两条盯的是这个端点特有的两件事——**没有撤回接口**
 * （群聊管理.md:1334，by design），以及**申请落待审之后列表要当场刷新**
 * （否则 toast 弹完什么都没变，和"申请没发出去"分不开）。
 */
describe('GroupList「我发出的申请」（GET /api/groups/requests/sent）', () => {
  const SENT_REQUEST: SentJoinRequest = {
    request_id: 'sr1',
    group_id: 'g9',
    group_name: 'Sent Group',
    group_avatar_url: null,
    message: '想加入学习',
    status: 'pending',
    created_at: '2026-01-02T00:00:00Z',
  }

  it('进入「加入群聊」页就会拉一次，成功时渲染真实行（群名 + 附言 + 状态徽章）', async () => {
    getSentJoinRequestsMock.mockResolvedValue([SENT_REQUEST])

    render(<GroupList subTab="join" searchQuery="" />)

    expect(await screen.findByText('Sent Group')).toBeInTheDocument()
    expect(screen.getByText('想加入学习')).toBeInTheDocument()
    expect(screen.getByText('chat.groupList.sentStatusPending')).toBeInTheDocument()
    expect(screen.queryByText('chat.groupList.noSentRequests')).not.toBeInTheDocument()
    expect(getSentJoinRequestsMock).toHaveBeenCalledTimes(1)
  })

  /** 与群邀请那一块同型的洞：`loadingSent ?` 换成 `false ?` 全绿。见那里的注释。 */
  it('请求还在飞：显示加载态，既不显示"暂无申请"也不显示错误', async () => {
    let resolveSent: (rows: SentJoinRequest[]) => void = () => {}
    getSentJoinRequestsMock.mockReturnValueOnce(
      new Promise<SentJoinRequest[]>((resolve) => {
        resolveSent = resolve
      }),
    )

    render(<GroupList subTab="join" searchQuery="" />)

    expect(screen.getByTestId('sent-requests-loading')).toBeInTheDocument()
    expect(screen.queryByText('chat.groupList.noSentRequests')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.groupList.retry')).not.toBeInTheDocument()

    resolveSent([])
    await waitFor(() =>
      expect(screen.getByText('chat.groupList.noSentRequests')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('sent-requests-loading')).not.toBeInTheDocument()
  })

  it('请求失败：错误文案 + 重试按钮，绝不显示"暂无申请"', async () => {
    getSentJoinRequestsMock.mockRejectedValueOnce(new Error('获取我发出的加群申请失败'))

    render(<GroupList subTab="join" searchQuery="" />)

    await waitFor(() =>
      expect(screen.getByText('获取我发出的加群申请失败')).toBeInTheDocument(),
    )
    expect(screen.queryByText('chat.groupList.noSentRequests')).not.toBeInTheDocument()
  })

  it('真正的空列表：显示"暂无待审核的加群申请"，不显示错误', async () => {
    getSentJoinRequestsMock.mockResolvedValue([])

    render(<GroupList subTab="join" searchQuery="" />)

    await waitFor(() =>
      expect(screen.getByText('chat.groupList.noSentRequests')).toBeInTheDocument(),
    )
    expect(screen.queryByText('获取我发出的加群申请失败')).not.toBeInTheDocument()
  })

  /**
   * 后端 by design 没有 `DELETE`/`cancel`（群聊管理.md:1334）。这一条钉的是
   * 「这一行里除了刷新按钮之外没有任何按钮」——渲染一颗点了只会 404 的
   * 「撤回」，等于替后端编一个它没有的能力。
   *
   * ⚠️ 断言落在**申请行本身**（`.p-3` 那个容器），不是整块卡片：卡片头部有
   * 刷新按钮，对整块 `querySelectorAll('button')` 断言 0 会恒红，对
   * "有没有撤回按钮"却一无所知。
   */
  it('申请行不渲染撤回按钮，并且明说申请无法撤回', async () => {
    getSentJoinRequestsMock.mockResolvedValue([SENT_REQUEST])

    render(<GroupList subTab="join" searchQuery="" />)

    const row = (await screen.findByText('Sent Group')).closest('.p-3') as HTMLElement
    expect(row).not.toBeNull()
    expect(row.querySelectorAll('button')).toHaveLength(0)
    expect(screen.getByText('chat.groupList.sentNoWithdrawHint')).toBeInTheDocument()
  })

  it('申请落待审（status=pending）之后当场重拉一次，新申请立刻出现在列表里', async () => {
    searchGroupsMock.mockResolvedValue([
      {
        group_id: 'g9',
        group_name: 'Sent Group',
        avatar_url: null,
        member_count: 3,
        join_approval_required: true,
        is_member: false,
      } satisfies DiscoveryGroupCard,
    ])
    applyToJoinMock.mockResolvedValue({ status: 'pending', message: '申请已提交' })
    // 第一次挂载时还没有申请；apply 之后后端才有这一条。
    getSentJoinRequestsMock.mockResolvedValueOnce([]).mockResolvedValue([SENT_REQUEST])

    render(<GroupList subTab="join" searchQuery="" />)
    await waitFor(() =>
      expect(screen.getByText('chat.groupList.noSentRequests')).toBeInTheDocument(),
    )

    fireEvent.change(
      await screen.findByPlaceholderText('chat.groupList.enterGroupKeywordPlaceholder'),
      { target: { value: 'Sent Group' } },
    )
    fireEvent.click(screen.getByText('chat.groupList.search'))
    fireEvent.click(await screen.findByText('chat.groupList.applyJoin'))

    await waitFor(() => expect(getSentJoinRequestsMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('想加入学习')).toBeInTheDocument()
  })

  it('直接入群（status=joined）走的是刷新群列表那条路，不重拉申请列表', async () => {
    // 两条路必须分开：joined 的人根本不会有待审申请，多打一次请求只是噪声。
    searchGroupsMock.mockResolvedValue([
      {
        group_id: 'g9',
        group_name: 'Sent Group',
        avatar_url: null,
        member_count: 3,
        join_approval_required: false,
        is_member: false,
      } satisfies DiscoveryGroupCard,
    ])
    applyToJoinMock.mockResolvedValue({ status: 'joined', message: '已加入' })
    getSentJoinRequestsMock.mockResolvedValue([])

    render(<GroupList subTab="join" searchQuery="" />)
    fireEvent.change(
      await screen.findByPlaceholderText('chat.groupList.enterGroupKeywordPlaceholder'),
      { target: { value: 'Sent Group' } },
    )
    fireEvent.click(screen.getByText('chat.groupList.search'))
    fireEvent.click(await screen.findByText('chat.groupList.applyJoin'))

    await waitFor(() => expect(groupStoreState.loadMyGroups).toHaveBeenCalledTimes(1))
    expect(getSentJoinRequestsMock).toHaveBeenCalledTimes(1)
  })
})
