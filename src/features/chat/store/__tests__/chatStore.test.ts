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
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: 'RT',
    isAuthenticated: true,
    user: { user_id: 'user123' },
    tokenExpiry: Date.now() + 3600_000,
  })
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
})
