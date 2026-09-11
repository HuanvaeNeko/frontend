import { describe, expect, it } from 'vitest'
import { isValidRedirectUri } from '../redirectUri'

describe('isValidRedirectUri（spec §6.3 / §6.4 同一条规则）', () => {
  it.each(['https://example.com/cb', 'http://localhost:3000/cb', '/apps/my-app/oauth/callback', '/cb?x=1'])('放行：%s', (uri) => {
    expect(isValidRedirectUri(uri)).toBe(true)
  })
  it.each(['', '   ', 'javascript:alert(1)', 'example.com/cb', '//evil.example/cb', 'ftp://x/y', 'data:text/html,x'])('拒绝：%s', (uri) => {
    expect(isValidRedirectUri(uri)).toBe(false)
  })
})
