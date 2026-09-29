import { createFriendRequest, inviteToGroup, recallFriendMessage, recallGroupMessage, sendFriendMessage, sendGroupMessage } from '../actions'
import { badRequest, type Ctx, json, type Route, readJson, route } from '../http'
import { type Asset, assets, clientFileHash } from '../media/assets'
import { autoMessageContent, blobKey, convIdOf, messageTypeForContentType, typeFolder } from '../model'
import { uuid } from '../random'
import { resetRooms } from '../rtc'
import { sessionStats } from '../sessions'
import { friendMessageDto, groupMessageDto, resetWorld, W } from '../state'
import { iso } from '../time'
import type { FileRef, StorageLocation } from '../types'
import { GROUP_IDS } from '../world'
import { closeAllChat, onlineSockets, relayTyping } from '../ws'

/**
 * `/__test/*`：只挂在假后端自己的端口上（BFF 只转发 `/api/*` 与四个存储前缀，这里够不着），
 * 给 Playwright 用例与手工探索「扮演另一个人」用。全部走与 REST 相同的业务函数（actions.ts），
 * 所以 WS 推送、未读计数、预览这些副作用与真人操作完全一致。
 */

const MEDIA: Record<string, () => { asset: Asset; filename: string }> = {
  image: () => ({ asset: assets.photo('sunset'), filename: `IMG_${Date.now()}.png` }),
  video: () => ({ asset: assets.video(), filename: '随手拍.mp4' }),
  file: () => ({ asset: assets.pdf('q3-review'), filename: '会议材料.pdf' }),
}

/** 模拟一次已经传完的聊天文件（跳过分片，直接落库），返回可挂在消息上的 FileRef。 */
function stageFile(owner: string, location: StorageLocation, relatedId: string, kind: string): FileRef {
  const make = MEDIA[kind] ?? badRequest(`type 只能是 text / image / video / file（收到 ${kind}）`)
  const { asset, filename } = make()
  const bucket = location === 'friend_messages' ? 'friends-file' : 'group-file'
  const prefix = location === 'friend_messages' ? convIdOf(owner, relatedId) : relatedId
  const hash = clientFileHash(asset.bytes)
  const key = `${prefix}/${typeFolder(asset.contentType)}/${Date.now()}_${hash.slice(0, 8)}_${filename}`
  const file_uuid = uuid()
  W().blobs.set(blobKey(bucket, key), { bytes: asset.bytes, content_type: asset.contentType })
  W().files.set(file_uuid, {
    file_uuid, owner_id: owner, filename, content_type: asset.contentType, file_size: asset.bytes.length, file_hash: hash, bucket, key,
    created_at: iso(Date.now()), storage_location: location, related_id: relatedId, width: asset.width, height: asset.height, deleted: false,
  })
  return { file_uuid, filename, content_type: asset.contentType, file_size: asset.bytes.length, width: asset.width, height: asset.height }
}

function summary() {
  const world = W()
  return {
    now: iso(Date.now()),
    group_ids: GROUP_IDS,
    online: onlineSockets(),
    sessions: sessionStats(),
    users: [...world.users.values()].map((u) => u.user_id),
    friendships: [...world.friendships.values()].filter((f) => f.active).map((f) => f.users.join(' ↔ ')),
    friend_requests: world.friendRequests.map((r) => ({ from: r.from, to: r.to, status: r.status })),
    groups: [...world.groups.values()].map((g) => ({ group_id: g.group_id, name: g.name, status: g.status, members: g.members.size, messages: g.messages.length, seq: g.seq })),
    group_requests: world.groupRequests.map((r) => ({ group_id: r.group_id, user_id: r.user_id, type: r.request_type, status: r.status, user_accepted: r.user_accepted })),
    conversations: [...world.convs.values()].map((c) => ({ conv_id: c.conv_id, messages: c.messages.length, seq: c.seq, last_read: Object.fromEntries(c.last_read) })),
    files: world.files.size,
    uploads: [...world.uploads.values()].map((u) => ({ file_key: u.file_key, owner: u.owner_id, status: u.status, parts: u.parts.size })),
  }
}

const str = (body: Record<string, unknown>, key: string, fallback?: string): string => {
  const value = body[key]
  if (typeof value === 'string' && value !== '') return value
  if (fallback !== undefined) return fallback
  return badRequest(`缺少字段 ${key}`)
}

function handleSend(ctx: Ctx): Response {
  const body = readJson(ctx)
  const from = str(body, 'from')
  const kind = str(body, 'type', 'text')
  const text = typeof body.text === 'string' ? body.text : ''
  if (typeof body.group === 'string') {
    const file = kind === 'text' ? null : stageFile(from, 'group_files', body.group, kind)
    const type = file ? messageTypeForContentType(file.content_type) : 'text'
    const { group, message } = sendGroupMessage(from, body.group, { content: file && !text ? autoMessageContent(type, file.filename) : text, type, file })
    return json({ ok: true, message: groupMessageDto(group, message) })
  }
  const to = str(body, 'to', 'alice')
  const file = kind === 'text' ? null : stageFile(from, 'friend_messages', to, kind)
  const type = file ? messageTypeForContentType(file.content_type) : 'text'
  const { conv, message } = sendFriendMessage(from, to, { content: file && !text ? autoMessageContent(type, file.filename) : text, type, file })
  return json({ ok: true, message: friendMessageDto(conv, message) })
}

export const testRoutes: Route[] = [
  route(
    'POST',
    '/__test/reset',
    () => {
      resetWorld()
      resetRooms()
      const closed = closeAllChat()
      return json({ ok: true, closed_sockets: closed, ...summary() })
    },
    { auth: false },
  ),
  route('GET', '/__test/state', () => json(summary()), { auth: false }),
  route('POST', '/__test/send', handleSend, { auth: false }),
  route(
    'POST',
    '/__test/friend-request',
    (ctx) => {
      const body = readJson(ctx)
      const message = createFriendRequest(str(body, 'from'), str(body, 'to', 'alice'), typeof body.message === 'string' ? body.message : null)
      return json({ ok: true, message })
    },
    { auth: false },
  ),
  route(
    'POST',
    '/__test/recall',
    (ctx) => {
      const body = readJson(ctx)
      const by = str(body, 'by')
      const uuidArg = str(body, 'message_uuid')
      const isGroup = [...W().groups.values()].some((g) => g.messages.some((m) => m.message_uuid === uuidArg))
      const message = isGroup ? recallGroupMessage(by, uuidArg, { ignoreWindow: true }) : recallFriendMessage(by, uuidArg, { ignoreWindow: true })
      return json({ ok: true, message_uuid: message.message_uuid })
    },
    { auth: false },
  ),
  route(
    'POST',
    '/__test/typing',
    (ctx) => {
      const body = readJson(ctx)
      const from = str(body, 'from')
      const isTyping = body.is_typing !== false
      if (typeof body.group === 'string') relayTyping(from, 'group', body.group, isTyping)
      else relayTyping(from, 'private', str(body, 'to', 'alice'), isTyping)
      return json({ ok: true })
    },
    { auth: false },
  ),
  route(
    'POST',
    '/__test/group-invite',
    (ctx) => {
      const body = readJson(ctx)
      const results = inviteToGroup(str(body, 'from'), str(body, 'group'), [str(body, 'to', 'alice')], typeof body.message === 'string' ? body.message : null)
      return json({ ok: true, results })
    },
    { auth: false },
  ),
]
