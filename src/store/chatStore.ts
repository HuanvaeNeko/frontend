import { create } from 'zustand'
import { Message } from '../types'

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

  clearCurrentChat: () => {
    set({
      selectedConversation: null,
      messages: [],
      messageInput: '',
    })
  },
}))
