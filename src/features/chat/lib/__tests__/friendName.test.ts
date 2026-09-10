import { describe, expect, it } from 'vitest'
import { friendDisplayName } from '../friendName'
import { formatUnreadCount } from '../formatUnreadCount'

describe('friendDisplayName：备注 > 昵称 > id，空白视为未设', () => {
  it('三级回退', () => {
    expect(friendDisplayName({ friend_id: 'u1', friend_nickname: '昵称', friend_remark: '备注' })).toBe('备注')
    expect(friendDisplayName({ friend_id: 'u1', friend_nickname: '昵称', friend_remark: '   ' })).toBe('昵称')
    expect(friendDisplayName({ friend_id: 'u1', friend_nickname: null, friend_remark: null })).toBe('u1')
  })
})

describe('formatUnreadCount', () => {
  it('0 → 空串，99 以内原样，超过 → 99+', () => {
    expect(formatUnreadCount(0)).toBe('')
    expect(formatUnreadCount(7)).toBe('7')
    expect(formatUnreadCount(99)).toBe('99')
    expect(formatUnreadCount(100)).toBe('99+')
  })
})
