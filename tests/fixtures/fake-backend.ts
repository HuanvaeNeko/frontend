/**
 * e2e 用的假后端。实现 BFF 真正会打的那几条最小契约，让整条链路
 * （浏览器 → BFF → 上游）能在**真实生产构建产物**上跑通，而不再靠
 * `page.route()` 在浏览器侧拦截。
 *
 * 刻意只实现 BFF 需要的东西，不追求覆盖后端全部端点：这个 fixture 的作用是证明
 * 「cookie 换 bearer、WS 注入 token」这条机制成立，业务契约由单测的解析器守。
 *
 * 响应形状照抄 backend-docs 的信封：`{success, code, data}`；
 * `/api/auth/refresh` 特意**不回** `refresh_token`，与 2026-09-09 线上实测一致。
 *
 * 只绑 127.0.0.1：这台机器上不该有任何理由让这个 fixture 在 LAN 上可达。
 */
const PORT = Number(process.env.FAKE_BACKEND_PORT ?? 39473)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const USER = {
  user_nickname: 'E2E 用户',
  user_email: 'e2e@example.com',
  user_avatar_url: 'avatars/e2e.png',
}

// WS 连接上挂的状态：只有 token，仅用于 server.upgrade 的第二个参数——同样的
// "泛型参数决定 ws.data 类型" 写法见 server/index.ts 的 WsData。
const server = Bun.serve<{ token: string }>({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(request) {
    const url = new URL(request.url)
    const auth = request.headers.get('authorization')

    // Playwright 的 webServer.url 探活：不需要 Bearer 的 2xx 路径。
    if (url.pathname === '/healthz') return json({ ok: true })

    // WS 升级：token 必须在查询串里 —— 这是 BFF 注入的证明。
    if (url.pathname === '/ws') {
      const token = url.searchParams.get('token')
      // 这一句是 e2e 的核心断言之一：浏览器从没发过 token，它只能来自 BFF
      if (!token) return json({ success: false, code: 400, error: 'missing field token' }, 400)
      if (server.upgrade(request, { data: { token } })) return undefined as unknown as Response
      return json({ success: false, code: 400, error: '升级失败' }, 400)
    }

    if (url.pathname === '/api/auth/login') {
      const body = (await request.json()) as { user_id?: string; password?: string; device_info?: string }
      if (body.password !== 'correct-horse') {
        return json({ success: false, code: 401, error: '用户名或密码错误' }, 401)
      }
      return json({
        success: true, code: 200,
        data: { access_token: 'AT-e2e', refresh_token: 'RT-e2e', expires_in: 900, ...USER },
      })
    }

    if (url.pathname === '/api/auth/refresh') {
      // 与线上实测一致：不回 refresh_token
      return json({ success: true, code: 200, data: { access_token: 'AT-e2e-2', token_type: 'Bearer', expires_in: 900 } })
    }

    if (url.pathname === '/api/auth/logout') return json({ success: true, code: 200 })

    // 以下端点一律要求 Bearer —— 这是 e2e 真正在验的东西：
    // 浏览器只发了 cookie，而到这里必须变成 Authorization。
    if (!auth?.startsWith('Bearer ')) {
      return json({ success: false, code: 401, error: '未授权访问' }, 401)
    }

    if (url.pathname === '/api/profile') {
      return json({
        success: true, code: 200,
        data: {
          user_id: 'e2e', user_nickname: 'E2E 用户', user_email: 'e2e@example.com',
          user_signature: null, user_avatar_url: 'avatars/e2e.png', background_url: null,
          gender: null, birthday: null, region: null, admin: 'false',
          allow_search: true, search_visible_by_id: true,
          friend_request_policy: 'manual', group_invite_policy: 'manual',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      })
    }

    if (url.pathname === '/api/friends') return json({ success: true, code: 200, data: [] })
    if (url.pathname === '/api/friends/requests/pending') return json({ success: true, code: 200, data: [] })
    if (url.pathname === '/api/friends/requests/sent') return json({ success: true, code: 200, data: [] })
    if (url.pathname === '/api/groups/my') return json({ success: true, code: 200, data: [] })

    return json({ success: false, code: 404, error: `假后端未实现 ${url.pathname}` }, 404)
  },
  websocket: {
    open(ws) {
      ws.send(JSON.stringify({ type: 'hello', from: 'fake-backend' }))
    },
    message(ws, message) {
      ws.send(message as string)
    },
  },
})

console.warn(`fake backend listening on :${PORT}`)
