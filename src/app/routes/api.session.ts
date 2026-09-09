import type { LoaderFunctionArgs } from 'react-router'
import {
  SessionDead,
  UpstreamUnavailable,
  ensureFreshAccessToken,
  getSessionStore,
  readSessionId,
  sessionExpiredResponse,
  upstreamUnavailableResponse,
} from '../../../server/session'

/**
 * `GET /api/session` —— 「我登录了吗」的**唯一真值**。
 *
 * 客户端启动时读它，而不是读 localStorage 里的 `isAuthenticated`。落盘的那份
 * `user` 只用于首帧把头像昵称画出来，永远不当授权依据。
 *
 * 401 = 未登录。**502 ≠ 未登录** —— 后端挂了不等于用户退出了，客户端在 502 时
 * 必须保持上一次状态、给可重试的错误，不清盘不跳登录。
 */
export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const id = readSessionId(request)
  if (!id) return sessionExpiredResponse()

  const store = await getSessionStore()
  const session = store.get(id)
  if (!session) return sessionExpiredResponse()

  // 顺手刷新：让启动那一刻就把临期 token 换掉，后续请求不必各自触发
  try {
    await ensureFreshAccessToken(store, session)
  } catch (error) {
    if (error instanceof SessionDead) return sessionExpiredResponse()
    if (error instanceof UpstreamUnavailable) return upstreamUnavailableResponse()
    throw error
  }

  store.touch(id, Date.now())

  return new Response(JSON.stringify({ success: true, code: 200, data: { user: session.user } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
