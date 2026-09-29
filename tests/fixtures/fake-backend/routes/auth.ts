import { badRequest, fail, json, notFound, ok, okMessage, type Route, readJson, route } from '../http'
import { issueSession, liveDevicesOf, refreshSession, resolveAccessToken, revokeDeviceById, revokeSession, TOKEN_TTL_SECONDS } from '../sessions'
import { W } from '../state'
import { iso } from '../time'

/**
 * `/api/auth/*`。登录与刷新的响应形状与旧 fixture 逐字一致：
 * 登录 `data` 只有 access/refresh/expires_in + 三个用户字段；刷新**不回** refresh_token。
 */
export const authRoutes: Route[] = [
  route(
    'POST',
    '/api/auth/login',
    (ctx) => {
      const body = readJson(ctx)
      const userId = typeof body.user_id === 'string' ? body.user_id : ''
      const user = W().users.get(userId)
      if (!user || body.password !== user.password) return fail(401, '用户名或密码错误')
      const deviceInfo = typeof body.device_info === 'string' && body.device_info !== '' ? body.device_info : 'unknown'
      const session = issueSession(user.user_id, deviceInfo, '127.0.0.1')
      const data: Record<string, unknown> = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: user.user_id === 'e2e' ? 900 : TOKEN_TTL_SECONDS,
        user_nickname: user.nickname,
        user_email: user.email,
        user_avatar_url: user.avatar,
      }
      if (user.signature) data.user_signature = user.signature
      return ok(data)
    },
    { auth: false },
  ),

  route(
    'POST',
    '/api/auth/refresh',
    (ctx) => {
      const body = readJson(ctx)
      const session = typeof body.refresh_token === 'string' ? refreshSession(body.refresh_token) : null
      if (!session) return fail(401, 'refresh token 无效或已失效')
      // 与 2026-09-09 线上实测一致：不回 refresh_token
      return ok({ access_token: session.access_token, token_type: 'Bearer', expires_in: session.user_id === 'e2e' ? 900 : TOKEN_TTL_SECONDS })
    },
    { auth: false },
  ),

  route(
    'POST',
    '/api/auth/logout',
    (ctx) => {
      const auth = ctx.request.headers.get('authorization')
      if (auth?.startsWith('Bearer ')) {
        const resolved = resolveAccessToken(auth.slice(7))
        if (resolved.ok) revokeSession(resolved.session)
      }
      return json({ success: true, code: 200 })
    },
    { auth: false },
  ),

  route(
    'POST',
    '/api/auth/register',
    (ctx) => {
      const body = readJson(ctx)
      const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
      const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const email = typeof body.email === 'string' && body.email.trim() !== '' ? body.email.trim() : null
      if (!/^[A-Za-z0-9_-]{3,32}$/.test(userId)) badRequest('用户 ID 只能包含字母、数字、下划线和连字符，长度 3-32')
      if (userId.startsWith('group-')) badRequest('用户 ID 不能以 group- 开头')
      if (nickname === '' || nickname.length > 50) badRequest('昵称长度需为 1-50 个字符')
      if (password.length < 6) badRequest('密码长度至少 6 位')
      if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) badRequest('邮箱格式不正确')
      if (W().users.has(userId)) badRequest('用户 ID 已被注册')
      const now = iso(Date.now())
      W().users.set(userId, {
        user_id: userId, nickname, email, password, signature: null, avatar: null, background: null, gender: null, birthday: null, region: null,
        admin: 'false', allow_search: true, search_visible_by_id: true, friend_request_policy: 'manual', group_invite_policy: 'manual', created_at: now, updated_at: now,
      })
      return okMessage('注册成功')
    },
    { auth: false },
  ),

  route('GET', '/api/auth/devices', (ctx) => {
    const current = resolveAccessToken(ctx.token)
    const currentDeviceId = current.ok ? current.session.device.device_id : null
    const devices = [
      ...liveDevicesOf(ctx.me.user_id).map(({ device }) => device),
      ...W().devices.filter((d) => d.user_id === ctx.me.user_id),
    ]
      .map((d) => ({ ...d, is_current: d.device_id === currentDeviceId }))
      .sort((a, b) => Number(b.is_current) - Number(a.is_current) || Date.parse(b.last_active_at) - Date.parse(a.last_active_at))
    return ok({ devices, total: devices.length })
  }),

  route('DELETE', '/api/auth/devices/:deviceId', (ctx) => {
    const { deviceId } = ctx.params
    const world = W()
    const seeded = world.devices.findIndex((d) => d.user_id === ctx.me.user_id && d.device_id === deviceId)
    if (seeded >= 0) {
      world.devices.splice(seeded, 1)
      return okMessage('设备已移除')
    }
    if (!revokeDeviceById(ctx.me.user_id, deviceId)) notFound('设备不存在')
    return okMessage('设备已移除')
  }),
]
