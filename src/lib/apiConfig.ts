/**
 * API 配置工具
 * 统一使用 api.huanvae.cn 作为 API 地址
 */

const API_BASE_URL_STORAGE_KEY = 'huanvae.api-base-url'
const DEFAULT_API_BASE_URL = 'https://api.huanvae.cn'

function canUseStorage(): boolean {
  return typeof window !== 'undefined'
}

function getStoredApiBaseUrl(): string | null {
  if (!canUseStorage()) return null
  try {
    return localStorage.getItem(API_BASE_URL_STORAGE_KEY)
  } catch {
    return null
  }
}

export function normalizeApiBaseUrl(rawValue: string): string {
  const input = rawValue.trim()
  if (!input) throw new Error('服务器地址不能为空')

  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`
  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    throw new Error('服务器地址格式无效')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http 或 https 协议')
  }

  return parsed.origin
}

export function setApiBaseUrl(url: string): void {
  if (!canUseStorage()) return
  const normalized = normalizeApiBaseUrl(url)
  try {
    localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized)
  } catch {
    // ignore
  }
}

export function clearApiBaseUrl(): void {
  if (!canUseStorage()) return
  try {
    localStorage.removeItem(API_BASE_URL_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * 获取 API 基础地址
 * 统一使用: https://api.huanvae.cn
 */
export const getApiBaseUrl = (): string => {
  const stored = getStoredApiBaseUrl()
  if (stored) return stored

  // 如果设置了环境变量，优先使用
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  // 统一使用生产 API 地址
  return DEFAULT_API_BASE_URL
}

/**
 * 获取认证 API 地址
 */
export const getAuthApiUrl = (): string => {
  return `${getApiBaseUrl()}/api/auth`
}

/**
 * 获取 WebSocket 地址
 * 统一使用: wss://api.huanvae.cn
 */
export const getWsUrl = (): string => {
  // 如果设置了环境变量，优先使用
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }

  const apiBaseUrl = getApiBaseUrl()
  const url = new URL(apiBaseUrl)
  
  // 更换协议为 WebSocket
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  
  return url.origin
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
 * `file_url` 以 `https://api.huanvae.cn/...` 返回，当基址被指到别处（本地去 SNI 反代），
 * 它们的 origin 会被换成当前基址，path / query / hash 逐字保留——见
 * {@link rewriteCanonicalApiOrigin}。基址就是正式域名时这条规则是 no-op。
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
  // 只有本后端正式域名的 http(s) 地址会被换成当前基址的 origin，其余原样返回
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return rewriteCanonicalApiOrigin(trimmed)

  try {
    return new URL(trimmed, `${getApiBaseUrl()}/`).href
  } catch {
    return trimmed
  }
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
 * 把本后端正式域名的绝对地址改写到当前基址的 origin。
 *
 * ## 为什么需要
 *
 * 后端返回的预签名 URL（MinIO 直链）、分片上传的 `part_url`、消息里的 `file_url` 都是
 * `https://api.huanvae.cn/...` 的绝对地址。基址指向正式域名时它们本来就能直接用；
 * 但当基址被指到本地去 SNI 反代（`http://127.0.0.1:8787`，`api.huanvae.cn` 被备案拦截时
 * 的开发通道），浏览器直接请求正式域名会失败，必须把 origin 换成反代。
 *
 * ## 为什么签名不会失效
 *
 * SigV4 签名覆盖的是 Host 与路径、查询参数。反代转发时显式带 `Host: api.huanvae.cn`，
 * 所以 MinIO 看到的主机与签名时一致；这里**只替换 origin 前缀**，path / query / hash 从原字符串
 * 逐字切出来拼回去，不经 URL 解析器重新序列化，查询串一个字节都不会变。
 * Huanvae-Chat-App 的 `secure_proxy` 把 URL 改写到 `127.0.0.1:47823` 走的是同一条逻辑。
 *
 * 基址的 origin 与该地址相同时原样返回，因此幂等，生产环境零改动。
 */
function rewriteCanonicalApiOrigin(url: string): string {
  const match = CANONICAL_API_ORIGIN_RE.exec(url)
  if (!match) return url

  let baseOrigin: string
  let urlOrigin: string
  try {
    baseOrigin = new URL(getApiBaseUrl()).origin
    urlOrigin = new URL(url).origin
  } catch {
    return url
  }
  if (urlOrigin === baseOrigin) return url

  return `${baseOrigin}${url.slice(match[0].length)}`
}
