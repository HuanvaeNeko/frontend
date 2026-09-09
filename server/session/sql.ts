/**
 * 会话表的全部 SQL。**本文件不允许有任何 import。**
 *
 * 原因：这些语句有两个消费方，且它们不能共用同一个 sqlite 驱动 ——
 * 一是 `server/session/db.ts`（运行时按 Bun / Node 动态选驱动），
 * 二是 `vite.config.ts` 的 `server.proxy['/ws']` 钩子（Vite 的 proxyReqWs 是
 * **同步**回调，读不了异步打开的 store，只能自己用 node:sqlite 同步查一次）。
 * 把语句提到这里，两边共用同一份字符串，避免「两处各写一遍 SELECT、日后改一边
 * 忘了另一边」这种分叉。
 */

export const SESSION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,
  user_json         TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  last_seen_at      INTEGER NOT NULL,
  user_agent        TEXT
);
CREATE INDEX IF NOT EXISTS sessions_last_seen ON sessions(last_seen_at);
`

export const SESSION_INSERT_SQL = `
INSERT INTO sessions
  (id, user_id, access_token, refresh_token, access_expires_at, user_json, created_at, last_seen_at, user_agent)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`

export const SESSION_SELECT_BY_ID_SQL = `SELECT * FROM sessions WHERE id = ?`

/**
 * CAS 更新：只有 access_expires_at 仍等于读到的旧值时才写入。
 *
 * 为什么是 CAS 而不是事务：刷新要跨网络调上游，绝不能把网络 I/O 关在 SQLite
 * 事务里。并发两个请求同时发现临期时，两者都会打上游，但只有一个能写进来；
 * 输的那个重读、用赢的那份 token。
 */
export const SESSION_UPDATE_TOKENS_CAS_SQL = `
UPDATE sessions
   SET access_token = ?, refresh_token = ?, access_expires_at = ?, last_seen_at = ?
 WHERE id = ? AND access_expires_at = ?
`

export const SESSION_TOUCH_SQL = `UPDATE sessions SET last_seen_at = ? WHERE id = ?`
export const SESSION_DELETE_SQL = `DELETE FROM sessions WHERE id = ?`
export const SESSION_DELETE_EXPIRED_SQL = `DELETE FROM sessions WHERE last_seen_at < ?`
