// @vitest-environment node
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('浏览器带来的来源头全部剥掉——上游拿不到可伪造的 XFF', () => {
    const req = new Request('http://app.test/api/x', {
      headers: {
        'x-forwarded-for': '203.0.113.9',
        'x-forwarded-host': 'evil.test',
        'x-forwarded-proto': 'https',
        'x-forwarded-port': '443',
        'x-real-ip': '203.0.113.9',
        forwarded: 'for=203.0.113.9;host=evil.test',
        via: '1.1 evil',
        'user-agent': 'probe/1.0',
      },
    })

    const headers = buildUpstreamHeaders(req)

    for (const h of ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'forwarded', 'via']) {
      expect(headers.has(h)).toBe(false)
    }
    // 正对照：不该剥的确实留着
    expect(headers.get('user-agent')).toBe('probe/1.0')
  })
})

describe('buildDownstreamHeaders', () => {
  it('剥掉上游的 hop-by-hop、set-cookie（含多值）与 content-encoding/content-length', () => {
    const resHeaders = new Headers({
      'content-type': 'application/json',
      connection: 'close',
      'transfer-encoding': 'chunked',
      'set-cookie': 'a=1',
      'content-encoding': 'gzip',
      'content-length': '36',
    })
    // set-cookie 是 Headers 的规范特例：append 后逐条 yield，真实上游多为多条
    resHeaders.append('set-cookie', 'b=2')
    const res = new Response('x', { headers: resHeaders })

    const headers = buildDownstreamHeaders(res)
    expect(headers.get('connection')).toBe(null)
    expect(headers.get('transfer-encoding')).toBe(null)
    // 上游的 set-cookie 不能透给浏览器：会话由 BFF 全权管理
    expect(headers.has('set-cookie')).toBe(false)
    // fetch 已经把 body 解压了：留着这两个头会让浏览器再解一次，且长度与实际 body 不符
    expect(headers.has('content-encoding')).toBe(false)
    expect(headers.has('content-length')).toBe(false)
    // 正对照：不该剥的确实留着
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
    // ..挡住 new URL() 重新解析（会吃掉路径段），%2F/%2B 挡住 encodeURI（会二次编码），
    // + 挡住 URLSearchParams 往返（会变成空格）；预签名的签名对字节敏感，任何一种
    // 看似无害的规范化都会让签名失效，所以这条路径在这三种改法下都不是不动点。
    const p = '/user-file/dir/../a%2Fb.png?X-Amz-Signature=abc%2Bdef%3D&x=a+b'
    await forwardToUpstream(new Request(`http://app.test${p}`), { pathWithQuery: p })
    expect(fetchMock.mock.calls[0][0]).toBe(`http://upstream.test${p}`)
  })

  it('带 body 的请求用 duplex: half 流式转发，不先读进内存', async () => {
    const req = new Request('http://app.test/api/x', { method: 'POST', body: 'payload', duplex: 'half' } as RequestInit)
    await forwardToUpstream(req, { pathWithQuery: '/api/x' })

    const init = fetchMock.mock.calls[0][1] as RequestInit & { duplex?: string }
    expect(init.method).toBe('POST')
    expect(init.duplex).toBe('half')
    // body 必须是原始 ReadableStream。只排除 string 挡不住 arrayBuffer()/Uint8Array
    // 这类同样把整个请求体读进内存的缓冲形态——它们都是 typeof !== 'string'。
    expect(init.body).toBeInstanceOf(ReadableStream)
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

  it('redirect: manual——BFF 不替浏览器追随上游 3xx', async () => {
    await forwardToUpstream(new Request('http://app.test/api/x'), { pathWithQuery: '/api/x' })
    // 跟随重定向会丢掉 302 的 Location（预签名下载靠它），还会把 BFF 变成一个会追链接的出网客户端
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe('manual')
  })
})

describe('forwardToUpstream 过真实上游（node:http，不 stub fetch）', () => {
  // 足够长才能让 gzip 真的把它压小，压出来的 content-length 才是"明显撒谎"的长度
  const PLAINTEXT = 'x'.repeat(2000)

  let server: ReturnType<typeof createServer>
  let port: number
  let originalUpstream: string | undefined

  beforeAll(async () => {
    const gz = gzipSync(PLAINTEXT)
    server = createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'text/plain',
        'content-encoding': 'gzip',
        'content-length': String(gz.length),
      })
      res.end(gz)
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0

    originalUpstream = process.env.BFF_UPSTREAM_HTTP
    process.env.BFF_UPSTREAM_HTTP = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    if (originalUpstream === undefined) delete process.env.BFF_UPSTREAM_HTTP
    else process.env.BFF_UPSTREAM_HTTP = originalUpstream
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('content-encoding/content-length 被剥掉，body 是解压后的明文——C1 要修的属性', async () => {
    const res = await forwardToUpstream(new Request('http://app.test/api/x'), { pathWithQuery: '/api/x' })

    expect(res.headers.has('content-encoding')).toBe(false)
    expect(res.headers.has('content-length')).toBe(false)
    // 正对照：没被剥离清单误伤
    expect(res.headers.get('content-type')).toBe('text/plain')
    // Node 的全局 fetch 已经透明解压 gzip：头剥掉之后消费者读到的是明文；
    // 头留着的话，真实浏览器会在这一步用声称的 content-encoding 再解一次而失败
    expect(await res.text()).toBe(PLAINTEXT)
  })
})
