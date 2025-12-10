import { create } from 'zustand'
import { getApiBaseUrl } from '../utils/apiConfig'

interface WSMessage {
  type: string
  data: unknown
}

interface WSState {
  ws: WebSocket | null
  connected: boolean
  reconnecting: boolean
  error: string | null
  
  // 消息处理器
  messageHandlers: Map<string, (data: unknown) => void>
  
  // Actions
  connect: (token: string) => void
  disconnect: () => void
  send: (message: WSMessage) => void
  registerHandler: (type: string, handler: (data: unknown) => void) => void
  unregisterHandler: (type: string) => void
}

export const useWSStore = create<WSState>((set, get) => ({
  ws: null,
  connected: false,
  reconnecting: false,
  error: null,
  messageHandlers: new Map(),

  connect: (token: string) => {
    const state = get()
    
    // 如果已连接，先断开
    if (state.ws) {
      state.ws.close()
    }

    try {
      // 将 http/https 转换为 ws/wss
      const baseUrl = getApiBaseUrl()
      const wsUrl = baseUrl.replace(/^http/, 'ws')
      const url = `${wsUrl}/ws/messages?token=${token}`
      
      console.log('连接 WebSocket:', url)
      const ws = new WebSocket(url)

      ws.onopen = () => {
        console.log('WebSocket 已连接')
        set({ 
          connected: true, 
          reconnecting: false, 
          error: null 
        })
      }

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data)
          console.log('收到消息:', message)
          
          // 调用对应的处理器
          const handler = state.messageHandlers.get(message.type)
          if (handler) {
            handler(message.data)
          }
        } catch (error) {
          console.error('解析消息失败:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket 错误:', error)
        set({ 
          error: 'WebSocket 连接错误',
          connected: false 
        })
      }

      ws.onclose = () => {
        console.log('WebSocket 已断开')
        set({ 
          connected: false,
          ws: null 
        })
        
        // 自动重连（5秒后）
        if (!state.reconnecting) {
          set({ reconnecting: true })
          setTimeout(() => {
            console.log('尝试重新连接...')
            get().connect(token)
          }, 5000)
        }
      }

      set({ ws, error: null })
    } catch (error) {
      console.error('创建 WebSocket 连接失败:', error)
      set({ 
        error: error instanceof Error ? error.message : 'WebSocket 连接失败',
        connected: false 
      })
    }
  },

  disconnect: () => {
    const state = get()
    if (state.ws) {
      state.ws.close()
      set({ 
        ws: null, 
        connected: false,
        reconnecting: false 
      })
    }
  },

  send: (message: WSMessage) => {
    const state = get()
    if (state.ws && state.connected) {
      state.ws.send(JSON.stringify(message))
    } else {
      console.error('WebSocket 未连接，无法发送消息')
    }
  },

  registerHandler: (type: string, handler: (data: unknown) => void) => {
    const handlers = get().messageHandlers
    handlers.set(type, handler)
    set({ messageHandlers: new Map(handlers) })
  },

  unregisterHandler: (type: string) => {
    const handlers = get().messageHandlers
    handlers.delete(type)
    set({ messageHandlers: new Map(handlers) })
  },
}))
