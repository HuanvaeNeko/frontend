import { upstreamHttp } from '../upstream'
import { killSession } from './kill'
import type { Session, SessionStore } from './store'

/** 后端明确说凭证不认（401）。会话已死，必须删。 */
export class SessionDead extends Error {
  constructor() {
    super('会话已失效，请重新登录')
    this.name = 'SessionDead'
  }
}

/**
 * 上游不可达 / 5xx / 响应形状坏。**会话保留。**
 *
 * 这条分档来自 P4b 的教训：此前刷新失败一律 clearAuth，一次网络抖动就销毁用户
 * 自己敲进去的第三方 API Key（只有他知道、应用无从恢复）。两侧代价不对称
 * （清少了泄露、清多了毁数据），所以只有后端**真的**说凭证不认才算会话结束。
 */
export class UpstreamUnavailable extends Error {
  constructor(cause?: unknown) {
    super('后端暂时不可用，请稍后重试', { cause })
    this.name = 'UpstreamUnavailable'
  }
}

/** 距过期不足这个时长才刷新。没有定时器、没有后台任务——只在有请求经过时惰性触发 */
const REFRESH_WINDOW_MS = 60_000

/**
 * 每会话单飞。生产是单进程，这就是唯一的并发入口；dev 下 Vite 进程与 SSR 模块
 * 可能各持一份模块实例，那时靠 store 的 CAS 兜底。
 */
let inFlight = new Map<string, Promise<string>>()

/** 仅供测试：清掉单飞表，避免用例间互相串 */
export function resetRefreshInFlight(): void {
  inFlight = new Map()
}

interface RefreshPayload {
  access_token: string
  refresh_token?: string
  expires_in: number
}

/**
 * 解析规则与客户端 authStore 的 refreshTokenPayload 一致（见 commit f3d7230）：
 * `refresh_token` **缺席是合法形状**，语义是「这次没轮换」。
 * 2026-09-09 线上实测：/api/auth/refresh 只回
 * `{access_token, token_type: 'Bearer', expires_in: 900}`。此前把缺席当形状错误，
 * 导致每次刷新都以登出收场。
 */
function parseRefresh(body: unknown): RefreshPayload {
  const envelope = body as { data?: unknown } | null
  const data = (envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : body) as Record<string, unknown> | null
  if (!data || typeof data !== 'object') throw new Error('刷新响应不是对象')

  const accessToken = data.access_token
  if (typeof accessToken !== 'string' || accessToken === '') throw new Error('access_token 缺失或不是非空字符串')

  const refreshToken = data.refresh_token
  if (refreshToken !== undefined && (typeof refreshToken !== 'string' || refreshToken === '')) {
    throw new Error('refresh_token 给了但不是非空字符串')
  }

  const expiresIn = data.expires_in
  // <= 0 必须当形状坏处理，不能只查"是有限数字"：0/负数会通过校验直接落进
  // accessExpiresAt = now + expiresIn * 1000，也就是"已经过期"或"立刻进入
  // 60 秒刷新窗口"——下一个经过这个会话的请求会立刻判定需要刷新，再打一次
  // 上游拿到同样坏的 expires_in，如此往复：变成每个请求都打一次上游刷新。
  // 线上实测值是 900，这里防的是后端形状变坏时的自伤。
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('expires_in 缺失、不是有限数字，或者 <= 0')
  }

  return { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn }
}

async function performRefresh(store: SessionStore, session: Session): Promise<string> {
  // 打上游之前必须重读一遍库里的当前记录，不能信调用方传进来的 session 快照：
  // 单飞表（inFlight）只挡得住「两次调用在同一个 tick 里重叠」，挡不住调用方在
  // `store.get` 和 `ensureFreshAccessToken` 之间有过 await、或者干脆长期持有一份
  // 快照——那种情况下单飞表早被上一轮的 .finally 清空了，陈旧快照会再次触发刷新，
  // 并把陈旧的 refresh_token 发给上游。今天后端不轮换 refresh_token，代价只是一次
  // 多余的请求（CAS 会输，读到赢家 token，结果仍正确）；一旦后端启用轮换，重放
  // 旧 RT 换到的就是 401 → SessionDead——会话明明健康，用户却被登出。
  const current = store.get(session.id)
  if (!current) throw new SessionDead()
  if (current.accessExpiresAt - Date.now() > REFRESH_WINDOW_MS) return current.accessToken

  let response: Response
  try {
    response = await fetch(`${upstreamHttp()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: current.refreshToken }),
    })
  } catch (error) {
    throw new UpstreamUnavailable(error)
  }

  if (response.status === 401) {
    killSession(store, session.id)
    throw new SessionDead()
  }
  if (!response.ok) throw new UpstreamUnavailable(`上游 ${response.status}`)

  let parsed: RefreshPayload
  try {
    parsed = parseRefresh(await response.json())
  } catch (error) {
    // 形状坏不是「凭证不认」：删会话会把一个还能用的登录态误杀
    throw new UpstreamUnavailable(error)
  }

  const now = Date.now()
  const next = {
    accessToken: parsed.access_token,
    // 缺席 → 沿用旧的。形状仍受上面校验（给了却不是非空字符串照抛）
    refreshToken: parsed.refresh_token ?? current.refreshToken,
    accessExpiresAt: now + parsed.expires_in * 1000,
    now,
  }

  const won = store.updateTokens(session.id, current.accessExpiresAt, next)
  if (won) return next.accessToken

  // CAS 输了：别人已经刷完并写进去了。用赢家那份，绝不覆盖。
  const winner = store.get(session.id)
  if (!winner) throw new SessionDead()
  return winner.accessToken
}

export async function ensureFreshAccessToken(store: SessionStore, session: Session): Promise<string> {
  if (session.accessExpiresAt - Date.now() > REFRESH_WINDOW_MS) {
    return session.accessToken
  }

  const existing = inFlight.get(session.id)
  if (existing) return existing

  const promise = performRefresh(store, session).finally(() => {
    // 只清自己那一格：晚到的结算不能抹掉后来者的槽位
    if (inFlight.get(session.id) === promise) inFlight.delete(session.id)
  })
  inFlight.set(session.id, promise)
  return promise
}
