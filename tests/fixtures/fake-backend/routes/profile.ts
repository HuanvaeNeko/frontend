import { badRequest, fail, json, notFound, ok, type Route, readJson, route } from '../http'
import { profileDto, publicProfileDto, W } from '../state'
import { iso } from '../time'
import type { Policy, UserRec } from '../types'

const POLICIES: readonly Policy[] = ['manual', 'auto_accept', 'auto_reject']
const GENDERS = ['male', 'female', 'other'] as const

/** 校验文案照抄后端的英文串（`个人资料管理.md:213`：`Validation error: email: Invalid email format`）。 */
function validationError(field: string, message: string): never {
  return badRequest(`Validation error: ${field}: ${message}`)
}

function applyProfileUpdate(user: UserRec, body: Record<string, unknown>): void {
  const known = ['nickname', 'email', 'signature', 'allow_search', 'search_visible_by_id', 'friend_request_policy', 'group_invite_policy', 'gender', 'birthday', 'region']
  if (!known.some((key) => body[key] !== undefined)) badRequest('Validation error: 至少提供一个要更新的字段')
  const str = (key: string) => {
    const v = body[key]
    if (v === undefined) return undefined
    if (typeof v !== 'string') validationError(key, 'must be a string')
    return v
  }
  const nickname = str('nickname')
  if (nickname !== undefined && (nickname.length < 1 || nickname.length > 50)) validationError('nickname', 'length must be between 1 and 50')
  const email = str('email')
  if (email !== undefined && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validationError('email', 'Invalid email format')
  const signature = str('signature')
  if (signature !== undefined && signature.length > 200) validationError('signature', 'length must be at most 200')
  const region = str('region')
  if (region !== undefined && region.length > 100) validationError('region', 'length must be at most 100')
  const birthday = str('birthday')
  if (birthday !== undefined && birthday !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) validationError('birthday', 'must be YYYY-MM-DD')
  const gender = str('gender')
  if (gender !== undefined && !(GENDERS as readonly string[]).includes(gender)) validationError('gender', 'must be male / female / other')
  for (const key of ['friend_request_policy', 'group_invite_policy'] as const) {
    const v = str(key)
    if (v !== undefined && !(POLICIES as readonly string[]).includes(v)) validationError(key, 'must be manual / auto_accept / auto_reject')
  }
  for (const key of ['allow_search', 'search_visible_by_id'] as const) {
    if (body[key] !== undefined && typeof body[key] !== 'boolean') validationError(key, 'must be a boolean')
  }

  if (nickname !== undefined) user.nickname = nickname
  if (email !== undefined) user.email = email === '' ? null : email
  if (signature !== undefined) user.signature = signature === '' ? null : signature
  if (region !== undefined) user.region = region === '' ? null : region
  if (birthday !== undefined) user.birthday = birthday === '' ? null : birthday
  if (gender !== undefined) user.gender = gender as UserRec['gender']
  if (body.friend_request_policy !== undefined) user.friend_request_policy = body.friend_request_policy as Policy
  if (body.group_invite_policy !== undefined) user.group_invite_policy = body.group_invite_policy as Policy
  if (typeof body.allow_search === 'boolean') user.allow_search = body.allow_search
  if (typeof body.search_visible_by_id === 'boolean') user.search_visible_by_id = body.search_visible_by_id
  user.updated_at = iso(Date.now())
}

export const profileRoutes: Route[] = [
  route('GET', '/api/profile', (ctx) => ok(profileDto(ctx.me))),

  // 成功响应逐字是裸的 `{message}`（`个人资料管理.md:203-208`），前端用 assertEnvelopeOk 只判成败
  route('PUT', '/api/profile', (ctx) => {
    applyProfileUpdate(ctx.me, readJson(ctx))
    return json({ message: 'Profile updated successfully' })
  }),

  // 旧密码错是**业务 401**（BFF 与前端都按 `PUT /api/profile/password` 放行，不当会话失效）
  route('PUT', '/api/profile/password', (ctx) => {
    const body = readJson(ctx)
    if (typeof body.old_password !== 'string' || typeof body.new_password !== 'string') badRequest('Validation error: 缺少 old_password / new_password')
    if (body.old_password !== ctx.me.password) return fail(401, 'Old password is incorrect')
    if (body.new_password.length < 6 || body.new_password.length > 100) badRequest('Validation error: new_password: length must be between 6 and 100')
    ctx.me.password = body.new_password
    ctx.me.updated_at = iso(Date.now())
    return json({ message: 'Password updated successfully' })
  }),

  // 本端点的成功响应是**裸的**，而且是文档写明的（`个人资料管理.md:479-485`）
  route('DELETE', '/api/profile/background', (ctx) => {
    ctx.me.background = null
    ctx.me.updated_at = iso(Date.now())
    return json({ background_url: '', message: '背景图已重置为默认' })
  }),

  route('GET', '/api/profile/:userId/public', (ctx) => {
    const user = W().users.get(ctx.params.userId)
    if (!user) notFound('用户不存在')
    return ok(publicProfileDto(user))
  }),
]
