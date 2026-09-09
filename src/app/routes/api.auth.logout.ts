import type { ActionFunctionArgs } from 'react-router'
import { isCrossSiteWrite } from '../../../server/proxy/forward'
import {
  clearSessionCookie,
  cookieOptionsFromEnv,
  crossSiteRejectedResponse,
  getSessionStore,
  killSession,
  readSessionId,
} from '../../../server/session'
import { upstreamHttp } from '../../../server/upstream'

/**
 * `POST /api/auth/logout` —— 销会话。
 *
 * 顺序刻意是「先打上游（尽力）→ 再删本地 → 再关 WS」：上游失败**不能**阻止
 * 本地登出。用户点了登出就该登出，后端不可达不是让他继续待在登录态的理由。
 */
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejectedResponse()

  const id = readSessionId(request)
  const cookie = clearSessionCookie(cookieOptionsFromEnv())

  if (id) {
    const store = await getSessionStore()
    const session = store.get(id)

    if (session) {
      try {
        await fetch(`${upstreamHttp()}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}` },
        })
      } catch {
        // 尽力而为。失败不影响本地登出。
      }
    }

    // 会话死亡的唯一出口：删行 + 关掉该会话名下所有还活着的 WS，否则登出后那条
    // 连接还在替他收消息。cookie 指向的行不存在时 delete 是 no-op，killSession
    // 仍会关 WS——不额外分支。
    killSession(store, id)
  }

  return new Response(JSON.stringify({ success: true, code: 200 }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': cookie },
  })
}
