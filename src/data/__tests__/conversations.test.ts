import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadFriends, loadGroups } from '../conversations'

vi.mock('@/features/chat/api/friends', () => ({
  friendsApi: {
    getFriendsList: vi.fn(async () => [
      { user_id: 'u1', nickname: '张三' },
    ]),
  },
}))

vi.mock('@/features/chat/api/groups', () => ({
  groupsApi: {
    getMyGroups: vi.fn(async () => [
      { group_id: 'g1', name: '测试群' },
    ]),
  },
}))

describe('loadFriends', () => {
  beforeEach(() => vi.clearAllMocks())

  it('阶段 1 直接透传 friendsApi 的结果', async () => {
    const result = await loadFriends()
    expect(result).toEqual([{ user_id: 'u1', nickname: '张三' }])
  })
})

describe('loadGroups', () => {
  beforeEach(() => vi.clearAllMocks())

  it('阶段 1 直接透传 groupsApi 的结果', async () => {
    const result = await loadGroups()
    expect(result).toEqual([{ group_id: 'g1', name: '测试群' }])
  })
})
