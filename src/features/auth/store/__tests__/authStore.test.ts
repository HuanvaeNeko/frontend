import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { migrateAuthPersist, useAuthStore } from '../authStore'

/**
 * ⚠️ 本文件在 BFF 会话层落地时删掉了六组用例：
 * 1. `authStore.login —— 信封解包`（登录响应里 token 三件套的解析：access_token /
 *    refresh_token / expires_in 的形状校验、legacyBare 豁免、user_nickname 归一）
 * 2. `authStore.refreshAccessToken —— 与 login 逐字同构的第二处静默故障`
 * 3. `authStore.refreshAccessToken —— 并发刷新竞态`
 * 4. `refreshAccessToken —— 会话结束之后才落地的刷新结果`
 * 5. `refreshAccessToken —— 传输层失败 vs 真的 401`
 * 6. `setTokens —— 会话进行中才成立的前置条件`
 *
 * 不是「不再测这些行为」——那些规则**整体搬到了服务端**：
 * - 登录 / 刷新的分档与单飞：`server/session/__tests__/refresh.test.ts`
 * - 会话边界：BFF 只认 cookie，客户端手里已经没有 token 可以在边界上写错
 *
 * 第 1 组里唯二还有效的断言——avatar_url 是相对路径时补成绝对地址、已经是绝对
 * 地址时原样保留——没有被丢弃，搬进了下面新的
 * `authStore.login —— 打 BFF，store 里不留 token`，只是响应形状从
 * `data: {access_token, ...}` 换成了 `data: {user: {...}}`。
 *
 * 客户端这一侧现在只需要证明三件事：登录后 store 里没有 token、启动靠
 * GET /api/session、502 不等于登出。
 */

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  // zustand persist 会往 localStorage 写 auth-storage；不清会污染下一条用例。
  // 同时 getApiBaseUrl() 也读 localStorage（huanvae.api-base-url），清空后走
  // import.meta.env.VITE_API_URL（Vitest 加载的 .env）或默认的 https://api.huanvae.cn。
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  setApiShapeErrorReporter(() => {})
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('authStore.login —— 打 BFF，store 里不留 token', () => {
  it('登录成功后 store 里只有 user 与 isAuthenticated，没有任何 token 字段', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { user: { user_id: 'alice', nickname: '爱丽丝' } } }))

    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    const state = useAuthStore.getState() as unknown as Record<string, unknown>
    expect(state.isAuthenticated).toBe(true)
    expect((state.user as { nickname?: string }).nickname).toBe('爱丽丝')
    // 这是本设计的核心断言：token 字段在 store 上根本不存在
    expect('accessToken' in state).toBe(false)
    expect('refreshToken' in state).toBe(false)
    expect('tokenExpiry' in state).toBe(false)
  })

  it('登录打的是同源 /api/auth/login，且带 credentials', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { user: { user_id: 'alice' } } }))

    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login')
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('same-origin')
  })

  it('登录失败透出后端文案，且不进登录态', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, error: '用户名或密码错误' }, 401))

    await expect(useAuthStore.getState().login({ user_id: 'alice', password: 'bad' })).rejects.toThrow(/用户名或密码错误/)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('avatar_url 是相对路径时补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { user: { user_id: 'u1', avatar_url: 'avatars/x.jpg' } } }),
    )

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().user?.avatar_url).toBe(`${getApiBaseUrl()}/avatars/x.jpg`)
  })

  it('avatar_url 已经是绝对地址时原样保留，不会被二次拼接破坏', async () => {
    // backend-docs/profile/个人资料管理.md:74 的真实示例就是这种形状
    // （指向 MinIO 的完整 URL，不是 api.huanvae.cn 下的路径）。
    const absolute = 'http://localhost:9000/avatars/testuser001.jpg'
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { user: { user_id: 'u1', avatar_url: absolute } } }),
    )

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().user?.avatar_url).toBe(absolute)
  })
})

describe('authStore.restoreSession —— 启动时的唯一真值', () => {
  it('200：写入 user 并进登录态', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { user: { user_id: 'bob', nickname: '鲍勃' } } }))

    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.nickname).toBe('鲍勃')
  })

  it('401：清空登录态（这才是「未登录」）', async () => {
    useAuthStore.setState({ user: { user_id: 'old' }, isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, error: '会话已失效，请重新登录' }, 401))

    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBe(null)
  })

  it('502：保持上一次状态、记错误，**不**清空登录态（后端挂了 ≠ 用户退出了）', async () => {
    useAuthStore.setState({ user: { user_id: 'old', nickname: '老状态' }, isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 502, error: '后端暂时不可用，请稍后重试' }, 502))

    await useAuthStore.getState().restoreSession()

    // 正对照在上一条：401 时确实会清空。所以这里的「没清空」有意义
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.nickname).toBe('老状态')
    expect(useAuthStore.getState().error).toContain('后端暂时不可用')
  })

  it('网络失败：同 502，保持状态不登出', async () => {
    useAuthStore.setState({ user: { user_id: 'old' }, isAuthenticated: true })
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    await useAuthStore.getState().restoreSession()

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})

describe('authStore.logout', () => {
  it('打 BFF 的 logout 并清空本地登录态', async () => {
    useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200 }))

    await useAuthStore.getState().logout()

    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/logout')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBe(null)
  })

  it('BFF 不可达也照样清空本地态（点了登出就该登出）', async () => {
    useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('auth-storage 的 persist 迁移', () => {
  const absolute = (path: string) => `${getApiBaseUrl()}/${path}`

  it('把落盘的相对头像路径搬成绝对地址', () => {
    // main 上写的是 `avatar_url: data.avatar_url`，也就是后端原样给的相对路径
    // （backend-docs/profile/个人资料管理.md:98「头像相对路径（需拼接 STORAGE_BASE_URL）」）。
    const migrated = migrateAuthPersist({
      user: { user_id: 'u1', nickname: 'n', avatar_url: 'avatars/u1.png?t=1' },
    }) as { user: { user_id: string; nickname: string; avatar_url?: string } }

    expect(migrated.user.avatar_url).toBe(absolute('avatars/u1.png?t=1'))
    // 其余字段逐字保留——迁移不是重建 state。token 字段的剔除由专门的用例钉住
    // （见下面「迁移把落盘的 token 字段删掉」），这条只管 avatar_url。
    expect(migrated.user.user_id).toBe('u1')
    expect(migrated.user.nickname).toBe('n')
  })

  it('已经是绝对地址时是 no-op（幂等，重复迁移不会拼两次基址）', () => {
    const already = absolute('avatars/u1.png?t=1')

    const migrated = migrateAuthPersist({ user: { avatar_url: already } }) as {
      user: { avatar_url?: string }
    }

    expect(migrated.user.avatar_url).toBe(already)
  })

  it('空串变成 undefined（"没有头像"），而不是一个会被 || 选中的假地址', () => {
    // 空串非 null，但 `Navigation` 的 `||` 链要的是"继续往后找"。
    const migrated = migrateAuthPersist({ user: { avatar_url: '' } }) as {
      user: { avatar_url?: string }
    }

    expect(migrated.user.avatar_url).toBeUndefined()
  })

  /**
   * ⚠️ `migrate` 的实参形状：zustand 5.0.15 的 `persistImpl`（`node_modules/zustand/
   * middleware.js`，`options.migrate(deserializedStorageValue.state,
   * deserializedStorageValue.version)`）传进来的是**裸的 `state`**，不是
   * `{state, version}` 那层信封——信封在调 `migrate` 之前就已经被解开了。
   *
   * 这里直接传裸 state（不包一层 `{state, version}`），就是在钉住这个实参形状；
   * 包一层看起来"更像"落盘格式，但会让 `migrateAuthPersist` 在真实 rehydrate
   * 路径上读到 `undefined`、整个函数变成 no-op——已部署用户盘上那对真实可用的
   * token 一个都不会被删掉，而这条测试本身却会照样通过（因为它按错的形状造了
   * 输入）。下面「rehydrate 时真的被 persist 调用」那条用真实的
   * `persist.rehydrate()` 路径复核了一遍同一件事，就是为了防住这一类"测试本身
   * 用错误形状喂参数、于是永远测不出错"的陷阱。
   */
  it('迁移把落盘的 token 字段删掉（JWT 留在 localStorage 里正是要消灭的东西）', () => {
    const migrated = migrateAuthPersist({
      accessToken: 'AT',
      refreshToken: 'RT',
      tokenExpiry: 123,
      isAuthenticated: true,
      user: { user_id: 'alice', avatar_url: 'avatars/a.png' },
    }) as Record<string, unknown>

    expect('accessToken' in migrated).toBe(false)
    expect('refreshToken' in migrated).toBe(false)
    expect('tokenExpiry' in migrated).toBe(false)
    // 正对照：user 保留（首帧渲染要用），且头像仍被补成绝对地址
    expect((migrated.user as { user_id: string }).user_id).toBe('alice')
  })

  it('形状不认识时原样返回，不编造 state；但 token 字段的剔除是无条件的', () => {
    // 迁移函数不是校验层：落盘数据坏了应该看得见，而不是被一个默认值盖住——
    // 这三条走的是非对象输入，函数第一行就短路返回，连 identity 都不变。
    expect(migrateAuthPersist(null)).toBeNull()
    expect(migrateAuthPersist('不是对象')).toBe('不是对象')

    // 对象输入：没有可识别的 `user` 时不编造一个，但**仍然**会剔除三个 token
    // 字段——那一步不依赖 user 长什么样，见 `migrateAuthPersist` 的实现。
    // 用 `toEqual` 而不是 `toBe`：剔除字段必然产生一个新对象，identity 本来
    // 就不该相等。
    const noUser = { accessToken: 'AT' }
    expect(migrateAuthPersist(noUser)).toEqual({})

    const userIsNull = { user: null }
    expect(migrateAuthPersist(userIsNull)).toEqual({ user: null })

    // 没登录过头像的用户：`avatar_url` 压根不存在，不该被写成一个显式的
    // `undefined` 值再被人拿 `'avatar_url' in user` 之类的写法误读成"有这个键"
    // ——`toEqual` 对 `{a: undefined}` 与 `{}` 视为相等，这条只钉字段值本身。
    const noAvatar = { user: { user_id: 'u1' } }
    expect(migrateAuthPersist(noAvatar)).toEqual({ user: { user_id: 'u1' } })
  })

  it('rehydrate 时真的被 persist 调用（v0 落盘 → 内存里已是绝对地址，且 token 字段消失）', async () => {
    // 上面几条只证明函数本身对；这一条证明它**接上了**——把 persist 配置里的
    // `migrate:` 或 `version:` 拿掉，本条红。同时它是防"`migrate` 实参形状
    // 假设错误"这一类陷阱的最终测试：真的走 zustand 的 `persist.rehydrate()`，
    // 不是直接调用 `migrateAuthPersist` 走一条我们自己搭的近似路径。
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: {
          accessToken: 'AT',
          refreshToken: 'RT',
          isAuthenticated: true,
          tokenExpiry: Date.now() + 3600_000,
          user: { user_id: 'u1', avatar_url: 'avatars/u1.png?t=9' },
        },
        version: 0,
      }),
    )

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().user?.avatar_url).toBe(absolute('avatars/u1.png?t=9'))
    // 已部署用户盘上那对真实可用的 token：rehydrate 之后必须从内存里消失。
    const state = useAuthStore.getState() as unknown as Record<string, unknown>
    expect('accessToken' in state).toBe(false)
    expect('refreshToken' in state).toBe(false)
  })
})

describe('auth-storage 的 partialize —— 只落盘 user', () => {
  it('isAuthenticated 不落盘：盘上说已登录、cookie 已过期的半状态不能复活', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { user: { user_id: 'alice' } } }))

    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    const raw = JSON.parse(localStorage.getItem('auth-storage') as string) as {
      state: Record<string, unknown>
    }
    expect('isAuthenticated' in raw.state).toBe(false)
    expect((raw.state.user as { user_id: string }).user_id).toBe('alice')
  })
})
