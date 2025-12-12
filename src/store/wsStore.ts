import { create } from 'zustand'
import { getApiBaseUrl } from '../utils/apiConfig'
import { useAuthStore } from './authStore'

// WebSocket 消息类型定义
export interface WSPrivateMessage {
  type: 'private_message'
  data: {
    message_uuid: string
    sender_id: string
    sender_nickname: string
    sender_avatar_url: string
    receiver_id: string
    message_content: string
    message_type: 'text' | 'image' | 'video' | 'file'
    file_uuid: string | null
    file_url: string | null
    file_size: number | null
    send_time: string
  }
}

export interface WSGroupMessage {
  type: 'group_message'
  data: {
    message_uuid: string
    group_id: string
    sender_id: string
    sender_nickname: string
    sender_avatar_url: string
    message_content: string
    message_type: 'text' | 'image' | 'video' | 'file' | 'system'
    file_uuid: string | null
    file_url: string | null
    file_size: number | null
    reply_to: string | null
    send_time: string
  }
}

export interface WSMessageRecalled {
  type: 'message_recalled'
  data: {
    message_uuid: string
    conversation_type: 'private' | 'group'
    conversation_id: string
  }
}

export interface WSFriendRequest {
  type: 'friend_request'
  data: {
    applicant_user_id: string
    nickname: string
    avatar_url: string
    reason: string
    request_time: string
  }
}

export interface WSFriendRequestResult {
  type: 'friend_request_result'
  data: {
    target_user_id: string
    result: 'approved' | 'rejected'
  }
}

export interface WSGroupInvitation {
  type: 'group_invitation'
  data: {
    invitation_id: string
    group_id: string
    group_name: string
    group_avatar_url: string
    inviter_id: string
    inviter_nickname: string
  }
}

export interface WSGroupMemberChange {
  type: 'group_member_joined' | 'group_member_left' | 'group_member_removed'
  data: {
    group_id: string
    user_id: string
    user_nickname: string
  }
}

export interface WSGroupNotice {
  type: 'group_notice'
  data: {
    group_id: string
    notice_id: string
    title: string
    content: string
    publisher_nickname: string
    is_pinned: boolean
    published_at: string
  }
}

export interface WSOnlineStatus {
  type: 'online_status'
  data: {
    user_id: string
    status: 'online' | 'offline'
  }
}

export interface WSTypingStatus {
  type: 'typing'
  data: {
    user_id: string
    conversation_type: 'private' | 'group'
    conversation_id: string
    is_typing: boolean
  }
}

// 文件上传完成通知（好友/群聊文件上传 confirm 后触发）
export interface WSFileUploaded {
  type: 'file_uploaded'
  data: {
    file_uuid: string
    file_url: string
    conversation_type: 'private' | 'group'
    conversation_id: string
    message_uuid: string
    message_send_time: string
  }
}

// 好友关系变化通知
export interface WSFriendshipChange {
  type: 'friendship_added' | 'friendship_removed'
  data: {
    friend_user_id: string
    friend_nickname: string
  }
}

export type WSMessage =
  | WSPrivateMessage
  | WSGroupMessage
  | WSMessageRecalled
  | WSFriendRequest
  | WSFriendRequestResult
  | WSGroupInvitation
  | WSGroupMemberChange
  | WSGroupNotice
  | WSOnlineStatus
  | WSFileUploaded
  | WSFriendshipChange
  | WSTypingStatus
  | { type: string; data: unknown }

type MessageHandler<T = unknown> = (data: T) => void

interface WSState {
  ws: WebSocket | null
  connected: boolean
  reconnecting: boolean
  reconnectAttempts: number
  error: string | null
  lastPingTime: number | null

  // 消息处理器
  messageHandlers: Map<string, Set<MessageHandler>>

  // Actions
  connect: () => void
  disconnect: () => void
  send: (message: { type: string; data?: unknown }) => void
  sendTyping: (conversationType: 'private' | 'group', conversationId: string, isTyping: boolean) => void
  registerHandler: <T>(type: string, handler: MessageHandler<T>) => () => void
  unregisterHandler: (type: string, handler: MessageHandler) => void
}

const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY = 1000 // 1 秒
const PING_INTERVAL = 30000 // 30 秒

export const useWSStore = create<WSState>((set, get) => {
  let pingInterval: ReturnType<typeof setInterval> | null = null
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  const clearTimers = () => {
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
  }

  const scheduleReconnect = () => {
    const state = get()
    if (state.reconnecting || state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        set({ error: '无法连接到服务器，请刷新页面重试' })
      }
      return
    }

    set({ reconnecting: true })

    // 指数退避重连
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, state.reconnectAttempts),
      30000 // 最大 30 秒
    )

    console.log(`将在 ${delay / 1000} 秒后重连 (第 ${state.reconnectAttempts + 1} 次尝试)`)

    reconnectTimeout = setTimeout(() => {
      set(s => ({ reconnectAttempts: s.reconnectAttempts + 1 }))
      get().connect()
    }, delay)
  }

  return {
    ws: null,
    connected: false,
    reconnecting: false,
    reconnectAttempts: 0,
    error: null,
    lastPingTime: null,
    messageHandlers: new Map(),

    connect: () => {
      const state = get()
      const authStore = useAuthStore.getState()

      if (!authStore.accessToken) {
        console.warn('未登录，无法连接 WebSocket')
        return
      }

      // 如果已连接，先断开
      if (state.ws) {
        state.ws.close()
      }

      clearTimers()

      try {
        // 将 http/https 转换为 ws/wss
        const baseUrl = getApiBaseUrl()
        const wsUrl = baseUrl.replace(/^http/, 'ws')
        const url = `${wsUrl}/ws/messages?token=${authStore.accessToken}`

        console.log('🔌 连接 WebSocket...')
        const ws = new WebSocket(url)

        ws.onopen = () => {
          console.log('✅ WebSocket 已连接')
          set({
            connected: true,
            reconnecting: false,
            reconnectAttempts: 0,
            error: null
          })

          // 启动心跳
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }))
              set({ lastPingTime: Date.now() })
            }
          }, PING_INTERVAL)
        }

        ws.onmessage = (event) => {
          try {
            const message: WSMessage = JSON.parse(event.data)

            // 处理 pong 消息
            if (message.type === 'pong') {
              return
            }

            console.log('📨 收到消息:', message.type)

            // 调用对应的处理器
            const handlers = get().messageHandlers.get(message.type)
            if (handlers) {
              handlers.forEach(handler => {
                try {
                  handler(message.data)
                } catch (error) {
                  console.error(`消息处理器错误 (${message.type}):`, error)
                }
              })
            }

            // 也调用通配符处理器
            const allHandlers = get().messageHandlers.get('*')
            if (allHandlers) {
              allHandlers.forEach(handler => {
                try {
                  handler(message)
                } catch (error) {
                  console.error('通配符消息处理器错误:', error)
                }
              })
            }
          } catch (error) {
            console.error('解析消息失败:', error)
          }
        }

        ws.onerror = (error) => {
          console.error('❌ WebSocket 错误:', error)
          set({
            error: 'WebSocket 连接错误',
            connected: false
          })
        }

        ws.onclose = (event) => {
          console.log('🔌 WebSocket 已断开:', event.code, event.reason)
          set({
            connected: false,
            ws: null
          })

          clearTimers()

          // 正常关闭（1000）或用户主动断开不重连
          if (event.code !== 1000 && event.code !== 1001) {
            scheduleReconnect()
          }
        }

        set({ ws, error: null, reconnecting: false })
      } catch (error) {
        console.error('创建 WebSocket 连接失败:', error)
        set({
          error: error instanceof Error ? error.message : 'WebSocket 连接失败',
          connected: false
        })
        scheduleReconnect()
      }
    },

    disconnect: () => {
      const state = get()
      clearTimers()

      if (state.ws) {
        state.ws.close(1000, 'User disconnect')
        set({
          ws: null,
          connected: false,
          reconnecting: false,
          reconnectAttempts: 0
        })
      }
    },

    send: (message) => {
      const state = get()
      if (state.ws && state.connected) {
        state.ws.send(JSON.stringify(message))
      } else {
        console.error('WebSocket 未连接，无法发送消息')
      }
    },

    sendTyping: (conversationType, conversationId, isTyping) => {
      get().send({
        type: 'typing',
        data: {
          conversation_type: conversationType,
          conversation_id: conversationId,
          is_typing: isTyping
        }
      })
    },

    registerHandler: <T>(type: string, handler: MessageHandler<T>) => {
      const handlers = get().messageHandlers
      if (!handlers.has(type)) {
        handlers.set(type, new Set())
      }
      handlers.get(type)!.add(handler as MessageHandler)
      set({ messageHandlers: new Map(handlers) })

      // 返回取消注册的函数
      return () => {
        get().unregisterHandler(type, handler as MessageHandler)
      }
    },

    unregisterHandler: (type: string, handler: MessageHandler) => {
      const handlers = get().messageHandlers
      const typeHandlers = handlers.get(type)
      if (typeHandlers) {
        typeHandlers.delete(handler)
        if (typeHandlers.size === 0) {
          handlers.delete(type)
        }
        set({ messageHandlers: new Map(handlers) })
      }
    },
  }
})

// 导出便捷 hooks
export const useWSConnection = () => {
  const { connected, reconnecting, error, connect, disconnect } = useWSStore()
  return { connected, reconnecting, error, connect, disconnect }
}

export const useWSMessageHandler = <T>(type: string, handler: MessageHandler<T>) => {
  const registerHandler = useWSStore(state => state.registerHandler)

  // 在 effect 外部注册以避免重复注册
  // 实际使用时应在 useEffect 中调用返回的注销函数
  return () => registerHandler<T>(type, handler)
}
