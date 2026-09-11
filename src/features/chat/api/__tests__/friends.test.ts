import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthError } from '@/api/apiClient'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiShapeError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { friendsApi } from '../friends'

/**
 * 三个好友列表端点的信封解包。
 *
 * 后端在 2026-03-08 把它们从裸 `{"items":[...]}` 改成
 * `{"success":true,"code":200,"data":[...]}`（backend-docs/README.md:373），
 * 而旧代码读的是 `data.friends || data || []`：`data.friends` 在信封上恒为
 * undefined，短路到信封对象本身，`Array.isArray` 为 false，于是**稳定返回 `[]`**。
 * HTTP 200、不进 catch、不报错，UI 一句"暂无好友"——这个 bug 活了半年。
 *
 * 所以每条正例都必须断言**行数和字段值**：只断言 `Array.isArray(result)` 或
 * `not.toThrow()` 的话，坏代码返回的空数组同样满足，等于没测。
 */

// 用 getApiBaseUrl() 而不是字面量空串：这里要匹配的是**请求 URL**，和真实代码同一个
// （硬编码的空串）基址拼出来的。Task 12 之后 getApiBaseUrl() 不再读任何环境变量——
// 这行注释曾经说的是 .env 漂移，那个风险随「切换服务器」一起没了，留着调用只是
// 不想在测试里重复写一遍"空串"这个假设。
const FRIENDS_BASE = `${getApiBaseUrl()}/api/friends`

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const FRIEND_DTO = {
  friend_id: 'u1',
  friend_nickname: '张三',
  friend_avatar_url: null,
  add_time: '2026-01-01T00:00:00Z',
  approve_reason: null,
  friend_remark: null,
  is_blacklisted: false,
  is_special_care: false,
}

const PENDING_DTO = {
  request_id: 'r1',
  request_user_id: 'u2',
  request_message: '加个好友吧',
  request_time: '2026-01-01T00:00:00Z',
  requester_nickname: '李四',
  requester_avatar_url: null,
}

const SENT_DTO = {
  request_id: 'r9',
  sent_to_user_id: 'u3',
  sent_message: null,
  sent_time: '2026-01-01T00:00:00Z',
  sent_to_nickname: '王五',
  sent_to_avatar_url: null,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  // 会话制下 fetchWithAuth 不再读 token——同源 cookie 自动带上。
  useAuthStore.setState({ isAuthenticated: true, user: { user_id: 'me' } })
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

describe('friendsApi.getFriendsList', () => {
  it('从信封里取出真实好友行（data 本身就是数组，不是 data.friends）', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: [FRIEND_DTO] }))

    const result = await friendsApi.getFriendsList()

    expect(result).toHaveLength(1)
    expect(result[0].friend_id).toBe('u1')
    expect(result[0].friend_nickname).toBe('张三')
    expect(result[0].is_special_care).toBe(false)
    // 字面量而非 getApiBaseUrl() 拼出来的期望值：FRIENDS_BASE 与请求 URL 用
    // 同一个基址拼成，基址改成什么都会一起变、恒绿（Task 12 评审 I1）；这里
    // 写死当前基址（空串）实际产出的根相对路径，独立于 FRIENDS_BASE 的定义方式。
    expect(fetchMock.mock.calls[0][0]).toBe('/api/friends')
  })

  it('data 不是数组时抛错，而不是安静地返回空数组', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: {} }))

    await expect(friendsApi.getFriendsList()).rejects.toThrow(/应为数组/)
  })

  it('旧的裸响应 {friends:[...]} 也抛错（回退链绝不复活）', async () => {
    // `data.friends || data || []` 这条回退链其实从未匹配过任何一版后端格式
    // （旧格式是裸 `{"items":[...]}`），留着只会让"没迁移"变成不可见状态。
    fetchMock.mockResolvedValueOnce(ok({ friends: [FRIEND_DTO] }))

    await expect(friendsApi.getFriendsList()).rejects.toThrow(/data/)
  })

  it('相对头像路径在 api 出口就被补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: [{ ...FRIEND_DTO, friend_avatar_url: 'avatars/u1.jpg?t=1' }],
      }),
    )

    const [friend] = await friendsApi.getFriendsList()

    expect(friend.friend_avatar_url).toBe(`${location.origin}/avatars/u1.jpg?t=1`)
  })

  it('头像为 null 时保持 null，不兜底成空串', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: [FRIEND_DTO] }))

    const [friend] = await friendsApi.getFriendsList()

    expect(friend.friend_avatar_url).toBeNull()
  })

  it('形状错误不会被误判成登录失效而静默登出', async () => {
    // 这里原来是"逐个断言 message 不含认证关键词"的代理断言。关键词表已删除，
    // 现在直接问真正的判据 `isAuthError` —— 代理断言只能证明"文案里没有那些词"，
    // 而分类器改成别的口径之后它照样绿。
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: {} }))

    const error = await friendsApi.getFriendsList().catch((e: unknown) => e as Error)

    expect(error).toBeInstanceOf(Error)
    expect(isAuthError(error as Error)).toBe(false)
  })

  it('HTTP 200 但 success:false 也算失败，并透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 500, message: '好友服务不可用' }))

    await expect(friendsApi.getFriendsList()).rejects.toThrow('好友服务不可用')
  })
})

describe('friendsApi.getPendingRequests', () => {
  it('从信封里取出真实待处理申请', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: [PENDING_DTO] }))

    const result = await friendsApi.getPendingRequests()

    expect(result).toHaveLength(1)
    expect(result[0].request_id).toBe('r1')
    expect(result[0].request_user_id).toBe('u2')
    expect(result[0].request_message).toBe('加个好友吧')
    expect(fetchMock.mock.calls[0][0]).toBe(`${FRIENDS_BASE}/requests/pending`)
  })

  it('data 不是数组时抛错', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { requests: [] } }))

    await expect(friendsApi.getPendingRequests()).rejects.toThrow(/应为数组/)
  })

  it('申请人相对头像路径补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: [{ ...PENDING_DTO, requester_avatar_url: 'avatars/u2.jpg' }],
      }),
    )

    const [request] = await friendsApi.getPendingRequests()

    expect(request.requester_avatar_url).toBe(`${location.origin}/avatars/u2.jpg`)
  })
})

describe('friendsApi.getSentRequests', () => {
  it('从信封里取出真实已发送申请', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: [SENT_DTO] }))

    const result = await friendsApi.getSentRequests()

    expect(result).toHaveLength(1)
    expect(result[0].request_id).toBe('r9')
    expect(result[0].sent_to_user_id).toBe('u3')
    expect(result[0].sent_to_nickname).toBe('王五')
    expect(fetchMock.mock.calls[0][0]).toBe(`${FRIENDS_BASE}/requests/sent`)
  })

  it('data 不是数组时抛错', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: null }))

    await expect(friendsApi.getSentRequests()).rejects.toThrow()
  })

  it('目标用户相对头像路径补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        success: true,
        code: 200,
        data: [{ ...SENT_DTO, sent_to_avatar_url: 'avatars/u3.jpg' }],
      }),
    )

    const [request] = await friendsApi.getSentRequests()

    expect(request.sent_to_avatar_url).toBe(`${location.origin}/avatars/u3.jpg`)
  })
})

describe('写入侧的请求体（读取侧改名不能带偏写入侧）', () => {
  it('approve 只发 { user_id, applicant_user_id }', async () => {
    // 文档 backend-docs/friends/好友添加删除.md:25-32 把 approve 的请求体收窄成两字段，
    // 旧代码多发的 approved_time / approved_reason 在文档里已不存在；
    // 若后端 serde 带 deny_unknown_fields，多发字段会让整条同意路径 422。
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: null }))

    await friendsApi.approveFriendRequest('u2')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${FRIENDS_BASE}/requests/approve`)
    expect(JSON.parse(init.body as string)).toEqual({
      user_id: 'me',
      applicant_user_id: 'u2',
    })
  })

  it('reject 仍按文档发 { user_id, applicant_user_id, reject_reason? }', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: null }))

    await friendsApi.rejectFriendRequest('u2', '暂不需要')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      user_id: 'me',
      applicant_user_id: 'u2',
      reject_reason: '暂不需要',
    })
  })

  it('HTTP 200 但 success:false 的同意请求会抛出后端原文', async () => {
    // 旧代码只看 !response.ok，会把这种响应当成功，用户看到"已添加好友"却什么也没发生。
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 400, message: '该申请已被处理' }))

    await expect(friendsApi.approveFriendRequest('u2')).rejects.toThrow('该申请已被处理')
  })
})

describe('friendsApi 黑名单三接口（backend-docs friends/好友添加删除.md :150-200）', () => {
  const BLACKLISTED = { user_id: 'u2', user_nickname: '李四', user_avatar_url: 'avatars/u2.png', created_at: '2026-09-01T00:00:00Z' }

  it('getBlacklist：GET /api/friends/blacklist，头像相对路径补成绝对地址，null 保持 null', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: [BLACKLISTED, { ...BLACKLISTED, user_id: 'u3', user_nickname: null, user_avatar_url: null }] }))
    const rows = await friendsApi.getBlacklist()
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${FRIENDS_BASE}/blacklist`)
    expect(rows).toEqual([
      { user_id: 'u2', user_nickname: '李四', user_avatar_url: `${location.origin}/avatars/u2.png`, created_at: '2026-09-01T00:00:00Z' },
      { user_id: 'u3', user_nickname: null, user_avatar_url: null, created_at: '2026-09-01T00:00:00Z' },
    ])
  })
  it('getBlacklist：缺 user_id 抛 ApiShapeError；data 不是数组也抛', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: [{ ...BLACKLISTED, user_id: undefined }] }))
    await expect(friendsApi.getBlacklist()).rejects.toBeInstanceOf(ApiShapeError)
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { items: [] } }))
    await expect(friendsApi.getBlacklist()).rejects.toThrow(/应为数组/)
  })
  it('addBlacklist：POST body 只有 { target_user_id }；无 data 的 ok 信封不抛', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, message: '已拉黑' }))
    await expect(friendsApi.addBlacklist('u2')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`${FRIENDS_BASE}/blacklist`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ target_user_id: 'u2' })
  })
  it('removeBlacklist：DELETE /api/friends/blacklist/{id}，id 经 encodeURIComponent', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, message: '已取消拉黑' }))
    await friendsApi.removeBlacklist('u 2/x')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`${FRIENDS_BASE}/blacklist/u%202%2Fx`)
    expect(init.method).toBe('DELETE')
  })
  it('拉黑 HTTP 200 但 success:false 透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 400, error: '不能拉黑自己' }))
    await expect(friendsApi.addBlacklist('me')).rejects.toThrow(/不能拉黑自己/)
  })
})
