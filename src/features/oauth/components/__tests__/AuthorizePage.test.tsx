import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { oauthApi } from '../../api/oauth'
import { browserNav } from '../../lib/redirect'
import AuthorizePage from '../AuthorizePage'

vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return params ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : value
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

// vitest.setup.ts 的 afterEach(cleanup) 只在用例之间生效；这里同一条用例内两次 mount()
// （见「拒绝」用例）必须自己先清场，否则前一次渲染残留在 document.body 里，
// 后一次的 getByText / getByRole 会同时命中两棵树而报「找到多个元素」。
const mount = (query: string) => {
  cleanup()
  return render(<RouterProvider router={createMemoryRouter([{ path: '/app/oauth/authorize', element: <AuthorizePage /> }, { path: '/app/chat', element: <div>聊天</div> }], { initialEntries: [`/app/oauth/authorize${query}`] })} />)
}
const BASE = '?client_id=c1&redirect_uri=https%3A%2F%2Fquery.example%2Fcb&scope=profile%20email&state=s1'

// 类型从这个带显式参数类型的初始化器推出（同 appShellLayout.test.tsx 的写法）：裸 `vi.fn()`
// 落到 `Mock<Procedure | Constructable>`，跟 browserNav.assign 的 `(href: string) => void`
// 对不上，`mockImplementation(assign)` 会被 tsc 拒绝。
let assign = vi.fn((_href: string) => {})
beforeEach(() => { assign = vi.fn((_href: string) => {}); vi.spyOn(browserNav, 'assign').mockImplementation(assign) })
afterEach(() => vi.restoreAllMocks())

describe('/app/oauth/authorize', () => {
  it('缺 client_id：错误页，不调后端也不跳转', () => {
    const authorize = vi.spyOn(oauthApi, 'authorize')
    mount('?redirect_uri=https%3A%2F%2Fx.y%2Fcb')
    expect(screen.getByText('无效的授权请求')).toBeInTheDocument()
    expect(authorize).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })
  it('只给 code_challenge 不给 method：错误页（正对照：两个都给时进请求体）', async () => {
    const authorize = vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'code', code: 'abc', state: 's1', redirect_uri: 'https://backend.example/cb' })
    mount(`${BASE}&code_challenge=xyz`)
    expect(screen.getByText('无效的授权请求')).toBeInTheDocument()
    expect(authorize).not.toHaveBeenCalled()
    mount(`${BASE}&code_challenge=xyz&code_challenge_method=S256`)
    await waitFor(() => expect(authorize).toHaveBeenCalledWith({ client_id: 'c1', redirect_uri: 'https://query.example/cb', scope: 'profile email', state: 's1', code_challenge: 'xyz', code_challenge_method: 'S256' }))
  })
  // 修复第 2 轮 Important：PKCE 成对校验是两个独立子条款——「给了 method 必须也给 challenge」
  // 和「method 只认 S256」。旧测试只覆盖了“只给 challenge 不给 method”和“两个都给且为 S256”，
  // 对这两条镜像/独立分支零覆盖：把成对校验改成单向判断、或者整段删掉 method 白名单校验，
  // 之前的用例都测不出来（审阅者实测过，两组变异 7/7 全绿）。下面两条分别单独钉住它们。
  it('只给 code_challenge_method 不给 code_challenge：错误页（PKCE 成对校验的镜像方向）', () => {
    const authorize = vi.spyOn(oauthApi, 'authorize')
    mount(`${BASE}&code_challenge_method=S256`)
    expect(screen.getByText('无效的授权请求')).toBeInTheDocument()
    expect(authorize).not.toHaveBeenCalled()
  })
  it('code_challenge_method 不是 S256（如 plain）：错误页', () => {
    const authorize = vi.spyOn(oauthApi, 'authorize')
    mount(`${BASE}&code_challenge=xyz&code_challenge_method=plain`)
    expect(screen.getByText('无效的授权请求')).toBeInTheDocument()
    expect(authorize).not.toHaveBeenCalled()
  })
  it('内部客户端：首次请求就拿到 code，跳到**后端回传**的 redirect_uri（不是 query 里的）', async () => {
    vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'code', code: 'abc', state: 's1', redirect_uri: 'https://backend.example/cb' })
    mount(BASE)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://backend.example/cb?code=abc&state=s1'))
    expect(screen.getByText('授权成功，正在跳转…')).toBeInTheDocument()
  })
  it('scope 缺省为 profile；state 为 null 时不拼；相对 redirect_uri 落成同源绝对地址', async () => {
    const authorize = vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'code', code: 'abc', state: null, redirect_uri: '/apps/x/cb' })
    mount('?client_id=c1&redirect_uri=%2Fapps%2Fx%2Fcb')
    await waitFor(() => expect(assign).toHaveBeenCalledWith(`${location.origin}/apps/x/cb?code=abc`))
    expect(authorize).toHaveBeenCalledWith({ client_id: 'c1', redirect_uri: '/apps/x/cb', scope: 'profile' })
  })
  it('外部客户端首次：显示应用名与权限说明；「允许」带 consent:true 再请求并跳转', async () => {
    const authorize = vi.spyOn(oauthApi, 'authorize')
      .mockResolvedValueOnce({ kind: 'consent', app_name: 'Ext App', app_logo_url: null, scopes: ['profile', 'email'] })
      .mockResolvedValueOnce({ kind: 'code', code: 'zzz', state: 's1', redirect_uri: 'https://backend.example/cb' })
    mount(BASE)
    expect(await screen.findByText('Ext App 请求访问你的账户')).toBeInTheDocument()
    expect(screen.getByText('基本资料')).toBeInTheDocument()
    expect(screen.getByText('昵称和头像')).toBeInTheDocument()
    expect(screen.getByText('邮箱')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '允许' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://backend.example/cb?code=zzz&state=s1'))
    expect(authorize.mock.calls[1][0]).toEqual({ client_id: 'c1', redirect_uri: 'https://query.example/cb', scope: 'profile email', state: 's1', consent: true })
  })
  it('「拒绝」：query 的 redirect_uri 合法 → 跳 error=access_denied（带 state）；不合法 → 只显示已拒绝', async () => {
    vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'consent', app_name: 'Ext App', app_logo_url: null, scopes: ['profile'] })
    mount(BASE)
    fireEvent.click(await screen.findByRole('button', { name: '拒绝' }))
    expect(assign).toHaveBeenCalledWith('https://query.example/cb?error=access_denied&state=s1')
    assign.mockClear()
    mount('?client_id=c1&redirect_uri=query.example%2Fcb')
    fireEvent.click(await screen.findByRole('button', { name: '拒绝' }))
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByText('已拒绝授权')).toBeInTheDocument()
    expect(screen.getByText('回调地址不合法，未跳转')).toBeInTheDocument()
  })
  it('「拒绝」：redirect_uri 用 tab 走私成协议相对地址（%2F%09%2Fevil.example%2Fcb）时不跳转，只显示已拒绝 + 回调地址不合法（修复第 2 轮 Critical 回归用例）', async () => {
    vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'consent', app_name: 'Ext App', app_logo_url: null, scopes: ['profile'] })
    mount('?client_id=c1&redirect_uri=%2F%09%2Fevil.example%2Fcb')
    fireEvent.click(await screen.findByRole('button', { name: '拒绝' }))
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByText('已拒绝授权')).toBeInTheDocument()
    expect(screen.getByText('回调地址不合法，未跳转')).toBeInTheDocument()
  })
  it('后端 400：显示后端文案 + 返回聊天链接；不跳转', async () => {
    vi.spyOn(oauthApi, 'authorize').mockRejectedValue(new Error('redirect_uri 未注册'))
    mount(BASE)
    expect(await screen.findByRole('alert')).toHaveTextContent('redirect_uri 未注册')
    expect(screen.getByRole('link', { name: '返回聊天' })).toHaveAttribute('href', '/app/chat')
    expect(assign).not.toHaveBeenCalled()
  })
})
