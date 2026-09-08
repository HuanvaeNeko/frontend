import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth, SESSION_CHANGED_BEFORE_SEND } from '../authedFetch'
import { isAuthError } from '../apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { useApiConfigStore } from '@/store/apiConfig'

/**
 * 十份 `fetchWithAuth` 合并成的那一份，本文件钉的是**合并新增**的三件事：
 * 临期预刷新那道会话闸、按调用点自选的超时、以及超时与调用方 `signal` 的合成。
 *
 * 合并前就有、只是搬了家的行为（401 刷新重试、业务 401 白名单、上一场会话的
 * 401 不碰当前这场）继续由原来的用例守着，位置没变：
 * `sessionScopedFetchWithAuth.test.ts`（十个模块各一行）、`apiClient.test.ts`、
 * `profile.test.ts`、`sessionHandoff.test.tsx`。
 */

const API = getApiBaseUrl()
const REFRESH_URL = `${API}/api/auth/refresh`
const TARGET = `${API}/api/friends`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const tokens = (who: string) => ({
  success: true,
  code: 200,
  data: { access_token: `AT-${who}`, refresh_token: `RT-${who}`, expires_in: 3600 },
})

let fetchMock: ReturnType<typeof vi.fn>

const loginAs = async (who: string) => {
  fetchMock.mockResolvedValueOnce(json(tokens(who)))
  await useAuthStore.getState().login({ user_id: who, password: 'p' })
}

/** 一个手动控制何时落地的 fetch 响应。 */
const deferred = () => {
  let release!: (response: Response) => void
  let fail!: (error: Error) => void
  const promise = new Promise<Response>((resolve, reject) => {
    release = resolve
    fail = reject
  })
  return { promise, release, fail }
}

/** 把 access token 推进「5 分钟内过期」的临期区间，让预刷新分支真的执行。 */
const makeTokenNearlyExpired = () => {
  useAuthStore.setState({ tokenExpiry: Date.now() + 60_000 })
}

/** 某次 fetch 的 `RequestInit`。 */
const initOf = (call: number): RequestInit => fetchMock.mock.calls[call][1] as RequestInit

const authHeaderOf = (call: number): string | undefined =>
  (initOf(call).headers as Record<string, string> | undefined)?.Authorization

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * ## 临期预刷新那道闸（合并新增，合并前十份副本一处都没有）
 *
 * 预刷新是九份副本在**请求发出之前**唯一的悬挂点。不进这个分支时，拼头与
 * `fetch()` 和调用方同步执行，会话边界插不进来；一进去就有一个完整 RTT 的窗口，
 * 而窗口另一头的 `getAuthHeaders()` 读的是**活的** store。于是 A 的
 * url / method / body 会带着 B 的 bearer 发出去。
 *
 * ⚠️ 每一条都必须先证明**预刷新分支真的执行了**，否则「没有第二次 fetch」这种
 * 断言在"分支根本没进"时同样成立。这里用的正对照是可观测的：预刷新会**多打
 * 一次 `/api/auth/refresh`**，下面每条都按 URL 逐个列出实际请求序列。
 */
describe('预刷新期间跨过会话边界', () => {
  it('换了人：请求一个字节都不发，抛出的错误也不能被判成认证错误', async () => {
    await loginAs('alice')
    makeTokenNearlyExpired()

    // 预刷新挂起 → 期间 A 登出、B 登录 → 放行。
    const pendingRefresh = deferred()
    fetchMock.mockImplementationOnce(() => pendingRefresh.promise)
    const aliceRequest = fetchWithAuth(TARGET, { method: 'POST', body: '{"x":1}' })
    // 预刷新**确实**发出去了：alice 登录 + 这次 refresh = 2。
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toBe(REFRESH_URL)

    useAuthStore.getState().clearAuth()
    await loginAs('bob')
    useApiConfigStore.getState().setApiConfig({ aiApiKey: 'sk-bob', useCustomApi: true })
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')

    pendingRefresh.release(json(tokens('alice-2')))
    const error = await aliceRequest.catch((e: unknown) => e)

    expect((error as Error).message).toBe(SESSION_CHANGED_BEFORE_SEND)
    // A 的请求没有发出去：三次 fetch 分别是 alice 登录 / A 的预刷新 / bob 登录。
    // 少了这一行，上面那句 message 断言并不能证明"没发"。
    expect(fetchMock.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      `${API}/api/auth/login`,
      REFRESH_URL,
      `${API}/api/auth/login`,
    ])
    // B 一根汗毛都没动。
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useApiConfigStore.getState().aiApiKey).toBe('sk-bob')

    // ⚠️ 这条错误必须判**假**：判真的话 `profileStore.settleError` /
    // `friendsStore.handleApiError` 会 `silentRedirectToLogin()`——拿上一场会话的
    // 错误去清盘，被登出的正是刚登录的 B，也就是这道闸本来要保护的人。
    expect(isAuthError(error as Error)).toBe(false)
  })

  it('正对照：没换人时，预刷新之后请求照常发出去，且带的是刷新后的新 token', async () => {
    // 没有这一条，把闸写成"预刷新之后一律抛"也能让上一条绿。
    await loginAs('alice')
    makeTokenNearlyExpired()

    fetchMock.mockResolvedValueOnce(json(tokens('alice-2')))
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [] }))

    const response = await fetchWithAuth(TARGET)

    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      `${API}/api/auth/login`,
      REFRESH_URL,
      TARGET,
    ])
    expect(authHeaderOf(2)).toBe('Bearer AT-alice-2')
  })

  it('预刷新以 401 失败（自己这场会话就此结束、但没有下一场）：请求照发不误', async () => {
    // 这一条钉的是闸的**判据**：`clearAuth()` 会把世代号加一，所以"世代号变了"
    // 不等于"换人了"。只问 `isLiveSession()` 的话，这条最普通的刷新失败会被
    // 自己这道闸挡成 SESSION_CHANGED_BEFORE_SEND，而合并前九份副本是
    // 「记一条日志、照发不误」。实测：把闸改成 `if (!isLiveSession())` 本条即红。
    await loginAs('alice')
    makeTokenNearlyExpired()

    fetchMock.mockResolvedValueOnce(json({ error: 'Token 刷新失败' }, 401))
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 401, error: '未认证' }, 401))

    const response = await fetchWithAuth(TARGET)

    // 请求发出去了，而且是不带 Authorization 的（token 已被 clearAuth 清掉）。
    expect(response.status).toBe(401)
    expect(fetchMock.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      `${API}/api/auth/login`,
      REFRESH_URL,
      TARGET,
    ])
    expect(authHeaderOf(2)).toBeUndefined()
  })
})

/**
 * 401 重试的刷新**成功**之后、重发之前的那道闸。
 *
 * ⚠️ **这条用例是怎么造出那个窗口的，以及它没证明什么**：真实的
 * `authStore.performRefresh` 自己在落地时对照过世代号（跨界就抛
 * 'Token refresh landed after session end'），所以「刷新成功 + 期间换了人」
 * 这个组合走真实漏斗时**几乎**总是变成刷新失败、落进 catch 那一支。剩下的窗口
 * 只有 `performRefresh` 那次对照与本闸之间的几个微任务，用外部时序驱动不出来。
 * 所以这里直接把 `refreshAccessToken` 换成一个"成功、但期间换了人"的桩。
 *
 * 也就是说：本条证明的是**闸本身的行为**（判到换人就不重发、不动 B），
 * 不证明真实漏斗一定会把请求送进这个状态。这道闸是纵深防御——它守的是
 * `performRefresh` 的对照与本处判定之间那段 TOCTOU，而那段用例驱动不到。
 */
describe('401 重试的刷新成功后才换人', () => {
  it('不重发，把原始 401 原样交回调用方，也不动当前这个人', async () => {
    await loginAs('alice')
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 401, error: 'Token 无效' }, 401))

    const realRefresh = useAuthStore.getState().refreshAccessToken
    useAuthStore.setState({
      refreshAccessToken: async () => {
        // "刷新成功了"，但这期间换了人。
        useAuthStore.getState().clearAuth()
        await loginAs('bob')
      },
    })

    const response = await fetchWithAuth(TARGET)
    useAuthStore.setState({ refreshAccessToken: realRefresh })

    expect(response.status).toBe(401)
    // alice 登录 + A 的请求 + （桩里的）bob 登录 = 3。没有第 4 次重发。
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(useAuthStore.getState().accessToken).toBe('AT-bob')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('正对照：刷新成功且没换人时，照常带新 token 重发一次', async () => {
    await loginAs('alice')
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 401, error: 'Token 无效' }, 401))
    fetchMock.mockResolvedValueOnce(json(tokens('alice-2')))
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [] }))

    const response = await fetchWithAuth(TARGET)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(authHeaderOf(3)).toBe('Bearer AT-alice-2')
  })
})

/**
 * 超时：合并前九份副本调裸 `fetch`（零超时），`apiClient` 那份两次发送各套一个
 * 30 秒 `AbortController`。合并取「按调用点自选」，默认**没有**超时——
 * 默认若取 30 秒，`api/storage.ts` 的大文件传输（它就是那九份之一）会开始以
 * 一句没有任何调用方解析的「请求超时，请检查网络连接」失败。
 */
describe('超时是按调用点自选的', () => {
  it('不传 timeoutMs：连 AbortController 都不建，signal 是 undefined', async () => {
    // 「没有超时」不能靠"等一会儿看它没断"来证明。可观测的等价物是：
    // 交给 `fetch` 的 init 里没有 signal。
    await loginAs('alice')
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [] }))

    await fetchWithAuth(TARGET)

    expect(initOf(1).signal).toBeUndefined()
  })

  it('传了 timeoutMs：到点中止，并翻译成那句中文', async () => {
    await loginAs('alice')
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const abort = new Error('aborted')
            abort.name = 'AbortError'
            reject(abort)
          })
        }),
    )

    await expect(fetchWithAuth(TARGET, {}, { timeoutMs: 10 })).rejects.toThrow(
      '请求超时，请检查网络连接',
    )
  })

  it('正对照：传了 timeoutMs 但没到点，照常返回响应', async () => {
    // 上一条需要它：否则"传了 timeoutMs 就一定抛超时"也会绿。
    await loginAs('alice')
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [] }))

    const response = await fetchWithAuth(TARGET, {}, { timeoutMs: 30_000 })

    expect(response.status).toBe(200)
    expect(initOf(1).signal).toBeInstanceOf(AbortSignal)
  })

  it('调用方自己的 signal 不会被超时那个覆盖：取消照样能取消', async () => {
    // 合并前 `apiClient.fetchWithTimeout` 写的是 `{ ...options, signal:
    // controller.signal }`——`signal` 在展开之后，调用方传进来的那个被静默盖掉。
    // 今天没有生产调用点会撞上，但合并之后这一份是所有人的传输层。
    await loginAs('alice')
    const caller = new AbortController()
    let observed: AbortSignal | undefined
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          observed = init.signal ?? undefined
          init.signal?.addEventListener('abort', () => {
            const abort = new Error('aborted')
            abort.name = 'AbortError'
            reject(abort)
          })
        }),
    )

    const pending = fetchWithAuth(TARGET, { signal: caller.signal }, { timeoutMs: 30_000 })
    caller.abort()

    // 调用方取消得到的是取消，**不是**那句「请求超时」——超时文案只属于
    // 我们自己的定时器开的枪。
    await expect(pending).rejects.toThrow('aborted')
    expect(observed).toBeInstanceOf(AbortSignal)
    expect(observed?.aborted).toBe(true)
  })
})

/**
 * 刷新成功、重发之后**还是** 401（refresh token 真的死了）。
 *
 * 合并要在两种形态里挑一个：九份副本把第二个 401 原样交回调用方（解包层抛成
 * 带后端原文的 `ApiError(401)`，用户留在原地看见一条可见的错误），
 * `apiClient` 那份则 `silentRedirectToLogin()` + 抛 `AuthenticationError`。
 * 取前者，与「401 之后交回调用方的是 Response，不是异常」同一个理由。
 *
 * ⚠️ 这一条是**补的空白**，不是搬过来的：合并前十份副本里，
 * 「刷新后仍 401」这一支全仓一条用例都没有（`apiClient` 那份独有的分支，
 * 而它的用例只覆盖了"上一场会话的 401"与"同一场会话的 401"）。实测：把
 * `apiClient` 那条 `if (response.status === 401) { silentRedirect…; throw }`
 * 原样加回合并后的重发之后，**全量 775 条无一变红**——所以这条断言是它唯一的
 * 守门人。
 */
describe('刷新成功后重发仍然 401', () => {
  it('把第二个 401 原样交回调用方：不跳登录页、不清当前这个人的盘', async () => {
    await loginAs('alice')
    const hrefSpy = vi.fn()
    const replaceSpy = vi.spyOn(window.location, 'replace').mockImplementation(() => {})
    vi.spyOn(window.location, 'href', 'set').mockImplementation(hrefSpy)

    fetchMock.mockResolvedValueOnce(json({ success: false, code: 401, error: 'Token 无效' }, 401))
    fetchMock.mockResolvedValueOnce(json(tokens('alice-2')))
    fetchMock.mockResolvedValueOnce(
      json({ success: false, code: 401, error: '未认证或 Token 无效' }, 401),
    )

    const response = await fetchWithAuth(TARGET)

    expect(response.status).toBe(401)
    // 正对照：刷新与重发**确实**发生了（否则"没跳转"在根本没走到这一支时也成立）。
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(useAuthStore.getState().accessToken).toBe('AT-alice-2')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(hrefSpy).not.toHaveBeenCalled()
    expect(replaceSpy).not.toHaveBeenCalled()
  })
})

/**
 * 刷新**抛错**那一支交给调用方的错误形状。
 *
 * 不变量是「错误带着 status 和 endpoint，分类器只看状态码、永不看文案」。
 * 分类器那一半由 `apiClient.test.ts` 的 `isAuthError` 一组用例守着；
 * 产出那一半——`fetchWithAuth` 的 catch **原样 rethrow 刷新那次的错误**，
 * 而不是自己造一个新的——此前全仓没有任何断言。实测：把那句 `throw error`
 * 换成 `throw new Error('认证失败')`，全量 776 条**无一变红**，所以下面这条
 * 是它唯一的守门人。
 */
describe('刷新失败时抛给调用方的错误', () => {
  it('原样是刷新那一次的 ApiError（带 status 与 endpoint），不是新造的裸 Error', async () => {
    await loginAs('alice')
    vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {})

    fetchMock.mockResolvedValueOnce(json({ success: false, code: 401, error: 'Token 无效' }, 401))
    // 刷新自己也 401 ⇒ `performRefresh` 抛 ApiError 并 clearAuth()。
    fetchMock.mockResolvedValueOnce(json({ error: 'Token 刷新失败' }, 401))

    const error = (await fetchWithAuth(TARGET).catch((e: unknown) => e)) as {
      name?: string
      status?: number
      endpoint?: string
    }

    expect(error.name).toBe('ApiError')
    expect(error.status).toBe(401)
    expect(error.endpoint).toBe('POST /api/auth/refresh')
    // 正对照：这一支**确实**走到了登出（否则上面三行可能来自别的路径）。
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
