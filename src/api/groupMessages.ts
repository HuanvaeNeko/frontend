import { getApiBaseUrl } from '../utils/apiConfig'
import { useAuthStore } from '../store/authStore'

const GROUP_MESSAGES_BASE_URL = `${getApiBaseUrl()}/api/group-messages`

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

export type GroupMessageType = 'text' | 'image' | 'video' | 'file' | 'system'

export interface GroupMessage {
  message_uuid: string
  group_id: string
  sender_id: string
  sender_nickname: string
  sender_avatar_url: string
  message_content: string
  message_type: GroupMessageType
  file_uuid: string | null
  file_url: string | null
  file_size: number | null
  reply_to: string | null
  send_time: string
  is_recalled: boolean
}

export interface SendGroupMessageRequest {
  group_id: string
  message_content: string
  message_type: GroupMessageType
  file_uuid?: string
  file_url?: string
  file_size?: number
  reply_to?: string
}

export interface SendGroupMessageResponse {
  message_uuid: string
  send_time: string
}

export interface GetGroupMessagesResponse {
  messages: GroupMessage[]
  has_more: boolean
}

// ============================================
// API 方法
// ============================================

export const groupMessagesApi = {
  /**
   * 发送群消息
   * POST /api/group-messages
   * 请求体: { group_id, message_content, message_type, file_uuid?, file_url?, file_size?, reply_to? }
   */
  sendMessage: async (request: SendGroupMessageRequest): Promise<SendGroupMessageResponse> => {
    console.log('📤 发送群消息:', request.group_id)
    const response = await fetchWithAuth(`${GROUP_MESSAGES_BASE_URL}`, {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '发送群消息失败' }))
      console.error('发送群消息失败:', error)
      throw new Error(error.error || '发送群消息失败')
    }

    const result = await response.json()
    console.log('✅ 群消息发送成功:', result.data.message_uuid)
    return result.data
  },

  /**
   * 获取群消息列表
   * GET /api/group-messages?group_id=xxx&before_uuid=xxx&limit=50
   */
  getMessages: async (
    groupId: string,
    beforeUuid?: string,
    limit: number = 50
  ): Promise<GetGroupMessagesResponse> => {
    console.log('📥 获取群消息列表:', groupId)
    
    const params = new URLSearchParams({
      group_id: groupId,
      limit: limit.toString(),
    })
    
    if (beforeUuid) {
      params.set('before_uuid', beforeUuid)
    }

    const response = await fetchWithAuth(`${GROUP_MESSAGES_BASE_URL}?${params}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取群消息失败' }))
      console.error('获取群消息失败:', error)
      throw new Error(error.error || '获取群消息失败')
    }

    const result = await response.json()
    return result.data
  },

  /**
   * 删除群消息（个人，软删除，仅对自己不可见）
   * DELETE /api/group-messages/delete
   * 请求体: { message_uuid }
   */
  deleteMessage: async (messageUuid: string): Promise<{ success: boolean; message: string }> => {
    console.log('🗑️ 删除群消息:', messageUuid)
    const response = await fetchWithAuth(`${GROUP_MESSAGES_BASE_URL}/delete`, {
      method: 'DELETE',
      body: JSON.stringify({ message_uuid: messageUuid }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '删除群消息失败' }))
      console.error('删除群消息失败:', error)
      throw new Error(error.error || '删除群消息失败')
    }

    const result = await response.json()
    console.log('✅ 群消息删除成功')
    return result.data
  },

  /**
   * 撤回群消息
   * POST /api/group-messages/recall
   * 请求体: { message_uuid }
   * 
   * 权限:
   * - 发送者: 只能撤回2分钟内发送的消息
   * - 群主/管理员: 可以撤回任意消息
   */
  recallMessage: async (messageUuid: string): Promise<{ success: boolean; message: string }> => {
    console.log('↩️ 撤回群消息:', messageUuid)
    const response = await fetchWithAuth(`${GROUP_MESSAGES_BASE_URL}/recall`, {
      method: 'POST',
      body: JSON.stringify({ message_uuid: messageUuid }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '撤回群消息失败' }))
      console.error('撤回群消息失败:', error)
      throw new Error(error.error || '撤回群消息失败')
    }

    const result = await response.json()
    console.log('✅ 群消息撤回成功')
    return result.data
  },

  /**
   * 加载更多历史群消息（分页）
   */
  loadMoreMessages: async (
    groupId: string,
    messages: GroupMessage[],
    limit: number = 50
  ): Promise<GetGroupMessagesResponse> => {
    if (messages.length === 0) {
      return groupMessagesApi.getMessages(groupId, undefined, limit)
    }

    const oldestUuid = messages[messages.length - 1].message_uuid
    return groupMessagesApi.getMessages(groupId, oldestUuid, limit)
  },
}

