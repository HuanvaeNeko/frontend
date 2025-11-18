// API 配置类型
export interface ApiConfig {
  aiApiUrl: string
  aiApiKey: string
  wsUrl: string
  useCustomApi: boolean
}

// 消息类型
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

// 群聊消息类型
export interface GroupChatMessage {
  userName: string
  content: string
  timestamp: number
  userId?: string
}

// 在线用户类型
export interface OnlineUser {
  id: string
  name: string
}

// 视频会议参与者类型
export interface MeetingParticipant {
  id: string
  userName: string
  videoEnabled: boolean
  audioEnabled?: boolean
}
