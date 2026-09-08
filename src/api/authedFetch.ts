import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { ROUTES } from '@/lib/routes'
import { isSessionLive, pinSession } from '@/lib/sessionScope'

const BASE_URL = getApiBaseUrl()

/**
 * HTTP 状态码是 401、但**语义是业务失败**的端点。
 *
 * 「401 ⇒ 会话失效」在本后端有写在文档正文里的反例：
 *
 * - `PUT /api/profile/password`（`backend-docs/profile/个人资料管理.md:288`
 *   的「### 4. 修改密码（受保护）」一节，端点行 :290）：**旧密码填错返回 401**，
 *   body 是 `{"error": "Old password is incorrect"}`（同节 :332；:345 又写了
 *   一遍「旧密码验证失败返回 401 状态码」）。
 * - 尚未加进表里的一条：`POST /api/webrtc/rooms/{id}/join` 的**房间密码错误
 *   也是 401**（`backend-docs/webrtc/WebRTC房间.md:228` 错误码表：
 *   `| 401 | 密码错误 |`）。列出来是为了说明「401 不等于会话失效」在这个后端
 *   不是孤例；**故意不加**——加它会改变 webrtc 模块今天的行为，那是另一件事，
 *   要配自己的用例，不该搭本次合并的车。
 *
 * ## 合并把这张表的作用域从「一个模块」变成了「全部十个」
 *
 * 合并之前这张表只在 `profile.ts` 那一份 `fetchWithAuth` 的 401 分支上被查
 * （十份副本里唯一带第四个合取项的那份），给别的模块的端点加一行是空操作。
 * 现在只剩一份 {@link fetchWithAuth}，**表对十个模块同时生效**。
 * 今天这是空操作（表里只有一个 profile 端点，别的模块碰不到它），
 * 但往后加一行就是十个模块一起改行为——加行的人必须自己带用例。
 *
 * 表里的字符串必须与 `ApiError.endpoint`、以及「方法 + URL 的 pathname」
 * 两侧都逐字一致，两侧各有用例钉住（都在
 * `src/features/profile/api/__tests__/profile.test.ts`）：
 * - 端点串一致：「旧密码错误的 401 抛 ApiError，端点字段可被白名单识别」；
 * - 表与真实请求一致：「旧密码错误的 401：不刷新、不重发、不轮换 token」；
 * - 不登出：「旧密码错误的 401：即使刷新会失败，也不清 token、不跳登录页」，
 *   配一条正对照「对照：普通端点刷新失败时**确实**会 clearAuth + 跳登录页」
 *   钉住下面 {@link redirectToLogin} 那一跳。
 */
const BUSINESS_401_ENDPOINTS: ReadonlySet<string> = new Set(['PUT /api/profile/password'])

/**
 * 这个**请求**（方法 + 路径）是不是业务 401 端点。
 *
 * 给 {@link fetchWithAuth} 的 401 分支用：那时手里只有 `url` 与 `options.method`，
 * 还没有 `ApiError`，走不了 `apiClient.ts` 的 `isAuthError`。
 *
 * `url` 绝对地址或相对路径都行，只比较 pathname（query / hash 不参与）；
 * 解析不出来就判假——判假 = 维持原来的刷新重试行为，不会凭空多出一条静默路径。
 */
export const isBusiness401Request = (method: string | undefined, url: string): boolean => {
  let pathname: string
  try {
    pathname = new URL(url, BASE_URL).pathname
  } catch {
    return false
  }
  return BUSINESS_401_ENDPOINTS.has(`${(method ?? 'GET').toUpperCase()} ${pathname}`)
}

/**
 * `ApiError.endpoint` 形态的同一张表，给 `apiClient.ts` 的 `isAuthError` 用。
 *
 * 表本身留在本文件（运行时真正查它的是 {@link fetchWithAuth}），
 * 分类器那一档只是「拿到 ApiError 之后」的兜底。
 */
export const isBusiness401Endpoint = (endpoint: string): boolean =>
  BUSINESS_401_ENDPOINTS.has(endpoint)

/**
 * 预刷新期间跨过了会话边界，这条请求在**发出之前**就作废了。
 *
 * ⚠️ 刻意是**裸 `Error`，不是 `ApiError`、更不是认证错误**：它必须让
 * `apiClient.isAuthError` 判**假**。判真的后果是 `profileStore.settleError` /
 * `friendsStore.handleApiError` 走 `silentRedirectToLogin()`——而这条错误属于
 * **上一场**会话，拿它去清盘，被登出的正是刚登录的那位，也就是这道闸本来要保护
 * 的人。用例：`authedFetch.test.ts`「预刷新中途换人：不发请求，抛出的错误也不能
 * 被判成认证错误」。
 */
export const SESSION_CHANGED_BEFORE_SEND = '请求在发出前跨过了会话边界，已作废'

/**
 * 「我发这条请求时的那一场会话已经结束，而且**已经换了人**」。
 *
 * ## 为什么不能只问 `isLiveSession()`
 *
 * 因为**刷新失败本身就会结束会话**：`authStore.performRefresh` 的 catch 在
 * 刷新返回 401 时调 `get().clearAuth()`，而 `clearAuth()` → `endSession()` →
 * `crossSessionBoundary()` 会**把世代号加一**。于是「刷新失败」这条最普通的
 * 登出路径，走到下面的 catch 时 `isLiveSession()` 必然判假——只用它做闸，
 * 真正该登出的那次登出会被自己挡掉。这不是推理：先写成只问 `isLiveSession()`，
 * `profile.test.ts` 的「对照：普通端点刷新失败时**确实**会 clearAuth +
 * 跳登录页」当场变红（`hrefSpy` 零次调用）。
 *
 * 所以要分的是「世代号为什么变了」，而 `inDeadWindow` 正好答这一问：
 *
 * | 世代号 | 死窗口 | 含义 | 该怎么办 |
 * |---|---|---|---|
 * | 没变 | — | 还是同一场 | 照常清盘 / 跳转 |
 * | 变了 | 是 | **自己**这场结束了，没有下一场 | 照常清盘 / 跳转（清的是空盘，跳的是登录页，伤不到谁） |
 * | 变了 | 否 | 已经有**别人**登录了 | 什么都不做 |
 *
 * `isSessionLive()` 单独用不了（它在 B 登录的那一刻就又是真了，正是要挡的那格），
 * `pinSession()` 单独也用不了（上面第二行）。要的是两者的**合取**。
 */
const supersededByAnotherSession = (isLiveSession: () => boolean): boolean =>
  !isLiveSession() && isSessionLive()

/** 十份副本里逐字节相同的那个 `getAuthHeaders`（原样搬过来，一个字符没改）。 */
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

/**
 * 刷新失败后的登出跳转。
 *
 * 机制取九份副本的 `window.location.href`（不是 `apiClient` 那份的
 * `location.replace`）：`profile.test.ts` 的
 * 「对照：普通端点刷新失败时**确实**会 clearAuth + 跳登录页」盯的是 href 的
 * setter，而 href → replace 是一次**独立**的行为变更（少一条历史记录），
 * 不该混在合并里做。
 *
 * 两道闸取自 `apiClient` 那份，九份副本都没有，都是纯增益：
 * - `typeof window !== 'undefined'`：非浏览器上下文里原先直接 ReferenceError；
 * - `pathname !== ROUTES.auth.login`：已经在登录页时不再自跳一次。
 */
const redirectToLogin = (): void => {
  if (typeof window !== 'undefined' && window.location.pathname !== ROUTES.auth.login) {
    window.location.href = ROUTES.auth.login
  }
}

/** {@link fetchWithAuth} 的可选项。今天只有超时一项。 */
export interface AuthedFetchConfig {
  /**
   * 单次发送的超时上限（毫秒）。**不传 = 不设超时**。
   *
   * 默认值必须是「没有」：合并前九份副本调的是裸 `fetch`，一个超时都没有，
   * 而 `api/storage.ts` 的大文件传输正是那九份里的一员——给它套上
   * `apiClient` 那份的 30 秒，长传会开始以一句没有任何调用方解析的
   * 「请求超时，请检查网络连接」失败。所以超时改成**按调用点自选**：
   * `apiClient.get/post/put/delete` 显式传 30 秒（保持 `lowcode.ts` /
   * `diagnostic.ts` 原样），其余九个模块不传（保持原样）。
   *
   * 初次发送与 401 之后的重发**各算一份完整预算**，与合并前 `apiClient`
   * 的 `fetchWithTimeout` 行为一致（它也是每次调用新建一个 controller）。
   */
  readonly timeoutMs?: number
}

/**
 * 发一次请求。`timeoutMs` 缺省时就是裸 `fetch`——连 `AbortController` 都不建，
 * 于是调用方自带的 `options.signal` 原样透传。
 *
 * 传了 `timeoutMs` 时与调用方的 signal **合成**而不是覆盖。合并前
 * `apiClient.fetchWithTimeout` 写的是 `fetch(url, { ...options, signal:
 * controller.signal })`——`signal` 在展开之后，调用方传进来的那个被静默盖掉。
 * 今天没有生产调用点会撞上（全仓 `signal:` 只出现在 `AiChatPage.tsx` 自己的
 * fetch 里），但合并之后这一份是所有人的传输层，可取消请求的契约得先立对。
 */
const sendOnce = async (
  url: string,
  init: RequestInit,
  timeoutMs: number | undefined,
): Promise<Response> => {
  if (timeoutMs === undefined) {
    return fetch(url, init)
  }

  const controller = new AbortController()
  const callerSignal = init.signal
  const relayAbort = () => controller.abort(callerSignal?.reason)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  if (callerSignal) {
    if (callerSignal.aborted) relayAbort()
    else callerSignal.addEventListener('abort', relayAbort, { once: true })
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    // 只有**我们自己的**定时器开的枪才翻译成超时文案；调用方主动取消的
    // AbortError 原样上抛，否则调用方会收到一条它没做过的"超时"。
    if (timedOut && error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接', { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', relayAbort)
  }
}

/**
 * 全仓**唯一**一份带认证的 fetch。合并前是十份同名定义
 * （`grep -rn 'const fetchWithAuth' src | grep -v __tests__` 数出来是 10），
 * 八份逐字相同、`profile.ts` 多一个合取项、`apiClient.ts` 是另一套控制流。
 *
 * ## 三条不变量（每条都是本分支上真出过的 bug）
 *
 * 1. **只对 401 做刷新与登出**，不是 `>= 401`。本后端的 403 是普通权限不足
 *    （`apiEnvelope.isAuthApiError` 的注释记着这条口径），并进认证失败等于
 *    一次无解释登出。403 原样返回给解包层，抛成带 `status` 的 `ApiError`。
 * 2. **业务 401 不是会话失效**，见 {@link BUSINESS_401_ENDPOINTS}。
 * 3. **刷新只走 `authStore.refreshAccessToken()`**——单飞锁与刚轮换跳过窗口
 *    都在那个漏斗里，绕过去就等于给自己开一条不受单飞保护的路。
 *    这里**不设第二把锁**：`apiClient` 曾经在漏斗之上还压着一对模块级的
 *    `isRefreshing` / `refreshPromise`，而那一把不是会话内的，B 自己的 401
 *    会被 A 那一次在飞的刷新代答。用例：`sessionHandoff.test.tsx`
 *    「B 自己的 401 不会被 A 那一次 apiClient 刷新代答」。
 *
 * ## 会话钉：三个 await 之后各查一次
 *
 * 请求发起时快照了 `useAuthStore.getState()`，但快照攥着的 action 闭包是**活的**：
 * 落地时 `refreshAccessToken()` / `clearAuth()` 打的都是**当前**那个人的 store。
 * 所以每一个「await 之后才做、且会影响当前这场会话」的动作前面都要问一句
 * 「还是同一场吗」。合并前十份副本**一处都没有**在 await **之后**保护
 * **请求本身**，只有 `apiClient` 那份在预刷新失败时保护了跳转这个副作用。
 * 现在三处齐了：
 *
 * - **(a) 预刷新之后、拼头之前**。这是九份副本请求前唯一的悬挂点：不进这个
 *   分支时拼头与发送和调用方同步，边界插不进来；进了就有一个完整 RTT 的窗口，
 *   而 `getAuthHeaders()` 读的是**活的** store，于是 A 的 url/method/body
 *   会带着 B 的 bearer 发出去（跨会话重放）。换人了就**不发**，抛
 *   {@link SESSION_CHANGED_BEFORE_SEND}。
 * - **(b) 401 重试的刷新之后、重发之前**。同一个形状，同一个后果。
 *   判假时把原始 401 原样返回，一步都不往下走。
 * - **(c) (b) 的 catch 里**。九份副本在这里无条件 `clearAuth()` +
 *   跳登录页：边界若在那次 await 中间跨过去，被清盘并踢回登录页的是**刚登录
 *   的那位**。`apiClient` 那份是十份里唯一在这个位置查了钉的。换人了就不清盘、
 *   不跳转，但**照旧 rethrow**。
 *
 * ⚠️ (a) 与 (c) 问的是「**换人了没有**」（{@link supersededByAnotherSession}），
 * 不是「还是同一场吗」；(b) 问的才是后者。差别的来源是「刷新失败会自己结束
 * 会话」——`performRefresh` 在刷新回 401 时调 `clearAuth()`，世代号就此加一。
 * 只问世代号的话，最普通的那条登出路径会被自己这道闸挡掉。整张真值表与那次
 * 实测见 {@link supersededByAnotherSession}。
 *
 * 判假时**什么都不做**是 `pinSession` 自己写下的规矩：这条响应属于一场已经不
 * 存在的会话，对当前这场不构成任何证据，降级成别的清理动作只会换一种方式伤到
 * 当前这个人。
 *
 * ⚠️ 钉的判定与它保护的 `getAuthHeaders()` + `sendOnce()` 之间**不能再插入
 * await**，否则判定就是 TOCTOU。这是对代码写法的约束，不只是对判据的约束。
 *
 * ## 401 之后交回调用方的是 `Response`，不是异常
 *
 * 九份副本在活会话里把 401 原样 `return`，解包层
 * （`readEnvelope` / `assertEnvelopeOk`）再抛成带后端原文的 `ApiError(401)`；
 * `apiClient` 那份则**从不**把活会话的 401 交回调用方——它 `silentRedirectToLogin()`
 * 之后抛 `AuthenticationError`。合并取前者，理由在调用方那一侧：
 * `apiClient` 仅有的两个消费者 `lowcode.ts` / `diagnostic.ts` 都只读
 * `response.ok`、谁都不 catch，所以那条 throw + 跳转在它们眼里就是一次
 * 没有解释的导航。可见的错误可恢复，无解释的登出不可恢复。
 *
 * 这一条决定了三个具体分支，`apiClient` 那份原先三个都不一样：
 * - **401 但根本没有 refresh token**：原样返回 401（`apiClient`：跳转 + 抛）。
 * - **刷新后重发仍然 401**（refresh token 真的死了）：原样返回第二个 401
 *   （`apiClient`：跳转 + 抛 `AuthenticationError('Token 刷新后认证仍然失败')`）。
 * - **预刷新失败**：记日志照发（`apiClient`：抛 + 跳转，一次网络抖动就是一次
 *   强制登出）。
 *
 * 代价写明：`lowcode.ts` / `diagnostic.ts` 的行为**变了**——上面三种情况下
 * 它们现在拿到 401 `Response` 并抛出自己那条可见的 `Error('…失败')`，
 * 而不是被静默送去登录页。这是全仓唯一因本次合并而改变的调用方行为。
 */
export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {},
  config: AuthedFetchConfig = {},
): Promise<Response> => {
  const authStore = useAuthStore.getState()
  const isLiveSession = pinSession()

  // 临期预刷新。失败**不致命**：九份副本的做法是记一条日志照发不误，旧 token
  // 通常还没真的过期，请求多半照样成功；`apiClient` 那份则是抛错 + 跳登录页，
  // 于是一次网络抖动就变成一次强制登出。取前者。
  if (authStore.checkTokenExpiry() && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
    } catch (error) {
      console.error('Failed to refresh token:', error)
    }
    // 闸 (a)：见函数注释。下面到 `sendOnce` 之间没有 await。
    // 用「换人了没有」而不是「还是同一场吗」：预刷新以 401 失败时
    // `performRefresh` 自己会 `clearAuth()`，世代号必然已经变过一格，
    // 而那一格里没有别人——照旧把请求发出去（不带 token，401 交给调用方），
    // 与合并前九份副本一字不差。理由见 {@link supersededByAnotherSession}。
    if (supersededByAnotherSession(isLiveSession)) {
      throw new Error(SESSION_CHANGED_BEFORE_SEND)
    }
  }

  const headers = getAuthHeaders()

  let response = await sendOnce(
    url,
    { ...options, headers: { ...headers, ...options.headers } },
    config.timeoutMs,
  )

  // ⚠️ `isLiveSession()` 不是可选项：`authStore.refreshToken` 是**发起时**的快照，
  // 上一场会话的 401 照样能满足它，而 `refreshAccessToken()` / `clearAuth()` 打的是
  // 当前那个人的 store——清盘会把刚登录的那位连同他的 aiApiKey 一起清掉。
  // 判假时什么都不做，把 401 原样交回调用方。
  if (
    response.status === 401 &&
    authStore.refreshToken &&
    isLiveSession() &&
    !isBusiness401Request(options.method, url)
  ) {
    try {
      await authStore.refreshAccessToken()
      // 闸 (b)：见函数注释。下面到 `sendOnce` 之间没有 await。
      // 这一处用的是**严格**的 `isLiveSession()`，不是 (a)(c) 那个
      // 「换人了没有」：能走到这里说明刷新**成功**了，而成功的刷新不会自己
      // `clearAuth()`，所以世代号一变就只可能是真的跨了边界（换人，或者
      // 用户在这期间登出了）。两种情况都不该重发——判假时什么都不做，
      // 把原始 401 原样交回调用方。
      if (!isLiveSession()) {
        return response
      }
      const newHeaders = getAuthHeaders()
      response = await sendOnce(
        url,
        { ...options, headers: { ...newHeaders, ...options.headers } },
        config.timeoutMs,
      )
    } catch (error) {
      // 闸 (c)：见函数注释。清盘与跳转要钉，rethrow 不用——抛错本身不碰
      // 当前这场会话，而 `sessionHandoff.test.tsx`「B 自己的 401 不会被 A
      // 那一次 apiClient 刷新代答」里 A 那条请求等的就是一个 reject。
      if (!supersededByAnotherSession(isLiveSession)) {
        console.error('Token refresh failed, redirecting to login')
        authStore.clearAuth()
        redirectToLogin()
      }
      throw error
    }
  }

  return response
}
