import { clearSessionCookie, cookieOptionsFromEnv } from './cookie'
import { openDatabase } from './db'
import { createSessionStore, type SessionStore } from './store'

export { SESSION_COOKIE_NAME, clearSessionCookie, cookieOptionsFromEnv, readSessionId, serializeSessionCookie } from './cookie'
export { SessionDead, UpstreamUnavailable, ensureFreshAccessToken } from './refresh'
export type { Session, SessionStore, SessionUser } from './store'

/**
 * 进程内单例。第一次调用时打开数据库并建表。
 *
 * 缓存的是 Promise 而不是解析后的 store：并发的首次调用会共享同一次打开过程，
 * 不会各开一个连接、各建一次表。
 */
let storePromise: Promise<SessionStore> | null = null

export function getSessionStore(): Promise<SessionStore> {
  if (!storePromise) {
    const path = process.env.SESSION_DB_PATH
    if (!path) throw new Error('缺少环境变量 SESSION_DB_PATH——会话无处存放')
    storePromise = openDatabase(path).then(createSessionStore)
  }
  return storePromise
}

/** 仅供测试：丢掉单例，让下一次调用重新打开 */
export function resetSessionStore(): void {
  storePromise = null
}

/**
 * BFF 自己产生的三种响应之一：会话失效。
 *
 * 形状与后端的错误信封一致（`{success:false, code, error}`），让客户端的解包层
 * 不必为 BFF 单开一条分支。**这是 BFF 唯一会自己造的错误文案** ——
 * 其余一律上游原样，见 spec §6。
 */
export function sessionExpiredResponse(): Response {
  return new Response(JSON.stringify({ success: false, code: 401, error: '会话已失效，请重新登录' }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'set-cookie': clearSessionCookie(cookieOptionsFromEnv()) },
  })
}

/** 上游不可达。透传 502，不编造文案（edge 那份 JSON 已经说明了原因） */
export function upstreamUnavailableResponse(): Response {
  return new Response(JSON.stringify({ success: false, code: 502, error: '后端暂时不可用，请稍后重试' }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  })
}

/** 跨站写请求。SameSite=Lax 之外的第二道 */
export function crossSiteRejectedResponse(): Response {
  return new Response(JSON.stringify({ success: false, code: 403, error: '跨站请求已被拒绝' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  })
}
