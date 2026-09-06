import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadFriends, loadGroups } from '../conversations'

// mock 数据用**后端文档的形状**（FriendDto，backend-docs/friends/好友添加删除.md:107-118）：
// 用旧字段名造 mock 的话，接口改名之后这个测试照样绿，等于没测。
// vi.mock 的工厂会被提升到文件顶部，不能引用普通的模块级常量——用 vi.hoisted 显式提升。
const { FRIEND_DTO } = vi.hoisted(() => ({
  FRIEND_DTO: {
    friend_id: 'u1',
    friend_nickname: '张三',
    friend_avatar_url: null,
    add_time: '2026-01-01T00:00:00Z',
    approve_reason: null,
    friend_remark: null,
    is_blacklisted: false,
    is_special_care: false,
  },
}))

vi.mock('@/features/chat/api/friends', () => ({
  friendsApi: {
    getFriendsList: vi.fn(async () => [FRIEND_DTO]),
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
    expect(result).toEqual([FRIEND_DTO])
  })
})

describe('loadGroups', () => {
  beforeEach(() => vi.clearAllMocks())

  it('阶段 1 直接透传 groupsApi 的结果', async () => {
    const result = await loadGroups()
    expect(result).toEqual([{ group_id: 'g1', name: '测试群' }])
  })
})
