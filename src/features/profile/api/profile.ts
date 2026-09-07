import { getApiBaseUrl } from '@/lib/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'

const PROFILE_BASE_URL = `${getApiBaseUrl()}/api/profile`

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

  // 如果 Token 过期，尝试刷新后重试一次
  if (response.status === 401 && authStore.refreshToken) {
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

// ============================================
// 类型定义
// ============================================

export interface UserProfile {
  user_id: string
  user_nickname: string
  user_email: string | null
  user_signature: string | null
  user_avatar_url: string | null
  admin: string
  created_at: string
  updated_at: string
}

export interface UpdateProfileRequest {
  nickname?: string
  email?: string
  signature?: string
}

export interface ChangePasswordRequest {
  old_password: string
  new_password: string
}

export interface AvatarUploadResponse {
  avatar_url: string
  message: string
}

// ============================================
// API 方法
// ============================================

/**
 * ## 本模块的失败为什么抛 `ApiError` 而不是裸 `Error`
 *
 * 本批只做一件事：**把真实 HTTP 状态码带上**。
 *
 * `apiClient.isAuthError` 原来是靠关键词子串匹配 message 来决定要不要静默
 * 跳登录页的，于是 `PUT /api/profile` 的校验文案
 * `"Validation error: email: Invalid email format"`
 * （`backend-docs/profile/个人资料管理.md:213`，逐字）因为含 `invalid`
 * 被判成会话失效。收窄那个分类器的前提，是它能拿到状态码去判——
 * 本模块是仅剩的、抛裸 `Error` 的调用方，所以这三处必须一起改，
 * 否则收窄之后 profile 的**真 401 会一起漏判**（那才是回归）。
 *
 * **这不是信封解包迁移**。响应体的读法（`data.data || data`、
 * `error.message || error.error`）一个字没动：那要连同缺失字段、背景图、
 * 公开资料一起改，属于后续批次，混进来会让这次的 review 失焦。
 *
 * `ApiError extends Error`，所以 `error instanceof Error`、`error.message`
 * 的既有调用点行为不变。
 */
export const profileApi = {
  /**
   * 获取个人信息
   * GET /api/profile
   */
  getProfile: async (): Promise<UserProfile> => {
    console.log('👤 获取个人资料')
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取个人资料失败 (${response.status})` 
      }))
      console.error('获取个人资料失败:', error)
      throw new ApiError(error.message || error.error || '获取个人资料失败', {
        status: response.status,
        endpoint: 'GET /api/profile',
        payload: error,
      })
    }

    const data = await response.json()
    return data.data || data
  },

  /**
   * 更新个人信息
   * PUT /api/profile
   * 请求体: { email?, signature? }
   */
  updateProfile: async (updates: UpdateProfileRequest): Promise<{ message: string }> => {
    console.log('✏️ 更新个人资料:', updates)
    const body: Record<string, string | undefined> = {}
    if (updates.nickname !== undefined) body.nickname = updates.nickname
    if (updates.email !== undefined) body.email = updates.email
    if (updates.signature !== undefined) body.signature = updates.signature
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `更新个人资料失败 (${response.status})` 
      }))
      console.error('更新个人资料失败:', error)
      // 400 校验失败走这里，文案例如
      // `Validation error: email: Invalid email format`（文档 :213）。
      // 带上 400 之后，`isAuthError` 在状态码档就地判假，不会再去看这句话里
      // 有没有 `invalid`。
      throw new ApiError(error.message || error.error || '更新个人资料失败', {
        status: response.status,
        endpoint: 'PUT /api/profile',
        payload: error,
      })
    }

    const data = await response.json()
    console.log('✅ 个人资料更新成功')
    return data
  },

  /**
   * 修改密码
   * PUT /api/profile/password
   * 请求体: { old_password, new_password }
   */
  changePassword: async (passwordData: ChangePasswordRequest): Promise<{ message: string }> => {
    console.log('🔐 修改密码')
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}/password`, {
      method: 'PUT',
      body: JSON.stringify(passwordData),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `修改密码失败 (${response.status})` 
      }))
      console.error('修改密码失败:', error)
      // ⚠️ 这个端点的 **401 是业务失败**："旧密码错误"就返回 401，body 为
      // `{"error": "Old password is incorrect"}`（文档 :329-333，:345 复述）。
      // `endpoint` 字符串必须与 `apiClient.ts` 的 `BUSINESS_401_ENDPOINTS`
      // 逐字一致，否则打错一次当前密码就会被静默登出。
      throw new ApiError(error.message || error.error || '修改密码失败', {
        status: response.status,
        endpoint: 'PUT /api/profile/password',
        payload: error,
      })
    }

    const data = await response.json()
    console.log('✅ 密码修改成功')
    return data
  },

  /**
   * 上传头像
   * POST /api/profile/avatar
   * 请求体: multipart/form-data (avatar 或 file 字段)
   * 支持格式: jpg, jpeg, png, gif, webp
   * 大小限制: 最大 10MB
   *
   * 🔴 **本端点已于 2026-08-28 删除、无兼容层**，与
   * `POST /api/groups/{id}/avatar`、`POST /api/profile/background` 同一批
   * （`backend-docs/storage/文件存储管理.md:959-962`）。今天调用它只会拿到 404。
   *
   * 迁移到已经写好的那条四步预签名链路即可：**`storageApi.uploadAvatar(file, target)`**
   * （`src/api/storage.ts`）。群头像已在批 5 接上，本模块留给自己的那一批
   * （profile 是另一个模块，它的 `background` 与展示字段有各自的连锁改动，
   * 不该混进群模块那次 review）。
   *
   * 与群头像的调用只差两个参数：
   * 1. `avatar_target: 'user_avatar'`（背景图那个方法则是 `'user_background'`），
   *    不是 `'group_avatar'`；
   * 2. **不传 `related_id`**——`user_avatar` / `user_background` 携带它就是 400
   *    （storage 文档 :119）。`AvatarUploadTarget` 联合的另一支正是为此而设：
   *    写 `{ avatar_target: 'user_avatar' }` 即可，那一支上没有 `related_id` 这个键。
   *
   * 其余完全一致：10 MB / 格式检查、单飞、四步顺序、`file_url` 出口补基址
   * 都在 `storageApi.uploadAvatar` 里，不要在这里复制一份。
   * 返回字段也跟着改名：旧的 `data.avatar_url` → confirm 的 `data.file_url`。
   */
  uploadAvatar: async (file: File): Promise<AvatarUploadResponse> => {
    console.log('📸 上传头像:', file.name)
    
    // 验证文件大小
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      throw new Error(`文件太大，最大 10MB，当前: ${(file.size / 1024 / 1024).toFixed(2)} MB`)
    }
    
    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      throw new Error('不支持的文件格式，支持: jpg, jpeg, png, gif, webp')
    }
    
    const formData = new FormData()
    formData.append('avatar', file)

    const authStore = useAuthStore.getState()
    const accessToken = authStore.accessToken

    const response = await fetch(`${PROFILE_BASE_URL}/avatar`, {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `上传头像失败 (${response.status})` 
      }))
      console.error('上传头像失败:', error)
      throw new Error(error.message || error.error || '上传头像失败')
    }

    const data = await response.json()
    console.log('✅ 头像上传成功:', data.avatar_url ?? data.data?.avatar_url)
    // 后端返回 { avatar_url, message } 或 { data: { avatar_url }, message }
    const resolved = data.avatar_url != null ? data : (data.data ?? data)
    return {
      avatar_url: resolved.avatar_url ?? '',
      message: resolved.message ?? 'Avatar uploaded successfully',
    }
  },
}
