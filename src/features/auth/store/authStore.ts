import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthStore, LoginRequest, RegisterRequest } from '../types/auth'
import { authApi } from '../api/auth'
import { getAuthApiUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { ApiError, assertEnvelopeOk, type Parser, readEnvelope } from '@/lib/apiEnvelope'
import {
  beginSession,
  currentSessionGeneration,
  endSession,
  isSameSession,
  isSessionLive,
  registerSessionReset,
  sessionScopedLocalStorage,
} from '@/lib/sessionScope'

/**
 * `POST /api/auth/login` 与 `POST /api/auth/refresh` 的 data 部分。
 *
 * 展示字段（昵称/邮箱/头像/签名）在登录响应里没有文档保证，一律可选；
 * 后端在 profile 模块用的是带 `user_` 前缀的命名
 * （backend-docs/profile/个人资料管理.md:66-72、:88-92 全是 `user_nickname`
 * / `user_email` / `user_avatar_url` / `user_signature`，无一处是无前缀名），
 * 而前端历史代码读的是无前缀名——两种都收，由 {@link authTokenPayload}
 * 归一成无前缀名，免得下游还要各认一套。
 */
interface AuthTokenPayload {
  access_token: string
  refresh_token: string
  expires_in: number
  nickname?: string
  email?: string
  avatar_url?: string
  signature?: string
}

function optionalString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return undefined
}

/**
 * token 三件套的校验器，login 与 refresh 共用。
 *
 * ## 为什么用 `parse` 而不是 `require`
 *
 * `require` 的判定是 `payload[key] === undefined`，**`null` 算「存在」**
 * （见 apiEnvelope.ts 里 EnvelopeOptions.require 的说明）。而本次 bug 里
 * 最难发现的一环正是 `tokenExpiry = Date.now() + undefined * 1000 = NaN`：
 * NaN 是 falsy，`checkTokenExpiry()` 的 `if (!tokenExpiry) return false`
 * 让它永远返回 false，主动续期永不触发，故障永不自愈。
 * `require: ['expires_in']` 挡不住 `expires_in: null`，会把同一个 NaN
 * 原样放行，所以这里必须做类型级校验，而不是存在性校验。
 *
 * 校验失败抛错、绝不写默认值：`expires_in` 兜底成 3600 会让"后端少给字段"
 * 变成一个看不见的状态，正是这批 bug 的成因。
 */
const authTokenPayload: Parser<AuthTokenPayload> = {
  parse(input: unknown): AuthTokenPayload {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error(`应为对象，实际是 ${input === null ? 'null' : typeof input}`)
    }
    const payload = input as Record<string, unknown>

    const accessToken = payload.access_token
    if (typeof accessToken !== 'string' || accessToken === '') {
      throw new Error('access_token 缺失或不是非空字符串')
    }
    const refreshToken = payload.refresh_token
    if (typeof refreshToken !== 'string' || refreshToken === '') {
      throw new Error('refresh_token 缺失或不是非空字符串')
    }
    const expiresIn = payload.expires_in
    if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) {
      throw new Error('expires_in 缺失或不是有限数字（tokenExpiry 会变成 NaN）')
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      nickname: optionalString(payload.user_nickname, payload.nickname),
      email: optionalString(payload.user_email, payload.email),
      avatar_url: optionalString(payload.user_avatar_url, payload.avatar_url),
      signature: optionalString(payload.user_signature, payload.signature),
    }
  },
}

/**
 * login / refresh 两个端点的「可能仍是裸响应」豁免。
 *
 * 两份后端文档口径冲突，且冲突就在这两个端点上：
 * - `backend-docs/auth/用户登录注册鉴权部分.md:37` 写 `login.data.access_token`
 *   （信封），:46 写 `login.data.refresh_token`；
 * - `backend-docs/README.md:216-217` 的 Token 管理示例却是
 *   `const data = await res.json(); saveTokens(data.access_token, ...)`
 *   ——裸读；
 * - README.md:371-375 的 2026-03-08「统一 API 响应格式」变更日志逐条列出了
 *   friends 三个端点、`GET /api/auth/devices`、`GET /api/ai/voice_profiles`，
 *   **唯独没有 login / refresh**。
 *
 * 赌错方向的代价不对称：devices 猜错只是设备页报错，login 猜错是**全站
 * 登不进去**，而且后面 friends / storage 两个模块的修复都没法验证。所以这一处
 * 显式承认两种形状都可能出现——但走 `legacyBare` 而不是 `?? body`：
 * 命中裸响应时每次都打 console.warn，`grep legacyBare` 就能列出全部欠账，
 * 且 `{success:true, data:null}` 仍然照抛不误（`?? body` 会把它变成读整个信封，
 * 又退回原来的 undefined 症状）。
 *
 * 清理办法（一条 curl 即可定论，不需要改代码就能验）：
 *   curl -s -X POST https://api.huanvae.cn/api/auth/login \
 *     -H 'Content-Type: application/json' -d '{"user_id":"...","password":"..."}' | jq 'keys'
 * 输出 ["code","data","success"] 即确认信封，删掉本常量的两个使用点即可。
 */
const AUTH_TOKEN_LEGACY_BARE = {
  until: '2026-12-31',
  reason: '后端文档口径冲突：auth 文档:37 是信封，README:217 是裸读，且 README 变更日志未列入 login/refresh，待 curl 实测后删除',
} as const

/**
 * 刷新单飞锁：正在进行的 `POST /api/auth/refresh`，并发调用者共享它。
 * 放在模块级而不是 store state 里：它不该被 persist 落盘，也不该触发订阅者重渲染。
 *
 * ⚠️ 它是**会话内**的锁，见下面那个边界回调：跨过会话边界必须置空。不置空的话，
 * A 那一次还在飞的刷新会被交给 B——每一份 `fetchWithAuth` 都把"刷新失败"当成
 * "该登出了"，于是 A 的一次网络失败（或那句 `Token refresh landed after session
 * end`）会让刚登录的 B 被清盘 + 踢回登录页。
 */
let refreshInFlight: Promise<void> | null = null

/** 上一次成功轮换 token 的时刻（毫秒时间戳）；0 = 本场会话内还没轮换过。 */
let lastRotatedAt = 0

/**
 * 轮换之后多久以内的再次刷新请求视为「同一批旧 token 请求引发的级联」而直接跳过。
 * 10 秒远大于一批并发请求的往返时间，又远小于 access token 的 15 分钟有效期。
 */
const RECENT_ROTATION_WINDOW_MS = 10_000

/**
 * 这两个模块级变量都是**这一场会话**的状态，所以挂在会话边界上一起清，而不是
 * 在 `clearAuth` 里手写一行——`clearCredentials` 与 `login` 都不经过 `clearAuth`，
 * 手写那一行只覆盖三条路径里的一条。
 *
 * - `refreshInFlight`：理由见上。
 * - `lastRotatedAt`：「刚轮换过就跳过」是用来压级联的。它跨会话活着的话，B 登录后
 *   10 秒内、且 token 不临期的那次刷新会被当成 A 那一批级联而跳过。
 */
registerSessionReset(() => {
  refreshInFlight = null
  lastRotatedAt = 0
})

/**
 * 落盘格式版本。`1` = `user.avatar_url` 是**绝对地址**。
 *
 * 版本号从"没有版本号"（zustand 视作 `0`）跳到 `1`：`main` 上写的是
 * `avatar_url: data.avatar_url`，也就是后端原样给的**相对路径**
 * （`backend-docs/profile/个人资料管理.md:98`：
 * 「`user_avatar_url` | string\|null | 头像相对路径（需拼接 `STORAGE_BASE_URL`）」，
 * 样例见 :74 `"user_avatar_url": "avatars/testuser001.jpg?t=1706000000"`），
 * 本分支才改成 `toAbsoluteApiUrl(...)`。`auth-storage` 此前没有 version 也没有
 * migrate，`refreshAccessToken` 又从不重写 `user`，所以**每一个已部署用户**
 * 的落盘值都会一直是相对路径。
 */
const AUTH_PERSIST_VERSION = 1

/**
 * 把落盘的旧值搬到当前格式：只做一件事——`user.avatar_url` 补基址。
 *
 * ## 为什么值得迁移（以及一条曾经写在这里的**错误**理由）
 *
 * 本仓的约定是「头像路径在 api 出口一次性补成绝对地址」：`friends.ts` 的三个
 * `absoluteAvatar`、`groups.ts` / `discovery.ts` / `profile.ts` 的出口都这么做，
 * 于是所有 store 里的 `*_avatar_url` 都是绝对地址，渲染点直接用。`user.avatar_url`
 * 走的是同一条约定，迁移让**已经落盘的旧值**也回到这个不变量上，
 * 免得"store 里的头像字段都是绝对的"这句话有一个例外。
 *
 * ⚠️ 此处**曾经**写着另一条理由：「`VideoMeeting` 把 `user?.avatar_url` 直接发给
 * 后端当会议头像，所以必须在源头改成绝对地址」。那条理由是反的——
 * `POST /api/webrtc/rooms/{room_id}/join` 的请求体字段
 * (`backend-docs/webrtc/WebRTC房间.md:154`) 逐字写着
 * `"avatar_url": "avatars/guest.png?t=1706000000"  // 可选，头像相对路径`，
 * 创建房间同样（:72）。发绝对地址才是违约，而且基址被指向本地反代时发出去的会是
 * `http://127.0.0.1:8787/...`，后端原样转给房间里每一个人（:181 / :265 / :302）。
 * 那个发送点现在自己把值转回相对路径（见 `VideoMeeting` 的 `toApiRelativePath`），
 * 两边各按各的契约来，谁都不依赖对方的形状。
 *
 * ## 只搬 `avatar_url`
 *
 * `nickname` / `email` 的形状同样漂移过（`main` 写 `data.nickname || ''`，
 * 本分支写 `optionalString(...)`，即 `''` → `undefined`），但那是**观测不到**的漂移：
 * 全部消费点都是 `||` 兜底（`MessageItem` 的 `user?.nickname?.[0] || 'U'`、
 * `VideoMeeting` 的 `user?.nickname || '访客'`、`Navigation` 的首字母块），
 * `''` 和 `undefined` 一样落到兜底分支。给它写迁移，只能断言迁移函数自己的输出，
 * 那是一句同义反复，钉不住任何行为。
 *
 * `toAbsoluteApiUrl` 幂等（已带协议的原样返回），对已经绝对的值是 no-op；
 * `''` → `undefined`，也就是"没有头像"，正是 `User.avatar_url` 可选的含义。
 * 形状不认识时**原样返回**：迁移函数不是校验层，在这里编造一个默认 state
 * 只会把"落盘数据坏了"变成一个看不见的状态。
 */
export function migrateAuthPersist(persisted: unknown): unknown {
  if (typeof persisted !== 'object' || persisted === null) return persisted
  const state = persisted as { user?: unknown }
  if (typeof state.user !== 'object' || state.user === null) return persisted

  const user = state.user as { avatar_url?: unknown }
  if (typeof user.avatar_url !== 'string') return persisted

  return { ...state, user: { ...user, avatar_url: toAbsoluteApiUrl(user.avatar_url) } }
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      tokenExpiry: null,

      login: async (credentials: LoginRequest) => {
        try {
          const authBaseUrl = getAuthApiUrl()
          const requestBody = {
            user_id: credentials.user_id,
            password: credentials.password,
            device_info: credentials.device_info || navigator.userAgent,
            mac_address: credentials.mac_address || 'unknown',
          }

          console.log('🔐 登录请求 URL:', `${authBaseUrl}/login`)
          console.log('🔐 登录请求数据:', { ...requestBody, password: '***' })

          // 添加超时控制
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时

          try {
            const response = await fetch(`${authBaseUrl}/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            })

            clearTimeout(timeoutId)

            console.log('🔐 登录响应状态:', response.status, response.statusText)

          // 解包 + 校验一次完成：body 只读一次（response.text() 之后再 JSON.parse），
          // 成功分支和失败分支共用那一次读取，从结构上不可能出现
          // 「if (!response.ok) 里读一次、成功路径又读一次」的 body stream 二次消费。
          // 原来那段手写的 errorText/JSON.parse/message||error 提取逻辑
          // 已被 readEnvelope 的 message → error → details → HTTP 片段 取值顺序覆盖。
          const data = await readEnvelope<AuthTokenPayload>(response, {
            endpoint: 'POST /api/auth/login',
            fallbackMessage: '登录失败',
            parse: authTokenPayload,
            legacyBare: AUTH_TOKEN_LEGACY_BARE,
          })

          // 日志必须在校验之后：原来它印在 set() 之前、且与是否真拿到 token 无关，
          // 于是 token 为 undefined 时控制台照样写「登录成功，Token 已获取」。
          console.log('🔐 登录成功，Token 已获取')

          // 新会话从这一行开始，必须在 set() **之前**：beginSession 做的第一件事是
          // 清盘，放在 set() 之后会把刚落盘的新 token 一起删掉。它清的是上一场会话
          // 在"死窗口"里漏下的东西——`clearCredentials`（只清凭证）留下的那一份，
          // 以及将来某个没走 sessionScopedLocalStorage 的切片漏下的那一份。
          beginSession()

          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            // isAuthenticated 仍是 true，但现在它有意义了：走到这一行就说明
            // 三个 token 字段都通过了类型级校验。校验不过会在上面抛错，
            // 不会再出现「isAuthenticated=true 但 accessToken=undefined」的半登录态。
            isAuthenticated: true,
            tokenExpiry: Date.now() + data.expires_in * 1000,
            user: {
              user_id: credentials.user_id,
              // 展示字段没有 `?? ''` 兜底：缺失就是 undefined（未知），
              // 和后端真的返回空昵称区分得开。降级留在各展示点，
              // 那里本来就写着 `user?.nickname || '访客'` 之类，行为不变。
              nickname: data.nickname,
              email: data.email,
              // avatar_url 在这里补基址，与 friends / groups / discovery / profile
              // 四个 api 出口的 `absoluteAvatar` 是同一条约定：**store 里的头像字段
              // 一律是绝对地址**，渲染点直接用。
              //
              // 后端给的是相对路径：`backend-docs/profile/个人资料管理.md:98`
              // 「`user_avatar_url` | string\|null | 头像相对路径（需拼接
              // `STORAGE_BASE_URL`）」，样例 :74 是
              // `"user_avatar_url": "avatars/testuser001.jpg?t=1706000000"`。
              // `STORAGE_BASE_URL` 的定义在 `backend-docs/storage/文件存储管理.md:54-55`
              // （`// 存储基础地址（与 API 基础地址相同）`），:58-63 给的拼接 helper
              // 就是 `${STORAGE_BASE_URL}/${relativePath}`，与 toAbsoluteApiUrl 一致。
              //
              // ⚠️ 这条注释被写反过两次，两次都是因为查了仓库外那份**已过期**的
              // 旧文档快照（那时的样例还是指向 MinIO 的绝对地址）。认准
              // backend-docs 仓库，别再查那个目录。
              //
              // 反过来，把这个绝对地址**发回后端**的地方要自己转回相对路径：
              // webrtc 的 join / create 请求体明写「头像相对路径」
              // （`WebRTC房间.md:154` / `:72`），`VideoMeeting` 用 `toApiRelativePath`
              // 处理，不要求这里存相对值。
              avatar_url: toAbsoluteApiUrl(data.avatar_url),
              signature: data.signature,
            },
          })
          } catch (fetchError) {
            clearTimeout(timeoutId)
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              throw new Error('请求超时，请检查网络连接或后端服务是否正常', { cause: fetchError })
            }
            throw fetchError
          }
        } catch (error) {
          console.error('❌ 登录错误:', error)
          throw error
        }
      },

      register: async (data: RegisterRequest) => {
        try {
          const authBaseUrl = getAuthApiUrl()
          const requestBody = {
            user_id: data.user_id,
            nickname: data.nickname,
            email: data.email,
            password: data.password,
          }

          console.log('📝 注册请求 URL:', `${authBaseUrl}/register`)
          console.log('📝 注册请求数据:', { ...requestBody, password: '***' })

          // 添加超时控制
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)

          try {
            const response = await fetch(`${authBaseUrl}/register`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            })

            clearTimeout(timeoutId)

            console.log('📝 注册响应状态:', response.status, response.statusText)

          // 注册的返回体没有前端要读的字段，只需确认成功与否。
          // 用 assertEnvelopeOk 而不是保留手写的 `if (!response.ok)`：后者会把
          // 「HTTP 200 + success:false」当成注册成功，然后一头撞进自动登录，
          // 用户看到的是一条与注册失败无关的登录错误。
          await assertEnvelopeOk(response, {
            endpoint: 'POST /api/auth/register',
            fallbackMessage: '注册失败',
          })

          console.log('📝 注册成功，准备自动登录')

          // 注册成功后自动登录
          await get().login({
            user_id: data.user_id,
            password: data.password,
          })
          } catch (fetchError) {
            clearTimeout(timeoutId)
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              throw new Error('请求超时，请检查网络连接或后端服务是否正常', { cause: fetchError })
            }
            throw fetchError
          }
        } catch (error) {
          console.error('❌ 注册错误:', error)
          throw error
        }
      },

      logout: async () => {
        const { accessToken } = get()
        
        if (accessToken) {
          try {
            await authApi.logout()
          } catch (error) {
            console.error('Logout error:', error)
          }
        }

        get().clearAuth()
      },

      refreshAccessToken: async () => {
        const performRefresh = async (): Promise<void> => {
          const { refreshToken } = get()
          const authBaseUrl = getAuthApiUrl()

          if (!refreshToken) {
            throw new Error('No refresh token available')
          }

          // 发起时记下世代号，落地前对照。见 `lib/sessionScope.ts` 顶部
          // 「清盘是一个时点，而写入不是」。
          const session = currentSessionGeneration()

          let data: AuthTokenPayload
          try {
            const response = await fetch(`${authBaseUrl}/refresh`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                refresh_token: refreshToken,
              }),
            })

            // 与 login 走同一个校验器——这两段原本逐字同构，而审计只报了 login。
            // 漏修这一处的后果比 login 更重：登录失败起码会抛错，刷新失败却是
            // 「静默把 accessToken 写成 undefined 后正常返回」，此后每个请求都不带
            // Authorization 头，refreshToken 也被覆写成 undefined 并 persist 落盘，
            // 401 重试分支（api/auth.ts:42 `&& authStore.refreshToken`）再也进不去。
            // 它有 13 个调用点（chat / profile / webrtc / storage / wsStore …）。
            data = await readEnvelope<AuthTokenPayload>(response, {
              endpoint: 'POST /api/auth/refresh',
              fallbackMessage: 'Token 刷新失败',
              parse: authTokenPayload,
              legacyBare: AUTH_TOKEN_LEGACY_BARE,
            })
          } catch (error) {
            console.error('Token refresh error:', error)

            // 「刷新失败」不等于「会话结束」。这个 try 同时罩着 fetch 与 readEnvelope，
            // 所以掉进来的可能只是断网 / 超时 / 502 / 响应体形状坏。此前这里无差别
            // `clearAuth()`，而 clearAuth 现在会跑反向名单清盘 + `resetToDefault()`：
            // 一次网络抖动就会销毁 `api-config-storage` 里那个用户自己敲进去的第三方
            // `aiApiKey`——只有他知道、应用无从恢复。两侧代价不对称（清少了泄露、
            // 清多了毁数据），所以只有后端**真的**说凭证不认（401）才算会话结束。
            // 分类的定义写在 `lib/sessionScope.ts` 顶部。
            //
            // ⚠️ 分档之前先问「这次失败还属于当前这场会话吗」：`get()` 拿到的是**当前**
            // 的 store，而这次刷新是在上一场会话里发出去的。会话中途换了人的话，
            // 它既证明不了当前这个人的凭证有问题（用的根本不是他的 token），
            // 更没有资格去清当前这个人的东西——`clearAuth()` 会连带清盘，
            // `clearCredentials()` 会把刚登录的人的票据抹掉。
            if (!isSameSession(session)) {
              throw error
            }
            if (error instanceof ApiError && error.status === 401) {
              get().clearAuth()
            } else {
              // 传输层失败：只丢票据，其余一个字节不动。这不会变成泄露口子——
              // 下一场会话必经 `beginSession()`，它开场就跑内存重置 + 清盘。
              get().clearCredentials()
            }
            throw error
          }

          if (!isSameSession(session)) {
            // 这对 token 属于一场**已经过去**的会话（结束了，或者已经换了下一场）。
            // 原样写下去的话，`set()` 会把一对刚轮换出来、当前有效的 token 重新写进
            // 内存并 persist 落盘，等着下一个人。不走上面的失败分支：凭证不是"坏了"，
            // 而是"不再属于任何人"。这个 reject 只会交给**同一场会话**里的等待者——
            // 单飞锁跨边界时被置空，见 `refreshInFlight` 上方的边界回调。
            throw new Error('Token refresh landed after session end')
          }

          set({
            accessToken: data.access_token,
            // 不写 `?? refreshToken` 兜底：后端若不回 refresh_token，
            // 留着旧的会掩盖「刷新语义变了」这件事，而 README:217 的示例明确
            // 用返回的 refresh_token 覆盖存储，说明它是会回的。缺失时抛错 →
            // 上面的 catch 按状态码分档降级，是可见且正确的。
            refreshToken: data.refresh_token,
            tokenExpiry: Date.now() + data.expires_in * 1000,
          })
          lastRotatedAt = Date.now()
        }

        // 单飞：并发调用共享同一个 in-flight 请求。**十份** `fetchWithAuth` 定义
        // （`grep -rn 'const fetchWithAuth' src | grep -v __tests__` 数出来是 10：
        // apiClient / auth / profile / friends / messages / groupMessages / groups /
        // webrtc / storage / discovery）和 wsStore 都直接调到这里，
        // 锁只有放在这个漏斗里才对所有人生效——`apiClient` 曾经在这之上还压着
        // 第二把模块级的锁，而那一把不是会话内的，见 `apiClient.tryRefreshToken`
        // 的注释（本批已删）。
        // 2026-09-07 线上实锤：页面加载时 5 个请求来自 4 份副本，各自发现 token 临期，
        // 5 个 refresh 带着同一个 refresh token 同时出去；后端每次都轮换一对新 token，
        // 5 个响应以任意顺序落进 store，最后写入的那对已被后来的轮换作废 → 全部 401
        // → 拿作废的 refresh token 再刷又 401 → clearAuth 跳登录。
        //
        // 锁是**会话内**的：跨过会话边界时那个边界回调把它置空，所以这里读到的
        // in-flight 一定是本场会话自己发出去的。否则 B 登录后的第一次刷新会拿到
        // A 那一次的 promise，A 一失败 B 就跟着被登出。
        if (refreshInFlight) return refreshInFlight

        // 刚轮换过就不再刷：用旧 token 发出去的请求会在轮换完成后收到 401，
        // 再次触发刷新；若真的再刷，会把刚拿到的那对 token 又作废，级联下去。
        // 这类调用者直接拿 store 里的新 token 重试即可。窗口内且 token 不在临期区间才跳过；
        // 失败路径不记时间戳，所以刷新失败后再调一定会真的发请求。
        if (
          get().accessToken &&
          Date.now() - lastRotatedAt < RECENT_ROTATION_WINDOW_MS &&
          !get().checkTokenExpiry()
        ) {
          return
        }

        // 只清掉**自己**占的那个槽位。无条件 `refreshInFlight = null` 的话，
        // 跨过会话边界后 A 那一次迟到的 finally 会把 B 已经放进去的那一次抹掉，
        // 于是 B 的并发调用者又各发各的——单飞锁在换人后的头一个 RTT 内失效。
        const inFlight = performRefresh().finally(() => {
          if (refreshInFlight === inFlight) refreshInFlight = null
        })
        refreshInFlight = inFlight
        return inFlight
      },

      /**
       * 会话**进行中**换一对新 token。前置条件：必须有一场活着的会话。
       *
       * ## 为什么不调 `beginSession()`
       *
       * `beginSession()` 开场就跑内存重置 + 清盘，只有"确实换了一场会话"时才对。
       * 本函数今天**零调用点**（`grep -rn 'setTokens' src` 只有它自己的定义与类型
       * 声明），但它的名字是「设置 token」——将来最可能的调用形态是"会话中途换一对
       * 新 token"，那时清盘会把同一个人的 profile / AI 配置一起毁掉。开新会话留在
       * `login` 那一处：那里有 `credentials.user_id`，是全仓唯一能证明"这是一场
       * 新会话"的地方。
       *
       * ## 为什么在死窗口里要抛错，而不是照写
       *
       * 不调 `beginSession()` 还有第二个后果：闸门也不会被重新打开。会话已经结束
       * 而有人调了这里，`set()` 会成功（内存写进去了、`isAuthenticated: true`），
       * 落盘那一次却被 {@link sessionScopedLocalStorage} 丢弃**并把 `auth-storage`
       * 从盘上抹掉**——内存说已登录、盘上说已登出，下一次整页加载把人登出，
       * 中间没有任何一处报错。这正是本仓最难查的那类故障（"坏"和"好"从外面看
       * 长得一样），所以这里照 `registerPristineStoreReset` 的先例，用运行时抛错
       * 而不是一句注释：注释拦不住下一个作者，抛错可以。
       *
       * 想在会话结束之后重新建立登录态，要走的是 `login`（或将来某个显式的
       * "恢复会话"原语，它自己负责调 `beginSession()`），不是这里。
       */
      setTokens: ({ accessToken, refreshToken, expiresIn }) => {
        if (!isSessionLive()) {
          throw new Error(
            'setTokens 只能在一场进行中的会话里调用：会话已结束，这次写入会成为「内存已登录、盘上已登出」的半截状态',
          )
        }
        set({
          accessToken,
          refreshToken,
          isAuthenticated: true,
          tokenExpiry: Date.now() + expiresIn * 1000,
        })
      },

      /**
       * 只丢票据，**不**结束会话。
       *
       * 用在"证明不了会话结束、只证明这一次请求没成"的地方：`refreshAccessToken`
       * 的传输层失败（断网 / 超时 / 502 / 响应体形状坏）。此前那里无差别走
       * `clearAuth()`，于是一次网络抖动就把 `api-config-storage` 里用户自备的第三方
       * `aiApiKey` 销毁了——那是只有他知道、应用无从恢复的数据。
       *
       * `user` 与其余落盘/内存副本一个字节都不动：这一次失败没有证明会话结束，
       * 而抖动是常态，把它当登出处理等于让常态去销毁不可恢复的数据。
       *
       * ⚠️ 这**不是**"下次登录时东西还在原处"。下一场会话必经 `login` 里那一行
       * `beginSession()`，它开场就跑内存重置 + 清盘（`lib/sessionScope.ts`），
       * 而那个边界**不认人**——哪怕重新登录的还是同一个人，profile 与 AI 配置
       * 照样归零。这一档买到的是"网络抖一下**本身**不销毁任何东西"：销毁被推迟到
       * 一个用户明确表达了意图、也看得见后果的时点。理由（以及为什么不去比对
       * `user_id`）写在 `lib/sessionScope.ts` 顶部。
       *
       * 「会话结束 / 只是拿不到票据」这条分界的完整定义写在 `lib/sessionScope.ts` 顶部。
       */
      clearCredentials: () => {
        // 会话还在，但票据没了：本场会话内的「刚轮换过」这个事实也随之作废，
        // 否则接下来 10 秒内的刷新会被误跳过。跨会话那一半由边界回调负责。
        lastRotatedAt = 0
        set({
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          tokenExpiry: null,
        })
      },

      /**
       * 结束会话。全仓**唯一**的清理原语：登出按钮、各 API 模块 `fetchWithAuth`
       * 副本的 401 静默跳转、刷新拿到 401、撤销当前设备、切换服务器——每一条路径
       * 最后都走到这里（`grep -rn 'clearAuth()' src`）。
       *
       * ⚠️ 「挂在这一行 = 挂在全部路径上」这句话只对**入口**成立。落盘副本在这一刻
       * 还没有定局：登出时还在飞的请求会在清盘之后落地，`set()` 一写 persist 就把
       * 上一个人的数据重新写回盘上。补上那一半的是 `sessionScope` 的写入闸门与世代号
       * （`sessionScopedLocalStorage` / `pinSession`），不是这一行。
       *
       * ⚠️ 反过来也成立、而且更危险：**这一行本身可能是上一场会话的请求触发的**。
       * 各份 `fetchWithAuth` 在请求发起时快照了 `useAuthStore.getState()`，但手里的
       * action 闭包是活的，于是 A 登出前发出的请求在 B 的会话里收到 401 时，调到的
       * 是 B 的 `clearAuth()`——清盘把刚登录的 B 清干净。挡这条的是各 401 分支上的
       * `pinSession()`，不是这里：这里没有任何办法知道调用方属于哪一场会话。
       * 十份现已全部接入（最后一份 `features/profile/api/profile.ts`）——名单与
       * 「这一行比世代号对照多挡住了什么」见 `apiClient.ts` 里 `fetchWithAuth` 的
       * `pinSession` 采用说明。
       *
       * 它清的是**这个账号的其余落盘副本**（profile / AI 密钥 / 上次访问路径 /
       * 以及将来任何新增的切片），名单是反向的：不在设备级白名单里的键一律删。
       * 在此之前这里只清 auth 自己那五个字段，于是下一个登录的人会在侧栏上看到
       * 上一个人的昵称和头像、用上一个人的 AI 密钥发请求。
       *
       * 顺序是有意的：先 `set()` 让 persist 把 `auth-storage` 写成全 null，
       * 再 `endSession()` 把这个键连同其它账号级键一起删掉。反过来的话，
       * persist 的这次写入会在清盘之后重新落一个键。
       */
      clearAuth: () => {
        // `lastRotatedAt` / `refreshInFlight` 不在这里清：它们挂在会话边界上
        // （见模块顶部那个 registerSessionReset），下面的 endSession() 会跑到。
        // 在这里再写一行的话，`clearCredentials` 与 `login` 两条不经过本函数的
        // 路径仍然漏掉，而"这里也清了"会让人以为覆盖全了。
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          tokenExpiry: null,
        })
        endSession()
      },

      checkTokenExpiry: () => {
        const { tokenExpiry } = get()
        if (!tokenExpiry) return false
        
        // 如果 Token 在 5 分钟内过期，返回 true（需要刷新）
        const fiveMinutes = 5 * 60 * 1000
        return Date.now() >= tokenExpiry - fiveMinutes
      },
    }),
    {
      name: 'auth-storage',
      // 带会话闸门的 localStorage（`lib/sessionScope.ts`）：SSR / Safari 隐私模式的
      // try-catch 与原来那份 `safeStorage` 逐字相同，多的是「会话结束后、下一场开始前，
      // 对 auth-storage 的写入一律丢弃」——登出那一刻还在飞的刷新请求回来时，
      // persist 会把一对**刚轮换出来、当前有效**的 token 重新落盘，闸门拦的就是它。
      storage: createJSONStorage(() => sessionScopedLocalStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        tokenExpiry: state.tokenExpiry,
        isAuthenticated: state.isAuthenticated,
      }),
      version: AUTH_PERSIST_VERSION,
      migrate: migrateAuthPersist,
    }
  )
)
