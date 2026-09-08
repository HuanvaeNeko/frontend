import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { getAuthApiUrl } from '@/lib/apiConfig'
import { authApi } from '../auth'

/**
 * `GET /api/auth/devices` 的信封有后端变更日志明确背书
 * （backend-docs/README.md:374，2026-03-08「统一 API 响应格式」：
 * 从裸 `{"devices":[...],"total":N}` 改为 `{"success":true,"code":200,"data":{...}}`），
 * 所以这个端点**不带 legacyBare**：裸响应必须抛错。
 *
 * 旧实现读的是信封根部的 `data.devices`（恒 undefined），再被
 * `Array.isArray(...) ? ... : []` 变成空数组 —— HTTP 200、无异常、
 * 设备页显示"暂无设备信息"。所以断言必须落在设备条目本身上。
 */

// getAuthApiUrl() 而不是字面量：Vitest 会加载 .env，宿主由本机反代决定，
// 断言必须跟着同一个基址走，不能钉死某个域名（否则一换 .env 就假红）。
const AUTH_BASE = getAuthApiUrl()

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const DEVICE = {
  device_id: 'd1',
  device_info: 'Mac Chrome',
  ip_address: '1.2.3.4',
  last_active_at: '2026-09-01T00:00:00Z',
  created_at: '2026-08-01T00:00:00Z',
  is_current: true,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: 'RT',
    isAuthenticated: true,
    // ⚠️ 必须是远期：fetchWithAuth 开头会 checkTokenExpiry()，
    // token 在 5 分钟内到期就会先发一次 /refresh 请求，
    // 把下面对 fetchMock 调用序号的断言整体错位。
    tokenExpiry: Date.now() + 3600_000,
  })
  setApiShapeErrorReporter(() => {})
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('authApi.getDevices', () => {
  it('从信封里取出真实设备列表和 total', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { devices: [DEVICE], total: 1 } }))

    const result = await authApi.getDevices()

    expect(result.devices).toHaveLength(1)
    expect(result.devices[0].device_id).toBe('d1')
    expect(result.devices[0].is_current).toBe(true)
    expect(result.total).toBe(1)
  })

  it('data 里没有 devices 时抛错，而不是安静地返回空数组', async () => {
    // 旧实现在这里 resolve 成 { devices: [] }，于是"后端换了形状"和
    // "这个账号真的没有登录设备"变成同一种表现，安全功能整块消失且零报错。
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: {} }))

    await expect(authApi.getDevices()).rejects.toThrow(/devices/)
  })

  it('收到未信封化的裸响应也抛错（本端点刻意不给 legacyBare）', async () => {
    fetchMock.mockResolvedValueOnce(ok({ devices: [DEVICE], total: 1 }))

    await expect(authApi.getDevices()).rejects.toThrow(/data/)
  })

  it('HTTP 200 但 success:false 也算失败，并透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 500, message: '设备服务不可用' }))

    await expect(authApi.getDevices()).rejects.toThrow('设备服务不可用')
  })
})

describe('登录 → 受保护请求 的端到端', () => {
  it('登录拿到的 token 会出现在后续请求的 Authorization 头里', async () => {
    // 这条是用户可观测面上的总闸：登录解包一旦错位，accessToken 为 undefined，
    // getAuthHeaders 的 `...(accessToken ? {Authorization} : {})` 直接不带头，
    // 此后每一个受保护请求都是匿名请求。断言必须落在请求头上。
    useAuthStore.getState().clearAuth()
    fetchMock
      .mockResolvedValueOnce(
        ok({ success: true, code: 200, data: { access_token: 'AT9', refresh_token: 'RT9', expires_in: 3600 } }),
      )
      .mockResolvedValueOnce(ok({ success: true, code: 200, data: { devices: [DEVICE], total: 1 } }))

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })
    await authApi.getDevices()

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe(`${AUTH_BASE}/devices`)
    expect(init.headers).toMatchObject({ Authorization: 'Bearer AT9' })
  })
})

describe('authApi.revokeDevice / logout', () => {
  it('撤销成功时正常返回', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: null }))

    await expect(authApi.revokeDevice('d1')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe(`${AUTH_BASE}/devices/d1`)
  })

  it('撤销失败时抛出后端的真实原因', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '权限不足' }, 403))

    await expect(authApi.revokeDevice('d1')).rejects.toThrow('权限不足')
  })

  it('登出只校验成功与否，data 为 null 不算异常', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: null }))

    await expect(authApi.logout()).resolves.toBeUndefined()
  })
})
