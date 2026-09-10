import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError } from '@/lib/apiEnvelope'
import { messagesApi, type SyncConversationRequest } from '../../api/messages'
import { useChatStore, type Conversation } from '../chatStore'

/**
 * `chatStore.syncMessages` 的会话标识往返。
 *
 * 修复前这里有两处对称的错，合起来让**离线增量同步从未工作过**：
 * 1. 发出去的是单方的 `conv-{好友ID}`，后端按 `conv-{我}-{好友}` 建索引，认不出；
 * 2. 回来的 id 用 `replace(/^conv-/,'')` 反解，对双方形式会得出 `user123-user456`
 *    这种半截串，匹配不到任何本地会话。
 *
 * 两处都不报错：`for (const conv of result.conversations)` 空转，日志照打
 * "✅ 消息同步完成: 0 个会话"。所以这两条用例分别钉住**请求实参**和**store 终态**——
 * 只断言"没抛错"的话，坏代码同样通过。
 */

const FRIEND_CONV: Conversation = {
  id: 'user456',
  type: 'friend',
  name: '张三',
  unreadCount: 0,
  lastSeq: 100,
}

const GROUP_CONV: Conversation = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  type: 'group',
  name: '测试群',
  unreadCount: 0,
  lastSeq: 50,
}

const SYNC_MSG = {
  message_uuid: 'm-new',
  sender_id: 'user456',
  receiver_id: 'user123',
  message_content: '你回来啦',
  message_type: 'text' as const,
  file_uuid: null,
  file_url: null,
  file_size: null,
  file_hash: null,
  filename: null,
  content_type: null,
  image_width: null,
  image_height: null,
  seq: 101,
  send_time: '2026-09-07T03:00:00Z',
}

const resetStore = () => {
  useChatStore.setState({
    conversations: [],
    isSyncing: false,
    messages: [],
    selectedConversation: null,
  })
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  // 会话制下 fetchWithAuth 不再读 token——同源 cookie 自动带上。
  useAuthStore.setState({ isAuthenticated: true, user: { user_id: 'user123' } })
  resetStore()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  resetStore()
})

describe('chatStore.syncMessages 的 conversation_id 往返', () => {
  it('好友会话发出的是双方形式 conv-{我}-{好友}，不是单方的 conv-{好友}', async () => {
    let captured: SyncConversationRequest[] = []
    vi.spyOn(messagesApi, 'syncMessages').mockImplementation(async (requests) => {
      captured = requests
      return { conversations: [] }
    })
    useChatStore.setState({ conversations: [FRIEND_CONV] })

    await useChatStore.getState().syncMessages()

    expect(captured).toHaveLength(1)
    expect(captured[0].conversation_id).toBe('conv-user123-user456')
    expect(captured[0].conversation_type).toBe('friend')
    expect(captured[0].last_seq).toBe(100)
  })

  it('群会话直接用 group_id，不加 conv- 前缀', async () => {
    let captured: SyncConversationRequest[] = []
    vi.spyOn(messagesApi, 'syncMessages').mockImplementation(async (requests) => {
      captured = requests
      return { conversations: [] }
    })
    useChatStore.setState({ conversations: [GROUP_CONV] })

    await useChatStore.getState().syncMessages()

    expect(captured[0].conversation_id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(captured[0].conversation_type).toBe('group')
  })

  it('响应按本地映射反查，lastSeq 真的被推进（旧代码在这里静默停在 100）', async () => {
    vi.spyOn(messagesApi, 'syncMessages').mockResolvedValue({
      conversations: [
        {
          conversation_id: 'conv-user123-user456',
          conversation_type: 'friend',
          messages: [SYNC_MSG],
          latest_seq: 120,
          has_more: false,
        },
      ],
    })
    useChatStore.setState({ conversations: [FRIEND_CONV] })

    await useChatStore.getState().syncMessages()

    const conv = useChatStore.getState().conversations.find((c) => c.id === 'user456')
    expect(conv?.lastSeq).toBe(120)
    expect(conv?.unreadCount).toBe(1)
    expect(conv?.lastMessage).toBe('你回来啦')
  })

  it('响应里出现没请求过的 conversation_id 时跳过并告警，不写坏本地状态', async () => {
    vi.spyOn(messagesApi, 'syncMessages').mockResolvedValue({
      conversations: [
        {
          conversation_id: 'conv-someone-else',
          conversation_type: 'friend',
          messages: [SYNC_MSG],
          latest_seq: 999,
          has_more: false,
        },
      ],
    })
    useChatStore.setState({ conversations: [FRIEND_CONV] })

    await useChatStore.getState().syncMessages()

    const conv = useChatStore.getState().conversations.find((c) => c.id === 'user456')
    expect(conv?.lastSeq).toBe(100)
    expect(conv?.unreadCount).toBe(0)
    expect(console.warn).toHaveBeenCalled()
  })

  it('拿不到自己的 user_id 时不发请求（宁可不同步，也不发一个后端认不出的 id）', async () => {
    const spy = vi.spyOn(messagesApi, 'syncMessages')
    useAuthStore.setState({ user: null })
    useChatStore.setState({ conversations: [FRIEND_CONV] })

    const result = await useChatStore.getState().syncMessages()

    expect(result).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('同步失败时错误上抛且 isSyncing 复位（不吞成 0 个会话）', async () => {
    vi.spyOn(messagesApi, 'syncMessages').mockRejectedValue(
      new ApiError('请求过于频繁', {
        status: 200,
        code: 429,
        endpoint: 'POST /api/messages/sync',
      }),
    )
    useChatStore.setState({ conversations: [FRIEND_CONV] })

    await expect(useChatStore.getState().syncMessages()).rejects.toThrow('请求过于频繁')
    expect(useChatStore.getState().isSyncing).toBe(false)
  })

  it('认证失败也上抛，不吞成"同步完成、0 个会话"', async () => {
    // 这一支原来是 `console.warn(...); return []`——与"真的没有新消息"完全同形。
    // 唯一调用点 `useRealtimeMessages` 拿到 resolve 后会把 hasSyncedRef 置真，
    // 本次连接不再重试，未读计数与 lastSeq 永远停在旧值且无人察觉。
    // 把 `throw error` 改回 `return []` → 本条第一行断言变红。
    vi.spyOn(messagesApi, 'syncMessages').mockRejectedValue(
      new ApiError('未认证或 Token 无效', {
        status: 401,
        code: 401,
        endpoint: 'POST /api/messages/sync',
      }),
    )
    useChatStore.setState({ conversations: [FRIEND_CONV] })

    await expect(useChatStore.getState().syncMessages()).rejects.toThrow('未认证或 Token 无效')
    expect(useChatStore.getState().isSyncing).toBe(false)
  })

  it('403 权限不足与认证失败一样上抛（不同分支，同样不能变成空数组）', async () => {
    vi.spyOn(messagesApi, 'syncMessages').mockRejectedValue(
      new ApiError('权限不足', {
        status: 403,
        code: 403,
        endpoint: 'POST /api/messages/sync',
      }),
    )
    useChatStore.setState({ conversations: [FRIEND_CONV] })

    await expect(useChatStore.getState().syncMessages()).rejects.toThrow('权限不足')
  })
})


/**
 * `syncMessages` 的响应落地时会话已经换人。
 *
 * 这个 action 的暴露面比另外两个 store 更隐蔽：它写的不是"A 的列表"，而是
 * `updateConversation(本地会话 id, {lastMessage, unreadCount, lastTime})`，
 * 而**本地会话 id 是可以撞上的**——A 和 B 各自都跟 carol 聊过，两边那条会话的
 * 本地 id 都是 `'carol'`。于是 A 那次同步的响应落在 B 的会话里时，
 * 写进 B 侧栏的是「A 与 carol 的私聊最后一条正文」。
 *
 * 反查表 `localIdByConversationId` 是**发请求时**建的（属于 A），所以这条路
 * 不需要后端配合就能走通。
 */
describe('chatStore.syncMessages 跨会话边界', () => {
  const CAROL_CONV: Conversation = {
    id: 'carol',
    type: 'friend',
    name: 'Carol',
    unreadCount: 0,
  }

  const ALICE_PRIVATE_MSG = {
    ...SYNC_MSG,
    message_uuid: 'm-alice-carol',
    sender_id: 'carol',
    receiver_id: 'alice',
    message_content: 'A 和 carol 的私聊内容',
    seq: 999,
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

  /**
   * A 发出同步 → 卡住。返回 A 那次请求的实参（拿它回声 conversation_id，
   * 免得这条用例去复述 `buildFriendConversationId` 的字典序规则）。
   */
  const startAliceSync = async () => {
    await loginAs('alice')
    useChatStore.setState({ conversations: [CAROL_CONV] })

    let captured: SyncConversationRequest[] = []
    const pending = deferred()
    vi.spyOn(messagesApi, 'syncMessages').mockImplementation((requests) => {
      captured = requests
      return pending.promise
    })
    const inFlight = useChatStore.getState().syncMessages()
    await vi.waitFor(() => expect(captured).toHaveLength(1))
    return { inFlight, pending, conversationId: () => captured[0].conversation_id }
  }

  const aliceResult = (conversationId: string) => ({
    conversations: [
      {
        conversation_id: conversationId,
        conversation_type: 'friend' as const,
        messages: [ALICE_PRIVATE_MSG],
        latest_seq: 999,
        has_more: false,
      },
    ],
  })

  const bobCarol = () => useChatStore.getState().conversations.find((c) => c.id === 'carol')

  it('A 与 carol 的私聊正文不会写进 B 那条同名会话', async () => {
    const { inFlight, pending, conversationId } = await startAliceSync()
    const id = conversationId()

    useAuthStore.getState().clearAuth()
    await loginAs('bob')
    // B 也跟 carol 聊过：本地 id 撞上了。
    useChatStore.setState({ conversations: [CAROL_CONV] })

    // 正对照：B 的这条会话此刻是干净的，B 也确实登进来了。
    expect(useAuthStore.getState().user?.user_id).toBe('bob')
    expect(bobCarol()).toEqual(CAROL_CONV)

    pending.release(aliceResult(id) as never)
    await expect(inFlight).rejects.toThrow(/session end/)

    expect(bobCarol()).toEqual(CAROL_CONV)
  })

  it('正对照：同一场会话里，同样的响应确实会写进那条会话', async () => {
    // 没有这一条，上面那条可以被"这条响应根本写不进任何东西"骗过去。
    const { inFlight, pending, conversationId } = await startAliceSync()

    pending.release(aliceResult(conversationId()) as never)
    await inFlight

    expect(bobCarol()?.lastMessage).toBe('A 和 carol 的私聊内容')
    expect(bobCarol()?.unreadCount).toBe(1)
    expect(bobCarol()?.lastSeq).toBe(999)
  })

  it('A 那次迟到的收尾不会把 B 正在转的 isSyncing 关掉', async () => {
    const { inFlight, pending, conversationId } = await startAliceSync()
    const id = conversationId()

    useAuthStore.getState().clearAuth()
    await loginAs('bob')

    // B 自己正在同步。正对照：这一刻它确实是 true。
    useChatStore.setState({ isSyncing: true })
    expect(useChatStore.getState().isSyncing).toBe(true)

    pending.release(aliceResult(id) as never)
    await expect(inFlight).rejects.toThrow(/session end/)

    expect(useChatStore.getState().isSyncing).toBe(true)
  })

  it('A 那次同步的失败不会被报告成 B 这一场的「消息同步失败」', async () => {
    // catch 里那句 `if (!stillMine()) throw error` 唯一的可观测效果就是日志：
    // 本 action 的 catch 不写 store、也不 clearAuth。这条用例只钉住这一点，
    // 不假装它挡住了别的东西。
    const errorSpy = vi.spyOn(console, 'error')
    const { inFlight, pending } = await startAliceSync()

    useAuthStore.getState().clearAuth()
    await loginAs('bob')
    errorSpy.mockClear()

    pending.fail(new Error('A 那边断网了'))
    await expect(inFlight).rejects.toThrow('A 那边断网了')

    expect(errorSpy).not.toHaveBeenCalledWith('消息同步失败:', expect.anything())
  })

  it('正对照：同一场会话里的同一个失败照旧打「消息同步失败」', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    const { inFlight, pending } = await startAliceSync()
    errorSpy.mockClear()

    pending.fail(new Error('断网了'))
    await expect(inFlight).rejects.toThrow('断网了')

    expect(errorSpy).toHaveBeenCalledWith('消息同步失败:', expect.anything())
  })
})
