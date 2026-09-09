// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_NAME, getSessionStore, resetSessionStore } from '../../../../server/session'
import { resetRefreshInFlight } from '../../../../server/session/refresh'
import { action, loader } from '../api.$'

const NOW = 1_000_000

async function makeSession(overrides?: { accessExpiresAt?: number }): Promise<string> {
  const store = await getSessionStore()
  const id = 'sess-1'
  store.create({
    id, userId: 'alice', accessToken: 'AT-live', refreshToken: 'RT-live',
    accessExpiresAt: overrides?.accessExpiresAt ?? NOW + 10 * 60_000,
    user: { user_id: 'alice' }, now: NOW, userAgent: 'probe',
  })
  return id
}

function authed(url: string, id: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers)
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${id}`)
  return new Request(url, { ...init, headers })
}

const args = (request: Request) => ({ request, params: { '*': new URL(request.url).pathname.slice(5) }, context: {} as never, url: new URL(request.url), pattern: '' })

describe('BFF 鉴权代理 /api/*', () => {
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

  const ok = (body = '{"success":true,"code":200,"data":[]}') =>
    new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })

  it('注入 Bearer 并把 path + query 原样转发', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(ok())

    const res = await loader(args(authed('http://app.test/api/friends?limit=2&q=%E4%B8%AD', id)))

    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/api/friends?limit=2&q=%E4%B8%AD')
    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    expect(headers.get('authorization')).toBe('Bearer AT-live')
    // cookie 绝不能到后端
    expect(headers.get('cookie')).toBe(null)
  })

  it('没有 cookie：401 且不打上游', async () => {
    const res = await loader(args(new Request('http://app.test/api/friends')))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    // 正对照：带上有效 cookie 时确实会打上游（见第一条）
  })

  it('cookie 指向不存在的会话：401 且清 cookie', async () => {
    const res = await loader(args(authed('http://app.test/api/friends', 'nope')))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('上游 401（普通端点）：删会话、清 cookie、原样回 401', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"success":false,"code":401,"error":"未授权访问"}', { status: 401 }))

    const res = await loader(args(authed('http://app.test/api/friends', id)))

    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await getSessionStore()).get(id)).toBe(null)
  })

  it('上游 401（业务 401 端点：改密）：原样透传，会话**不动**', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"success":false,"code":401,"error":"Old password is incorrect"}', { status: 401 }))

    const res = await action(args(authed('http://app.test/api/profile/password', id, {
      method: 'PUT', body: '{"old_password":"x","new_password":"y"}',
    })))

    expect(res.status).toBe(401)
    expect(await res.text()).toContain('Old password is incorrect')
    // 这是本条的要点：打错一次旧密码不能把人踢下线
    expect(res.headers.get('set-cookie')).toBe(null)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })

  it('上游 403：原样透传，会话不动（后端用 403 表示普通权限拒绝）', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"success":false,"code":403,"error":"不是群主/管理员"}', { status: 403 }))

    const res = await action(args(authed('http://app.test/api/groups/g1/avatar', id, { method: 'POST', body: '{}' })))

    expect(res.status).toBe(403)
    expect(await res.text()).toContain('不是群主/管理员')
    expect(res.headers.get('set-cookie')).toBe(null)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })

  it('上游 500：原样透传，会话不动', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"code":500}', { status: 500 }))

    const res = await loader(args(authed('http://app.test/api/friends', id)))

    expect(res.status).toBe(500)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })

  it('临期时先刷新再转发，转发用的是新 token', async () => {
    const id = await makeSession({ accessExpiresAt: NOW + 30_000 })
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, code: 200, data: { access_token: 'AT-new', expires_in: 900 } }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(ok())

    await loader(args(authed('http://app.test/api/friends', id)))

    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/api/auth/refresh')
    expect(fetchMock.mock.calls[1][0]).toBe('http://upstream.test/api/friends')
    expect((fetchMock.mock.calls[1][1] as { headers: Headers }).headers.get('authorization')).toBe('Bearer AT-new')
  })

  it('刷新时上游 401：删会话、401、**不**转发原请求', async () => {
    const id = await makeSession({ accessExpiresAt: NOW + 30_000 })
    fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))

    const res = await loader(args(authed('http://app.test/api/friends', id)))

    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await getSessionStore()).get(id)).toBe(null)
  })

  it('刷新时上游 5xx：502，会话保留，不转发原请求', async () => {
    const id = await makeSession({ accessExpiresAt: NOW + 30_000 })
    fetchMock.mockResolvedValueOnce(new Response('{"code":502}', { status: 502 }))

    const res = await loader(args(authed('http://app.test/api/friends', id)))

    expect(res.status).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await getSessionStore()).get(id)?.accessToken).toBe('AT-live')
  })

  it('/api/auth/refresh 从浏览器来一律 404——刷新是 BFF 的事', async () => {
    const id = await makeSession()
    const res = await action(args(authed('http://app.test/api/auth/refresh', id, { method: 'POST', body: '{}' })))
    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('跨站的非 GET：403 且不打上游', async () => {
    const id = await makeSession()
    const res = await action(args(authed('http://app.test/api/friends', id, {
      method: 'POST', body: '{}', headers: { 'sec-fetch-site': 'cross-site' },
    })))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('**没有**「401 后刷新重试」：上游 401 只发一次请求，不重放', async () => {
    const id = await makeSession()
    fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))

    await action(args(authed('http://app.test/api/profile', id, { method: 'PUT', body: '{"nickname":"x"}' })))

    // 重试 = 重放非幂等请求。P1b 修过的正是这一类 bug（改密请求被重放）
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
