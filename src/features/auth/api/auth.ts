import { useAuthStore } from '@/features/auth/store/authStore'
import { getAuthApiUrl } from '@/lib/apiConfig'
import { assertEnvelopeOk, readEnvelope } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'
import { pinSession } from '@/lib/sessionScope'

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

// 带自动重试的 fetch 封装
const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const authStore = useAuthStore.getState()
  // 钉住"发这个请求时的那一场会话"。下面 401 分支里的每一个动作打的都是**当前**
  // 那个人的 store（`authStore` 是快照，但它攥着的 action 闭包是活的），所以响应
  // 落地时必须先确认会话还是同一场。接法与判假时该做什么见
  // `api/apiClient.ts` 里 `fetchWithAuth` 的注释。
  const isLiveSession = pinSession()

  // 检查 Token 是否即将过期，如果是则刷新
  if (authStore.checkTokenExpiry() && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
    } catch (error) {
      console.error('Failed to refresh token:', error)
    }
  }

  const headers = getAuthHeaders()
  
  let response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  // 如果 Token 过期，尝试刷新后重试一次。
  //
  // ⚠️ `isLiveSession()` 不是可选项：`authStore.refreshToken` 是**发起时**的快照，
  // 上一场会话的 401 照样能满足它，而 `refreshAccessToken()` / `clearAuth()` 打的是
  // 当前那个人的 store——清盘会把刚登录的那位连同他的 aiApiKey 一起清掉。
  // 判假时什么都不做，把 401 原样返回给调用方（`readEnvelope` 会抛成 ApiError）。
  if (response.status === 401 && authStore.refreshToken && isLiveSession()) {
    try {
      await authStore.refreshAccessToken()
      const newHeaders = getAuthHeaders()
      response = await fetch(url, {
        ...options,
        headers: {
          ...newHeaders,
          ...options.headers,
        },
      })
    } catch (error) {
      console.error('Token refresh failed, redirecting to login')
      authStore.clearAuth()
      window.location.href = ROUTES.auth.login
      throw error
    }
  }

  return response
}

// 设备列表响应（与后端 GET /api/auth/devices 一致）
export interface DeviceInfo {
  device_id: string
  device_info?: string
  ip_address?: string
  last_active_at?: string
  created_at?: string
  is_current: boolean
}

export interface GetDevicesResponse {
  devices: DeviceInfo[]
  /**
   * 后端一直在返回它，接口里却一直没有。补上不是为了有人读它（全仓库无消费方），
   * 而是为了让 `getDevices` 的 `require: ['devices', 'total']` 能编译通过——
   * 少了这个字段，`bun run typecheck` 会当场报
   * `Type '"total"' is not assignable to type '"devices"'`。
   * 这就是解包层 `require` 的设计意图：接口和实际响应对不上，在编译期就死掉。
   */
  total: number
}

/**
 * Auth 相关的受保护端点。
 *
 * ## 这里为什么只剩三个方法
 *
 * 原来还有 `login` / `register` / `refreshToken` 三个方法，全部零调用方
 * （登录唯一入口是 `LoginForm.tsx` → `authStore.login`，注册与刷新同理都在
 * store 里内联实现）。它们的实现是 `return response.json()`，即把
 * `{success, code, data}` 信封原样吐给调用方——和 store 里的写法是同一个
 * bug 的第二份拷贝。留着一份未解包的登录副本，下一个接手的人必然照抄，
 * 所以这次连同删除，而不是"顺手也改一下"。
 *
 * 剩下的三个方法一律走 `src/lib/apiEnvelope.ts`：不再有任何
 * `if (!response.ok) { await response.json() }` 手写样板，也就不可能再写出
 * "错误分支和成功分支各读一次 body" 的二次消费。
 */
export const authApi = {
  /**
   * POST /api/auth/logout（受保护）。
   * 后端返回信封但无有意义的 data，只需确认成功与否。
   */
  logout: async (): Promise<void> => {
    const authBaseUrl = getAuthApiUrl()
    const response = await fetchWithAuth(`${authBaseUrl}/logout`, {
      method: 'POST',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/auth/logout',
      fallbackMessage: '登出失败',
    })
  },

  /**
   * GET /api/auth/devices（受保护）。
   *
   * 响应形如 `{"success":true,"code":200,"data":{"devices":[...],"total":N}}`
   * （backend-docs/auth/用户登录注册鉴权部分.md:53、backend-docs/README.md:374
   * 2026-03-08「统一 API 响应格式」变更日志，两处互相印证）。
   *
   * 旧实现读的是信封根部的 `data.devices`，信封化之后恒为 `undefined`，
   * 再被 `Array.isArray(...) ? ... : []` 变成空数组——HTTP 200、无异常、
   * 设备页显示"暂无设备信息"，撤销按钮压根不渲染。这条静默路径活了半年。
   *
   * 这里**不传 `legacyBare`**：devices 的信封有变更日志明确背书，
   * 没有任何"可能还是裸响应"的余地，收到裸响应就该炸。
   */
  getDevices: async (): Promise<GetDevicesResponse> => {
    const authBaseUrl = getAuthApiUrl()
    const response = await fetchWithAuth(`${authBaseUrl}/devices`, {
      method: 'GET',
    })

    // 显式写类型参数（不能省）：省掉时 T 塌成 unknown，require 的编译期
    // 字段名检查会整档失效——见 apiEnvelope.ts 里 EnvelopeOptions.require 的说明。
    return readEnvelope<GetDevicesResponse>(response, {
      endpoint: 'GET /api/auth/devices',
      fallbackMessage: '获取设备列表失败',
      require: ['devices', 'total'],
    })
  },

  /**
   * DELETE /api/auth/devices/{device_id}（受保护）。
   *
   * ⚠️ 删除的是当前设备时，当前 access_token 立即失效，后续请求 401
   * （backend-docs/auth/用户登录注册鉴权部分.md:66-68）——DevicesPage 已按
   * `is_current` 分支处理，删完当前设备直接 clearAuth 跳登录页。
   */
  revokeDevice: async (deviceId: string): Promise<void> => {
    const authBaseUrl = getAuthApiUrl()
    const response = await fetchWithAuth(`${authBaseUrl}/devices/${deviceId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/auth/devices/{device_id}',
      fallbackMessage: '撤销设备失败',
    })
  },
}

// 通用 API 客户端，自动处理认证
export const apiClient = {
  get: async (url: string, options?: RequestInit) => {
    return fetchWithAuth(url, { ...options, method: 'GET' })
  },

  post: async (url: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  put: async (url: string, data?: unknown, options?: RequestInit) => {
    return fetchWithAuth(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  delete: async (url: string, options?: RequestInit) => {
    return fetchWithAuth(url, { ...options, method: 'DELETE' })
  },
}
