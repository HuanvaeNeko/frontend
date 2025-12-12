import { getApiBaseUrl } from '../utils/apiConfig'
import { useAuthStore } from '../store/authStore'

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
      window.location.href = '/login'
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

export interface MyGroup extends Group {
  role: MemberRole
  unread_count: number | null
  last_message_content: string | null
  last_message_time: string | null
}

export interface GroupMember {
  user_id: string
  user_nickname: string
  user_avatar_url: string
  role: MemberRole
  group_nickname: string | null
  joined_at: string
  join_method: string
  muted_until: string | null
}

export interface InviteCode {
  id: string
  code: string
  code_type: 'direct' | 'normal'
  expires_at: string
  max_uses?: number
  used_count?: number
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

export interface GroupInvitation {
  request_id: string
  group_id: string
  group_name: string
  group_avatar_url: string
  inviter_id: string
  inviter_nickname: string
  message: string | null
  created_at: string
  expires_at: string
}

export interface JoinRequest {
  request_id: string
  user_id: string
  user_nickname: string
  user_avatar_url?: string
  message: string | null
  reason?: string | null
  created_at: string
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
   */
  getMyGroups: async (): Promise<MyGroup[]> => {
    console.log('📋 获取我的群聊列表')
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/my`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取群聊列表失败' }))
      throw new Error(error.error || '获取群聊列表失败')
    }

    const result = await response.json()
    console.log('📋 群聊列表响应:', result)
    // 确保返回数组
    const groups = result.data?.groups || result.data || result.groups || result || []
    return Array.isArray(groups) ? groups : []
  },

  /**
   * 搜索群聊
   * GET /api/groups/search?query=xxx
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
   */
  updateGroup: async (groupId: string, data: {
    group_name?: string
    group_description?: string
    group_avatar_url?: string
  }): Promise<void> => {
    console.log('✏️ 更新群聊信息:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '更新群聊信息失败' }))
      throw new Error(error.error || '更新群聊信息失败')
    }

    console.log('✅ 群聊信息更新成功')
  },

  /**
   * 上传群头像
   * POST /api/groups/{group_id}/avatar
   * 请求格式: multipart/form-data
   * 支持格式: jpg, jpeg, png, gif, webp
   * 大小限制: 最大 10MB
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
   */
  updateGroupNickname: async (groupId: string, nickname: string | null): Promise<void> => {
    console.log('✏️ 修改群内昵称:', groupId, nickname)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/nickname`, {
      method: 'PUT',
      body: JSON.stringify({ nickname }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '修改群内昵称失败' }))
      throw new Error(error.error || '修改群内昵称失败')
    }

    console.log('✅ 群内昵称修改成功')
  },

  /**
   * 修改入群模式
   * PUT /api/groups/{group_id}/join-mode
   */
  updateJoinMode: async (groupId: string, joinMode: JoinMode): Promise<void> => {
    console.log('🔒 修改入群模式:', groupId, joinMode)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/join-mode`, {
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
   */
  disbandGroup: async (groupId: string): Promise<void> => {
    console.log('🗑️ 解散群聊:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '解散群聊失败' }))
      throw new Error(error.error || '解散群聊失败')
    }

    console.log('✅ 群聊已解散')
  },

  // ==========================================
  // 成员管理
  // ==========================================

  /**
   * 获取成员列表
   * GET /api/groups/{group_id}/members
   */
  getMembers: async (groupId: string): Promise<{ members: GroupMember[]; total: number }> => {
    console.log('👥 获取成员列表:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/members`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取成员列表失败' }))
      throw new Error(error.error || '获取成员列表失败')
    }

    const result = await response.json()
    console.log('👥 成员列表响应:', result)
    // 确保返回正确格式
    const data = result.data || result || {}
    const members = data.members || []
    return {
      members: Array.isArray(members) ? members : [],
      total: data.total || members.length || 0
    }
  },

  /**
   * 邀请成员入群
   * POST /api/groups/{group_id}/invite
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
   */
  leaveGroup: async (groupId: string, reason?: string): Promise<void> => {
    console.log('🚪 退出群聊:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/leave`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '退出群聊失败' }))
      throw new Error(error.error || '退出群聊失败')
    }

    console.log('✅ 已退出群聊')
  },

  /**
   * 移除成员
   * DELETE /api/groups/{group_id}/members/{user_id}
   */
  removeMember: async (groupId: string, userId: string): Promise<void> => {
    console.log('🚫 移除成员:', groupId, userId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/members/${userId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '移除成员失败' }))
      throw new Error(error.error || '移除成员失败')
    }

    console.log('✅ 成员已移除')
  },

  // ==========================================
  // 角色管理
  // ==========================================

  /**
   * 转让群主
   * POST /api/groups/{group_id}/transfer
   */
  transferOwner: async (groupId: string, newOwnerId: string): Promise<void> => {
    console.log('👑 转让群主:', groupId, newOwnerId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '转让群主失败' }))
      throw new Error(error.error || '转让群主失败')
    }

    console.log('✅ 群主已转让')
  },

  /**
   * 设置管理员
   * POST /api/groups/{group_id}/admins
   */
  setAdmin: async (groupId: string, userId: string): Promise<void> => {
    console.log('⬆️ 设置管理员:', groupId, userId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/admins`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '设置管理员失败' }))
      throw new Error(error.error || '设置管理员失败')
    }

    console.log('✅ 已设置为管理员')
  },

  /**
   * 取消管理员
   * DELETE /api/groups/{group_id}/admins/{user_id}
   */
  removeAdmin: async (groupId: string, userId: string): Promise<void> => {
    console.log('⬇️ 取消管理员:', groupId, userId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/admins/${userId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '取消管理员失败' }))
      throw new Error(error.error || '取消管理员失败')
    }

    console.log('✅ 已取消管理员')
  },

  // ==========================================
  // 禁言管理
  // ==========================================

  /**
   * 禁言成员
   * POST /api/groups/{group_id}/mute
   */
  muteMember: async (groupId: string, userId: string, durationMinutes: number): Promise<{
    muted_until: string
  }> => {
    console.log('🔇 禁言成员:', groupId, userId, durationMinutes, '分钟')
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/mute`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, duration_minutes: durationMinutes }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '禁言失败' }))
      throw new Error(error.error || '禁言失败')
    }

    const result = await response.json()
    console.log('✅ 已禁言')
    return result.data
  },

  /**
   * 解除禁言
   * DELETE /api/groups/{group_id}/mute/{user_id}
   */
  unmuteMember: async (groupId: string, userId: string): Promise<void> => {
    console.log('🔊 解除禁言:', groupId, userId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/mute/${userId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '解除禁言失败' }))
      throw new Error(error.error || '解除禁言失败')
    }

    console.log('✅ 已解除禁言')
  },

  // ==========================================
  // 邀请码管理
  // ==========================================

  /**
   * 生成邀请码
   * POST /api/groups/{group_id}/invite-codes
   */
  createInviteCode: async (groupId: string, options?: {
    max_uses?: number
    expires_in_hours?: number
  }): Promise<InviteCode> => {
    console.log('🔗 生成邀请码:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/invite-codes`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '生成邀请码失败' }))
      throw new Error(error.error || '生成邀请码失败')
    }

    const result = await response.json()
    console.log('✅ 邀请码生成成功:', result.data.code)
    return result.data
  },

  /**
   * 获取邀请码列表
   * GET /api/groups/{group_id}/invite-codes
   */
  getInviteCodes: async (groupId: string): Promise<InviteCode[]> => {
    console.log('📋 获取邀请码列表:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/invite-codes`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取邀请码列表失败' }))
      throw new Error(error.error || '获取邀请码列表失败')
    }

    const result = await response.json()
    return result.data || []
  },

  /**
   * 撤销邀请码
   * DELETE /api/groups/{group_id}/invite-codes/{code_id}
   */
  revokeInviteCode: async (groupId: string, codeId: string): Promise<void> => {
    console.log('🗑️ 撤销邀请码:', groupId, codeId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/invite-codes/${codeId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '撤销邀请码失败' }))
      throw new Error(error.error || '撤销邀请码失败')
    }

    console.log('✅ 邀请码已撤销')
  },

  /**
   * 通过邀请码入群
   * POST /api/groups/join-by-code
   */
  joinByCode: async (code: string): Promise<void> => {
    console.log('🔗 通过邀请码入群:', code)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/join-by-code`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '入群失败' }))
      throw new Error(error.error || '入群失败')
    }

    console.log('✅ 已成功加入群聊')
  },

  // ==========================================
  // 入群申请
  // ==========================================

  /**
   * 申请入群
   * POST /api/groups/{group_id}/apply
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
   */
  getInvitations: async (): Promise<GroupInvitation[]> => {
    console.log('📬 获取收到的邀请')
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/invitations`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取邀请失败' }))
      throw new Error(error.error || '获取邀请失败')
    }

    const result = await response.json()
    return result.data?.invitations || []
  },

  /**
   * 接受邀请
   * POST /api/groups/invitations/{request_id}/accept
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
   */
  declineInvitation: async (requestId: string): Promise<void> => {
    console.log('❌ 拒绝邀请:', requestId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/invitations/${requestId}/decline`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '拒绝邀请失败' }))
      throw new Error(error.error || '拒绝邀请失败')
    }

    console.log('✅ 已拒绝邀请')
  },

  /**
   * 获取待处理申请（管理员）
   * GET /api/groups/{group_id}/requests
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
   */
  approveJoinRequest: async (groupId: string, requestId: string): Promise<void> => {
    console.log('✅ 同意申请:', groupId, requestId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/requests/${requestId}/approve`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '同意申请失败' }))
      throw new Error(error.error || '同意申请失败')
    }

    console.log('✅ 申请已同意')
  },

  /**
   * 拒绝申请
   * POST /api/groups/{group_id}/requests/{request_id}/reject
   */
  rejectJoinRequest: async (groupId: string, requestId: string, reason?: string): Promise<void> => {
    console.log('❌ 拒绝申请:', groupId, requestId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '拒绝申请失败' }))
      throw new Error(error.error || '拒绝申请失败')
    }

    console.log('✅ 申请已拒绝')
  },

  // ==========================================
  // 群公告
  // ==========================================

  /**
   * 发布公告
   * POST /api/groups/{group_id}/notices
   */
  createNotice: async (groupId: string, data: {
    title: string
    content: string
    is_pinned?: boolean
  }): Promise<{ id: string; published_at: string }> => {
    console.log('📢 发布公告:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '发布公告失败' }))
      throw new Error(error.error || '发布公告失败')
    }

    const result = await response.json()
    console.log('✅ 公告发布成功')
    return result.data
  },

  /**
   * 获取公告列表
   * GET /api/groups/{group_id}/notices
   */
  getNotices: async (groupId: string): Promise<GroupNotice[]> => {
    console.log('📋 获取公告列表:', groupId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取公告失败' }))
      throw new Error(error.error || '获取公告失败')
    }

    const result = await response.json()
    console.log('📋 公告列表响应:', result)
    // 确保返回数组
    const notices = result.data?.notices || result.data || result.notices || result || []
    return Array.isArray(notices) ? notices : []
  },

  /**
   * 更新公告
   * PUT /api/groups/{group_id}/notices/{notice_id}
   */
  updateNotice: async (groupId: string, noticeId: string, data: {
    title?: string
    content?: string
    is_pinned?: boolean
  }): Promise<void> => {
    console.log('✏️ 更新公告:', groupId, noticeId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices/${noticeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '更新公告失败' }))
      throw new Error(error.error || '更新公告失败')
    }

    console.log('✅ 公告更新成功')
  },

  /**
   * 删除公告
   * DELETE /api/groups/{group_id}/notices/{notice_id}
   */
  deleteNotice: async (groupId: string, noticeId: string): Promise<void> => {
    console.log('🗑️ 删除公告:', groupId, noticeId)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices/${noticeId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '删除公告失败' }))
      throw new Error(error.error || '删除公告失败')
    }

    console.log('✅ 公告已删除')
  },
}

