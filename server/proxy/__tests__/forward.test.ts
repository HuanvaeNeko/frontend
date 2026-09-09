// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDownstreamHeaders, buildUpstreamHeaders, forwardToUpstream, isCrossSiteWrite } from '../forward'

describe('buildUpstreamHeaders', () => {
  it('剥掉 hop-by-hop 头与 cookie / host', () => {
    const req = new Request('http://app.test/api/x', {
      headers: {
        cookie: 'hv_session=secret',
        host: 'app.test',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        'transfer-encoding': 'chunked',
        upgrade: 'h2c',
        te: 'trailers',
        trailer: 'X',
        'proxy-authorization': 'Basic xxx',
        'user-agent': 'probe/1.0',
        accept: 'application/json',
      },
    })

    const headers = buildUpstreamHeaders(req)

    // cookie 绝不能转发给后端：它只对 BFF 有意义，且里面是会话钥匙
    expect(headers.get('cookie')).toBe(null)
    expect(headers.get('host')).toBe(null)
    for (const h of ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authorization']) {
      expect(headers.get(h)).toBe(null)
    }
    // 正对照：不该剥的确实留着
    expect(headers.get('user-agent')).toBe('probe/1.0')
    expect(headers.get('accept')).toBe('application/json')
  })

  it('extra 里的头会被加上', () => {
    const headers = buildUpstreamHeaders(new Request('http://app.test/'), { Authorization: 'Bearer AT' })
    expect(headers.get('authorization')).toBe('Bearer AT')
  })

  it('请求自带的 authorization 被剥掉——凭证只能由 BFF 注入', () => {
    const req = new Request('http://app.test/', { headers: { authorization: 'Bearer forged-by-user' } })
    expect(buildUpstreamHeaders(req).get('authorization')).toBe(null)
  })
})

describe('buildDownstreamHeaders', () => {
  it('剥掉上游的 hop-by-hop 与 set-cookie', () => {
    const res = new Response('x', {
      headers: {
        'content-type': 'application/json',
        connection: 'close',
        'transfer-encoding': 'chunked',
        'set-cookie': 'upstream=1',
      },
    })
    const headers = buildDownstreamHeaders(res)
    expect(headers.get('connection')).toBe(null)
    expect(headers.get('transfer-encoding')).toBe(null)
    // 上游的 set-cookie 不能透给浏览器：会话由 BFF 全权管理
    expect(headers.get('set-cookie')).toBe(null)
    expect(headers.get('content-type')).toBe('application/json')
  })
})

describe('isCrossSiteWrite', () => {
  it('跨站的非 GET 判真', () => {
    const req = new Request('http://app.test/api/x', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } })
    expect(isCrossSiteWrite(req)).toBe(true)
  })

  it('跨站的 GET 判假（读不构成 CSRF）', () => {
    const req = new Request('http://app.test/api/x', { headers: { 'sec-fetch-site': 'cross-site' } })
    expect(isCrossSiteWrite(req)).toBe(false)
  })

  it('同源的 POST 判假', () => {
    const req = new Request('http://app.test/api/x', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } })
    expect(isCrossSiteWrite(req)).toBe(false)
  })

  it('没有 Sec-Fetch-Site 头时判假（老浏览器与服务端调用不该被拦）', () => {
    const req = new Request('http://app.test/api/x', { method: 'POST' })
    expect(isCrossSiteWrite(req)).toBe(false)
  })
})

describe('forwardToUpstream', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('URL 由上游基址 + 原样 path/query 拼成', async () => {
    await forwardToUpstream(new Request('http://app.test/api/friends?limit=2'), { pathWithQuery: '/api/friends?limit=2' })
    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/api/friends?limit=2')
  })

  it('带 body 的请求用 duplex: half 流式转发，不先读进内存', async () => {
    const req = new Request('http://app.test/api/x', { method: 'POST', body: 'payload', duplex: 'half' } as RequestInit)
    await forwardToUpstream(req, { pathWithQuery: '/api/x' })

    const init = fetchMock.mock.calls[0][1] as RequestInit & { duplex?: string }
    expect(init.method).toBe('POST')
    expect(init.duplex).toBe('half')
    // body 是原始流，不是被 await text() 读出来的字符串
    expect(typeof init.body).not.toBe('string')
  })

  it('GET / HEAD 不带 body（带了 fetch 会抛）', async () => {
    await forwardToUpstream(new Request('http://app.test/api/x'), { pathWithQuery: '/api/x' })
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(null)
  })

  it('authorization 传入时注入', async () => {
    await forwardToUpstream(new Request('http://app.test/api/x'), { pathWithQuery: '/api/x', authorization: 'Bearer AT' })
    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    expect(headers.get('authorization')).toBe('Bearer AT')
  })

  it('不传 authorization 时头对象上根本没有这个键（透传分支的硬约束）', async () => {
    await forwardToUpstream(new Request('http://app.test/avatars/a.png'), { pathWithQuery: '/avatars/a.png' })
    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    // 断言 has()，不是 get() === null：预签名请求带查询串签名，
    // 再带 Authorization 会被 S3 拒绝，所以这个键必须**不存在**
    expect(headers.has('authorization')).toBe(false)
  })
})
