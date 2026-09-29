import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { messages } from '@/i18n/messages'
import Register from '../RegisterForm'

/**
 * 注册表单的校验报错要说「哪里错了」，而不是把占位符再念一遍。
 *
 * 原 zod schema 直接拿占位符 key 当报错：昵称为空报「显示名称」、邮箱为空报
 * 「your@email.com」、没勾协议报的是勾选框自己的文案——看起来像是提示没加载出来。
 *
 * t 用真实 zh-CN 文案解析（identity mock 看不见文案本身，见 i18n 覆盖测试的注释）。
 * 断言语义而非逐字：报错 ≠ 占位符，且点名了是哪一项。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return value.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? `{${k}}`))
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})
vi.mock('@/hooks/useSound', () => ({ playButton: vi.fn(), playTap: vi.fn(), playSuccess: vi.fn(), playError: vi.fn(), warmupSound: vi.fn() }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }))

const zh = messages['zh-CN'].auth.register

function renderRegister() {
  const router = createMemoryRouter([{ path: '/app/register', element: <Register /> }], { initialEntries: ['/app/register'] })
  render(<RouterProvider router={router} />)
}

/** 某个表单项下面的报错文字（FormMessage 渲染在同一个 FormItem 里） */
function errorUnder(label: string): string | null {
  const input = screen.getByLabelText(label)
  const item = input.closest('[data-slot="form-item"]') ?? input.parentElement?.parentElement?.parentElement
  const msg = item?.querySelector('[data-slot="form-message"]')
  return msg?.textContent ?? null
}

const { register: realRegister, login: realLogin } = useAuthStore.getState()

beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isRestoring: false, error: null, register: realRegister, login: realLogin })
  toast.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RegisterForm 校验报错', () => {
  it('空表单提交：每项报错都点名问题，而不是复读占位符', async () => {
    renderRegister()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.submit) }))

    await waitFor(() => expect(errorUnder(zh.userId)).toBeTruthy())

    const userIdError = errorUnder(zh.userId)
    const nicknameError = errorUnder(zh.nickname)
    const emailError = errorUnder(zh.email)

    expect(userIdError).not.toBe(zh.userIdPlaceholder)
    expect(userIdError).toMatch(/用户\s*ID/)
    expect(nicknameError).not.toBe(zh.nicknamePlaceholder)
    expect(nicknameError).toMatch(/昵称/)
    expect(emailError).not.toBe(zh.emailPlaceholder)
    expect(emailError).toMatch(/邮箱/)
  })

  it('没勾选协议：报错不是勾选框自己的文案', async () => {
    renderRegister()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.submit) }))

    // 勾选框标签本身就含「同意」且一直在页面上：要等到出现**另一句**含「同意」的报错
    await waitFor(() => {
      const texts = screen.getAllByText(/同意/).map((el) => el.textContent)
      expect(texts.filter((t) => t !== zh.agreeTerms).length).toBeGreaterThan(0)
    })
  })
})

function renderRegisterInApp() {
  const router = createMemoryRouter([
    { path: '/app/register', element: <Register /> },
    { path: '/app/chat', element: <p>CHAT</p> },
    { path: '/app/login', element: <p>LOGIN</p> },
  ], { initialEntries: ['/app/register'] })
  render(<RouterProvider router={router} />)
  return router
}

async function fillValidForm(password = 'abc12345') {
  fireEvent.change(await screen.findByLabelText(zh.userId), { target: { value: 'newbie' } })
  fireEvent.change(screen.getByLabelText(zh.nickname), { target: { value: '新人' } })
  fireEvent.change(screen.getByLabelText(zh.email), { target: { value: 'newbie@example.com' } })
  fireEvent.change(screen.getByLabelText(zh.password), { target: { value: password } })
  fireEvent.change(screen.getByLabelText(zh.confirmPassword), { target: { value: password } })
  fireEvent.click(screen.getByRole('checkbox'))
}

describe('RegisterForm —— 已登录 / 注册成功之后去哪', () => {
  it('已登录的人打开注册页：直接送回应用（/app/chat），不再让他以另一个身份再注册', async () => {
    useAuthStore.setState({ user: { user_id: 'alice' } as never, isAuthenticated: true })
    const router = renderRegisterInApp()
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/chat'))
  })

  it('正对照：未登录时停在注册页，表单可见', async () => {
    const router = renderRegisterInApp()
    expect(await screen.findByRole('button', { name: new RegExp(zh.submit) })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app/register')
  })

  it('注册成功后用同一组账号密码自动登录再进应用（同 APP App.tsx handleRegister）；原来被扔回一个空白登录页', async () => {
    const register = vi.fn(async () => {})
    const login = vi.fn(async () => { useAuthStore.setState({ isAuthenticated: true }) })
    useAuthStore.setState({ register, login })
    const router = renderRegisterInApp()

    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.submit) }))

    await waitFor(() => expect(login).toHaveBeenCalledWith({ user_id: 'newbie', password: 'abc12345' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/chat'))
  })

  it('注册成功但自动登录失败：去登录页，并提示注册已经成功（不能让人以为没注册上）', async () => {
    useAuthStore.setState({ register: vi.fn(async () => {}), login: vi.fn(async () => { throw new Error('网络错误') }) })
    const router = renderRegisterInApp()

    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.submit) }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/login'))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/注册成功/) }))
  })
})

describe('RegisterForm 密码规则跟随后端：6–100 个字符、不限字符种类（profile/个人资料管理.md:305-306；APP useRegisterForm 同样只要求 ≥ 6）', () => {
  it('6 位纯字母可以注册（原来要求至少 8 位且必须含字母和数字）', async () => {
    const register = vi.fn(async () => {})
    useAuthStore.setState({ register, login: vi.fn(async () => { useAuthStore.setState({ isAuthenticated: true }) }) })
    renderRegisterInApp()

    await fillValidForm('abcdef')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.submit) }))

    await waitFor(() => expect(register).toHaveBeenCalledWith(expect.objectContaining({ password: 'abcdef' })))
  })

  it.each([['5 位', 'abc12'], ['101 位', 'a'.repeat(101)]])('%s：报长度错误并说清 6–100，不提交', async (_label, password) => {
    const register = vi.fn(async () => {})
    useAuthStore.setState({ register })
    renderRegisterInApp()

    await fillValidForm(password)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.submit) }))

    await waitFor(() => expect(errorUnder(zh.password)).toBeTruthy())
    expect(errorUnder(zh.password)).toMatch(/6/)
    expect(errorUnder(zh.password)).toMatch(/100/)
    expect(register).not.toHaveBeenCalled()
  })

  it('强度提示只列硬性要求（长度），不再把「包含字母 / 包含数字」列成必须项', async () => {
    renderRegisterInApp()
    fireEvent.change(await screen.findByLabelText(zh.password), { target: { value: 'abcdef' } })
    // 正对照：强度提示确实渲染出来了
    expect(screen.getByText(messages['zh-CN'].common.passwordStrength)).toBeInTheDocument()
    expect(screen.queryByText(/包含字母|包含数字/)).toBeNull()
  })
})
