import { deleteFriendMessage, deleteGroupMessage, recallFriendMessage, recallGroupMessage, type SendInput, sendFriendMessage, sendGroupMessage } from '../actions'
import { badRequest, forbidden, ok, okResult, type Route, readJson, requireString, route } from '../http'
import { convIdOf, fileFields } from '../model'
import { activeGroup, areFriends, friendMessageDto, groupMessageDto, visibleTo, W } from '../state'
import type { ChatMessageRec, FileRef, MessageType } from '../types'

/**
 * 私聊 `/api/messages*`、群聊 `/api/group_messages*`、增量同步 `/api/messages/sync`。
 *
 * 列表按 **DESC** 返回（数组最后一条最旧，`好友消息.md:774`），`before_time` 严格小于；
 * 前端在模块出口翻成 ASC。私聊两端点也带信封——前端对它们开了 legacyBare 容忍裸响应，
 * 但 `apiEnvelope.ts` 开篇写明 2026-03-08 起后端全部统一成信封，这里按信封给。
 */

function page(messages: ChatMessageRec[], beforeTime: string | null, limitRaw: string | null): { rows: ChatMessageRec[]; has_more: boolean } {
  const limit = Math.min(500, Math.max(1, Number(limitRaw ?? 50) || 50))
  const before = beforeTime ? Date.parse(beforeTime) : Number.POSITIVE_INFINITY
  if (Number.isNaN(before)) badRequest('before_time 不是合法的 ISO 8601 时间')
  const older = messages.filter((m) => Date.parse(m.send_time) < before)
  const rows = older.slice(-limit).reverse()
  return { rows, has_more: older.length > limit }
}

function fileRefFor(fileUuid: string | undefined): FileRef | null {
  if (!fileUuid) return null
  const file = W().files.get(fileUuid)
  if (!file || file.deleted) badRequest('文件不存在')
  return { file_uuid: file.file_uuid, filename: file.filename, content_type: file.content_type, file_size: file.file_size, width: file.width, height: file.height }
}

function sendInput(body: Record<string, unknown>): SendInput {
  const content = typeof body.message_content === 'string' ? body.message_content : badRequest('缺少字段 message_content')
  const type = (typeof body.message_type === 'string' ? body.message_type : 'text') as MessageType
  const file = fileRefFor(typeof body.file_uuid === 'string' ? body.file_uuid : undefined)
  if ((type === 'image' || type === 'video' || type === 'file') && !file && typeof body.file_url !== 'string') badRequest('媒体消息必须带 file_uuid 或 file_url')
  return { content, type, file, reply_to: typeof body.reply_to === 'string' ? body.reply_to : null }
}

/** sync 的消息 DTO：与 REST 列表不同形——没有 receiver_id，可空字段整键缺省（`消息同步.md:180-190`）。 */
function syncMessageDto(m: ChatMessageRec) {
  const dto: Record<string, unknown> = {
    message_uuid: m.message_uuid,
    sender_id: m.sender_id,
    message_content: m.content,
    message_type: m.type,
    seq: m.seq,
    send_time: m.send_time,
    is_recalled: m.is_recalled,
  }
  if (m.file) Object.assign(dto, fileFields(m.file))
  return dto
}

export const messageRoutes: Route[] = [
  route('POST', '/api/messages', (ctx) => {
    const body = readJson(ctx)
    const { message } = sendFriendMessage(ctx.me.user_id, requireString(body, 'receiver_id'), sendInput(body))
    return ok({ message_uuid: message.message_uuid, send_time: message.send_time, seq: message.seq })
  }),

  route('GET', '/api/messages', (ctx) => {
    const friendId = ctx.query.get('friend_id') ?? badRequest('缺少参数 friend_id')
    if (!areFriends(ctx.me.user_id, friendId)) badRequest('不是好友关系')
    const conv = W().convs.get(convIdOf(ctx.me.user_id, friendId))
    const { rows, has_more } = page(conv ? visibleTo(conv.messages, ctx.me.user_id) : [], ctx.query.get('before_time'), ctx.query.get('limit'))
    return ok({ messages: conv ? rows.map((m) => friendMessageDto(conv, m)) : [], has_more })
  }),

  route('DELETE', '/api/messages/delete', (ctx) => {
    deleteFriendMessage(ctx.me.user_id, requireString(readJson(ctx), 'message_uuid'))
    return okResult('消息删除成功')
  }),

  route('POST', '/api/messages/recall', (ctx) => {
    recallFriendMessage(ctx.me.user_id, requireString(readJson(ctx), 'message_uuid'))
    return okResult('消息撤回成功')
  }),

  route('POST', '/api/messages/sync', (ctx) => {
    const body = readJson(ctx)
    const requested = Array.isArray(body.conversations) ? (body.conversations as Array<Record<string, unknown>>) : badRequest('缺少字段 conversations')
    if (requested.length > 50) badRequest('单次最多同步 50 个会话')
    const me = ctx.me.user_id
    const conversations = requested.flatMap((req) => {
      const id = String(req.conversation_id)
      const lastSeq = Number(req.last_seq) || 0
      if (req.conversation_type === 'group') {
        const group = W().groups.get(id)
        if (group?.status !== 'active' || !group.members.has(me)) return []
        const fresh = visibleTo(group.messages, me).filter((m) => m.seq > lastSeq)
        return [{ conversation_id: id, conversation_type: 'group', messages: fresh.slice(0, 100).map(syncMessageDto), latest_seq: group.seq, has_more: fresh.length > 100 }]
      }
      const conv = W().convs.get(id)
      if (!conv?.users.includes(me)) return []
      const fresh = visibleTo(conv.messages, me).filter((m) => m.seq > lastSeq)
      const entry: Record<string, unknown> = { conversation_id: id, conversation_type: 'friend', messages: fresh.slice(0, 100).map(syncMessageDto), latest_seq: conv.seq, has_more: fresh.length > 100 }
      if (req.with_read_positions === true) {
        const peer = conv.users[0] === me ? conv.users[1] : conv.users[0]
        entry.read_positions = { my_last_read_seq: conv.last_read.get(me) ?? 0, peer_last_read_seq: conv.last_read.get(peer) ?? 0 }
      }
      return [entry]
    })
    return ok({ conversations })
  }),

  // ── 群消息 ──

  route('POST', '/api/group_messages', (ctx) => {
    const body = readJson(ctx)
    const { message } = sendGroupMessage(ctx.me.user_id, requireString(body, 'group_id'), sendInput(body))
    return ok({ message_uuid: message.message_uuid, send_time: message.send_time, seq: message.seq })
  }),

  route('GET', '/api/group_messages', (ctx) => {
    const group = activeGroup(ctx.query.get('group_id') ?? badRequest('缺少参数 group_id'))
    if (!group.members.has(ctx.me.user_id)) forbidden('你不是该群成员')
    const { rows, has_more } = page(visibleTo(group.messages, ctx.me.user_id), ctx.query.get('before_time'), ctx.query.get('limit'))
    return ok({ messages: rows.map((m) => groupMessageDto(group, m)), has_more })
  }),

  route('DELETE', '/api/group_messages/delete', (ctx) => {
    deleteGroupMessage(ctx.me.user_id, requireString(readJson(ctx), 'message_uuid'))
    return okResult('消息已删除')
  }),

  route('POST', '/api/group_messages/recall', (ctx) => {
    recallGroupMessage(ctx.me.user_id, requireString(readJson(ctx), 'message_uuid'))
    return okResult('消息已撤回')
  }),

  route('GET', '/api/groups/:groupId/read-positions', (ctx) => {
    const group = activeGroup(ctx.params.groupId)
    if (!group.members.has(ctx.me.user_id)) forbidden('你不是该群成员')
    return ok({ positions: [...group.members.values()].map((m) => ({ user_id: m.user_id, last_read_seq: m.last_read_seq })) })
  }),
]
