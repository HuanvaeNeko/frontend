import { getApiBaseUrl } from '@/lib/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { type Parser, readEnvelope } from '@/lib/apiEnvelope'
import { arr, asRecord, bool, num, str } from '@/lib/apiParse'
import { ROUTES } from '@/lib/routes'

const MESSAGES_BASE_URL = `${getApiBaseUrl()}/api/messages`

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

  if (response.status === 401 && authStore.refreshToken) {
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

export type MessageType = 'text' | 'image' | 'video' | 'file'

export interface Message {
  message_uuid: string
  sender_id: string
  receiver_id: string
  message_content: string
  message_type: MessageType
  file_uuid: string | null
  file_url: string | null
  file_size: number | null
  file_hash: string | null
  filename: string | null
  content_type: string | null
  image_width: number | null
  image_height: number | null
  seq: number
  send_time: string
}

export interface SendMessageRequest {
  receiver_id: string
  message_content: string
  message_type: MessageType
  file_uuid?: string
  file_url?: string
  file_size?: number
}

export interface SendMessageResponse {
  message_uuid: string
  send_time: string
  seq: number
}

export interface GetMessagesResponse {
  messages: Message[]
  has_more: boolean
}

// 消息同步类型
export type ConversationType = 'friend' | 'group'

export interface SyncConversationRequest {
  conversation_id: string
  conversation_type: ConversationType
  last_seq: number
}

export interface SyncMessagesRequest {
  conversations: SyncConversationRequest[]
}

export interface SyncConversationResponse {
  conversation_id: string
  conversation_type: ConversationType
  messages: Message[]
  latest_seq: number
  has_more: boolean
}

export interface SyncMessagesResponse {
  conversations: SyncConversationResponse[]
}

// ============================================
// 会话 ID 推导
// ============================================

/**
 * 好友会话的 `conversation_id`。
 *
 * ## ⚠️ 排序口径是**推断**出来的，不是文档规定的
 *
 * 后端文档从没写过两个用户 ID 谁在前。四处独立示例**全部满足字典序**，但它们
 * 同样满足别的规则（比如"发起方在前"），所以这是一致性证据，不是证明：
 *
 * - `backend-docs/messages/消息同步.md:87`、:123 —— `conv-user123-user456`
 * - `backend-docs/messages/消息同步.md:357` —— `conv-user1-user2`
 * - `backend-docs/messages/好友消息.md:164` —— `friends-file/conv-user1-user2/videos/clip.mp4`
 * - `backend-docs/storage/文件存储管理.md:2588` —— `friends-file/conv-alice-bob/images/xxx.jpg`
 * - 本仓 `src/api/__tests__/storage.test.ts:477` —— `conv-a-b`
 *
 * **上线前必须用一次真实 sync 请求核对排序口径。** 排错了的表现是"同步永远返回
 * 0 个会话"——和修复前一模一样，而且同样不报错，所以别指望自己会发现。
 *
 * 抽成独立导出函数就是为了让这次修正只需要改一个地方（并且有单测钉住）。
 *
 * ## 为什么不用"持久化服务端回显的 id"那条路
 *
 * 那条路在这个代码库里**进不去初始状态**：sync 响应里每个会话只有
 * `conversation_id` + `conversation_type`，**没有 `friend_id` / `peer_id`**
 * （`消息同步.md:176-183` 字段表）。想拿到服务端口径的 id，得先发一个正确的 id
 * 上去；发错了那个会话根本不会出现在响应里，也就没有任何东西可以持久化，
 * 更无从判断回显的 id 属于哪个好友。它是一个永远无法进入的不动点。
 *
 * 不过那条路里**反查映射**的部分是对的，已经采纳：`chatStore.syncMessages`
 * 构造请求时同步建一张 `conversation_id -> 本地会话 id` 的表，响应回来按表反查，
 * 而不是对 id 做字符串切割（原来的 `replace(/^conv-/,'')` 对双方形式会得出
 * `user123-user456` 这种半截串，匹配不到任何本地会话）。
 */
export function buildFriendConversationId(myUserId: string, friendUserId: string): string {
  return `conv-${[myUserId, friendUserId].sort().join('-')}`
}

// ============================================
// 响应校验器（喂给 readEnvelope 的 parse 档）
// ============================================

/**
 * 逐条消息只校验两个**承重**字段，其余原样透传。
 *
 * `message_uuid`：React key、撤回/删除请求体。缺了它右键删除会发出
 * `JSON.stringify({message_uuid: undefined})` === `"{}"` → 400。
 * `send_time`：`MessageItem` 里 `format(new Date(send_time),'HH:mm')`，
 * 缺了直接 `RangeError: Invalid time value`，整个列表渲染失败。
 *
 * ## ⚠️ 不要把 Message 接口上的其它字段加进来
 *
 * `Message` 声明了 `file_hash` / `filename` / `content_type` 三个**后端根本不返回**
 * 的字段（spec-msg-priv 第 10 条；`好友消息.md:250-258` 字段表里没有它们，
 * `群消息.md:591` 还写明 file_hash 已从所有接收侧响应撤掉）。把它们写进校验器
 * 会让**每一次真实响应**都抛 ApiShapeError——比现在的 bug 更糟。
 * 接口与后端的这处分叉是独立的一条待办，不在这批的范围内。
 */
const messageRow: Parser<Message> = {
  parse(input: unknown): Message {
    const row = asRecord(input, 'messages[] 的元素')
    str(row, 'message_uuid')
    str(row, 'send_time')
    return row as unknown as Message
  },
}

/**
 * `GET /api/messages` 的 `data`。
 *
 * `has_more` 必须是布尔：旧代码读到 undefined 后 `setHasMore(undefined)`，
 * 触顶分页永久关闭——这是"功能正常但没有数据"的又一种形态。
 */
const getMessagesResponse: Parser<GetMessagesResponse> = {
  parse(input: unknown): GetMessagesResponse {
    const payload = asRecord(input, 'GET /api/messages 的 data')
    return {
      messages: arr(payload, 'messages').map((row) => messageRow.parse(row)),
      has_more: bool(payload, 'has_more'),
    }
  },
}

const sendMessageResponse: Parser<SendMessageResponse> = {
  parse(input: unknown): SendMessageResponse {
    const payload = asRecord(input, 'POST /api/messages 的 data')
    return {
      message_uuid: str(payload, 'message_uuid'),
      send_time: str(payload, 'send_time'),
      seq: num(payload, 'seq'),
    }
  },
}

/**
 * `POST /api/messages/sync` 的 `data`。
 *
 * 每个会话只校验 `conversation_id` / `latest_seq` / `messages`——前两个是
 * `chatStore` 反查本地会话和推进 `lastSeq` 的依据，第三个决定未读计数。
 * `has_more` 文档写明恒返回，但目前没有消费点，不强校验以免为未用字段而炸。
 *
 * `messages[]` 这里**不**走 `messageRow`：sync 的消息 DTO 与 REST 列表不同形
 * （无 `receiver_id`，可空字段是"整键缺省"而非 `null`，见 `消息同步.md:180-190`），
 * 这处类型分叉是 spec-msg-priv 第 11 条，独立待办。
 */
const syncMessagesResponse: Parser<SyncMessagesResponse> = {
  parse(input: unknown): SyncMessagesResponse {
    const payload = asRecord(input, 'POST /api/messages/sync 的 data')
    const conversations = arr(payload, 'conversations').map((entry) => {
      const conv = asRecord(entry, 'conversations[] 的元素')
      str(conv, 'conversation_id')
      str(conv, 'conversation_type')
      num(conv, 'latest_seq')
      arr(conv, 'messages')
      return conv as unknown as SyncConversationResponse
    })
    return { conversations }
  },
}

// ============================================
// API 方法
// ============================================

export const messagesApi = {
  /**
   * 发送消息
   * POST /api/messages
   * 请求体: { receiver_id, message_content, message_type, file_uuid?, file_url?, file_size? }
   */
  sendMessage: async (request: SendMessageRequest): Promise<SendMessageResponse> => {
    console.log('📤 发送消息给:', request.receiver_id)
    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}`, {
      method: 'POST',
      body: JSON.stringify(request),
    })

    // 手写的 `if (!response.ok)` 分支删掉了：readEnvelope 内部 body 只读一次，
    // 且会认 HTTP 200 + success:false（旧写法把它当成功，再从缺失的 data 里读 undefined）。
    //
    // 不传 legacyBare：`群消息.md:107-116` 的同族端点明确带信封，
    // `README.md:371-375` 记了 2026-03-08 的统一。好友侧 `好友消息.md:115-127`
    // 的裸样例块和它下面 :250-258 的字段表自相矛盾（字段表列的 rev / reply_to /
    // media_group_* 在样例里一个都没有），是过期块，不作为反证。
    const data = await readEnvelope<SendMessageResponse>(response, {
      endpoint: 'POST /api/messages',
      fallbackMessage: '发送消息失败',
      parse: sendMessageResponse,
    })
    console.log('✅ 消息发送成功:', data.message_uuid)
    return data
  },

  /**
   * 获取消息列表
   * GET /api/messages?friend_id=xxx&before_time=xxx&limit=50
   * 使用 before_time 时间戳分页（性能优化）
   */
  getMessages: async (
    friendId: string,
    beforeTime?: string,
    limit: number = 50
  ): Promise<GetMessagesResponse> => {
    console.log('📥 获取消息列表:', friendId)
    
    const params = new URLSearchParams({
      friend_id: friendId,
      limit: limit.toString(),
    })
    
    if (beforeTime) {
      params.set('before_time', beforeTime)
    }

    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}?${params}`, {
      method: 'GET',
    })

    const page = await readEnvelope<GetMessagesResponse>(response, {
      endpoint: 'GET /api/messages',
      fallbackMessage: '获取消息失败',
      parse: getMessagesResponse,
    })

    // 后端按 DESC 返回（数组最后一条最旧）——`好友消息.md:774` 写明"本页覆盖的
    // 时间区间 DESC 连续，has_more 与游标语义才成立"，`群消息.md:219-227` 的分页
    // 示例也拿 `messages[messages.length-1]` 当游标。
    //
    // 消费方一律按 **ASC**（最旧在前、最新在后）写：`MessageList` 直接 `messages.map`
    // 渲染，`chatStore.addMessage` 把新消息 push 到数组尾部，`prependMessages` 把
    // 更旧的一页拼到头部，`ChatWindow:114` 取 `messages[0].send_time` 当 before_time。
    // 所以在模块出口翻一次，全仓只此一处。
    return {
      messages: [...page.messages].reverse(),
      has_more: page.has_more,
    }
  },

  /**
   * 删除消息（软删除，仅对自己不可见）
   * DELETE /api/messages/delete
   * 请求体: { message_uuid }
   *
   * ⚠️ **本方法与 recallMessage 仍是裸解析，尚未迁移到解包层**（spec-msg-priv 第 9 条，
   * 定级 stale，不在这批范围内）。当前 `await response.json()` 拿到的是信封本身，
   * 于是返回的 `success` 读到的是**信封的传输级 success**（恒 true），`message` 恒 undefined，
   * 且 HTTP 200 + `success:false` 会被当成删除成功。
   *
   * 群侧的同名端点这批已经修了（`groupMessages.ts` 用 readEnvelope + 业务级 success 校验），
   * 两边现在不对称。迁移方式照抄群侧即可——`群消息.md:279-287` 明确
   * `data:{success, message}` 是嵌在信封里的业务结果；好友侧 `好友消息.md:335-340`
   * 的裸样例出自本文件那个已过期的样例块（同块的 GET / POST 样例都缺字段表里的
   * rev / reply_to / media_group_*），不足以证明这两个端点没跟着统一。
   */
  deleteMessage: async (messageUuid: string): Promise<{ success: boolean; message: string }> => {
    console.log('🗑️ 删除消息:', messageUuid)
    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}/delete`, {
      method: 'DELETE',
      body: JSON.stringify({ message_uuid: messageUuid }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `删除消息失败 (${response.status})` 
      }))
      console.error('删除消息失败:', error)
      throw new Error(error.message || error.error || '删除消息失败')
    }

    const data = await response.json()
    console.log('✅ 消息删除成功')
    return data
  },

  /**
   * 撤回消息（2分钟内，双方都看不到）
   * POST /api/messages/recall
   * 请求体: { message_uuid }
   */
  recallMessage: async (messageUuid: string): Promise<{ success: boolean; message: string }> => {
    console.log('↩️ 撤回消息:', messageUuid)
    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}/recall`, {
      method: 'POST',
      body: JSON.stringify({ message_uuid: messageUuid }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `撤回消息失败 (${response.status})` 
      }))
      console.error('撤回消息失败:', error)
      throw new Error(error.message || error.error || '撤回消息失败')
    }

    const data = await response.json()
    console.log('✅ 消息撤回成功')
    return data
  },

  /**
   * 加载更多历史消息（分页）
   * 使用时间戳分页，性能更优
   */
  loadMoreMessages: async (
    friendId: string,
    messages: Message[],
    limit: number = 50
  ): Promise<GetMessagesResponse> => {
    if (messages.length === 0) {
      return messagesApi.getMessages(friendId, undefined, limit)
    }

    // 游标取**最旧**那条。getMessages 已在出口把 DESC 归一成 ASC，所以最旧的是
    // `messages[0]`，不再是 `messages[messages.length-1]`。
    //
    // 注意：本方法目前全仓无调用点（ChatWindow 有自己的同名局部函数），
    // 归一之后不改这里会留下一个"看起来能用、方向相反"的陷阱。
    const oldestTime = messages[0].send_time
    return messagesApi.getMessages(friendId, oldestTime, limit)
  },

  /**
   * 批量增量同步消息
   * POST /api/messages/sync
   * 
   * 客户端携带每个会话的 last_seq，服务器返回 seq > last_seq 的新消息
   * 
   * 限制:
   * - 单次最多同步 50 个会话
   * - 每个会话最多返回 100 条消息
   * 
   * @param conversations 需要同步的会话列表
   */
  syncMessages: async (conversations: SyncConversationRequest[]): Promise<SyncMessagesResponse> => {
    console.log('🔄 同步消息:', conversations.length, '个会话')
    const response = await fetchWithAuth(`${MESSAGES_BASE_URL}/sync`, {
      method: 'POST',
      body: JSON.stringify({ conversations }),
    })

    // 旧写法是 `result.data ?? result` 再 `Array.isArray(x) ? x : []`：
    // 后端在 HTTP 200 上表达失败（`{"success":false,"code":429,...}`，限流/鉴权降级）
    // 时，`!response.ok` 不成立 → `result.data` 为 undefined → `?? result` 回退到整个
    // 信封 → `data.conversations` 为 undefined → 兜成 `[]`，还照打一行"✅ 消息同步完成"。
    // 这就是 friends 那批 bug 原样搬进 sync：`?? x` 只是把 `|| []` 挪了一层。
    const result = await readEnvelope<SyncMessagesResponse>(response, {
      endpoint: 'POST /api/messages/sync',
      fallbackMessage: '同步消息失败',
      parse: syncMessagesResponse,
    })
    console.log('✅ 消息同步完成')
    return result
  },
}
