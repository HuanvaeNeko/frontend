import { getApiBaseUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'
import { type Parser, assertEnvelopeOk, readEnvelope, readEnvelopeList } from '@/lib/apiEnvelope'
import { arr, asRecord, num, str } from '@/lib/apiParse'

const GROUPS_BASE_URL = `${getApiBaseUrl()}/api/groups`

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

export type JoinMode = 'open' | 'approval_required' | 'invite_only' | 'admin_invite_only' | 'closed'
export type MemberRole = 'owner' | 'admin' | 'member'

// ⚠️ `Group`（`GET /{group_id}` 的 `GroupInfo`）与 `createGroup` 的请求体
// 属于批 3：`join_mode` 要整个换成 `join_approval_required` + 八字段策略，
// 这里刻意保持原样不动，避免同一个类型在两批 review 里各改一次。
export interface Group {
  group_id: string
  group_name: string
  group_avatar_url: string
  group_description?: string
  creator_id?: string
  created_at?: string
  join_mode?: JoinMode
  status?: string
  member_count?: number
}

/**
 * `GET /api/groups/my` 的一条记录。字段表 + 样例：
 * backend-docs/groups/群聊管理.md:113-140。
 *
 * `group_avatar_url` 用 `Omit` 覆盖掉 `Group` 的同名字段，改成 `string | null`：
 * 字段表写的类型是 `string`，但样例值是 `""`（未设置头像）——和 friends.ts 的
 * `friend_avatar_url` 是同一种情形，空串会被 `<AvatarImage src="">` 当成一次
 * 真实的图片请求。api 出口统一把 `''` 和绝对化都交给 `absoluteAvatar`，
 * 因此这里的类型必须是 `string | null`，不能沿用 `Group` 的 `string`。
 */
export interface MyGroup extends Omit<Group, 'group_avatar_url'> {
  group_avatar_url: string | null
  role: MemberRole
  unread_count: number | null
  last_message_content: string | null
  last_message_time: string | null
}

/**
 * `GET /api/groups/{group_id}/members` 的一条成员记录（doc:696-706 的样例）。
 *
 * `user_nickname` 从 `string` 改成 `string | null`：本端点自己**没有**独立的字段表，
 * 只有一份样例，所以这是**同文档同族推断**，不是直证——`InvitationInfo.inviter_nickname`
 * （:1182）、`GroupBlockedMemberDto.user_nickname`（:1563）都在字段表里明写
 * 「users JOIN；未设为 `null`」。`GroupManagement.tsx` 原有的
 * `member.user_nickname[0]?.toUpperCase()` 在 JOIN 缺失时会直接 TypeError，
 * 风险高于误加一个 `null`。`user_avatar_url` 同 `MyGroup.group_avatar_url`
 * 的理由改可空（样例同样是 `""`）。
 */
export interface GroupMember {
  user_id: string
  user_nickname: string | null
  user_avatar_url: string | null
  role: MemberRole
  group_nickname: string | null
  joined_at: string
  join_method: string
  muted_until: string | null
}

export interface GroupNotice {
  id: string
  title: string
  content: string
  publisher_id: string
  publisher_nickname: string
  published_at: string
  is_pinned: boolean
  updated_at: string
}

/**
 * `GET /api/groups/invitations` 的一条记录（`InvitationInfo`，字段表 doc:1173-1186）。
 *
 * 三处改动，均直接对着字段表：
 * - 补 `inviter_avatar_url`——文档明确存在（:1183），旧接口漏了这个字段；
 * - `group_avatar_url` / `inviter_nickname` / `inviter_avatar_url` / `expires_at`
 *   四个字段改成 `string | null`——字段表逐条写着 `string | null`，
 *   后两个还注明「users JOIN；未设为 `null`」。
 */
export interface GroupInvitation {
  request_id: string
  group_id: string
  group_name: string
  group_avatar_url: string | null
  inviter_id: string
  inviter_nickname: string | null
  inviter_avatar_url: string | null
  message: string | null
  created_at: string
  expires_at: string | null
}

// ⚠️ `JoinRequest`（`GET /{group_id}/requests` 的响应行）属于批 4：这是全模块
// 唯一一个文档没有响应样例的列表端点，形状要先打一次真实请求钉住再改，
// 这里刻意不动。
export interface JoinRequest {
  request_id: string
  user_id: string
  user_nickname: string
  user_avatar_url?: string
  message: string | null
  reason?: string | null
  created_at: string
}

/**
 * 头像相对路径 → 绝对地址，只在 api 模块出口做一次。与 `friends.ts:136` 的
 * 同名函数逐字同型——独立定义一份而不是跨 feature 导入，是因为两边调用点
 * 分属不同的领域对象，没必要为一个三行函数建跨模块依赖。
 *
 * `null` 与空串统一归一为 `null`（未知/无头像），不兜底成空串：空串会被
 * `<AvatarImage src="">` 当成一次真实的图片请求。
 */
const absoluteAvatar = (path: string | null): string | null => toAbsoluteApiUrl(path) ?? null

// ============================================
// 信封 `data` 的运行时校验（parse 档）
// ============================================

/**
 * `GET /api/groups/{group_id}/members` 的 `data`：对象（不是数组），
 * 数组挂在 `members` 字段上，`total` 与它同级（doc:691-711）。
 *
 * 不能用 `readEnvelopeList`——那个只取一个数组字段，取不到同级的 `total`。
 * 也不能用 `require: ['members', 'total']`——`require` 认 `null` 为「存在」，
 * `data.members: null` 会被放行，把 `TypeError` 推迟到调用点的 `.map()`；
 * `arr()` 会对 `members` 做一次真正的 `Array.isArray` 校验。
 */
const groupMembersResponse: Parser<{ members: GroupMember[]; total: number }> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'GET /{group_id}/members 的 data')
    return {
      members: arr(payload, 'members') as GroupMember[],
      total: num(payload, 'total'),
    }
  },
}

/** `POST /api/groups/{group_id}/notices` 的 `data`（doc:1404-1411）。 */
const createNoticeResponse: Parser<{ id: string; published_at: string }> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'POST /{group_id}/notices 的 data')
    return {
      id: str(payload, 'id'),
      published_at: str(payload, 'published_at'),
    }
  },
}

/**
 * `POST /api/groups/{group_id}/mute` 的 `data`：本模块 10 个 `SuccessResponse{success,
 * message}` 之一，但额外带 `muted_until`（doc:1000-1008）。
 *
 * ⚠️ 内层 `data.success` **不是**信封的 `success`——信封的 `success` 已经在
 * `readEnvelope` 内部由 `assertOk` 校验过；这里只取调用点真正要用的 `muted_until`，
 * 不要顺手把 `data.success` 读出来当判据。
 */
const muteMemberResponse: Parser<{ muted_until: string }> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'POST /{group_id}/mute 的 data')
    return { muted_until: str(payload, 'muted_until') }
  },
}

// ============================================
// API 方法
// ============================================

export const groupsApi = {
  // ==========================================
  // 群聊基础操作
  // ==========================================

  /**
   * 创建群聊
   * POST /api/groups
   *
   * ⚠️ 批 3 范围（`join_mode` → `join_approval_required`），本批不动。
   */
  createGroup: async (data: {
    group_name: string
    group_description?: string
    join_mode?: JoinMode
  }): Promise<{ group_id: string; group_name: string; created_at: string }> => {
    console.log('➕ 创建群聊:', data.group_name)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '创建群聊失败' }))
      throw new Error(error.error || '创建群聊失败')
    }

    const result = await response.json()
    console.log('✅ 群聊创建成功:', result.data.group_id)
    return result.data
  },

  /**
   * 获取我的群聊列表
   * GET /api/groups/my
   *
   * doc:113-129 给了完整信封样例：`{"success":true,"code":200,"data":[...]}`，
   * `data` **本身**就是数组，没有 `groups` 包装。旧代码的
   * `result.data?.groups || result.data || result.groups || result || []`
   * 五路猜测链第一路（`.groups`）今天恒为 `undefined`，从未匹配过任何一版
   * 后端格式，短路到 `result.data` 才蒙对——留着只会让"后端真的换成
   * `data.groups`"和"没换"变成同一种表现。不传 `field`、不传 `legacyBare`：
   * 变更日志与样例都点名了这个端点是信封，没有"可能还是裸响应"的余地。
   */
  getMyGroups: async (): Promise<MyGroup[]> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/my`, {
      method: 'GET',
    })

    const rows = await readEnvelopeList<MyGroup>(response, {
      endpoint: 'GET /api/groups/my',
      fallbackMessage: '获取群聊列表失败',
    })

    return rows.map((group) => ({
      ...group,
      group_avatar_url: absoluteAvatar(group.group_avatar_url),
    }))
  },

  /**
   * 搜索群聊
   * GET /api/groups/search?query=xxx
   *
   * ⚠️ 该端点已于 2026-08-17 整套删除，替代端点在 discovery 模块（批 6），
   * 本批不动——这里改的是解包方式，不是"搜索群聊"这个功能本身还能不能用。
   */
  searchGroups: async (query: string): Promise<Group[]> => {
    console.log('🔍 搜索群聊:', query)
    const params = new URLSearchParams({ query })

    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/search?${params}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '搜索群聊失败' }))
      throw new Error(error.error || '搜索群聊失败')
    }

    const result = await response.json()
    return result.data || []
  },

  /**
   * 获取群聊详情
   * GET /api/groups/{group_id}
   *
   * ⚠️ 批 3 范围（`GroupInfo` 要接八字段入群策略），本批不动。
   */
  getGroupDetail: async (groupId: string): Promise<Group> => {
    console.log('ℹ️ 获取群聊详情:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取群聊详情失败' }))
      throw new Error(error.error || '获取群聊详情失败')
    }

    const result = await response.json()
    return result.data
  },

  /**
   * 更新群聊信息
   * PUT /api/groups/{group_id}
   *
   * doc:219-245 连响应样例都没有——正因为 `assertEnvelopeOk` 不要求 `data`，
   * 没样例在这里不是障碍：它只在 `!response.ok` 或外层 `success===false` 时抛。
   */
  updateGroup: async (groupId: string, data: {
    group_name?: string
    group_description?: string
    group_avatar_url?: string
  }): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'PUT /api/groups/{group_id}',
      fallbackMessage: '更新群聊信息失败',
    })
  },

  /**
   * 上传群头像
   * POST /api/groups/{group_id}/avatar
   *
   * ⚠️ 该端点已于 2026-08-28 删除，群头像改走 storage 统一预签名分片直传链路
   * （批 5，需要同时改 `storage.ts` 的 `FileType`/`avatar_target`），本批不动。
   */
  uploadGroupAvatar: async (groupId: string, file: File): Promise<{ avatar_url: string }> => {
    console.log('📸 上传群头像:', groupId, file.name)

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

    const response = await fetch(`${GROUPS_BASE_URL}/${groupId}/avatar`, {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '上传群头像失败' }))
      throw new Error(error.error || '上传群头像失败')
    }

    const result = await response.json()
    console.log('✅ 群头像上传成功:', result.data.avatar_url)
    return result.data
  },

  /**
   * 修改我的群内昵称
   * PUT /api/groups/{group_id}/nickname
   *
   * doc:404-411：`data` 是 `SuccessResponse{success,message}`，内层 `success` 不是
   * 信封 `success`，`assertEnvelopeOk` 不读它，不需要 `data` 就够。
   */
  updateGroupNickname: async (groupId: string, nickname: string | null): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/nickname`, {
      method: 'PUT',
      body: JSON.stringify({ nickname }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'PUT /api/groups/{group_id}/nickname',
      fallbackMessage: '修改群内昵称失败',
    })
  },

  /**
   * 修改入群模式
   * PUT /api/groups/{group_id}/join_mode
   *
   * ⚠️ 该端点已于 2026-08-17 整套删除（migration 043），批 3 换成
   * `updateJoinPolicy` → `PUT /{id}/join-policy`。给已删路由接解包层是在给
   * 死代码做质量投资，本批不动，交给批 3 直接删除。
   */
  updateJoinMode: async (groupId: string, joinMode: JoinMode): Promise<void> => {
    console.log('🔒 修改入群模式:', groupId, joinMode)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/join_mode`, {
      method: 'PUT',
      body: JSON.stringify({ join_mode: joinMode }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '修改入群模式失败' }))
      throw new Error(error.error || '修改入群模式失败')
    }

    console.log('✅ 入群模式修改成功')
  },

  /**
   * 解散群聊
   * DELETE /api/groups/{group_id}
   * doc:583-599：`data` 是 `SuccessResponse{success,message}`。
   */
  disbandGroup: async (groupId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}',
      fallbackMessage: '解散群聊失败',
    })
  },

  // ==========================================
  // 成员管理
  // ==========================================

  /**
   * 获取成员列表
   * GET /api/groups/{group_id}/members
   *
   * 旧代码 `result.data || result || {}` + `data.members || []` +
   * `data.total || members.length || 0` 是本文件五路猜测链之一：
   * `total: 0`（合法值）会被 `||` 换成 `members.length`——真 bug，不是风格问题。
   * `groupMembersResponse` 用 `arr`/`num` 各校验一次，拿不到就抛，不再猜。
   */
  getMembers: async (groupId: string): Promise<{ members: GroupMember[]; total: number }> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/members`, {
      method: 'GET',
    })

    const data = await readEnvelope<{ members: GroupMember[]; total: number }>(response, {
      endpoint: 'GET /api/groups/{group_id}/members',
      fallbackMessage: '获取成员列表失败',
      parse: groupMembersResponse,
    })

    return {
      members: data.members.map((member) => ({
        ...member,
        user_avatar_url: absoluteAvatar(member.user_avatar_url),
      })),
      total: data.total,
    }
  },

  /**
   * 邀请成员入群
   * POST /api/groups/{group_id}/invite
   *
   * ⚠️ 批 4 范围（`results[]` 逐条结果要落地到 UI），本批不动。
   */
  inviteMembers: async (groupId: string, userIds: string[], message?: string): Promise<{
    results: Array<{ user_id: string; success: boolean; message: string }>
  }> => {
    console.log('📩 邀请成员入群:', groupId, userIds)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds, message }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '邀请成员失败' }))
      throw new Error(error.error || '邀请成员失败')
    }

    const result = await response.json()
    console.log('✅ 邀请已发送')
    return result.data
  },

  /**
   * 退出群聊
   * POST /api/groups/{group_id}/leave
   * doc:813-832：`data` 是 `SuccessResponse{success,message}`。
   */
  leaveGroup: async (groupId: string, reason?: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/leave`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/leave',
      fallbackMessage: '退出群聊失败',
    })
  },

  /**
   * 移除成员
   * DELETE /api/groups/{group_id}/members/{user_id}
   * doc:844-861：`data` 是 `SuccessResponse{success,message}`。
   */
  removeMember: async (groupId: string, userId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/members/${userId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}/members/{user_id}',
      fallbackMessage: '移除成员失败',
    })
  },

  // ==========================================
  // 角色管理
  // ==========================================

  /**
   * 转让群主
   * POST /api/groups/{group_id}/transfer
   * doc:884-903：`data` 是 `SuccessResponse{success,message}`。
   */
  transferOwner: async (groupId: string, newOwnerId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/transfer',
      fallbackMessage: '转让群主失败',
    })
  },

  /**
   * 设置管理员
   * POST /api/groups/{group_id}/admins
   * doc:920-939：`data` 是 `SuccessResponse{success,message}`。
   */
  setAdmin: async (groupId: string, userId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/admins`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/admins',
      fallbackMessage: '设置管理员失败',
    })
  },

  /**
   * 取消管理员
   * DELETE /api/groups/{group_id}/admins/{user_id}
   * doc:949-966：`data` 是 `SuccessResponse{success,message}`。
   */
  removeAdmin: async (groupId: string, userId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/admins/${userId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}/admins/{user_id}',
      fallbackMessage: '取消管理员失败',
    })
  },

  // ==========================================
  // 禁言管理
  // ==========================================

  /**
   * 禁言成员
   * POST /api/groups/{group_id}/mute
   *
   * 与其它「档 A」端点不同：doc:1000-1008 的 `data` 除 `SuccessResponse` 外还带
   * `muted_until`，类型声明必有这个字段、目前零消费方——降级成 void 需要连类型
   * 一起改，成本高于一行 parse，所以保留返回值并校验它。
   */
  muteMember: async (groupId: string, userId: string, durationMinutes: number): Promise<{
    muted_until: string
  }> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/mute`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, duration_minutes: durationMinutes }),
    })

    return readEnvelope<{ muted_until: string }>(response, {
      endpoint: 'POST /api/groups/{group_id}/mute',
      fallbackMessage: '禁言失败',
      parse: muteMemberResponse,
    })
  },

  /**
   * 解除禁言
   * DELETE /api/groups/{group_id}/mute/{user_id}
   * doc:1019-1036：`data` 是 `SuccessResponse{success,message}`。
   */
  unmuteMember: async (groupId: string, userId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/mute/${userId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}/mute/{user_id}',
      fallbackMessage: '解除禁言失败',
    })
  },

  // ==========================================
  // 入群申请
  // ==========================================

  /**
   * 申请入群
   * POST /api/groups/{group_id}/apply
   *
   * ⚠️ 批 4 范围：`source` 改必填、`data` 换成 `ApplyJoinResponse{status,message}`
   * （`success` 字段已从 `data` 里移除），本批不动。
   */
  applyToJoin: async (groupId: string, message?: string): Promise<void> => {
    console.log('📝 申请入群:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '申请入群失败' }))
      throw new Error(error.error || '申请入群失败')
    }

    console.log('✅ 申请已提交')
  },

  /**
   * 获取收到的邀请
   * GET /api/groups/invitations
   *
   * doc:1146-1170：`data` 是对象，数组挂在 `invitations` 字段上（与 `getMyGroups`
   * 「`data` 本身就是数组」不同形——同一模块两种形状并存，不能"统一处理"）。
   */
  getInvitations: async (): Promise<GroupInvitation[]> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/invitations`, {
      method: 'GET',
    })

    const rows = await readEnvelopeList<GroupInvitation>(response, {
      endpoint: 'GET /api/groups/invitations',
      field: 'invitations',
      fallbackMessage: '获取邀请失败',
    })

    return rows.map((invitation) => ({
      ...invitation,
      group_avatar_url: absoluteAvatar(invitation.group_avatar_url),
      inviter_avatar_url: absoluteAvatar(invitation.inviter_avatar_url),
    }))
  },

  /**
   * 接受邀请
   * POST /api/groups/invitations/{request_id}/accept
   *
   * ⚠️ 批 4 范围：accept 之后是否真的入群由被邀请群的 `join_approval_required`
   * 决定，前端不能靠解析文案预测结果，必须在 accept 后重新拉 `GET /api/groups/my`
   * 确认——这是调用点的语义改动，本批不动。
   */
  acceptInvitation: async (requestId: string): Promise<void> => {
    console.log('✅ 接受邀请:', requestId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/invitations/${requestId}/accept`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '接受邀请失败' }))
      throw new Error(error.error || '接受邀请失败')
    }

    console.log('✅ 已接受邀请')
  },

  /**
   * 拒绝邀请
   * POST /api/groups/invitations/{request_id}/decline
   * doc:1236-1247：连响应样例都没有，`assertEnvelopeOk` 不要求 `data`，够用。
   */
  declineInvitation: async (requestId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/invitations/${requestId}/decline`, {
      method: 'POST',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/invitations/{request_id}/decline',
      fallbackMessage: '拒绝邀请失败',
    })
  },

  /**
   * 获取待处理申请（管理员）
   * GET /api/groups/{group_id}/requests
   *
   * ⚠️ 全模块唯一没有响应样例的列表端点（doc:1251-1267 只有权限说明）。
   * `result.data || []` 对「`data` 是数组」和「`data` 是 `{requests:[...]}`」
   * 两种形状都返回真值——同文档里 `invitations` 用 `.invitations`、
   * `requests/sent` 用 `.requests`、`my` 却是裸数组，三个先例互相矛盾，
   * 类比推不出真实形状。批 4 的第一个动作是打一次真实请求把形状钉住，
   * 在那之前保持原状，不在这里瞎猜第二条兼容链。
   */
  getJoinRequests: async (groupId: string): Promise<JoinRequest[]> => {
    console.log('📋 获取待处理申请:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/requests`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取申请失败' }))
      throw new Error(error.error || '获取申请失败')
    }

    const result = await response.json()
    return result.data || []
  },

  /**
   * 同意申请
   * POST /api/groups/{group_id}/requests/{request_id}/approve
   *
   * doc:1290-1298：连响应样例都没有。403（`admin_can_approve=false` 时管理员
   * 无权批准）的文案是通用「权限不足」，调用点只能按状态码分诊，不能 match 文案
   * ——那部分是 `GroupManagement.tsx` 的改动，这里只负责把信封拆对。
   */
  approveJoinRequest: async (groupId: string, requestId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/requests/${requestId}/approve`, {
      method: 'POST',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/requests/{request_id}/approve',
      fallbackMessage: '同意申请失败',
    })
  },

  /**
   * 拒绝申请
   * POST /api/groups/{group_id}/requests/{request_id}/reject
   * doc:1302-1326：连响应样例都没有，同上 403 分诊逻辑在调用点处理。
   */
  rejectJoinRequest: async (groupId: string, requestId: string, reason?: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/requests/{request_id}/reject',
      fallbackMessage: '拒绝申请失败',
    })
  },

  // ==========================================
  // 群公告
  // ==========================================

  /**
   * 发布公告
   * POST /api/groups/{group_id}/notices
   *
   * 旧代码 `return result.data` 在 body 没有 `data` 时会 resolve 成 `undefined`
   * 而不是抛错——`createNoticeResponse` 逐字段校验，拿不到 `id`/`published_at`
   * 就抛。不用 `require`：它认 `null` 为「存在」。
   */
  createNotice: async (groupId: string, data: {
    title: string
    content: string
    is_pinned?: boolean
  }): Promise<{ id: string; published_at: string }> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

    return readEnvelope<{ id: string; published_at: string }>(response, {
      endpoint: 'POST /api/groups/{group_id}/notices',
      fallbackMessage: '发布公告失败',
      parse: createNoticeResponse,
    })
  },

  /**
   * 获取公告列表
   * GET /api/groups/{group_id}/notices
   *
   * doc:1416-1444：`data` 是对象，数组挂在 `notices` 字段上——与 `getMyGroups`
   * 「`data` 本身就是数组」是同一模块内两种并存的形状，不能统一处理。
   */
  getNotices: async (groupId: string): Promise<GroupNotice[]> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices`, {
      method: 'GET',
    })

    return readEnvelopeList<GroupNotice>(response, {
      endpoint: 'GET /api/groups/{group_id}/notices',
      field: 'notices',
      fallbackMessage: '获取公告失败',
    })
  },

  /**
   * 更新公告
   * PUT /api/groups/{group_id}/notices/{notice_id}
   * doc:1448-1475：连响应样例都没有，`assertEnvelopeOk` 不要求 `data`。
   */
  updateNotice: async (groupId: string, noticeId: string, data: {
    title?: string
    content?: string
    is_pinned?: boolean
  }): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices/${noticeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'PUT /api/groups/{group_id}/notices/{notice_id}',
      fallbackMessage: '更新公告失败',
    })
  },

  /**
   * 删除公告
   * DELETE /api/groups/{group_id}/notices/{notice_id}
   * doc:1479-1493：连响应样例都没有，`assertEnvelopeOk` 不要求 `data`。
   */
  deleteNotice: async (groupId: string, noticeId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices/${noticeId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}/notices/{notice_id}',
      fallbackMessage: '删除公告失败',
    })
  },
}
