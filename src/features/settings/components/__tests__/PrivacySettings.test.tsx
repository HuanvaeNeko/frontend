import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
import { makeProfileWire } from '@/features/profile/api/__tests__/profileFixture'
import { profileApi, type UserProfile } from '@/features/profile/api/profile'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { I18nProvider } from '@/i18n/I18nProvider'
import PrivacySettings from '../PrivacySettings'
import SettingsPage from '../SettingsPage'

/**
 * 隐私四项（`个人资料管理.md:104-107` 读侧、:144-147 写侧）。
 *
 * 这一块是本批"严格解析"的收益方：`allow_search` 等四个字段在 `profileApi` 里走的是
 * **会抛错**的校验档，而代价（后端少给字段就整页报错）只有在有人真的读它们时才划算。
 * 所以这份用例既验接线，也顺带证明了那一档不是空谈。
 *
 * 断言一律落在 **wire 上**（PUT 的请求体）而不是"函数被调用了"：本批要修的缺陷
 * 恰恰是"UI 调了、字段没发出去"，只断言调用等于把缺陷本身测成通过。
 */

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

const PROFILE_BASE = `${getApiBaseUrl()}/api/profile`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

/** GET 返回给定 wire 形状；PUT 一律成功。 */
const mockBackend = (wire: Record<string, unknown>, putResponse = json({ message: 'ok' })) => {
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
      return json({ success: true, code: 200, data: wire })
    }
    if (url === PROFILE_BASE && init?.method === 'PUT') return putResponse
    throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
  })
}

const putBodies = (): unknown[] =>
  fetchMock.mock.calls
    .filter((call: unknown[]) => (call[1] as RequestInit | undefined)?.method === 'PUT')
    .map((call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)))

const switchByLabel = (label: string) => screen.getByRole('switch', { name: label })

beforeEach(() => {
  localStorage.clear()
  toastMock.mockClear()
  useAuthStore.setState({
    accessToken: 'AT',
    // 置空：本文件不测刷新流程，留着会在 401 分支多打一次 /refresh。
    refreshToken: null,
    isAuthenticated: true,
    tokenExpiry: Date.now() + 3600_000,
  })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PrivacySettings 渲染', () => {
  it('开关取值来自后端，不是硬编码的默认值', async () => {
    // 两个开关给**相反**的值：都写 true 的话，一个恒返回 true 的实现也能绿。
    mockBackend(makeProfileWire({ allow_search: false, search_visible_by_id: true }))

    render(<PrivacySettings />)

    await waitFor(() => expect(switchByLabel('允许被搜索')).toBeTruthy())
    expect(switchByLabel('允许被搜索').getAttribute('aria-checked')).toBe('false')
    expect(switchByLabel('允许通过用户 ID 被搜索').getAttribute('aria-checked')).toBe('true')
  })

  it('总开关关掉时，"通过用户 ID 被搜索"跟着禁用（doc:104「完全不可被搜索/添加」）', async () => {
    mockBackend(makeProfileWire({ allow_search: false }))

    render(<PrivacySettings />)

    await waitFor(() => expect(switchByLabel('允许被搜索')).toBeTruthy())
    expect(switchByLabel('允许通过用户 ID 被搜索').hasAttribute('disabled')).toBe(true)
  })

  it('正对照：总开关开着时，那一项是可用的', async () => {
    // 没有这条，上一条的 `disabled === true` 在"这个开关永远禁用"时也成立。
    mockBackend(makeProfileWire({ allow_search: true }))

    render(<PrivacySettings />)

    await waitFor(() => expect(switchByLabel('允许被搜索')).toBeTruthy())
    expect(switchByLabel('允许通过用户 ID 被搜索').hasAttribute('disabled')).toBe(false)
  })

  it('两个策略下拉显示的是后端当前值的中文标签', async () => {
    mockBackend(
      makeProfileWire({ friend_request_policy: 'auto_reject', group_invite_policy: 'auto_accept' }),
    )

    render(<PrivacySettings />)

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '好友申请处理方式' }).textContent).toBe('自动拒绝'),
    )
    expect(screen.getByRole('combobox', { name: '群邀请处理方式' }).textContent).toBe('自动同意')
  })
})

describe('PrivacySettings 保存', () => {
  it('关掉总开关：PUT 的请求体里**只有** allow_search: false', async () => {
    // 本批的两个缺陷在这一行同时受检：
    // 1. `allow_search` 此前根本不在 `UpdateProfileRequest` 里，会被 if 链丢掉；
    // 2. 判定若写成真值判断，`false` 会被当成"没传"——开关永远关不掉。
    mockBackend(makeProfileWire({ allow_search: true }))

    render(<PrivacySettings />)
    await waitFor(() => expect(switchByLabel('允许被搜索')).toBeTruthy())

    await userEvent.click(switchByLabel('允许被搜索'))

    await waitFor(() => expect(putBodies().length).toBe(1))
    expect(putBodies()).toEqual([{ allow_search: false }])
  })

  it('单项更新不会顺手重写别的字段（部分更新语义 doc:162-189）', async () => {
    mockBackend(makeProfileWire({ search_visible_by_id: true }))

    render(<PrivacySettings />)
    await waitFor(() => expect(switchByLabel('允许通过用户 ID 被搜索')).toBeTruthy())

    await userEvent.click(switchByLabel('允许通过用户 ID 被搜索'))

    // `toEqual` 而不是 `toMatchObject`：多带一个字段就是一次覆盖写。
    await waitFor(() => expect(putBodies()).toEqual([{ search_visible_by_id: false }]))
  })

  it('保存失败时开关停在原位——不做乐观更新，也就没有回滚可以写错', async () => {
    mockBackend(makeProfileWire({ allow_search: true }), json({ error: '更新失败' }, 400))

    render(<PrivacySettings />)
    await waitFor(() => expect(switchByLabel('允许被搜索')).toBeTruthy())

    await userEvent.click(switchByLabel('允许被搜索'))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: '保存失败', variant: 'destructive' }),
      ),
    )
    // 请求确实发过（正对照），但界面上仍然显示"开着"——因为它读的是后端确认过的那份。
    expect(putBodies()).toEqual([{ allow_search: false }])
    expect(switchByLabel('允许被搜索').getAttribute('aria-checked')).toBe('true')
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '已保存' }))
  })
})

/**
 * 落盘的**旧** profile（本批之前只有 8 个键）rehydrate 出来时，
 * `profile.allow_search` 是 `undefined`——类型上写着 `boolean`，运行时不是。
 * 直接拿它渲染，`<Switch checked={undefined}>` 会显示成"关"，用户据此以为自己
 * 隐身了，实际仍然可以被搜到。组件里那道 `ready` 闸挡的就是这个。
 */
describe('PrivacySettings 的 ready 闸（旧落盘数据没有这四个字段）', () => {
  /** 本批之前的 8 字段形状，故意绕过类型——运行时真的会出现这种对象。 */
  const staleProfile = {
    user_id: 'u1',
    user_nickname: '测试用户',
    user_email: 'a@example.com',
    user_signature: null,
    user_avatar_url: null,
    admin: 'false',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  } as unknown as UserProfile

  it('新资料到达之前不渲染任何开关，只显示加载中', async () => {
    let release!: (profile: UserProfile) => void
    vi.spyOn(profileApi, 'getProfile').mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        release = resolve
      }),
    )
    useProfileStore.setState({ profile: staleProfile })

    render(<PrivacySettings />)

    // 把 `ready` 闸拿掉 → **上面这句**先炸（加载中文案不见了，getByText 抛
    // "Unable to find an element"，实测停在这一行），下面那句同样不再成立：
    // 会渲染出一个 aria-checked="false" 的开关，而后端说的是 true。
    expect(screen.getByText('正在加载隐私设置…')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()

    // 正对照：闸不是"永远关着"，新资料一到就放行，而且用的是新值。
    release(
      Object.assign({}, staleProfile, {
        background_url: null,
        gender: null,
        birthday: null,
        region: null,
        allow_search: true,
        search_visible_by_id: true,
        friend_request_policy: 'manual',
        group_invite_policy: 'manual',
      }) as UserProfile,
    )

    await waitFor(() => expect(switchByLabel('允许被搜索')).toBeTruthy())
    expect(switchByLabel('允许被搜索').getAttribute('aria-checked')).toBe('true')
  })
})

/**
 * 接线：`SettingsPage` 真的把这一块渲染出来了。
 *
 * 单独钉这一条，是因为上面所有用例都直接 `render(<PrivacySettings />)`——
 * 组件本身写得再对，只要没有人挂它，用户仍然一个入口都没有，而那正是本批之前
 * 这四个字段的处境。把 `SettingsPage` 里那行 `<PrivacySettings />` 删掉 → 本条红。
 */
describe('设置页把隐私区接上了', () => {
  it('/app/settings 上渲染出四项隐私设置', async () => {
    mockBackend(makeProfileWire({ allow_search: true }))

    render(
      <I18nProvider>
        <RouterProvider
          router={createMemoryRouter([{ path: '*', element: <SettingsPage /> }], {
            initialEntries: ['/app/settings'],
          })}
        />
      </I18nProvider>,
    )

    await waitFor(() => expect(switchByLabel('允许被搜索')).toBeTruthy())
    expect(switchByLabel('允许通过用户 ID 被搜索')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '好友申请处理方式' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '群邀请处理方式' })).toBeTruthy()
  })
})
