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

/**
 * 挂到 globalThis，不能是普通模块级变量。
 *
 * 生产进程里这个模块被求值**两次**：`server/index.ts` 直接跑源码（`/ws` 升级
 * 在这里调用 registerSessionSocket），而资源路由（登出、非业务 401、刷新时
 * 上游 401）被 Rolldown 打进 `build/server/index.js`，那份 bundle 里也带着
 * 它自己重新打包的一份 `registry.ts`。这是同一个 realm 里的两个模块实例，
 * 各自的顶层 `const sockets = new Map()` 求值出两个互不相干的 Map——写入方
 * （WS 升级）与读出方（killSession 的关 WS 那一半）分别落在这两个实例上，
 * 于是登出关的永远是一张空表，WS 原样活着（2026-09 终审 C1，用真实构建产物
 * 复现）。vitest 里没有打包，两处 import 解析到同一个模块实例，这个分裂在
 * 单测里完全不可见。
 *
 * globalThis 是这两份实例唯一共享的东西：不管模块图长什么样，Bun 进程与它
 * `await import()` 进来的 SSR bundle 终究是同一个 JS realm，`Symbol.for`
 * 保证跨模块图拿到同一个 symbol、从而读写同一个 Map。
 */
const GLOBAL_KEY = Symbol.for('huanvae.session-sockets')
const g = globalThis as { [GLOBAL_KEY]?: Map<string, Set<CloseableSocket>> }
// 拆成两条语句（而不是 `const sockets = (g[GLOBAL_KEY] ??= new Map())`）：
// biome 的 noAssignInExpressions 不允许赋值嵌在另一个表达式里，语义不变。
g[GLOBAL_KEY] ??= new Map<string, Set<CloseableSocket>>()
const sockets = g[GLOBAL_KEY] as Map<string, Set<CloseableSocket>>

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

/** 仅供测试：清空登记表 */
export function resetSessionSocketRegistry(): void {
  sockets.clear()
}
