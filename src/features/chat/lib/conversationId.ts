/**
 * 统一会话 id：URL 里「选中了哪个会话」的唯一表示（spec §3）。
 *
 * `f-<userId>` 私聊、`g-<groupId>` 群聊。只在**第一个**连字符处切：用户 id 本身可以含连字符
 * （APP `utils/conversationId.ts` 同一条注释），按 '-' split 计数会切坏。
 * 这不是后端的 `conv-a-b` 会话 id（那个是 messages API 的键，见 `buildFriendConversationId`）。
 */
export type ParsedConversationId = { kind: 'friend'; userId: string } | { kind: 'group'; groupId: string }

export function friendConversationId(userId: string): string {
  return `f-${userId}`
}

export function groupConversationId(groupId: string): string {
  return `g-${groupId}`
}

export function parseConversationId(id: string): ParsedConversationId | null {
  const dash = id.indexOf('-')
  if (dash !== 1) return null
  const body = id.slice(2)
  if (body === '') return null
  if (id[0] === 'f') return { kind: 'friend', userId: body }
  if (id[0] === 'g') return { kind: 'group', groupId: body }
  return null
}
