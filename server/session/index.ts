import { clearSessionCookie, cookieOptionsFromEnv } from './cookie'
import { openDatabase } from './db'
import { createSessionStore, type SessionStore } from './store'

export { SESSION_COOKIE_NAME, clearSessionCookie, cookieOptionsFromEnv, readSessionId, serializeSessionCookie } from './cookie'
export { killSession } from './kill'
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
 * spec §6 条目 1：「无上游响应可引」时 BFF 自造的几种响应之一——会话失效。
 *
 * 形状与后端的错误信封一致（`{success:false, code, error}`），让客户端的解包层
 * 不必为 BFF 单开一条分支。其余几种见同文件的 upstreamUnavailableResponse
 * （条目 2）、crossSiteRejectedResponse（条目 3），以及各路由里请求体不合格的 400
 * （条目 4）——这不是唯一一条，只是这一条。
 */
export function sessionExpiredResponse(): Response {
  return new Response(JSON.stringify({ success: false, code: 401, error: '会话已失效，请重新登录' }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'set-cookie': clearSessionCookie(cookieOptionsFromEnv()) },
  })
}

/**
 * spec §6 条目 2：只在**没有上游响应可转发**时才会走到这里——fetch 直接抛错
 * （登录或刷新阶段都可能），或者（刷新场景下）refresh 端点回了 5xx / 响应形状坏。
 * refresh 端点 5xx 时 body 其实是存在的，但那份 body 描述的是刷新这一次请求，
 * 不是浏览器发出的原始请求，所以不转发；此时自造这条 502 文案是唯一诚实的选项。
 */
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
