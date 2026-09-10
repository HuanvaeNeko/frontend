import { afterEach, describe, expect, it, vi } from 'vitest'
import { toAbsoluteApiUrl, toApiRelativePath, getApiBaseUrl, getWsUrl } from '../apiConfig'

describe('getApiBaseUrl / getAuthApiUrl / getWsUrl —— 基址是同源空串', () => {
  it('getApiBaseUrl 返回空串——所有请求同源，浏览器不再知道后端主机', () => {
    expect(getApiBaseUrl()).toBe('')
  })

  it('getWsUrl 返回空串——wsStore 用相对 /ws', () => {
    expect(getWsUrl()).toBe('')
  })
})

describe('toAbsoluteApiUrl', () => {
  it('相对路径补成同源绝对路径（toAbsoluteApiUrl 的行为不变，只是基址变了）', () => {
    // happy-dom 的 location.origin 是 http://localhost:3000
    expect(toAbsoluteApiUrl('avatars/a.png')).toBe(`${location.origin}/avatars/a.png`)
  })

  it('相对路径补上同源基址', () => {
    expect(toAbsoluteApiUrl('/api/storage/file/abc')).toBe(`${location.origin}/api/storage/file/abc`)
  })

  it('不带前导斜杠的相对路径也能补', () => {
    expect(toAbsoluteApiUrl('api/storage/file/abc')).toBe(`${location.origin}/api/storage/file/abc`)
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

  /**
   * SSR 分支：`typeof location === 'undefined'`。React Router 8 的服务端渲染路径上
   * 没有 `location` 全局——不是假设，是 Node 运行时压根不提供这个全局。
   * 这里用 `vi.stubGlobal('location', undefined)` 模拟同一件事：删掉这个全局，
   * 用完必须恢复，否则后面所有用例都会静默切换到这条分支。
   */
  describe('SSR：没有 location 全局', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('退化成根相对路径，而不是抛错或拼出字面量 "undefined"', () => {
      vi.stubGlobal('location', undefined)

      expect(toAbsoluteApiUrl('avatars/a.png')).toBe('/avatars/a.png')
      expect(toAbsoluteApiUrl('/avatars/a.png')).toBe('/avatars/a.png')
    })
  })
})

/**
 * 后端把预签名 URL / part_url / file_url 以 `https://api.huanvae.cn/...` 的绝对地址返回。
 * 基址永远是同源空串（Task 12 删除了「切换服务器」），所以这条改写**不再是可选的**——
 * 浏览器压根连不上 `api.huanvae.cn`（阿里云 ICP 备案拦截），任何一条这样的绝对地址
 * 不换成 `location.origin` 就是死链接。path / query / hash 必须逐字保留——SigV4 签名
 * 覆盖的是 Host 与路径参数，BFF 反代转发时显式带 `Host: api.huanvae.cn`，只换 origin
 * 不会让签名失效。
 */
describe('toAbsoluteApiUrl：后端返回的正式域名绝对地址被改写到同源', () => {
  const PRESIGNED =
    'https://api.huanvae.cn/user-file/conv-a-b/images/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=k%2F20260907%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=deadbeef'

  it('后端返回的正式域名绝对地址被改写到同源（预签名 URL 走这条）', () => {
    const rewritten = toAbsoluteApiUrl('https://api.huanvae.cn/user-file/obj?X-Amz-Signature=deadbeef')
    expect(rewritten).toBe(`${location.origin}/user-file/obj?X-Amz-Signature=deadbeef`)
  })

  it('api.huanvae.cn 的预签名 URL 只换 origin，路径与签名参数逐字保留', () => {
    expect(toAbsoluteApiUrl(PRESIGNED)).toBe(
      `${location.origin}/user-file/conv-a-b/images/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=k%2F20260907%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=deadbeef`,
    )
  })

  it('api.huanvae.com 同样改写（发现面 /endpoints 的 domains 列表里的第二个正式域名）', () => {
    expect(toAbsoluteApiUrl('https://api.huanvae.com/api/storage/file/u1')).toBe(
      `${location.origin}/api/storage/file/u1`,
    )
  })

  it('非正式域名的绝对地址不动：第三方主机的预签名 URL 不属于本后端', () => {
    const thirdParty = 'https://minio.example.com/bucket/k?X-Amz-Signature=deadbeef'
    expect(toAbsoluteApiUrl(thirdParty)).toBe(thirdParty)
  })

  it('主机名要整段匹配：api.huanvae.cn.evil.com 不是正式域名', () => {
    const lookalike = 'https://api.huanvae.cn.evil.com/x'
    expect(toAbsoluteApiUrl(lookalike)).toBe(lookalike)
  })

  it('hash 片段与显式默认端口都能正确处理', () => {
    expect(toAbsoluteApiUrl('https://api.huanvae.cn:443/a/b#frag')).toBe(`${location.origin}/a/b#frag`)
    expect(toAbsoluteApiUrl('https://api.huanvae.cn')).toBe(location.origin)
  })

  it('幂等：改写后的地址再过一次不变', () => {
    const once = toAbsoluteApiUrl(PRESIGNED)
    expect(toAbsoluteApiUrl(once)).toBe(once)
  })

  it('已经落在同源上的地址是 no-op（幂等的另一半：不会把 origin 换成它自己再兜一圈）', () => {
    const alreadySameOrigin = `${location.origin}/user-file/obj?X-Amz-Signature=deadbeef`
    expect(toAbsoluteApiUrl(alreadySameOrigin)).toBe(alreadySameOrigin)
  })

  /** SSR 分支：见 `toAbsoluteApiUrl` 那组同名 describe 的说明。 */
  describe('SSR：没有 location 全局', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('退化成根相对路径，path / query / hash 逐字保留', () => {
      vi.stubGlobal('location', undefined)

      expect(toAbsoluteApiUrl('https://api.huanvae.cn/a/b?q=1#frag')).toBe('/a/b?q=1#frag')
      expect(toAbsoluteApiUrl('https://api.huanvae.cn')).toBe('/')
    })
  })
})

/**
 * `toApiRelativePath` 的存在理由是 webrtc：join / create 房间的请求体字段
 * `avatar_url` 文档写的是**相对路径**（`backend-docs/webrtc/WebRTC房间.md:154`
 * 逐字 `"avatar_url": "avatars/guest.png?t=1706000000"  // 可选，头像相对路径`，
 * 创建房间 :72 同样），而 store 里存的是补过基址的绝对地址。
 */
describe('toApiRelativePath —— 发回后端时把绝对地址还原成相对路径', () => {
  it('丢掉 origin，保留 path + query（后端样例就是这个形状）', () => {
    expect(toApiRelativePath('https://api.huanvae.cn/avatars/guest.png?t=1706000000')).toBe(
      'avatars/guest.png?t=1706000000',
    )
  })

  it('origin 与当前 location 不同时也照样还原——本函数丢的是 origin，不是"减去某个基址"', () => {
    expect(toApiRelativePath('http://127.0.0.1:8787/avatars/alice.png?t=1')).toBe(
      'avatars/alice.png?t=1',
    )
    // 正对照：同一次运行里，同源地址也还原成同一个形状
    expect(toApiRelativePath(`${location.origin}/avatars/alice.png?t=1`)).toBe(
      'avatars/alice.png?t=1',
    )
  })

  it('已经是相对路径的值原样返回（幂等），前导斜杠去掉', () => {
    expect(toApiRelativePath('avatars/alice.png?t=1')).toBe('avatars/alice.png?t=1')
    expect(toApiRelativePath('/avatars/alice.png?t=1')).toBe('avatars/alice.png?t=1')
  })

  it('与 toAbsoluteApiUrl 往返一致 —— 仅限 URL 不会重写的字符', () => {
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
