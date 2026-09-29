import type { ActionFunctionArgs } from 'react-router'
import { forwardToUpstream, isCrossSiteWrite } from '../../../server/proxy/forward'
import {
  SessionDead,
  UpstreamUnavailable,
  crossSiteRejectedResponse,
  ensureFreshAccessToken,
  getSessionStore,
  readSessionId,
  upstreamUnavailableResponse,
} from '../../../server/session'

/**
 * 视频会议「加入房间」：后端唯一一个**无需登录**的业务端点（backend-docs webrtc/WebRTC房间.md:139
 * 「使用房间号和密码加入房间。无需登录。」）。通用的 `api/*` 一律要会话，访客拿着会议链接进来会先
 * 撞上 401，所以单独一条：有有效会话就照常带 Bearer（后端据此把参会者记成已登录用户）；没有会话、
 * 或者会话已失效，就不带鉴权原样转发。信令 WS 本来就是透传（server/index.ts 的 `/ws/webrtc/rooms/*`）。
 */
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejectedResponse()

  const url = new URL(request.url)
  let authorization: string | undefined
  const id = readSessionId(request)
  if (id) {
    const store = await getSessionStore()
    const session = store.get(id)
    if (session) {
      try {
        authorization = `Bearer ${await ensureFreshAccessToken(store, session)}`
      } catch (error) {
        if (error instanceof UpstreamUnavailable) return upstreamUnavailableResponse()
        // 会话已死：当访客加入，不回 401
        if (!(error instanceof SessionDead)) throw error
      }
    }
  }

  return forwardToUpstream(request, { pathWithQuery: `${url.pathname}${url.search}`, authorization })
}
