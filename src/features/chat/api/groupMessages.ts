import { getApiBaseUrl } from '@/lib/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { type Parser, readEnvelope } from '@/lib/apiEnvelope'
import { arr, asRecord, bool, num, str } from '@/lib/apiParse'
import { ROUTES } from '@/lib/routes'
import { pinSession } from '@/lib/sessionScope'

const GROUP_MESSAGES_BASE_URL = `${getApiBaseUrl()}/api/group_messages`

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

// 带自动重试的 fetch 封装
const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const authStore = useAuthStore.getState()
  // 钉住"发这个请求时的那一场会话"。下面 401 分支里的每一个动作打的都是**当前**
  // 那个人的 store（`authStore` 是快照，但它攥着的 action 闭包是活的），所以响应
  // 落地时必须先确认会话还是同一场。接法、以及这一行比 `performRefresh` 的世代号
  // 对照多挡住了什么，见 `api/apiClient.ts` 里 `fetchWithAuth` 的注释。
  const isLiveSession = pinSession()
  
  if (authStore.checkTokenExpiry() && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
    } catch (error) {
      console.error('Failed to refresh token:', error)
    }
  }

  const headers = getAuthHeaders()
  
  let response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  // ⚠️ `isLiveSession()` 不是可选项：`authStore.refreshToken` 是**发起时**的快照，
  // 上一场会话的 401 照样能满足它，而 `refreshAccessToken()` / `clearAuth()` 打的是
  // 当前那个人的 store——清盘会把刚登录的那位连同他的 aiApiKey 一起清掉。
  // 判假时什么都不做，把 401 原样交回调用方。
  if (response.status === 401 && authStore.refreshToken && isLiveSession()) {
    try {
      await authStore.refreshAccessToken()
      const newHeaders = getAuthHeaders()
      response = await fetch(url, {
        ...options,
        headers: {
          ...newHeaders,
          ...options.headers,
        },
      })
    } catch (error) {
      console.error('Token refresh failed, redirecting to login')
      authStore.clearAuth()
      window.location.href = ROUTES.auth.login
      throw error
    }
  }

  return response
}

// ============================================
// 类型定义
// ============================================

export type GroupMessageType = 'text' | 'image' | 'video' | 'file' | 'system'

export interface GroupMessage {
  message_uuid: string
  group_id: string
  sender_id: string
  sender_nickname: string
  sender_avatar_url: string
  message_content: string
  message_type: GroupMessageType
  file_uuid: string | null
  file_url: string | null
  file_size: number | null
  file_hash: string | null
  filename: string | null
  content_type: string | null
  image_width: number | null
  image_height: number | null
  seq: number
  reply_to: string | null
  send_time: string
  is_recalled: boolean
}

export interface SendGroupMessageRequest {
  group_id: string
  message_content: string
  message_type: GroupMessageType
  file_uuid?: string
  file_url?: string
  file_size?: number
  reply_to?: string
}

export interface SendGroupMessageResponse {
  message_uuid: string
  send_time: string
  seq: number
}

export interface GetGroupMessagesResponse {
  messages: GroupMessage[]
  has_more: boolean
}

/** `delete` / `recall` 的**业务级**结果，嵌在信封的 `data` 里（`群消息.md:279-287`、:327-335）。 */
export interface GroupMessageMutationResult {
  success: boolean
  message: string
}

// ============================================
// 响应校验器（喂给 readEnvelope 的 parse 档）
// ============================================

/**
 * 逐条群消息只校验两个**承重**字段，其余原样透传——理由同 `messages.ts` 的
 * `messageRow`：`message_uuid` 是 React key 与撤回/删除请求体，`send_time` 喂
 * `format(new Date(...))`。
 *
 * ⚠️ 同样不要把 `file_hash` / `filename` / `content_type` 加进来：后端不返回它们
 * （`群消息.md:591` 写明 file_hash 已从所有接收侧响应撤掉，字段表也没有另两个），
 * 写进校验器会让每一次真实响应都炸。接口与后端的这处分叉是 spec-msg-group 第 8 条，
 * 独立待办；`src/types/models.ts` 里那份重复的 `GroupMessage` 定义也一并等着收敛。
 */
const groupMessageRow: Parser<GroupMessage> = {
  parse(input: unknown): GroupMessage {
    const row = asRecord(input, 'messages[] 的元素')
    str(row, 'message_uuid')
    str(row, 'send_time')
    return row as unknown as GroupMessage
  },
}

const getGroupMessagesResponse: Parser<GetGroupMessagesResponse> = {
  parse(input: unknown): GetGroupMessagesResponse {
    const payload = asRecord(input, 'GET /api/group_messages 的 data')
    return {
      messages: arr(payload, 'messages').map((row) => groupMessageRow.parse(row)),
      has_more: bool(payload, 'has_more'),
    }
  },
}

const sendGroupMessageResponse: Parser<SendGroupMessageResponse> = {
  parse(input: unknown): SendGroupMessageResponse {
    const payload = asRecord(input, 'POST /api/group_messages 的 data')
    return {
      message_uuid: str(payload, 'message_uuid'),
      send_time: str(payload, 'send_time'),
      seq: num(payload, 'seq'),
    }
  },
}

/**
 * `message` 允许空串。
 *
 * `apiParse` 的 `str()` 把 `''` 判成"缺失"（对 URL / UUID 那类字段是对的），但 `""`
 * 是这个后端真的会发出来的值——`群消息.md:200` 的 `sender_avatar_url: ""` 就是。
 * 一次合法的 `data:{success:true, message:""}` 会被 `str()` 判成 `ApiShapeError`，
 * 把**删除成功**变成一个用户看得见的报错：这正是这一层要消灭的失败形态，只是方向反了
 * （不是把失败伪装成数据，而是把成功伪装成失败）。
 *
 * 类型检查一点没松：不是 string 照样抛。放宽的只有"非空"。
 */
function mutationMessage(payload: Record<string, unknown>): string {
  const value = payload.message
  if (typeof value !== 'string') {
    throw new Error('message 缺失或不是字符串')
  }
  return value
}

/**
 * `data:{success, message}`。
 *
 * 走 `parse` 而不是 `require`：`require` 判定的是"键存在且不为 undefined"，
 * **`null` 算存在**（`apiEnvelope.ts` 的 `EnvelopeOptions.require` JSDoc），
 * 于是 `{success:null, message:null}` 会放行——正是这条 bug 换个位置继续踩。
 *
 * `message` 走 {@link mutationMessage} 而不是 `str`，理由见那里：空串是合法值。
 */
const groupMessageMutationResult: Parser<GroupMessageMutationResult> = {
  parse(input: unknown): GroupMessageMutationResult {
    const payload = asRecord(input, 'data')
    return {
      success: bool(payload, 'success'),
      message: mutationMessage(payload),
    }
  },
}

// ============================================
// API 方法
// ============================================

export const groupMessagesApi = {
  /**
   * 发送群消息
   * POST /api/group_messages
   * 请求体: { group_id, message_content, message_type, file_uuid?, file_url?, file_size?, reply_to? }
   */
  sendMessage: async (request: SendGroupMessageRequest): Promise<SendGroupMessageResponse> => {
    console.log('📤 发送群消息:', request.group_id)
    const response = await fetchWithAuth(`${GROUP_MESSAGES_BASE_URL}`, {
      method: 'POST',
      body: JSON.stringify(request),
    })

    // 旧写法有两个叠加的洞：只看 `!response.ok`（HTTP 200 + success:false 当成功），
    // 以及 `result.data ?? result`（没有 data 键时回退到整个信封，读出三个 undefined
    // 并当作发送成功返回）。`群消息.md:107-116` 明确带信封，不传 legacyBare。
    //
    // 顺带修掉 `error.error || '通用文案'`：readEnvelope 的取值顺序是
    // message → error → details → 响应体前 200 字符，网关 502 的 HTML 页不再被
    // `.catch(() => ({error:'发送群消息失败'}))` 抹平成一句通用文案。
    const data = await readEnvelope<SendGroupMessageResponse>(response, {
      endpoint: 'POST /api/group_messages',
      fallbackMessage: '发送群消息失败',
      parse: sendGroupMessageResponse,
    })
    console.log('✅ 群消息发送成功:', data.message_uuid)
    return data
  },

  /**
   * 获取群消息列表
   * GET /api/group_messages?group_id=xxx&before_time=xxx&limit=50
   * 使用 before_time 时间戳分页（性能优化）
   */
  getMessages: async (
    groupId: string,
    beforeTime?: string,
    limit: number = 50
  ): Promise<GetGroupMessagesResponse> => {
    console.log('📥 获取群消息列表:', groupId)
    
    const params = new URLSearchParams({
      group_id: groupId,
      limit: limit.toString(),
    })
    
    if (beforeTime) {
      params.set('before_time', beforeTime)
    }

    const response = await fetchWithAuth(`${GROUP_MESSAGES_BASE_URL}?${params}`, {
      method: 'GET',
    })

    // 注释里那句"后端可能返回 X 或直接 Y"是这条 bug 的自白：形状不确定被当成
    // 常态接受下来，于是 `Array.isArray(...) ? ... : []` 把任何不匹配都折叠成空列表、
    // `Boolean(data.has_more)` 折叠成 false，全程不抛错。`群消息.md:191-201` 已经
    // 坐实了信封，形状不是"可能"，收到裸响应就该炸。
    const page = await readEnvelope<GetGroupMessagesResponse>(response, {
      endpoint: 'GET /api/group_messages',
      fallbackMessage: '获取群消息失败',
      parse: getGroupMessagesResponse,
    })

    // 后端按 DESC 返回（数组最后一条最旧）：`群消息.md:219-227` 的分页示例拿
    // `messages.data.messages[messages.data.messages.length-1].send_time` 当 before_time。
    // 消费方一律按 **ASC**（`MessageList` 直接 map 渲染、`chatStore.addMessage` push 到尾部、
    // `prependMessages` 把更旧的一页拼到头部、`ChatWindow:114` 取 `messages[0]` 当游标）。
    // 只在这里翻一次，和 `messages.ts` 的私聊路径保持同一口径——两者共用 ChatWindow
    // 的同一段分页代码，方向必须一致。
    //
    // ⚠️ 不要在任何地方断言 `messages.length <= limit`：分页不切相册组，
    // 服务端会按时间区间补齐整组，一页可能多于 limit 条（`好友消息.md:774`）。
    return {
      messages: [...page.messages].reverse(),
      has_more: page.has_more,
    }
  },

  /**
   * 删除群消息（个人，软删除，仅对自己不可见）
   * DELETE /api/group_messages/delete
   * 请求体: { message_uuid }
   */
  deleteMessage: async (messageUuid: string): Promise<GroupMessageMutationResult> => {
    console.log('🗑️ 删除群消息:', messageUuid)
    const response = await fetchWithAuth(`${GROUP_MESSAGES_BASE_URL}/delete`, {
      method: 'DELETE',
      body: JSON.stringify({ message_uuid: messageUuid }),
    })

    // 这里的 `result.data ?? result` 比别处更阴险：业务级 `success` 嵌在 `data` 里，
    // 信封顶层**也叫** `success`。回退到信封时 `Boolean(data.success)` 读到的是
    // 传输级的 `success:true`，`data.message` 落到 `?? '消息已删除'` 兜底文案——
    // 于是一次业务失败长得和成功一模一样，ChatWindow 照样把消息从本地移除并弹成功 toast。
    const data = await readEnvelope<GroupMessageMutationResult>(response, {
      endpoint: 'DELETE /api/group_messages/delete',
      fallbackMessage: '删除群消息失败',
      parse: groupMessageMutationResult,
    })

    // 业务级失败：落在 `success:true` 的信封里，解包层看不出问题，必须在这里抛，
    // 否则 `ChatWindow.tsx` 的 `handleDeleteMessage` 会把消息从本地列表删掉，
    // 而服务端并没有删。
    if (!data.success) {
      throw new Error(data.message)
    }

    console.log('✅ 群消息删除成功')
    return data
  },

  /**
   * 撤回群消息
   * POST /api/group_messages/recall
   * 请求体: { message_uuid }
   * 
   * 权限:
   * - 发送者: 只能撤回2分钟内发送的消息
   * - 群主/管理员: 可以撤回任意消息
   */
  recallMessage: async (messageUuid: string): Promise<GroupMessageMutationResult> => {
    console.log('↩️ 撤回群消息:', messageUuid)
    const response = await fetchWithAuth(`${GROUP_MESSAGES_BASE_URL}/recall`, {
      method: 'POST',
      body: JSON.stringify({ message_uuid: messageUuid }),
    })

    // 同 deleteMessage：业务级 success 和信封的 success 同名，`?? ` 回退时读到的是后者。
    // 撤回的两种典型业务失败（超时 400「只能撤回 2 分钟内发送的消息」、权限不足 403，
    // `群消息.md:343-361`）在旧代码里都会被读成 success:true。
    const data = await readEnvelope<GroupMessageMutationResult>(response, {
      endpoint: 'POST /api/group_messages/recall',
      fallbackMessage: '撤回群消息失败',
      parse: groupMessageMutationResult,
    })

    if (!data.success) {
      throw new Error(data.message)
    }

    console.log('✅ 群消息撤回成功')
    return data
  },

  /**
   * 加载更多历史群消息（分页）
   * 使用时间戳分页，性能更优
   */
  loadMoreMessages: async (
    groupId: string,
    messages: GroupMessage[],
    limit: number = 50
  ): Promise<GetGroupMessagesResponse> => {
    if (messages.length === 0) {
      return groupMessagesApi.getMessages(groupId, undefined, limit)
    }

    // 游标取**最旧**那条。getMessages 已在出口把 DESC 归一成 ASC，最旧的是 `messages[0]`。
    // 本方法目前全仓无调用点（ChatWindow 有自己的同名局部函数），但留着方向相反的
    // 版本等于埋一个"看起来能用"的雷：拿最新那条当 before_time 会把同一页反复取回来。
    const oldestTime = messages[0].send_time
    return groupMessagesApi.getMessages(groupId, oldestTime, limit)
  },
}
