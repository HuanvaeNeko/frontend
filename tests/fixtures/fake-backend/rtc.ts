import type { ServerWebSocket } from 'bun'
import { badRequest, HttpError, notFound } from './http'
import { iso } from './time'
import type { UserRec } from './types'
import type { SocketData } from './ws'

/**
 * WebRTC 房间与信令（`WebRTC房间.md`）。只做信令转发——媒体是浏览器之间的事。
 *
 * - `POST /api/webrtc/rooms` 建房（要登录），`POST /api/webrtc/rooms/{id}/join` 进房（不要登录）；
 * - `WS /ws/webrtc/rooms/{id}?token=<ws_token>`：连上即回 `joined`，其他人收 `peer_joined`；
 *   `offer` / `answer` / `candidate` / `media_type` / `media_state` 按 `to` 转发并补上 `from`；
 *   `leave` 或断开 ⇒ 其他人收 `peer_left`。
 *
 * 房间不随 `/__test/reset` 之外的任何东西消失（真后端是"空置后自动清理"，这里不模拟计时器）。
 */

interface UserInfo {
  user_id: string | null
  nickname: string
  avatar_url: string | null
  is_authenticated: boolean
}

interface Participant {
  id: string
  name: string
  is_creator: boolean
  user_info: UserInfo
  media_state: { mic: boolean; camera: boolean; screen: boolean }
  ws: ServerWebSocket<SocketData> | null
}

interface Room {
  room_id: string
  name: string | null
  password: string
  max_participants: number
  participants: Map<string, Participant>
  tokens: Map<string, string>
}

const rooms = new Map<string, Room>()

export function resetRooms(): void {
  for (const room of rooms.values()) {
    for (const p of room.participants.values()) {
      try {
        p.ws?.send(JSON.stringify({ type: 'room_closed', reason: 'fake backend reset' }))
        p.ws?.close(1000, 'room closed')
      } catch {
        // 已经关了
      }
    }
  }
  rooms.clear()
}

const randomCode = (length: number, alphabet: string): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => alphabet[b % alphabet.length]).join('')

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302'] }]

export function iceServers() {
  return { ice_servers: ICE_SERVERS, expires_at: iso(Date.now() + 3600_000) }
}

function addParticipant(room: Room, name: string, info: UserInfo, isCreator: boolean) {
  if (room.participants.size >= room.max_participants) badRequest('房间已满')
  const participant: Participant = {
    id: `p_${randomCode(8, 'abcdefghijklmnopqrstuvwxyz0123456789')}`,
    name,
    is_creator: isCreator,
    user_info: info,
    media_state: { mic: false, camera: false, screen: false },
    ws: null,
  }
  const token = `wst-${randomCode(32, 'abcdef0123456789')}`
  room.participants.set(participant.id, participant)
  room.tokens.set(token, participant.id)
  return { participant, token, expiresAt: iso(Date.now() + 10 * 60_000) }
}

export function createRoom(user: UserRec, body: Record<string, unknown>) {
  const maxRaw = Number(body.max_participants ?? 10)
  const max = Math.min(50, Math.max(2, Number.isFinite(maxRaw) ? maxRaw : 10))
  const password = typeof body.password === 'string' && body.password !== '' ? body.password : randomCode(6, '0123456789')
  let roomId = randomCode(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
  while (rooms.has(roomId)) roomId = randomCode(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
  const room: Room = { room_id: roomId, name: typeof body.name === 'string' ? body.name : null, password, max_participants: max, participants: new Map(), tokens: new Map() }
  rooms.set(roomId, room)
  const displayName = typeof body.display_name === 'string' && body.display_name !== '' ? body.display_name : user.nickname
  const info: UserInfo = { user_id: user.user_id, nickname: displayName, avatar_url: typeof body.avatar_url === 'string' ? body.avatar_url : user.avatar, is_authenticated: true }
  const { participant, token, expiresAt } = addParticipant(room, displayName, info, true)
  return {
    room_id: roomId, password, name: room.name ?? undefined, max_participants: max, participant_id: participant.id, ws_token: token, token_expires_at: expiresAt, user_info: info,
  }
}

export function joinRoom(roomId: string, user: UserRec | null, body: Record<string, unknown>) {
  const room = rooms.get(roomId)
  if (!room) notFound('房间不存在')
  if (body.password !== room.password) throw new HttpError(401, '密码错误')
  const displayName = typeof body.display_name === 'string' && body.display_name !== '' ? body.display_name : (user?.nickname ?? '访客')
  const info: UserInfo = {
    user_id: user?.user_id ?? null,
    nickname: displayName,
    avatar_url: typeof body.avatar_url === 'string' ? body.avatar_url : (user?.avatar ?? null),
    is_authenticated: user !== null,
  }
  const { participant, token, expiresAt } = addParticipant(room, displayName, info, false)
  return { participant_id: participant.id, ws_token: token, room_name: room.name ?? undefined, ice_servers: ICE_SERVERS, token_expires_at: expiresAt, user_info: info }
}

/** WS 升级前的校验：房间在、token 认得 ⇒ 返回 participant id。 */
export function resolveRtcToken(roomId: string, token: string): string | null {
  return rooms.get(roomId)?.tokens.get(token) ?? null
}

const publicView = (p: Participant) => ({ id: p.id, name: p.name, is_creator: p.is_creator, user_info: p.user_info, media_state: p.media_state })

function broadcast(room: Room, frame: unknown, exceptId?: string): void {
  const payload = JSON.stringify(frame)
  for (const p of room.participants.values()) if (p.id !== exceptId && p.ws) p.ws.send(payload)
}

export function openRtc(ws: ServerWebSocket<SocketData>, roomId: string, participantId: string): void {
  const room = rooms.get(roomId)
  const me = room?.participants.get(participantId)
  if (!room || !me) {
    ws.close(4004, 'room not found')
    return
  }
  me.ws = ws
  const others = [...room.participants.values()].filter((p) => p.id !== participantId && p.ws)
  ws.send(JSON.stringify({ type: 'joined', participant_id: participantId, participants: others.map(publicView) }))
  broadcast(room, { type: 'peer_joined', participant: publicView(me) }, participantId)
}

export function closeRtc(roomId: string, participantId: string): void {
  const room = rooms.get(roomId)
  if (!room?.participants.has(participantId)) return
  room.participants.delete(participantId)
  for (const [token, pid] of room.tokens) if (pid === participantId) room.tokens.delete(token)
  broadcast(room, { type: 'peer_left', participant_id: participantId })
}

export function handleRtcMessage(ws: ServerWebSocket<SocketData>, roomId: string, participantId: string, raw: string | ArrayBufferView | ArrayBuffer): void {
  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as Record<string, unknown>
  } catch {
    return
  }
  const room = rooms.get(roomId)
  if (!room) return
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: iso(Date.now()) }))
      return
    case 'leave':
      closeRtc(roomId, participantId)
      ws.close(1000, 'left')
      return
    case 'media_state': {
      const me = room.participants.get(participantId)
      if (me && typeof msg.state === 'object' && msg.state) me.media_state = { ...me.media_state, ...(msg.state as Participant['media_state']) }
      broadcast(room, { type: 'media_state_changed', participant_id: participantId, state: me?.media_state }, participantId)
      return
    }
    case 'offer':
    case 'answer':
    case 'candidate':
    case 'media_type': {
      const target = room.participants.get(String(msg.to))
      const { to: _to, ...rest } = msg
      target?.ws?.send(JSON.stringify({ ...rest, from: participantId }))
      return
    }
    default:
      ws.send(JSON.stringify({ type: 'error', code: 'unknown_type', message: `未知消息类型: ${String(msg.type)}` }))
  }
}
