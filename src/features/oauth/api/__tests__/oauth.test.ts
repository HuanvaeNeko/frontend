import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiShapeError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { oauthApi, parseAuthorizeResult, parseOAuthClient, parseOAuthGrant, scopeLabelKey } from '../oauth'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const CLIENT = { client_id: 'c1', client_type: 'external', app_name: 'My App', app_description: '', app_homepage_url: null, app_logo_url: 'apps/c1/logo.png', redirect_uris: ['https://example.com/cb'], allowed_scopes: ['profile', 'email'], is_active: true, created_at: '2026-09-01T00:00:00Z' }
const GRANT = { id: 'g1', client_id: 'c1', app_name: 'My App', app_logo_url: null, scope: 'profile email', created_at: '2026-09-01T00:00:00Z' }

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); setApiShapeErrorReporter(() => {}) })
afterEach(() => vi.unstubAllGlobals())

describe('解析器', () => {
  it('parseOAuthClient：空描述允许，logo 相对路径落成同源绝对地址，站外 logo → null', () => {
    const c = parseOAuthClient(CLIENT)
    expect(c).toEqual({ ...CLIENT, app_logo_url: `${location.origin}/apps/c1/logo.png` })
    expect(parseOAuthClient({ ...CLIENT, app_logo_url: 'https://evil.example/x.png' }).app_logo_url).toBeNull()
    expect(parseOAuthClient({ ...CLIENT, app_homepage_url: 'https://example.com' }).app_homepage_url).toBe('https://example.com')
  })
  it('parseOAuthClient：缺 client_id / redirect_uris 不是数组 / is_active 不是布尔 → 抛', () => {
    expect(() => parseOAuthClient({ ...CLIENT, client_id: '' })).toThrow(/client_id/)
    expect(() => parseOAuthClient({ ...CLIENT, redirect_uris: 'x' })).toThrow(/redirect_uris/)
    expect(() => parseOAuthClient({ ...CLIENT, is_active: 'yes' })).toThrow(/is_active/)
  })
  // 修复第 1 轮 Important #1：redirect_uris / allowed_scopes 之前是「是数组」就放行，数组内脏元素
  // 被 filter 悄悄丢掉——这是没人测过的组合（已有用例只测过"整个字段不是数组"）。现在元素类型
  // 不对必须抛，且不能连带把合法输入也一起挡掉（正对照）。
  it('parseOAuthClient：redirect_uris / allowed_scopes 数组内元素类型不对 → 抛（不再静默 filter 丢弃）；正对照：全是字符串照常通过', () => {
    expect(() => parseOAuthClient({ ...CLIENT, redirect_uris: [null, 42] })).toThrow(/redirect_uris/)
    expect(() => parseOAuthClient({ ...CLIENT, allowed_scopes: ['profile', 42] })).toThrow(/allowed_scopes/)
    expect(parseOAuthClient(CLIENT).redirect_uris).toEqual(['https://example.com/cb'])
    expect(parseOAuthClient(CLIENT).allowed_scopes).toEqual(['profile', 'email'])
  })
  // 修复第 1 轮 Important #2：同源门禁是刻意的隐私取舍，不是"抄小程序规则的副作用"——
  // backend-docs oauth/OAuth授权服务器API.md 自己的示例就是这个站外地址，外部客户端的 logo
  // 按契约设计本来就是站外的，这里落空退化成首字母头像是预期行为，不是 bug。
  it('parseOAuthClient：站外 logo → null 是刻意的隐私取舍（契约文档 app_logo_url 示例本身就是站外地址），不是 bug；正对照：同源相对路径正常解析', () => {
    expect(parseOAuthClient({ ...CLIENT, app_logo_url: 'https://example.com/logo.png' }).app_logo_url).toBeNull()
    expect(parseOAuthClient({ ...CLIENT, app_logo_url: 'avatars/x.png' }).app_logo_url).toBe(`${location.origin}/avatars/x.png`)
  })
  it('parseOAuthGrant：六个字段；缺 id 抛；站外 logo → null（与 client 同款同源校验）', () => {
    expect(parseOAuthGrant(GRANT)).toEqual(GRANT)
    expect(() => parseOAuthGrant({ ...GRANT, id: undefined })).toThrow(/id/)
    expect(parseOAuthGrant({ ...GRANT, app_logo_url: 'https://evil.example/x.png' }).app_logo_url).toBeNull()
  })
  it('parseOAuthGrant：站外 logo → null 同样是刻意的隐私取舍，不是 bug（同 parseOAuthClient）；正对照：同源相对路径正常解析', () => {
    expect(parseOAuthGrant({ ...GRANT, app_logo_url: 'https://example.com/logo.png' }).app_logo_url).toBeNull()
    expect(parseOAuthGrant({ ...GRANT, app_logo_url: 'avatars/x.png' }).app_logo_url).toBe(`${location.origin}/avatars/x.png`)
  })
  it('parseAuthorizeResult：consent_required → kind consent；否则 kind code（state 可为 null）', () => {
    expect(parseAuthorizeResult({ consent_required: true, app_name: 'X', app_logo_url: null, scopes: ['profile'] })).toEqual({ kind: 'consent', app_name: 'X', app_logo_url: null, scopes: ['profile'] })
    expect(parseAuthorizeResult({ code: 'abc', state: null, redirect_uri: 'https://example.com/cb' })).toEqual({ kind: 'code', code: 'abc', state: null, redirect_uri: 'https://example.com/cb' })
    expect(parseAuthorizeResult({ code: 'abc', state: 's1', redirect_uri: '/apps/x/cb' })).toEqual({ kind: 'code', code: 'abc', state: 's1', redirect_uri: '/apps/x/cb' })
    expect(() => parseAuthorizeResult({ code: 'abc', state: null })).toThrow(/redirect_uri/)
  })
  // 修复第 2 轮：复审指出 parseOAuthClient / parseOAuthGrant / parseAuthorizeResult 的
  // app_logo_url 此前是三行各自独立的表达式，"逻辑一致"只是巧合——consent 分支完全没有
  // 用例覆盖过。现在三者共用 sameOriginLogo，这条补上此前缺失的覆盖。
  it('parseAuthorizeResult：consent 分支站外 logo → null 同样是刻意的隐私取舍，不是 bug（同 parseOAuthClient / parseOAuthGrant）；正对照：同源相对路径正常解析', () => {
    expect(parseAuthorizeResult({ consent_required: true, app_name: 'X', app_logo_url: 'https://example.com/logo.png', scopes: ['profile'] })).toEqual({ kind: 'consent', app_name: 'X', app_logo_url: null, scopes: ['profile'] })
    expect(parseAuthorizeResult({ consent_required: true, app_name: 'X', app_logo_url: 'avatars/x.png', scopes: ['profile'] })).toEqual({ kind: 'consent', app_name: 'X', app_logo_url: `${location.origin}/avatars/x.png`, scopes: ['profile'] })
  })
  it('parseAuthorizeResult：consent 分支 scopes 数组内元素类型不对 → 抛；正对照：全是字符串照常通过', () => {
    expect(() => parseAuthorizeResult({ consent_required: true, app_name: 'X', app_logo_url: null, scopes: ['profile', 42] })).toThrow(/scopes/)
    expect(parseAuthorizeResult({ consent_required: true, app_name: 'X', app_logo_url: null, scopes: ['profile'] })).toEqual({ kind: 'consent', app_name: 'X', app_logo_url: null, scopes: ['profile'] })
  })
  it('scopeLabelKey：四个已知 scope 映射到 shell.oauth.scopes.*，未知 scope 原样返回', () => {
    expect(scopeLabelKey('profile')).toBe('shell.oauth.scopes.profile')
    expect(scopeLabelKey('groups')).toBe('shell.oauth.scopes.groups')
    expect(scopeLabelKey('wallet')).toBe('wallet')
  })
})

describe('oauthApi 请求形状', () => {
  // 修复第 1 轮 Important #1：确认 stringArray 抛出的是能被 readEnvelope 的 validatePayload
  // 接住、转成 ApiShapeError 并走 [api-shape] 上报链路的错误，而不是一个逃逸出去的裸 Error。
  it('listClients：行内数组元素类型不对时抛 ApiShapeError（strict 解析经 readEnvelope 接住）', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [{ ...CLIENT, redirect_uris: ['https://example.com/cb', 42] }] }))
    await expect(oauthApi.listClients()).rejects.toBeInstanceOf(ApiShapeError)
  })
  it('listGrants：GET /api/oauth/grants，data 数组', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [GRANT] }))
    expect(await oauthApi.listGrants()).toEqual([GRANT])
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/grants')
  })
  it('listGrants：行缺字段抛 ApiShapeError', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [{ ...GRANT, app_name: undefined }] }))
    await expect(oauthApi.listGrants()).rejects.toBeInstanceOf(ApiShapeError)
  })
  it('revokeGrant：DELETE /api/oauth/grants/{id}（id 编码）', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, message: 'ok' }))
    await oauthApi.revokeGrant('g 1')
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/grants/g%201')
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  })
  it('createClient：POST body 原样（可选字段缺席时不发 undefined 键）', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: { client_id: 'c2', client_secret: 'sec', app_name: 'New' } }))
    const res = await oauthApi.createClient({ app_name: 'New', redirect_uris: ['https://a.b/cb'], scopes: ['profile'] })
    expect(res).toEqual({ client_id: 'c2', client_secret: 'sec', app_name: 'New' })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/clients')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ app_name: 'New', redirect_uris: ['https://a.b/cb'], scopes: ['profile'] })
  })
  it('resetClientSecret：POST /api/oauth/clients/{id}/reset-secret → { client_secret }', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: { client_secret: 'new' } }))
    expect(await oauthApi.resetClientSecret('c1')).toEqual({ client_secret: 'new' })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/clients/c1/reset-secret')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })
  it('deleteClient：DELETE /api/oauth/clients/{id}', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, message: 'ok' }))
    await oauthApi.deleteClient('c1')
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/clients/c1')
  })
  it('authorize：POST /api/oauth/authorize；consent:true 只在传了时出现；HTTP 400 透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: { consent_required: true, app_name: 'X', app_logo_url: null, scopes: ['profile'] } }))
    const first = await oauthApi.authorize({ client_id: 'c1', redirect_uri: 'https://example.com/cb', scope: 'profile', state: 's' })
    expect(first.kind).toBe('consent')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ client_id: 'c1', redirect_uri: 'https://example.com/cb', scope: 'profile', state: 's' })
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: { code: 'abc', state: 's', redirect_uri: 'https://example.com/cb' } }))
    const second = await oauthApi.authorize({ client_id: 'c1', redirect_uri: 'https://example.com/cb', scope: 'profile', state: 's', consent: true })
    expect(second).toEqual({ kind: 'code', code: 'abc', state: 's', redirect_uri: 'https://example.com/cb' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).consent).toBe(true)
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 400, error: 'redirect_uri 未注册' }, 400))
    await expect(oauthApi.authorize({ client_id: 'c1', redirect_uri: 'https://x.y/cb' })).rejects.toThrow(/redirect_uri 未注册/)
  })
})
