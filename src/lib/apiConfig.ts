/**
 * API 配置工具。
 *
 * 基址永远是**同源空串**——见 {@link getApiBaseUrl}。这个文件剩下的两个函数
 * （{@link toAbsoluteApiUrl}、{@link toApiRelativePath}）签名与行为不变，
 * 只是解析用的基址从"可能指向别处的后端 origin"变成了浏览器当前的 `location.origin`。
 */

/**
 * API 基址 = **空串**：所有请求同源打到 BFF（`/api/*`、`/avatars/*` …）。
 *
 * 浏览器不再知道 `api.huanvae.cn` 存在。这不只是整洁问题——那个域名在阿里云被
 * ICP 备案拦截，浏览器直连走不通（WS 完全连不上），必须由服务端代取。
 *
 * 「切换服务器」那个设置项随之移除：上游由服务端的 BFF_UPSTREAM_HTTP 决定，
 * 不再是浏览器能改的东西。
 */
export const getApiBaseUrl = (): string => ''

export const getAuthApiUrl = (): string => '/api/auth'

/** 空串：`wsStore` 用相对 `/ws`，协议由 `location` 推 */
export const getWsUrl = (): string => ''

/**
 * 当前文档的 origin，`toAbsoluteApiUrl` / `toApiRelativePath` / `rewriteCanonicalApiOrigin`
 * 三个函数共用它作为"基址为空串时"的兜底。
 *
 * 为什么不能直接把 `getApiBaseUrl()` 的返回值（空串）当 `new URL(x, base)` 的
 * `base` 参数用：`URL` 构造函数拿到第二个参数时**先**把它解析成一个绝对 URL，
 * 解析失败就直接抛——不管第一个参数自己是不是已经绝对。空串、`'/'` 都不是
 * 合法的绝对 URL，所以 `new URL(x, '/')` 对任何 `x`（包括已经绝对的 `x`）都会抛
 * `TypeError: Invalid URL`（已实测）。必须换成一个真正带 scheme + host 的 origin。
 *
 * 浏览器里就是 `location.origin`——这就是"基址"现在实际所在，BFF 与前端同源。
 * SSR（`typeof location === 'undefined'`，React Router 8 的服务端渲染路径，
 * Node 运行时压根不提供这个全局，不是猜测）没有它，返回 `undefined`，
 * 调用方各自退化成根相对路径：BFF 与浏览器同源，根相对路径本来就是"当前 origin
 * 下的绝对路径"，只是没有协议+主机前缀，交给最终渲染它的浏览器补上。
 */
function documentOrigin(): string | undefined {
  return typeof location === 'undefined' ? undefined : location.origin
}

/**
 * 把后端返回的相对路径补成绝对 URL。
 *
 * ## 为什么放在这里，而不是解包层里
 *
 * 解包层（`src/lib/apiEnvelope.ts`）只负责"信封拆开后 data 长得对不对"，
 * 它不该知道哪些字段是 URL——一旦知道，每加一个 DTO 就要去登记字段名，
 * 而且会误伤已经是绝对地址的预签名 URL（预签名 URL 自带签名参数，
 * 被重新拼接就直接失效）。所以两者是**正交**的：
 *
 *     const data = await readEnvelope<PresignedUrlResponse>(res, {...})  // 拆信封
 *     return toAbsoluteApiUrl(data.presigned_url)                        // 补基址
 *
 * 顺序固定为「先解包、后补基址」，且只在 api 模块的出口做一次，组件里不再拼。
 *
 * ## 为什么放在 apiConfig.ts
 *
 * 因为基址的唯一真相在这个文件里。放在 `storage.ts` 会踩一个具体的坑：
 * 该文件顶部的 `STORAGE_BASE_URL` 已经带了 `/api/storage` 后缀，用它拼
 * `/api/storage/file/xxx` 会得到 `/api/storage/api/storage/file/xxx`。
 * 放在 `getApiBaseUrl()` 旁边，这个坑从结构上不存在。
 *
 * 幂等：已带协议（http/https/data/blob）、协议相对（`//`）的地址原样返回，
 * 因此重复调用安全，也不会破坏预签名 URL。
 *
 * 唯一的例外是**本后端正式域名**的 http(s) 绝对地址：后端把预签名 URL、`part_url`、
 * `file_url` 以 `https://api.huanvae.cn/...` 返回，它们的 origin 会被换成
 * `location.origin`，path / query / hash 逐字保留——见 {@link rewriteCanonicalApiOrigin}。
 * 地址已经落在 `location.origin` 上时这条规则是 no-op。
 */
export function toAbsoluteApiUrl(path: string): string
export function toAbsoluteApiUrl(path: string | null | undefined): string | undefined
export function toAbsoluteApiUrl(path: string | null | undefined): string | undefined {
  if (path === null || path === undefined) return undefined
  const trimmed = path.trim()
  if (trimmed === '') return undefined

  // 协议相对地址：交给浏览器按当前协议解析
  if (trimmed.startsWith('//')) return trimmed
  // 已带任意协议（http:、https:、data:、blob:）——预签名 URL 走这条；
  // 只有本后端正式域名的 http(s) 地址会被换成 location.origin，其余原样返回
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return rewriteCanonicalApiOrigin(trimmed)

  const origin = documentOrigin()
  if (origin === undefined) return `/${trimmed.replace(/^\/+/, '')}`

  try {
    return new URL(trimmed, `${origin}/`).href
  } catch {
    return trimmed
  }
}

/**
 * {@link toAbsoluteApiUrl} 的逆运算：把一个头像地址还原成后端要的**相对路径**。
 *
 * ## 为什么需要一个逆运算
 *
 * 本仓的约定是"在 api 出口把头像补成绝对地址"，于是 store 里的
 * `*_avatar_url` 一律是绝对的。但有一个方向相反的消费点：webrtc 把**自己的头像
 * 地址发回给后端**，而那两个请求体字段的文档写的是相对路径——
 * `backend-docs/webrtc/WebRTC房间.md:154`（`POST /api/webrtc/rooms/{room_id}/join`
 * 请求体）逐字是
 * `"avatar_url": "avatars/guest.png?t=1706000000"  // 可选，头像相对路径`，
 * 创建房间的 :72 同样是「可选，创建者头像相对路径」。后端把这个值原样转发给房间里
 * 的每一个人（join 响应 `user_info` :181、`joined` 名单 :265、`peer_joined` :302
 * 三处样例都是相对路径），所以发错形状坏的是**别人**屏幕上的图。
 *
 * ## 为什么丢掉整个 origin，而不是"减去当前 location.origin"
 *
 * 落盘的绝对地址不一定是用**当前**这个 origin 拼出来的——同一份 localStorage
 * 可能是上一次用别的 origin（旧版本、别的部署）访问时写下的，`authStore` 的
 * persist `migrate` 也只是把相对路径补成绝对，不会用当前 origin 去覆盖历史值。
 * 拿当前 origin 去做前缀匹配，origin 一变就匹配不上、于是把
 * `http://old-deploy.example/avatars/x.png` 原样发给后端，转给房间里所有人。
 * 这里不比较 origin，直接丢掉它，剩下 `pathname + search + hash`。
 *
 * 已经是相对路径的值**原样返回**（只去掉前导 `/`），不进 `URL` 解析器：
 * 后端给的字节不该被百分号编码改写。
 *
 * ## ⚠️ 它不是**逐字**的逆运算
 *
 * 两条分支对同一个路径可以给出不同的字节：相对分支返回原始字节，绝对分支读的是
 * `new URL(...).pathname`，而 `URL` 会把空格、非 ASCII 等百分号编码掉——
 * `avatars/a b.png` 与 `avatars/中文.png` 经 {@link toAbsoluteApiUrl} 再回到这里，
 * 出来的是 `avatars/a%20b.png` / `avatars/%E4%B8%AD%E6%96%87.png`。也就是说
 * **一个还没迁移过的客户端和一个迁移过的客户端，同一张头像发出去的 wire 值不同**，
 * 而这个差异是在 `toAbsoluteApiUrl` 那一步产生的，本函数只是没有（也不该）把它撤销：
 * 撤销要 `decodeURIComponent`，它会把后端有意编码进路径的 `%2F` 之类一起解开，
 * 那是把一个不常见的差异换成一个更难查的破坏。
 *
 * 差异范围就是 `URL` 会重写的那些字符。本后端生成的头像路径是
 * `avatars/<user_id>.<ext>`（`个人资料管理.md:74` 的样例
 * `"avatars/testuser001.jpg?t=1706000000"`），落在两条分支逐字相同的那一档里，
 * 所以"落盘值是绝对还是相对"今天观测不到差别——但那是数据形状给的，不是本函数
 * 保证的。`src/lib/__tests__/apiConfig.test.ts` 里「两条分支对含空格的路径给出
 * 不同的字节」那条用例把这个差异本身钉住，免得下一个人照着"逆运算"三个字
 * 去依赖一个不存在的保证。
 *
 * `data:` / `blob:` 之类不是后端存储路径，返回 `undefined`（= 不带这个字段），
 * 而不是把一个几 MB 的 data URI 发给信令服务器。
 */
export function toApiRelativePath(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  if (!hasScheme && !trimmed.startsWith('//')) {
    const withoutLeadingSlash = trimmed.replace(/^\/+/, '')
    return withoutLeadingSlash === '' ? undefined : withoutLeadingSlash
  }

  // hasScheme 时 trimmed 自己已经是绝对地址，不需要 base 也能解析；协议相对的
  // `//host/path` 需要一个 base 才能补出 scheme——用法与 toAbsoluteApiUrl 同一个
  // origin 兜底（见 documentOrigin）。SSR 且是协议相对地址时没有 origin 可用，
  // 落进下面的 catch，返回 undefined：编造一个协议比"不知道"更危险。
  let parsed: URL
  try {
    const origin = documentOrigin()
    parsed = origin === undefined ? new URL(trimmed) : new URL(trimmed, `${origin}/`)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined

  const relative = `${parsed.pathname.replace(/^\/+/, '')}${parsed.search}${parsed.hash}`
  return relative === '' ? undefined : relative
}

/**
 * 后端的正式域名。与发现面 `GET https://ca.huanvae.cn/endpoints` 返回的 `domains` 对齐。
 */
const CANONICAL_API_HOSTS = ['api.huanvae.cn', 'api.huanvae.com'] as const

/**
 * 匹配 `http(s)://<正式域名>[:port]`。主机名后面必须紧跟路径、查询、hash 或字符串结尾，
 * 所以 `api.huanvae.cn.evil.com` 这类前缀相同的主机不会命中。
 */
const CANONICAL_API_ORIGIN_RE = new RegExp(
  `^https?://(?:${CANONICAL_API_HOSTS.map((host) => host.replace(/\./g, '\\.')).join('|')})(?::\\d+)?(?=[/?#]|$)`,
  'i',
)

/**
 * 把本后端正式域名的绝对地址改写到 `location.origin`。
 *
 * ## 为什么需要，以及为什么 BFF 之后这条机制**更重要**了
 *
 * 后端返回的预签名 URL（MinIO 直链）、分片上传的 `part_url`、消息里的 `file_url` 都是
 * `https://api.huanvae.cn/...` 的绝对地址。BFF 落地之前，基址是可以切换的
 * （`setApiBaseUrl` 指到本地去 SNI 反代），这条改写只在基址被指到别处时才生效，
 * 生产环境（基址就是正式域名）是 no-op。
 *
 * 现在「切换服务器」已经删除，基址**永远**是同源空串，而 `api.huanvae.cn`
 * 本身在阿里云被 ICP 备案拦截——浏览器**任何时候**都连不上它，不存在"生产环境
 * 零改动"这回事了。这条改写从"开发时可选的便利"变成了"每一条这样的地址
 * 不换成 `location.origin` 就是一条浏览器打不开的死链接"：少了它，用户看到的会是
 * 一张加载失败的图、一次连不上的分片 PUT。BFF 把浏览器与 `api.huanvae.cn`
 * 之间的路直接断掉了，这个函数是唯一还能把后端"顺嘴"带出来的那个地址接回来的地方。
 *
 * ## 为什么签名不会失效
 *
 * SigV4 签名覆盖的是 Host 与路径、查询参数。BFF 反代转发时显式带 `Host: api.huanvae.cn`，
 * 所以 MinIO 看到的主机与签名时一致；这里**只替换 origin 前缀**，path / query / hash 从原字符串
 * 逐字切出来拼回去，不经 URL 解析器重新序列化，查询串一个字节都不会变。
 *
 * 地址已经落在 `location.origin` 上时原样返回，因此幂等。
 */
function rewriteCanonicalApiOrigin(url: string): string {
  const match = CANONICAL_API_ORIGIN_RE.exec(url)
  if (!match) return url

  const origin = documentOrigin()
  if (origin === undefined) {
    // SSR：没有 location，退化成根相对路径——理由见 documentOrigin 的注释。
    const rest = url.slice(match[0].length)
    return rest === '' ? '/' : rest
  }

  let urlOrigin: string
  try {
    urlOrigin = new URL(url).origin
  } catch {
    return url
  }
  if (urlOrigin === origin) return url

  return `${origin}${url.slice(match[0].length)}`
}
