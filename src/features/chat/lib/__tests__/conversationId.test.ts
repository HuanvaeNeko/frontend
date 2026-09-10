import { describe, expect, it } from 'vitest'
import { friendConversationId, groupConversationId, parseConversationId } from '../conversationId'

describe('会话 id：f-<uid> / g-<gid>', () => {
  it('编码后能解回同一个对象（用户 id 本身可含连字符，只在第一个连字符处切）', () => {
    expect(friendConversationId('alice-01')).toBe('f-alice-01')
    expect(parseConversationId('f-alice-01')).toEqual({ kind: 'friend', userId: 'alice-01' })
    expect(groupConversationId('g_123')).toBe('g-g_123')
    expect(parseConversationId('g-g_123')).toEqual({ kind: 'group', groupId: 'g_123' })
  })

  it('形状不对返回 null（前缀错 / 没有主体 / 空串）', () => {
    expect(parseConversationId('x-1')).toBe(null)
    expect(parseConversationId('f-')).toBe(null)
    expect(parseConversationId('')).toBe(null)
    // 正对照：合法的确实解得出（否则上面三条"恒 null"也绿）
    expect(parseConversationId('f-bob')).not.toBe(null)
  })
})
