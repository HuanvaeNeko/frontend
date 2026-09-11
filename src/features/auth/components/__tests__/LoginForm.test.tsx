import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { DEFAULT_AUTHENTICATED_ROUTE } from '@/lib/routes'
import Login from '../LoginForm'

/**
 * 终审 C1：`?next=` 开放重定向。
 *
 * 旧实现 `nextPath && nextPath.startsWith('/') ? nextPath : DEFAULT_AUTHENTICATED_ROUTE`
 * 只用字符串前缀猜"是不是站内路径"，是本期 Task 6 被判 Critical 的旧版
 * `isValidRedirectUri` 的逐字同款：既不排除 `//evil.example/phish` 这种协议相对地址，
 * 也不挡 `/\t/evil.example/phish`、`/\evil.example/phish` 这类控制字符 / 反斜杠走私
 * （喂给 `new URL()` 时被解析成跨源地址）。真正可利用的是登录成功那一刻
 * （`handleSubmit` 里的 `router.push`）——下面的 it.each 直接打这条路径。
 *
 * 断言刻意落在 **最终路径**（`router.state.location.pathname`）而不是"函数被调用"：
 * `createMemoryRouter` 对畸形/跨源字符串的 `navigate()` 是原地不动（不会像真实浏览器
 * 那样真的跳出站外），所以"值有没有被 safeNext 净化"在这里表现为"到底有没有导航成功"——
 * 净化过的合法路径会真的落地，没净化的畸形字符串会卡在原地。这个可观察的差异就是
 * 变异校验能抓住回归的原因：把 safeNext 改回 startsWith('/') 版本，三条恶意用例会因为
 * "根本没到 /app/chat" 而变红。
 */

vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

const renderLogin = (query: string) => {
  const router = createMemoryRouter(
    [
      { path: '/app/login', element: <Login /> },
      { path: '/app/chat', element: <div>聊天</div> },
      { path: '/app/oauth/authorize', element: <div>授权页</div> },
    ],
    { initialEntries: [`/app/login${query}`] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const submitLogin = () => {
  fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value: 'alice' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw123456' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ user: null, isAuthenticated: false, isRestoring: false, error: null })
  fetchMock = vi.fn().mockResolvedValue(ok({ success: true, code: 200, data: { user: { user_id: 'alice' } } }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LoginForm —— 登录成功后 next 回跳只认同源（handleSubmit → router.push）', () => {
  it.each([
    ['//evil.example/phish', '协议相对地址'],
    ['/\t/evil.example/phish', '控制字符走私（tab）'],
    ['/\\evil.example/phish', '反斜杠走私'],
  ])('next=%j（%s）：登录成功后落到 DEFAULT_AUTHENTICATED_ROUTE，不出站', async (nextValue) => {
    const router = renderLogin(`?next=${encodeURIComponent(nextValue)}`)
    submitLogin()
    await waitFor(() => expect(router.state.location.pathname).toBe(DEFAULT_AUTHENTICATED_ROUTE))
    expect(router.state.location.pathname).toBe('/app/chat')
  })

  it('正对照：合法的站内 next 登录成功后正常回跳', async () => {
    const router = renderLogin('?next=%2Fapp%2Foauth%2Fauthorize%3Fx%3D1')
    submitLogin()
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/oauth/authorize'))
    expect(router.state.location.search).toBe('?x=1')
  })
})

describe('LoginForm —— 挂载时已登录（next 回跳的另一处调用点：router.replace）', () => {
  it('恶意 next 时挂载即已登录：同样落到 DEFAULT_AUTHENTICATED_ROUTE，不出站', async () => {
    await useAuthStore.persist.rehydrate()
    useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })
    const router = renderLogin('?next=%2F%2Fevil.example%2Fphish')
    await waitFor(() => expect(router.state.location.pathname).toBe(DEFAULT_AUTHENTICATED_ROUTE))
  })
})
