import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useWSStore } from '@/store/wsStore'

/**
 * BFF 落地后，`scheduleReconnect` 里「连续失败 3 次就刷 token」那段被删掉了
 * （刷新发生在 BFF 的升级处理里，客户端手里没有 token 可刷，见 `wsStore.ts`
 * 的注释），本文件此前钉的两条刷新失败分支用例随之作废。剩下要钉的是新形状：
 * 连接地址是同源相对路径 `/ws`，且不带 token。
 */

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true })
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
