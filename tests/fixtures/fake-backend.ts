/**
 * e2e 与手工体验审计用的**有状态、多用户**假后端（BFF 的上游）。
 *
 * 链路：浏览器 → BFF（同源 RR 资源路由 `src/app/routes/api.*.ts` / `passthrough.$.ts`、`server/` 的
 * WS 代理）→ 这里。BFF 把 httpOnly cookie 换成 `Authorization: Bearer <access_token>`，WS 连
 * `/ws?token=<access_token>`；`/avatars/*`、`/user-file/*`、`/friends-file/*`、`/apps/*` 原样透传过来。
 *
 * 响应形状逐条对过前端解析器（`src/lib/apiEnvelope.ts` + 各 api 模块，它们形状一错就抛
 * `ApiShapeError` / 打 `[api-shape]`），其次对 backend-docs（github HuanvaeNeko/backend-docs）。
 * 只绑 127.0.0.1：这台机器上不该有任何理由让这个 fixture 在 LAN 上可达。
 *
 * ## 世界（`fake-backend/world.ts`，每次 `/__test/reset` 按「此刻」重新生成，内容确定）
 *
 * 全员密码 `correct-horse`。主视角 `alice`（爱丽丝）：好友 bob / carol（备注「卡卡（大学室友）」）/
 * dave（特别关心）/ erin（已拉黑）/ heidi（昨天刚加）；frank → alice 待处理申请、alice → grace 已发申请；
 * 群：周末徒步小分队（群主，8 人）、前端技术交流群（36 人普通成员，12 条未读）、读书会·第七期（管理员）、
 * 胶片摄影同好会（待接受的邀请）、周五桌游夜（发出的入群申请）、开源周报读者群（免审核可直接进）。
 * alice ↔ bob 80+ 条消息横跨去年到今天（图片 / PDF / 视频 / 撤回 / Markdown / 链接 / 会议邀请 / 群名片）。
 * `e2e` 是旧 fixture 的账号：空世界，登录 / 刷新 / 资料响应逐字不变（`AT-e2e` / `RT-e2e` / `AT-e2e-2`）。
 *
 * ## 测试控制端点（只在本端口，BFF 不转发）
 *
 *   curl -XPOST localhost:39473/__test/reset                  # 世界回到种子状态；聊天 WS 以 1012 关闭（前端会自动重连）
 *   curl localhost:39473/__test/state                         # 在线连接、会话、好友、群、会话条数……
 *   curl -XPOST localhost:39473/__test/send -d '{"from":"bob","to":"alice","text":"在吗？"}'
 *   curl -XPOST localhost:39473/__test/send -d '{"from":"bob","group":"0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e01","text":"集合啦"}'
 *   curl -XPOST localhost:39473/__test/send -d '{"from":"dave","to":"alice","type":"image"}'   # type: text|image|video|file
 *   curl -XPOST localhost:39473/__test/friend-request -d '{"from":"grace","to":"alice","message":"hi"}'
 *   curl -XPOST localhost:39473/__test/recall -d '{"by":"bob","message_uuid":"…"}'           # 不受 2 分钟限制
 *   curl -XPOST localhost:39473/__test/typing -d '{"from":"bob","to":"alice"}'                # 或 {"from","group","is_typing":false}
 *   curl -XPOST localhost:39473/__test/group-invite -d '{"from":"dave","to":"alice","group":"…"}'
 *
 * 全部走与 REST 相同的业务函数（`fake-backend/actions.ts`），WS 推送、未读、预览与真人操作一致。
 *
 * ## 其它约定
 *
 * - 未实现的路径：404 信封 `假后端未实现 <path>`，并在 stdout 打一行 `[fake-backend] UNIMPLEMENTED <METHOD> <path>`。
 * - access token 有效期 `FAKE_BACKEND_TOKEN_TTL` 秒（默认 900），过期 401——BFF 应在到期前惰性刷新。
 * - `FAKE_BACKEND_LOG=1` 时逐条打印请求。
 */
import { fail, HttpError, json, matchRoute, type Route } from './fake-backend/http'
import { authRoutes } from './fake-backend/routes/auth'
import { friendRoutes } from './fake-backend/routes/friends'
import { groupRoutes } from './fake-backend/routes/groups'
import { messageRoutes } from './fake-backend/routes/messages'
import { handleAppsRequest, miscRoutes } from './fake-backend/routes/misc'
import { profileRoutes } from './fake-backend/routes/profile'
import { handleObjectRequest, storageRoutes } from './fake-backend/routes/storage'
import { testRoutes } from './fake-backend/routes/testControl'
import { closeRtc, handleRtcMessage, openRtc, resolveRtcToken } from './fake-backend/rtc'
import { resolveAccessToken } from './fake-backend/sessions'
import { W } from './fake-backend/state'
import type { UserRec } from './fake-backend/types'
import { closeChat, handleChatMessage, openChat, type SocketData } from './fake-backend/ws'

const PORT = Number(process.env.FAKE_BACKEND_PORT ?? 39473)
const LOG = process.env.FAKE_BACKEND_LOG === '1'

// 顺序有意义：具体路径（/api/groups/my）必须排在参数路径（/api/groups/:groupId）之前
const ROUTES: Route[] = [...testRoutes, ...authRoutes, ...profileRoutes, ...friendRoutes, ...messageRoutes, ...groupRoutes, ...storageRoutes, ...miscRoutes]

const server = Bun.serve<SocketData>({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(request) {
    // 任何分支回应之前先把请求体读完——包括 401/404 这类根本不看 body 的分支。
    // Bun 的 fetch 客户端（BFF 的 forwardToUpstream 流式转发）在「响应先于请求体写出就已完整
    // 到达」时会丢掉请求体、却把连接放回 keep-alive 池；这边的 Bun.serve 按 Content-Length
    // 跳过的就成了下一个请求的头几个字节，于是下一个请求吃到一个空 body 的 400。先读完，
    // 响应就一定排在请求体之后，竞态不存在。按字节读（不是 text()）：分片 PUT 是二进制。
    const body = request.body ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array(0)
    const url = new URL(request.url)
    const path = url.pathname
    if (LOG) console.log(`[fake-backend] ${request.method} ${path}${url.search}`)

    // Playwright 的 webServer.url 探活：不需要 Bearer 的 2xx 路径。
    if (path === '/healthz') return json({ ok: true })

    // 聊天 WS：token 必须在查询串里 —— 这是 BFF 注入的证明（浏览器从没发过 token）
    if (path === '/ws') {
      const token = url.searchParams.get('token')
      if (!token) return json({ success: false, code: 400, error: 'missing field token' }, 400)
      const resolved = resolveAccessToken(token)
      if (!resolved.ok) return fail(401, resolved.reason)
      if (server.upgrade(request, { data: { kind: 'chat', token, userId: resolved.session.user_id } })) return undefined as unknown as Response
      return json({ success: false, code: 400, error: '升级失败' }, 400)
    }

    // WebRTC 信令 WS：认 join/create 返回的 ws_token，不认会话
    const rtc = /^\/ws\/webrtc\/rooms\/([^/]+)$/.exec(path)
    if (rtc) {
      const participantId = resolveRtcToken(decodeURIComponent(rtc[1]), url.searchParams.get('token') ?? '')
      if (!participantId) return fail(401, 'ws_token 无效或已过期')
      if (server.upgrade(request, { data: { kind: 'rtc', roomId: decodeURIComponent(rtc[1]), participantId } })) return undefined as unknown as Response
      return json({ success: false, code: 400, error: '升级失败' }, 400)
    }

    const object = handleObjectRequest(request, url, body)
    if (object) return object
    const app = handleAppsRequest(url)
    if (app) return app

    const hit = matchRoute(ROUTES, request.method, path)
    if (!hit) {
      console.log(`[fake-backend] UNIMPLEMENTED ${request.method} ${path}`)
      return json({ success: false, code: 404, error: `假后端未实现 ${path}` }, 404)
    }

    try {
      let me: UserRec | null = null
      let token = ''
      if (hit.route.auth) {
        // 以下端点一律要求 Bearer —— 浏览器只发了 cookie，到这里必须变成 Authorization
        const auth = request.headers.get('authorization')
        if (!auth?.startsWith('Bearer ')) return fail(401, '未授权访问')
        token = auth.slice(7)
        const resolved = resolveAccessToken(token)
        if (!resolved.ok) return fail(401, resolved.reason)
        me = W().users.get(resolved.session.user_id) ?? null
        if (!me) return fail(401, '用户不存在或已被重置')
      }
      return await hit.route.handler({
        request,
        method: request.method,
        url,
        path,
        query: url.searchParams,
        params: hit.params,
        body,
        // 不需要鉴权的路由不读 me；这里的断言只为让 Ctx 在需要鉴权的路由里保持非空类型
        me: me as UserRec,
        token,
      })
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.message)
      console.error(`[fake-backend] 500 ${request.method} ${path}`, error)
      return fail(500, `假后端内部错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
  websocket: {
    open(ws) {
      if (ws.data.kind === 'chat') openChat(ws, ws.data.userId)
      else openRtc(ws, ws.data.roomId, ws.data.participantId)
    },
    message(ws, message) {
      if (ws.data.kind === 'chat') handleChatMessage(ws, ws.data.userId, message)
      else handleRtcMessage(ws, ws.data.roomId, ws.data.participantId, message)
    },
    close(ws) {
      if (ws.data.kind === 'chat') closeChat(ws, ws.data.userId)
      else closeRtc(ws.data.roomId, ws.data.participantId)
    },
  },
})

console.warn(`fake backend listening on :${PORT}`)
