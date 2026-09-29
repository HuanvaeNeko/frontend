import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Group, GroupMember, GroupNotice, JoinRequest } from '@/features/chat/api/groups'
import GroupManagement from '../GroupManagement'

/**
 * 英文界面（en-US）下群管理面板里不能再冒中文。
 *
 * 原来整个组件的文案都写死成中文，界面语言切到英文也照样显示「基本信息 / 入群策略 / 确认禁言」。
 * 这里把 `useI18n` 换成按 en-US 字典查的 `t`（缺英文 key 时它会回落到中文——那样下面的
 * 「不含中文」断言就会红），测试数据也全用英文，于是**页面上出现的任何一个汉字**都只可能
 * 来自组件自己的写死文案。每个页签、三个弹窗、确认框和 toast 各断言一次。
 */

const { groupsApiMock, toastMock, authState } = vi.hoisted(() => ({
  groupsApiMock: {
    getGroupDetail: vi.fn(),
    getMembers: vi.fn(),
    getNotices: vi.fn(),
    getJoinRequests: vi.fn(),
    updateJoinPolicy: vi.fn(),
    inviteMembers: vi.fn(),
    removeMember: vi.fn(),
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

vi.mock('@/i18n/I18nProvider', async () => {
  const { translateIn } = await vi.importActual<typeof import('@/i18n/translate')>('@/i18n/translate')
  const t = (key: string, params?: Record<string, string | number>) => translateIn('en-US', key, params)
  return { useI18n: () => ({ locale: 'en-US', t }) }
})

const CJK = /[一-鿿]/

const GROUP: Group = {
  group_id: 'g1',
  group_name: 'Hiking Club',
  group_avatar_url: null,
  group_description: 'Weekend hikes',
  member_count: 3,
  status: 'active',
  creator_id: 'me',
  created_at: '2026-01-01T00:00:00Z',
  join_approval_required: true,
  admin_can_approve: true,
  card_share_scope: 'all_members',
  qr_show_scope: 'admins',
  search_scope: 'everyone',
  allow_join_via_qr: true,
  allow_join_via_search: true,
  allow_join_via_referral: true,
}

const member = (user_id: string, user_nickname: string, role: GroupMember['role']): GroupMember => ({
  user_id,
  user_nickname,
  user_avatar_url: null,
  role,
  group_nickname: null,
  joined_at: '2026-01-01T00:00:00Z',
  join_method: 'apply',
  muted_until: null,
})

const MEMBERS = [member('me', 'Me', 'owner'), member('u2', 'Bob', 'admin'), member('u3', 'Carol', 'member')]

const NOTICE: GroupNotice = {
  id: 'n1',
  title: 'Welcome',
  content: 'Read the rules first',
  publisher_id: 'me',
  publisher_nickname: 'Me',
  published_at: '2026-01-01T00:00:00Z',
  is_pinned: true,
  updated_at: '2026-01-01T00:00:00Z',
}

const request = (overrides: Partial<JoinRequest>): JoinRequest => ({
  request_id: 'r1',
  user_id: 'u4',
  user_nickname: 'Dave',
  user_avatar_url: null,
  message: 'Let me in',
  request_type: 'search_apply',
  user_accepted: false,
  created_at: '2026-01-02T00:00:00Z',
  ...overrides,
})

const REQUESTS = [
  request({}),
  request({ request_id: 'r2', user_id: 'u5', user_nickname: 'Erin', message: null, request_type: 'owner_invite', user_accepted: true }),
  request({ request_id: 'r3', user_id: 'u6', user_nickname: 'Frank', message: null, request_type: 'member_invite', user_accepted: false }),
]

/** 群主视角渲染，等到入群策略卡片出现（它要等群详情与成员都落地才会挂载）。 */
async function renderAsOwner() {
  render(<GroupManagement groupId="g1" />)
  await screen.findByText('Joining & visibility')
}

const pageText = () => document.body.textContent ?? ''

const rowOf = async (name: string) => {
  const row = (await screen.findByText(name)).closest('div.flex.items-center.gap-3')
  expect(row).not.toBeNull()
  return row as HTMLElement
}

beforeEach(() => {
  Object.values(groupsApiMock).forEach(fn => fn.mockReset())
  toastMock.mockReset()
  authState.user = { user_id: 'me' }
  groupsApiMock.getGroupDetail.mockResolvedValue(GROUP)
  groupsApiMock.getMembers.mockResolvedValue({ members: MEMBERS, total: MEMBERS.length })
  groupsApiMock.getNotices.mockResolvedValue([NOTICE])
  groupsApiMock.getJoinRequests.mockResolvedValue(REQUESTS)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GroupManagement 英文界面', () => {
  it('基本信息页签：页签、入群与可见性设置、群信息、危险操作都是英文，页面上没有一个汉字', async () => {
    await renderAsOwner()

    for (const name of ['Details', 'Members', 'Announcements']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    // 入群申请页签后面挂着计数徽标，按前缀匹配
    await waitFor(() => expect(screen.getByRole('button', { name: /^Join requests/ })).toBeInTheDocument())

    expect(screen.getByText('3 members · Active')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByLabelText(/Require approval to join/)).toBeChecked()
    expect(screen.getByLabelText('Who can share the group card')).toHaveValue('all_members')
    expect(screen.getByLabelText('Who can show the group QR code')).toHaveValue('admins')
    expect(screen.getByLabelText('Who can find this group in search')).toHaveValue('everyone')
    expect(screen.getByRole('option', { name: 'Anyone' })).toBeInTheDocument()
    expect(screen.getByLabelText('Allow joining by QR code')).toBeChecked()
    expect(screen.getByText('How to join')).toBeInTheDocument()
    expect(screen.getByText('Approval required')).toBeInTheDocument()
    expect(screen.getByText('Danger zone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disband group' })).toBeInTheDocument()

    expect(pageText()).not.toMatch(CJK)
  })

  it('成员 / 公告 / 入群申请三个页签：列表、角色名、行说明都是英文', async () => {
    await renderAsOwner()

    screen.getByRole('button', { name: 'Members' }).click()
    expect(await screen.findByRole('button', { name: 'Invite members' })).toBeInTheDocument()
    await screen.findByText('Carol')
    for (const role of ['Owner', 'Admin', 'Member']) expect(screen.getByText(role)).toBeInTheDocument()
    expect(pageText()).not.toMatch(CJK)

    screen.getByRole('button', { name: 'Announcements' }).click()
    expect(await screen.findByText('Welcome')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New announcement' })).toBeInTheDocument()
    expect(screen.getByText('📌 Pinned')).toBeInTheDocument()
    expect(pageText()).not.toMatch(CJK)

    screen.getByRole('button', { name: /^Join requests/ }).click()
    expect(await screen.findByText('Pending join requests')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    await screen.findByText('Frank')
    expect(pageText()).toContain('Asked to join · Applied ')
    expect(pageText()).toContain('Invited by a member; they accepted and are waiting for your approval · Invited ')
    expect(pageText()).toContain('Invited by a member; waiting for them to accept · Invited ')
    expect(pageText()).not.toMatch(CJK)
  })

  it('邀请弹窗、禁言弹窗、移出确认框都是英文', async () => {
    // happy-dom 不实现 window.confirm（见 ProfileView.test.tsx 的说明），垫一个返回 false 的：点了等于取消
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    await renderAsOwner()
    screen.getByRole('button', { name: 'Members' }).click()

    fireEvent.click(await screen.findByRole('button', { name: 'Invite members' }))
    expect(await screen.findByText('User IDs (comma-separated)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
    expect(pageText()).not.toMatch(CJK)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('User IDs (comma-separated)')).not.toBeInTheDocument())

    // 群主对普通成员的一排按钮：禁言、设管理员、转让群主、移出（后三个只有图标）
    const carolButtons = (await rowOf('Carol')).querySelectorAll('button')
    fireEvent.click(carolButtons[0])
    expect(await screen.findByText('Mute Carol')).toBeInTheDocument()
    expect(screen.getByText('Mute duration (minutes)')).toBeInTheDocument()
    for (const preset of ['10 min', '30 min', '1 h', '6 h', '24 h']) {
      expect(screen.getByRole('button', { name: preset })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument()
    expect(pageText()).not.toMatch(CJK)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Mute Carol')).not.toBeInTheDocument())

    fireEvent.click(carolButtons[carolButtons.length - 1])
    expect(confirmSpy).toHaveBeenCalledWith('Remove Carol from the group?')
    // 取消了确认框，请求一次都不发
    expect(groupsApiMock.removeMember).not.toHaveBeenCalled()
  })

  it('toast 也是英文：改入群设置成功、邀请部分失败（逐条结果的分隔符跟着语言走）', async () => {
    groupsApiMock.updateJoinPolicy.mockResolvedValue({ ...GROUP, allow_join_via_qr: false })
    groupsApiMock.inviteMembers.mockResolvedValue({
      results: [
        { user_id: 'user_b', success: true, message: 'Invitation sent' },
        { user_id: 'user_c', success: false, message: 'Referral joining is off' },
        { user_id: 'user_d', success: false, message: 'User not found' },
      ],
    })
    await renderAsOwner()

    fireEvent.click(screen.getByLabelText('Allow joining by QR code'))
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: 'Success', description: 'Joining & visibility settings updated' }),
    )

    screen.getByRole('button', { name: 'Members' }).click()
    fireEvent.click(await screen.findByRole('button', { name: 'Invite members' }))
    fireEvent.change(await screen.findByPlaceholderText('user1, user2, user3'), {
      target: { value: 'user_b, user_c, user_d' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: '1 invited, 2 failed',
        description: 'user_c: Referral joining is off; user_d: User not found',
        variant: 'destructive',
      }),
    )
  })
})

describe('GroupManagement 禁言弹窗标题', () => {
  it('成员没有昵称时标题落到用户 ID，而不是只剩「Mute 」（原来只读 user_nickname）', async () => {
    const noName: GroupMember = { ...member('u9', 'x', 'member'), user_nickname: null }
    groupsApiMock.getMembers.mockResolvedValue({ members: [MEMBERS[0], noName], total: 2 })
    await renderAsOwner()
    screen.getByRole('button', { name: 'Members' }).click()

    fireEvent.click((await rowOf('u9')).querySelectorAll('button')[0])

    expect(await screen.findByText('Mute u9')).toBeInTheDocument()
  })
})
