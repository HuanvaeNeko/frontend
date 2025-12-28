import { create } from 'zustand'
import { Message } from '../types'
import { messagesApi, type SyncConversationRequest, type SyncConversationResponse } from '../api/messages'

export type TabType = 'friends' | 'groups' | 'files' | 'webrtc'

export interface Conversation {
  id: string
  type: 'friend' | 'group'
  name: string
  avatar?: string
  lastMessage?: string
  lastTime?: string
  unreadCount: number
  online?: boolean
  lastSeq?: number // 本地最后消息序列号，用于增量同步
}

// 正在输入状态
export interface TypingStatus {
  conversationId: string
  conversationType: 'private' | 'group'
  userId: string
  isTyping: boolean
  timestamp: number
}

interface ChatState {
  // 当前激活的标签页
  activeTab: TabType
  setActiveTab: (tab: TabType) => void

  // 当前选中的会话
  selectedConversation: Conversation | null
  setSelectedConversation: (conversation: Conversation | null) => void

  // 会话列表
  conversations: Conversation[]
  setConversations: (conversations: Conversation[]) => void
  addConversation: (conversation: Conversation) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  removeConversation: (id: string) => void

  // 消息列表（当前会话的消息）
  messages: Message[]
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  prependMessages: (messages: Message[]) => void

  // 消息输入
  messageInput: string
  setMessageInput: (input: string) => void

  // 未读消息总数
  totalUnreadCount: number
  updateUnreadCount: () => void

  // WebSocket 连接状态
  wsConnected: boolean
  setWsConnected: (connected: boolean) => void

  // 正在输入状态
  typingUsers: Map<string, TypingStatus>
  setTypingStatus: (status: TypingStatus) => void
  clearTypingStatus: (conversationId: string, userId: string) => void
  getTypingUsers: (conversationId: string) => TypingStatus[]

  // 消息同步
  isSyncing: boolean
  syncMessages: () => Promise<SyncConversationResponse[]>
  updateLastSeq: (conversationId: string, seq: number) => void

  // 清空当前会话
  clearCurrentChat: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeTab: 'friends',
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectedConversation: null,
  setSelectedConversation: (conversation) => set({ selectedConversation: conversation }),

  conversations: [],
  setConversations: (conversations) => {
    set({ conversations })
    get().updateUnreadCount()
  },
  addConversation: (conversation) => {
    const conversations = get().conversations
    const exists = conversations.find((c) => c.id === conversation.id)
    if (!exists) {
      set({ conversations: [conversation, ...conversations] })
      get().updateUnreadCount()
    }
  },
  updateConversation: (id, updates) => {
    set({
      conversations: get().conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })
    get().updateUnreadCount()
  },
  removeConversation: (id) => {
    set({
      conversations: get().conversations.filter((c) => c.id !== id),
    })
    get().updateUnreadCount()
  },

  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => {
    set({ messages: [...get().messages, message] })
  },
  prependMessages: (messages) => {
    set({ messages: [...messages, ...get().messages] })
  },

  messageInput: '',
  setMessageInput: (input) => set({ messageInput: input }),

  totalUnreadCount: 0,
  updateUnreadCount: () => {
    const total = get().conversations.reduce((sum, c) => sum + c.unreadCount, 0)
    set({ totalUnreadCount: total })
  },

  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),

  typingUsers: new Map(),
  setTypingStatus: (status) => {
    const key = `${status.conversationId}-${status.userId}`
    const typingUsers = new Map(get().typingUsers)
    
    if (status.isTyping) {
      typingUsers.set(key, { ...status, timestamp: Date.now() })
    } else {
      typingUsers.delete(key)
    }
    
    set({ typingUsers })
    
    // 5秒后自动清除 typing 状态
    if (status.isTyping) {
      setTimeout(() => {
        const currentTyping = get().typingUsers.get(key)
        if (currentTyping && Date.now() - currentTyping.timestamp >= 5000) {
          get().clearTypingStatus(status.conversationId, status.userId)
        }
      }, 5000)
    }
  },
  clearTypingStatus: (conversationId, userId) => {
    const key = `${conversationId}-${userId}`
    const typingUsers = new Map(get().typingUsers)
    typingUsers.delete(key)
    set({ typingUsers })
  },
  getTypingUsers: (conversationId) => {
    const typingUsers = get().typingUsers
    return Array.from(typingUsers.values()).filter(
      s => s.conversationId === conversationId && s.isTyping
    )
  },

  // 消息同步
  isSyncing: false,
  
  syncMessages: async () => {
    const conversations = get().conversations
    if (conversations.length === 0) {
      return []
    }

    set({ isSyncing: true })
    
    try {
      // 构建同步请求
      const syncRequests: SyncConversationRequest[] = conversations.map(conv => ({
        conversation_id: conv.type === 'friend' 
          ? `conv-${conv.id}` // 好友会话使用 conv- 前缀
          : conv.id,          // 群聊直接使用 group_id
        conversation_type: conv.type === 'friend' ? 'friend' : 'group',
        last_seq: conv.lastSeq || 0,
      }))

      // 调用同步 API
      const result = await messagesApi.syncMessages(syncRequests)
      
      // 更新每个会话的 lastSeq
      for (const conv of result.conversations) {
        const originalId = conv.conversation_type === 'friend'
          ? conv.conversation_id.replace(/^conv-/, '')
          : conv.conversation_id
        
        get().updateLastSeq(originalId, conv.latest_seq)
        
        // 如果有新消息，更新未读计数
        if (conv.messages.length > 0) {
          get().updateConversation(originalId, {
            unreadCount: (get().conversations.find(c => c.id === originalId)?.unreadCount || 0) + conv.messages.length,
            lastMessage: conv.messages[conv.messages.length - 1]?.message_content,
            lastTime: conv.messages[conv.messages.length - 1]?.send_time,
          })
        }
      }

      console.log('✅ 消息同步完成:', result.conversations.length, '个会话')
      return result.conversations
    } catch (error) {
      console.error('消息同步失败:', error)
      throw error
    } finally {
      set({ isSyncing: false })
    }
  },

  updateLastSeq: (conversationId, seq) => {
    set({
      conversations: get().conversations.map(c =>
        c.id === conversationId ? { ...c, lastSeq: seq } : c
      ),
    })
  },

  clearCurrentChat: () => {
    set({
      selectedConversation: null,
      messages: [],
      messageInput: '',
    })
  },
}))
