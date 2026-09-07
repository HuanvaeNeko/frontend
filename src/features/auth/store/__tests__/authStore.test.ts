import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { getApiBaseUrl, getAuthApiUrl } from '@/lib/apiConfig'
import { migrateAuthPersist, useAuthStore } from '../authStore'

/**
 * 这批用例针对的是一种**静默**故障：信封化之后 `data.access_token` 恒为
 * undefined，但 `isAuthenticated: true` 是硬编码的、控制台照样打印"登录成功"、
 * `tokenExpiry` 变成 NaN 而 NaN 是 falsy 所以 `checkTokenExpiry()` 永不触发自愈。
 * 也就是说「坏」和「好」从外部看长得一模一样。
 *
 * 因此每一条断言都必须落在**具体的值**上。"没抛错""能编译""控制台没红"
 * 恰恰是这个 bug 当年的表现，不能当成证明。
 */

// getAuthApiUrl() 而不是字面量：Vitest 会加载 .env，宿主由本机反代决定，
// 断言必须跟着同一个基址走，不能钉死某个域名（否则一换 .env 就假红）。
const AUTH_BASE = getAuthApiUrl()

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ENVELOPE = {
  success: true,
  code: 200,
  data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 },
}

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

describe('authStore.login —— 信封解包', () => {
  it('把 data 里的 token 真正存进 store（信封根部读不到，这条就是那个 bug）', async () => {
    fetchMock.mockResolvedValueOnce(ok(ENVELOPE))

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('AT')
    expect(state.refreshToken).toBe('RT')
    expect(state.isAuthenticated).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(`${AUTH_BASE}/login`, expect.anything())
  })

  it('tokenExpiry 是有限数字，不是 NaN', async () => {
    // 直接拦截"永不自愈"那一环：`Date.now() + undefined * 1000` = NaN，
    // 而 checkTokenExpiry 的 `if (!tokenExpiry) return false` 把 NaN 当成"没设过期时间"，
    // 于是主动续期永远不会触发。只断言 accessToken 是抓不到这一条的。
    const before = Date.now()
    fetchMock.mockResolvedValueOnce(ok(ENVELOPE))

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    const { tokenExpiry } = useAuthStore.getState()
    expect(Number.isFinite(tokenExpiry)).toBe(true)
    expect(tokenExpiry).toBeGreaterThanOrEqual(before + 3600_000 - 2000)
    expect(tokenExpiry).toBeLessThanOrEqual(Date.now() + 3600_000)
  })

  it('data 为空对象时拒绝登录，绝不留下"已登录但没有 token"的半登录态', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: {} }))

    await expect(useAuthStore.getState().login({ user_id: 'u1', password: 'p' })).rejects.toThrow(
      /access_token/,
    )

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.accessToken).toBeNull()
  })

  it('expires_in 为 null 时抛错，而不是把 NaN 写进 tokenExpiry', async () => {
    // 解包层的 require 判定是 `payload[key] === undefined`，null 算"存在"——
    // 所以这里用的是 parse 而不是 require。这条用例就是那个选择的护栏。
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { access_token: 'AT', refresh_token: 'RT', expires_in: null } }),
    )

    await expect(useAuthStore.getState().login({ user_id: 'u1', password: 'p' })).rejects.toThrow(
      /expires_in/,
    )
    expect(useAuthStore.getState().tokenExpiry).toBeNull()
  })

  it('后端仍返回裸响应时靠 legacyBare 兜住，并且必须吵一声', async () => {
    // 两份后端文档对 login/refresh 的口径冲突（auth 文档:37 是信封，
    // README:217 是裸读），legacyBare 就是为这个不确定性准备的。
    // 它和 `?? body` 的关键差别在于：命中裸响应会 console.warn，欠账可被 grep 出来。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(ok({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().accessToken).toBe('AT')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('legacyBare'))
  })

  it('登录失败时把后端的真实文案透出来，而不是一句通用提示', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, message: '用户名或密码错误' }, 401))

    await expect(useAuthStore.getState().login({ user_id: 'u1', password: 'bad' })).rejects.toThrow(
      '用户名或密码错误',
    )
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('user_nickname（profile 命名）能正确归一成 nickname', async () => {
    // 后端 profile 模块的字段一律带 user_ 前缀（user_nickname/user_email/...），
    // 而登录响应历史上读的是无前缀名；这条断言的是 optionalString 对
    // user_nickname 这个新映射真的生效，不是只测到了旧的无前缀名分支。
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user_nickname: '小明' },
      }),
    )

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().user?.nickname).toBe('小明')
  })

  it('avatar_url 是相对路径时补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user_avatar_url: 'avatars/x.jpg' },
      }),
    )

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().user?.avatar_url).toBe(`${getApiBaseUrl()}/avatars/x.jpg`)
  })

  it('avatar_url 已经是绝对地址时原样保留，不会被二次拼接破坏', async () => {
    // backend-docs/profile/个人资料管理.md:74 的真实示例就是这种形状
    // （指向 MinIO 的完整 URL，不是 api.huanvae.cn 下的路径）。
    const absolute = 'http://localhost:9000/avatars/testuser001.jpg'
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user_avatar_url: absolute },
      }),
    )

    await useAuthStore.getState().login({ user_id: 'u1', password: 'p' })

    expect(useAuthStore.getState().user?.avatar_url).toBe(absolute)
  })
})

describe('authStore.refreshAccessToken —— 与 login 逐字同构的第二处静默故障', () => {
  it('把 data 里的新 token 存进 store', async () => {
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 7200 } }),
    )

    await useAuthStore.getState().refreshAccessToken()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('AT2')
    expect(state.refreshToken).toBe('RT2')
    expect(Number.isFinite(state.tokenExpiry)).toBe(true)
    expect(state.tokenExpiry).toBeGreaterThan(Date.now() + 7000_000)
  })

  it('响应形状不对时清空登录态并抛错，而不是静默写入 undefined', async () => {
    // 旧行为：resolve、accessToken=undefined、refreshToken=undefined 落盘持久化，
    // 此后 401 重试分支（`&& authStore.refreshToken`）永远进不去，故障不可逆。
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { access_token: 'AT2' } }))

    await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow(/refresh_token/)

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })
})

/**
 * 刷新竞态（2026-09-07 线上实锤）：页面加载时 5 个请求来自 4 份不同的 `fetchWithAuth`
 * 副本，各自发现 token 临期，于是 5 个 `POST /api/auth/refresh` 带着同一个 refresh token
 * 同时出去；后端每次刷新都轮换一对新 token，5 个响应以任意顺序落进 store，最后写入的那对
 * 已被后来的轮换作废 → 全部 401 → 拿作废的 refresh token 再刷又 401 → clearAuth 跳登录。
 *
 * 九份副本 + wsStore 都直接调 `refreshAccessToken`，所以锁必须在这个漏斗里。
 */
describe('authStore.refreshAccessToken —— 并发刷新竞态', () => {
  const rotated = (n: number) =>
    ok({
      success: true,
      code: 200,
      data: { access_token: `AT${n}`, refresh_token: `RT${n}`, expires_in: 900 },
    })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('并发调用只发一次 /refresh，所有调用者共享同一对新 token', async () => {
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    // 请求悬着，保证 5 个调用在第一个完成前全部进入；每次调用给一个新 Response，
    // 这样没有单飞锁时 5 个调用都能各自成功，失败点落在"发了 5 次"这条断言上，而不是 body 被重复读。
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    fetchMock.mockImplementation(() => gate.then(() => rotated(1)))

    const calls = Array.from({ length: 5 }, () => useAuthStore.getState().refreshAccessToken())
    release()
    await Promise.all(calls)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe('AT1')
    expect(useAuthStore.getState().refreshToken).toBe('RT1')
  })

  it('成功轮换后 10 秒内再次调用不发请求，直接沿用 store 里的新 token', async () => {
    // 级联场景：用旧 token 发出的请求在轮换完成后收到 401，会再次触发刷新；
    // 若真的再刷，会把刚拿到的那对 token 又作废，T1 作废 T2、T2 作废 T3 地滚下去。
    vi.useFakeTimers({ now: new Date('2026-09-07T10:00:00Z') })
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    fetchMock.mockImplementationOnce(async () => rotated(1))

    await useAuthStore.getState().refreshAccessToken()
    vi.setSystemTime(new Date('2026-09-07T10:00:05Z'))
    await useAuthStore.getState().refreshAccessToken()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe('AT1')
  })

  it('10 秒窗口过后再次调用会重新刷新', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-07T10:00:00Z') })
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    fetchMock.mockImplementationOnce(async () => rotated(1)).mockImplementationOnce(async () => rotated(2))

    await useAuthStore.getState().refreshAccessToken()
    vi.setSystemTime(new Date('2026-09-07T10:00:11Z'))
    await useAuthStore.getState().refreshAccessToken()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().accessToken).toBe('AT2')
    expect(useAuthStore.getState().refreshToken).toBe('RT2')
  })

  it('轮换回来的 token 本身就临期时，10 秒窗口内的再次调用仍会真的刷新', async () => {
    // 上面三条都用 expires_in: 900，新 token 离 checkTokenExpiry 的 5 分钟阈值很远，
    // 于是「刚轮换过就跳过」的第三个合取项 `!checkTokenExpiry()` 从没被求值过——
    // 删掉它，那三条依然全绿。这条把它钉住：后端若签发短于 5 分钟的 token，
    // 刚拿到手就已经在该续期的区间里，此时跳过会让调用者既拿不到可用 token
    // 又进不去刷新，10 秒内每个请求都带着临期 token 去换 401。
    // 「刚轮换过」是用来压级联的，不是用来把自己锁在门外的。
    vi.useFakeTimers({ now: new Date('2026-09-07T10:00:00Z') })
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    const shortLived = (n: number) =>
      ok({
        success: true,
        code: 200,
        data: { access_token: `AT${n}`, refresh_token: `RT${n}`, expires_in: 60 },
      })
    fetchMock
      .mockImplementationOnce(async () => shortLived(1))
      .mockImplementationOnce(async () => shortLived(2))

    await useAuthStore.getState().refreshAccessToken()
    vi.setSystemTime(new Date('2026-09-07T10:00:05Z'))
    await useAuthStore.getState().refreshAccessToken()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().accessToken).toBe('AT2')
  })

  it('并发刷新失败时只发一次请求、所有调用者收到同一错误、登录态只清一次，之后仍能发起新的刷新', async () => {
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    const clearAuth = vi.fn(useAuthStore.getState().clearAuth)
    useAuthStore.setState({ clearAuth })
    fetchMock.mockImplementation(async () =>
      ok({ success: false, code: 401, error: 'Token 无效或已过期' }, 401),
    )

    const results = await Promise.allSettled([
      useAuthStore.getState().refreshAccessToken(),
      useAuthStore.getState().refreshAccessToken(),
      useAuthStore.getState().refreshAccessToken(),
    ])

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(clearAuth).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)

    // in-flight 槽位已释放：重新登录后再刷新会发起新的请求
    useAuthStore.setState({ refreshToken: 'RT0', accessToken: 'AT0', isAuthenticated: true })
    fetchMock.mockImplementation(async () => rotated(1))
    await useAuthStore.getState().refreshAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().accessToken).toBe('AT1')
  })
})

/**
 * 登出那一刻还在飞的刷新请求。
 *
 * `refreshInFlight` 是模块级单飞锁，`clearAuth` 既不取消它也不作废它，
 * 于是 `performRefresh` 的成功分支会在**清盘之后**执行 `set({accessToken,...})`，
 * persist 立刻把一对**刚轮换出来、当前有效**的 token 重新写进 `auth-storage`，
 * 明文躺在那里等下一个用这台电脑的人——直到有人登录把它覆盖掉。
 */
describe('refreshAccessToken —— 会话结束之后才落地的刷新结果', () => {
  it('登出后落地的新 token 既不进内存也不落盘', async () => {
    // 真的登录一次，而不是 setState：登录会走 beginSession()，此后落盘是真的会发生的，
    // 下面那条 toBeNull 才不是"反正也没写进去过"。
    fetchMock.mockResolvedValueOnce(ok(ENVELOPE))
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })
    // 正对照：这一刻 auth-storage 里确实有 A 的 token。
    expect(localStorage.getItem('auth-storage')).toContain('AT')

    // 刷新飞在半空
    let release!: (response: Response) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    const inFlight = useAuthStore.getState().refreshAccessToken()

    useAuthStore.getState().clearAuth()
    expect(localStorage.getItem('auth-storage')).toBeNull()

    // 后端**成功**轮换出一对新 token，响应现在才到
    release(
      ok({
        success: true,
        code: 200,
        data: { access_token: 'AT-NEW', refresh_token: 'RT-NEW', expires_in: 3600 },
      }),
    )
    await expect(inFlight).rejects.toThrow(/session end/)

    expect(localStorage.getItem('auth-storage')).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
  })

  it('正对照：会话没结束时，同样的时序会正常写进内存与盘', async () => {
    // 没有这一条，上面那条可以被"刷新永远不写 store"这种实现骗过去。
    fetchMock.mockResolvedValueOnce(ok(ENVELOPE))
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    let release!: (response: Response) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    const inFlight = useAuthStore.getState().refreshAccessToken()

    release(
      ok({
        success: true,
        code: 200,
        data: { access_token: 'AT-NEW', refresh_token: 'RT-NEW', expires_in: 3600 },
      }),
    )
    await inFlight

    expect(useAuthStore.getState().accessToken).toBe('AT-NEW')
    expect(localStorage.getItem('auth-storage')).toContain('AT-NEW')
  })
})

/**
 * 「刷新失败」此前一律走 `clearAuth()`，而 `clearAuth` 现在会跑反向名单清盘：
 * 一次网络抖动就会销毁 `api-config-storage` 里用户自备的第三方 `aiApiKey`。
 * 这里只钉 authStore 这一侧的分档（票据清了、`user` 留下 / 全清）；
 * "密钥真的还在"那一半在 `sessionHandoff.test.tsx` 里，因为要连上其它 store。
 */
describe('refreshAccessToken —— 传输层失败 vs 真的 401', () => {
  it('传输层失败（断网）：清票据，但会话没结束，user 留在原处', async () => {
    fetchMock.mockResolvedValueOnce(ok(ENVELOPE))
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })
    expect(useAuthStore.getState().user?.user_id).toBe('alice')

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow()

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    // 差分就在这一行：会话没结束，所以 `user` 还在，落盘的 auth-storage 也还在。
    expect(useAuthStore.getState().user?.user_id).toBe('alice')
    expect(localStorage.getItem('auth-storage')).toContain('alice')
  })

  it('刷新端点回 401：会话结束，user 与整个 auth-storage 一起消失', async () => {
    fetchMock.mockResolvedValueOnce(ok(ENVELOPE))
    await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 401, error: 'Token 无效或已过期' }, 401),
    )
    await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow()

    expect(useAuthStore.getState().user).toBeNull()
    expect(localStorage.getItem('auth-storage')).toBeNull()
  })

  it('5xx 与响应形状坏都按传输层失败处理，不当成会话结束', async () => {
    // 502 走的是 readEnvelope 的非 401 分支；形状坏走的是 parse 抛错。
    // 两条都曾经落进同一个无差别 clearAuth。
    for (const bad of [
      ok({ success: false, code: 502, error: 'bad gateway' }, 502),
      ok({ success: true, code: 200, data: { access_token: 'AT2' } }),
    ]) {
      fetchMock.mockResolvedValueOnce(ok(ENVELOPE))
      await useAuthStore.getState().login({ user_id: 'alice', password: 'p' })

      fetchMock.mockResolvedValueOnce(bad)
      await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow()

      expect(useAuthStore.getState().accessToken).toBeNull()
      expect(useAuthStore.getState().user?.user_id).toBe('alice')
    }
  })
})

describe('auth-storage 的 persist 迁移', () => {
  const absolute = (path: string) => `${getApiBaseUrl()}/${path}`

  it('把落盘的相对头像路径搬成绝对地址', () => {
    // main 上写的是 `avatar_url: data.avatar_url`，也就是后端原样给的相对路径
    // （backend-docs/profile/个人资料管理.md:98「头像相对路径（需拼接 STORAGE_BASE_URL）」）。
    const migrated = migrateAuthPersist({
      accessToken: 'AT',
      user: { user_id: 'u1', nickname: 'n', avatar_url: 'avatars/u1.png?t=1' },
    }) as { accessToken: string; user: { user_id: string; nickname: string; avatar_url?: string } }

    expect(migrated.user.avatar_url).toBe(absolute('avatars/u1.png?t=1'))
    // 其余字段逐字保留——迁移不是重建 state。
    expect(migrated.accessToken).toBe('AT')
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

  it('形状不认识时原样返回，不编造 state', () => {
    // 迁移函数不是校验层：落盘数据坏了应该看得见，而不是被一个默认值盖住。
    const noUser = { accessToken: 'AT' }
    expect(migrateAuthPersist(noUser)).toBe(noUser)

    const userIsNull = { user: null }
    expect(migrateAuthPersist(userIsNull)).toBe(userIsNull)

    // 没登录过头像的用户：`avatar_url` 压根不存在，不该被写成 undefined 键
    const noAvatar = { user: { user_id: 'u1' } }
    expect(migrateAuthPersist(noAvatar)).toBe(noAvatar)

    expect(migrateAuthPersist(null)).toBeNull()
    expect(migrateAuthPersist('不是对象')).toBe('不是对象')
  })

  it('rehydrate 时真的被 persist 调用（v0 落盘 → 内存里已是绝对地址）', async () => {
    // 上面几条只证明函数本身对；这一条证明它**接上了**——把 persist 配置里的
    // `migrate:` 或 `version:` 拿掉，本条红。
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
  })
})
