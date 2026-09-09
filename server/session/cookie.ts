export const SESSION_COOKIE_NAME = 'hv_session'

/** 30 天。cookie 的 Max-Age 只是钥匙的寿命，服务端那一行才是真值 */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export interface CookieOptions {
  /** 生产必须为 true；本地 http 下必须为 false，否则浏览器整条丢弃 */
  secure: boolean
}

function attributes(opts: CookieOptions, maxAge: number): string {
  // SameSite=Lax：跨站 POST 带不上 cookie（本项目所有写操作都是 JSON fetch，
  // 不是表单），这是 CSRF 的第一道；第二道是 api.$.ts 里对
  // Sec-Fetch-Site: cross-site 的非 GET 请求直接拒绝。
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function serializeSessionCookie(id: string, opts: CookieOptions): string {
  return `${SESSION_COOKIE_NAME}=${id}; ${attributes(opts, MAX_AGE_SECONDS)}`
}

export function clearSessionCookie(opts: CookieOptions): string {
  return `${SESSION_COOKIE_NAME}=; ${attributes(opts, 0)}`
}

export function readSessionId(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    // 必须整名相等：`hv_session_other=…` 不能被 startsWith 之类误读成会话 id
    if (pair.slice(0, eq).trim() !== SESSION_COOKIE_NAME) continue
    const value = pair.slice(eq + 1).trim()
    return value === '' ? null : value
  }
  return null
}

export function cookieOptionsFromEnv(): CookieOptions {
  return { secure: process.env.SESSION_COOKIE_SECURE === 'true' }
}
