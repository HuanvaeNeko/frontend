import type { Bucket, ChatMessageRec, FileRef, MessageType } from './types'

/**
 * 纯函数：键的拼法、URL 的拼法、预览文案。`world.ts`（造种子）与 `state.ts`（运行时）共用，
 * 两边不能各写一份——ID 口径一旦分叉，种子数据就对不上运行时查询。
 */

/** 前端 `buildFriendConversationId` 同一口径：JS 默认排序（UTF-16 码元序）。 */
export const convIdOf = (a: string, b: string): string => `conv-${[a, b].sort().join('-')}`

export const pairKey = (a: string, b: string): string => [a, b].sort().join('|')

export const blobKey = (bucket: Bucket, key: string): string => `${bucket}/${key}`

/** 头像/背景/群头像的相对路径（`?t=` 是秒级缓存戳，与后端一致）。 */
export const avatarPath = (objectKey: string, stampMs: number): string =>
  `avatars/${objectKey.split('/').map(encodeURIComponent).join('/')}?t=${Math.floor(stampMs / 1000)}`

/** 消息里的 `file_url`：`api/storage/file/{uuid}` 的正式域名绝对形态（与 `好友消息.md` 的样例一致）。 */
export const fileUrlOf = (fileUuid: string): string => `https://api.huanvae.cn/api/storage/file/${fileUuid}`

/** 上传自动消息的正文：`[图片] 文件名` / `[视频] …` / `[文件] …`（`文件存储管理.md` 的约定）。 */
export function autoMessageContent(type: MessageType, filename: string): string {
  const label = type === 'image' ? '[图片]' : type === 'video' ? '[视频]' : '[文件]'
  return `${label} ${filename}`
}

export function messageTypeForContentType(contentType: string): 'image' | 'video' | 'file' {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  return 'file'
}

export function typeFolder(contentType: string): 'images' | 'videos' | 'files' {
  const t = messageTypeForContentType(contentType)
  return t === 'image' ? 'images' : t === 'video' ? 'videos' : 'files'
}

/** 会话列表预览：文本截 60 字，其余类型给一个标签。 */
export function previewOf(message: ChatMessageRec): string {
  if (message.is_recalled) return '[消息已撤回]'
  switch (message.type) {
    case 'text':
    case 'system':
      return message.content.length > 60 ? `${message.content.slice(0, 60)}…` : message.content
    case 'image':
      return '[图片]'
    case 'video':
      return '[视频]'
    case 'file':
      return message.file ? `[文件] ${message.file.filename}` : '[文件]'
    case 'meeting_invite':
      return '[会议邀请]'
    case 'group_card':
      return '[群名片]'
    case 'card':
      return '[卡片]'
    default:
      return message.content
  }
}

export function fileFields(file: FileRef | null) {
  return {
    file_uuid: file?.file_uuid ?? null,
    file_url: file ? fileUrlOf(file.file_uuid) : null,
    file_size: file?.file_size ?? null,
    image_width: file?.width ?? null,
    image_height: file?.height ?? null,
  }
}
