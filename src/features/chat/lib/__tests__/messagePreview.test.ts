import { describe, expect, it } from 'vitest'
import { useChatStore } from '@/features/chat/store/chatStore'
import { messagePreviewText } from '../messagePreview'

/**
 * 会话列表的「最后一条」预览。原来 chatStore 和 useRealtimeMessages 各有一份一模一样的
 * getMessagePreviewText，都只认 text / image / video / file：卡片、会议邀请、群名片落到 default，
 * 把整段原始 JSON 当成预览显示在会话列表里（APP 显示 [卡片] / [会议邀请] / [群名片]）。
 */
describe('messagePreviewText', () => {
  it('卡片 / 会议邀请 / 群名片给可读的占位，不把原始 JSON 露在会话列表里', () => {
    expect(messagePreviewText('card', '{"version":1,"nodes":[]}')).toBe('[卡片]')
    expect(messagePreviewText('meeting_invite', '{"room_id":"R8K2QF","password":"246810"}')).toBe('[会议邀请]')
    expect(messagePreviewText('group_card', '{"group_id":"g1"}')).toBe('[群名片]')
  })

  it('正对照：文本超过 50 字截断，图片 / 视频 / 文件的占位不变', () => {
    expect(messagePreviewText('text', '短消息')).toBe('短消息')
    expect(messagePreviewText('text', '长'.repeat(60))).toBe(`${'长'.repeat(50)}...`)
    expect(messagePreviewText('image', 'x.png')).toBe('[图片]')
    expect(messagePreviewText('video', 'x.mp4')).toBe('[视频]')
    expect(messagePreviewText('file', 'x.pdf')).toBe('[文件]')
  })

  it('chatStore.updateLastMessage 用的就是这一份：发一张卡片，会话预览是 [卡片] 而不是 JSON', () => {
    useChatStore.setState({ unreadSummary: { total_count: 0, friend_unreads: [{ friend_id: 'weather_bot', unread_count: 0, last_message_preview: '旧', last_message_time: '2026-09-29T09:00:00Z' }], group_unreads: [] } })
    useChatStore.getState().updateLastMessage('friend', 'weather_bot', '{"version":1,"nodes":[]}', 'card', '2026-09-29T10:00:00Z')
    expect(useChatStore.getState().unreadSummary?.friend_unreads[0].last_message_preview).toBe('[卡片]')
  })
})
