/**
 * HuanVae Chat API 模块索引
 * 
 * 本文件导出所有 API 模块，方便统一导入
 */

// 认证 API
export { authApi, apiClient } from './auth'

// 个人资料 API
export { profileApi } from './profile'
export type { UserProfile, UpdateProfileRequest, ChangePasswordRequest, AvatarUploadResponse } from './profile'

// 好友 API
export { friendsApi } from './friends'
export type { Friend, FriendRequest, PendingRequest, SentRequest } from './friends'

// 私聊消息 API
export { messagesApi } from './messages'
export type { Message, MessageType, SendMessageRequest, SendMessageResponse, GetMessagesResponse } from './messages'

// 群聊管理 API
export { groupsApi } from './groups'
export type {
  Group,
  MyGroup,
  GroupMember,
  InviteCode,
  GroupNotice,
  GroupInvitation,
  JoinRequest,
  JoinMode,
  MemberRole,
} from './groups'

// 群消息 API
export { groupMessagesApi } from './groupMessages'
export type {
  GroupMessage,
  GroupMessageType,
  SendGroupMessageRequest,
  SendGroupMessageResponse,
  GetGroupMessagesResponse,
} from './groupMessages'

// 文件存储 API
export { storageApi, calculateFileHash, formatFileSize } from './storage'
export type {
  FileType,
  StorageLocation,
  UploadRequestPayload,
  UploadRequestResponse,
  UploadDirectResponse,
  PresignedUrlResponse,
  FileItem,
  FileListResponse,
} from './storage'

