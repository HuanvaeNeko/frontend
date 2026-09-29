/**
 * 假后端的世界状态。字段名尽量贴近后端 DTO，但这是**存储形状**，不是线上形状——
 * 线上形状一律由 `state.ts` 里的 `*Dto` 函数生成，前端解析器校验的是那一层。
 */

export type Policy = 'manual' | 'auto_accept' | 'auto_reject'
export type Role = 'owner' | 'admin' | 'member'
export type ShareScope = 'all_members' | 'admins' | 'owner_only'
export type SearchScope = 'everyone' | 'admins' | 'owner_only'
export type JoinRequestType = 'search_apply' | 'owner_invite' | 'admin_invite' | 'member_invite'
export type Bucket = 'avatars' | 'user-file' | 'friends-file' | 'group-file'
export type StorageLocation = 'user_files' | 'friend_messages' | 'group_files' | 'avatars'
export type MessageType = 'text' | 'image' | 'video' | 'file' | 'system' | 'meeting_invite' | 'card' | 'group_card'

export interface UserRec {
  user_id: string
  nickname: string
  email: string | null
  password: string
  signature: string | null
  /** 相对路径（`avatars/alice.png?t=…`），`null` = 没有头像 */
  avatar: string | null
  background: string | null
  gender: 'male' | 'female' | 'other' | null
  birthday: string | null
  region: string | null
  admin: 'true' | 'false'
  allow_search: boolean
  search_visible_by_id: boolean
  friend_request_policy: Policy
  group_invite_policy: Policy
  created_at: string
  updated_at: string
}

export interface FriendshipRec {
  /** 两个 user_id 排序后用 `|` 连起来 */
  key: string
  users: [string, string]
  add_time: string
  active: boolean
}

export interface FriendRequestRec {
  request_id: string
  from: string
  to: string
  message: string | null
  created_at: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface FileRef {
  file_uuid: string
  filename: string
  content_type: string
  file_size: number
  width: number | null
  height: number | null
}

export interface ChatMessageRec {
  message_uuid: string
  seq: number
  sender_id: string
  content: string
  type: MessageType
  file: FileRef | null
  is_recalled: boolean
  send_time: string
  /** 软删除：只对这些人不可见 */
  deleted_by: Set<string>
  reply_to: string | null
}

export interface FriendConvRec {
  /** `conv-<a>-<b>`，与前端 `buildFriendConversationId` 同一口径（JS 字符串排序） */
  conv_id: string
  users: [string, string]
  seq: number
  messages: ChatMessageRec[]
  last_read: Map<string, number>
}

export interface JoinPolicy {
  join_approval_required: boolean
  admin_can_approve: boolean
  card_share_scope: ShareScope
  qr_show_scope: ShareScope
  search_scope: SearchScope
  allow_join_via_qr: boolean
  allow_join_via_search: boolean
  allow_join_via_referral: boolean
}

export interface MemberRec {
  user_id: string
  role: Role
  group_nickname: string | null
  joined_at: string
  join_method: string
  muted_until: string | null
  last_read_seq: number
}

export interface NoticeRec {
  id: string
  title: string
  content: string
  publisher_id: string
  published_at: string
  is_pinned: boolean
  updated_at: string
}

export interface GroupRec {
  group_id: string
  name: string
  avatar: string | null
  description: string | null
  creator_id: string
  created_at: string
  status: 'active' | 'disbanded'
  policy: JoinPolicy
  /** 活跃成员；退群/被移出直接删行 */
  members: Map<string, MemberRec>
  seq: number
  messages: ChatMessageRec[]
  notices: NoticeRec[]
}

export interface GroupRequestRec {
  request_id: string
  group_id: string
  /** 申请人 / 被邀请人 */
  user_id: string
  inviter_id: string | null
  message: string | null
  request_type: JoinRequestType
  user_accepted: boolean
  status: 'pending' | 'approved' | 'rejected' | 'declined'
  created_at: string
  expires_at: string | null
}

export interface StoredFileRec {
  file_uuid: string
  owner_id: string
  filename: string
  content_type: string
  file_size: number
  file_hash: string
  bucket: Bucket
  /** 桶内 object key（未编码的原文） */
  key: string
  created_at: string
  storage_location: StorageLocation
  /** 好友文件：对方 user_id；群文件：group_id */
  related_id: string | null
  width: number | null
  height: number | null
  deleted: boolean
}

export interface BlobRec {
  bytes: Uint8Array
  content_type: string
}

export interface UploadRec {
  file_key: string
  owner_id: string
  bucket: Bucket
  object_key: string
  upload_id: string
  storage_location: StorageLocation
  related_id: string | null
  avatar_target: 'user_avatar' | 'user_background' | 'group_avatar' | null
  filename: string
  content_type: string
  declared_size: number
  file_hash: string | null
  width: number | null
  height: number | null
  parts: Map<number, Uint8Array>
  status: 'pending' | 'completed' | 'aborted'
  expires_at_ms: number
}

export interface DeviceRec {
  device_id: string
  user_id: string
  device_info: string
  ip_address: string
  created_at: string
  last_active_at: string
}

export interface BotRec {
  bot_user_id: string
  owner_id: string
  username: string
  nickname: string
  description: string
  is_active: boolean
  is_discoverable: boolean
  created_at: string
}

export interface MiniAppRec {
  miniapp_id: string
  owner_id: string
  name: string
  display_name: string
  description: string
  icon_url: string | null
  access_url: string
  status: string
}

export interface OAuthClientRec {
  client_id: string
  client_secret: string
  owner_id: string
  client_type: 'internal' | 'external'
  app_name: string
  app_description: string
  app_homepage_url: string | null
  app_logo_url: string | null
  redirect_uris: string[]
  allowed_scopes: string[]
  is_active: boolean
  created_at: string
}

export interface OAuthGrantRec {
  id: string
  user_id: string
  client_id: string
  app_name: string
  app_logo_url: string | null
  scope: string
  created_at: string
}

export interface World {
  users: Map<string, UserRec>
  friendships: Map<string, FriendshipRec>
  /** owner → friend → 备注 */
  remarks: Map<string, Map<string, string>>
  /** owner → target → 拉黑时间 */
  blacklist: Map<string, Map<string, string>>
  /** owner → target → 特别关心时间 */
  specialCare: Map<string, Map<string, string>>
  friendRequests: FriendRequestRec[]
  convs: Map<string, FriendConvRec>
  groups: Map<string, GroupRec>
  groupRequests: GroupRequestRec[]
  files: Map<string, StoredFileRec>
  /** `${bucket}/${key}` → 字节 */
  blobs: Map<string, BlobRec>
  uploads: Map<string, UploadRec>
  /** 种子里的"别的设备"；登录产生的设备挂在会话上，不随重置消失 */
  devices: DeviceRec[]
  bots: BotRec[]
  miniapps: MiniAppRec[]
  oauthClients: OAuthClientRec[]
  oauthGrants: OAuthGrantRec[]
}
