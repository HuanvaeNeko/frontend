import { badRequest, bytesBody, json, notFound, ok, okMessage, type Route, readJson, route } from '../http'
import { assets } from '../media/assets'
import { randHex, uuid } from '../random'
import { createRoom, iceServers, joinRoom } from '../rtc'
import { resolveAccessToken } from '../sessions'
import { areFriends, W } from '../state'
import { iso } from '../time'
import type { UserRec } from '../types'

/**
 * 发现搜索、机器人、小程序、OAuth、WebRTC 的 REST 部分，以及小程序页面 `/apps/*`。
 */

const OAUTH_SCOPES = ['profile', 'email', 'friends', 'groups']

/** 发现搜索是**完全匹配**（大小写不敏感）或 ID 精确匹配（`发现搜索.md:164`）。 */
const exact = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

function optionalUser(request: Request): UserRec | null {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const resolved = resolveAccessToken(auth.slice(7))
  return resolved.ok ? (W().users.get(resolved.session.user_id) ?? null) : null
}

export const miscRoutes: Route[] = [
  route('GET', '/api/discovery/search', (ctx) => {
    const keyword = (ctx.query.get('keyword') ?? '').trim()
    if (keyword === '') badRequest('keyword 不能为空')
    const limit = Math.min(50, Math.max(1, Math.trunc(Number(ctx.query.get('limit')) || 20)))
    const me = ctx.me.user_id
    const world = W()
    const people = [...world.users.values()]
      .filter((u) => u.user_id !== me && u.allow_search && u.search_visible_by_id && (exact(u.nickname, keyword) || u.user_id === keyword))
      .slice(0, limit)
      .map((u) => ({ user_id: u.user_id, nickname: u.nickname, avatar_url: u.avatar, is_friend: areFriends(me, u.user_id) }))
    const groups = [...world.groups.values()]
      .filter((g) => g.status === 'active' && (exact(g.name, keyword) || g.group_id === keyword))
      .filter((g) => {
        const role = g.members.get(me)?.role
        if (g.policy.search_scope === 'everyone') return true
        if (g.policy.search_scope === 'admins') return role === 'owner' || role === 'admin'
        return role === 'owner'
      })
      .slice(0, limit)
      .map((g) => ({ group_id: g.group_id, group_name: g.name, avatar_url: g.avatar, member_count: g.members.size, join_approval_required: g.policy.join_approval_required, is_member: g.members.has(me) }))
    const bots = world.bots
      .filter((b) => b.is_active && b.is_discoverable && (exact(b.username, keyword) || b.bot_user_id === keyword))
      .slice(0, limit)
      .map((b) => ({ bot_user_id: b.bot_user_id, username: b.username, nickname: b.nickname, avatar_url: null, is_friend: false }))
    return ok({ people, groups, bots })
  }),

  route('GET', '/api/bots', (ctx) =>
    ok(
      W()
        .bots.filter((b) => b.owner_id === ctx.me.user_id)
        .map((b) => ({ ...b, avatar_url: null, message_policy: 'everyone' })),
    ),
  ),

  route('GET', '/api/miniapps/my', (ctx) => ok(W().miniapps.filter((m) => m.owner_id === ctx.me.user_id).map(({ owner_id: _owner, ...m }) => m))),

  // ── OAuth ──

  route('GET', '/api/oauth/clients', (ctx) =>
    ok(W().oauthClients.filter((c) => c.owner_id === ctx.me.user_id).map(({ client_secret: _secret, owner_id: _owner, ...c }) => c)),
  ),

  route('POST', '/api/oauth/clients', (ctx) => {
    const body = readJson(ctx)
    const appName = typeof body.app_name === 'string' ? body.app_name.trim() : ''
    if (appName === '') badRequest('app_name 不能为空')
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string' && u !== '') : []
    if (redirectUris.length === 0) badRequest('至少需要一个 redirect_uri')
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s): s is string => typeof s === 'string') : ['profile']
    const unknown = scopes.filter((s) => !OAUTH_SCOPES.includes(s))
    if (unknown.length > 0) badRequest(`不支持的 scope: ${unknown.join(', ')}`)
    const client = {
      client_id: uuid(), client_secret: `sk_${randHex(40)}`, owner_id: ctx.me.user_id, client_type: 'external' as const, app_name: appName,
      app_description: typeof body.app_description === 'string' ? body.app_description : '',
      app_homepage_url: typeof body.app_homepage_url === 'string' && body.app_homepage_url !== '' ? body.app_homepage_url : null,
      app_logo_url: typeof body.app_logo_url === 'string' && body.app_logo_url !== '' ? body.app_logo_url : null,
      redirect_uris: redirectUris, allowed_scopes: scopes, is_active: true, created_at: iso(Date.now()),
    }
    W().oauthClients.push(client)
    return ok({ client_id: client.client_id, client_secret: client.client_secret, app_name: client.app_name })
  }),

  route('DELETE', '/api/oauth/clients/:clientId', (ctx) => {
    const list = W().oauthClients
    const index = list.findIndex((c) => c.client_id === ctx.params.clientId && c.owner_id === ctx.me.user_id)
    if (index < 0) notFound('客户端不存在')
    list.splice(index, 1)
    return okMessage('客户端已删除')
  }),

  route('POST', '/api/oauth/clients/:clientId/reset-secret', (ctx) => {
    const client = W().oauthClients.find((c) => c.client_id === ctx.params.clientId && c.owner_id === ctx.me.user_id)
    if (!client) notFound('客户端不存在')
    client.client_secret = `sk_${randHex(40)}`
    return ok({ client_secret: client.client_secret })
  }),

  route('GET', '/api/oauth/grants', (ctx) =>
    ok(W().oauthGrants.filter((g) => g.user_id === ctx.me.user_id).map(({ user_id: _user, ...g }) => g)),
  ),

  route('DELETE', '/api/oauth/grants/:grantId', (ctx) => {
    const list = W().oauthGrants
    const index = list.findIndex((g) => g.id === ctx.params.grantId && g.user_id === ctx.me.user_id)
    if (index < 0) notFound('授权不存在')
    list.splice(index, 1)
    return okMessage('已取消授权')
  }),

  route('POST', '/api/oauth/authorize', (ctx) => {
    const body = readJson(ctx)
    const client = W().oauthClients.find((c) => c.client_id === body.client_id && c.is_active)
    if (!client) badRequest('client_id 无效')
    const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : ''
    if (!client.redirect_uris.includes(redirectUri)) badRequest('redirect_uri 未注册')
    const scopes = (typeof body.scope === 'string' && body.scope.trim() !== '' ? body.scope : 'profile').split(/\s+/)
    if (scopes.some((s) => !client.allowed_scopes.includes(s))) badRequest('scope 超出客户端允许范围')
    if (typeof body.code_challenge === 'string' && body.code_challenge_method !== 'S256') badRequest('提供 code_challenge 时 code_challenge_method 必须是 S256')
    const existing = W().oauthGrants.find((g) => g.user_id === ctx.me.user_id && g.client_id === client.client_id)
    const covered = existing ? scopes.every((s) => existing.scope.split(/\s+/).includes(s)) : false
    if (client.client_type === 'external' && !covered && body.consent !== true) {
      return ok({ consent_required: true, app_name: client.app_name, app_logo_url: client.app_logo_url, scopes })
    }
    if (existing) existing.scope = [...new Set([...existing.scope.split(/\s+/), ...scopes])].join(' ')
    else W().oauthGrants.push({ id: uuid(), user_id: ctx.me.user_id, client_id: client.client_id, app_name: client.app_name, app_logo_url: client.app_logo_url, scope: scopes.join(' '), created_at: iso(Date.now()) })
    return ok({ code: `code_${randHex(32)}`, state: typeof body.state === 'string' ? body.state : null, redirect_uri: redirectUri })
  }),

  // ── WebRTC ──

  route('GET', '/api/webrtc/ice_servers', () => json({ success: true, data: iceServers() })),

  route('POST', '/api/webrtc/rooms', (ctx) => json({ success: true, data: createRoom(ctx.me, readJson(ctx)) })),

  // 文档写「无需登录」；经 BFF 过来会带 Bearer，有就认、没有就当访客
  route('POST', '/api/webrtc/rooms/:roomId/join', (ctx) => json({ success: true, data: joinRoom(ctx.params.roomId, optionalUser(ctx.request), readJson(ctx)) }), { auth: false }),
]

// ── 小程序页面：/apps/<name>/… ──

const APP_PAGES: Record<string, { title: string; icon: 'weather' | 'ledger' | 'film'; body: string }> = {
  weather: {
    title: '天气',
    icon: 'weather',
    body: '<h1>☀️ 上海 · 多云转晴</h1><p>最高 26°C / 最低 19°C，降水概率 20%。</p><p>今天不用带伞，但早晚有点凉，记得加件外套。</p>',
  },
  ledger: {
    title: '记账本',
    icon: 'ledger',
    body: '<h1>📒 本月支出 ¥5,783.50</h1><ul><li>房租 ¥4,500</li><li>超市 ¥326.50</li><li>话费 ¥58</li><li>徒步装备 ¥899</li></ul>',
  },
}

export function handleAppsRequest(url: URL): Response | null {
  const match = /^\/apps\/([^/]+)(\/.*)?$/.exec(url.pathname)
  if (!match) return null
  const page = APP_PAGES[match[1]]
  if (!page) return new Response('小程序不存在', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  const rest = match[2] ?? '/'
  if (rest === '/icon.png') {
    const icon = assets.appIcon(page.icon)
    return new Response(bytesBody(icon.bytes), { headers: { 'content-type': icon.contentType, 'cache-control': 'public, max-age=86400' } })
  }
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title}</title>
<style>body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1f2937}h1{font-size:22px}</style></head>
<body>${rest.startsWith('/oauth/callback') ? `<h1>授权回调</h1><p>收到的查询串：<code>${url.search.replace(/[<>&"]/g, '')}</code></p>` : page.body}<p style="color:#9ca3af;font-size:12px">由 huanvae fake-backend 提供</p></body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
