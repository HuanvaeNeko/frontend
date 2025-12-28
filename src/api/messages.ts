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
  file_hash: string | null
  seq: number
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
  seq: number
}

export interface GetMessagesResponse {
  messages: Message[]
  has_more: boolean
}

// 消息同步类型
export type ConversationType = 'friend' | 'group'

export interface SyncConversationRequest {
  conversation_id: string
  conversation_type: ConversationType
  last_seq: number
}

export interface SyncMessagesRequest {
  conversations: SyncConversationRequest[]
}

export interface SyncConversationResponse {
  conversation_id: string
  conversation_type: ConversationType
  messages: Message[]
  latest_seq: number
  has_more: boolean
}

export interface SyncMessagesResponse {
  conversations: SyncConversationResponse[]
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
   * GET /api/messages?friend_id=xxx&before_time=xxx&limit=50
   * 使用 before_time 时间戳分页（性能优化）
   */
  getMessages: async (
    friendId: string,
    beforeTime?: string,
    limit: number = 50
  ): Promise<GetMessagesResponse> => {
    console.log('📥 获取消息列表:', friendId)
    
    const params = new URLSearchParams({
      friend_id: friendId,
      limit: limit.toString(),
    })
    
    if (beforeTime) {
      params.set('before_time', beforeTime)
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
   * 使用时间戳分页，性能更优
   */
  loadMoreMessages: async (
    friendId: string,
    messages: Message[],
    limit: number = 50
  ): Promise<GetMessagesResponse> => {
    if (messages.length === 0) {
      return messagesApi.getMessages(friendId, undefined, limit)
    }

    const oldestTime = messages[messages.length - 1].send_time
    return messagesApi.getMessages(friendId, oldestTime, limit)
  },

  /**
   * 批量增量同步消息
   * POST /api/messages/sync
   * 
   * 客户端携带每个会话的 last_seq，服务器返回 seq > last_seq 的新消息
   * 
   * 限制:
   * - 单次最多同步 50 个会话
   * - 每个会话最多返回 100 条消息
   * 
   * @param conversations 需要同步的会话列表
   */
  syncMessages: async (conversations: SyncConversationRequest[]): Promise<SyncMessagesResponse> => {
    console.log('🔄 同步消息:', conversations.length, '个会话')
    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}/sync`, {
      method: 'POST',
      body: JSON.stringify({ conversations }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `同步消息失败 (${response.status})` 
      }))
      console.error('同步消息失败:', error)
      throw new Error(error.message || error.error || '同步消息失败')
    }

    const result = await response.json()
    console.log('✅ 消息同步完成')
    return result.data
  },
}

