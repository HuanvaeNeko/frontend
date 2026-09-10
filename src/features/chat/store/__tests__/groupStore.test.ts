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

const { createGroupMock, getMyGroupsMock, getMembersMock, getNoticesMock, updateGroupMock } =
  vi.hoisted(() => ({
    createGroupMock: vi.fn(),
    getMyGroupsMock: vi.fn(),
    getMembersMock: vi.fn(),
    getNoticesMock: vi.fn(),
    updateGroupMock: vi.fn(),
  }))

vi.mock('../../api/groups', () => ({
  groupsApi: {
    createGroup: createGroupMock,
    getMyGroups: getMyGroupsMock,
    getMembers: getMembersMock,
    getNotices: getNoticesMock,
    searchGroups: vi.fn(),
    updateGroup: updateGroupMock,
  },
}))

const { useGroupStore } = await import('../groupStore')
const { useAuthStore } = await import('@/features/auth/store/authStore')

beforeEach(() => {
  createGroupMock.mockReset()
  getMyGroupsMock.mockReset()
  getMembersMock.mockReset()
  getNoticesMock.mockReset()
  updateGroupMock.mockReset()
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


/**
 * 五个异步 action 的「响应落地时会话已经换人」。
 *
 * 与 `friendsStore` 是同一条不变量（`lib/sessionScope.ts` 顶部）：一次写入必须
 * 属于当前活着的那一场会话。本 store 的暴露面是群成员名单——`getMembers` 返回
 * 的每一行都带 `user_id` / 昵称 / 头像 / 角色，`GroupManagement` 直接渲染。
 *
 * 三组分别钉三道不同的守卫：落地成功（`set()` 之前）、落地失败（catch 里，
 * 在写 `error` / `selectionError` 之前）、以及复合 action 内层重载期间换人
 * （收尾那句 `set({isLoading:false})`）。
 */
describe('groupStore 跨会话边界：上一场会话的响应落在下一场里', () => {
  // 三个 DTO 的字段名逐个对过 `features/chat/api/groups.ts` 的
  // `MyGroup` / `GroupMember` / `GroupNotice`。
  const ALICE_GROUP = {
    group_id: 'alice-g1',
    group_name: 'A 的群',
    group_avatar_url: null,
    role: 'owner' as const,
    unread_count: 3,
    last_message_content: 'A 群里的最后一条',
    last_message_time: '2026-01-01T00:00:00Z',
  }
  const ALICE_MEMBERS = {
    members: [
      {
        user_id: 'alice-member',
        user_nickname: 'A 的群友',
        user_avatar_url: null,
        role: 'member' as const,
        group_nickname: null,
        joined_at: '2026-01-01T00:00:00Z',
        join_method: 'search',
        muted_until: null,
      },
    ],
    total: 1,
  }
  const ALICE_NOTICES = [
    {
      id: 'n1',
      title: 'A 的群公告',
      content: 'A 群里的公告正文',
      publisher_id: 'alice',
      publisher_nickname: 'Alice',
      published_at: '2026-01-01T00:00:00Z',
      is_pinned: false,
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]

  /** `create()` 刚返回时的状态，也就是 `registerPristineStoreReset` 的重置目标。 */
  const PRISTINE = {
    myGroups: [],
    selectedGroup: null,
    currentGroupMembers: [],
    currentGroupNotices: [],
    isLoading: false,
    error: null,
    selectionError: null,
  }

  const snapshot = () => {
    const state = useGroupStore.getState()
    return {
      myGroups: state.myGroups,
      selectedGroup: state.selectedGroup,
      currentGroupMembers: state.currentGroupMembers,
      currentGroupNotices: state.currentGroupNotices,
      isLoading: state.isLoading,
      error: state.error,
      selectionError: state.selectionError,
    }
  }

  const deferred = () => {
    let release!: (value: never) => void
    let fail!: (error: unknown) => void
    const promise = new Promise<never>((resolve, reject) => {
      release = resolve as (value: never) => void
      fail = reject
    })
    return { promise, release, fail }
  }

  const loginAs = async (nickname: string) => {
    // 会话制下 authStore.login 打同源 BFF，响应形状是 `{data: {user}}`——
    // 没有 token 三件套。
    const response = new Response(
      JSON.stringify({
        success: true,
        code: 200,
        data: { user: { user_id: nickname } },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await useAuthStore.getState().login({ user_id: nickname, password: 'p' })
    vi.unstubAllGlobals()
  }

  /** A 登出 → B 登录。世代号跨过两个边界。 */
  const crossToBob = async () => {
    useAuthStore.getState().clearAuth()
    await loginAs('bob')
  }

  const ACTIONS = [
    { name: 'loadMyGroups', defer: getMyGroupsMock, landed: [ALICE_GROUP] },
    { name: 'loadGroupMembers', defer: getMembersMock, landed: ALICE_MEMBERS },
    { name: 'loadGroupNotices', defer: getNoticesMock, landed: ALICE_NOTICES },
    {
      name: 'createGroup',
      defer: createGroupMock,
      landed: { group_id: 'g1', group_name: 'A 建的群', created_at: '2026-01-01T00:00:00Z' },
    },
    { name: 'updateGroup', defer: updateGroupMock, landed: undefined },
  ] as const

  const runOf = (name: (typeof ACTIONS)[number]['name']): Promise<unknown> => {
    const store = useGroupStore.getState()
    switch (name) {
      case 'loadMyGroups':
        return store.loadMyGroups()
      case 'loadGroupMembers':
        return store.loadGroupMembers('alice-g1')
      case 'loadGroupNotices':
        return store.loadGroupNotices('alice-g1')
      case 'createGroup':
        return store.createGroup('A 建的群')
      case 'updateGroup':
        return store.updateGroup('alice-g1', { group_name: 'A 改的名' })
    }
  }

  /** 后续列表重载一律回 A 的行：漏了守卫就会在 B 的 store 里看见它。 */
  const stubAliceReloads = () => {
    getMyGroupsMock.mockResolvedValue([ALICE_GROUP])
    getMembersMock.mockResolvedValue(ALICE_MEMBERS)
    getNoticesMock.mockResolvedValue(ALICE_NOTICES)
  }

  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each(ACTIONS)('$name：落地成功时一个字都不写进 B 的 store', async ({ name, defer, landed }) => {
    stubAliceReloads()
    const pending = deferred()
    defer.mockReturnValue(pending.promise)

    const inFlight = runOf(name)
    await crossToBob()

    // 正对照：B 确实登进来了，store 也确实是干净的。
    expect(useAuthStore.getState().user?.user_id).toBe('bob')
    expect(snapshot()).toEqual(PRISTINE)

    pending.release(landed as never)
    await inFlight

    expect(snapshot()).toEqual(PRISTINE)
  })

  it.each(ACTIONS)('$name：落地失败时不写进 B 的 store', async ({ name, defer }) => {
    stubAliceReloads()
    const pending = deferred()
    defer.mockReturnValue(pending.promise)

    const inFlight = runOf(name)
    await crossToBob()
    expect(useAuthStore.getState().user?.user_id).toBe('bob')

    pending.fail(new Error('A 那边的失败'))
    await expect(inFlight).rejects.toThrow('A 那边的失败')

    // `GroupList.tsx` 会把 selectionError 弹成 toast：不挡的话 B 会看到一条
    // 关于 A 那个群的报错。
    expect(snapshot()).toEqual(PRISTINE)
  })

  const COMPOSITE = [
    { name: 'createGroup', primary: createGroupMock, landed: { group_id: 'g1', group_name: 'A 建的群', created_at: '2026-01-01T00:00:00Z' } },
    { name: 'updateGroup', primary: updateGroupMock, landed: undefined },
  ] as const

  it.each(COMPOSITE)(
    '$name 的 loadMyGroups 期间换人：收尾的 isLoading 不写进 B 的 store',
    async ({ name, primary, landed }) => {
      primary.mockResolvedValue(landed)
      const reloadPending = deferred()
      getMyGroupsMock.mockReturnValue(reloadPending.promise)

      const inFlight = runOf(name)
      // 等到内层那次 loadMyGroups **真的**发出去了。
      await vi.waitFor(() => expect(getMyGroupsMock).toHaveBeenCalled())

      await crossToBob()

      // B 自己有一次操作正在转圈。正对照：这一刻它确实是 true。
      useGroupStore.setState({ isLoading: true })
      expect(useGroupStore.getState().isLoading).toBe(true)

      reloadPending.release([] as never)
      await inFlight

      expect(useGroupStore.getState().isLoading).toBe(true)
    },
  )
})
