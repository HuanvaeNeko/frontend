import type { SqliteLike } from './db'
import {
  SESSION_DELETE_EXPIRED_SQL,
  SESSION_DELETE_SQL,
  SESSION_INSERT_SQL,
  SESSION_SELECT_BY_ID_SQL,
  SESSION_TOUCH_SQL,
  SESSION_UPDATE_TOKENS_CAS_SQL,
} from './sql'

/** 登录响应里的用户快照。只用于首帧渲染，完整资料仍由客户端 loadProfile() 拉 */
export interface SessionUser {
  user_id: string
  nickname?: string
  email?: string
  avatar_url?: string
  signature?: string
}

export interface Session {
  id: string
  userId: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  user: SessionUser
  createdAt: number
  lastSeenAt: number
  userAgent: string | null
}

export interface NewSession {
  id: string
  userId: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  user: SessionUser
  now: number
  userAgent: string | null | undefined
}

export interface TokenUpdate {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  now: number
}

export interface SessionStore {
  create(s: NewSession): Session
  get(id: string): Session | null
  /** CAS：仅当 access_expires_at 仍等于 expectedExpiresAt 时写入。返回是否写入 */
  updateTokens(id: string, expectedExpiresAt: number, next: TokenUpdate): boolean
  touch(id: string, now: number): void
  delete(id: string): void
  deleteExpired(before: number): number
}

interface Row {
  id: string
  user_id: string
  access_token: string
  refresh_token: string
  access_expires_at: number
  user_json: string
  created_at: number
  last_seen_at: number
  user_agent: string | null
}

function toSession(row: Row): Session {
  return {
    id: row.id,
    userId: row.user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    accessExpiresAt: Number(row.access_expires_at),
    // 这一行由 create() 写入、只可能是它序列化出来的 JSON。解析失败意味着
    // 表被外部改坏了，抛错是对的——不写 `?? {}` 兜底：那会让「会话里没有用户」
    // 变成一个看不见的状态，正是这个项目一直在消灭的形态。
    user: JSON.parse(row.user_json) as SessionUser,
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
    userAgent: row.user_agent,
  }
}

export function createSessionStore(db: SqliteLike): SessionStore {
  return {
    create(s) {
      db.prepare(SESSION_INSERT_SQL).run(
        s.id, s.userId, s.accessToken, s.refreshToken, s.accessExpiresAt,
        JSON.stringify(s.user), s.now, s.now, s.userAgent ?? null,
      )
      return {
        id: s.id, userId: s.userId, accessToken: s.accessToken, refreshToken: s.refreshToken,
        accessExpiresAt: s.accessExpiresAt, user: s.user,
        createdAt: s.now, lastSeenAt: s.now, userAgent: s.userAgent ?? null,
      }
    },

    get(id) {
      const row = db.prepare(SESSION_SELECT_BY_ID_SQL).get(id) as Row | undefined | null
      // bun:sqlite 返回 null，node:sqlite 返回 undefined——归一成 null
      return row ? toSession(row) : null
    },

    updateTokens(id, expectedExpiresAt, next) {
      const result = db.prepare(SESSION_UPDATE_TOKENS_CAS_SQL).run(
        next.accessToken, next.refreshToken, next.accessExpiresAt, next.now, id, expectedExpiresAt,
      )
      return Number(result.changes ?? 0) === 1
    },

    touch(id, now) {
      db.prepare(SESSION_TOUCH_SQL).run(now, id)
    },

    delete(id) {
      db.prepare(SESSION_DELETE_SQL).run(id)
    },

    deleteExpired(before) {
      return Number(db.prepare(SESSION_DELETE_EXPIRED_SQL).run(before).changes ?? 0)
    },
  }
}
