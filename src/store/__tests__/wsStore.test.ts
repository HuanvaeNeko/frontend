import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useWSStore } from '@/store/wsStore'

/**
 * BFF 落地后，`scheduleReconnect` 里「连续失败 3 次就刷 token」那段被删掉了
 * （刷新发生在 BFF 的升级处理里，客户端手里没有 token 可刷，见 `wsStore.ts`
 * 的注释），本文件此前钉的两条刷新失败分支用例随之作废。剩下要钉的是新形状：
 * 连接地址是同源相对路径 `/ws`，且不带 token。
 *
 * 又加了一组：给上重连（`reconnectAttempts >= MAX_RECONNECT_ATTEMPTS`）之后
 * 顺带问一声 `restoreSession`——只读页面可能永远不发一次 HTTP 请求，也就永远
 * 触不到能让 `fetchWithAuth` 发现 401 的时机，死会话可以在 WS 这一层悄悄挂着。
 *
 * Task 10 评审 I2 之后又补了一条：这一声 `restoreSession` 在同一个 give-up
 * episode 里只问一次（`wsStore.ts` 的 `hasAskedSessionSinceGiveUp`），挡住
 * "放弃 → restoreSession → user 换新引用 → ChatPage 的 effect 重跑 → 再连
 * WS → 再放弃" 这个没有退避的热循环。
 */

// authStore 的真实 `restoreSession`：每个 `beforeEach`都会把它放回去，防止某条
// 用例把它换成 mock 之后泄漏进下一条（zustand 的 `setState` 是合并写入，
// 不会自动把换掉的 action 复原）。
const realRestoreSession = useAuthStore.getState().restoreSession

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, restoreSession: realRestoreSession })
  useWSStore.setState({ reconnectAttempts: 0, reconnecting: false, connected: false, connecting: false, ws: null })
  vi.stubGlobal('WebSocket', vi.fn())
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  useWSStore.getState().disconnect()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('连的是同源 /ws，URL 里没有 token', () => {
  useWSStore.getState().connect()
  const url = String((globalThis.WebSocket as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])
  expect(url).toBe('/ws')
  expect(url).not.toContain('token')
})

it('重连放弃之后问一声 BFF 还登不登录着；更早的一次尝试不问', () => {
  const restoreSession = vi.fn().mockResolvedValue(undefined)
  useAuthStore.setState({ restoreSession })

  useWSStore.getState().connect()
  const ws = useWSStore.getState().ws as unknown as {
    onclose?: (event: { code: number; reason: string }) => void
  }

  // 正对照：远没到放弃的次数时，一次异常断开不该去问 BFF——没有这一句，
  // 下面的 toHaveBeenCalledTimes(1) 可能只是"任何一次断开都会问"，钉不住
  // "只在放弃时才问"这件事。
  ws.onclose?.({ code: 1006, reason: 'abnormal' })
  expect(restoreSession).not.toHaveBeenCalled()

  // MAX_RECONNECT_ATTEMPTS 是 wsStore.ts 的模块私有常量（值为 10，未导出），
  // 这里直接把 reconnectAttempts 摆到阈值上，让下一次断开落进"放弃"分支；
  // reconnecting 一并复位，避开 scheduleReconnect 开头 `state.reconnecting`
  // 那个更早的短路分支。
  useWSStore.setState({ reconnectAttempts: 10, reconnecting: false })
  ws.onclose?.({ code: 1006, reason: 'abnormal' })

  expect(restoreSession).toHaveBeenCalledTimes(1)
  expect(useWSStore.getState().error).toBe('无法连接到服务器，请刷新页面重试')
})

it('同一个 give-up episode 只问一次：两次连续放弃（中间没有真正连上）只调一次 restoreSession', () => {
  // 复现 I2 的真实机制：给上之后没有任何自动重连（放弃分支只 return，不排
  // setTimeout），但外部调用方（生产环境里是 ChatPage 的 effect）可能再调一次
  // connect()——那次连接同样立刻失败，reconnectAttempts 从没被放弃分支归零过，
  // 仍然 >= 阈值，第二次 onclose 会再落进同一个放弃分支。这是**同一个 episode**
  // （中间没有一次成功的 ws.onopen），不应该再问一次。
  const restoreSession = vi.fn().mockResolvedValue(undefined)
  useAuthStore.setState({ restoreSession })

  useWSStore.getState().connect()
  const ws1 = useWSStore.getState().ws as unknown as {
    onopen?: () => void
    onclose?: (event: { code: number; reason: string }) => void
  }
  // 复位：wsStore.ts 的 `hasAskedSessionSinceGiveUp` 是模块级变量，不随
  // beforeEach 重置，上一条用例（"更早的一次尝试不问"）可能已经把它置真且
  // 没有真正连上过。用一次成功的 onopen 让这条用例从"干净"的 episode 开始，
  // 不依赖用例的声明顺序。
  ws1.onopen?.()
  useWSStore.setState({ reconnectAttempts: 10, reconnecting: false })
  ws1.onclose?.({ code: 1006, reason: 'abnormal' })
  expect(restoreSession).toHaveBeenCalledTimes(1)

  // 外部再调一次 connect()：guard（`state.connected || state.connecting`）不会
  // 挡住它，因为上一次 onclose 已经把两者都置回了 false。
  useWSStore.getState().connect()
  const ws2 = useWSStore.getState().ws as unknown as {
    onclose?: (event: { code: number; reason: string }) => void
  }
  ws2.onclose?.({ code: 1006, reason: 'abnormal' })

  expect(restoreSession).toHaveBeenCalledTimes(1)
})
