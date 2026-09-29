import type { UserRec } from './types'

/**
 * 响应形状与路由的公共件。
 *
 * 形状口径（逐条对过前端 `src/lib/apiEnvelope.ts` 的解包器）：
 * - 成功有数据：`{success:true, code:200, data}` —— {@link ok}
 * - 成功无数据：`{success:true, code:200, message}` —— {@link okMessage}（`assertEnvelopeOk` 只看成败）
 * - 失败：HTTP 状态码与信封 `code` 一致，文案放 `error` —— {@link fail} / {@link HttpError}
 */

export const json = (body: unknown, status = 200, headers?: Record<string, string>): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

/**
 * 字节 → Response body。TS 5.9 的 lib 把 `BodyInit` 收窄到 `Uint8Array<ArrayBuffer>`，而假后端里的
 * 字节来自 zlib / TextEncoder / 切片，类型参数各不相同；运行时它们全是普通 ArrayBuffer 支撑的视图。
 */
export const bytesBody = (bytes: Uint8Array): BodyInit => bytes as Uint8Array<ArrayBuffer>

export const ok = (data: unknown): Response => json({ success: true, code: 200, data })

export const okMessage = (message: string): Response => json({ success: true, code: 200, message })

/** 群模块十来个端点的 `SuccessResponse{success,message}`：业务结果嵌在 `data` 里。 */
export const okResult = (message: string, extra?: Record<string, unknown>): Response =>
  ok({ success: true, message, ...extra })

export const fail = (status: number, error: string): Response => json({ success: false, code: status, error }, status)

/** 处理器里直接 `throw`，入口统一转成 {@link fail}。 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

// 写成 function 声明而不是箭头常量：TS 只对「函数声明」做 never 返回的控制流收窄，
// 调用点才能写 `if (!x) badRequest(...)` 之后直接把 x 当非空用。
export function badRequest(message: string): never {
  throw new HttpError(400, message)
}
export function forbidden(message = '权限不足'): never {
  throw new HttpError(403, message)
}
export function notFound(message: string): never {
  throw new HttpError(404, message)
}

/** 一次请求的上下文。请求体在入口处**已经读完**（见 fake-backend.ts 的排空说明）。 */
export interface Ctx {
  request: Request
  method: string
  url: URL
  path: string
  query: URLSearchParams
  params: Record<string, string>
  body: Uint8Array
  /** 需要鉴权的路由里保证非空 */
  me: UserRec
  token: string
}

export function readJson<T = Record<string, unknown>>(ctx: Ctx): T {
  if (ctx.body.length === 0) return {} as T
  try {
    return JSON.parse(new TextDecoder().decode(ctx.body)) as T
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON')
  }
}

export type Handler = (ctx: Ctx) => Response | Promise<Response>

export interface Route {
  method: string
  pattern: string
  auth: boolean
  handler: Handler
  regex: RegExp
  keys: string[]
}

/** `/api/groups/:groupId/members/:userId` 风格；参数段不跨 `/`，取出后 decodeURIComponent。 */
export function route(method: string, pattern: string, handler: Handler, opts: { auth?: boolean } = {}): Route {
  const keys: string[] = []
  const source = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1))
        return '([^/]+)'
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { method, pattern, auth: opts.auth ?? true, handler, regex: new RegExp(`^${source}/?$`), keys }
}

export function matchRoute(routes: readonly Route[], method: string, path: string): { route: Route; params: Record<string, string> } | null {
  for (const r of routes) {
    if (r.method !== method) continue
    const m = r.regex.exec(path)
    if (!m) continue
    const params: Record<string, string> = {}
    r.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(m[i + 1])
    })
    return { route: r, params }
  }
  return null
}

/** 请求体里的字符串字段：缺失 / 非字符串 / 空白一律 400，文案点名字段。 */
export function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') badRequest(`缺少字段 ${key}`)
  return value as string
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') badRequest(`${key} 必须是字符串`)
  return value as string
}
