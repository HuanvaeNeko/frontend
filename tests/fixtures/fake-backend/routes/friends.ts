import { approveFriendRequest, createFriendRequest, rejectFriendRequest, removeFriend } from '../actions'
import type { Ctx } from '../http'
import { badRequest, notFound, ok, okMessage, optionalString, type Route, readJson, requireString, route } from '../http'
import { areFriends, friendDto, friendIdsOf, listedUserDto, mustUser, ownerEntry, pendingRequestDto, sentRequestDto, W } from '../state'
import { iso } from '../time'

/**
 * `/api/friends/*`。三个列表端点 `data` 本身就是数组（README 2026-03-08 的信封化变更日志），
 * 拉黑 / 特别关心的写操作回 `{success, code, message}`、没有 `data`（文档写明的 `ApiResponse::ok`）。
 */

/** 请求体里自报的 `user_id` 必须是登录用户本人（文档：「须与 token 一致」）。 */
function assertSelf(ctx: Ctx, body: Record<string, unknown>): void {
  if (body.user_id !== undefined && body.user_id !== ctx.me.user_id) badRequest('user_id 与当前登录用户不一致')
}

export const friendRoutes: Route[] = [
  route('GET', '/api/friends', (ctx) => {
    const rows = friendIdsOf(ctx.me.user_id).map((id) => friendDto(ctx.me.user_id, id))
    rows.sort((a, b) => Date.parse(b.add_time) - Date.parse(a.add_time))
    return ok(rows)
  }),

  route('GET', '/api/friends/requests/pending', (ctx) =>
    ok(W().friendRequests.filter((r) => r.to === ctx.me.user_id && r.status === 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at)).map(pendingRequestDto)),
  ),

  route('GET', '/api/friends/requests/sent', (ctx) =>
    ok(W().friendRequests.filter((r) => r.from === ctx.me.user_id && r.status === 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at)).map(sentRequestDto)),
  ),

  route('POST', '/api/friends/requests', (ctx) => {
    const body = readJson(ctx)
    assertSelf(ctx, body)
    const message = createFriendRequest(ctx.me.user_id, requireString(body, 'target_user_id'), optionalString(body, 'reason') ?? null)
    return okMessage(message)
  }),

  route('POST', '/api/friends/requests/approve', (ctx) => {
    const body = readJson(ctx)
    assertSelf(ctx, body)
    approveFriendRequest(ctx.me.user_id, requireString(body, 'applicant_user_id'))
    return okMessage('已同意好友请求')
  }),

  route('POST', '/api/friends/requests/reject', (ctx) => {
    const body = readJson(ctx)
    assertSelf(ctx, body)
    rejectFriendRequest(ctx.me.user_id, requireString(body, 'applicant_user_id'), optionalString(body, 'reject_reason') ?? null)
    return okMessage('已拒绝好友请求')
  }),

  route('POST', '/api/friends/remove', (ctx) => {
    const body = readJson(ctx)
    assertSelf(ctx, body)
    removeFriend(ctx.me.user_id, requireString(body, 'friend_user_id'))
    return okMessage('已删除好友')
  }),

  // 成功时 HTTP 200 **空响应体**（后端 handler 返回 `()`）
  route('POST', '/api/friends/remark', (ctx) => {
    const body = readJson(ctx)
    assertSelf(ctx, body)
    const friendId = requireString(body, 'friend_user_id')
    const remark = typeof body.remark === 'string' ? body.remark : badRequest('缺少字段 remark')
    if (!areFriends(ctx.me.user_id, friendId)) badRequest('好友关系不存在')
    if ([...remark].length > 30) badRequest('备注最长 30 个字符')
    const remarks = ownerEntry(W().remarks, ctx.me.user_id)
    if (remark === '') remarks.delete(friendId)
    else remarks.set(friendId, remark)
    return new Response(null, { status: 200 })
  }),

  route('GET', '/api/friends/blacklist', (ctx) =>
    ok([...(W().blacklist.get(ctx.me.user_id) ?? new Map<string, string>()).entries()].map(([id, at]) => listedUserDto(id, at))),
  ),

  route('POST', '/api/friends/blacklist', (ctx) => {
    const target = requireString(readJson(ctx), 'target_user_id')
    mustUser(target)
    if (target === ctx.me.user_id) badRequest('不能拉黑自己')
    ownerEntry(W().blacklist, ctx.me.user_id).set(target, iso(Date.now()))
    return okMessage('已拉黑')
  }),

  route('DELETE', '/api/friends/blacklist/:target', (ctx) => {
    if (!W().blacklist.get(ctx.me.user_id)?.delete(ctx.params.target)) notFound('该用户不在黑名单中')
    return okMessage('已取消拉黑')
  }),

  route('GET', '/api/friends/special-care', (ctx) =>
    ok([...(W().specialCare.get(ctx.me.user_id) ?? new Map<string, string>()).entries()].map(([id, at]) => listedUserDto(id, at))),
  ),

  route('POST', '/api/friends/special-care', (ctx) => {
    const target = requireString(readJson(ctx), 'target_user_id')
    if (!areFriends(ctx.me.user_id, target)) badRequest('好友关系不存在')
    ownerEntry(W().specialCare, ctx.me.user_id).set(target, iso(Date.now()))
    return okMessage('已特别关心')
  }),

  route('DELETE', '/api/friends/special-care/:target', (ctx) => {
    if (!W().specialCare.get(ctx.me.user_id)?.delete(ctx.params.target)) notFound('该用户不在特别关心名单中')
    return okMessage('已取消特别关心')
  }),
]
