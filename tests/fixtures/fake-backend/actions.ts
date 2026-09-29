import { badRequest, forbidden, notFound } from './http'
import { pairKey } from './model'
import { uuid } from './random'
import {
  activeGroup,
  areFriends,
  convOf,
  friendDto,
  isAdminOrOwner,
  isBlacklisted,
  mustUser,
  newMessageFrame,
  otherParty,
  W,
} from './state'
import { iso, MINUTE } from './time'
import type { ChatMessageRec, FileRef, FriendConvRec, GroupRec, GroupRequestRec, MessageType } from './types'
import { pushToUser, pushToUsers, systemNotification } from './ws'

/**
 * 会改世界、并且要推 WS 的业务动作。REST 路由与 `/__test/*` 控制端点**共用这一份**——
 * 「模拟 bob 发一条消息」必须和「bob 真的在浏览器里点发送」走同一条代码路径，
 * 否则测到的是测试夹具自己，不是前端。
 */

const FRIEND_TYPES: readonly MessageType[] = ['text', 'image', 'video', 'file', 'meeting_invite', 'card', 'group_card']
const GROUP_TYPES: readonly MessageType[] = ['text', 'image', 'video', 'file', 'system', 'meeting_invite', 'card', 'group_card']
const RECALL_WINDOW_MS = 2 * MINUTE

export interface SendInput {
  content: string
  type: MessageType
  file?: FileRef | null
  reply_to?: string | null
}

function newMessage(senderId: string, seq: number, input: SendInput): ChatMessageRec {
  return {
    message_uuid: uuid(),
    seq,
    sender_id: senderId,
    content: input.content,
    type: input.type,
    file: input.file ?? null,
    is_recalled: false,
    send_time: iso(Date.now()),
    deleted_by: new Set(),
    reply_to: input.reply_to ?? null,
  }
}

function checkContent(input: SendInput, allowed: readonly MessageType[]): void {
  if (!allowed.includes(input.type)) badRequest(`不支持的消息类型: ${input.type}`)
  if (input.type === 'text' && input.content.trim() === '') badRequest('消息内容不能为空')
  if (input.content.length > 10000) badRequest('消息内容过长（最多 10000 字符）')
}

// ── 私聊 ─────────────────────────────────────────────────

export function sendFriendMessage(from: string, to: string, input: SendInput): { conv: FriendConvRec; message: ChatMessageRec } {
  mustUser(to)
  if (!areFriends(from, to)) badRequest('不是好友关系，无法发送消息')
  if (isBlacklisted(to, from)) forbidden('消息已发出，但被对方拒收了')
  checkContent(input, FRIEND_TYPES)
  const conv = convOf(from, to)
  conv.seq += 1
  const message = newMessage(from, conv.seq, input)
  conv.messages.push(message)
  conv.last_read.set(from, conv.seq)
  // 只推接收方（`好友消息.md`：「接收方在线会收到实时推送」），source_id 是发送方
  pushToUser(to, newMessageFrame('friend', from, message))
  return { conv, message }
}

function findFriendMessage(userId: string, messageUuid: string): { conv: FriendConvRec; message: ChatMessageRec } {
  for (const conv of W().convs.values()) {
    if (!conv.users.includes(userId)) continue
    const message = conv.messages.find((m) => m.message_uuid === messageUuid)
    if (message) return { conv, message }
  }
  return badRequest('消息不存在')
}

/**
 * 卡片交互（backend-docs messages/好友消息.md:486-525）：只有卡片**接收方本人**能交互，否则 404；
 * 同一 (message_uuid, action_id, nonce) 只中继一次，重复返回 delivered=false。
 * 真后端还要求卡片由 bot 发出——假世界的 bot 不在聊天关系里，这一条不模拟。
 */
export function interactWithCard(userId: string, messageUuid: string, actionId: string, value: unknown, nonce: string | null): boolean {
  let card: ChatMessageRec | undefined
  for (const conv of W().convs.values()) {
    if (!conv.users.includes(userId)) continue
    card = conv.messages.find((m) => m.message_uuid === messageUuid)
    if (card) break
  }
  if (card?.type !== 'card' || card.sender_id === userId) notFound('消息不存在')
  const world = W()
  if (nonce !== null && world.interactions.some((i) => i.message_uuid === messageUuid && i.action_id === actionId && i.nonce === nonce)) return false
  world.interactions.push({ message_uuid: messageUuid, action_id: actionId, value, nonce, user_id: userId })
  return true
}

export function recallFriendMessage(userId: string, messageUuid: string, opts: { ignoreWindow?: boolean } = {}): ChatMessageRec {
  const { conv, message } = findFriendMessage(userId, messageUuid)
  if (message.sender_id !== userId) forbidden('只能撤回自己发送的消息')
  if (message.is_recalled) badRequest('消息已撤回')
  if (!opts.ignoreWindow && Date.now() - Date.parse(message.send_time) > RECALL_WINDOW_MS) badRequest('只能撤回 2 分钟内发送的消息')
  message.is_recalled = true
  message.content = '[消息已撤回]'
  message.type = 'text'
  message.file = null
  pushToUser(otherParty(conv, userId), {
    type: 'message_recalled',
    source_type: 'friend',
    source_id: userId,
    message_uuid: message.message_uuid,
    recalled_by: userId,
  })
  return message
}

export function deleteFriendMessage(userId: string, messageUuid: string): void {
  const { message } = findFriendMessage(userId, messageUuid)
  message.deleted_by.add(userId)
}

// ── 群聊 ─────────────────────────────────────────────────

export function sendGroupMessage(from: string, groupId: string, input: SendInput): { group: GroupRec; message: ChatMessageRec } {
  const group = activeGroup(groupId)
  const member = group.members.get(from)
  if (!member) forbidden('你不是该群成员')
  if (member.muted_until && Date.parse(member.muted_until) > Date.now()) forbidden('你已被禁言，无法发送消息')
  checkContent(input, GROUP_TYPES)
  group.seq += 1
  const message = newMessage(from, group.seq, input)
  group.messages.push(message)
  member.last_read_seq = group.seq
  // 「群成员发送消息时，其他在线成员会收到实时推送」——不含发送者自己
  pushToUsers(group.members.keys(), newMessageFrame('group', group.group_id, message), from)
  return { group, message }
}

function findGroupMessage(userId: string, messageUuid: string): { group: GroupRec; message: ChatMessageRec } {
  for (const group of W().groups.values()) {
    if (group.status !== 'active' || !group.members.has(userId)) continue
    const message = group.messages.find((m) => m.message_uuid === messageUuid)
    if (message) return { group, message }
  }
  return badRequest('消息不存在')
}

export function recallGroupMessage(userId: string, messageUuid: string, opts: { ignoreWindow?: boolean } = {}): ChatMessageRec {
  const { group, message } = findGroupMessage(userId, messageUuid)
  const privileged = isAdminOrOwner(group, userId)
  if (message.sender_id !== userId && !privileged) forbidden('只能撤回自己发送的消息')
  if (message.is_recalled) badRequest('消息已撤回')
  if (!privileged && !opts.ignoreWindow && Date.now() - Date.parse(message.send_time) > RECALL_WINDOW_MS) badRequest('只能撤回 2 分钟内发送的消息')
  message.is_recalled = true
  message.content = '[消息已撤回]'
  message.type = 'text'
  message.file = null
  // 「所有在线群成员会收到实时推送」——包括撤回者自己的其它连接
  pushToUsers(group.members.keys(), {
    type: 'message_recalled',
    source_type: 'group',
    source_id: group.group_id,
    message_uuid: message.message_uuid,
    recalled_by: userId,
  })
  return message
}

export function deleteGroupMessage(userId: string, messageUuid: string): void {
  const { message } = findGroupMessage(userId, messageUuid)
  message.deleted_by.add(userId)
}

// ── 好友申请 ─────────────────────────────────────────────

export function makeFriends(a: string, b: string): string {
  const key = pairKey(a, b)
  const addTime = iso(Date.now())
  W().friendships.set(key, { key, users: [a, b], add_time: addTime, active: true })
  return addTime
}

function approvedFrame(requester: string, approver: string, addTime: string) {
  const dto = friendDto(requester, approver)
  return systemNotification('friend_request_approved', {
    friend_id: approver,
    friend_nickname: dto.friend_nickname,
    friend_avatar_url: dto.friend_avatar_url ?? '',
    add_time: addTime,
  })
}

/** 返回给调用方展示的文案（与后端 `results.message` 同一种口吻）。 */
export function createFriendRequest(from: string, to: string, message: string | null): string {
  const target = mustUser(to)
  if (from === to) badRequest('不能添加自己为好友')
  if (areFriends(from, to)) badRequest('已经是好友关系')
  if (!target.allow_search || !target.search_visible_by_id) forbidden('对方设置了不允许通过搜索添加')
  const world = W()
  if (world.friendRequests.some((r) => r.from === from && r.to === to && r.status === 'pending')) badRequest('已发送过好友请求，请等待对方处理')
  const request = { request_id: uuid(), from, to, message, created_at: iso(Date.now()), status: 'pending' as const }
  if (target.friend_request_policy === 'auto_reject') {
    world.friendRequests.push({ ...request, status: 'rejected' })
    return '好友请求已发送'
  }
  if (target.friend_request_policy === 'auto_accept') {
    world.friendRequests.push({ ...request, status: 'approved' })
    const addTime = makeFriends(from, to)
    pushToUser(from, approvedFrame(from, to, addTime))
    return '对方已自动通过你的好友请求'
  }
  world.friendRequests.push(request)
  pushToUser(to, systemNotification('friend_request', { from_user_id: from, from_nickname: mustUser(from).nickname, message: message ?? '', request_id: request.request_id }))
  return '好友请求已发送'
}

function pendingRequest(applicant: string, me: string) {
  const request = W().friendRequests.find((r) => r.from === applicant && r.to === me && r.status === 'pending')
  if (!request) notFound('好友请求不存在或已处理')
  return request
}

export function approveFriendRequest(me: string, applicant: string): void {
  const request = pendingRequest(applicant, me)
  request.status = 'approved'
  const addTime = makeFriends(me, applicant)
  pushToUser(applicant, approvedFrame(applicant, me, addTime))
}

export function rejectFriendRequest(me: string, applicant: string, reason: string | null): void {
  const request = pendingRequest(applicant, me)
  request.status = 'rejected'
  pushToUser(applicant, systemNotification('friend_request_rejected', { user_id: me, user_nickname: mustUser(me).nickname, reason: reason ?? '' }))
}

export function removeFriend(me: string, friendId: string): void {
  const friendship = W().friendships.get(pairKey(me, friendId))
  if (!friendship?.active) badRequest('好友关系不存在')
  friendship.active = false
  pushToUser(friendId, systemNotification('friend_deleted', { friend_id: me, friend_nickname: mustUser(me).nickname, deleted_at: iso(Date.now()) }))
}

// ── 入群 ─────────────────────────────────────────────────

/** 把人放进群并通知：新成员收 `group_join_approved`（审批/邀请通过时），全体收 `group_member_joined`。 */
export function addMember(group: GroupRec, userId: string, joinMethod: string, approvedBy: string | null): void {
  const now = iso(Date.now())
  group.members.set(userId, { user_id: userId, role: 'member', group_nickname: null, joined_at: now, join_method: joinMethod, muted_until: null, last_read_seq: group.seq })
  const user = mustUser(userId)
  if (approvedBy) {
    pushToUser(userId, systemNotification('group_join_approved', { group_id: group.group_id, group_name: group.name, group_avatar_url: group.avatar ?? '', role: 'member', approved_by: approvedBy }))
  }
  pushToUsers(
    group.members.keys(),
    systemNotification('group_member_joined', {
      group_id: group.group_id, group_name: group.name, new_member_id: userId, new_member_nickname: user.nickname,
      new_member_avatar_url: user.avatar ?? '', join_method: joinMethod, joined_at: now,
    }),
    userId,
  )
}

export function approversOf(group: GroupRec): string[] {
  return [...group.members.values()].filter((m) => m.role === 'owner' || (m.role === 'admin' && group.policy.admin_can_approve)).map((m) => m.user_id)
}

/** `POST /{group_id}/invite` 的逐人行为矩阵（`群聊管理.md:733-752`）。 */
export function inviteToGroup(inviterId: string, groupId: string, userIds: string[], message: string | null): Array<{ user_id: string; success: boolean; message: string }> {
  const group = activeGroup(groupId)
  const inviter = group.members.get(inviterId)
  if (!inviter) forbidden('你不是该群成员')
  const requestType = inviter.role === 'owner' ? 'owner_invite' : inviter.role === 'admin' ? 'admin_invite' : 'member_invite'
  return userIds.map((userId) => {
    const target = W().users.get(userId)
    if (!target) return { user_id: userId, success: false, message: '用户不存在' }
    if (group.members.has(userId)) return { user_id: userId, success: false, message: '对方已是群成员' }
    if (requestType === 'member_invite' && !group.policy.allow_join_via_referral) return { user_id: userId, success: false, message: '该群未开放好友推荐加群' }
    if (W().groupRequests.some((r) => r.group_id === groupId && r.user_id === userId && r.status === 'pending')) {
      return { user_id: userId, success: false, message: '已有待处理的入群记录' }
    }
    const created = iso(Date.now())
    const record: GroupRequestRec = {
      request_id: uuid(), group_id: groupId, user_id: userId, inviter_id: inviterId, message, request_type: requestType,
      user_accepted: false, status: 'pending', created_at: created, expires_at: iso(Date.now() + 7 * 24 * 3600 * 1000),
    }
    const policy = target.group_invite_policy
    if (policy === 'auto_reject') {
      W().groupRequests.push({ ...record, status: 'declined' })
      return { user_id: userId, success: false, message: '对方已设置自动拒绝群邀请' }
    }
    if (policy === 'auto_accept') {
      if (!group.policy.join_approval_required) {
        addMember(group, userId, requestType, inviterId)
        return { user_id: userId, success: true, message: '对方已自动加入群聊' }
      }
      W().groupRequests.push({ ...record, user_accepted: true })
      pushToUsers(approversOf(group), joinRequestFrame(group, userId, message, record.request_id, inviterId))
      return { user_id: userId, success: true, message: '对方已自动同意，待管理员审核' }
    }
    W().groupRequests.push(record)
    pushToUser(userId, systemNotification('group_invite', {
      group_id: groupId, group_name: group.name, inviter_id: inviterId, inviter_nickname: mustUser(inviterId).nickname, message: message ?? '', request_id: record.request_id,
    }))
    return { user_id: userId, success: true, message: group.policy.join_approval_required ? '邀请已发送，待对方同意并经管理员审核' : '邀请已发送，待对方同意' }
  })
}

export function joinRequestFrame(group: GroupRec, userId: string, message: string | null, requestId: string, inviterId: string | null) {
  return systemNotification('group_join_request', {
    group_id: group.group_id,
    group_name: group.name,
    user_id: userId,
    user_nickname: mustUser(userId).nickname,
    message: message ?? '',
    request_id: requestId,
    inviter_id: inviterId,
    inviter_nickname: inviterId ? mustUser(inviterId).nickname : null,
  })
}

