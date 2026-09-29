import { addMember, approversOf, inviteToGroup, joinRequestFrame } from '../actions'
import type { Ctx } from '../http'
import { badRequest, forbidden, notFound, ok, okResult, optionalString, type Route, readJson, requireString, route } from '../http'
import { uuid } from '../random'
import {
  activeGroup,
  canApprove,
  groupInfoDto,
  groupsOf,
  invitationDto,
  isAdminOrOwner,
  joinRequestDto,
  memberDto,
  mustUser,
  myGroupDto,
  noticeDto,
  publicGroupDto,
  sentJoinRequestDto,
  W,
} from '../state'
import { iso, MINUTE } from '../time'
import type { GroupRec, GroupRequestRec, JoinPolicy, MemberRec } from '../types'
import { pushToUser, pushToUsers, systemNotification } from '../ws'

/**
 * `/api/groups/*`，对着 `群聊管理.md` 与前端 `src/features/chat/api/groups.ts` 的解析器写。
 *
 * 权限口径（全模块统一）：群不存在 ⇒ 404；群存在但调用者无权 ⇒ 403。
 * `SuccessResponse{success,message}` 一律嵌在信封 `data` 里（{@link okResult}）。
 */

const SHARE_SCOPES = ['all_members', 'admins', 'owner_only'] as const
const SEARCH_SCOPES = ['everyone', 'admins', 'owner_only'] as const
const INVITE_TYPES = ['owner_invite', 'admin_invite', 'member_invite'] as const
const ROLE_ORDER = { owner: 0, admin: 1, member: 2 } as const

function memberOrForbid(group: GroupRec, userId: string): MemberRec {
  const member = group.members.get(userId)
  if (!member) forbidden('你不是本群活跃成员')
  return member
}

function requireAdmin(group: GroupRec, userId: string): void {
  memberOrForbid(group, userId)
  if (!isAdminOrOwner(group, userId)) forbidden('权限不足，仅群主或管理员可操作')
}

function requireOwner(group: GroupRec, userId: string): void {
  if (group.members.get(userId)?.role !== 'owner') forbidden('权限不足，仅群主可操作')
}

function notify(group: GroupRec, type: string, data: Record<string, unknown>, except?: string): void {
  pushToUsers(group.members.keys(), systemNotification(type, { group_id: group.group_id, group_name: group.name, ...data }), except)
}

const operator = (ctx: Ctx) => ({ operator_id: ctx.me.user_id, operator_nickname: ctx.me.nickname })

function pendingOf(groupId: string, requestId: string): GroupRequestRec {
  const r = W().groupRequests.find((x) => x.request_id === requestId && x.group_id === groupId && x.status === 'pending')
  if (!r) notFound('申请不存在或已处理')
  return r
}

function applyPolicyPatch(policy: JoinPolicy, body: Record<string, unknown>): void {
  for (const key of ['join_approval_required', 'admin_can_approve', 'allow_join_via_qr', 'allow_join_via_search', 'allow_join_via_referral'] as const) {
    if (body[key] === undefined) continue
    if (typeof body[key] !== 'boolean') badRequest(`${key} 必须是布尔值`)
    policy[key] = body[key] as boolean
  }
  for (const key of ['card_share_scope', 'qr_show_scope'] as const) {
    if (body[key] === undefined) continue
    if (!(SHARE_SCOPES as readonly unknown[]).includes(body[key])) badRequest(`${key} 取值必须是 all_members / admins / owner_only`)
    policy[key] = body[key] as JoinPolicy[typeof key]
  }
  if (body.search_scope !== undefined) {
    // 最松档叫 everyone，传 all_members 会被拒（`群聊管理.md:210`）
    if (!(SEARCH_SCOPES as readonly unknown[]).includes(body.search_scope)) badRequest('search_scope 取值必须是 everyone / admins / owner_only')
    policy.search_scope = body.search_scope as JoinPolicy['search_scope']
  }
}

function scopeAllows(scope: 'all_members' | 'admins' | 'owner_only', role: MemberRec['role']): boolean {
  if (scope === 'all_members') return true
  if (scope === 'admins') return role === 'owner' || role === 'admin'
  return role === 'owner'
}

export const groupRoutes: Route[] = [
  route('POST', '/api/groups', (ctx) => {
    const body = readJson(ctx)
    const name = requireString(body, 'group_name').trim()
    if (name.length > 50) badRequest('群名称最长 50 个字符')
    const now = iso(Date.now())
    const group: GroupRec = {
      group_id: uuid(),
      name,
      avatar: null,
      description: optionalString(body, 'group_description') || null,
      creator_id: ctx.me.user_id,
      created_at: now,
      status: 'active',
      policy: {
        join_approval_required: body.join_approval_required !== false,
        admin_can_approve: true,
        card_share_scope: 'all_members',
        qr_show_scope: 'all_members',
        search_scope: 'everyone',
        allow_join_via_qr: true,
        allow_join_via_search: true,
        allow_join_via_referral: true,
      },
      members: new Map([[ctx.me.user_id, { user_id: ctx.me.user_id, role: 'owner', group_nickname: null, joined_at: now, join_method: 'create', muted_until: null, last_read_seq: 0 }]]),
      seq: 0,
      messages: [],
      notices: [],
    }
    W().groups.set(group.group_id, group)
    return ok({ group_id: group.group_id, group_name: group.name, created_at: now })
  }),

  route('GET', '/api/groups/my', (ctx) => {
    const rows = groupsOf(ctx.me.user_id).map((g) => myGroupDto(g, ctx.me.user_id))
    rows.sort((a, b) => (b.last_message_time ?? '').localeCompare(a.last_message_time ?? ''))
    return ok(rows)
  }),

  route('GET', '/api/groups/invitations', (ctx) =>
    ok({
      invitations: W()
        .groupRequests.filter((r) => r.user_id === ctx.me.user_id && r.status === 'pending' && !r.user_accepted && (INVITE_TYPES as readonly string[]).includes(r.request_type))
        .filter((r) => W().groups.get(r.group_id)?.status === 'active')
        .map(invitationDto),
    }),
  ),

  route('GET', '/api/groups/requests/sent', (ctx) =>
    ok({ requests: W().groupRequests.filter((r) => r.user_id === ctx.me.user_id && r.status === 'pending' && r.request_type === 'search_apply').map(sentJoinRequestDto) }),
  ),

  route('POST', '/api/groups/invitations/:requestId/accept', (ctx) => {
    const r = W().groupRequests.find((x) => x.request_id === ctx.params.requestId && x.user_id === ctx.me.user_id && x.status === 'pending')
    if (!r) notFound('邀请不存在或已处理')
    const group = activeGroup(r.group_id)
    if (r.request_type === 'member_invite' && !group.policy.allow_join_via_referral) forbidden('权限不足')
    if (!group.policy.join_approval_required) {
      r.status = 'approved'
      r.user_accepted = true
      addMember(group, ctx.me.user_id, r.request_type, r.inviter_id)
      return okResult('已成功加入群聊')
    }
    r.user_accepted = true
    pushToUsers(approversOf(group), joinRequestFrame(group, ctx.me.user_id, r.message, r.request_id, r.inviter_id))
    return okResult('已同意邀请，等待管理员审核')
  }),

  route('POST', '/api/groups/invitations/:requestId/decline', (ctx) => {
    const r = W().groupRequests.find((x) => x.request_id === ctx.params.requestId && x.user_id === ctx.me.user_id && x.status === 'pending')
    if (!r) notFound('邀请不存在或已处理')
    r.status = 'declined'
    return okResult('已拒绝邀请')
  }),

  route('GET', '/api/groups/:groupId', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    memberOrForbid(group, ctx.me.user_id)
    return ok(groupInfoDto(group))
  }),

  route('PUT', '/api/groups/:groupId', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireAdmin(group, ctx.me.user_id)
    const body = readJson(ctx)
    const oldName = group.name
    const name = optionalString(body, 'group_name')
    const description = optionalString(body, 'group_description')
    const avatar = optionalString(body, 'group_avatar_url')
    if (name !== undefined) {
      if (name.trim() === '' || name.length > 50) badRequest('群名称长度需为 1-50 个字符')
      group.name = name.trim()
    }
    if (description !== undefined) group.description = description === '' ? null : description
    if (avatar !== undefined) group.avatar = avatar === '' ? null : avatar
    notify(group, 'group_info_updated', { group_name: oldName, new_name: name ?? null, new_description: description ?? null, ...operator(ctx), updated_at: iso(Date.now()) })
    return okResult('群信息已更新')
  }),

  route('DELETE', '/api/groups/:groupId', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireOwner(group, ctx.me.user_id)
    group.status = 'disbanded'
    notify(group, 'group_disbanded', { disbanded_by: ctx.me.user_id })
    return okResult('群聊已解散')
  }),

  route('GET', '/api/groups/:groupId/public', (ctx) => ok(publicGroupDto(activeGroup(ctx.params.groupId)))),

  route('GET', '/api/groups/:groupId/qr', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    const member = memberOrForbid(group, ctx.me.user_id)
    if (!scopeAllows(group.policy.qr_show_scope, member.role)) forbidden('权限不足')
    return ok({ group_id: group.group_id, payload: `huanvae://group/join?id=${group.group_id}`, group_name: group.name, group_avatar_url: group.avatar ?? '', member_count: group.members.size })
  }),

  route('PUT', '/api/groups/:groupId/nickname', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    const member = memberOrForbid(group, ctx.me.user_id)
    const body = readJson(ctx)
    const nickname = body.nickname === null ? null : optionalString(body, 'nickname')
    if (typeof nickname === 'string' && nickname.length > 30) badRequest('群昵称最长 30 个字符')
    member.group_nickname = nickname ? nickname : null
    return okResult('群昵称已更新')
  }),

  route('PUT', '/api/groups/:groupId/join-policy', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    memberOrForbid(group, ctx.me.user_id)
    requireOwner(group, ctx.me.user_id)
    applyPolicyPatch(group.policy, readJson(ctx))
    return ok({ ...group.policy })
  }),

  route('GET', '/api/groups/:groupId/members', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    memberOrForbid(group, ctx.me.user_id)
    const members = [...group.members.values()].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joined_at.localeCompare(b.joined_at)).map(memberDto)
    return ok({ members, total: members.length })
  }),

  route('POST', '/api/groups/:groupId/invite', (ctx) => {
    const body = readJson(ctx)
    const userIds = Array.isArray(body.user_ids) ? body.user_ids.filter((x): x is string => typeof x === 'string') : badRequest('缺少字段 user_ids')
    if (userIds.length === 0) badRequest('user_ids 不能为空')
    return ok({ results: inviteToGroup(ctx.me.user_id, ctx.params.groupId, userIds, optionalString(body, 'message') ?? null) })
  }),

  route('POST', '/api/groups/:groupId/leave', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    const member = memberOrForbid(group, ctx.me.user_id)
    if (member.role === 'owner') badRequest('群主不能退出群聊，请先转让群主或解散群聊')
    group.members.delete(ctx.me.user_id)
    return okResult('已退出群聊')
  }),

  route('DELETE', '/api/groups/:groupId/members/:userId', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireAdmin(group, ctx.me.user_id)
    const target = group.members.get(ctx.params.userId)
    if (!target) notFound('该用户不是群成员')
    if (target.role === 'owner') forbidden('不能移除群主')
    if (target.role === 'admin' && group.members.get(ctx.me.user_id)?.role !== 'owner') forbidden('管理员不能移除其他管理员')
    group.members.delete(target.user_id)
    pushToUser(target.user_id, systemNotification('group_removed', { group_id: group.group_id, group_name: group.name, removed_by: ctx.me.user_id, reason: '' }))
    return okResult('已移出群聊')
  }),

  route('POST', '/api/groups/:groupId/transfer', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireOwner(group, ctx.me.user_id)
    const target = group.members.get(requireString(readJson(ctx), 'new_owner_id'))
    if (!target) badRequest('新群主必须是群成员')
    if (target.user_id === ctx.me.user_id) badRequest('不能转让给自己')
    const self = group.members.get(ctx.me.user_id) as MemberRec
    self.role = 'member'
    target.role = 'owner'
    notify(group, 'owner_transferred', {
      old_owner_id: ctx.me.user_id, old_owner_nickname: ctx.me.nickname, new_owner_id: target.user_id, new_owner_nickname: mustUser(target.user_id).nickname, transferred_at: iso(Date.now()),
    })
    return okResult('群主已转让')
  }),

  route('POST', '/api/groups/:groupId/admins', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireOwner(group, ctx.me.user_id)
    const target = group.members.get(requireString(readJson(ctx), 'user_id'))
    if (!target) badRequest('该用户不是群成员')
    if (target.role !== 'member') badRequest('对方已是管理员或群主')
    target.role = 'admin'
    notify(group, 'admin_set', { target_user_id: target.user_id, target_nickname: mustUser(target.user_id).nickname, ...operator(ctx), set_at: iso(Date.now()) })
    return okResult('已设置为管理员')
  }),

  route('DELETE', '/api/groups/:groupId/admins/:userId', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireOwner(group, ctx.me.user_id)
    const target = group.members.get(ctx.params.userId)
    if (target?.role !== 'admin') badRequest('对方不是管理员')
    target.role = 'member'
    notify(group, 'admin_removed', { target_user_id: target.user_id, target_nickname: mustUser(target.user_id).nickname, ...operator(ctx), removed_at: iso(Date.now()) })
    return okResult('已取消管理员')
  }),

  route('POST', '/api/groups/:groupId/mute', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireAdmin(group, ctx.me.user_id)
    const body = readJson(ctx)
    const target = group.members.get(requireString(body, 'user_id'))
    if (!target) badRequest('该用户不是群成员')
    if (target.role === 'owner') forbidden('不能禁言群主')
    if (target.role === 'admin' && group.members.get(ctx.me.user_id)?.role !== 'owner') forbidden('管理员不能禁言其他管理员')
    const minutes = Number(body.duration_minutes)
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 43200) badRequest('duration_minutes 须在 1-43200 之间')
    const mutedUntil = iso(Date.now() + minutes * MINUTE)
    target.muted_until = mutedUntil
    notify(group, 'member_muted', { target_user_id: target.user_id, target_nickname: mustUser(target.user_id).nickname, ...operator(ctx), mute_until: mutedUntil, reason: '', muted_at: iso(Date.now()) })
    return okResult('已禁言', { muted_until: mutedUntil })
  }),

  route('DELETE', '/api/groups/:groupId/mute/:userId', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireAdmin(group, ctx.me.user_id)
    const target = group.members.get(ctx.params.userId)
    if (!target) badRequest('该用户不是群成员')
    target.muted_until = null
    notify(group, 'member_unmuted', { target_user_id: target.user_id, target_nickname: mustUser(target.user_id).nickname, ...operator(ctx), unmuted_at: iso(Date.now()) })
    return okResult('已解除禁言')
  }),

  route('POST', '/api/groups/:groupId/apply', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    const body = readJson(ctx)
    const source = body.source
    if (source !== 'qr' && source !== 'search' && source !== 'referral') badRequest('source 必须是 qr / search / referral 之一')
    if (group.members.has(ctx.me.user_id)) badRequest('已是该群成员')
    const allowed = source === 'qr' ? group.policy.allow_join_via_qr : source === 'search' ? group.policy.allow_join_via_search : group.policy.allow_join_via_referral
    if (!allowed) forbidden('权限不足')
    if (W().groupRequests.some((r) => r.group_id === group.group_id && r.user_id === ctx.me.user_id && r.status === 'pending')) badRequest('已有待审核的入群记录')
    const message = optionalString(body, 'message') ?? null
    if (!group.policy.join_approval_required) {
      addMember(group, ctx.me.user_id, source === 'search' ? 'search_direct' : `${source}_direct`, null)
      return ok({ status: 'joined', message: '已加入群聊' })
    }
    const request: GroupRequestRec = {
      request_id: uuid(), group_id: group.group_id, user_id: ctx.me.user_id, inviter_id: null, message, request_type: 'search_apply',
      user_accepted: true, status: 'pending', created_at: iso(Date.now()), expires_at: null,
    }
    W().groupRequests.push(request)
    pushToUsers(approversOf(group), joinRequestFrame(group, ctx.me.user_id, message, request.request_id, null))
    return ok({ status: 'pending', message: '申请已提交，等待群主或管理员审核' })
  }),

  route('GET', '/api/groups/:groupId/requests', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    memberOrForbid(group, ctx.me.user_id)
    if (!canApprove(group, ctx.me.user_id)) forbidden('权限不足')
    return ok({ requests: W().groupRequests.filter((r) => r.group_id === group.group_id && r.status === 'pending').map(joinRequestDto) })
  }),

  route('POST', '/api/groups/:groupId/requests/:requestId/approve', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    memberOrForbid(group, ctx.me.user_id)
    if (!canApprove(group, ctx.me.user_id)) forbidden('权限不足')
    const r = pendingOf(group.group_id, ctx.params.requestId)
    if (!r.user_accepted) badRequest('被邀请人尚未同意邀请')
    r.status = 'approved'
    addMember(group, r.user_id, r.request_type === 'search_apply' ? 'search_approved' : r.request_type, ctx.me.user_id)
    return okResult('已同意入群申请')
  }),

  route('POST', '/api/groups/:groupId/requests/:requestId/reject', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    memberOrForbid(group, ctx.me.user_id)
    if (!canApprove(group, ctx.me.user_id)) forbidden('权限不足')
    pendingOf(group.group_id, ctx.params.requestId).status = 'rejected'
    return okResult('已拒绝入群申请')
  }),

  route('POST', '/api/groups/:groupId/notices', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireAdmin(group, ctx.me.user_id)
    const body = readJson(ctx)
    const now = iso(Date.now())
    const notice = { id: uuid(), title: requireString(body, 'title'), content: requireString(body, 'content'), publisher_id: ctx.me.user_id, published_at: now, is_pinned: body.is_pinned === true, updated_at: now }
    group.notices.push(notice)
    notify(group, 'group_notice_updated', {
      notice_id: notice.id, title: notice.title, content_preview: notice.content.slice(0, 50), publisher_id: ctx.me.user_id, publisher_nickname: ctx.me.nickname,
    })
    return ok({ id: notice.id, published_at: now })
  }),

  route('GET', '/api/groups/:groupId/notices', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    memberOrForbid(group, ctx.me.user_id)
    const notices = [...group.notices].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.published_at.localeCompare(a.published_at))
    return ok({ notices: notices.map(noticeDto) })
  }),

  route('PUT', '/api/groups/:groupId/notices/:noticeId', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireAdmin(group, ctx.me.user_id)
    const notice = group.notices.find((n) => n.id === ctx.params.noticeId)
    if (!notice) notFound('公告不存在')
    const body = readJson(ctx)
    const title = optionalString(body, 'title')
    const content = optionalString(body, 'content')
    if (title !== undefined) notice.title = title
    if (content !== undefined) notice.content = content
    if (typeof body.is_pinned === 'boolean') notice.is_pinned = body.is_pinned
    notice.updated_at = iso(Date.now())
    return okResult('公告已更新')
  }),

  route('DELETE', '/api/groups/:groupId/notices/:noticeId', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    requireAdmin(group, ctx.me.user_id)
    const index = group.notices.findIndex((n) => n.id === ctx.params.noticeId)
    if (index < 0) notFound('公告不存在')
    group.notices.splice(index, 1)
    return okResult('公告已删除')
  }),
]

