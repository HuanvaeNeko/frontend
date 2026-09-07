import { getApiBaseUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { isBusiness401Request } from '@/api/apiClient'
import { storageApi, type AvatarUploadProgress, type AvatarUploadResult } from '@/api/storage'
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

  // 如果 Token 过期，尝试刷新后重试一次。
  //
  // ⚠️ **业务 401 的端点不进这个分支**：`PUT /api/profile/password` 的「旧密码错误」
  // 也是 401（backend-docs/profile/个人资料管理.md:329-333，:345 复述），它不是会话
  // 失效。当成会话失效处理的后果，正是这一层要消灭的形态：轮换掉一对 token +
  // 把同一个错误密码原样重发一遍（可能撞上后端的失败计数）+ 刷新失败时
  // `clearAuth()` + 跳登录页，而用户只是打错了一次当前密码。
  //
  // 判定表在 `apiClient.ts` 的 `BUSINESS_401_ENDPOINTS`，这里**只调不抄**
  // （`isBusiness401Request`）——全仓库现在有十处 `fetchWithAuth` 定义（九份模块
  // 副本 + apiClient 导出的那份），合并之后接手的那份照样调这一个函数即可。
  //
  // 代价写明：这类端点上**真的**会话失效不再自动刷新重试，用户会看到一条可见的
  // 失败提示、重试一次即可（进门处的临期预刷新仍然有效，覆盖了绝大多数过期）。
  // 可见的错误可恢复，无解释的登出不可恢复。
  if (response.status === 401 && authStore.refreshToken && !isBusiness401Request(options.method, url)) {
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

/**
 * 头像相对路径 → 绝对地址，只在 api 模块出口做一次。与 `groups.ts` / `friends.ts` /
 * `discovery.ts` 里同名的 `absoluteAvatar` 逐字同型，按那三处的理由各自定义一份。
 *
 * **这是必需的，不是防御性的。** `user_avatar_url` 后端给的是**相对路径**
 * （`个人资料管理.md:98`「头像相对路径（需拼接 `STORAGE_BASE_URL`）」，:74 的样例
 * 是 `"avatars/testuser001.jpg?t=1706000000"`）。原样交给
 * `<AvatarImage src="avatars/….png?t=1">`，Radix 会按相对 URL 的规则以**当前页面地址**
 * 为基准解析，把请求打到前端自己的源上并 404。整个 profile 模块此前一处都没补基址
 * （`git grep toAbsoluteApiUrl b873fef -- src/features/profile/` 为空）。
 *
 * `null` 与空串一并归一为 `null`（= 没有头像）：`toAbsoluteApiUrl` 对 null / 空串
 * 返回 `undefined`，这里 `?? null` 只是把它换回本 DTO 声明的 `null`，不是兜底掩盖缺失。
 */
const absoluteAvatar = (path: string | null): string | null => toAbsoluteApiUrl(path) ?? null

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
   *
   * ⚠️ 本批只在这个方法里动了**一件事**：把 `user_avatar_url` 补成绝对地址
   * （见 {@link absoluteAvatar}）。信封解包（`data.data || data`）与缺失的 8 个
   * `UserProfile` 字段属于下一批，故意不碰——本批要能被单独 review。
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
    const profile: UserProfile = data.data || data
    return { ...profile, user_avatar_url: absoluteAvatar(profile.user_avatar_url) }
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
      //
      // 挡住"打错一次当前密码就被登出"的是**上面 `fetchWithAuth` 的 401 分支**
      // （`!isBusiness401Request(...)`），不是这里的 `endpoint` 字段：401 响应
      // 走到这一行时，刷新与重发已经被跳过了。
      // 这个 `endpoint` 串仍然要与 `apiClient.ts` 的 `BUSINESS_401_ENDPOINTS`
      // 逐字一致——它是 `isAuthError` 那一档的入参，今天没有活的消费者
      // （见该常量注释的「谁真的会读这张表」），但两端不一致会让将来接进
      // store / `safeApiCall` 的人踩回同一个坑。
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
   * 上传用户头像 —— 已不再是本模块的一个端点
   *
   * 🔴 `POST /api/profile/avatar`（`multipart/form-data`）于 2026-08-28
   * **删除、无兼容层**，与 `POST /api/profile/background`、
   * `POST /api/groups/{id}/avatar` 同一批（`个人资料管理.md:352-355`）。
   * 本方法此前仍在打它，**每一次头像上传都是 404**。
   *
   * 现在走 storage 的四步预签名分片直传链路（doc:362-369），实现在
   * {@link storageApi.uploadAvatar}——群头像已经在用同一支。留一个本模块的入口，
   * 是因为「用户头像的 `avatar_target` 该填什么」是 profile 模块的知识
   * （同 `groups.ts` 的 `uploadGroupAvatar` 的理由）。
   *
   * ## 与群头像那一档的两处差异（doc:389-390）
   *
   * 1. `avatar_target: 'user_avatar'`；
   * 2. **不传 `related_id`**——`user_avatar` / `user_background` 携带它就是 400，
   *    doc:440 写明「不静默忽略」。`AvatarUploadTarget` 联合的另一支上根本没有
   *    这个键，`buildAvatarUploadPayload` 也不会写出它。键的**有无**由两组
   *    `Object.hasOwn` 断言钉住：`storage.test.ts` 直接调构造函数的那组，
   *    以及本模块 `profile.test.ts` 里截住 `requestAvatarUpload` 入参的那条。
   *    都不能改成读 `JSON.parse(init.body)`——`JSON.stringify` 会丢掉 undefined
   *    值，wire-level 断言对这条约束**恒真**（已实测：把 `related_id: undefined`
   *    加回去，只有这两组变红）。
   *
   * ## 三件跟着变的事
   *
   * - **返回字段改名**：旧响应是 `avatar_url`，现在是 confirm 的 `file_url`
   *   （doc:396-409，形态「逐字相同」：相对路径 + `?t=` 缓存戳，出口已补基址）。
   * - **不要回写**：后端已在 confirm 里把它写进 `users."user-avatar-url"`，
   *   doc:411 明写客户端「**无需**再调 `PUT /api/profile` 回写」。多打那一次
   *   既是无用写入，又会把一次上传的失败面扩大到 profile 的更新端点上。
   * - **10 MB / 格式 / 扩展名检查、单飞、四步顺序、`file_url` 补基址**全在
   *   `storageApi.uploadAvatar` 里，这里不复制。客户端那道大小检查只是省一次
   *   注定失败的往返：真正的闸在后端，且 confirm 会在**合并分片之前**按真实字节
   *   再量一次（doc:444），拒绝时**不碰用户现有的那张头像**。
   *
   * @param onProgress 上传进度，**按字节**报（`percent` 来自 `xhr.upload.onprogress`，
   *   不是"第几片传完了"）。头像档**永远只有 1 片**：分片大小固定 30 MB
   *   （`文件存储管理.md:185`）而头像上限 10 MB（doc:393），doc:668 自己也写着
   *   「头像很小，通常只有 1 片」。所以按分片报进度等于只有 100% 这一个取值，
   *   而且要等字节全部传完才出现——这里刻意不那么做。
   *   不传就是没有进度，链路不受影响。
   * @throws {Error} 超 10 MB / MIME 不在白名单 / 扩展名不在白名单（客户端便利检查）
   * @throws {Error} 同一落点已有上传在飞（单飞拒绝，doc:445 要求客户端防抖/单飞）
   * @throws {ApiError} 后端失败，文案是**后端原文**：`user_id` 以 `group-` 开头的
   *   存量账号是**永久** 400（doc:454，那是群头像 object key 的保留命名空间，
   *   这个账号的头像上传永远不会成功）；409 是会话被接管/已过期
   *   （doc:445、:447-450），用 `isUploadSessionExpired` 分诊，**不要自动重试**。
   */
  uploadAvatar: async (
    file: File,
    onProgress?: (progress: AvatarUploadProgress) => void,
  ): Promise<AvatarUploadResult> => {
    console.log('📸 上传头像:', file.name)

    const result = await storageApi.uploadAvatar(file, { avatar_target: 'user_avatar' }, onProgress)

    console.log('✅ 头像上传成功:', result.file_url)
    return result
  },
}
