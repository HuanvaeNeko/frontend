import { describe, expect, it } from 'vitest'
import { BUSINESS_401_ENDPOINTS, isBusiness401Endpoint, isBusiness401Path } from '@/lib/business401'

describe('业务 401 端点表', () => {
  it('改密端点在表里——旧密码错误后端回 401，那不是会话失效', () => {
    expect(BUSINESS_401_ENDPOINTS.has('PUT /api/profile/password')).toBe(true)
  })

  it('isBusiness401Endpoint 认 `METHOD /path` 形态', () => {
    expect(isBusiness401Endpoint('PUT /api/profile/password')).toBe(true)
    expect(isBusiness401Endpoint('GET /api/friends')).toBe(false)
  })

  it('isBusiness401Path 只看 method + pathname，query 不参与', () => {
    expect(isBusiness401Path('put', '/api/profile/password')).toBe(true)
    expect(isBusiness401Path('PUT', '/api/profile/password')).toBe(true)
    expect(isBusiness401Path('POST', '/api/profile/password')).toBe(false)
    expect(isBusiness401Path(undefined, '/api/profile/password')).toBe(false)
  })
})
