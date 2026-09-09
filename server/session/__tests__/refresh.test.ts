import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db'
import { SessionDead, UpstreamUnavailable, ensureFreshAccessToken, resetRefreshInFlight } from '../refresh'
import { createSessionStore, type SessionStore } from '../store'

const NOW = 1_000_000

function seed(store: SessionStore, expiresAt: number) {
  return store.create({
    id: 's1', userId: 'alice', accessToken: 'AT-old', refreshToken: 'RT-old',
    accessExpiresAt: expiresAt, user: { user_id: 'alice' }, now: NOW, userAgent: null,
  })
}

const okRefresh = (access: string, refresh?: string) =>
  new Response(
    JSON.stringify({ success: true, code: 200, data: { access_token: access, token_type: 'Bearer', expires_in: 900, ...(refresh ? { refresh_token: refresh } : {}) } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

describe('ensureFreshAccessToken', () => {
  let store: SessionStore
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    store = createSessionStore(await openDatabase(':memory:'))
    resetRefreshInFlight()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('距过期还很远时一个请求都不发，直接返回现有 token', async () => {
    const s = seed(store, NOW + 10 * 60_000)
    const token = await ensureFreshAccessToken(store, s)
    expect(token).toBe('AT-old')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('距过期不足 60 秒时刷新，新 token 写进库', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(okRefresh('AT-new', 'RT-new'))

    const token = await ensureFreshAccessToken(store, s)

    // 正对照：上一条证明「远离过期时确实不发」，这条证明「临期时确实发了」
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(token).toBe('AT-new')
    expect(store.get('s1')?.refreshToken).toBe('RT-new')
    expect(store.get('s1')?.accessExpiresAt).toBe(NOW + 900_000)
  })

  it('上游不回 refresh_token 时沿用旧的（2026-09-09 线上实测形状）', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(okRefresh('AT-new'))

    await ensureFreshAccessToken(store, s)

    expect(store.get('s1')?.accessToken).toBe('AT-new')
    expect(store.get('s1')?.refreshToken).toBe('RT-old')
  })

  it('并发调用只打一次上游（进程内单飞）', async () => {
    const s = seed(store, NOW + 30_000)
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    fetchMock.mockImplementation(() => gate.then(() => okRefresh('AT-new', 'RT-new')))

    const all = Promise.all([1, 2, 3, 4, 5].map(() => ensureFreshAccessToken(store, s)))
    release()
    const tokens = await all

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tokens).toEqual(['AT-new', 'AT-new', 'AT-new', 'AT-new', 'AT-new'])
  })

  it('CAS 输掉时用赢家的 token，不覆盖它', async () => {
    const s = seed(store, NOW + 30_000)
    // 模拟「别人先刷完了」：上游返回之前，库里已经被改成另一对
    fetchMock.mockImplementation(async () => {
      store.updateTokens('s1', NOW + 30_000, { accessToken: 'AT-winner', refreshToken: 'RT-winner', accessExpiresAt: NOW + 900_000, now: NOW })
      return okRefresh('AT-loser', 'RT-loser')
    })

    const token = await ensureFreshAccessToken(store, s)

    expect(token).toBe('AT-winner')
    expect(store.get('s1')?.accessToken).toBe('AT-winner')
  })

  it('上游 401：删会话并抛 SessionDead', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: 401, error: 'Token 无效或已过期' }), { status: 401 }))

    await expect(ensureFreshAccessToken(store, s)).rejects.toBeInstanceOf(SessionDead)
    expect(store.get('s1')).toBe(null)
  })

  it('上游 502：抛 UpstreamUnavailable，会话保留（传输失败 ≠ 会话结束）', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response('{"code":502}', { status: 502 }))

    await expect(ensureFreshAccessToken(store, s)).rejects.toBeInstanceOf(UpstreamUnavailable)
    expect(store.get('s1')?.accessToken).toBe('AT-old')
  })

  it('网络失败：抛 UpstreamUnavailable，会话保留', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    await expect(ensureFreshAccessToken(store, s)).rejects.toBeInstanceOf(UpstreamUnavailable)
    expect(store.get('s1')?.accessToken).toBe('AT-old')
  })

  it('响应形状坏（缺 expires_in）：抛 UpstreamUnavailable，不当成会话结束', async () => {
    const s = seed(store, NOW + 30_000)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, code: 200, data: { access_token: 'AT-new' } }), { status: 200 }))

    await expect(ensureFreshAccessToken(store, s)).rejects.toBeInstanceOf(UpstreamUnavailable)
    expect(store.get('s1')?.accessToken).toBe('AT-old')
  })
})
