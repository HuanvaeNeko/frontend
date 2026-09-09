// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_NAME } from '../../../../server/session'
import { action, loader } from '../passthrough.$'

const args = (request: Request) => ({ request, params: {}, context: {} as never, url: new URL(request.url), pattern: '' })

describe('BFF 透传代理', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
    fetchMock = vi.fn().mockResolvedValue(new Response('bytes', { status: 200, headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('原样转发 path 与 query，**头对象上根本没有 authorization 这个键**', async () => {
    const res = await loader(args(new Request('http://app.test/avatars/alice.png?t=1706000000')))

    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/avatars/alice.png?t=1706000000')

    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    // 用 has() 而不是 get() === null：预签名请求带查询串签名，
    // 再带 Authorization 会被 S3 拒绝（403），所以这个键必须**不存在**。
    expect(headers.has('authorization')).toBe(false)
  })

  it('即便请求带着会话 cookie，也不查会话、不注入凭证', async () => {
    await loader(args(new Request('http://app.test/avatars/alice.png', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=sess-1` },
    })))

    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers }).headers
    expect(headers.has('authorization')).toBe(false)
    expect(headers.get('cookie')).toBe(null)
  })

  it('预签名 PUT 的查询串一个字节都不改（X-Amz-Signature 对字节敏感）', async () => {
    const q = '?uploadId=abc&partNumber=1&X-Amz-Signature=deadbeef&X-Amz-Date=20260909T000000Z'
    await action(args(new Request(`http://app.test/user-file/dir%2Fobj${q}`, { method: 'PUT', body: 'chunk', duplex: 'half' } as RequestInit)))

    expect(fetchMock.mock.calls[0][0]).toBe(`http://upstream.test/user-file/dir%2Fobj${q}`)
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT')
  })

  it('上游状态码与 content-type 原样回传', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<Error/>', { status: 404, headers: { 'content-type': 'application/xml' } }))
    const res = await loader(args(new Request('http://app.test/avatars/missing.png')))
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('application/xml')
  })
})
