import type { ActionFunctionArgs } from 'react-router'
import { isCrossSiteWrite } from '../../../server/proxy/forward'
import {
  cookieOptionsFromEnv,
  crossSiteRejectedResponse,
  getSessionStore,
  serializeSessionCookie,
  upstreamUnavailableResponse,
  type SessionUser,
} from '../../../server/session'
import { upstreamHttp } from '../../../server/upstream'

/**
 * `POST /api/auth/login` —— 建会话。
 *
 * 这是资源路由（只有 action、没有 default export），RR 不会给它套任何布局。
 *
 * 与其余 `/api/*` 的关键差别：**响应体里绝不含 token**。上游返回的 access /
 * refresh token 只写进 SQLite，浏览器拿到的只有一个 httpOnly cookie 和用户字段。
 */

/** 登录响应的严格解析：三个字段全部必需。缺任何一个都不建会话——一个没有
 *  refresh token 的会话在 15 分钟后必死，且死法是「无声地开始 401」。 */
interface LoginTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: SessionUser
}

function parseLogin(userId: string, body: unknown): LoginTokens {
  const envelope = body as { data?: unknown } | null
  const data = (envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : body) as Record<string, unknown> | null
  if (!data || typeof data !== 'object') throw new Error('登录响应不是对象')

  const accessToken = data.access_token
  if (typeof accessToken !== 'string' || accessToken === '') throw new Error('access_token 缺失或不是非空字符串')
  const refreshToken = data.refresh_token
  if (typeof refreshToken !== 'string' || refreshToken === '') throw new Error('refresh_token 缺失或不是非空字符串')
  const expiresIn = data.expires_in
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) throw new Error('expires_in 缺失或不是有限数字')

  // 用户字段是快照，用于 GET /api/session 的首帧渲染；完整资料仍由客户端
  // loadProfile() 拉取覆盖。后端两套命名都收（user_nickname / nickname）。
  const pick = (a: unknown, b: unknown): string | undefined => {
    for (const v of [a, b]) if (typeof v === 'string' && v !== '') return v
    return undefined
  }

  return {
    accessToken, refreshToken, expiresIn,
    user: {
      user_id: userId,
      nickname: pick(data.user_nickname, data.nickname),
      email: pick(data.user_email, data.email),
      // 相对路径原样存。客户端的 toAbsoluteApiUrl 会把它落到同源 /avatars/…，
      // 正好进 passthrough 分支。BFF 不在这里补基址——那是客户端的约定。
      avatar_url: pick(data.user_avatar_url, data.avatar_url),
      signature: pick(data.user_signature, data.signature),
    },
  }
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejectedResponse()

  const payload = (await request.json()) as { user_id?: unknown; password?: unknown }
  const userId = typeof payload.user_id === 'string' ? payload.user_id : ''
  if (userId === '') {
    return new Response(JSON.stringify({ success: false, code: 400, error: '缺少 user_id' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${upstreamHttp()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        password: payload.password,
        // 后端把它显示在「设备管理」里。浏览器侧唯一有意义的设备标识就是 UA。
        device_info: request.headers.get('user-agent') ?? 'unknown',
        mac_address: 'unknown',
      }),
    })
  } catch {
    return upstreamUnavailableResponse()
  }

  // 失败原样透传：后端的「用户名或密码错误」比任何自造文案都准确
  if (!upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  }

  let tokens: LoginTokens
  try {
    tokens = parseLogin(userId, await upstream.json())
  } catch {
    // 形状不对不是「密码错」，回 502 而不是 401：让用户重试密码是错误建议
    return upstreamUnavailableResponse()
  }

  const store = await getSessionStore()
  const now = Date.now()

  // 惰性清理：把 30 天没露面的会话删掉。放在登录这一刻做，不设 cron。
  store.deleteExpired(now - 30 * 24 * 60 * 60 * 1000)

  const id = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
  store.create({
    id, userId, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
    accessExpiresAt: now + tokens.expiresIn * 1000, user: tokens.user, now,
    userAgent: request.headers.get('user-agent'),
  })

  return new Response(JSON.stringify({ success: true, code: 200, data: { user: tokens.user } }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': serializeSessionCookie(id, cookieOptionsFromEnv()),
    },
  })
}
