import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { groupsApi } from '../groups'

/**
 * 批 2：20 个"形状不变"的方法接入信封解包层。
 *
 * 与 friends.test.ts 同一条纪律：正例必须断言**行数和字段值**，不能只断言
 * `Array.isArray` 或 `not.toThrow()`——本文件迁移前的 bug 恰恰是"坏形状也能
 * 稳定产出一个看起来合法的空结果"，只断言"没抛错"或"是数组"对这类 bug
 * 形同虚设。
 *
 * mock 数据的形状全部照抄 backend-docs/groups/群聊管理.md 的响应样例：
 * getMyGroups :113-129、getMembers :691-711、getNotices :1425-1444、
 * getInvitations :1146-1170、createNotice :1390-1411、mute :988-1008，
 * 其余"档 A"的 void 端点用同一份文档里逐个方法给出的 `SuccessResponse`
 * 样例（disband :583-599、leave :813-832、removeMember :844-861、
 * transfer :884-903、admins :920-939/:949-966、mute/unmute :1019-1036、
 * nickname :392-433）。
 */

const GROUPS_BASE = 'https://api.huanvae.cn/api/groups'

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const envelope = (data: unknown, status = 200) => ok({ success: true, code: 200, data }, status)

const MY_GROUP_DTO = {
  group_id: 'g1',
  group_name: '测试群聊',
  group_avatar_url: '',
  role: 'owner',
  unread_count: 5,
  last_message_content: '大家好',
  last_message_time: '2025-12-03T15:54:26.686987Z',
}

const MEMBER_DTO = {
  user_id: 'user_a',
  user_nickname: '用户A',
  user_avatar_url: '',
  role: 'owner',
  group_nickname: null,
  joined_at: '2025-12-03T15:54:26.686987Z',
  join_method: 'create',
  muted_until: null,
}

const NOTICE_DTO = {
  id: 'n1',
  title: '欢迎新成员',
  content: '欢迎大家加入群聊！',
  publisher_id: 'user_a',
  publisher_nickname: '用户A',
  published_at: '2025-12-03T15:55:43.198074Z',
  is_pinned: true,
  updated_at: '2025-12-03T15:55:43.198610Z',
}

const INVITATION_DTO = {
  request_id: 'r1',
  group_id: 'g1',
  group_name: '测试群聊',
  group_avatar_url: '',
  inviter_id: 'user_a',
  inviter_nickname: '用户A',
  inviter_avatar_url: 'avatars/user_a.png?t=1706000000',
  message: '欢迎加入',
  created_at: '2025-12-03T15:54:54.494997Z',
  expires_at: '2025-12-10T15:54:54.494997Z',
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: 'RT',
    isAuthenticated: true,
    user: { user_id: 'me' },
    tokenExpiry: Date.now() + 3600_000,
  })
  setApiShapeErrorReporter(() => {})
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('groupsApi.getMyGroups', () => {
  it('从信封里取出真实群聊行（data 本身就是数组，不是 data.groups）', async () => {
    fetchMock.mockResolvedValueOnce(envelope([MY_GROUP_DTO]))

    const result = await groupsApi.getMyGroups()

    expect(result).toHaveLength(1)
    expect(result[0].group_id).toBe('g1')
    expect(result[0].role).toBe('owner')
    expect(result[0].unread_count).toBe(5)
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUPS_BASE}/my`)
  })

  it('旧五路猜测链第一路 data.groups 命中的形状也必须抛错，不能返回 []', async () => {
    // 这正是旧代码 `result.data?.groups || result.data || result.groups || result || []`
    // 第一路"蒙对"的形状——它今天从未真实发生过，留着只会让"后端真的换成
    // data.groups"和"没换"变成同一种表现。
    fetchMock.mockResolvedValueOnce(envelope({ groups: [MY_GROUP_DTO] }))

    await expect(groupsApi.getMyGroups()).rejects.toThrow(/应为数组/)
  })

  it('相对头像路径在 api 出口补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope([{ ...MY_GROUP_DTO, group_avatar_url: 'avatars/g1.png?t=1' }]),
    )

    const [group] = await groupsApi.getMyGroups()

    expect(group.group_avatar_url).toBe('https://api.huanvae.cn/avatars/g1.png?t=1')
  })

  it('空串头像归一为 null，不兜底成空串喂给 <img src="">', async () => {
    fetchMock.mockResolvedValueOnce(envelope([MY_GROUP_DTO]))

    const [group] = await groupsApi.getMyGroups()

    expect(group.group_avatar_url).toBeNull()
  })

  it('HTTP 200 但 success:false 也算失败，并透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 500, message: '群聊服务不可用' }))

    await expect(groupsApi.getMyGroups()).rejects.toThrow('群聊服务不可用')
  })
})

describe('groupsApi.getMembers', () => {
  it('从 data.members 取出成员，total 取 data.total（而不是 members.length）', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ members: [MEMBER_DTO], total: 1 }))

    const result = await groupsApi.getMembers('g1')

    expect(result.members).toHaveLength(1)
    expect(result.members[0].user_id).toBe('user_a')
    expect(result.total).toBe(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUPS_BASE}/g1/members`)
  })

  it('total:0 是合法值，不能被 members.length 顶替——这是真 bug 不是风格问题', async () => {
    // 旧代码 `data.total || members.length || 0`：total 传 0（falsy）会被
    // `||` 换成 members.length。这里两个成员但 total 明确是 0（例如刚发生
    // 竞态时的中间态），必须原样透出 0。
    fetchMock.mockResolvedValueOnce(
      envelope({ members: [MEMBER_DTO, { ...MEMBER_DTO, user_id: 'user_b' }], total: 0 }),
    )

    const result = await groupsApi.getMembers('g1')

    expect(result.total).toBe(0)
  })

  it('data.members 为 null 时抛错，而不是安静地返回空数组', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ members: null, total: 0 }))

    await expect(groupsApi.getMembers('g1')).rejects.toThrow(/members/)
  })

  it('成员相对头像路径补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ members: [{ ...MEMBER_DTO, user_avatar_url: 'avatars/user_a.png' }], total: 1 }),
    )

    const [member] = (await groupsApi.getMembers('g1')).members

    expect(member.user_avatar_url).toBe('https://api.huanvae.cn/avatars/user_a.png')
  })
})

describe('groupsApi.getNotices', () => {
  it('从 data.notices 取出公告（data 本身是对象，不是数组）', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ notices: [NOTICE_DTO] }))

    const result = await groupsApi.getNotices('g1')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('n1')
    expect(result[0].title).toBe('欢迎新成员')
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUPS_BASE}/g1/notices`)
  })

  it('data 直接是数组（getMyGroups 的形状）时抛错——两个端点形状不同，不能混用', async () => {
    fetchMock.mockResolvedValueOnce(envelope([NOTICE_DTO]))

    await expect(groupsApi.getNotices('g1')).rejects.toThrow(/notices/)
  })
})

describe('groupsApi.getInvitations', () => {
  it('从 data.invitations 取出邀请，并带上新增的 inviter_avatar_url', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ invitations: [INVITATION_DTO] }))

    const result = await groupsApi.getInvitations()

    expect(result).toHaveLength(1)
    expect(result[0].request_id).toBe('r1')
    expect(result[0].inviter_nickname).toBe('用户A')
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUPS_BASE}/invitations`)
  })

  it('群头像与邀请人头像都在出口补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({
        invitations: [
          { ...INVITATION_DTO, group_avatar_url: 'avatars/g1.png', inviter_avatar_url: 'avatars/user_a.png' },
        ],
      }),
    )

    const [invitation] = await groupsApi.getInvitations()

    expect(invitation.group_avatar_url).toBe('https://api.huanvae.cn/avatars/g1.png')
    expect(invitation.inviter_avatar_url).toBe('https://api.huanvae.cn/avatars/user_a.png')
  })

  it('inviter_nickname 为 null 时保持 null（users JOIN 缺失是合法状态）', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ invitations: [{ ...INVITATION_DTO, inviter_nickname: null, inviter_avatar_url: null }] }),
    )

    const [invitation] = await groupsApi.getInvitations()

    expect(invitation.inviter_nickname).toBeNull()
    expect(invitation.inviter_avatar_url).toBeNull()
  })
})

describe('groupsApi.createNotice', () => {
  it('从 data 取出 id 与 published_at', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ id: 'n1', published_at: '2025-12-03T15:55:43.198074Z' }))

    const result = await groupsApi.createNotice('g1', { title: 't', content: 'c' })

    expect(result).toEqual({ id: 'n1', published_at: '2025-12-03T15:55:43.198074Z' })
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUPS_BASE}/g1/notices`)
  })

  it('body 没有 data 时抛错，而不是 resolve 成 undefined', async () => {
    // 旧代码 `return result.data`：body 缺 data 时会静默 resolve 成 undefined，
    // 调用点 loadNotices() 之类的地方再往下传，直到某处访问 .id 才炸。
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200 }))

    await expect(groupsApi.createNotice('g1', { title: 't', content: 'c' })).rejects.toThrow()
  })
})

describe('groupsApi 的 11 个"档 A" void 端点：assertEnvelopeOk', () => {
  const cases: Array<{
    name: string
    call: () => Promise<void>
    method: string
    url: string
  }> = [
    { name: 'updateGroup', call: () => groupsApi.updateGroup('g1', { group_name: 'x' }), method: 'PUT', url: `${GROUPS_BASE}/g1` },
    { name: 'updateGroupNickname', call: () => groupsApi.updateGroupNickname('g1', '昵称'), method: 'PUT', url: `${GROUPS_BASE}/g1/nickname` },
    { name: 'disbandGroup', call: () => groupsApi.disbandGroup('g1'), method: 'DELETE', url: `${GROUPS_BASE}/g1` },
    { name: 'leaveGroup', call: () => groupsApi.leaveGroup('g1'), method: 'POST', url: `${GROUPS_BASE}/g1/leave` },
    { name: 'removeMember', call: () => groupsApi.removeMember('g1', 'u2'), method: 'DELETE', url: `${GROUPS_BASE}/g1/members/u2` },
    { name: 'transferOwner', call: () => groupsApi.transferOwner('g1', 'u2'), method: 'POST', url: `${GROUPS_BASE}/g1/transfer` },
    { name: 'setAdmin', call: () => groupsApi.setAdmin('g1', 'u2'), method: 'POST', url: `${GROUPS_BASE}/g1/admins` },
    { name: 'removeAdmin', call: () => groupsApi.removeAdmin('g1', 'u2'), method: 'DELETE', url: `${GROUPS_BASE}/g1/admins/u2` },
    { name: 'unmuteMember', call: () => groupsApi.unmuteMember('g1', 'u2'), method: 'DELETE', url: `${GROUPS_BASE}/g1/mute/u2` },
    { name: 'approveJoinRequest', call: () => groupsApi.approveJoinRequest('g1', 'r1'), method: 'POST', url: `${GROUPS_BASE}/g1/requests/r1/approve` },
    { name: 'rejectJoinRequest', call: () => groupsApi.rejectJoinRequest('g1', 'r1'), method: 'POST', url: `${GROUPS_BASE}/g1/requests/r1/reject` },
    { name: 'declineInvitation', call: () => groupsApi.declineInvitation('r1'), method: 'POST', url: `${GROUPS_BASE}/invitations/r1/decline` },
    { name: 'updateNotice', call: () => groupsApi.updateNotice('g1', 'n1', { title: 'x' }), method: 'PUT', url: `${GROUPS_BASE}/g1/notices/n1` },
    { name: 'deleteNotice', call: () => groupsApi.deleteNotice('g1', 'n1'), method: 'DELETE', url: `${GROUPS_BASE}/g1/notices/n1` },
  ]

  for (const { name, call, method, url } of cases) {
    it(`${name}：SuccessResponse 信封成功时 resolve，且打对了 URL/方法`, async () => {
      fetchMock.mockResolvedValueOnce(envelope({ success: true, message: 'ok' }))

      await expect(call()).resolves.toBeUndefined()

      const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(calledUrl).toBe(url)
      expect(init.method).toBe(method)
    })

    it(`${name}：连 data 都没有也不该抛形状错误（doc 对应端点无响应样例）`, async () => {
      fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200 }))

      await expect(call()).resolves.toBeUndefined()
    })

    it(`${name}：HTTP 200 但 success:false 时抛出后端原文`, async () => {
      fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, message: '权限不足' }))

      await expect(call()).rejects.toThrow('权限不足')
    })
  }
})

describe('groupsApi.muteMember', () => {
  it('从 data 取出 muted_until，不读内层 data.success（那不是信封的 success）', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ success: true, message: '已禁言', muted_until: '2025-12-03T16:54:26.686987Z' }),
    )

    const result = await groupsApi.muteMember('g1', 'u2', 60)

    expect(result).toEqual({ muted_until: '2025-12-03T16:54:26.686987Z' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${GROUPS_BASE}/g1/mute`)
    expect(JSON.parse(init.body as string)).toEqual({ user_id: 'u2', duration_minutes: 60 })
  })

  it('data 缺 muted_until 时抛错，而不是返回一个没有它的对象', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ success: true, message: '已禁言' }))

    await expect(groupsApi.muteMember('g1', 'u2', 60)).rejects.toThrow(/muted_until/)
  })
})

describe('approve/reject 的 403 分诊（doc:1274/:1306，admin_can_approve=false）', () => {
  it('approveJoinRequest 在 403 时抛出带 status 的 ApiError', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '权限不足' }, 403))

    const error = await groupsApi.approveJoinRequest('g1', 'r1').catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 403 })
  })

  it('rejectJoinRequest 在 403 时同样抛出带 status 的 ApiError', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '权限不足' }, 403))

    const error = await groupsApi.rejectJoinRequest('g1', 'r1').catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 403 })
  })
})
