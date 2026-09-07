import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, ApiShapeError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { buildFriendConversationId, messagesApi } from '../messages'

/**
 * 私聊消息端点的信封解包 + DESC→ASC 归一。
 *
 * 这批 bug 的形态是"HTTP 200、不进 catch、不报错，但数据是 undefined"：
 * `GET /api/messages` 把整个信封当 GetMessagesResponse 返回，于是
 * `setMessages(undefined)` → `messages.length` 抛 TypeError；
 * `POST /api/messages` 的三个字段全落空，乐观气泡带着 undefined 进列表，
 * `format(new Date(undefined))` 抛 RangeError。
 *
 * 所以每条正例都必须断言**具体字段值**。只断言 `not.toThrow()` 或
 * `Array.isArray(...)` 的话，坏代码返回的信封/空数组同样满足，等于没测。
 * 反例（裸响应、success:false、data:null）同样不可省——它们是"回退链不会复活"的
 * 唯一证据。
 */

const MESSAGES_BASE = 'https://api.huanvae.cn/api/messages'

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** 后端 REST 列表的一条消息（字段照 `backend-docs/messages/好友消息.md:250-258` 的字段表）。 */
const MSG = {
  message_uuid: '550e8400-e29b-41d4-a716-446655440000',
  sender_id: 'user123',
  receiver_id: 'user456',
  message_content: '你好',
  message_type: 'text',
  file_uuid: null,
  file_url: null,
  file_size: null,
  image_width: null,
  image_height: null,
  is_recalled: false,
  seq: 1,
  send_time: '2026-09-07T03:00:00Z',
}

const SYNC_CONV = {
  conversation_id: 'conv-user123-user456',
  conversation_type: 'friend',
  messages: [{ ...MSG, seq: 101 }],
  latest_seq: 101,
  has_more: false,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: 'RT',
    isAuthenticated: true,
    user: { user_id: 'user123' },
    // 远期过期时间：否则 fetchWithAuth 会先打一次 /refresh，把 mockResolvedValueOnce
    // 的顺序和 fetchMock.mock.calls 的下标整体错开。
    tokenExpiry: Date.now() + 3600_000,
  })
  setApiShapeErrorReporter(() => {})
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('messagesApi.getMessages', () => {
  it('从信封里取出真实消息与 has_more（不是把信封本身当返回值）', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: [MSG], has_more: true } }),
    )

    const result = await messagesApi.getMessages('user456')

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].message_uuid).toBe(MSG.message_uuid)
    expect(result.messages[0].message_content).toBe('你好')
    expect(result.has_more).toBe(true)

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(`${url.origin}${url.pathname}`).toBe(MESSAGES_BASE)
    expect(url.searchParams.get('friend_id')).toBe('user456')
    expect(url.searchParams.get('limit')).toBe('50')
    // 首屏不带游标：带上 before_time 会把最新一页跳过去。
    expect(url.searchParams.get('before_time')).toBeNull()
  })

  it('旧的裸响应 {messages,has_more} 抛 ApiShapeError（好友消息.md 的样例块已过期）', async () => {
    fetchMock.mockResolvedValueOnce(ok({ messages: [MSG], has_more: true }))

    await expect(messagesApi.getMessages('user456')).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('HTTP 200 + success:false 算失败，并透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 429, message: '请求过于频繁' }),
    )

    await expect(messagesApi.getMessages('user456')).rejects.toThrow('请求过于频繁')
  })

  it('data:null 抛错，不会被当成"没有消息"', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: null }))

    await expect(messagesApi.getMessages('user456')).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('messages:null 抛错，而不是兜成空列表', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: null, has_more: true } }),
    )

    await expect(messagesApi.getMessages('user456')).rejects.toThrow(/messages/)
  })

  it('has_more 缺失时抛错，否则触顶分页会被永久关掉', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { messages: [MSG] } }))

    await expect(messagesApi.getMessages('user456')).rejects.toThrow(/has_more/)
  })

  it('消息缺 send_time 时抛错（否则 format(new Date(undefined)) 会炸在渲染层）', async () => {
    const { send_time: _dropped, ...noSendTime } = MSG
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: [noSendTime], has_more: false } }),
    )

    await expect(messagesApi.getMessages('user456')).rejects.toThrow(/send_time/)
  })

  it('把后端的 DESC 归一成 ASC（最旧在前）', async () => {
    const desc = [
      { ...MSG, message_uuid: 'm3', send_time: '2026-09-07T03:00:00Z' },
      { ...MSG, message_uuid: 'm2', send_time: '2026-09-07T02:00:00Z' },
      { ...MSG, message_uuid: 'm1', send_time: '2026-09-07T01:00:00Z' },
    ]
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: desc, has_more: false } }),
    )

    const result = await messagesApi.getMessages('user456')

    expect(result.messages.map((m) => m.send_time)).toEqual([
      '2026-09-07T01:00:00Z',
      '2026-09-07T02:00:00Z',
      '2026-09-07T03:00:00Z',
    ])
  })

  it('loadMoreMessages 的游标取最旧那条——查 fetch 实参，不是返回值', async () => {
    // 顺序错时返回值看起来完全正常，只有请求参数能暴露方向反了。
    const desc = [
      { ...MSG, message_uuid: 'm3', send_time: '2026-09-07T03:00:00Z' },
      { ...MSG, message_uuid: 'm1', send_time: '2026-09-07T01:00:00Z' },
    ]
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: desc, has_more: true } }),
    )
    const firstPage = await messagesApi.getMessages('user456')

    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: [], has_more: false } }),
    )
    await messagesApi.loadMoreMessages('user456', firstPage.messages)

    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]))
    expect(secondUrl.searchParams.get('before_time')).toBe('2026-09-07T01:00:00Z')
  })
})

describe('messagesApi.sendMessage', () => {
  const REQUEST = {
    receiver_id: 'user456',
    message_content: '你好',
    message_type: 'text' as const,
  }

  it('从信封里取出 message_uuid / send_time / seq', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: {
          message_uuid: '550e8400-e29b-41d4-a716-446655440000',
          send_time: '2026-09-07T03:00:00Z',
          seq: 42,
        },
      }),
    )

    const result = await messagesApi.sendMessage(REQUEST)

    expect(result).toEqual({
      message_uuid: '550e8400-e29b-41d4-a716-446655440000',
      send_time: '2026-09-07T03:00:00Z',
      seq: 42,
    })
  })

  it('裸响应抛 ApiShapeError', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ message_uuid: 'x', send_time: '2026-09-07T03:00:00Z', seq: 1 }),
    )

    await expect(messagesApi.sendMessage(REQUEST)).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('缺 seq 也抛错（证明是逐字段校验，不是碰巧有 data 就放行）', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: { message_uuid: 'x', send_time: '2026-09-07T03:00:00Z' },
      }),
    )

    await expect(messagesApi.sendMessage(REQUEST)).rejects.toThrow(/seq/)
  })

  it('HTTP 200 + success:false 算失败', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 400, error: '不是好友关系' }))

    await expect(messagesApi.sendMessage(REQUEST)).rejects.toThrow('不是好友关系')
  })
})

describe('messagesApi.syncMessages', () => {
  const REQ = {
    conversation_id: 'conv-user123-user456',
    conversation_type: 'friend' as const,
    last_seq: 100,
  }

  it('从信封里取出会话列表', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ code: 0, message: 'success', data: { conversations: [SYNC_CONV] } }),
    )

    const result = await messagesApi.syncMessages([REQ])

    expect(result.conversations).toHaveLength(1)
    expect(result.conversations[0].conversation_id).toBe('conv-user123-user456')
    expect(result.conversations[0].latest_seq).toBe(101)
  })

  it('HTTP 200 + success:false 抛 ApiError，而不是 resolve 成 0 个会话', async () => {
    // 这是唯一能证明 `result.data ?? result` + `Array.isArray(x) ? x : []`
    // 那条兜底链被拆掉的断言：旧实现在这里会安静地 resolve 成 {conversations: []}
    // 并照打一行"✅ 消息同步完成"。
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 429, message: '请求过于频繁' }))

    const error = await messagesApi.syncMessages([REQ]).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(200)
    expect((error as ApiError).message).toContain('请求过于频繁')
  })

  it('data:null 抛 ApiShapeError', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: null }))

    await expect(messagesApi.syncMessages([REQ])).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('conversations 不是数组时抛错', async () => {
    fetchMock.mockResolvedValueOnce(ok({ code: 0, data: { conversations: null } }))

    await expect(messagesApi.syncMessages([REQ])).rejects.toThrow(/conversations/)
  })
})

describe('buildFriendConversationId', () => {
  /**
   * 排序口径是从四处一致的文档示例**推断**的，不是文档规定的（见函数 JSDoc）。
   * 这组用例的作用是：口径一旦被真实请求证伪，改动只会落在一个地方，
   * 而且改完立刻能看出哪些断言跟着变。
   */
  it('按字典序拼接，与文档示例 conv-user123-user456 一致', () => {
    expect(buildFriendConversationId('user123', 'user456')).toBe('conv-user123-user456')
  })

  it('与调用方向无关：谁是"我"都得到同一个 id', () => {
    // 这条是这个函数存在的意义——双方各自推导必须落到同一个会话上，
    // 否则两端各同步各的，谁都拿不到对方的消息。
    expect(buildFriendConversationId('user456', 'user123')).toBe(
      buildFriendConversationId('user123', 'user456'),
    )
  })

  it('覆盖文档里另外两组示例', () => {
    expect(buildFriendConversationId('user1', 'user2')).toBe('conv-user1-user2')
    expect(buildFriendConversationId('bob', 'alice')).toBe('conv-alice-bob')
  })
})
