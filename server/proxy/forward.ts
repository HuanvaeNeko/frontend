import { upstreamHttp } from '../upstream'

/**
 * hop-by-hop 头：只对单跳连接有意义，转发时必须剥掉（RFC 7230 §6.1）。
 * 连带剥 `host`（由 fetch 按目标 URL 自己设）与 `cookie`（只对 BFF 有意义，
 * 里面是会话钥匙，绝不能出现在到后端的请求里）。
 */
const STRIP_FROM_REQUEST = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer',
  'proxy-authorization', 'proxy-connection',
  'host', 'cookie',
  // 凭证只能由 BFF 注入。请求自带的 authorization 一律不信——否则浏览器侧
  // 可以自己塞一个头绕过会话检查。
  'authorization',
  // 浏览器带来的来源头一律不可信：Caddy 对 X-Forwarded-For 是追加而非替换，
  // 伪造值会作为链条首元素抵达源站；BFF 自己也不替上游合成 XFF。
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port',
  'x-real-ip', 'forwarded', 'via',
])

const STRIP_FROM_RESPONSE = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer',
  'proxy-authenticate', 'proxy-connection',
  // 上游的 set-cookie 不透给浏览器：会话由 BFF 全权管理，
  // 后端如果哪天开始下发 cookie，也不该越过 BFF 直达浏览器。
  'set-cookie',
  // fetch 在 Node 与 Bun 下都已经把 body 解压了，却把这两个头原样留在
  // upstream.headers 上：content-encoding 会让浏览器再解一次，触发
  // ERR_CONTENT_DECODING_FAILED / ZlibError；content-length 是压缩前的长度，
  // 与解压后的实际 body 不符。只剥请求侧 accept-encoding 不够——运行时在没
  // 该头时会自己补上，上游照样压——必须在响应侧剥，交给运行时按实际 body 重新分帧。
  'content-encoding', 'content-length',
])

export function buildUpstreamHeaders(request: Request, extra?: Record<string, string>): Headers {
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!STRIP_FROM_REQUEST.has(key.toLowerCase())) headers.set(key, value)
  })
  for (const [k, v] of Object.entries(extra ?? {})) headers.set(k, v)
  return headers
}

export function buildDownstreamHeaders(response: Response, extra?: Record<string, string>): Headers {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    if (!STRIP_FROM_RESPONSE.has(key.toLowerCase())) headers.set(key, value)
  })
  for (const [k, v] of Object.entries(extra ?? {})) headers.set(k, v)
  return headers
}

/**
 * 跨站写请求。`SameSite=Lax` 已经让跨站 POST 带不上 cookie，这是第二道：
 * 即便将来 cookie 策略变了，跨站的非 GET 也直接拒。
 *
 * 头缺失时判**假**：老浏览器与服务端发起的调用不带这个头，拦它们没有依据。
 */
export function isCrossSiteWrite(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return false
  return request.headers.get('sec-fetch-site') === 'cross-site'
}

export interface ForwardOptions {
  /** 原样的 pathname + search。**绝不重新编码** —— 预签名 URL 的签名对字节敏感 */
  pathWithQuery: string
  /** 只有鉴权代理会传；透传分支必须不传，否则 S3 拒绝 */
  authorization?: string
}

export async function forwardToUpstream(request: Request, opts: ForwardOptions): Promise<Response> {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  const upstream = await fetch(`${upstreamHttp()}${opts.pathWithQuery}`, {
    method: request.method,
    headers: buildUpstreamHeaders(request, opts.authorization ? { Authorization: opts.authorization } : undefined),
    // 流式转发：不 await text()/arrayBuffer()。分片上传可能是几十 MB，
    // 读进内存等于把它们全压在 BFF 的堆上。duplex: 'half' 是 fetch 接受
    // ReadableStream body 的前提，缺了它 Node/Bun 都会抛。
    body: hasBody ? request.body : null,
    duplex: hasBody ? 'half' : undefined,
    redirect: 'manual',
  } as RequestInit)

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: buildDownstreamHeaders(upstream),
  })
}
