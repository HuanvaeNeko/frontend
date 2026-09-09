// @vitest-environment node
//
// 全局配置（vitest.config.ts）用的是 happy-dom：它按 fetch 规范的
// forbidden-request-header-name 名单模拟浏览器行为，`new Request(url, { headers:
// { cookie: … } })` 会把 cookie 这个键静默丢掉（Set/Host 等同理），
// `request.headers.get('cookie')` 永远拿 null——这与 readSessionId 的实现无关，
// 任何实现都读不到一个已经被构造函数吞掉的头。生产跑在 Bun 原生 Request 上，
// 不做这层浏览器限制，行为正常；本文件用 node 环境让全局 Request 走运行时原生
// 实现（这里是 Bun），而不是 happy-dom 的 polyfill。
import { describe, expect, it } from 'vitest'
import { SESSION_COOKIE_NAME, clearSessionCookie, readSessionId, serializeSessionCookie } from '../cookie'

describe('会话 cookie', () => {
  it('序列化带上 HttpOnly / Path / SameSite / Max-Age', () => {
    const v = serializeSessionCookie('abc', { secure: false })
    expect(v.startsWith(`${SESSION_COOKIE_NAME}=abc;`)).toBe(true)
    expect(v).toContain('HttpOnly')
    expect(v).toContain('Path=/')
    expect(v).toContain('SameSite=Lax')
    expect(v).toContain('Max-Age=2592000')
  })

  it('secure 为真时带 Secure，为假时不带（本地 http 下带了浏览器会整条丢弃）', () => {
    expect(serializeSessionCookie('abc', { secure: true })).toContain('Secure')
    expect(serializeSessionCookie('abc', { secure: false })).not.toContain('Secure')
  })

  it('清除用 Max-Age=0 且值为空', () => {
    const v = clearSessionCookie({ secure: false })
    expect(v).toContain(`${SESSION_COOKIE_NAME}=;`)
    expect(v).toContain('Max-Age=0')
  })

  it('从请求头里读出 id，和别的 cookie 混在一起也能读对', () => {
    const req = new Request('http://x/', { headers: { cookie: `theme=dark; ${SESSION_COOKIE_NAME}=xyz; other=1` } })
    expect(readSessionId(req)).toBe('xyz')
  })

  it('没有 cookie 头、或没有这一项时返回 null', () => {
    expect(readSessionId(new Request('http://x/'))).toBe(null)
    expect(readSessionId(new Request('http://x/', { headers: { cookie: 'theme=dark' } }))).toBe(null)
  })

  it('不会把 hv_session_other 这种前缀相同的项误读成会话 id', () => {
    const req = new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE_NAME}_other=nope` } })
    expect(readSessionId(req)).toBe(null)
  })
})
