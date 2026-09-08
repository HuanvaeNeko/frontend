import { describe, it, expect, afterEach } from 'vitest'
import {
  toAbsoluteApiUrl,
  toApiRelativePath,
  getApiBaseUrl,
  setApiBaseUrl,
  clearApiBaseUrl,
} from '../apiConfig'

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

/**
 * `toApiRelativePath` 的存在理由是 webrtc：join / create 房间的请求体字段
 * `avatar_url` 文档写的是**相对路径**（`backend-docs/webrtc/WebRTC房间.md:154`
 * 逐字 `"avatar_url": "avatars/guest.png?t=1706000000"  // 可选，头像相对路径`，
 * 创建房间 :72 同样），而 store 里存的是补过基址的绝对地址。
 */
describe('toApiRelativePath —— 发回后端时把绝对地址还原成相对路径', () => {
  const PROXY = 'http://127.0.0.1:8787'

  afterEach(() => clearApiBaseUrl())

  it('丢掉 origin，保留 path + query（后端样例就是这个形状）', () => {
    expect(toApiRelativePath('https://api.huanvae.cn/avatars/guest.png?t=1706000000')).toBe(
      'avatars/guest.png?t=1706000000',
    )
  })

  it('origin 与当前基址**不同**时也照样还原 —— 本项目会故意改基址', () => {
    // 这条钉的是"丢掉 origin"而不是"减去当前基址"：落盘的绝对地址可能是上一次
    // 用另一个基址拼出来的。改成前缀匹配当前基址的实现，这条红。
    setApiBaseUrl('https://api.huanvae.cn')
    expect(toApiRelativePath(`${PROXY}/avatars/alice.png?t=1`)).toBe('avatars/alice.png?t=1')
    // 正对照：同一次运行里，当前基址下的地址也还原成同一个形状
    expect(toApiRelativePath('https://api.huanvae.cn/avatars/alice.png?t=1')).toBe(
      'avatars/alice.png?t=1',
    )
  })

  it('已经是相对路径的值原样返回（幂等），前导斜杠去掉', () => {
    expect(toApiRelativePath('avatars/alice.png?t=1')).toBe('avatars/alice.png?t=1')
    expect(toApiRelativePath('/avatars/alice.png?t=1')).toBe('avatars/alice.png?t=1')
  })

  it('与 toAbsoluteApiUrl 往返一致 —— 仅限 URL 不会重写的字符', () => {
    setApiBaseUrl(PROXY)
    // 后端生成的头像路径就是这个形状（`个人资料管理.md:74` 的样例
    // `"avatars/testuser001.jpg?t=1706000000"`），全是 URL 不碰的字符。
    const relative = 'avatars/alice.png?t=1706000000'
    expect(toApiRelativePath(toAbsoluteApiUrl(relative))).toBe(relative)
  })

  it('往返**不是逐字**的：含空格 / 非 ASCII 的路径会被百分号编码，两条分支给出不同的字节', () => {
    // JSDoc 里曾经写着"两边发出去的结果逐字相同"，那是错的，而它正是"可以把本函数
    // 当逆运算用"这个说法的全部依据。差异在 toAbsoluteApiUrl 的 `new URL().href`
    // 那一步产生：相对分支返回原始字节，绝对分支读的是 pathname。
    //
    // 后果具体是：一个还没迁移过的客户端（落盘值是相对路径）和一个迁移过的客户端
    // （落盘值是绝对地址），同一张头像发给 webrtc 的 avatar_url 不是同一个字符串。
    setApiBaseUrl(PROXY)
    const spaced = 'avatars/a b.png'

    // 相对分支：原样（只去前导斜杠）
    expect(toApiRelativePath(spaced)).toBe('avatars/a b.png')
    // 绝对分支：过了一次 URL，空格变成 %20
    expect(toApiRelativePath(toAbsoluteApiUrl(spaced))).toBe('avatars/a%20b.png')
    // 这两个就是"同一张头像的两种 wire 值"
    expect(toApiRelativePath(spaced)).not.toBe(toApiRelativePath(toAbsoluteApiUrl(spaced)))

    // 非 ASCII 同理（中文文件名）
    expect(toApiRelativePath('avatars/中文.png')).toBe('avatars/中文.png')
    expect(toApiRelativePath(toAbsoluteApiUrl('avatars/中文.png'))).toBe(
      'avatars/%E4%B8%AD%E6%96%87.png',
    )
  })

  it('hash 一并保留', () => {
    expect(toApiRelativePath('https://api.huanvae.cn/a/b?q=1#frag')).toBe('a/b?q=1#frag')
  })

  it('data: / blob: 返回 undefined —— 那不是后端存储路径，不该发给信令服务器', () => {
    expect(toApiRelativePath('data:image/png;base64,AAAA')).toBeUndefined()
    expect(toApiRelativePath('blob:https://x/y')).toBeUndefined()
  })

  it('null / undefined / 空串 / 只有 origin 的地址都返回 undefined', () => {
    expect(toApiRelativePath(null)).toBeUndefined()
    expect(toApiRelativePath(undefined)).toBeUndefined()
    expect(toApiRelativePath('   ')).toBeUndefined()
    expect(toApiRelativePath('https://api.huanvae.cn/')).toBeUndefined()
  })
})
