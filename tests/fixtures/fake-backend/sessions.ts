import { iso } from './time'
import type { DeviceRec } from './types'

/**
 * 令牌与登录设备。**刻意放在世界状态之外**：`/__test/reset` 只重置世界，不把正在用的
 * 浏览器会话踢下线（BFF 那边的 SQLite 里还存着这些 token）。假后端进程重启则全部作废——
 * 与真后端换一套签名密钥时的表现一致：BFF 下一次转发拿到 401，会话被删，回登录页。
 *
 * 口径：
 * - 普通用户每次登录发一对新令牌 `AT-<user>-<n>` / `RT-<user>-<n>`；刷新发新的 `AT-<user>-<n>`，
 *   **不回** refresh_token（与 2026-09-09 线上实测一致）。
 * - access token 有效期 `FAKE_BACKEND_TOKEN_TTL` 秒（默认 900，与 `expires_in` 一致），过期即 401——
 *   BFF 应该在到期前 60 秒内惰性刷新，这条正好验它。
 * - 设备 ID 用 `crypto.randomUUID()` 而不是世界的确定性随机源：会话跨重置存活，若与世界共用一条
 *   随机流，重置后新登录会拿到与旧会话相同的 device_id。
 * - `e2e` 保持旧 fixture 的行为逐字不变：永远是 `AT-e2e` / `RT-e2e`，刷新永远得 `AT-e2e-2`，
 *   不过期、登出不作废（旧 fixture 就是这样，几个老用例并发共用这一对令牌）。
 */
export interface SessionRec {
  access_token: string
  refresh_token: string
  user_id: string
  device: DeviceRec
  /** `null` = 不过期（只有 e2e） */
  expires_at_ms: number | null
  revoked: boolean
}

export const TOKEN_TTL_SECONDS = Number(process.env.FAKE_BACKEND_TOKEN_TTL ?? 900)

const byAccess = new Map<string, SessionRec>()
const byRefresh = new Map<string, SessionRec>()
const counters = new Map<string, number>()

const nextN = (userId: string): number => {
  const n = (counters.get(userId) ?? 0) + 1
  counters.set(userId, n)
  return n
}

export function issueSession(userId: string, deviceInfo: string, ip: string): SessionRec {
  const now = Date.now()
  if (userId === 'e2e') {
    const existing = byRefresh.get('RT-e2e')
    const device: DeviceRec = existing?.device ?? {
      device_id: crypto.randomUUID(), user_id: 'e2e', device_info: deviceInfo, ip_address: ip, created_at: iso(now), last_active_at: iso(now),
    }
    device.last_active_at = iso(now)
    const session: SessionRec = { access_token: 'AT-e2e', refresh_token: 'RT-e2e', user_id: 'e2e', device, expires_at_ms: null, revoked: false }
    byAccess.set('AT-e2e', session)
    byRefresh.set('RT-e2e', session)
    return session
  }
  const n = nextN(userId)
  const session: SessionRec = {
    access_token: `AT-${userId}-${n}`,
    refresh_token: `RT-${userId}-${n}`,
    user_id: userId,
    device: { device_id: crypto.randomUUID(), user_id: userId, device_info: deviceInfo, ip_address: ip, created_at: iso(now), last_active_at: iso(now) },
    expires_at_ms: now + TOKEN_TTL_SECONDS * 1000,
    revoked: false,
  }
  byAccess.set(session.access_token, session)
  byRefresh.set(session.refresh_token, session)
  return session
}

/** 刷新成功返回新 access token；refresh token 不认识 / 已作废返回 `null`（→ 401）。 */
export function refreshSession(refreshToken: string): SessionRec | null {
  const current = byRefresh.get(refreshToken)
  if (!current || current.revoked) return null
  if (current.user_id === 'e2e') {
    const session: SessionRec = { ...current, access_token: 'AT-e2e-2' }
    byAccess.set('AT-e2e-2', session)
    return session
  }
  const n = nextN(current.user_id)
  const session: SessionRec = {
    ...current,
    access_token: `AT-${current.user_id}-${n}`,
    expires_at_ms: Date.now() + TOKEN_TTL_SECONDS * 1000,
  }
  // 旧 access token 不立刻作废：BFF 可能有请求正在路上
  byAccess.set(session.access_token, session)
  byRefresh.set(refreshToken, session)
  return session
}

export type Resolved = { ok: true; session: SessionRec } | { ok: false; reason: '未授权访问' | 'Token 已过期' }

export function resolveAccessToken(token: string): Resolved {
  const session = byAccess.get(token)
  if (!session || session.revoked) return { ok: false, reason: '未授权访问' }
  if (session.expires_at_ms !== null && Date.now() > session.expires_at_ms) return { ok: false, reason: 'Token 已过期' }
  session.device.last_active_at = iso(Date.now())
  return { ok: true, session }
}

/** 登出 / 移除当前设备：同一登录（同一 refresh token）名下的全部 access token 一起作废。e2e 例外。 */
export function revokeSession(session: SessionRec): void {
  if (session.user_id === 'e2e') return
  for (const s of byAccess.values()) if (s.refresh_token === session.refresh_token) s.revoked = true
  const rt = byRefresh.get(session.refresh_token)
  if (rt) rt.revoked = true
}

/** 某用户当前有效的登录设备（按 refresh token 去重）。 */
export function liveDevicesOf(userId: string): Array<{ device: DeviceRec; refresh_token: string }> {
  const out = new Map<string, { device: DeviceRec; refresh_token: string }>()
  for (const s of byRefresh.values()) {
    if (s.user_id === userId && !s.revoked) out.set(s.refresh_token, { device: s.device, refresh_token: s.refresh_token })
  }
  return [...out.values()]
}

export function revokeDeviceById(userId: string, deviceId: string): SessionRec | null {
  for (const s of byRefresh.values()) {
    if (s.user_id === userId && s.device.device_id === deviceId && !s.revoked) {
      revokeSession(s)
      return s
    }
  }
  return null
}

export function sessionStats(): { active: number; byUser: Record<string, number> } {
  const byUser: Record<string, number> = {}
  let active = 0
  for (const s of byRefresh.values()) {
    if (s.revoked) continue
    active++
    byUser[s.user_id] = (byUser[s.user_id] ?? 0) + 1
  }
  return { active, byUser }
}
