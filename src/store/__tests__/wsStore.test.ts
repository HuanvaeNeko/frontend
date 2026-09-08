import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { useApiConfigStore } from '@/store/apiConfig'
import { useWSStore } from '@/store/wsStore'

/**
 * `scheduleReconnect` 的刷新失败分支。
 *
 * 这条路径是「网络刚抖过」的时刻——WebSocket 刚断、正在重连——所以它命中的
 * 绝大多数是**传输层失败**，而不是"后端说凭证不认了"。它此前无差别调
 * `authStore.clearAuth()`，也就是跑反向名单清盘 + `apiConfig.resetToDefault()`：
 * 一次断网就把用户自己敲进去的第三方 `aiApiKey` 销毁掉，只有他知道、应用无从恢复。
 *
 * 现在这里不再自己判：`refreshAccessToken` 内部已经分好档（真 401 → 会话结束，
 * 传输层失败 → 只丢票据）。两处各判一次的话，严格的那一处永远赢，分档等于没有。
 */

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const LOGIN = {
  success: true,
  code: 200,
  data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 },
}

/** 记录最后一个被创建出来的 socket，测试用它来触发 onclose。 */
let lastSocket: {
  close: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  readyState: number
  onopen: (() => void) | null
  onclose: ((event: { code: number; reason: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  onmessage: ((event: { data: string }) => void) | null
}

let fetchMock: ReturnType<typeof vi.fn>
/** console.error 的全部第一参数，用来证明"刷新失败分支真的跑到了"。 */
let errors: string[]

class FakeWebSocket {
  close = vi.fn()
  send = vi.fn()
  readyState = 1
  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  constructor() {
    lastSocket = this
  }
}

beforeEach(() => {
  localStorage.clear()
  setApiShapeErrorReporter(() => {})
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(String(args[0]))
  })
  useWSStore.setState({ reconnectAttempts: 0, reconnecting: false, connected: false, ws: null })
})

afterEach(() => {
  useWSStore.getState().disconnect()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** 登录 A，填上他自备的第三方密钥，然后建立一条 WS 连接。 */
const connectAsAlice = async () => {
  fetchMock.mockResolvedValueOnce(ok(LOGIN))
  await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })
  useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-alice', useCustomApi: true })
  // 正对照：密钥确实落了盘
  expect(localStorage.getItem('api-config-storage')).toContain('sk-alice')
  useWSStore.getState().connect()
}

/**
 * 用 1008（后端判定鉴权失败的关闭码）触发一次带刷新的重连，并**等到刷新失败分支
 * 真的执行过**为止。
 *
 * 这个等待条件不是"等几个微任务"：`scheduleReconnect` 是 async，它的 await 链比
 * 两拍长。等不够的话下面那些 `toBe('sk-alice')` 会在 catch 还没跑之前就通过——
 * 实测过：把这里换成 `await Promise.resolve()` 两次，"改回无差别 clearAuth"的
 * 变异体照样全绿。所以等待条件本身就是这两条用例的正对照。
 */
const closeWithAuthError = async () => {
  lastSocket.onclose?.({ code: 1008, reason: 'auth' })
  await vi.waitFor(() =>
    expect(errors.some((line) => line.includes('[WebSocket] Token 刷新失败'))).toBe(true),
  )
}

describe('wsStore 重连时的刷新失败', () => {
  it('刷新因为断网失败：不销毁用户自备的 aiApiKey', async () => {
    await connectAsAlice()

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await closeWithAuthError()

    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-alice')
    expect(localStorage.getItem('api-config-storage')).toContain('sk-alice')
    // 票据确实清了（会话得重新认证），差分只在"其余东西还在不在"上
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('刷新端点回 401：这才是会话结束，密钥跟着账号一起消失', async () => {
    await connectAsAlice()

    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, error: 'Token 无效' }, 401))
    await closeWithAuthError()

    expect(useApiConfigStore.getState().aiApiKey).toBe('')
    expect(localStorage.getItem('api-config-storage')).toBeNull()
  })
})
