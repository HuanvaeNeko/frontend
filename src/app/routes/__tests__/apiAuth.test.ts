// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_NAME, resetSessionStore } from '../../../../server/session'
import { action as loginAction } from '../api.auth.login'
import { action as logoutAction } from '../api.auth.logout'
import { action as registerAction } from '../api.auth.register'
import { loader as sessionLoader } from '../api.session'

const LOGIN_OK = {
  success: true,
  code: 200,
  data: {
    access_token: 'AT1', refresh_token: 'RT1', expires_in: 900,
    user_nickname: '爱丽丝', user_email: 'a@x.com', user_avatar_url: 'avatars/a.png',
  },
}

function req(url: string, init?: RequestInit & { cookie?: string }): Request {
  const headers = new Headers(init?.headers)
  if (init?.cookie) headers.set('cookie', init.cookie)
  return new Request(url, { ...init, headers })
}

function sessionIdFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? ''
  const m = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookie)
  if (!m || m[1] === '') throw new Error(`响应没有设置会话 cookie：${setCookie}`)
  return m[1]
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  process.env.BFF_UPSTREAM_HTTP = 'http://upstream.test'
  process.env.SESSION_DB_PATH = ':memory:'
  process.env.SESSION_COOKIE_SECURE = 'false'
  resetSessionStore()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// 下面每处调用都带 `url`/`pattern` 占位值:安装的 react-router 8.3 给
// ActionFunctionArgs/LoaderFunctionArgs 加了这两个必填字段,但四个路由模块都只解构
// `{ request }`,不读它们——占位值给什么都不影响被测行为,只是让调用点类型对齐。
describe('BFF 登录 / 登出 / 会话查询', () => {
  it('登录成功：设 httpOnly cookie，响应体里没有任何 token', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))

    const res = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'probe/1.0' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('HttpOnly')

    const body = await res.text()
    // 这是本设计的核心断言：token 绝不能出现在给浏览器的响应里
    expect(body).not.toContain('AT1')
    expect(body).not.toContain('RT1')
    // 正对照：用户字段确实回来了，证明不是「整个 body 都空所以当然没有 token」
    expect(body).toContain('爱丽丝')
  })

  it('登录把 device_info 填成请求的 User-Agent', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))

    await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'probe/1.0' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as Record<string, unknown>
    expect(sent.device_info).toBe('probe/1.0')
    expect(sent.user_id).toBe('alice')
  })

  it('登录失败：原样透传后端文案与状态码，不设 cookie', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: false, code: 401, error: '用户名或密码错误' }, 401))

    const res = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'bad' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    expect(res.status).toBe(401)
    expect(await res.text()).toContain('用户名或密码错误')
    expect(res.headers.get('set-cookie')).toBe(null)
  })

  it('登录响应缺 expires_in：不建会话，回 502，不设 cookie', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, code: 200, data: { access_token: 'AT1', refresh_token: 'RT1' } }))

    const res = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    expect(res.status).toBe(502)
    expect(res.headers.get('set-cookie')).toBe(null)
  })

  // Step 7 变异第 3 行的空档:parseLogin 删掉 refresh_token 校验后,原「缺 expires_in」
  // 那条钉不住(它缺的是 expires_in),必须单独一条钉住 refresh_token 校验本身。
  it('登录响应缺 refresh_token 时回 502 不建会话', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, code: 200, data: { access_token: 'AT1', expires_in: 900 } }))

    const res = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    expect(res.status).toBe(502)
    expect(res.headers.get('set-cookie')).toBe(null)
  })

  it('GET /api/session：有效会话回用户字段', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))
    const login = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })
    const id = sessionIdFrom(login)

    const res = await sessionLoader({
      request: req('http://app.test/api/session', { cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { user: { user_id: string; nickname?: string } } }
    expect(body.data.user.user_id).toBe('alice')
    expect(body.data.user.nickname).toBe('爱丽丝')
  })

  it('GET /api/session：没有 cookie 回 401 并清 cookie', async () => {
    const res = await sessionLoader({
      request: req('http://app.test/api/session'), params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('GET /api/session：cookie 指向不存在的会话，回 401 并清 cookie', async () => {
    const res = await sessionLoader({
      request: req('http://app.test/api/session', { cookie: `${SESSION_COOKIE_NAME}=nope` }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('登出：打上游 logout、删会话、清 cookie', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))
    const login = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })
    const id = sessionIdFrom(login)

    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, code: 200 }))
    const res = await logoutAction({
      request: req('http://app.test/api/auth/logout', { method: 'POST', cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    // 上游确实被打了（第 2 次 fetch）
    expect(fetchMock.mock.calls[1][0]).toBe('http://upstream.test/api/auth/logout')

    // 会话真的没了：再查 session 应当 401
    const after = await sessionLoader({
      request: req('http://app.test/api/session', { cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })
    expect(after.status).toBe(401)
  })

  it('登出：上游失败也照样删会话、清 cookie（本地登出不能被后端拖住）', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(LOGIN_OK))
    const login = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })
    const id = sessionIdFrom(login)

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const res = await logoutAction({
      request: req('http://app.test/api/auth/logout', { method: 'POST', cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    const after = await sessionLoader({
      request: req('http://app.test/api/session', { cookie: `${SESSION_COOKIE_NAME}=${id}` }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })
    expect(after.status).toBe(401)
  })

  it('跨站 POST 登录被拒（CSRF 第二道）', async () => {
    const res = await loginAction({
      request: req('http://app.test/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
        body: JSON.stringify({ user_id: 'alice', password: 'p' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    // 正对照：同源的同一请求会真的打上游（见「登录成功」那条）
  })
})

describe('BFF 注册转发', () => {
  it('未登录也能注册——不查会话、原样转发', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true, code: 200, data: { user_id: 'newbie' } }))

    const res = await registerAction({
      // 刻意**不带** cookie：这就是本条要证明的事
      request: req('http://app.test/api/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'newbie', nickname: '新人', email: 'n@x.com', password: 'p' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toBe('http://upstream.test/api/auth/register')
    // 注册不建会话：后端注册接口不返回 token，前端仍要走一次登录
    expect(res.headers.get('set-cookie')).toBe(null)
  })

  it('注册失败原样透传后端文案', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: false, code: 400, error: '用户 ID 已存在' }, 400))

    const res = await registerAction({
      request: req('http://app.test/api/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: 'taken' }),
      }),
      params: {}, context: {} as never, url: new URL('http://app.test/'), pattern: '',
    })

    expect(res.status).toBe(400)
    expect(await res.text()).toContain('用户 ID 已存在')
  })
})
