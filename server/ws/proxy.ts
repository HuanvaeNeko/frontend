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
  forward(data: string | ArrayBufferView | ArrayBufferLike): void
  /** 浏览器侧关了，关上游 */
  close(code?: number, reason?: string): void
}

/**
 * 1005 / 1006 / 1015 按协议**不能**作为关闭码发送；Bun 收到这三个会静默改写成 1000，
 * 1001 同样被改写成 1000。而 wsStore 对 1000/1001 明确不重连
 * （`event.code !== 1000 && event.code !== 1001`），于是「上游掉线」会伪装成
 * 「正常关闭」，聊天连接静默死亡到用户刷新页面为止。映射成 1011。
 */
function relayCloseCode(code: number): number {
  if (code === 1000) return 1000
  if (code >= 3000 && code <= 4999) return code
  if (code >= 1002 && code <= 1014 && code !== 1005 && code !== 1006) return code
  return 1011
}

/**
 * 双向管道的公共实现：开上游连接、排队补发、双向转发、关闭码映射。
 * `pumpUpstream`（聊天，登记会话）与 `pumpPassthrough`（WebRTC 信令透传，
 * 不登记）共用这一份，唯一区别是要不要碰会话登记表——`sessionId` 为
 * `undefined` 时全程跳过 `registerSessionSocket` / `unregisterSessionSocket`。
 */
function createPump(url: string, client: ClientSocket, sessionId: string | undefined): UpstreamPump {
  const upstream = new WebSocket(url)
  const queue: (string | ArrayBufferView | ArrayBufferLike)[] = []
  let open = false

  if (sessionId !== undefined) registerSessionSocket(sessionId, client)

  upstream.onopen = () => {
    open = true
    // 上游握手完成前浏览器可能已经发了帧，补发出去，不丢
    for (const item of queue) upstream.send(item)
    queue.length = 0
  }

  upstream.onmessage = (event: MessageEvent) => {
    client.send(event.data)
  }

  upstream.onclose = (event: CloseEvent) => {
    if (sessionId !== undefined) unregisterSessionSocket(sessionId, client)
    // 用上游的 code 关浏览器侧：access token 到期导致的关闭要如实传下去，
    // 客户端的重连才会在新一次升级里触发刷新。
    try {
      client.close(relayCloseCode(event.code), event.reason)
    } catch {
      // 已经关了
    }
  }

  upstream.onerror = () => {
    if (sessionId !== undefined) unregisterSessionSocket(sessionId, client)
    try {
      client.close(1011, 'upstream error')
    } catch {
      // 已经关了
    }
  }

  return {
    forward(data) {
      if (open) upstream.send(data)
      else queue.push(data)
    },
    close(code, reason) {
      if (sessionId !== undefined) unregisterSessionSocket(sessionId, client)
      try {
        upstream.close(code, reason)
      } catch {
        // 已经关了
      }
    },
  }
}

/**
 * 开上游连接并接成双向管道（聊天，`/ws`）。
 *
 * token 只出现在**这一处** —— 上游 URL 的查询串里，服务端内部。浏览器从头到尾
 * 看不到它。（后端只支持 `?token=` 这一种 WS 鉴权方式，全部文档里没有任何
 * cookie 支持，所以这个查询串在服务端侧无法避免；能做到的是让它不出现在
 * 浏览器、不出现在浏览器历史、不出现在前端日志里。）
 */
export function pumpUpstream(sessionId: string, token: string, client: ClientSocket): UpstreamPump {
  const url = `${upstreamWs()}/ws?token=${encodeURIComponent(token)}`
  return createPump(url, client, sessionId)
}

/**
 * WebRTC 信令的 WS 透传（`/ws/webrtc/rooms/*`）：不查会话、不注入 token、
 * 不进会话登记表，`path+query` 原样接上游——与 §4.5 的 HTTP 透传（`passthrough.$.ts`）
 * 同一哲学，spec §4.6 有名字。
 *
 * 信令端点自己认 `joinRoom` 返回的 `ws_token`（或分享链接里的 `?token=`）；
 * 参与者可能根本没有登录态，套「cookie → 会话 → token」那一套鉴权代理在这里
 * 既做不到也不该做。BFF 出现在这条路径上纯粹是因为浏览器直连不了后端
 * （`api.huanvae.cn` 被 ICP 拦，no-SNI 直连撞上需要客户端证书的 mTLS 边缘）——
 * 它在这里只是一根线，不是鉴权关卡，所以 `pathWithQuery` 必须逐字拼接，
 * 不能经过 `encodeURI` 之类的 URL 序列化（那会把已经编码过的查询参数
 * 二次编码，例如 `%2F` 变成 `%252F`，静默改写信令 URL）。
 */
export function pumpPassthrough(pathWithQuery: string, client: ClientSocket): UpstreamPump {
  const url = `${upstreamWs()}${pathWithQuery}`
  return createPump(url, client, undefined)
}
