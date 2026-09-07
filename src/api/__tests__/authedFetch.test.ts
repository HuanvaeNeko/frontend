import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl, getAuthApiUrl } from '@/lib/apiConfig'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { fetchWithAuth } from '../authedFetch'

/**
 * 这个文件守的是**九份逐字副本合并成一份**之后的等价性。
 *
 * 合并的风险不在「能不能编译」，而在于一次手滑就会把两类语义混成一类：
 *
 * 1. **401 与 403 的分界**。本后端用 403 表达普通权限不足（「权限不足」「不是本群
 *    活跃成员」），用 401 表达 token 失效。曾经有一版把两者一起当认证失败处理，
 *    结果「打开一个没权限的文件」变成了无提示登出（见 `apiClient.test.ts` 对
 *    `isAuthError` 的同类守卫）。这里守的是另一条路径：`fetchWithAuth` 自己的
 *    状态码分支。403 必须**原样返回**，不刷新、不清登录态。
 *
 * 2. **刷新必须走 `authStore.refreshAccessToken()` 这一个漏斗**。单飞锁在 store 的
 *    模块级（`refreshInFlight`），只有所有调用者都汇进去才对所有人生效；谁要是
 *    自己去 POST /api/auth/refresh，并发刷新就会互相作废 token 并级联登出。
 *
 * 断言一律落在**可观测的真实行为**上——发出去了几个请求、打到哪个 URL、
 * 带的是哪一个 token、store 里还剩什么——而不是「某个 mock 被调用了几次」。
 */

const API_BASE = getApiBaseUrl()
const AUTH_BASE = getAuthApiUrl()
const RESOURCE = `${API_BASE}/api/groups`

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** 刷新成功的信封；`readEnvelope` 要求三个字段齐全，缺一个就抛错并 clearAuth。 */
const refreshed = (accessToken: string, refreshToken = 'RT2') =>
  ok({
    success: true,
    code: 200,
    data: { access_token: accessToken, refresh_token: refreshToken, expires_in: 3600 },
  })

/** 从 fetchMock 的某一次调用里取出 Authorization 头，取不到返回 undefined。 */
const authHeaderOf = (call: unknown[]): string | undefined => {
  const init = call[1] as RequestInit | undefined
  const headers = init?.headers as Record<string, string> | undefined
  return headers?.Authorization
}

const urlsOf = (mock: ReturnType<typeof vi.fn>): string[] =>
  mock.mock.calls.map(call => String(call[0]))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  // zustand persist 往 localStorage 写 auth-storage；getApiBaseUrl() 也读 localStorage。
  // 不清会串味。clearAuth() 同时把 authStore 的 lastRotatedAt 归零，
  // 否则上一条用例刚轮换过，这条的刷新会落进 10 秒跳过窗口而不真的发请求。
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({
    accessToken: 'AT1',
    refreshToken: 'RT1',
    isAuthenticated: true,
    // 远期过期：否则每条用例都会先打一次 /refresh，把调用下标整体错开。
    // 需要临期行为的用例自己覆盖它。
    tokenExpiry: Date.now() + 3600_000,
  })
  setApiShapeErrorReporter(() => {})
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchWithAuth —— 403 不是认证失败', () => {
  it('403 原样返回：不刷新、不清登录态、不跳登录页', async () => {
    // 后端文档：文件访问 / 群成员操作的 403 文案恒为「权限不足」一类，
    // 表达的是「这个账号没这个权限」，不是「这个 token 不好使」。
    // 若把分支写成 `>= 401` 或复用带 403 的判定，这条会看见第二个请求（刷新）
    // 或者 accessToken 被清空。
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '权限不足' }, 403))

    const response = await fetchWithAuth(RESOURCE)

    expect(response.status).toBe(403)
    expect(urlsOf(fetchMock)).toEqual([RESOURCE])
    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('AT1')
    expect(state.isAuthenticated).toBe(true)
  })

  it('403 的响应体照常可读 —— 调用方要拿到「权限不足」原文', async () => {
    // 若 403 被当成认证失败抛掉，调用方拿不到 body，UI 只能显示一句泛泛的失败。
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '不是本群活跃成员' }, 403))

    const response = await fetchWithAuth(RESOURCE)
    const body = await response.json()

    expect(body.error).toBe('不是本群活跃成员')
  })

  it('500 同样原样返回，不触发刷新', async () => {
    fetchMock.mockResolvedValueOnce(ok({ error: '服务器开小差' }, 500))

    const response = await fetchWithAuth(RESOURCE)

    expect(response.status).toBe(500)
    expect(urlsOf(fetchMock)).toEqual([RESOURCE])
  })
})

describe('fetchWithAuth —— 401 刷新并重试一次', () => {
  it('401 后刷新，并用**新** token 重试原请求', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ error: 'token 已过期' }, 401))
      .mockResolvedValueOnce(refreshed('AT2'))
      .mockResolvedValueOnce(ok({ success: true, code: 200, data: [] }))

    const response = await fetchWithAuth(RESOURCE)

    expect(response.status).toBe(200)
    expect(urlsOf(fetchMock)).toEqual([RESOURCE, `${AUTH_BASE}/refresh`, RESOURCE])
    // 首次带旧 token，重试带新 token：证明重试前重新取了一次头，
    // 而不是把第一次算好的 headers 原样再发一遍。
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe('Bearer AT1')
    expect(authHeaderOf(fetchMock.mock.calls[2])).toBe('Bearer AT2')
  })

  it('重试后仍是 401 时，把这个 401 交回调用方，而不是抛错或再刷一次', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(refreshed('AT2'))
      .mockResolvedValueOnce(ok({ error: 'unauthorized' }, 401))

    const response = await fetchWithAuth(RESOURCE)

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('没有 refreshToken 时 401 直接返回，一次刷新都不发', async () => {
    useAuthStore.setState({ refreshToken: null })
    fetchMock.mockResolvedValueOnce(ok({ error: 'unauthorized' }, 401))

    const response = await fetchWithAuth(RESOURCE)

    expect(response.status).toBe(401)
    expect(urlsOf(fetchMock)).toEqual([RESOURCE])
  })

  it('刷新抛错时清登录态、跳登录页，并把错误继续上抛', async () => {
    const location = { href: '', pathname: '/chat' }
    Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true })

    fetchMock
      .mockResolvedValueOnce(ok({ error: 'unauthorized' }, 401))
      // 信封缺 refresh_token → readEnvelope 抛错 → authStore 清登录态后继续抛
      .mockResolvedValueOnce(ok({ success: true, code: 200, data: { access_token: 'AT2' } }))

    await expect(fetchWithAuth(RESOURCE)).rejects.toThrow()

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(location.href).toBe(ROUTES.auth.login)
  })
})

describe('fetchWithAuth —— 临期预刷新', () => {
  it('token 临期时先刷新，再用新 token 发原请求', async () => {
    // checkTokenExpiry() 的阈值是 5 分钟。
    useAuthStore.setState({ tokenExpiry: Date.now() + 60_000 })
    fetchMock
      .mockResolvedValueOnce(refreshed('AT2'))
      .mockResolvedValueOnce(ok({ success: true, code: 200, data: [] }))

    const response = await fetchWithAuth(RESOURCE)

    expect(response.status).toBe(200)
    expect(urlsOf(fetchMock)).toEqual([`${AUTH_BASE}/refresh`, RESOURCE])
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe('Bearer AT2')
  })

  it('预刷新失败不阻断请求：原请求仍以无 token 的形式发出去', async () => {
    // 这是九份副本里 `catch { console.error }` 的语义：预刷新是尽力而为，
    // 失败了也要把请求发出去，让后端用 401 来裁决。
    // authStore 的刷新失败路径会 clearAuth()，所以请求发出时已经不带 Authorization。
    useAuthStore.setState({ tokenExpiry: Date.now() + 60_000 })
    fetchMock
      .mockResolvedValueOnce(ok({ success: true, code: 200, data: { access_token: 'AT2' } }))
      .mockResolvedValueOnce(ok({ success: true, code: 200, data: [] }))

    const response = await fetchWithAuth(RESOURCE)

    expect(response.status).toBe(200)
    expect(urlsOf(fetchMock)).toEqual([`${AUTH_BASE}/refresh`, RESOURCE])
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBeUndefined()
  })

  it('预刷新失败后若原请求也 401，会再刷一次并因无 token 而登出上抛', async () => {
    // 这条记录的是一个**反直觉但真实**的既有行为，合并前后逐字一致：
    // `authStore` 是函数开头 `getState()` 取的快照，预刷新失败时 authStore 内部
    // 已经 clearAuth()，但快照里的 `refreshToken` 仍是旧值（'RT1'）。
    // 于是 401 分支的 `&& authStore.refreshToken` 判真，第二次刷新照样发起，
    // 这次在 authStore 内部读到真实的 `refreshToken: null` 而抛
    // 'No refresh token available' —— 走 clearAuth + 跳登录页 + 继续上抛。
    // 若把快照换成每次实时 `getState()`，这里就会变成静默返回 401：那是行为变更。
    const location = { href: '', pathname: '/chat' }
    Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true })
    useAuthStore.setState({ tokenExpiry: Date.now() + 60_000 })
    fetchMock
      .mockResolvedValueOnce(ok({ success: true, code: 200, data: { access_token: 'AT2' } }))
      .mockResolvedValueOnce(ok({ error: 'unauthorized' }, 401))

    await expect(fetchWithAuth(RESOURCE)).rejects.toThrow('No refresh token available')

    expect(urlsOf(fetchMock)).toEqual([`${AUTH_BASE}/refresh`, RESOURCE])
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(location.href).toBe(ROUTES.auth.login)
  })
})

describe('fetchWithAuth —— 刷新汇进 authStore 的单飞漏斗', () => {
  it('三个并发请求同时 401，只发出一个 /refresh', async () => {
    // 单飞锁在 authStore 模块级。这条守的是「合并后的客户端仍然调
    // authStore.refreshAccessToken()」——若它改成自己 POST /api/auth/refresh，
    // 这里会看到三个刷新请求，线上表现就是并发刷新互相作废 token 后级联登出。
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `${AUTH_BASE}/refresh`) return refreshed('AT2')
      const seen = fetchMock.mock.calls.filter(call => String(call[0]) === RESOURCE).length
      return seen <= 3 ? ok({ error: 'unauthorized' }, 401) : ok({ success: true, code: 200, data: [] })
    })

    const responses = await Promise.all([
      fetchWithAuth(RESOURCE),
      fetchWithAuth(RESOURCE),
      fetchWithAuth(RESOURCE),
    ])

    const refreshCalls = urlsOf(fetchMock).filter(url => url === `${AUTH_BASE}/refresh`)
    expect(refreshCalls).toHaveLength(1)
    expect(responses.every(response => response.status === 200)).toBe(true)
  })
})

describe('fetchWithAuth —— 请求构造', () => {
  it('调用方的 headers 覆盖默认头，method/body 原样透传', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: {} }))

    await fetchWithAuth(RESOURCE, {
      method: 'POST',
      body: '{"name":"x"}',
      headers: { 'Content-Type': 'application/octet-stream' },
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"x"}')
    expect(headers['Content-Type']).toBe('application/octet-stream')
    expect(headers.Authorization).toBe('Bearer AT1')
  })

  it('未登录时不带 Authorization 头，也不尝试刷新', async () => {
    useAuthStore.getState().clearAuth()
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: {} }))

    await fetchWithAuth(RESOURCE)

    expect(urlsOf(fetchMock)).toEqual([RESOURCE])
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBeUndefined()
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })
})
