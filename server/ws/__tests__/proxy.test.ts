// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_NAME, getSessionStore, resetSessionStore } from '../../session'
import { resetRefreshInFlight } from '../../session/refresh'
import { closeSessionSockets, registerSessionSocket, resetSessionSocketRegistry, unregisterSessionSocket } from '../registry'
import { resolveWsToken } from '../proxy'

const NOW = 1_000_000

async function makeSession(accessExpiresAt = NOW + 10 * 60_000): Promise<string> {
  const store = await getSessionStore()
  store.create({
    id: 'sess-1', userId: 'alice', accessToken: 'AT-live', refreshToken: 'RT-live',
    accessExpiresAt, user: { user_id: 'alice' }, now: NOW, userAgent: null,
  })
  return 'sess-1'
}

const upgradeReq = (cookie?: string) =>
  new Request('http://app.test/ws', {
    headers: {
      ...(cookie ? { cookie } : {}),
      upgrade: 'websocket', connection: 'Upgrade',
      'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    },
  })

describe('resolveWsToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    process.env.SESSION_DB_PATH = ':memory:'
    process.env.SESSION_COOKIE_SECURE = 'false'
    resetSessionStore()
    resetRefreshInFlight()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('有效会话：拿到 token 与 sessionId', async () => {
    const id = await makeSession()
    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=${id}`))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.token).toBe('AT-live')
      expect(result.sessionId).toBe(id)
    }
  })

  it('没有 cookie：不 ok，给一个 401 响应', async () => {
    const result = await resolveWsToken(upgradeReq())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('会话不存在：不 ok，401', async () => {
    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=nope`))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('临期时先刷新，拿到的是新 token', async () => {
    const id = await makeSession(NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, code: 200, data: { access_token: 'AT-new', expires_in: 900 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))

    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=${id}`))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.token).toBe('AT-new')
  })

  it('刷新时上游 401：不 ok，401，会话已删', async () => {
    const id = await makeSession(NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))

    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=${id}`))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
    expect((await getSessionStore()).get(id)).toBe(null)
  })

  it('刷新时上游 5xx：不 ok，502，会话保留', async () => {
    const id = await makeSession(NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response('{"code":502}', { status: 502 }))

    const result = await resolveWsToken(upgradeReq(`${SESSION_COOKIE_NAME}=${id}`))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(502)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })
})

describe('会话 WS 登记表', () => {
  beforeEach(() => {
    resetSessionSocketRegistry()
  })

  it('登出时关掉该会话名下所有连接，用 code 1000', () => {
    const closed: number[] = []
    const a = { close: (code?: number) => closed.push(code ?? 0) }
    const b = { close: (code?: number) => closed.push(code ?? 0) }

    registerSessionSocket('s1', a)
    registerSessionSocket('s1', b)
    closeSessionSockets('s1')

    expect(closed).toEqual([1000, 1000])
  })

  it('只关目标会话的连接，别人的不动', () => {
    let mineClosed = false
    let othersClosed = false
    registerSessionSocket('s1', { close: () => { mineClosed = true } })
    registerSessionSocket('s2', { close: () => { othersClosed = true } })

    closeSessionSockets('s1')

    expect(mineClosed).toBe(true)
    // 正对照：上一条证明 close 真的会被调用，所以这里的 false 有意义
    expect(othersClosed).toBe(false)
  })

  it('注销之后不再被关（避免关一个已经断开的连接）', () => {
    let closed = false
    const socket = { close: () => { closed = true } }
    registerSessionSocket('s1', socket)
    unregisterSessionSocket('s1', socket)

    closeSessionSockets('s1')

    expect(closed).toBe(false)
  })

  it('close 抛错不影响关同一会话的其余连接', () => {
    let secondClosed = false
    registerSessionSocket('s1', { close: () => { throw new Error('already closed') } })
    registerSessionSocket('s1', { close: () => { secondClosed = true } })

    closeSessionSockets('s1')

    expect(secondClosed).toBe(true)
  })

  it('两份独立求值的 registry 实例共享同一张表（生产里 SSR bundle 与 server/index.ts 各持一份）', async () => {
    vi.resetModules()
    const a = await import('../registry')
    vi.resetModules()
    const b = await import('../registry')
    expect(a).not.toBe(b) // 确实是两份实例，否则这个测试没在测东西
    const closed: number[] = []
    a.registerSessionSocket('s1', { close: (c) => closed.push(c ?? 0) })
    b.closeSessionSockets('s1') // 从另一份实例关
    expect(closed).toEqual([1000])
  })
})
