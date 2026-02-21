import { create } from 'zustand'
import { getWsUrl } from '@/lib/apiConfig'
import { useAuthStore } from './authStore'

// =============================================
// WebSocket 消息类型定义（匹配后端文档）
// =============================================

// 新消息通知（好友/群聊统一格式）
export interface WSNewMessage {
  type: 'new_message'
  source_type: 'friend' | 'group'
  source_id: string
  message_uuid: string
  sender_id: string
  sender_nickname: string
  sender_avatar_url: string
  content: string
  message_type: 'text' | 'image' | 'video' | 'file' | 'system'
  seq: number
  timestamp: string
  file_uuid?: string
  file_url?: string
  file_size?: number
  file_hash?: string
  image_width?: number
  image_height?: number
}

// 消息撤回通知
export interface WSMessageRecalled {
  type: 'message_recalled'
  source_type: 'friend' | 'group'
  source_id: string
  message_uuid: string
  recalled_by: string
}

// 系统通知（好友/群聊系统事件）
export interface WSSystemNotification {
  type: 'system_notification'
  notification_type:
    | 'friend_request'
    | 'friend_request_approved'
    | 'friend_request_rejected'
    | 'friend_deleted'
    | 'group_invite'
    | 'group_join_request'
    | 'group_join_approved'
    | 'group_removed'
    | 'group_disbanded'
    | 'group_notice_updated'
    | 'owner_transferred'
    | 'admin_set'
    | 'admin_removed'
    | 'member_muted'
    | 'member_unmuted'
    | 'group_info_updated'
    | 'group_avatar_updated'
  data: Record<string, unknown>
}

// 好友请求通知数据
export interface FriendRequestData {
  from_user_id: string
  from_nickname: string
  message: string
  request_id: string
}

// 好友请求通过通知数据
export interface FriendRequestApprovedData {
  friend_id: string
  friend_nickname: string
  friend_avatar_url: string
  add_time: string
}

// 好友请求拒绝通知数据
export interface FriendRequestRejectedData {
  user_id: string
  user_nickname: string
  reason?: string
}

// 好友删除通知数据
export interface FriendDeletedData {
  friend_id: string
  friend_nickname: string
  deleted_at: string
}

// 群邀请通知数据
export interface GroupInviteData {
  group_id: string
  group_name: string
  inviter_id: string
  inviter_nickname: string
  message?: string
  request_id: string
}

// 入群申请通知数据
export interface GroupJoinRequestData {
  group_id: string
  group_name: string
  user_id: string
  user_nickname: string
  message?: string
  request_id: string
}

// 入群申请通过通知数据
export interface GroupJoinApprovedData {
  group_id: string
  group_name: string
  group_avatar_url: string
  role: string
  approved_by: string
}

// 被移出群聊通知数据
export interface GroupRemovedData {
  group_id: string
  group_name: string
  removed_by: string
  reason?: string
}

// 群解散通知数据
export interface GroupDisbandedData {
  group_id: string
  group_name: string
  disbanded_by: string
}

// 群公告更新通知数据
export interface GroupNoticeUpdatedData {
  group_id: string
  group_name: string
  notice_id: string
  title: string
  content_preview: string
  publisher_id: string
  publisher_nickname: string
}

// 群主转让通知数据
export interface OwnerTransferredData {
  group_id: string
  group_name: string
  old_owner_id: string
  old_owner_nickname: string
  new_owner_id: string
  new_owner_nickname: string
  transferred_at: string
}

// 管理员设置/取消通知数据
export interface AdminChangeData {
  group_id: string
  group_name: string
  target_user_id: string
  target_nickname: string
  operator_id: string
  operator_nickname: string
  set_at?: string
  removed_at?: string
}

// 禁言/解禁通知数据
export interface MuteChangeData {
  group_id: string
  group_name: string
  target_user_id: string
  target_nickname: string
  operator_id: string
  operator_nickname: string
  mute_until?: string
  muted_at?: string
  unmuted_at?: string
}

// 在线状态通知
export interface WSOnlineStatus {
  type: 'online_status'
  data: {
    user_id: string
    status: 'online' | 'offline'
  }
}

// 正在输入状态
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

// =============================================
// 连接成功消息
// =============================================

export interface WSConnectedMessage {
  type: 'connected'
  unread_summary: {
    total_count: number
    friend_unreads: Array<{
      friend_id: string
      unread_count: number
      last_message_preview: string | null
      last_message_time: string | null
    }>
    group_unreads: Array<{
      group_id: string
      unread_count: number
      last_message_preview: string | null
      last_message_time: string | null
    }>
  }
}

// 已读同步通知
export interface WSReadSync {
  type: 'read_sync'
  source_type: 'friend' | 'group'
  source_id: string
  reader_id: string
  read_at: string
}

// 所有 WebSocket 消息类型联合
export type WSMessage =
  | WSConnectedMessage
  | WSNewMessage
  | WSMessageRecalled
  | WSSystemNotification
  | WSReadSync
  | WSOnlineStatus
  | WSTypingStatus
  | WSFileUploaded
  | { type: string; data?: unknown; [key: string]: unknown }

type MessageHandler<T = unknown> = (data: T) => void

interface WSState {
  ws: WebSocket | null
  connected: boolean
  connecting: boolean
  reconnecting: boolean
  reconnectAttempts: number
  error: string | null
  lastPingTime: number | null

  // 消息处理器
  messageHandlers: Map<string, Set<MessageHandler>>

  // Actions
  connect: () => void
  disconnect: () => void
  send: (message: { type: string; [key: string]: unknown }) => void
  sendTyping: (conversationType: 'private' | 'group', conversationId: string, isTyping: boolean) => void
  sendMarkRead: (targetType: 'friend' | 'group', targetId: string) => void
  registerHandler: <T>(type: string, handler: MessageHandler<T>) => () => void
  unregisterHandler: (type: string, handler: MessageHandler) => void
}

const MAX_RECONNECT_ATTEMPTS = 10
const TOKEN_REFRESH_THRESHOLD = 3 // 连续失败 3 次后尝试刷新 token
const RECONNECT_BASE_DELAY = 1000 // 1 秒
const PING_INTERVAL = 30000 // 30 秒

export const useWSStore = create<WSState>((set, get) => {
  let pingInterval: ReturnType<typeof setInterval> | null = null
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  // 用于跟踪当前活跃的 WebSocket 实例，防止旧实例的回调干扰新实例
  let activeWsId = 0

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

  const scheduleReconnect = async (closeCode?: number) => {
    const state = get()
    if (state.reconnecting || state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        set({ error: '无法连接到服务器，请刷新页面重试', reconnecting: false })
      }
      return
    }

    const attempts = state.reconnectAttempts
    const isAuthError = closeCode === 1008
    const shouldRefreshToken = isAuthError || attempts >= TOKEN_REFRESH_THRESHOLD

    // 尝试刷新 token
    if (shouldRefreshToken) {
      console.warn('[WebSocket] 尝试刷新 token...')
      const authStore = useAuthStore.getState()
      if (authStore.refreshToken) {
        try {
          await authStore.refreshAccessToken()
          console.log('[WebSocket] Token 刷新成功，立即重连')
          set({ reconnectAttempts: 0, reconnecting: false })
          get().connect()
          return
        } catch {
          console.error('[WebSocket] Token 刷新失败，退出登录')
          authStore.clearAuth()
          return
        }
      }
    }

    set({ reconnecting: true })

    // 指数退避重连
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, attempts),
      30000 // 最大 30 秒
    )

    console.log(`将在 ${delay / 1000} 秒后重连 (第 ${attempts + 1} 次尝试)`)

    reconnectTimeout = setTimeout(() => {
      set(s => ({ reconnectAttempts: s.reconnectAttempts + 1, reconnecting: false }))
      get().connect()
    }, delay)
  }

  return {
    ws: null,
    connected: false,
    connecting: false,
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

      // 如果已连接或正在连接，直接返回
      if (state.connected || state.connecting) {
        return
      }

      // 递增 wsId，使旧 WS 的回调失效
      const wsId = ++activeWsId

      // 如果有旧的 WebSocket，静默关闭（用 1000 防止触发重连）
      if (state.ws) {
        try {
          state.ws.onclose = null
          state.ws.onerror = null
          state.ws.onmessage = null
          state.ws.onopen = null
          state.ws.close(1000, 'Replacing connection')
        } catch {
          // 忽略关闭错误
        }
      }

      clearTimers()
      set({ connecting: true, error: null, reconnecting: false })

      try {
        // 使用专用的 WebSocket URL 配置（包含正确的端口）
        const wsBaseUrl = getWsUrl()
        const url = `${wsBaseUrl}/ws?token=${encodeURIComponent(authStore.accessToken)}`

        console.log('🔌 连接 WebSocket...')
        const ws = new WebSocket(url)

        ws.onopen = () => {
          // 如果这个 ws 已经不是最新的，忽略
          if (wsId !== activeWsId) {
            ws.close(1000, 'Stale connection')
            return
          }
          console.log('✅ WebSocket 已连接')
          set({
            connected: true,
            connecting: false,
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
          // 如果这个 ws 已经不是最新的，忽略
          if (wsId !== activeWsId) return

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
                  // 根据消息类型传递不同的数据
                  // 对于有 data 属性的消息，传递 data
                  // 对于没有 data 属性的消息，传递除 type 外的所有字段
                  let payload: unknown
                  if ('data' in message) {
                    payload = message.data
                  } else {
                    const { type: _type, ...rest } = message
                    payload = rest
                  }
                  handler(payload)
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

        ws.onerror = () => {
          // 如果这个 ws 已经不是最新的，忽略
          if (wsId !== activeWsId) return
          console.error('❌ WebSocket 连接错误')
          set({
            error: 'WebSocket 连接错误',
            connected: false,
            connecting: false
          })
        }

        ws.onclose = (event) => {
          // 如果这个 ws 已经不是最新的，忽略（防止旧实例覆盖新实例状态）
          if (wsId !== activeWsId) return

          console.log('🔌 WebSocket 已断开:', event.code, event.reason)
          set({
            connected: false,
            connecting: false,
            ws: null
          })

          clearTimers()

          // 正常关闭（1000）或用户主动断开不重连
          if (event.code !== 1000 && event.code !== 1001) {
            scheduleReconnect(event.code)
          }
        }

        set({ ws })
      } catch (error) {
        console.error('创建 WebSocket 连接失败:', error)
        set({
          error: error instanceof Error ? error.message : 'WebSocket 连接失败',
          connected: false,
          connecting: false
        })
        scheduleReconnect()
      }
    },

    disconnect: () => {
      const state = get()
      clearTimers()
      // 递增 wsId 使旧回调全部失效
      activeWsId++

      if (state.ws) {
        try {
          state.ws.onclose = null
          state.ws.onerror = null
          state.ws.onmessage = null
          state.ws.onopen = null
          state.ws.close(1000, 'User disconnect')
        } catch {
          // 忽略
        }
        set({
          ws: null,
          connected: false,
          connecting: false,
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

    sendMarkRead: (targetType, targetId) => {
      get().send({
        type: 'mark_read',
        target_type: targetType,
        target_id: targetId,
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
  const { connected, connecting, reconnecting, error, connect, disconnect } = useWSStore()
  return { connected, connecting, reconnecting, error, connect, disconnect }
}

export const useWSMessageHandler = <T>(type: string, handler: MessageHandler<T>) => {
  const registerHandler = useWSStore(state => state.registerHandler)

  // 在 effect 外部注册以避免重复注册
  // 实际使用时应在 useEffect 中调用返回的注销函数
  return () => registerHandler<T>(type, handler)
}
