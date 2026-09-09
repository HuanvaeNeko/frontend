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
