// ============================================
// API 配置类型
// ============================================

export interface ApiConfig {
  aiApiUrl: string
  aiApiKey: string
  wsUrl: string
  useCustomApi: boolean
}

// ============================================
// 消息类型
// ============================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface GroupChatMessage {
  userName: string
  content: string
  timestamp: number
  userId?: string
}

// ============================================
// 用户类型
// ============================================

export interface OnlineUser {
  id: string
  name: string
}

export interface MeetingParticipant {
  id: string
  userName: string
  videoEnabled: boolean
  audioEnabled?: boolean
}

// ============================================
// 好友系统类型
// ============================================

export interface Friend {
  user_id: string
  nickname: string
  avatar_url?: string
  email?: string
  signature?: string
}

export interface PendingRequest {
  applicant_user_id: string
  nickname: string
  reason?: string
  request_time: string
}

export interface SentRequest {
  target_user_id: string
  reason?: string
  request_time: string
  status: string
}

// ============================================
// 用户资料类型
// ============================================

export interface UserProfile {
  user_id: string
  user_nickname: string
  user_email: string | null
  user_signature: string | null
  user_avatar_url: string | null
  admin: string
  created_at: string
  updated_at: string
}

// ============================================
// 私聊消息类型
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

// ============================================
// 群聊类型
// ============================================

export type JoinMode = 'open' | 'approval_required' | 'invite_only' | 'admin_invite_only' | 'closed'
export type MemberRole = 'owner' | 'admin' | 'member'

export interface Group {
  group_id: string
  group_name: string
  group_avatar_url: string
  group_description?: string
  creator_id?: string
  created_at?: string
  join_mode?: JoinMode
  status?: string
  member_count?: number
}

export interface MyGroup extends Group {
  role: MemberRole
  unread_count: number | null
  last_message_content: string | null
  last_message_time: string | null
}

export interface GroupMember {
  user_id: string
  user_nickname: string
  user_avatar_url: string
  role: MemberRole
  group_nickname: string | null
  joined_at: string
  join_method: string
  muted_until: string | null
}

export interface GroupNotice {
  id: string
  title: string
  content: string
  publisher_id: string
  publisher_nickname: string
  published_at: string
  is_pinned: boolean
  updated_at: string
}

// ============================================
// 群消息类型
// ============================================

export type GroupMessageType = 'text' | 'image' | 'video' | 'file' | 'system'

export interface GroupMessage {
  message_uuid: string
  group_id: string
  sender_id: string
  sender_nickname: string
  sender_avatar_url: string
  message_content: string
  message_type: GroupMessageType
  file_uuid: string | null
  file_url: string | null
  file_size: number | null
  reply_to: string | null
  send_time: string
  is_recalled: boolean
}

// ============================================
// 文件存储类型
// ============================================

export type FileType = 
  | 'user_image' | 'user_video' | 'user_document'
  | 'friend_image' | 'friend_video' | 'friend_document'
  | 'group_image' | 'group_video' | 'group_document'

export type StorageLocation = 'user_files' | 'friend_messages' | 'group_files' | 'avatars'

export interface FileItem {
  file_uuid: string
  filename: string
  file_size: number
  content_type: string
  preview_support: string
  created_at: string
  file_url: string
}
