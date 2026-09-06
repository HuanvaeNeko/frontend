import { describe, it, expect, afterEach } from 'vitest'
import { toAbsoluteApiUrl, getApiBaseUrl, clearApiBaseUrl } from '../apiConfig'

describe('toAbsoluteApiUrl', () => {
  afterEach(() => clearApiBaseUrl())

  it('相对路径补上 API 基址', () => {
    expect(toAbsoluteApiUrl('/api/storage/file/abc')).toBe(`${getApiBaseUrl()}/api/storage/file/abc`)
  })

  it('不带前导斜杠的相对路径也能补', () => {
    expect(toAbsoluteApiUrl('api/storage/file/abc')).toBe(`${getApiBaseUrl()}/api/storage/file/abc`)
  })

  it('绝对地址原样返回（预签名 URL 不能被重新拼接，否则签名失效）', () => {
    const presigned = 'https://minio.example.com/bucket/k?X-Amz-Signature=deadbeef'
    expect(toAbsoluteApiUrl(presigned)).toBe(presigned)
  })

  it('幂等：重复调用不改变结果', () => {
    const once = toAbsoluteApiUrl('/api/storage/file/abc')
    expect(toAbsoluteApiUrl(once)).toBe(once)
  })

  it('data:/blob:/协议相对地址原样返回', () => {
    expect(toAbsoluteApiUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(toAbsoluteApiUrl('blob:https://x/y')).toBe('blob:https://x/y')
    expect(toAbsoluteApiUrl('//cdn.example.com/a.png')).toBe('//cdn.example.com/a.png')
  })

  it('null / undefined / 空串返回 undefined，不产生 "undefined" 字符串 URL', () => {
    expect(toAbsoluteApiUrl(null)).toBeUndefined()
    expect(toAbsoluteApiUrl(undefined)).toBeUndefined()
    expect(toAbsoluteApiUrl('   ')).toBeUndefined()
  })
})
