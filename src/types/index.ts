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

// 好友类型
export interface Friend {
  user_id: string
  nickname: string
  avatar?: string
  status?: 'online' | 'offline' | 'busy'
}

// 好友请求类型
export interface FriendRequest {
  request_id: string
  from_user_id: string
  to_user_id: string
  message?: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

// 用户资料类型
export interface UserProfile {
  user_id: string
  nickname: string
  email: string
  avatar?: string
  bio?: string
  phone?: string
  birthday?: string
  gender?: 'male' | 'female' | 'other'
  location?: string
  created_at?: string
  updated_at?: string
}

// 用户统计信息类型
export interface UserStats {
  friends_count: number
  messages_count: number
  groups_count: number
  storage_used: number
}
