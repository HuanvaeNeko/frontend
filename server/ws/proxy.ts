import {
  SessionDead,
  UpstreamUnavailable,
  ensureFreshAccessToken,
  getSessionStore,
  readSessionId,
  sessionExpiredResponse,
  upstreamUnavailableResponse,
} from '../session'
import { upstreamWs } from '../upstream'
import { registerSessionSocket, unregisterSessionSocket } from './registry'

export type WsAuth =
  | { ok: true; sessionId: string; token: string }
  | { ok: false; response: Response }

/**
 * WS 升级前的鉴权：cookie → 会话 → 惰性刷新 → 拿到 access token。
 *
 * 失败时返回的是**HTTP 响应**而不是抛错：升级请求还没变成 WebSocket，此时
 * 唯一能表达失败的方式就是普通 HTTP 状态码。浏览器侧会看到 close 1006
 * （握手失败），现有的重连退避会接管。
 */
export async function resolveWsToken(request: Request): Promise<WsAuth> {
  const sessionId = readSessionId(request)
  if (!sessionId) return { ok: false, response: sessionExpiredResponse() }

  const store = await getSessionStore()
  const session = store.get(sessionId)
  if (!session) return { ok: false, response: sessionExpiredResponse() }

  try {
    const token = await ensureFreshAccessToken(store, session)
    return { ok: true, sessionId, token }
  } catch (error) {
    if (error instanceof SessionDead) return { ok: false, response: sessionExpiredResponse() }
    if (error instanceof UpstreamUnavailable) return { ok: false, response: upstreamUnavailableResponse() }
    throw error
  }
}

/** 浏览器侧连接需要的最小接口（Bun 的 ServerWebSocket 的子集） */
export interface ClientSocket {
  send(data: string | ArrayBufferLike): void
  close(code?: number, reason?: string): void
}

export interface UpstreamPump {
  /** 浏览器 → 上游 */
  forward(data: string | ArrayBufferLike): void
  /** 浏览器侧关了，关上游 */
  close(code?: number, reason?: string): void
}

/**
 * 开上游连接并接成双向管道。
 *
 * token 只出现在**这一处** —— 上游 URL 的查询串里，服务端内部。浏览器从头到尾
 * 看不到它。（后端只支持 `?token=` 这一种 WS 鉴权方式，全部文档里没有任何
 * cookie 支持，所以这个查询串在服务端侧无法避免；能做到的是让它不出现在
 * 浏览器、不出现在浏览器历史、不出现在前端日志里。）
 */
export function pumpUpstream(sessionId: string, token: string, client: ClientSocket): UpstreamPump {
  const url = `${upstreamWs()}/ws?token=${encodeURIComponent(token)}`
  const upstream = new WebSocket(url)
  const queue: (string | ArrayBufferLike)[] = []
  let open = false

  registerSessionSocket(sessionId, client)

  upstream.onopen = () => {
    open = true
    // 上游握手完成前浏览器可能已经发了帧，补发出去，不丢
    for (const item of queue) upstream.send(item as string)
    queue.length = 0
  }

  upstream.onmessage = (event: MessageEvent) => {
    client.send(event.data as string | ArrayBufferLike)
  }

  upstream.onclose = (event: CloseEvent) => {
    unregisterSessionSocket(sessionId, client)
    // 用上游的 code 关浏览器侧：access token 到期导致的关闭要如实传下去，
    // 客户端的重连才会在新一次升级里触发刷新。
    try {
      client.close(event.code, event.reason)
    } catch {
      // 已经关了
    }
  }

  upstream.onerror = () => {
    unregisterSessionSocket(sessionId, client)
    try {
      client.close(1011, 'upstream error')
    } catch {
      // 已经关了
    }
  }

  return {
    forward(data) {
      if (open) upstream.send(data as string)
      else queue.push(data)
    },
    close(code, reason) {
      unregisterSessionSocket(sessionId, client)
      try {
        upstream.close(code, reason)
      } catch {
        // 已经关了
      }
    },
  }
}
