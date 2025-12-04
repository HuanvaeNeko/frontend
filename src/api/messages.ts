import { getApiBaseUrl } from '../utils/apiConfig'
import { useAuthStore } from '../store/authStore'

const MESSAGES_BASE_URL = `${getApiBaseUrl()}/api/messages`

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

export type MessageType = 'text' | 'image' | 'video' | 'file'

export interface Message {
  message_uuid: string
  sender_id: string
  receiver_id: string
  message_content: string
  message_type: MessageType
  file_uuid: string | null
  file_url: string | null
  file_size: number | null
  send_time: string
}

export interface SendMessageRequest {
  receiver_id: string
  message_content: string
  message_type: MessageType
  file_uuid?: string
  file_url?: string
  file_size?: number
}

export interface SendMessageResponse {
  message_uuid: string
  send_time: string
}

export interface GetMessagesResponse {
  messages: Message[]
  has_more: boolean
}

// ============================================
// API 方法
// ============================================

export const messagesApi = {
  /**
   * 发送消息
   * POST /api/messages
   * 请求体: { receiver_id, message_content, message_type, file_uuid?, file_url?, file_size? }
   */
  sendMessage: async (request: SendMessageRequest): Promise<SendMessageResponse> => {
    console.log('📤 发送消息给:', request.receiver_id)
    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}`, {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `发送消息失败 (${response.status})` 
      }))
      console.error('发送消息失败:', error)
      throw new Error(error.message || error.error || '发送消息失败')
    }

    const data = await response.json()
    console.log('✅ 消息发送成功:', data.message_uuid)
    return data
  },

  /**
   * 获取消息列表
   * GET /api/messages?friend_id=xxx&before_uuid=xxx&limit=50
   */
  getMessages: async (
    friendId: string,
    beforeUuid?: string,
    limit: number = 50
  ): Promise<GetMessagesResponse> => {
    console.log('📥 获取消息列表:', friendId)
    
    const params = new URLSearchParams({
      friend_id: friendId,
      limit: limit.toString(),
    })
    
    if (beforeUuid) {
      params.set('before_uuid', beforeUuid)
    }

    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}?${params}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取消息失败 (${response.status})` 
      }))
      console.error('获取消息失败:', error)
      throw new Error(error.message || error.error || '获取消息失败')
    }

    const data = await response.json()
    return data
  },

  /**
   * 删除消息（软删除，仅对自己不可见）
   * DELETE /api/messages/delete
   * 请求体: { message_uuid }
   */
  deleteMessage: async (messageUuid: string): Promise<{ success: boolean; message: string }> => {
    console.log('🗑️ 删除消息:', messageUuid)
    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}/delete`, {
      method: 'DELETE',
      body: JSON.stringify({ message_uuid: messageUuid }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `删除消息失败 (${response.status})` 
      }))
      console.error('删除消息失败:', error)
      throw new Error(error.message || error.error || '删除消息失败')
    }

    const data = await response.json()
    console.log('✅ 消息删除成功')
    return data
  },

  /**
   * 撤回消息（2分钟内，双方都看不到）
   * POST /api/messages/recall
   * 请求体: { message_uuid }
   */
  recallMessage: async (messageUuid: string): Promise<{ success: boolean; message: string }> => {
    console.log('↩️ 撤回消息:', messageUuid)
    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}/recall`, {
      method: 'POST',
      body: JSON.stringify({ message_uuid: messageUuid }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `撤回消息失败 (${response.status})` 
      }))
      console.error('撤回消息失败:', error)
      throw new Error(error.message || error.error || '撤回消息失败')
    }

    const data = await response.json()
    console.log('✅ 消息撤回成功')
    return data
  },

  /**
   * 加载更多历史消息（分页）
   */
  loadMoreMessages: async (
    friendId: string,
    messages: Message[],
    limit: number = 50
  ): Promise<GetMessagesResponse> => {
    if (messages.length === 0) {
      return messagesApi.getMessages(friendId, undefined, limit)
    }

    const oldestUuid = messages[messages.length - 1].message_uuid
    return messagesApi.getMessages(friendId, oldestUuid, limit)
  },
}

