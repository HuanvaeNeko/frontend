import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { type ApiError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { isUploadSessionExpired, storageApi } from '@/api/storage'
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

// getApiBaseUrl() 而不是字面量：Vitest 会加载 .env，宿主由本机反代决定，
// 断言必须跟着同一个基址走，不能钉死某个域名（否则一换 .env 就假红）。
const GROUPS_BASE = `${getApiBaseUrl()}/api/groups`

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

    expect(group.group_avatar_url).toBe(`${getApiBaseUrl()}/avatars/g1.png?t=1`)
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

    expect(member.user_avatar_url).toBe(`${getApiBaseUrl()}/avatars/user_a.png`)
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

    expect(invitation.group_avatar_url).toBe(`${getApiBaseUrl()}/avatars/g1.png`)
    expect(invitation.inviter_avatar_url).toBe(`${getApiBaseUrl()}/avatars/user_a.png`)
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


// ============================================
// 批 3：join_mode → join-policy 八字段
// ============================================

/** `PUT /{group_id}/join-policy` 的完整八值（doc:526-533 响应样例）。 */
const JOIN_POLICY_DTO = {
  join_approval_required: false,
  admin_can_approve: false,
  card_share_scope: 'all_members',
  qr_show_scope: 'all_members',
  search_scope: 'everyone',
  allow_join_via_qr: true,
  allow_join_via_search: true,
  allow_join_via_referral: true,
}

/** `GET /{group_id}` 的 `GroupInfo`（doc:175-190 响应样例）。 */
const GROUP_INFO_DTO = {
  group_id: 'g1',
  group_name: '测试群聊',
  group_avatar_url: '',
  group_description: '这是一个测试群',
  creator_id: 'user_a',
  created_at: '2025-12-03T15:54:26.686987Z',
  ...JOIN_POLICY_DTO,
  join_approval_required: true,
  admin_can_approve: true,
  status: 'active',
  member_count: 5,
}

describe('groupsApi.updateJoinPolicy', () => {
  it('打的是连字符 join-policy，绝不是已删除的下划线 join_mode', async () => {
    fetchMock.mockResolvedValueOnce(envelope(JOIN_POLICY_DTO))

    await groupsApi.updateJoinPolicy('g1', { join_approval_required: false })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    // 正断言：URL 必须逐字等于连字符版本。
    expect(url).toBe(`${GROUPS_BASE}/g1/join-policy`)
    expect(init.method).toBe('PUT')
    // 负断言：整个请求里不能有任何东西碰到已删路由（doc:442-446，无兼容层，
    // 打过去只会拿 404）。两条一起写，改回下划线时两条都会红。
    expect(url).not.toContain('join_mode')
    for (const [calledUrl] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(calledUrl).not.toContain('/join_mode')
    }
  })

  it('只发 patch 里出现的键——未出现的字段由后端保持原值（doc:479-480）', async () => {
    fetchMock.mockResolvedValueOnce(envelope(JOIN_POLICY_DTO))

    await groupsApi.updateJoinPolicy('g1', {
      join_approval_required: false,
      admin_can_approve: false,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    // toEqual 而不是 toMatchObject：多发一个键就是把用户没动的开关一起写回去，
    // 中间隔一次别人的修改就会被静默覆盖，必须红。
    expect(body).toEqual({ join_approval_required: false, admin_can_approve: false })
    expect(Object.keys(body)).toHaveLength(2)
  })

  it('单字段 patch 也只发那一个键', async () => {
    fetchMock.mockResolvedValueOnce(envelope(JOIN_POLICY_DTO))

    await groupsApi.updateJoinPolicy('g1', { search_scope: 'owner_only' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ search_scope: 'owner_only' })
  })

  it('响应回填完整八值，可直接喂给设置面板（doc:538）', async () => {
    fetchMock.mockResolvedValueOnce(envelope(JOIN_POLICY_DTO))

    const policy = await groupsApi.updateJoinPolicy('g1', { join_approval_required: false })

    expect(policy).toEqual(JOIN_POLICY_DTO)
  })

  it('响应少一个字段就抛错，而不是返回一个缺开关的对象', async () => {
    const { allow_join_via_referral: _dropped, ...missingOne } = JOIN_POLICY_DTO
    fetchMock.mockResolvedValueOnce(envelope(missingOne))

    await expect(groupsApi.updateJoinPolicy('g1', { join_approval_required: false })).rejects.toThrow(
      /allow_join_via_referral/,
    )
  })

  it('布尔字段收到 null 时抛错——null 会被渲染成"关"，和后端真实状态相反', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ...JOIN_POLICY_DTO, admin_can_approve: null }))

    await expect(groupsApi.updateJoinPolicy('g1', { admin_can_approve: true })).rejects.toThrow(
      /admin_can_approve/,
    )
  })

  it('search_scope 传回 all_members（那是另一张取值表）时抛错', async () => {
    // doc:210/:552-554：search_scope 的三档是 everyone/admins/owner_only，
    // all_members 是 card_share_scope / qr_show_scope 那张表的最松档。
    fetchMock.mockResolvedValueOnce(envelope({ ...JOIN_POLICY_DTO, search_scope: 'all_members' }))

    await expect(groupsApi.updateJoinPolicy('g1', { search_scope: 'everyone' })).rejects.toThrow(
      /search_scope/,
    )
  })

  it('403（不是群主）抛出后端原文，且带 status=403 供调用点分诊', async () => {
    // doc:477 仅群主；doc:551-556 错误响应表：403 = 群存在但你不是群主。
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 403, message: '只有群主可以修改入群策略' }, 403),
    )

    const error = await groupsApi
      .updateJoinPolicy('g1', { join_approval_required: false })
      .catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 403 })
    expect((error as Error).message).toBe('只有群主可以修改入群策略')
    // 关键：403 绝不能被当成登录态失效（isAuthApiError 只认 401）。
    expect((error as Error).message).not.toBe('更新入群策略失败')
  })

  it('404（群不存在）同样透出后端原文', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 404, message: '群聊不存在' }, 404))

    const error = await groupsApi
      .updateJoinPolicy('g1', { join_approval_required: false })
      .catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 404 })
    expect((error as Error).message).toBe('群聊不存在')
  })
})

describe('groupsApi.createGroup', () => {
  it('发的是 join_approval_required，请求体里没有 join_mode', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ group_id: 'g1', group_name: '我的群聊', created_at: '2025-12-03T15:54:26.686987Z' }),
    )

    await groupsApi.createGroup({
      group_name: '我的群聊',
      group_description: '这是一个测试群',
      join_approval_required: false,
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(GROUPS_BASE)
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({
      group_name: '我的群聊',
      group_description: '这是一个测试群',
      join_approval_required: false,
    })
    // doc:74-75：继续传 join_mode 不会报错，服务端静默丢弃 ⇒ 群按默认「需审核」
    // 建出来。没有任何运行期信号，只能靠这条断言。
    expect(body).not.toHaveProperty('join_mode')
  })

  it('不传该字段时请求体里也不出现它（后端默认 true，doc:60）', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ group_id: 'g1', group_name: '我的群聊', created_at: '2025-12-03T15:54:26.686987Z' }),
    )

    await groupsApi.createGroup({ group_name: '我的群聊' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ group_name: '我的群聊' })
  })
})

describe('groupsApi.getGroupDetail', () => {
  it('从信封里解析出八个策略字段（不是从 join_mode 猜）', async () => {
    fetchMock.mockResolvedValueOnce(envelope(GROUP_INFO_DTO))

    const group = await groupsApi.getGroupDetail('g1')

    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUPS_BASE}/g1`)
    expect(group).toMatchObject({
      group_id: 'g1',
      group_name: '测试群聊',
      group_description: '这是一个测试群',
      creator_id: 'user_a',
      status: 'active',
      member_count: 5,
      join_approval_required: true,
      admin_can_approve: true,
      card_share_scope: 'all_members',
      qr_show_scope: 'all_members',
      search_scope: 'everyone',
      allow_join_via_qr: true,
      allow_join_via_search: true,
      allow_join_via_referral: true,
    })
  })

  it('空串头像归一为 null，相对路径补基址', async () => {
    fetchMock.mockResolvedValueOnce(envelope(GROUP_INFO_DTO))
    const empty = await groupsApi.getGroupDetail('g1')
    expect(empty.group_avatar_url).toBeNull()

    fetchMock.mockResolvedValueOnce(
      envelope({ ...GROUP_INFO_DTO, group_avatar_url: 'avatars/g1.png' }),
    )
    const relative = await groupsApi.getGroupDetail('g1')
    expect(relative.group_avatar_url).toBe(`${getApiBaseUrl()}/avatars/g1.png`)
  })

  it('group_description 为 null 是合法的（字段表 doc:203）', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ...GROUP_INFO_DTO, group_description: null }))

    const group = await groupsApi.getGroupDetail('g1')

    expect(group.group_description).toBeNull()
  })

  it('缺策略字段时抛错，而不是让面板上的开关渲染成一个假状态', async () => {
    const { join_approval_required: _dropped, ...missing } = GROUP_INFO_DTO
    fetchMock.mockResolvedValueOnce(envelope(missing))

    await expect(groupsApi.getGroupDetail('g1')).rejects.toThrow(/join_approval_required/)
  })

  it('八字段整块缺席（旧后端形状）时抛错，不能悄悄放行', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({
        group_id: 'g1',
        group_name: '测试群聊',
        group_avatar_url: '',
        group_description: '这是一个测试群',
        creator_id: 'user_a',
        created_at: '2025-12-03T15:54:26.686987Z',
        status: 'active',
        member_count: 5,
      }),
    )

    await expect(groupsApi.getGroupDetail('g1')).rejects.toThrow()
  })

  it('data 是数组（列表端点的形状）时抛错', async () => {
    fetchMock.mockResolvedValueOnce(envelope([GROUP_INFO_DTO]))

    await expect(groupsApi.getGroupDetail('g1')).rejects.toThrow()
  })

  it('裸响应（没有 data 包裹）时抛错，不做 json.data ?? json 兜底', async () => {
    fetchMock.mockResolvedValueOnce(ok(GROUP_INFO_DTO))

    await expect(groupsApi.getGroupDetail('g1')).rejects.toThrow(/data/)
  })

  it('403（不是本群活跃成员）透出后端原文（doc:152-154）', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, message: '你不是本群成员' }, 403))

    const error = await groupsApi.getGroupDetail('g1').catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 403 })
    expect((error as Error).message).toBe('你不是本群成员')
  })
})

// ============================================
// 批 4：加群三条链的语义（invite / apply / accept / requests）
// ============================================

/**
 * 这一批的四个方法与批 2/3 不同：它们**读对了字段也会得出错误结论**。
 * 所以每条测试断言的都是「两种结局能不能被区分开」，而不是「有没有抛错」——
 * 迁移前的实现同样不抛错（inviteMembers 丢弃 results、applyToJoin/
 * acceptInvitation 返回 undefined、getJoinRequests 返回 []），只断言
 * `resolves` / `not.toThrow()` 对它们全部通过，等于没测。
 */

/** doc:782-796 的响应样例：`data.results[]`，逐条带自己的 success/message。 */
const INVITE_OK_ROW = { user_id: 'user_b', success: true, message: '邀请已发送，待对方同意' }
/** doc:743-752 的 2026-08-21 前置行：普通成员在 allow_join_via_referral=false 的群里邀请。 */
const INVITE_FAIL_ROW = { user_id: 'user_c', success: false, message: '该群未开放好友推荐加群' }

describe('groupsApi.inviteMembers（本模块唯一的 HTTP 200 内业务失败）', () => {
  it('逐条结果原样交给调用点：部分失败与全部成功必须能区分开', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ results: [INVITE_OK_ROW, INVITE_FAIL_ROW] }))

    const { results } = await groupsApi.inviteMembers('g1', ['user_b', 'user_c'])

    // 断言逐条的值，不是「返回了个东西」：旧实现 return result.data 也返回
    // 同一个对象，区别在调用点整个丢弃它——所以真正的证据在下面的组件测试，
    // 这里钉住 api 层至少把逐条结果如实带出来。
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual(INVITE_OK_ROW)
    expect(results[1].success).toBe(false)
    // 文案逐字等于后端原文（doc:2299-2300 要求照抄，不要自己预测结果）。
    expect(results[1].message).toBe('该群未开放好友推荐加群')
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUPS_BASE}/g1/invite`)
  })

  it('全部失败仍然是 HTTP 200 + 信封 success:true，不能被当成整批异常抛掉', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ results: [INVITE_FAIL_ROW] }))

    const { results } = await groupsApi.inviteMembers('g1', ['user_c'])

    expect(results.every(row => !row.success)).toBe(true)
  })

  it('results[].success 缺失时抛错——undefined 会被任何真值判断读成一个确定结论', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ results: [{ user_id: 'user_b', message: '邀请已发送，待对方同意' }] }),
    )

    await expect(groupsApi.inviteMembers('g1', ['user_b'])).rejects.toThrow(/success/)
  })

  it('data 缺 results 时抛错，而不是返回一个没有 results 的对象', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ success: true, message: '邀请已发送' }))

    await expect(groupsApi.inviteMembers('g1', ['user_b'])).rejects.toThrow(/results/)
  })
})

describe('groupsApi.applyToJoin（source 必填 + status 两态）', () => {
  it('请求体逐字是 {source, message}——source 不是可省参数（doc:1049-1062）', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ status: 'pending', message: '申请已提交，等待管理员审核' }),
    )

    await groupsApi.applyToJoin('g1', 'search', 'hi')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${GROUPS_BASE}/g1/apply`)
    // toEqual 而不是 toMatchObject：漏发 source 是 400，多发一个键也要红。
    expect(JSON.parse(init.body as string)).toEqual({ source: 'search', message: 'hi' })
  })

  it('没有附言时不发 message 键（避免 {"message":undefined} 被序列化成 {}）', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ status: 'joined', message: '已成功加入群聊' }))

    await groupsApi.applyToJoin('g1', 'qr')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ source: 'qr' })
  })

  it('joined 与 pending 是两个不同的返回值（唯一判据，doc:1131）', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ status: 'joined', message: '已成功加入群聊' }))
    const joined = await groupsApi.applyToJoin('g1', 'search')

    fetchMock.mockResolvedValueOnce(
      envelope({ status: 'pending', message: '申请已提交，等待管理员审核' }),
    )
    const pending = await groupsApi.applyToJoin('g1', 'search')

    expect(joined).toEqual({ status: 'joined', message: '已成功加入群聊' })
    expect(pending).toEqual({ status: 'pending', message: '申请已提交，等待管理员审核' })
    expect(joined.status).not.toBe(pending.status)
  })

  it('缺 status 时抛错，不能被当成 pending 蒙混过去', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ message: '申请已提交，等待管理员审核' }))

    await expect(groupsApi.applyToJoin('g1', 'search')).rejects.toThrow(/status/)
  })

  it('status 落在 joined/pending 之外时抛错（闭集校验，不挑默认值）', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ status: 'approved', message: 'x' }))

    await expect(groupsApi.applyToJoin('g1', 'search')).rejects.toThrow(/status/)
  })

  it('缺 source 的 400 抛的是带 status 的 ApiError（不是裸 Error）', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 400, error: '缺少必填字段 source' }, 400),
    )

    const error = await groupsApi.applyToJoin('g1', 'search').catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 400 })
    expect((error as Error).message).toBe('缺少必填字段 source')
  })

  it('403（这条加群方式被群主关了）带 status=403，文案是后端通用的「权限不足」', async () => {
    // doc:1093-1099：后端没有为这一档单独定义文案，客户端只能按状态码 + source
    // 判定，所以这里断言的是 status 而不是消息体里的关键词。
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '权限不足' }, 403))

    const error = await groupsApi.applyToJoin('g1', 'referral').catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 403 })
  })
})

describe('groupsApi.acceptInvitation（同意 ≠ 入群）', () => {
  it('待审批与已入群是两个不同的返回值（doc:1213-1231 的两份样例）', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ success: true, message: '已同意邀请，等待管理员审核' }),
    )
    const pending = await groupsApi.acceptInvitation('r1')

    fetchMock.mockResolvedValueOnce(envelope({ success: true, message: '已成功加入群聊' }))
    const joined = await groupsApi.acceptInvitation('r1')

    expect(pending).toEqual({ success: true, message: '已同意邀请，等待管理员审核' })
    expect(joined).toEqual({ success: true, message: '已成功加入群聊' })
    // 两种结局的内层 success 恒为 true——它不是判据，message 才不同。
    expect(pending.success).toBe(joined.success)
    expect(pending.message).not.toBe(joined.message)
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUPS_BASE}/invitations/r1/accept`)
  })

  it('body 里没有 data 时抛错，而不是 resolve 成 undefined', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200 }))

    await expect(groupsApi.acceptInvitation('r1')).rejects.toThrow()
  })

  it('403（allow_join_via_referral 关掉后的存量 member_invite）带 status=403', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '权限不足' }, 403))

    const error = await groupsApi.acceptInvitation('r1').catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 403 })
  })
})

/**
 * 待审申请行。字段名 `message`（不是 `reason`）、`request_type` / `user_accepted`
 * 来自 doc:1258-1260 与 doc:1280-1288。
 */
const JOIN_REQUEST_ROW = {
  request_id: 'q1',
  user_id: 'u9',
  user_nickname: '张三',
  user_avatar_url: '',
  message: '求进群',
  request_type: 'search_apply',
  user_accepted: false,
  created_at: '2026-01-01T00:00:00Z',
}

describe('groupsApi.getJoinRequests（删掉 result.data || []）', () => {
  it('data.requests 形状：断言行数与字段值', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ requests: [JOIN_REQUEST_ROW] }))

    const result = await groupsApi.getJoinRequests('g1')

    expect(result).toHaveLength(1)
    expect(result[0].request_id).toBe('q1')
    // 附言在后端叫 message；UI 此前读的 reason 是个从不存在的响应字段。
    expect(result[0].message).toBe('求进群')
    expect(result[0].request_type).toBe('search_apply')
    expect(result[0].user_accepted).toBe(false)
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUPS_BASE}/g1/requests`)
  })

  it('data 是裸数组时同样解析（本端点没有响应样例，两种形状都收）', async () => {
    fetchMock.mockResolvedValueOnce(envelope([JOIN_REQUEST_ROW]))

    const result = await groupsApi.getJoinRequests('g1')

    expect(result).toHaveLength(1)
    expect(result[0].request_id).toBe('q1')
  })

  it('data 是既不带 requests 也不是数组的对象 ⇒ 抛错，不是变成空列表', async () => {
    fetchMock.mockResolvedValueOnce(envelope({}))

    await expect(groupsApi.getJoinRequests('g1')).rejects.toThrow(/requests 应为数组/)
  })

  /**
   * finding 3：两种形状都收的容忍此前没有任何运行时信号——`until: 2026-12-31`
   * 只活在注释里，没人能靠日志证明线上到底命中了哪一支。现在两支各打一条
   * `console.warn`，格式仿 `apiEnvelope.ts` 的 `legacyBare` 命中日志
   * （同一个 `[api-envelope]` 前缀，`grep` 得到），不是新开一条上报通道。
   */
  describe('容器形状的猜测分支：运行时信号（finding 3）', () => {
    it('data.requests 形状命中时，打一条标明"{requests:[...]}"分支的信号', async () => {
      const warn = console.warn as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce(envelope({ requests: [JOIN_REQUEST_ROW] }))

      await groupsApi.getJoinRequests('g1')

      expect(warn).toHaveBeenCalledTimes(1)
      const [message] = warn.mock.calls[0] as [string]
      expect(message).toContain('[api-envelope]')
      expect(message).toContain('GET /api/groups/{group_id}/requests')
      expect(message).toContain('{requests:[...]}')
      expect(message).not.toContain('裸数组')
    })

    it('裸数组形状命中时，打一条标明"裸数组"分支的信号', async () => {
      const warn = console.warn as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce(envelope([JOIN_REQUEST_ROW]))

      await groupsApi.getJoinRequests('g1')

      expect(warn).toHaveBeenCalledTimes(1)
      const [message] = warn.mock.calls[0] as [string]
      expect(message).toContain('[api-envelope]')
      expect(message).toContain('裸数组')
      expect(message).not.toContain('{requests:[...]}')
    })

    it('形状既不是裸数组也不是 {requests:[...]} 时不打信号——那不是"猜对了"', async () => {
      const warn = console.warn as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce(envelope({}))

      await expect(groupsApi.getJoinRequests('g1')).rejects.toThrow(/requests 应为数组/)

      expect(warn).not.toHaveBeenCalled()
    })
  })

  it('data.requests 为 null ⇒ 抛错（`|| []` 会把它变成"暂无申请"）', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ requests: null }))

    await expect(groupsApi.getJoinRequests('g1')).rejects.toThrow(/requests 应为数组/)
  })

  it('HTTP 200 + success:false ⇒ 抛后端原文，不是空列表', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 500, message: '数据库连接失败' }))

    await expect(groupsApi.getJoinRequests('g1')).rejects.toThrow('数据库连接失败')
  })

  it('403（admin_can_approve=false 的管理员）抛 status=403，不是"暂无申请"', async () => {
    // doc:1255-1256 / doc:1871：这条 403 此前被 catch 成空列表，管理员看到
    // 「暂无加入申请」，而群里躺着 5 条待审。
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '权限不足' }, 403))

    const error = await groupsApi.getJoinRequests('g1').catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 403 })
    expect(error).not.toEqual([])
  })

  it('申请人相对头像补成绝对地址，null 保持 null（不能变成空串）', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ requests: [{ ...JOIN_REQUEST_ROW, user_avatar_url: 'avatars/u9.png?t=1' }] }),
    )
    const [withAvatar] = await groupsApi.getJoinRequests('g1')
    expect(withAvatar.user_avatar_url).toBe(`${getApiBaseUrl()}/avatars/u9.png?t=1`)

    fetchMock.mockResolvedValueOnce(
      envelope({ requests: [{ ...JOIN_REQUEST_ROW, user_avatar_url: null }] }),
    )
    const [withoutAvatar] = await groupsApi.getJoinRequests('g1')
    expect(withoutAvatar.user_avatar_url).toBeNull()

    // 空串同样归一成 null：<AvatarImage src=""> 会打一次指向当前页的请求。
    // `JOIN_REQUEST_ROW` 本身就带 `user_avatar_url: ''`（第 788 行），这里
    // 才是真正驱动那个默认值走一遍的用例——上面两条各自显式传了非空/null，
    // 谁都没有替空串这条分支断言过。
    fetchMock.mockResolvedValueOnce(
      envelope({ requests: [{ ...JOIN_REQUEST_ROW, user_avatar_url: '' }] }),
    )
    const [emptyAvatar] = await groupsApi.getJoinRequests('g1')
    expect(emptyAvatar.user_avatar_url).toBeNull()
    expect(emptyAvatar.user_avatar_url).not.toBe('')
  })

  it('user_nickname 为 null（users JOIN 缺失）是合法的，不抛错', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ requests: [{ ...JOIN_REQUEST_ROW, user_nickname: null }] }),
    )

    const [row] = await groupsApi.getJoinRequests('g1')

    expect(row.user_nickname).toBeNull()
  })

  it('request_type 落在四类闭集之外时抛错（doc:1280-1288）', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ requests: [{ ...JOIN_REQUEST_ROW, request_type: 'invite_code' }] }),
    )

    await expect(groupsApi.getJoinRequests('g1')).rejects.toThrow(/request_type/)
  })

  it('缺 user_accepted 时抛错——邀请行少了它就无法分辨对方同意没有', async () => {
    const { user_accepted: _dropped, ...missing } = JOIN_REQUEST_ROW
    fetchMock.mockResolvedValueOnce(envelope({ requests: [missing] }))

    await expect(groupsApi.getJoinRequests('g1')).rejects.toThrow(/user_accepted/)
  })
})

/**
 * 批 5：群头像改走 storage 的四步预签名链路。
 *
 * `POST /api/groups/{group_id}/avatar`（multipart）于 2026-08-28 删除、无兼容层
 * （doc:250-252），今天调用它只会拿到 404——而旧实现拿 404 的响应体去读
 * `result.data.avatar_url`，抛的是一句 `Cannot read properties of undefined`，
 * 指不到"端点没了"这个真正的原因。
 *
 * 这一组用例的纪律：**第 1 步的请求体必须逐字段断言**，不能用快照。
 * 少一个 `avatar_target` 或 `related_id` 都是 400（doc:364-365），
 * 而快照会在"顺手更新一下"里把这种回归批准掉。
 */
describe('groupsApi.uploadGroupAvatar（四步预签名链路）', () => {
  const STORAGE_BASE = `${getApiBaseUrl()}/api/storage`
  const GROUP_ID = '019ae4ec-0dfe-7ac1-966e-876e9755561c'

  const pngFile = () => new File(['x'], 'logo.png', { type: 'image/png' })

  /** 头像档的 upload/request 响应：一片（doc:270-284 的链路示例说明群头像通常 1 片）。 */
  const AVATAR_SESSION = {
    mode: 'multipart',
    preview_support: 'inline_preview',
    multipart_upload_id: 'upload-id-avatar',
    expires_in: 3600,
    chunk_size: 31457280,
    total_chunks: 1,
    file_key: `group-${GROUP_ID}.png`,
    max_file_size: 10485760,
    instant_upload: false,
    existing_file_url: null,
  }

  const PART_URL_DATA = {
    part_url: 'https://api.huanvae.cn/avatars/x?uploadId=u&partNumber=1&X-Amz-Signature=sig',
    part_number: 1,
    expires_in: 3600,
  }

  /** doc:290-302：`file_url` 是**相对路径** + `?t=` 缓存戳。 */
  const AVATAR_CONFIRM_DATA = {
    file_url: `avatars/group-${GROUP_ID}.png?t=1706000000`,
    file_key: `group-${GROUP_ID}.png`,
    file_size: 40960,
    content_type: 'image/png',
    preview_support: 'inline_preview',
  }

  const mockHappyPath = () => {
    fetchMock
      .mockResolvedValueOnce(envelope(AVATAR_SESSION))
      .mockResolvedValueOnce(envelope(PART_URL_DATA))
      .mockResolvedValueOnce(envelope(AVATAR_CONFIRM_DATA))
  }

  beforeEach(() => {
    // calculateFileHash 走 crypto.subtle，与本次迁移无关，固定掉以免依赖运行环境。
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
    // 第 3 步是往预签名 URL 直接 PUT 字节（XMLHttpRequest），不经 fetch。
    vi.spyOn(storageApi, 'uploadChunk').mockResolvedValue(undefined)
  })

  it('四步按顺序发出，且第 1 步的请求体逐字段与 doc:270-284 一致', async () => {
    mockHappyPath()

    await groupsApi.uploadGroupAvatar(GROUP_ID, pngFile())

    expect(fetchMock).toHaveBeenCalledTimes(3)

    // 1) upload/request
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toBe(`${STORAGE_BASE}/upload/request`)
    expect(requestInit.method).toBe('POST')
    expect(JSON.parse(String(requestInit.body))).toEqual({
      file_type: 'avatar',
      storage_location: 'avatars',
      avatar_target: 'group_avatar',
      related_id: GROUP_ID,
      filename: 'logo.png',
      file_size: 1,
      content_type: 'image/png',
      file_hash: '0'.repeat(64),
    })

    // 2) part_url
    const partUrlRequest = String(fetchMock.mock.calls[1][0])
    expect(partUrlRequest).toContain(`${STORAGE_BASE}/multipart/part_url?`)
    expect(partUrlRequest).toContain('upload_id=upload-id-avatar')
    expect(partUrlRequest).toContain('part_number=1')
    expect(partUrlRequest).not.toContain('undefined')

    // 3) PUT 字节到预签名 URL（不经 fetch）。part_url 本就是绝对地址，出口只把
    //    正式域名的 origin 换成当前基址（本机是去 SNI 反代），**签名逐字保留**——
    //    路径与 query 少一个字节，MinIO 就会拒掉这一片。
    expect(storageApi.uploadChunk).toHaveBeenCalledTimes(1)
    const putTarget = String(
      (storageApi.uploadChunk as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
    )
    expect(putTarget).toBe(
      `${getApiBaseUrl()}/avatars/x?uploadId=u&partNumber=1&X-Amz-Signature=sig`,
    )
    expect(putTarget.endsWith(PART_URL_DATA.part_url.slice('https://api.huanvae.cn'.length))).toBe(
      true,
    )

    // 4) confirm
    const [confirmUrl, confirmInit] = fetchMock.mock.calls[2] as [string, RequestInit]
    expect(confirmUrl).toBe(`${STORAGE_BASE}/upload/confirm`)
    expect(JSON.parse(String(confirmInit.body))).toEqual({ file_key: `group-${GROUP_ID}.png` })
  })

  it('没有任何一次请求打到已删除的 POST /api/groups/{id}/avatar', async () => {
    mockHappyPath()

    await groupsApi.uploadGroupAvatar(GROUP_ID, pngFile())

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.some((url) => url.includes(`${GROUPS_BASE}/${GROUP_ID}/avatar`))).toBe(false)
    expect(urls.some((url) => url.endsWith('/avatar'))).toBe(false)
    // multipart/form-data 的形态也一并钉住：链路上没有任何一个 FormData body。
    const bodies = fetchMock.mock.calls.map((call) => (call[1] as RequestInit | undefined)?.body)
    expect(bodies.some((body) => body instanceof FormData)).toBe(false)
  })

  it('confirm 的相对 file_url 在 api 出口补成绝对地址（组件里不再拼基址）', async () => {
    mockHappyPath()

    const result = await groupsApi.uploadGroupAvatar(GROUP_ID, pngFile())

    expect(result.file_url).toBe(
      `${getApiBaseUrl()}/avatars/group-${GROUP_ID}.png?t=1706000000`,
    )
    // 不能是相对路径原样返回——那也是"非 undefined"，只断言真假抓不出来。
    expect(result.file_url.startsWith('http')).toBe(true)
    expect(result.file_key).toBe(`group-${GROUP_ID}.png`)
  })

  it('第 1 步的 403 透出后端原文，且不再往下走链路', async () => {
    // doc:285-287 / doc:366：非群主/管理员在签发预签名 URL 之前就被拒。
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 403, message: '只有群主或管理员可以修改群头像' }, 403),
    )

    const error = await groupsApi.uploadGroupAvatar(GROUP_ID, pngFile()).catch((e: unknown) => e)

    expect(error).toMatchObject({ name: 'ApiError', status: 403 })
    expect((error as Error).message).toBe('只有群主或管理员可以修改群头像')
    // 自造文案会把这句话盖掉
    expect((error as Error).message).not.toBe('上传群头像失败')
    // part_url / confirm 一步都没发
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('409（会话被同一个群的新请求接管）可分诊，且不自动重试', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope(AVATAR_SESSION))
      .mockResolvedValueOnce(
        ok(
          {
            success: false,
            code: 409,
            message: '该上传会话已被同一目标的新请求接管，请重新发起上传',
          },
          409,
        ),
      )

    const error = await groupsApi.uploadGroupAvatar(GROUP_ID, pngFile()).catch((e: unknown) => e)

    expect(isUploadSessionExpired(error)).toBe(true)
    expect((error as ApiError).status).toBe(409)
    expect((error as Error).message).toBe('该上传会话已被同一目标的新请求接管，请重新发起上传')
    // 400 与 409 必须分得开：前者改一下参数还能成，后者必须整条重来
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 400, message: '上传会话不存在，请重新发起上传' }, 400),
    )
    const notExpired = await groupsApi
      .uploadGroupAvatar(GROUP_ID, pngFile())
      .catch((e: unknown) => e)
    expect(isUploadSessionExpired(notExpired)).toBe(false)

    // 没有静默重试：第一次是 request + part_url 两发就停，第二次一发就停
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('单飞：同一个群第二次并发上传被就地拒绝，不会再发一条 upload/request', async () => {
    // doc:369 / storage 文档 :643-646：群头像 object key 由群 ID 决定，群主与任一
    // 管理员落在同一行会话上，后发的 request 会接管先手方，先手方之后每一次
    // part_url / confirm 都变 409。文档给的处方是防抖/单飞。
    let releaseFirstRequest: (value: Response) => void = () => {}
    const pendingRequest = new Promise<Response>((resolve) => {
      releaseFirstRequest = resolve
    })
    fetchMock
      .mockReturnValueOnce(pendingRequest)
      .mockResolvedValueOnce(envelope(PART_URL_DATA))
      .mockResolvedValueOnce(envelope(AVATAR_CONFIRM_DATA))

    const first = groupsApi.uploadGroupAvatar(GROUP_ID, pngFile())
    // 让第一次走到 fetch（calculateFileHash 是异步的，要把微任务放完）
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await expect(groupsApi.uploadGroupAvatar(GROUP_ID, pngFile())).rejects.toThrow(/正在上传中/)
    // 关键断言：第二次**没有**发出第二条 upload/request 去接管第一次的会话
    expect(fetchMock).toHaveBeenCalledTimes(1)

    releaseFirstRequest(envelope(AVATAR_SESSION))
    await expect(first).resolves.toMatchObject({ file_key: `group-${GROUP_ID}.png` })

    // 第一次结束后单飞位释放，同一个群可以重新上传
    fetchMock
      .mockResolvedValueOnce(envelope(AVATAR_SESSION))
      .mockResolvedValueOnce(envelope(PART_URL_DATA))
      .mockResolvedValueOnce(envelope(AVATAR_CONFIRM_DATA))
    await expect(groupsApi.uploadGroupAvatar(GROUP_ID, pngFile())).resolves.toBeTruthy()
  })

  it('超 10MB / 非白名单格式在本地就拒掉，一条请求都不发', async () => {
    const huge = new File([], 'big.png', { type: 'image/png' })
    Object.defineProperty(huge, 'size', { value: 10 * 1024 * 1024 + 1 })

    await expect(groupsApi.uploadGroupAvatar(GROUP_ID, huge)).rejects.toThrow(/最大 10MB/)
    await expect(
      groupsApi.uploadGroupAvatar(GROUP_ID, new File(['x'], 'a.bmp', { type: 'image/bmp' })),
    ).rejects.toThrow(/不支持的文件格式/)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
