import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 批 3 的级联点：`GroupList.handleCreateGroup` → `groupStore.createGroup`
 * 第三个形参 → `groupsApi.createGroup` 的请求体字段。
 *
 * 这一段单独测，是因为它是整条链上**唯一没有任何运行期信号**的一环：
 * 后端「忽略未知字段」（backend-docs/groups/群聊管理.md:74-75），继续传
 * `join_mode` 既不 400 也不报错，只会静默按默认「需审核」建群。UI 侧和
 * api 侧各自的测试都盖不到中间这次改名，只有在这里断言实参才看得见。
 */

const { createGroupMock, getMyGroupsMock } = vi.hoisted(() => ({
  createGroupMock: vi.fn(),
  getMyGroupsMock: vi.fn(),
}))

vi.mock('../../api/groups', () => ({
  groupsApi: {
    createGroup: createGroupMock,
    getMyGroups: getMyGroupsMock,
    getMembers: vi.fn(),
    getNotices: vi.fn(),
    searchGroups: vi.fn(),
    updateGroup: vi.fn(),
  },
}))

const { useGroupStore } = await import('../groupStore')

beforeEach(() => {
  createGroupMock.mockReset()
  getMyGroupsMock.mockReset()
  createGroupMock.mockResolvedValue({ group_id: 'g1', group_name: '我的群聊', created_at: '2026-01-01T00:00:00Z' })
  getMyGroupsMock.mockResolvedValue([])
  useGroupStore.setState({ myGroups: [], isLoading: false, error: null })
})

describe('groupStore.createGroup 的第三个形参', () => {
  it('true 透传成 join_approval_required: true，请求体里没有 join_mode', async () => {
    await useGroupStore.getState().createGroup('我的群聊', '简介', true)

    expect(createGroupMock).toHaveBeenCalledWith({
      group_name: '我的群聊',
      group_description: '简介',
      join_approval_required: true,
    })
    expect(createGroupMock.mock.calls[0][0]).not.toHaveProperty('join_mode')
  })

  it('false 透传成 join_approval_required: false（不是字符串 "open"）', async () => {
    await useGroupStore.getState().createGroup('我的群聊', undefined, false)

    expect(createGroupMock).toHaveBeenCalledWith({
      group_name: '我的群聊',
      group_description: undefined,
      join_approval_required: false,
    })
  })

  it('不传时也不伪造一个值——由后端的默认值（true）说了算（doc:60）', async () => {
    await useGroupStore.getState().createGroup('我的群聊')

    expect(createGroupMock).toHaveBeenCalledWith({
      group_name: '我的群聊',
      group_description: undefined,
      join_approval_required: undefined,
    })
  })
})
