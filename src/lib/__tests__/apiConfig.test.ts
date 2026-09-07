import { describe, it, expect, afterEach } from 'vitest'
import { toAbsoluteApiUrl, getApiBaseUrl, setApiBaseUrl, clearApiBaseUrl } from '../apiConfig'

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

/**
 * 后端把预签名 URL / part_url / file_url 以 `https://api.huanvae.cn/...` 的绝对地址返回。
 * 当基址被指到别处（本地去 SNI 反代 `http://127.0.0.1:8787`，见 ~/.config/huanvae-edge），
 * 浏览器直接请求正式域名会被拦截，所以要把 origin 换成当前基址；path / query / hash 必须
 * 逐字保留——SigV4 签名覆盖的是 Host 与路径参数，反代转发时显式带 `Host: api.huanvae.cn`，
 * 只换 origin 不会让签名失效。
 */
describe('toAbsoluteApiUrl：后端正式域名的绝对地址改写到当前基址', () => {
  const PROXY = 'http://127.0.0.1:8787'
  const PRESIGNED =
    'https://api.huanvae.cn/user-file/conv-a-b/images/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=k%2F20260907%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=deadbeef'

  afterEach(() => clearApiBaseUrl())

  it('基址是反代时，api.huanvae.cn 的预签名 URL 只换 origin，路径与签名参数逐字保留', () => {
    setApiBaseUrl(PROXY)
    expect(toAbsoluteApiUrl(PRESIGNED)).toBe(
      `${PROXY}/user-file/conv-a-b/images/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=k%2F20260907%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=deadbeef`,
    )
  })

  it('api.huanvae.com 同样改写（发现面 /endpoints 的 domains 列表里的第二个正式域名）', () => {
    setApiBaseUrl(PROXY)
    expect(toAbsoluteApiUrl('https://api.huanvae.com/api/storage/file/u1')).toBe(
      `${PROXY}/api/storage/file/u1`,
    )
  })

  it('基址就是正式域名时原样返回（生产环境零改动）', () => {
    setApiBaseUrl('https://api.huanvae.cn')
    expect(toAbsoluteApiUrl(PRESIGNED)).toBe(PRESIGNED)
  })

  it('非正式域名的绝对地址不动：第三方主机的预签名 URL 不属于本后端', () => {
    setApiBaseUrl(PROXY)
    const thirdParty = 'https://minio.example.com/bucket/k?X-Amz-Signature=deadbeef'
    expect(toAbsoluteApiUrl(thirdParty)).toBe(thirdParty)
  })

  it('主机名要整段匹配：api.huanvae.cn.evil.com 不是正式域名', () => {
    setApiBaseUrl(PROXY)
    const lookalike = 'https://api.huanvae.cn.evil.com/x'
    expect(toAbsoluteApiUrl(lookalike)).toBe(lookalike)
  })

  it('hash 片段与显式默认端口都能正确处理', () => {
    setApiBaseUrl(PROXY)
    expect(toAbsoluteApiUrl('https://api.huanvae.cn:443/a/b#frag')).toBe(`${PROXY}/a/b#frag`)
    expect(toAbsoluteApiUrl('https://api.huanvae.cn')).toBe(PROXY)
  })

  it('幂等：改写后的地址再过一次不变', () => {
    setApiBaseUrl(PROXY)
    const once = toAbsoluteApiUrl(PRESIGNED)
    expect(toAbsoluteApiUrl(once)).toBe(once)
  })

  it('相对路径的补基址行为不变', () => {
    setApiBaseUrl(PROXY)
    expect(toAbsoluteApiUrl('avatars/u.png?t=1')).toBe(`${PROXY}/avatars/u.png?t=1`)
  })
})
