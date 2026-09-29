// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_NAME, getSessionStore, resetSessionStore } from '../../../../server/session'
import { resetRefreshInFlight } from '../../../../server/session/refresh'
import { action as apiAction } from '../api.$'
import { action } from '../api.webrtc.join'

/**
 * 视频会议「加入房间」是后端唯一一个**无需登录**的业务端点（backend-docs webrtc/WebRTC房间.md:139）。
 * 通用的 `api/*` 一律要会话：访客拿着会议链接进来，join 先被 BFF 以 401 挡掉——
 * 会议面板上那句「无需登录即可加入」在网页端从来不成立。
 */
const NOW = 1_000_000
const JOIN_URL = 'http://app.test/api/webrtc/rooms/R8K2QF/join'
const BODY = JSON.stringify({ password: '246810', display_name: '路人甲' })

const joinRequest = (headers: Record<string, string> = {}) =>
  new Request(JOIN_URL, { method: 'POST', body: BODY, headers: { 'content-type': 'application/json', ...headers } })
const args = (request: Request) => ({ request, params: { roomId: 'R8K2QF' }, context: {} as never, url: new URL(request.url), pattern: '' })
const upstreamOk = () =>
  new Response(JSON.stringify({ success: true, code: 200, data: { participant_id: 'p1', ws_token: 'WS-1' } }), { status: 200, headers: { 'content-type': 'application/json' } })

describe('BFF /api/webrtc/rooms/:roomId/join', () => {
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

  it('正对照：同一个请求落进通用的 api/*，没有会话就是 401、根本到不了上游——访客原来卡在这里', async () => {
    const res = await apiAction({ ...args(joinRequest()), params: { '*': 'webrtc/rooms/R8K2QF/join' } })
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('没有会话（访客）：不带鉴权原样转发，上游响应原样回给浏览器', async () => {
    fetchMock.mockResolvedValueOnce(upstreamOk())

    const res = await action(args(joinRequest()))

    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/api/webrtc/rooms/R8K2QF/join')
    expect((fetchMock.mock.calls[0][1] as { headers: Headers }).headers.get('authorization')).toBeNull()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ data: { ws_token: 'WS-1' } })
  })

  it('有会话：照常带 Bearer（后端据此把参会者记成已登录用户）', async () => {
    const store = await getSessionStore()
    store.create({ id: 'sess-1', userId: 'alice', accessToken: 'AT-live', refreshToken: 'RT-live', accessExpiresAt: NOW + 10 * 60_000, user: { user_id: 'alice' }, now: NOW, userAgent: 'probe' })
    fetchMock.mockResolvedValueOnce(upstreamOk())

    await action(args(joinRequest({ cookie: `${SESSION_COOKIE_NAME}=sess-1` })))

    expect((fetchMock.mock.calls[0][1] as { headers: Headers }).headers.get('authorization')).toBe('Bearer AT-live')
  })

  it('会话 cookie 已失效：当访客转发，不回 401（加入房间本来就不需要登录）', async () => {
    fetchMock.mockResolvedValueOnce(upstreamOk())

    const res = await action(args(joinRequest({ cookie: `${SESSION_COOKIE_NAME}=gone` })))

    expect(res.status).toBe(200)
    expect((fetchMock.mock.calls[0][1] as { headers: Headers }).headers.get('authorization')).toBeNull()
  })

  it('跨站写入照样拒绝（与 api/* 同一道闸）', async () => {
    const res = await action(args(joinRequest({ 'sec-fetch-site': 'cross-site' })))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
