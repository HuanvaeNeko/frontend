import type { ServerWebSocket } from 'bun'
import { convIdOf } from './model'
import { groupsOf, otherParty, unreadSummary, W } from './state'
import { iso } from './time'

/**
 * 聊天 WebSocket：`/ws?token=<access_token>`（token 由 BFF 注入）。
 *
 * 连接按 token → 用户登记，一个用户可以有多条连接（多标签页 / 多设备），推送时逐条发。
 *
 * 服务端 → 客户端（全部是前端 `src/store/wsStore.ts` 认得的形状）：
 * - `hello`：旧 fixture 的第一帧，`tests/bff-session.spec.ts` 断言首帧含 `fake-backend`，必须保持首帧
 * - `connected`：`{unread_summary}`，紧跟在 hello 之后
 * - `new_message` / `message_recalled` / `read_sync` / `typing` / `system_notification` / `file_uploaded`
 * - `pong`：回应客户端的 `ping`
 *
 * 客户端 → 服务端：`ping`、`mark_read`、`typing`、`resync_read_positions`；其余类型忽略（不回显）。
 */

export type ChatSocketData = { kind: 'chat'; token: string; userId: string }
export type RtcSocketData = { kind: 'rtc'; roomId: string; participantId: string }
export type SocketData = ChatSocketData | RtcSocketData

type ChatSocket = ServerWebSocket<SocketData>

const chatSockets = new Map<string, Set<ChatSocket>>()

export function openChat(ws: ChatSocket, userId: string): void {
  const set = chatSockets.get(userId) ?? new Set()
  set.add(ws)
  chatSockets.set(userId, set)
  ws.send(JSON.stringify({ type: 'hello', from: 'fake-backend' }))
  ws.send(JSON.stringify({ type: 'connected', unread_summary: unreadSummary(userId) }))
}

export function closeChat(ws: ChatSocket, userId: string): void {
  const set = chatSockets.get(userId)
  if (!set) return
  set.delete(ws)
  if (set.size === 0) chatSockets.delete(userId)
}

/** 推给某个用户的全部在线连接，返回送达的连接数。 */
export function pushToUser(userId: string, frame: unknown): number {
  const set = chatSockets.get(userId)
  if (!set) return 0
  const payload = JSON.stringify(frame)
  for (const ws of set) ws.send(payload)
  return set.size
}

export function pushToUsers(userIds: Iterable<string>, frame: unknown, except?: string): void {
  for (const id of userIds) if (id !== except) pushToUser(id, frame)
}

export const systemNotification = (notificationType: string, data: Record<string, unknown>) => ({
  type: 'system_notification',
  notification_type: notificationType,
  data,
})

export function onlineSockets(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [userId, set] of chatSockets) out[userId] = set.size
  return out
}

/**
 * 重置时关掉所有聊天连接。用 1012（服务重启）而不是 1000：前端 `wsStore` 对 1000/1001 不重连，
 * 1012 会走指数退避重连，重连后拿到新世界的 `connected` 未读摘要。BFF 的 `relayCloseCode`
 * 原样透传 1002–1014（除 1005/1006），所以浏览器看到的也是 1012。
 */
export function closeAllChat(code = 1012, reason = 'fake backend reset'): number {
  let n = 0
  for (const set of chatSockets.values()) {
    for (const ws of set) {
      n++
      try {
        ws.close(code, reason)
      } catch {
        // 已经关了
      }
    }
  }
  chatSockets.clear()
  return n
}

/** `mark_read`：推进本人已读位置，并向对方 / 群内其他成员发 `read_sync`（已读回执开启时的行为）。 */
export function markRead(userId: string, targetType: string, targetId: string): void {
  const readAt = iso(Date.now())
  if (targetType === 'friend') {
    const conv = W().convs.get(convIdOf(userId, targetId))
    if (!conv) return
    conv.last_read.set(userId, conv.seq)
    pushToUser(otherParty(conv, userId), { type: 'read_sync', source_type: 'friend', source_id: userId, reader_id: userId, read_at: readAt, seq: conv.seq })
    return
  }
  if (targetType === 'group') {
    const group = groupsOf(userId).find((g) => g.group_id === targetId)
    const member = group?.members.get(userId)
    if (!group || !member) return
    member.last_read_seq = group.seq
    pushToUsers(group.members.keys(), { type: 'read_sync', source_type: 'group', source_id: group.group_id, reader_id: userId, read_at: readAt, seq: group.seq }, userId)
  }
}

/**
 * 「正在输入」：私聊的 `conversation_id` 从接收方视角看是**发送方的 user_id**（前端
 * `chatStore.getTypingUsers(selectedConversation.id)` 按它过滤）；群聊是群 ID。
 */
export function relayTyping(userId: string, conversationType: string, conversationId: string, isTyping: boolean): void {
  if (conversationType === 'private') {
    pushToUser(conversationId, { type: 'typing', data: { user_id: userId, conversation_type: 'private', conversation_id: userId, is_typing: isTyping } })
    return
  }
  const group = groupsOf(userId).find((g) => g.group_id === conversationId)
  if (!group) return
  pushToUsers(group.members.keys(), { type: 'typing', data: { user_id: userId, conversation_type: 'group', conversation_id: conversationId, is_typing: isTyping } }, userId)
}

export function handleChatMessage(ws: ChatSocket, userId: string, raw: string | ArrayBufferView | ArrayBuffer): void {
  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as Record<string, unknown>
  } catch {
    return
  }
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: iso(Date.now()) }))
      return
    case 'mark_read':
      markRead(userId, String(msg.target_type), String(msg.target_id))
      return
    case 'typing': {
      const data = (msg.data ?? {}) as Record<string, unknown>
      relayTyping(userId, String(data.conversation_type), String(data.conversation_id), data.is_typing === true)
      return
    }
    case 'resync_read_positions': {
      const positions = Array.isArray(msg.positions) ? msg.positions : []
      for (const p of positions.slice(0, 1000) as Array<Record<string, unknown>>) {
        const seq = Number(p.last_read_seq)
        if (!(seq > 0)) continue
        if (p.target_type === 'friend') {
          const conv = W().convs.get(convIdOf(userId, String(p.target_id)))
          if (conv) conv.last_read.set(userId, Math.max(conv.last_read.get(userId) ?? 0, Math.min(seq, conv.seq)))
        } else if (p.target_type === 'group') {
          const member = groupsOf(userId).find((g) => g.group_id === p.target_id)?.members.get(userId)
          if (member) member.last_read_seq = Math.max(member.last_read_seq, seq)
        }
      }
      return
    }
    default:
  }
}
