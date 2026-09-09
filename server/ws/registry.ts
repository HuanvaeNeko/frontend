/**
 * `sessionId → 该会话名下活着的 WS`。
 *
 * 单独一个模块而不是塞进 `ws/proxy.ts`：登出路由（跑在 SSR bundle 里）要关这些
 * 连接，而 `ws/proxy.ts` 会 import Bun 专属的 ServerWebSocket 类型。让登出只依赖
 * 这个零依赖的登记表，避免把 Bun 的类型拖进 bundle。
 *
 * ⚠️ 这是**进程内**的表。生产是单进程，成立；将来若多进程，登出关别的进程里的
 * 连接需要另想办法（那时 WS 也需要跨进程路由，是同一个更大的问题）。
 */
interface CloseableSocket {
  close(code?: number, reason?: string): void
}

const sockets = new Map<string, Set<CloseableSocket>>()

export function registerSessionSocket(sessionId: string, socket: CloseableSocket): void {
  const set = sockets.get(sessionId) ?? new Set<CloseableSocket>()
  set.add(socket)
  sockets.set(sessionId, set)
}

export function unregisterSessionSocket(sessionId: string, socket: CloseableSocket): void {
  const set = sockets.get(sessionId)
  if (!set) return
  set.delete(socket)
  if (set.size === 0) sockets.delete(sessionId)
}

/** 登出时调用。1000 = 正常关闭，客户端的重连逻辑不该把它当成故障 */
export function closeSessionSockets(sessionId: string): void {
  const set = sockets.get(sessionId)
  if (!set) return
  for (const socket of set) {
    try {
      socket.close(1000, 'session ended')
    } catch {
      // 已经关了就算了
    }
  }
  sockets.delete(sessionId)
}
