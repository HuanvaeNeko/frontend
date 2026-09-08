import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '../lib/apiConfig'
import { ApiError, isAuthApiError } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { pinSession } from '@/lib/sessionScope'

const BASE_URL = getApiBaseUrl()

// 请求超时时间（毫秒）
const REQUEST_TIMEOUT = 30000

/**
 * 认证错误类
 * 用于区分认证相关的错误和其他错误
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

/**
 * 前端**自己**写死的「未认证」哨兵文案，**整串相等**才算命中。
 *
 * 这里原本是一张关键词表（`'token'` / `'无效'` / `'过期'` / `'invalid'` /
 * `'登录'` / `'认证'` …）配 `message.includes(keyword)`，也就是拿**后端任意
 * 一句话**当分类依据。而 `isAuthError` 判真 = 用户基本得不到任何解释
 * （消费点见下方 `isAuthError` 的注释），于是：
 *
 *   `PUT /api/profile` 的校验失败文案，逐字是
 *   `"Validation error: email: Invalid email format"`
 *   （`backend-docs/profile/个人资料管理.md:213`）——含 `invalid`，
 *   于是"邮箱格式不对"被判成会话失效，`clearAuth()` + `location.replace('/login')`；
 *   而当时 `profileStore.updateProfile` 命中这一档后是 `return` 不是 `throw`，
 *   `ProfilePage` 拿到一个 resolve 的 promise，照样弹绿色的「个人资料已更新」。
 *   一次被拒绝的编辑 = 成功提示 + 无解释登出。
 *
 * 删掉 `'invalid'` 救不活这张表：`'过期'` 会命中"该分享链接已过期"，
 * `'登录'` 会命中"请在登录设备上确认"，`'token'` 会命中 bot 模块的
 * "bot token 无效"（`backend-docs/bots/Bot平台API.md:630`）。
 * **凡是猜后端文案的分类都是同一个 bug**，区别只是哪天撞上。
 *
 * 现在只剩两条，且都是**本仓库源码里的字符串常量**、不是后端文案。
 * `src/api/__tests__/apiClient.test.ts` 的「哨兵两端一致」两条用例是真的从
 * **抛出点**取错误的（`authStore.refreshAccessToken()` / `friendsApi`
 * 在没有 user_id 时），所以抛出点或本表任一端改文案都会红；
 * 只断言 `isAuthError(new Error('用户未登录'))` 的那条用例做不到这一点，
 * 它只钉本表自己。
 */
const FRONTEND_AUTH_SENTINELS: ReadonlySet<string> = new Set([
  // `src/features/auth/store/authStore.ts` 的 `refreshAccessToken`：
  // 调用时连 refresh token 都没有（典型是另一个并发失败刚 `clearAuth()` 过），
  // 会话确实没了。各模块 `fetchWithAuth` 副本的 401 分支 catch 到它之后
  // 原样 rethrow，于是它以裸 `Error` 的形态到达这里。
  'No refresh token available',
  // `src/features/chat/api/friends.ts` 四处（sendFriendRequest / approve /
  // reject / removeFriend）：拿不到自己的 user_id 就不发请求。
  '用户未登录',
])

/**
 * HTTP 状态码是 401、但**语义是业务失败**的端点。
 *
 * 「401 ⇒ 会话失效」在本后端有写在文档正文里的反例：
 *
 * - `PUT /api/profile/password`（`backend-docs/profile/个人资料管理.md:288`
 *   的「### 4. 修改密码（受保护）」一节，端点行 :290）：**旧密码填错返回 401**，
 *   body 是 `{"error": "Old password is incorrect"}`（同节 :329-333；:345 又写了
 *   一遍「旧密码验证失败返回 401 状态码」）。
 * - 旁证（两个分类器都到不了，webrtc 侧谁都没接）：
 *   `POST /api/webrtc/rooms/{id}/join` 的**房间密码错误也是 401**
 *   （`backend-docs/webrtc/WebRTC房间.md:228` 错误码表：`| 401 | 密码错误 |`）。
 *   列出来是为了说明"401 不等于会话失效"在这个后端不是孤例。
 *
 * ## 谁真的会读这张表（别再把第 2 条当防线）
 *
 * 1. **`src/features/profile/api/profile.ts` 那份 `fetchWithAuth` 的 401 分支
 *    （经 {@link isBusiness401Request}）——打错密码时唯一真正执行到的代码。**
 *    它见到 401 会「刷新 token → 把同一个密码请求原样重发一遍」，刷新失败则
 *    `clearAuth()` + `location.href = /app/login`。不查这张表，一次打错当前密码
 *    = 轮换掉一对 token + 向后端重放一次错误密码（可能撞上后端的失败计数）
 *    + 刷新失败时无解释登出。
 * 2. `isAuthError` —— 只兜「已经拿到 `ApiError` 之后」的分类。
 *    **今天没有任何活路径能把 `PUT /api/profile/password` 的 `ApiError` 送进来**：
 *    两个 UI（`ProfilePage.tsx` / `ProfileModal.tsx`）都直接
 *    `await profileApi.changePassword(...)` 并自己弹 destructive toast，
 *    不经过 `isAuthError` 的任何消费点；原先唯一会经过的
 *    `profileStore.changePassword` 是零调用点的死代码，已随本批删除。
 *    这一档保留下来，是为了「将来谁把这个端点接进 store / `safeApiCall` 时
 *    不必重新发现这条规则」，**不是当下拦住静默登出的那道防线**。
 *
 * 表里的字符串必须与 `ApiError.endpoint`、以及「方法 + URL 的 pathname」
 * 两侧都逐字一致，两侧各有用例钉住（都在
 * `src/features/profile/api/__tests__/profile.test.ts`）：
 * - 端点串一致：「旧密码错误的 401 抛 ApiError，端点字段可被白名单识别」——
 *   实测把 `profile.ts` 的抛出点改成 `.../passwords` 会红；
 * - 表与真实请求一致：「旧密码错误的 401：不刷新、不重发、不轮换 token」——
 *   实测删掉本表这一项会变成 3 次 fetch + token 轮换 → 红；
 * - 不登出：「旧密码错误的 401：即使刷新会失败，也不清 token、不跳登录页」——
 *   刷新失败才是登出真正会发生的那一支，配一条正对照钉住 `profile.ts:73` 的跳转。
 *
 * ⚠️ **加一行不等于全局生效**：这张表只在调用了 {@link isBusiness401Request} 的
 * 那份 401 分支里被查，今天只有 `profile.ts` 一处调。给别的模块的端点加一行，
 * 在那个模块里是空操作——详见 {@link isBusiness401Request} 的注释。
 */
const BUSINESS_401_ENDPOINTS: ReadonlySet<string> = new Set(['PUT /api/profile/password'])

/**
 * 这个**请求**（方法 + 路径）是不是业务 401 端点。
 *
 * 给各份 `fetchWithAuth` 副本在 401 分支上用：那时手里只有 `url` 与
 * `options.method`，还没有 `ApiError`，没法走 `isAuthError`。
 *
 * ## ⚠️ 往 `BUSINESS_401_ENDPOINTS` 加一行**不会**自动全仓库生效
 *
 * 这张表只在**调用了本函数**的那份 401 分支里被查。全仓库有**十份**
 * `fetchWithAuth` 定义——`grep -rn 'const fetchWithAuth' src | grep -v __tests__`
 * 数出来是 10：`apiClient` 导出的这份 + 九份模块副本
 * （auth / profile / friends / messages / groupMessages / groups / webrtc /
 * storage / discovery）。今天**只有一处**调本函数：
 *
 * - `src/features/profile/api/profile.ts` 的 `fetchWithAuth`，401 分支上那个
 *   `!isBusiness401Request(...)` 合取项 —— 唯一的生产调用点。
 *
 * 其余九份的 401 分支**不查这张表**（条件里只有状态码、`refreshToken`
 * 和 `isLiveSession()`），所以给别的模块的端点加一行，在那个模块里**是空操作**：
 * 那条请求照旧刷新 token、原样重发一遍、刷新失败就静默登出。
 *
 * 让它生效必须在那份副本的 401 分支上显式接进来（`&& !isBusiness401Request(
 * options.method, url)`），一份一份地接。「多份 `fetchWithAuth` 合一」的工作
 * 正在进行中，合并之后接手的那份也照样得调这一个函数——合并本身不会替谁接。
 *
 * **表只此一张**：副本里不要再抄一份字符串，要接就接这个函数。
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
 * 判断是否是认证相关的错误。
 *
 * **判真基本等于用户看不到任何解释**，三个消费点：
 * - `profileStore.settleError`（`loadProfile` / `updateProfile` / `uploadAvatar`
 *   三个 action 共用）与 `friendsStore.handleApiError`（七个 action 共用）
 *   走 `silentRedirectToLogin()`（`clearAuth()` + `location.replace('/login')`，
 *   不弹任何提示）；
 * - `chatStore.syncMessages` 判真后只是把 `console.error` 降级成 `console.warn`，
 *   两条分支都 `throw`——它是唯一一个判真不静默的消费点。
 * 所以宁可漏判（错误可见地抛给用户）也不能误判。
 * （本文件的 `safeApiCall` 是第四处调用，但它全仓库零调用点，
 * 不算在"三个"里；它判真后 `return null`，同样是静默形态。）
 *
 * 三档，从可靠到不可靠：
 * 1. `AuthenticationError` —— 本文件自己抛的，最可信。
 * 2. `ApiError` —— 带真实 HTTP 状态码。**有状态码就只看状态码，一个字都不猜**：
 *    - 401 判真（`isAuthApiError`，401-only 的理由见它的注释），
 *      但 `BUSINESS_401_ENDPOINTS` 里的端点除外——**这条排除今天没有活的
 *      生产者**（改密码的真实路径在 `profile.ts` 的 401 分支上，见
 *      `BUSINESS_401_ENDPOINTS` 注释的「谁真的会读这张表」）；
 *    - **其余状态码一律判假并就地返回**，不再落到第 3 档。
 *      这一步是本次修复的要害：`PUT /api/profile` 的 400 校验错误
 *      正是在这里被挡下的，而不是靠"关键词表里恰好没有那个词"。
 *    - `403` 依旧判假（普通权限不足，详见 `isAuthApiError` 的注释）。
 * 3. 哨兵文案整串相等 —— 只兜前端自己抛的两条裸 `Error`，见
 *    `FRONTEND_AUTH_SENTINELS`。**不做子串匹配，不看后端文案。**
 *
 * 代价说清楚：还没带上状态码的裸 `Error`（例如 `storage.ts` 的 `uploadChunk`——
 * 分片直传走的是 XHR 而不是 `fetchWithAuth`，失败时抛的是
 * `new Error('分片上传失败: HTTP 403')` / `new Error('网络错误')`，没有 `status`）
 * 若真是会话失效，这里会漏判 → 错误照常上抛、用户看到一条可见的失败提示，
 * 而不是被静默送去登录页。这是刻意选的方向：可见的错误提示是可恢复的，
 * 无解释的登出不是。
 *
 * （这里原先举的例子是 profile 的 `uploadAvatar`。那个例子已经过期：它现在整条走
 * `storageApi.uploadAvatar` → `readEnvelope`，后端失败一律是带真实状态码的
 * `ApiError`，落在上面第 2 档而不是这一档。段落的方向没变，换的只是例子。）
 */
const isAuthError = (error: Error | string): boolean => {
  // AuthenticationError 直接返回 true
  if (error instanceof AuthenticationError) {
    return true
  }

  // 有状态码就不猜词：认下 401（业务 401 端点除外），其余一律不是认证错误。
  if (error instanceof ApiError) {
    return isAuthApiError(error) && !BUSINESS_401_ENDPOINTS.has(error.endpoint)
  }

  const message = typeof error === 'string' ? error : error.message
  return FRONTEND_AUTH_SENTINELS.has(message)
}

/**
 * 静默重定向到登录页面
 * 不抛出错误，不显示 Toast
 */
const silentRedirectToLogin = () => {
  const authStore = useAuthStore.getState()
  authStore.clearAuth()
  
  // 使用 replace 而不是 href，避免在历史记录中留下痕迹
  if (typeof window !== 'undefined' && window.location.pathname !== ROUTES.auth.login) {
    window.location.replace(ROUTES.auth.login)
  }
}

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

/**
 * 带超时控制的 fetch 封装
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeout: number = REQUEST_TIMEOUT
): Promise<Response> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接', { cause: error })
    }
    throw error
  }
}

/**
 * 尝试刷新 Token。返回 true 表示刷新成功，false 表示刷新失败。
 *
 * 只做一件事：把 `refreshAccessToken()` 的「抛错 / 不抛错」翻译成 `boolean`。
 *
 * ## 这里**没有**第二把单飞锁，是有意的
 *
 * 原来这个函数自带一对模块级的 `isRefreshing` / `refreshPromise`，并发调用共享
 * 同一个 promise。那把锁与 `authStore.refreshAccessToken` 的 `refreshInFlight`
 * 做的是同一件事，而两者只有下面那一把是**会话内**的（`registerSessionReset`
 * 跨边界置空，`.finally` 只清自己占的槽位）。上面这一把不是，后果实测过：
 *
 *   A 的请求 401 → 刷新挂起 → `clearAuth()` → B 登录 → B 自己的请求 401 →
 *   命中 `isRefreshing && refreshPromise`，拿到的是 **A** 那一次的 promise →
 *   A 断网失败 → B 这条 401 分支读到 `refreshed === false`，而
 *   `isLiveSession()` 在 B 的会话里判**真** → `silentRedirectToLogin()` →
 *   `clearAuth()` 把刚登录的 B 连同他的 `aiApiKey` 一起清掉。
 *
 * 修法不是「再给这一把也接上边界回调」，而是**把它删掉**：去重本来就发生在
 * 下面那个漏斗里（十份 `fetchWithAuth` 副本和 `wsStore` 都调到同一个
 * `refreshAccessToken`，锁放在那里才对所有人生效），上面这一把提供不了任何
 * 额外的去重，只多出一个必须被单独维护成会话内的状态。删掉之后，
 * 「apiClient 有一把没被会话作用域化的锁」这件事在结构上不可能复发。
 *
 * 钉住它的用例：`sessionHandoff.test.tsx`「B 自己的 401 不会被 A 那一次
 * apiClient 刷新代答」——把这对模块级变量加回来，那条必红。
 */
const tryRefreshToken = async (): Promise<boolean> => {
  const authStore = useAuthStore.getState()

  if (!authStore.refreshToken) {
    return false
  }

  try {
    await authStore.refreshAccessToken()
    return true
  } catch (error) {
    console.warn('Token 刷新失败:', error)
    return false
  }
}

/**
 * 带自动重试和超时的 fetch 封装
 * 当遇到认证错误时，自动尝试刷新 Token 或静默重定向到登录页面
 *
 * ## `isLiveSession()` —— 这条响应还属于当时那一场会话吗
 *
 * 请求发起时这里快照了 `useAuthStore.getState()`，但快照里攥着的 action 闭包是
 * **活的**：响应回来时 `tryRefreshToken()` / `silentRedirectToLogin()` 打到的是
 * **当前**那个人的 store。于是 A 登出前发出的请求若在 B 登录之后才收到 401，
 * 它会拿 B 的 token 去刷新，刷不动就调 B 的 `clearAuth()` —— 反向名单清盘，
 * 把刚登录的 B 连同他的 `aiApiKey` 一起清掉。三道防线一条都拦不住它：
 * 世代号只挡写入不挡副作用，闸门在 B 的会话里是开着的，而清盘正是施害者本身。
 *
 * 所以 401 分支要先问一句「这条响应还属于我发它时那一场会话吗」。判假时**什么都
 * 不做**，把 401 原样交给调用方：这条响应对当前这场会话不构成任何证据，
 * 降级成别的清理动作只会换一种方式伤到当前这个人。
 *
 * ## ⚠️ 采用情况：十份 `fetchWithAuth` 里接了九份
 *
 * 和 {@link isBusiness401Request} 一样，`pinSession()` **不会**自动全仓生效——
 * 它得在每份副本的 401 分支上各接一行 `&& isLiveSession()`。已接九份：
 * 本文件 + `features/auth/api/auth.ts` + `features/chat/api/friends.ts` /
 * `messages.ts` / `groupMessages.ts` / `groups.ts` +
 * `features/webrtc/api/webrtc.ts` + `api/storage.ts` + `api/discovery.ts`。
 * 后八份的函数体（去掉注释与空白）**逐字相同**，本文件这份不同（多了超时、
 * `skipAuthRedirect`、以及刷新后仍 401 的分支）。
 *
 * **还没接的一份**：`features/profile/api/profile.ts`——它归另一场并行的
 * 「多份 fetchWithAuth 合一」，本批不碰。它的 401 分支也是全仓唯一一个带
 * 第三个合取项 `!isBusiness401Request(...)` 的，所以那句"八份逐字相同"
 * 对它本来也不成立。
 *
 * ## 这一行比 `performRefresh` 的世代号对照多挡住了什么
 *
 * `performRefresh` 的 catch 已经对照世代号，**每一份副本都白拿**这层保护：
 * 上一场会话里发出的刷新落地时不会去清当前这个人的票据。但那条只管
 * 「一次**已经发出**的刷新落地时怎么办」，而本行管的是「上一场会话的 401
 * 回来时，要不要**发起一次新的**刷新」。不挡的话，`refreshAccessToken()` 用的是
 * **当前这个人的** refresh token，属于他自己的一次刷新，世代号对照全程判真：
 *
 * 1. 刷新成功 ⇒ A 的那条请求被带着 **B 的** access token 原样重发。跨会话重放：
 *    请求内容是 A 的，身份是 B 的。世代号对照拦不住——它只看写入，不看请求。
 * 2. 刷新失败（B 的网络抖一下就够）⇒ 副本的 catch 跑 `clearAuth()` +
 *    `window.location.href`，刚登录的 B 被清盘并踢回登录页。
 * 3. 无论成败都白轮换一次 B 的 token。
 *
 * 所以这不是"把一个已经很窄的窗口再收窄一点"，第 1 条是漏斗**完全没有**覆盖的
 * 一类。九份各自钉了一条用例，逐个删掉那个合取项都必红：
 * 七份模块副本在 `src/api/__tests__/sessionScopedFetchWithAuth.test.ts`
 * （`describe.each` 一份一条，报出来带模块名）；`auth.ts` 那份在
 * `sessionHandoff.test.tsx`「A 登出前发出的请求在 B 的会话里才 401」；
 * 本文件这份在 `src/api/__tests__/apiClient.test.ts`
 * 「换人之后才落地的 401：原样返回，不刷新、不跳转、不清 B 的盘」。
 */
export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {},
  skipAuthRedirect = false
): Promise<Response> => {
  const authStore = useAuthStore.getState()
  const isLiveSession = pinSession()

  // 检查 Token 是否即将过期，如果是则预先刷新
  if (authStore.checkTokenExpiry() && authStore.refreshToken) {
    const refreshed = await tryRefreshToken()
    if (!refreshed && !skipAuthRedirect) {
      // 只在还是同一场会话时才跳转：这次刷新期间若换了人，被登出的会是刚登录的那位。
      // 无论如何都抛错，让调用者知道认证失败，而不是让 Promise 永久挂起。
      if (isLiveSession()) silentRedirectToLogin()
      throw new AuthenticationError('Token 刷新失败，正在重定向到登录页面')
    }
  }

  const headers = getAuthHeaders()

  let response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  // 上一场会话的 401：一步都不往下走，原样把响应交给调用方（见函数注释）。
  if (response.status === 401 && !isLiveSession()) {
    return response
  }

  // 如果 Token 过期，尝试刷新后重试一次
  if (response.status === 401) {
    const refreshed = await tryRefreshToken()

    if (refreshed) {
      // 刷新成功，重试请求
      const newHeaders = getAuthHeaders()
      response = await fetchWithTimeout(url, {
        ...options,
        headers: {
          ...newHeaders,
          ...options.headers,
        },
      })
      
      // 如果刷新后仍然 401，说明 refresh token 也无效
      if (response.status === 401) {
        if (!skipAuthRedirect && isLiveSession()) {
          silentRedirectToLogin()
        }
        // 无论是否跳过重定向，都抛出明确的认证错误
        throw new AuthenticationError('Token 刷新后认证仍然失败')
      }
    } else {
      if (!skipAuthRedirect && isLiveSession()) {
        // 刷新失败，静默重定向
        silentRedirectToLogin()
      }
      // 无论是否跳过重定向，都抛出明确的认证错误
      throw new AuthenticationError('Token 刷新失败，需要重新登录')
    }
  }

  return response
}

/**
 * 安全的 API 调用包装器
 * 自动处理认证错误，不会向用户显示认证相关的错误提示
 */
export const safeApiCall = async <T>(
  apiCall: () => Promise<T>,
  options?: {
    onAuthError?: () => void
    skipAuthRedirect?: boolean
  }
): Promise<T | null> => {
  try {
    return await apiCall()
  } catch (error) {
    if (error instanceof Error && isAuthError(error)) {
      // 认证错误，静默处理
      if (options?.onAuthError) {
        options.onAuthError()
      } else if (!options?.skipAuthRedirect) {
        silentRedirectToLogin()
      }
      return null
    }
    // 非认证错误，继续抛出
    throw error
  }
}

/**
 * 通用 API 客户端，自动处理认证和超时
 */
export const apiClient = {
  get: async (path: string, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, { ...options, method: 'GET' })
  },

  post: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  put: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  delete: async (path: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(`${BASE_URL}${path}`, {
      ...options,
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    })
  },
}

export { isAuthError }
