import { create } from 'zustand'
import { Message } from '@/types'
import { messagesApi, type SyncConversationRequest, type SyncConversationResponse } from '@/api/messages'
import { isAuthError } from '@/api/apiClient'

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

// =============================================
// 未读消息摘要（来自 WebSocket connected 消息）
// =============================================

export interface FriendUnread {
  friend_id: string
  unread_count: number
  last_message_preview: string | null
  last_message_time: string | null
}

export interface GroupUnread {
  group_id: string
  unread_count: number
  last_message_preview: string | null
  last_message_time: string | null
}

export interface UnreadSummary {
  total_count: number
  friend_unreads: FriendUnread[]
  group_unreads: GroupUnread[]
}

// =============================================
// 活跃聊天
// =============================================

export interface ActiveChat {
  type: 'friend' | 'group'
  id: string
}

interface ChatState {
  // 当前激活的标签页
  activeTab: TabType
  setActiveTab: (tab: TabType) => void

  // 当前选中的会话
  selectedConversation: Conversation | null
  setSelectedConversation: (conversation: Conversation | null) => void

  // 活跃聊天（用于判断是否增加未读计数和触发通知）
  activeChat: ActiveChat | null
  setActiveChat: (chat: ActiveChat | null) => void

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

  // 未读消息摘要（来自服务器 WebSocket）
  unreadSummary: UnreadSummary | null
  setUnreadSummary: (summary: UnreadSummary | null) => void
  getFriendUnread: (friendId: string) => number
  getGroupUnread: (groupId: string) => number
  totalUnreadCount: number

  // 未读计数更新（基于 unreadSummary）
  updateFriendUnread: (friendId: string, preview: string, timestamp: string, increment: boolean) => void
  updateGroupUnread: (groupId: string, preview: string, timestamp: string, increment: boolean) => void
  markRead: (targetType: 'friend' | 'group', targetId: string) => void
  updateLastMessage: (targetType: 'friend' | 'group', targetId: string, preview: string, messageType: string, timestamp: string) => void

  // 兼容旧的更新方式
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

// 生成消息预览文本
function getMessagePreviewText(messageType: string, content: string): string {
  switch (messageType) {
    case 'text': return content.length > 50 ? content.slice(0, 50) + '...' : content
    case 'image': return '[图片]'
    case 'video': return '[视频]'
    case 'file': return '[文件]'
    default: return content
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeTab: 'friends',
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectedConversation: null,
  setSelectedConversation: (conversation) => set({ selectedConversation: conversation }),

  activeChat: null,
  setActiveChat: (chat) => set({ activeChat: chat }),

  conversations: [],
  setConversations: (conversations) => {
    set({ conversations })
  },
  addConversation: (conversation) => {
    const conversations = get().conversations
    const exists = conversations.find((c) => c.id === conversation.id)
    if (!exists) {
      set({ conversations: [conversation, ...conversations] })
    }
  },
  updateConversation: (id, updates) => {
    set({
      conversations: get().conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })
  },
  removeConversation: (id) => {
    set({
      conversations: get().conversations.filter((c) => c.id !== id),
    })
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

  // =============================================
  // 未读消息摘要管理
  // =============================================

  unreadSummary: null,
  setUnreadSummary: (summary) => set({ unreadSummary: summary, totalUnreadCount: summary?.total_count ?? 0 }),

  totalUnreadCount: 0,

  getFriendUnread: (friendId) => {
    const summary = get().unreadSummary
    if (!summary) return 0
    const found = summary.friend_unreads.find(u => u.friend_id === friendId)
    return found?.unread_count ?? 0
  },

  getGroupUnread: (groupId) => {
    const summary = get().unreadSummary
    if (!summary) return 0
    const found = summary.group_unreads.find(u => u.group_id === groupId)
    return found?.unread_count ?? 0
  },

  updateFriendUnread: (friendId, preview, timestamp, increment) => {
    set(state => {
      const prev = state.unreadSummary
      if (!prev) {
        return {
          unreadSummary: {
            total_count: increment ? 1 : 0,
            friend_unreads: [{
              friend_id: friendId,
              unread_count: increment ? 1 : 0,
              last_message_preview: preview,
              last_message_time: timestamp,
            }],
            group_unreads: [],
          }
        }
      }

      const newFriendUnreads = [...prev.friend_unreads]
      const idx = newFriendUnreads.findIndex(u => u.friend_id === friendId)

      if (idx >= 0) {
        newFriendUnreads[idx] = {
          ...newFriendUnreads[idx],
          unread_count: increment ? newFriendUnreads[idx].unread_count + 1 : newFriendUnreads[idx].unread_count,
          last_message_preview: preview,
          last_message_time: timestamp,
        }
      } else {
        newFriendUnreads.push({
          friend_id: friendId,
          unread_count: increment ? 1 : 0,
          last_message_preview: preview,
          last_message_time: timestamp,
        })
      }

      const totalCount = newFriendUnreads.reduce((sum, u) => sum + u.unread_count, 0) +
        prev.group_unreads.reduce((sum, u) => sum + u.unread_count, 0)

      return {
        unreadSummary: {
          total_count: totalCount,
          friend_unreads: newFriendUnreads,
          group_unreads: prev.group_unreads,
        }
      }
    })
  },

  updateGroupUnread: (groupId, preview, timestamp, increment) => {
    set(state => {
      const prev = state.unreadSummary
      if (!prev) {
        return {
          unreadSummary: {
            total_count: increment ? 1 : 0,
            friend_unreads: [],
            group_unreads: [{
              group_id: groupId,
              unread_count: increment ? 1 : 0,
              last_message_preview: preview,
              last_message_time: timestamp,
            }],
          }
        }
      }

      const newGroupUnreads = [...prev.group_unreads]
      const idx = newGroupUnreads.findIndex(u => u.group_id === groupId)

      if (idx >= 0) {
        newGroupUnreads[idx] = {
          ...newGroupUnreads[idx],
          unread_count: increment ? newGroupUnreads[idx].unread_count + 1 : newGroupUnreads[idx].unread_count,
          last_message_preview: preview,
          last_message_time: timestamp,
        }
      } else {
        newGroupUnreads.push({
          group_id: groupId,
          unread_count: increment ? 1 : 0,
          last_message_preview: preview,
          last_message_time: timestamp,
        })
      }

      const totalCount = prev.friend_unreads.reduce((sum, u) => sum + u.unread_count, 0) +
        newGroupUnreads.reduce((sum, u) => sum + u.unread_count, 0)

      return {
        unreadSummary: {
          total_count: totalCount,
          friend_unreads: prev.friend_unreads,
          group_unreads: newGroupUnreads,
        }
      }
    })
  },

  markRead: (targetType, targetId) => {
    // 发送 mark_read WebSocket 消息（由 wsStore 处理）
    // 这里只更新本地未读摘要
    set(state => {
      const prev = state.unreadSummary
      if (!prev) return {}

      let newSummary: UnreadSummary
      if (targetType === 'friend') {
        const newFriendUnreads = prev.friend_unreads.map(u =>
          u.friend_id === targetId ? { ...u, unread_count: 0 } : u
        )
        const totalCount = newFriendUnreads.reduce((sum, u) => sum + u.unread_count, 0) +
          prev.group_unreads.reduce((sum, u) => sum + u.unread_count, 0)
        newSummary = { total_count: totalCount, friend_unreads: newFriendUnreads, group_unreads: prev.group_unreads }
      } else {
        const newGroupUnreads = prev.group_unreads.map(u =>
          u.group_id === targetId ? { ...u, unread_count: 0 } : u
        )
        const totalCount = prev.friend_unreads.reduce((sum, u) => sum + u.unread_count, 0) +
          newGroupUnreads.reduce((sum, u) => sum + u.unread_count, 0)
        newSummary = { total_count: totalCount, friend_unreads: prev.friend_unreads, group_unreads: newGroupUnreads }
      }

      return { unreadSummary: newSummary }
    })
  },

  updateLastMessage: (targetType, targetId, preview, messageType, timestamp) => {
    const previewText = getMessagePreviewText(messageType, preview)
    if (targetType === 'friend') {
      get().updateFriendUnread(targetId, previewText, timestamp, false)
    } else {
      get().updateGroupUnread(targetId, previewText, timestamp, false)
    }
  },

  updateUnreadCount: () => {
    // 兼容旧方式：从 conversations 列表计算
    const total = get().conversations.reduce((sum, c) => sum + c.unreadCount, 0)
    void total // 使用 unreadSummary 来计算总未读数
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
      // 认证错误静默处理
      if (error instanceof Error && isAuthError(error)) {
        console.warn('消息同步因认证问题跳过')
        return []
      }
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
      activeChat: null,
    })
  },
}))
