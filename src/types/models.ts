// ============================================
// Core Data Models
// ============================================

/**
 * User Profile Information
 */
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

/**
 * Friend Information（`GET /api/friends` 的 `FriendDto`）
 *
 * 字段以 `backend-docs/friends/好友添加删除.md:107-118` 为准；可空字段后端序列化为
 * `null`（无 `skip_serializing_if`），故写 `| null` 而非可选属性。
 * 权威定义在 `src/features/chat/api/friends.ts`——这里是历史遗留的第二份拷贝
 * （全仓无引用），同步更新只是不想再留一份会误导人的旧字段名。
 */
export interface Friend {
  friend_id: string
  friend_nickname: string | null
  friend_avatar_url: string | null
  add_time: string
  approve_reason: string | null
  friend_remark: string | null
  is_blacklisted: boolean
  is_special_care: boolean
}

/**
 * Pending Friend Request（`GET /api/friends/requests/pending` 的 `PendingRequestDto`）
 */
export interface PendingRequest {
  request_id: string
  request_user_id: string
  request_message: string | null
  request_time: string
  requester_nickname: string | null
  requester_avatar_url: string | null
}

/**
 * Sent Friend Request（`GET /api/friends/requests/sent` 的 `SentRequestDto`）
 *
 * 没有 `status`：该端点只返回仍处于 pending 的申请。
 */
export interface SentRequest {
  request_id: string
  sent_to_user_id: string
  sent_message: string | null
  sent_time: string
  sent_to_nickname: string | null
  sent_to_avatar_url: string | null
}

/**
 * Message Type Enum
 */
export type MessageType = 'text' | 'image' | 'video' | 'file'

/**
 * Direct Message
 */
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
  filename: string | null
  content_type: string | null
  image_width: number | null
  image_height: number | null
  seq: number
  send_time: string
}

/**
 * Group Member Role Enum
 */
export type MemberRole = 'owner' | 'admin' | 'member'

/**
 * Group Information
 *
 * ⚠️ 这是 `src/features/chat/api/groups.ts` 里同名类型的一份**重复定义**，
 * 本文件目前没有任何 import（同类问题另见本文件的 GroupMessage 与
 * `apiParse.ts` 顶部注释里记的那次分叉）。收敛成一份是独立待办。
 *
 * 这里跟着删掉 `join_mode` / `JoinMode`：五档入群模式连同 `groups."join-mode"`
 * 列被 migration 043 整套删除（backend-docs/groups/群聊管理.md:442-468），
 * 留一个已不存在的类型在共享类型文件里，只会让下一个人以为它还能用。
 * 入群策略八字段**不补到这里**——权威定义在 `api/groups.ts` 的 `JoinPolicy`，
 * 再抄一份就是第二次分叉。
 *
 * 🔴 `group_avatar_url` 在这里仍是 `string`，与 `api/groups.ts` 的
 * `GroupBase.group_avatar_url: string | null`（字段表 doc:202）不一致——同样是
 * 本文件零 import 的既有宽松，本批没有顺手收紧：收紧它要连带回答
 * `group_description` 要不要跟着改，那是 `api/groups.ts` 的契约问题，这份
 * 重复定义不该抢答，以 `api/groups.ts` 为准。
 */
export interface Group {
  group_id: string
  group_name: string
  group_avatar_url: string
  group_description?: string
  creator_id?: string
  created_at?: string
  status?: string
  member_count?: number
}

/**
 * User's Joined Group with Role and Unread Info
 */
export interface MyGroup extends Group {
  role: MemberRole
  unread_count: number | null
  last_message_content: string | null
  last_message_time: string | null
}

/**
 * Group Member Information
 */
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

/**
 * Group Notice
 */
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

/**
 * Group Message Type Enum
 */
export type GroupMessageType = 'text' | 'image' | 'video' | 'file' | 'system'

/**
 * Group Message
 */
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
  file_hash: string | null
  image_width: number | null
  image_height: number | null
  seq: number
  reply_to: string | null
  send_time: string
  is_recalled: boolean
}

/**
 * File Type Enum
 */
export type FileType = 
  | 'user_image' | 'user_video' | 'user_document'
  | 'friend_image' | 'friend_video' | 'friend_document'
  | 'group_image' | 'group_video' | 'group_document'

/**
 * Storage Location Enum
 */
export type StorageLocation = 'user_files' | 'friend_messages' | 'group_files' | 'avatars'

/**
 * File Item
 */
export interface FileItem {
  file_uuid: string
  filename: string
  file_size: number
  content_type: string
  preview_support: string
  created_at: string
  file_url: string
  file_hash?: string
}

/**
 * AI Chat Message
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

/**
 * API Configuration
 */
export interface ApiConfig {
  aiApiUrl: string
  aiApiKey: string
  wsUrl: string
  useCustomApi: boolean
}
