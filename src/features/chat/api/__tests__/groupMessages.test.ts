import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, ApiShapeError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { groupMessagesApi } from '../groupMessages'

/**
 * 群消息端点的信封解包 + DESC→ASC 归一。
 *
 * 群侧的四处 `result.data ?? result` 是同一个 bug 的四种伪装：
 * - getMessages：回退后 `data.messages` 为 undefined，被 `Array.isArray(...) ? ... : []`
 *   吞成空列表，`Boolean(data.has_more)` 吞成 false，全程不抛错。
 * - sendMessage：回退后读出三个 undefined 并当作发送成功返回。
 * - delete / recall：**伪装得最像真数据**——业务级 `success` 嵌在 `data` 里，信封顶层
 *   也叫 `success`，回退时 `Boolean(data.success)` 读到的是传输级的 `true`。
 *   所以这两个端点的关键用例必须断言 `rejects`，绝不能写 `expect(result.success).toBe(true)`：
 *   坏代码在那条断言下同样通过。
 */

const GROUP_BASE = 'https://api.huanvae.cn/api/group_messages'

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** 字段照 `backend-docs/group_messages/群消息.md:191-201` 的响应示例。 */
const GROUP_MSG = {
  message_uuid: '019ae4ef-cbf6-7171-88c5-6a891004fc8f',
  group_id: '019ae4ec-0dfe-7ac1-966e-876e9755561c',
  sender_id: 'user_a',
  sender_nickname: '用户A',
  sender_avatar_url: '',
  message_content: '大家好！',
  message_type: 'text',
  file_uuid: null,
  file_url: null,
  file_size: null,
  seq: 1,
  reply_to: null,
  send_time: '2026-09-07T03:00:00Z',
  is_recalled: false,
}

const GROUP_ID = '019ae4ec-0dfe-7ac1-966e-876e9755561c'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: 'RT',
    isAuthenticated: true,
    user: { user_id: 'user_a' },
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

describe('groupMessagesApi.getMessages', () => {
  it('从信封里取出真实群消息与 has_more', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: [GROUP_MSG], has_more: true } }),
    )

    const result = await groupMessagesApi.getMessages(GROUP_ID)

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].message_uuid).toBe(GROUP_MSG.message_uuid)
    expect(result.messages[0].sender_nickname).toBe('用户A')
    expect(result.has_more).toBe(true)
  })

  it('HTTP 200 + success:false 抛 ApiError，而不是安静返回空列表', async () => {
    // 旧实现在这里会 resolve 成 {messages: [], has_more: false}——
    // UI 显示"暂无消息"，没有任何人会去报 bug。
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '你不是该群成员' }))

    const error = await groupMessagesApi.getMessages(GROUP_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toContain('你不是该群成员')
  })

  it('data:null 抛 ApiShapeError，不会回退成整个信封', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: null }))

    await expect(groupMessagesApi.getMessages(GROUP_ID)).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('裸响应抛错', async () => {
    fetchMock.mockResolvedValueOnce(ok({ messages: [GROUP_MSG], has_more: false }))

    await expect(groupMessagesApi.getMessages(GROUP_ID)).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('messages:null 抛错，而不是兜成空列表', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: null, has_more: false } }),
    )

    await expect(groupMessagesApi.getMessages(GROUP_ID)).rejects.toThrow(/messages/)
  })

  it('把后端的 DESC 归一成 ASC（最旧在前）', async () => {
    const desc = [
      { ...GROUP_MSG, message_uuid: 'm3', send_time: '2026-09-07T03:00:00Z' },
      { ...GROUP_MSG, message_uuid: 'm2', send_time: '2026-09-07T02:00:00Z' },
      { ...GROUP_MSG, message_uuid: 'm1', send_time: '2026-09-07T01:00:00Z' },
    ]
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: desc, has_more: false } }),
    )

    const result = await groupMessagesApi.getMessages(GROUP_ID)

    expect(result.messages.map((m) => m.send_time)).toEqual([
      '2026-09-07T01:00:00Z',
      '2026-09-07T02:00:00Z',
      '2026-09-07T03:00:00Z',
    ])
  })

  it('loadMoreMessages 的游标取最旧那条——查 fetch 实参', async () => {
    const desc = [
      { ...GROUP_MSG, message_uuid: 'm3', send_time: '2026-09-07T03:00:00Z' },
      { ...GROUP_MSG, message_uuid: 'm1', send_time: '2026-09-07T01:00:00Z' },
    ]
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: desc, has_more: true } }),
    )
    const firstPage = await groupMessagesApi.getMessages(GROUP_ID)

    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { messages: [], has_more: false } }),
    )
    await groupMessagesApi.loadMoreMessages(GROUP_ID, firstPage.messages)

    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]))
    expect(secondUrl.searchParams.get('before_time')).toBe('2026-09-07T01:00:00Z')
  })
})

describe('groupMessagesApi.sendMessage', () => {
  const REQUEST = {
    group_id: GROUP_ID,
    message_content: '大家好！',
    message_type: 'text' as const,
  }

  it('从信封里取出 message_uuid / send_time / seq', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: {
          message_uuid: '019ae4ef-cbf6-7171-88c5-6a891004fc8f',
          send_time: '2026-09-07T03:00:00Z',
          seq: 7,
        },
      }),
    )

    const result = await groupMessagesApi.sendMessage(REQUEST)

    expect(result).toEqual({
      message_uuid: '019ae4ef-cbf6-7171-88c5-6a891004fc8f',
      send_time: '2026-09-07T03:00:00Z',
      seq: 7,
    })
  })

  it('HTTP 200 + success:false 抛错，而不是返回三个 undefined 当成发送成功', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 403, error: '你已被禁言，无法发送消息' }),
    )

    await expect(groupMessagesApi.sendMessage(REQUEST)).rejects.toThrow('你已被禁言，无法发送消息')
  })

  it('缺 seq 抛错', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: { message_uuid: 'x', send_time: '2026-09-07T03:00:00Z' },
      }),
    )

    await expect(groupMessagesApi.sendMessage(REQUEST)).rejects.toThrow(/seq/)
  })

  it('非 JSON 错误体（网关 502 的 HTML）不再被抹平成一句通用文案', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    await expect(groupMessagesApi.sendMessage(REQUEST)).rejects.toThrow(/502 Bad Gateway/)
  })
})

describe('groupMessagesApi.deleteMessage / recallMessage', () => {
  it('取出业务级 {success,message}（而不是信封的传输级 success）', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { success: true, message: '消息已删除' } }),
    )

    const result = await groupMessagesApi.deleteMessage('m1')

    expect(result).toEqual({ success: true, message: '消息已删除' })
  })

  it('data:null 时抛错——这条是本组的关键构造', async () => {
    // 旧代码在这里返回 {success:true, message:'消息已删除'}：`?? ` 回退到信封，
    // 顶层的 success:true 冒充业务结果，兜底文案冒充后端文案。
    // 它**看起来一切正常**，所以断言只能是 rejects。
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: null }))

    await expect(groupMessagesApi.deleteMessage('m1')).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('业务级 success:false 抛出后端文案（撤回超时 400）', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: { success: false, message: '只能撤回 2 分钟内发送的消息' },
      }),
    )

    await expect(groupMessagesApi.recallMessage('m1')).rejects.toThrow(
      '只能撤回 2 分钟内发送的消息',
    )
  })

  it('HTTP 200 + 信封 success:false 抛出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 400, error: '只能撤回 2 分钟内发送的消息' }),
    )

    await expect(groupMessagesApi.recallMessage('m1')).rejects.toThrow(
      '只能撤回 2 分钟内发送的消息',
    )
  })

  it('撤回成功时返回业务结果', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { success: true, message: '消息已撤回' } }),
    )

    const result = await groupMessagesApi.recallMessage('m1')

    expect(result).toEqual({ success: true, message: '消息已撤回' })
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${GROUP_BASE}/recall`)
  })

  it('message 为 null 时抛错（require 档会放行 null，所以这里用的是 parse）', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: true, code: 200, data: { success: true, message: null } }),
    )

    await expect(groupMessagesApi.deleteMessage('m1')).rejects.toThrow(/message/)
  })
})
