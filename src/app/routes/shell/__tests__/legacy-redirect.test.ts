import { describe, expect, it } from 'vitest'
import { loader } from '../legacy-redirect'

const args = (path: string) => {
  const request = new Request(`http://localhost${path}`)
  return { request, params: {}, context: {} as never, url: new URL(request.url), pattern: '' }
}

describe('旧 URL 重定向 loader（spec §3 的表，逐条字面量）', () => {
  it.each([
    ['/app/friends', '/app/contacts'],
    ['/app/groups', '/app/contacts'],
    ['/app/webrtc', '/app/meeting'],
    ['/app/devices', '/app/settings/account'],
    ['/app/group-chat', '/app/chat'],
    ['/app/friends/anything', '/app/contacts'],
  ])('%s → 302 %s', (from, to) => {
    const res = loader(args(from))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(to)
  })

  it('不在表里的路径不重定向（抛 404），证明上面不是"什么都 302"', () => {
    expect(() => loader(args('/app/chat'))).toThrow()
    try { loader(args('/app/nope')) } catch (e) { expect((e as Response).status).toBe(404) }
  })
})
