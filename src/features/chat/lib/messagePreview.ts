import { translate } from '@/i18n/translate'

/**
 * 会话列表「最后一条」的预览文本：chatStore.updateLastMessage 与实时新消息共用这一份。
 * 原来两处各有一份只认 text / image / video / file 的拷贝，卡片、会议邀请、群名片把整段原始
 * JSON 当成预览（APP 显示 [卡片] / [会议邀请] / [群名片]）。
 */
export function messagePreviewText(messageType: string, content: string): string {
  switch (messageType) {
    case 'text': return content.length > 50 ? `${content.slice(0, 50)}...` : content
    case 'image': return translate('chat.preview.image')
    case 'video': return translate('chat.preview.video')
    case 'file': return translate('chat.preview.file')
    case 'card': return translate('chat.preview.card')
    case 'meeting_invite': return translate('chat.preview.meetingInvite')
    case 'group_card': return translate('chat.preview.groupCard')
    default: return content
  }
}
