import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthStore, LoginRequest, RegisterRequest } from '../types/auth'
import { authApi } from '../api/auth'
import { getAuthApiUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { assertEnvelopeOk, type Parser, readEnvelope } from '@/lib/apiEnvelope'

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

// 仅在客户端使用 localStorage，避免 Next.js SSR 报错并保证刷新后正确恢复登录状态
const safeStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(name, value)
    } catch {
      // ignore
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(name)
    } catch {
      // ignore
    }
  },
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
              // avatar_url 过 toAbsoluteApiUrl 补基址。
              //
              // 之前这里两次给出的理由都没有站住：
              // - 曾经的实现说"这是对象存储 key，前缀了会 404"——但
              //   backend-docs/profile/个人资料管理.md:74（GET /api/profile 示例）
              //   与 :344（POST /api/profile/avatar 响应示例）给出的
              //   user_avatar_url / avatar_url 都已经是带协议的完整地址
              //   （`http://localhost:9000/avatars/testuser001.jpg`，
              //   指向 MinIO 而非 api.huanvae.cn），根本不是裸 key。
              // - 后来又有人认定它是"需要拼 STORAGE_BASE_URL 的相对路径"——
              //   这份 backend-docs 里同样找不到 STORAGE_BASE_URL 这个概念，
              //   也没有任何一处把 avatar 字段描述成相对路径；这条说法同样
              //   没有文档支持，不能采信。
              // 真实情况是：目前这两个字段一律已经是绝对地址。这里仍然套一层
              // toAbsoluteApiUrl，纯粹是防御性的——它对已带协议的地址是幂等直通
              // （见 apiConfig.ts 的说明），今天不会拼错任何东西；一旦后端未来
              // 改成返回相对路径，这里不用跟着改，且和 storage 模块里其它 URL 字段
              // （如 presigned_url）保持同一处理方式，不必每个消费点各自记一遍。
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
        const { refreshToken } = get()
        const authBaseUrl = getAuthApiUrl()
        
        if (!refreshToken) {
          throw new Error('No refresh token available')
        }

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
          const data = await readEnvelope<AuthTokenPayload>(response, {
            endpoint: 'POST /api/auth/refresh',
            fallbackMessage: 'Token 刷新失败',
            parse: authTokenPayload,
            legacyBare: AUTH_TOKEN_LEGACY_BARE,
          })

          set({
            accessToken: data.access_token,
            // 不写 `?? refreshToken` 兜底：后端若不回 refresh_token，
            // 留着旧的会掩盖「刷新语义变了」这件事，而 README:217 的示例明确
            // 用返回的 refresh_token 覆盖存储，说明它是会回的。缺失时抛错 →
            // 下面的 catch 走 clearAuth + 跳登录，是可见且正确的降级。
            refreshToken: data.refresh_token,
            tokenExpiry: Date.now() + data.expires_in * 1000,
          })
        } catch (error) {
          console.error('Token refresh error:', error)
          get().clearAuth()
          throw error
        }
      },

      setTokens: ({ accessToken, refreshToken, expiresIn }) => {
        set({
          accessToken,
          refreshToken,
          isAuthenticated: true,
          tokenExpiry: Date.now() + expiresIn * 1000,
        })
      },

      clearAuth: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          tokenExpiry: null,
        })
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
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        tokenExpiry: state.tokenExpiry,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
