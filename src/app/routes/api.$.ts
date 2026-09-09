import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { isBusiness401Path } from '@/lib/business401'
import { forwardToUpstream, isCrossSiteWrite } from '../../../server/proxy/forward'
import {
  SessionDead,
  UpstreamUnavailable,
  clearSessionCookie,
  cookieOptionsFromEnv,
  crossSiteRejectedResponse,
  ensureFreshAccessToken,
  getSessionStore,
  readSessionId,
  sessionExpiredResponse,
  upstreamUnavailableResponse,
} from '../../../server/session'

/**
 * `/api/*` 鉴权代理。
 *
 * 契约（spec §4.4）：
 * 1. cookie → 会话 → `ensureFresh` → 注入 Bearer → 流式转发 → 流式回传。
 * 2. **不做「401 后刷新重试」**。新鲜度在转发**前**保证；401 之后重试等于重放
 *    一个非幂等请求 —— P1b 修过的正是这类 bug（改密请求被重放，可能撞上服务端
 *    的失败计数器）。
 * 3. 上游 **401** 分两种：业务 401 端点（见 `@/lib/business401`）原样透传、会话
 *    不动；其余视为会话死亡 → 删会话 + 清 cookie。漏掉这个分支的后果是用户打错
 *    一次当前密码就被踢下线。
 * 4. **403 与其余 4xx/5xx 一律原样透传，不碰会话。** 后端拿 403 表示普通权限拒绝
 *    （「不是群主/管理员」之类），这是 P1 用「静默登出」换来的教训。
 */
async function handle(request: Request): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejectedResponse()

  const url = new URL(request.url)
  const pathWithQuery = `${url.pathname}${url.search}`

  // 刷新是 BFF 的事，客户端不得驱动它。404 而不是 403：这个端点对浏览器
  // 而言就是不存在。
  if (url.pathname === '/api/auth/refresh') {
    return new Response(JSON.stringify({ success: false, code: 404, error: '该端点不对浏览器开放' }), {
      status: 404, headers: { 'content-type': 'application/json' },
    })
  }

  const id = readSessionId(request)
  if (!id) return sessionExpiredResponse()

  const store = await getSessionStore()
  const session = store.get(id)
  if (!session) return sessionExpiredResponse()

  let accessToken: string
  try {
    accessToken = await ensureFreshAccessToken(store, session)
  } catch (error) {
    if (error instanceof SessionDead) return sessionExpiredResponse()
    if (error instanceof UpstreamUnavailable) return upstreamUnavailableResponse()
    throw error
  }

  const response = await forwardToUpstream(request, { pathWithQuery, authorization: `Bearer ${accessToken}` })

  if (response.status === 401 && !isBusiness401Path(request.method, url.pathname)) {
    store.delete(id)
    // 原样透传上游的 body 与状态码，只额外清 cookie。BFF 不改写后端文案。
    const headers = new Headers(response.headers)
    headers.set('set-cookie', clearSessionCookie(cookieOptionsFromEnv()))
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }

  store.touch(id, Date.now())
  return response
}

export const loader = ({ request }: LoaderFunctionArgs): Promise<Response> => handle(request)
export const action = ({ request }: ActionFunctionArgs): Promise<Response> => handle(request)
