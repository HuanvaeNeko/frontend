import { getApiBaseUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { assertEnvelopeOk, readEnvelopeList } from '@/lib/apiEnvelope'
import { fetchWithAuth } from '@/api/authedFetch'

const FRIENDS_BASE_URL = `${getApiBaseUrl()}/api/friends`

// ============================================
// 类型定义
// ============================================

/**
 * `GET /api/friends` 的一条记录（后端 `FriendDto`）。
 *
 * 字段名逐个对过 `backend-docs/friends/好友添加删除.md:107-118`：后端**没有**
 * `skip_serializing_if`，八个字段恒出现，`Option` 为空时是 `null`（不是缺省）。
 * 所以可空字段一律写 `string | null` 而不是 `?:`——两者在这里不等价：
 * 写成可选属性会让"后端明确说没有"和"前端读错了字段名"再次变成同一种表现。
 *
 * 旧接口（`user_id` / `nickname` / `avatar_url` / `email` / `signature`）与后端
 * **无一字段重合**，`email` / `signature` 后端根本不返回。这不是"多读了几个
 * 字段"，而是 `friend.nickname.toLowerCase()` 在列表非空时立刻 TypeError。
 */
export interface Friend {
  friend_id: string
  friend_nickname: string | null
  friend_avatar_url: string | null
  add_time: string
  /** 文档 :115 明确「当前恒为 `null`」（后端 approve 不收集通过理由），预留字段。 */
  approve_reason: string | null
  friend_remark: string | null
  is_blacklisted: boolean
  is_special_care: boolean
}

/** `GET /api/friends/requests/pending` 的一条记录（`backend-docs/friends/好友添加删除.md:87-96`）。 */
export interface PendingRequest {
  /** 申请记录 ID（不是用户 ID）——列表 key 用它。 */
  request_id: string
  request_user_id: string
  request_message: string | null
  request_time: string
  requester_nickname: string | null
  requester_avatar_url: string | null
}

/**
 * `GET /api/friends/requests/sent` 的一条记录（`backend-docs/friends/好友添加删除.md:67-78`）。
 *
 * **没有 `status` 字段**：文档 :78 写明本接口只列出"仍处于 pending 状态"的申请，
 * 所以旧代码里 `status === 'approved' / 'rejected'` 两个分支是死代码。
 * 同处还写明「**没有撤回接口**（by design）」——不要给这个列表加撤回按钮。
 */
export interface SentRequest {
  request_id: string
  sent_to_user_id: string
  sent_message: string | null
  sent_time: string
  sent_to_nickname: string | null
  sent_to_avatar_url: string | null
}

/**
 * 头像相对路径 → 绝对地址，只在 api 模块出口做一次。
 *
 * 三个 DTO 的 `*_avatar_url` 都是**相对路径**，需拼 `STORAGE_BASE_URL`
 * （`backend-docs/friends/好友添加删除.md:76`、:96、:113 逐条注明「相对路径」；
 * `STORAGE_BASE_URL` 的定义在 `backend-docs/storage/文件存储管理.md:54-55`，
 * 与 API 基址相同，即 `toAbsoluteApiUrl` 的行为）。
 *
 * ⚠️ 认准 `backend-docs`：`/Users/i/Code/huanvae/backend/` 那份旧文档里头像还是
 * 绝对 MinIO 地址，照它写会得出"不用拼接"的错误结论——`authStore.ts` 的
 * `avatar_url` 注释记录了这个坑被踩过两次的经过。
 *
 * `null` 保持 `null`（未知），不兜底成空串：空串会被 `<AvatarImage src="">`
 * 当成一次真实的图片请求。
 */
const absoluteAvatar = (path: string | null): string | null => toAbsoluteApiUrl(path) ?? null

// ============================================
// API 方法
// ============================================

export const friendsApi = {
  /**
   * 获取好友列表
   * GET /api/friends
   */
  getFriendsList: async (): Promise<Friend[]> => {
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}`, {
      method: 'GET',
    })

    // 不传 field：`data` **本身**就是数组
    // （`backend-docs/README.md:373` 的 2026-03-08 变更日志：三个好友列表端点
    // 从裸 `{"items":[...]}` 改为 `{"success":true,"code":200,"data":[...]}`；
    // 文档 :99-105 的示例注释同样写 `resp.data: FriendDto[]`）。
    // 设计稿里的 `field: 'friends'` 是**信封化之前**的形状，照抄会让每次请求都抛
    // `data.friends 应为数组`——见 readEnvelopeList 的 JSDoc。
    //
    // 也不传 legacyBare：变更日志逐条点名了这个端点，没有"可能还是裸响应"的余地，
    // 收到裸响应就该炸。旧写法 `data.friends || data || []` 在信封上恒返回 `[]`，
    // 于是"后端换了形状"和"这个账号真的没有好友"变成同一种表现，活了半年。
    const rows = await readEnvelopeList<Friend>(response, {
      endpoint: 'GET /api/friends',
      fallbackMessage: '获取好友列表失败',
    })

    return rows.map((friend) => ({
      ...friend,
      friend_avatar_url: absoluteAvatar(friend.friend_avatar_url),
    }))
  },

  /**
   * 发送好友请求
   * POST /api/friends/requests
   * 请求体: { user_id, target_user_id, reason?, request_time }
   */
  sendFriendRequest: async (targetUserId: string, reason?: string): Promise<void> => {
    const authStore = useAuthStore.getState()
    const userId = authStore.user?.user_id

    if (!userId) {
      throw new Error('用户未登录')
    }

    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        target_user_id: targetUserId,
        reason: reason || '你好，我想加你为好友',
        request_time: new Date().toISOString(),
      }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/friends/requests',
      fallbackMessage: '发送好友请求失败',
    })
  },

  /**
   * 同意好友请求
   * POST /api/friends/requests/approve
   * 请求体: { user_id, applicant_user_id }
   *
   * ⚠️ 请求体只有这两个字段（`backend-docs/friends/好友添加删除.md:25-32`，
   * 示例 body 同样只有两个）。旧代码还多发了 `approved_time` / `approved_reason`：
   * 文档全文搜不到这两个键，而同一份文档里 send 保留了 `request_time`、
   * reject 保留了 `reject_reason?`、remove 保留了 `remove_time`——唯独 approve
   * 被收窄成两字段，所以这不是文档省略。文档 :115 进一步坐实：响应侧的
   * `approve_reason` 恒为 `null`，"后端 approve 不收集通过理由"。
   * 若后端请求体结构带 `deny_unknown_fields`，多发字段会让整条同意路径 422。
   *
   * 因此形参里也不再有 `approvedReason`：留着它等于对上层承诺"填了通过理由会生效"，
   * 而后端永远不会消费它。
   */
  approveFriendRequest: async (applicantUserId: string): Promise<void> => {
    const authStore = useAuthStore.getState()
    const userId = authStore.user?.user_id

    if (!userId) {
      throw new Error('用户未登录')
    }

    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests/approve`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        applicant_user_id: applicantUserId,
      }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/friends/requests/approve',
      fallbackMessage: '同意好友请求失败',
    })
  },

  /**
   * 拒绝好友请求
   * POST /api/friends/requests/reject
   * 请求体: { user_id, applicant_user_id, reject_reason? }
   */
  rejectFriendRequest: async (applicantUserId: string, rejectReason?: string): Promise<void> => {
    const authStore = useAuthStore.getState()
    const userId = authStore.user?.user_id

    if (!userId) {
      throw new Error('用户未登录')
    }

    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests/reject`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        applicant_user_id: applicantUserId,
        reject_reason: rejectReason,
      }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/friends/requests/reject',
      fallbackMessage: '拒绝好友请求失败',
    })
  },

  /**
   * 获取已发送的好友请求
   * GET /api/friends/requests/sent
   */
  getSentRequests: async (): Promise<SentRequest[]> => {
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests/sent`, {
      method: 'GET',
    })

    // 同 getFriendsList：`data` 就是数组，不传 field、不传 legacyBare。
    const rows = await readEnvelopeList<SentRequest>(response, {
      endpoint: 'GET /api/friends/requests/sent',
      fallbackMessage: '获取已发送请求失败',
    })

    return rows.map((request) => ({
      ...request,
      sent_to_avatar_url: absoluteAvatar(request.sent_to_avatar_url),
    }))
  },

  /**
   * 获取待处理的好友请求
   * GET /api/friends/requests/pending
   */
  getPendingRequests: async (): Promise<PendingRequest[]> => {
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests/pending`, {
      method: 'GET',
    })

    // 同 getFriendsList：`data` 就是数组，不传 field、不传 legacyBare。
    const rows = await readEnvelopeList<PendingRequest>(response, {
      endpoint: 'GET /api/friends/requests/pending',
      fallbackMessage: '获取待处理请求失败',
    })

    return rows.map((request) => ({
      ...request,
      requester_avatar_url: absoluteAvatar(request.requester_avatar_url),
    }))
  },

  /**
   * 删除好友
   * POST /api/friends/remove
   * 请求体: { user_id, friend_user_id, remove_time, remove_reason? }
   */
  removeFriend: async (friendUserId: string, removeReason?: string): Promise<void> => {
    const authStore = useAuthStore.getState()
    const userId = authStore.user?.user_id

    if (!userId) {
      throw new Error('用户未登录')
    }

    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/remove`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        friend_user_id: friendUserId,
        remove_time: new Date().toISOString(),
        remove_reason: removeReason,
      }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/friends/remove',
      fallbackMessage: '删除好友失败',
    })
  },
}
