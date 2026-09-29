import { notFound } from './http'
import { convIdOf, fileFields, pairKey, previewOf } from './model'
import { makeClock } from './time'
import type {
  ChatMessageRec,
  FriendConvRec,
  FriendRequestRec,
  GroupRec,
  GroupRequestRec,
  MemberRec,
  NoticeRec,
  UserRec,
  World,
} from './types'
import { buildWorld } from './world'

/**
 * 运行时的世界：当前状态、查询、以及**线上形状**（`*Dto`）。
 *
 * DTO 的字段名与可空性逐条对过前端解析器（`src/features/*\/api/*.ts`、`src/api/*.ts`）
 * 与 backend-docs 的字段表；两边冲突时以前端解析器为准（任务约定），并在报告里记下差异。
 */

let world: World = buildWorld(makeClock())

export const W = (): World => world

export function resetWorld(): World {
  world = buildWorld(makeClock())
  return world
}

// ── 用户 ─────────────────────────────────────────────────

export const getUser = (userId: string): UserRec | undefined => world.users.get(userId)

export function mustUser(userId: string): UserRec {
  const user = world.users.get(userId)
  if (!user) notFound('用户不存在')
  return user
}

export const nicknameOf = (userId: string): string => world.users.get(userId)?.nickname ?? userId

export function profileDto(u: UserRec) {
  return {
    user_id: u.user_id,
    user_nickname: u.nickname,
    user_email: u.email,
    user_signature: u.signature,
    user_avatar_url: u.avatar,
    background_url: u.background,
    gender: u.gender,
    birthday: u.birthday,
    region: u.region,
    admin: u.admin,
    allow_search: u.allow_search,
    search_visible_by_id: u.search_visible_by_id,
    friend_request_policy: u.friend_request_policy,
    group_invite_policy: u.group_invite_policy,
    created_at: u.created_at,
    updated_at: u.updated_at,
  }
}

export function publicProfileDto(u: UserRec) {
  return {
    user_id: u.user_id,
    user_nickname: u.nickname,
    user_signature: u.signature,
    user_avatar_url: u.avatar,
    background_url: u.background,
    gender: u.gender,
    birthday: u.birthday,
    region: u.region,
    created_at: u.created_at,
  }
}

// ── 好友 ─────────────────────────────────────────────────

export function areFriends(a: string, b: string): boolean {
  return world.friendships.get(pairKey(a, b))?.active === true
}

export function friendIdsOf(userId: string): string[] {
  const out: string[] = []
  for (const f of world.friendships.values()) {
    if (!f.active || !f.users.includes(userId)) continue
    out.push(f.users[0] === userId ? f.users[1] : f.users[0])
  }
  return out
}

export function ownerEntry(map: Map<string, Map<string, string>>, owner: string): Map<string, string> {
  let inner = map.get(owner)
  if (!inner) {
    inner = new Map()
    map.set(owner, inner)
  }
  return inner
}

export const isBlacklisted = (owner: string, target: string): boolean => world.blacklist.get(owner)?.has(target) === true

export function friendDto(owner: string, friendId: string) {
  const friend = world.users.get(friendId)
  const friendship = world.friendships.get(pairKey(owner, friendId))
  return {
    friend_id: friendId,
    friend_nickname: friend?.nickname ?? null,
    friend_avatar_url: friend?.avatar ?? null,
    add_time: friendship?.add_time ?? new Date().toISOString(),
    approve_reason: null,
    friend_remark: world.remarks.get(owner)?.get(friendId) ?? null,
    is_blacklisted: isBlacklisted(owner, friendId),
    is_special_care: world.specialCare.get(owner)?.has(friendId) === true,
  }
}

export function pendingRequestDto(r: FriendRequestRec) {
  const from = world.users.get(r.from)
  return {
    request_id: r.request_id,
    request_user_id: r.from,
    request_message: r.message,
    request_time: r.created_at,
    requester_nickname: from?.nickname ?? null,
    requester_avatar_url: from?.avatar ?? null,
  }
}

export function sentRequestDto(r: FriendRequestRec) {
  const to = world.users.get(r.to)
  return {
    request_id: r.request_id,
    sent_to_user_id: r.to,
    sent_message: r.message,
    sent_time: r.created_at,
    sent_to_nickname: to?.nickname ?? null,
    sent_to_avatar_url: to?.avatar ?? null,
  }
}

export function listedUserDto(userId: string, createdAt: string) {
  const u = world.users.get(userId)
  return { user_id: userId, user_nickname: u?.nickname ?? null, user_avatar_url: u?.avatar ?? null, created_at: createdAt }
}

// ── 私聊 ─────────────────────────────────────────────────

export function convOf(a: string, b: string): FriendConvRec {
  const id = convIdOf(a, b)
  let conv = world.convs.get(id)
  if (!conv) {
    conv = { conv_id: id, users: [a, b], seq: 0, messages: [], last_read: new Map() }
    world.convs.set(id, conv)
  }
  return conv
}

export const otherParty = (conv: FriendConvRec, userId: string): string => (conv.users[0] === userId ? conv.users[1] : conv.users[0])

export const visibleTo = (messages: ChatMessageRec[], viewer: string): ChatMessageRec[] => messages.filter((m) => !m.deleted_by.has(viewer))

export function friendMessageDto(conv: FriendConvRec, m: ChatMessageRec) {
  return {
    message_uuid: m.message_uuid,
    sender_id: m.sender_id,
    receiver_id: otherParty(conv, m.sender_id),
    message_content: m.content,
    message_type: m.type,
    ...fileFields(m.file),
    is_recalled: m.is_recalled,
    seq: m.seq,
    rev: 0,
    reply_to: m.reply_to,
    media_group_id: null,
    media_group_index: null,
    media_group_count: null,
    send_time: m.send_time,
  }
}

/** 未读 = seq 在已读位置之后、不是自己发的、没撤回、自己没删的（`好友消息.md` 的未读真值口径）。 */
export function unreadIn(messages: ChatMessageRec[], viewer: string, lastRead: number): number {
  return messages.filter((m) => m.seq > lastRead && m.sender_id !== viewer && !m.is_recalled && !m.deleted_by.has(viewer)).length
}

// ── 群 ───────────────────────────────────────────────────

/** 活跃的群；不存在或已解散 → 404「群聊不存在」。 */
export function activeGroup(groupId: string): GroupRec {
  const group = world.groups.get(groupId)
  if (group?.status !== 'active') notFound('群聊不存在')
  return group
}

export function groupsOf(userId: string): GroupRec[] {
  return [...world.groups.values()].filter((g) => g.status === 'active' && g.members.has(userId))
}

export const memberCount = (g: GroupRec): number => g.members.size

export function groupMessageDto(g: GroupRec, m: ChatMessageRec) {
  const sender = world.users.get(m.sender_id)
  return {
    message_uuid: m.message_uuid,
    group_id: g.group_id,
    sender_id: m.sender_id,
    sender_nickname: sender?.nickname ?? m.sender_id,
    // 群消息的头像是**相对路径或空串**（`群消息.md:200` 的样例就是 ""）
    sender_avatar_url: sender?.avatar ?? '',
    message_content: m.content,
    message_type: m.type,
    ...fileFields(m.file),
    seq: m.seq,
    reply_to: m.reply_to,
    media_group_id: null,
    media_group_index: null,
    media_group_count: null,
    send_time: m.send_time,
    is_recalled: m.is_recalled,
  }
}

function lastVisible(messages: ChatMessageRec[], viewer: string): ChatMessageRec | undefined {
  for (let i = messages.length - 1; i >= 0; i--) if (!messages[i].deleted_by.has(viewer)) return messages[i]
  return undefined
}

export function myGroupDto(g: GroupRec, userId: string) {
  const member = g.members.get(userId) as MemberRec
  const last = lastVisible(g.messages, userId)
  return {
    group_id: g.group_id,
    group_name: g.name,
    // `/my` 的样例给的是 ""（`群聊管理.md:121`）；前端出口统一归一成 null
    group_avatar_url: g.avatar ?? '',
    role: member.role,
    unread_count: unreadIn(g.messages, userId, member.last_read_seq),
    last_message_content: last ? previewOf(last) : null,
    last_message_time: last?.send_time ?? null,
  }
}

export function groupInfoDto(g: GroupRec) {
  return {
    group_id: g.group_id,
    group_name: g.name,
    group_avatar_url: g.avatar ?? '',
    group_description: g.description,
    creator_id: g.creator_id,
    created_at: g.created_at,
    ...g.policy,
    status: g.status,
    member_count: memberCount(g),
  }
}

export function publicGroupDto(g: GroupRec) {
  return {
    group_id: g.group_id,
    group_name: g.name,
    group_avatar_url: g.avatar ?? '',
    group_description: g.description,
    creator_id: g.creator_id,
    created_at: g.created_at,
    join_approval_required: g.policy.join_approval_required,
    admin_can_approve: g.policy.admin_can_approve,
    allow_join_via_qr: g.policy.allow_join_via_qr,
    allow_join_via_search: g.policy.allow_join_via_search,
    allow_join_via_referral: g.policy.allow_join_via_referral,
    status: g.status,
    member_count: memberCount(g),
  }
}

export function memberDto(m: MemberRec) {
  const u = world.users.get(m.user_id)
  return {
    user_id: m.user_id,
    user_nickname: u?.nickname ?? null,
    user_avatar_url: u?.avatar ?? '',
    role: m.role,
    group_nickname: m.group_nickname,
    joined_at: m.joined_at,
    join_method: m.join_method,
    muted_until: m.muted_until,
  }
}

export const noticeDto = (n: NoticeRec) => ({
  id: n.id,
  title: n.title,
  content: n.content,
  publisher_id: n.publisher_id,
  publisher_nickname: nicknameOf(n.publisher_id),
  published_at: n.published_at,
  is_pinned: n.is_pinned,
  updated_at: n.updated_at,
})

export function invitationDto(r: GroupRequestRec) {
  const g = world.groups.get(r.group_id)
  const inviter = r.inviter_id ? world.users.get(r.inviter_id) : undefined
  return {
    request_id: r.request_id,
    group_id: r.group_id,
    group_name: g?.name ?? '',
    group_avatar_url: g?.avatar ?? null,
    inviter_id: r.inviter_id ?? '',
    inviter_nickname: inviter?.nickname ?? null,
    inviter_avatar_url: inviter?.avatar ?? null,
    message: r.message,
    created_at: r.created_at,
    expires_at: r.expires_at,
  }
}

export function joinRequestDto(r: GroupRequestRec) {
  const u = world.users.get(r.user_id)
  return {
    request_id: r.request_id,
    user_id: r.user_id,
    user_nickname: u?.nickname ?? null,
    user_avatar_url: u?.avatar ?? null,
    message: r.message,
    request_type: r.request_type,
    user_accepted: r.user_accepted,
    inviter_id: r.inviter_id,
    inviter_nickname: r.inviter_id ? nicknameOf(r.inviter_id) : null,
    created_at: r.created_at,
  }
}

export function sentJoinRequestDto(r: GroupRequestRec) {
  const g = world.groups.get(r.group_id)
  return {
    request_id: r.request_id,
    group_id: r.group_id,
    group_name: g?.name ?? '',
    group_avatar_url: g?.avatar ?? '',
    message: r.message,
    status: 'pending' as const,
    created_at: r.created_at,
  }
}

/** 审批权：群主恒有；管理员看 `admin_can_approve`（`群聊管理.md:1255`）。 */
export function canApprove(g: GroupRec, userId: string): boolean {
  const role = g.members.get(userId)?.role
  return role === 'owner' || (role === 'admin' && g.policy.admin_can_approve)
}

export const isAdminOrOwner = (g: GroupRec, userId: string): boolean => {
  const role = g.members.get(userId)?.role
  return role === 'owner' || role === 'admin'
}

// ── WS 帧 ────────────────────────────────────────────────

export function newMessageFrame(sourceType: 'friend' | 'group', sourceId: string, m: ChatMessageRec) {
  const sender = world.users.get(m.sender_id)
  const frame: Record<string, unknown> = {
    type: 'new_message',
    source_type: sourceType,
    source_id: sourceId,
    message_uuid: m.message_uuid,
    sender_id: m.sender_id,
    sender_nickname: sender?.nickname ?? m.sender_id,
    sender_avatar_url: sender?.avatar ?? '',
    content: m.content,
    message_type: m.type,
    seq: m.seq,
    timestamp: m.send_time,
  }
  // 文件类字段只在文件消息里出现（`好友消息.md`：WS 帧里没有值时整键不出现）
  if (m.file) {
    const f = fileFields(m.file)
    frame.file_uuid = f.file_uuid
    frame.file_url = f.file_url
    frame.file_size = f.file_size
    if (f.image_width !== null) frame.image_width = f.image_width
    if (f.image_height !== null) frame.image_height = f.image_height
  }
  return frame
}

/** `connected` 帧里的未读摘要：好友按会话、群按成员已读位置实时派生。群预览带「发送者: 」前缀。 */
export function unreadSummary(userId: string) {
  const friend_unreads = []
  for (const friendId of friendIdsOf(userId)) {
    const conv = world.convs.get(convIdOf(userId, friendId))
    if (!conv) continue
    const last = lastVisible(conv.messages, userId)
    if (!last) continue
    friend_unreads.push({
      friend_id: friendId,
      unread_count: unreadIn(conv.messages, userId, conv.last_read.get(userId) ?? 0),
      last_message_preview: previewOf(last),
      last_message_time: last.send_time,
    })
  }
  const group_unreads = groupsOf(userId).map((g) => {
    const last = lastVisible(g.messages, userId)
    return {
      group_id: g.group_id,
      unread_count: unreadIn(g.messages, userId, g.members.get(userId)?.last_read_seq ?? 0),
      last_message_preview: last ? `${nicknameOf(last.sender_id)}: ${previewOf(last)}` : null,
      last_message_time: last?.send_time ?? null,
    }
  })
  const total_count = [...friend_unreads, ...group_unreads].reduce((sum, u) => sum + u.unread_count, 0)
  return { total_count, friend_unreads, group_unreads }
}
