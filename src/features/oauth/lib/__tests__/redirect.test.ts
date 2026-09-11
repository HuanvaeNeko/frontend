import { describe, expect, it } from 'vitest'
import { appendQuery } from '../redirect'

describe('appendQuery', () => {
  it('绝对地址：追加 code/state，保留原有 query', () => {
    expect(appendQuery('https://example.com/cb?x=1', { code: 'abc', state: 's 1' })).toBe('https://example.com/cb?x=1&code=abc&state=s+1')
  })
  it('null / undefined 的参数不写', () => {
    expect(appendQuery('https://example.com/cb', { code: 'abc', state: null })).toBe('https://example.com/cb?code=abc')
  })
  it('站内相对路径落成同源绝对地址', () => {
    expect(appendQuery('/apps/x/cb', { error: 'access_denied' })).toBe(`${location.origin}/apps/x/cb?error=access_denied`)
  })
})
