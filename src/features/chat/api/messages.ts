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
 * ## ⚠️ 排序口径是**推断**出来的，而且"排序"这个词本身有两种互不相同的含义
 *
 * ### 一、证据比上一版注释写的少得多
 *
 * 上一版说"四处独立示例全部满足字典序"。**这个计数是错的。** 逐条回查之后，
 * 被引用的那几处里只有一处是**服务端产出**的：
 *
 * - `backend-docs/storage/文件存储管理.md:2588` —— 预签名**响应**里的 `presigned_url`
 *   `friends-file/conv-alice-bob/images/xxx.jpg`。服务端拼的。
 * - （上一版没引、但同样是服务端拼的：同文档 `:222` 的 `file_key`
 *   `conv-user1-user2/images/...`，一个带省略号的占位串。）
 *
 * 其余全部**不是**服务端口径的证据：
 * - `messages/消息同步.md:87` —— **请求体**样例，客户端自己拼的
 * - `messages/消息同步.md:123` —— 响应，但只是把请求里那个 id **原样回显**
 * - `messages/消息同步.md:357` —— JS 使用示例里客户端手写的请求参数
 * - `messages/好友消息.md:164` —— 发送视频消息**请求体**里客户端传的 `file_url`
 * - 本仓 `src/api/__tests__/storage.test.ts` 里 `getFriendFilePresignedUrl` 那条用例的
 *   `conv-a-b` —— 我们自己写的 fixture
 *
 * ### 二、所有示例都是全小写，区分不出 JS 的排序和数据库的排序
 *
 * `alice`/`bob`、`user1`/`user2`、`a`/`b` —— 全小写。而 JS 的 `[a,b].sort()` 是
 * **UTF-16 码元序**：大写 `A`–`Z`（0x41–0x5A）整体排在小写 `a`–`z`（0x61–0x7A）**之前**。
 * 全小写的样例既满足码元序，也满足任何不区分大小写的排序，**一个都区分不出来**。
 *
 * 真实 user_id 是混合大小写的：`backend-docs/admin/诊断日志.md:218-224` 里是
 * `GUGUGAGA` 和 `HuanWei`。于是 `HuanWei` + `alice` 这一对：
 *
 * - JS `.sort()` → `conv-HuanWei-alice`（`H`=0x48 < `a`=0x61）
 * - 后端若在 SQL 里用 `LEAST(a,b)`，`en_US.UTF-8` collation 下 → `conv-alice-HuanWei`
 * - 同样是 `LEAST(a,b)`，`C` / `POSIX` collation 下 → 与 JS 一致
 *
 * **所以核对必须用一对混合大小写的 ID。** 拿两个全小写的 ID 去验，两种口径都会通过，
 * 而线上每一对含大写字母的好友仍然是坏的——这是一次"验过了、还是错的"的完整剧本。
 *
 * ## 怎么核对（这条能跑；上一版写的那条跑不起来）
 *
 * 上一版写的是"上线前必须用一次真实 sync 请求核对"。**那条不可执行**：
 * `setConversations` / `addConversation` 在 `src` 里零调用点，`chatStore.conversations`
 * 恒为 `[]`，而 `useRealtimeMessages.ts` 里那个「连上之后自动同步」的 effect
 * 与 `chatStore.syncMessages` 都以 `conversations.length > 0` 为前置条件——
 * 同步请求永远发不出去。
 * （这处接线缺失是独立的一条待办，不在本批范围内。）
 *
 * 能跑的通道在 storage 侧，而且不需要前端先猜对 id：
 *
 * 1. 挑一个 **user_id 含大写字母**的好友，调 `storageApi.requestUpload`
 *    （`src/api/storage.ts` 的 `storageApi.uploadFile` 已有现成调用点），传
 *    `storage_location: 'friend_messages'` + `related_id: <该好友的 user_id>`；
 * 2. 响应的 `file_key` 形如 `friends-file/{conversation_uuid}/{type}/...`
 *    （`storage/文件存储管理.md:977` 路径规范、`:2392` 好友文件上传、`:2588` 响应样例），
 *    中间那段 `conv-…` 是**服务端自己拼的**会话 ID；
 * 3. 与 `buildFriendConversationId(myUserId, friendId)` 的结果逐字符比对。
 *
 * 排错了的表现是"同步永远返回 0 个会话"——和修复前一模一样，而且同样不报错，
 * 所以别指望自己会发现。抽成独立导出函数就是为了让修正只需要改一个地方
 * （下面的单测会跟着变红）。
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
// 好友侧的裸响应容忍
// ============================================

/**
 * `好友消息.md` 记录的那两个端点（`POST /api/messages`、`GET /api/messages`）
 * 显式容忍裸响应。
 *
 * ## 上一版注释里那条引用是**假的**
 *
 * 它写着「`README.md:371-375` 记了 2026-03-08 的统一」。逐字核对过原文：那条
 * 更新日志列的是**五个端点**——`GET /api/friends`、`.../requests/pending`、
 * `.../requests/sent`、`GET /api/auth/devices`、`GET /api/ai/voice_profiles`。
 * **其中没有任何一个消息端点。** 而它是 README 全文**唯一**一条讲信封统一的记录。
 * 那个设计决定（不传 legacyBare）就是建立在这条不存在的记录上的。
 *
 * ## 实际证据是不对称的
 *
 * **群侧明确有信封**：`群消息.md` 的响应样例逐个带 `{"success":true,"code":200,"data":{…}}`
 * （:107-116 发送、:191-201 列表、:279-287 删除；`grep -c '"data"' 群消息.md` = 5、
 * `'"code"'` = 9）。
 *
 * **`POST /api/messages/sync` 也明确有信封**：`消息同步.md:117-120` 是
 * `{"code":0,"message":"success","data":{…}}`。
 *
 * ⚠️ 但注意它的形状和全站其余端点不一样：**`code: 0` 且没有 `success` 字段**，
 * 而另外 19 份文档用的都是 `success: true` + `code: 200`（全仓仅此一处 `code: 0`）。
 * 两种编码习惯并存，八成是不同时期/不同人写的。
 *
 * 后果：`readEnvelope` 判失败的依据是 `success === false`（见 `apiEnvelope.ts` 的
 * `assertOk`）。
 * 这个端点没有 `success`，所以它能通过**只是因为"字段缺失"被当成"没失败"**——
 * 是巧合，不是设计。若哪天它按自己那套约定返回 `code: 1`（该约定下的失败），
 * 会被当成成功放行，`data` 缺失再由下面的 parser 兜住抛 ApiShapeError——
 * 报错能出来，但归因会指向"形状不对"而不是"后端说失败了"。
 * 真要收紧，得让 readEnvelope 支持第二种失败判据，那是全局改动，不在本批次。
 *
 * **好友侧一个信封样例都没有**：`grep -c '"code"' messages/好友消息.md` = **0**，
 * `'"data"'` = **0**。POST(:115-121)、GET(:206-236)、delete(:335-340) 三个响应样例
 * 全是裸的，连 Fetch 示例都直接写 `messages.messages`。
 *
 * 支持"好友侧也跟着信封化了"的，只有两条**推断**：
 * 1. `好友消息.md:250-258` 的字段表列了样例里没有的 `rev` / `reply_to` / `media_group_*`，
 *    所以样例块确实过期了——但这只证明它在**字段**上过期，**不证明它在形状上过期**；
 * 2. 与群文档类比。
 *
 * 这是类比推断，不是"已记录的统一"。下一个改这里的人必须能看见：好友侧的证据比群侧弱。
 *
 * ## 为什么容忍而不是赌
 *
 * 代价不对称。好友侧若其实没信封化，严格解包会让**每一次消息加载**抛 `ApiShapeError`：
 * 主界面从"静默空白"变成"显式崩溃"。legacyBare 正是为这种模糊准备的逃生口——
 * 接受裸体、每次命中打 `console.warn`、`grep legacyBare` 列得出来、带清理期限。
 * 群侧不加：那边文档明确，加了是自造模糊。
 *
 * ## ⚠️ legacyBare 必须与 `parse` 配对（本项目已经违反过一次）
 *
 * 只配 `require` 的话，"裸响应"和"信封里 data 为空"就变得无法区分，正好把这批工作
 * 要堵的那个洞重新打开。两个消费点用的都是下面已有的 parser，不要改成 `require`。
 */
const PRIVATE_MESSAGE_LEGACY_BARE = {
  until: '2026-12-31',
  reason:
    '好友消息.md 全文零个信封样例（grep "code" / "data" 均 0 命中），好友侧信封化目前只是对群文档的类比推断',
} as const

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
 *
 * ## ⚠️ 顺序也是分叉的：sync **不**做 DESC→ASC 翻转
 *
 * `getMessages` / 群侧 `getMessages` 都在模块出口翻了一次，这里**故意没翻**，因为
 * sync 本来就是 ASC：
 * - `消息同步.md:117-160` 的响应样例里 `messages` 是 seq **101 → 102**，最旧在前；
 * - `chatStore.ts` 的 `syncMessages` 也是拿 `conv.messages[conv.messages.length - 1]`
 *   当"最新一条"去写 `lastMessage` / `lastTime`。
 *
 * 翻一次会把最旧那条当成最新的写进会话列表预览。这条和上面的 DTO 分叉一样必须写下来：
 * 这批刚花了三十行把 REST 侧的顺序统一掉，下一个人很容易顺手把 sync 也"统一"了。
 *
 * 后端也没有为 sync 承诺过 DESC——`好友消息.md:774` 那句 "本页覆盖的时间区间 DESC 连续"
 * 讲的是 `before_time` 游标分页，sync 走的是 `last_seq` 增量，两套语义。
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
    // legacyBare：好友侧是否已信封化证据不足，见 PRIVATE_MESSAGE_LEGACY_BARE 的 JSDoc
    // （上一版这里的 README 引用是假的）。它与 `parse` 配对，所以裸响应被接受、
    // 而"有信封但 data 为空"仍然抛错，两者不会重新混成一种表现。
    const data = await readEnvelope<SendMessageResponse>(response, {
      endpoint: 'POST /api/messages',
      fallbackMessage: '发送消息失败',
      parse: sendMessageResponse,
      legacyBare: PRIVATE_MESSAGE_LEGACY_BARE,
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

    // legacyBare 同 sendMessage，见 PRIVATE_MESSAGE_LEGACY_BARE 的 JSDoc。
    // 这个端点是代价最不对称的那一个：好友侧若没信封化，严格解包会让主界面
    // 每一次消息加载都抛 ApiShapeError。
    const page = await readEnvelope<GetMessagesResponse>(response, {
      endpoint: 'GET /api/messages',
      fallbackMessage: '获取消息失败',
      parse: getMessagesResponse,
      legacyBare: PRIVATE_MESSAGE_LEGACY_BARE,
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
   * 两边现在不对称。
   *
   * ## ⚠️ 迁移时**不要照抄群侧**——两边的形状不一样
   *
   * - 群侧 `群消息.md:279-287`：
   *   `{"success":true,"code":200,"data":{"success":true,"message":"消息已删除"}}`
   *   ——业务结果**嵌在 data 里**，所以 `groupMessages.ts` 解包之后还要再判一次
   *   `data.success`。
   * - 好友侧 `好友消息.md:335-340`：`{"success": true, "message": "消息删除成功"}`
   *   ——**裸的，连 `data` 键都没有**，`success` 就在顶层。原样套群侧的
   *   `readEnvelope(..., {parse: 嵌套结果})` 会直接抛「响应缺少 data 字段」。
   *
   * 好友侧这个样例块在**字段**上确实过期（同块的 GET / POST 样例都缺字段表 :250-258
   * 里的 rev / reply_to / media_group_*），但过期的是字段不是形状——而它是好友侧
   * 全文唯一的形状线索，方向恰好与群侧相反。
   *
   * 所以这两个端点的迁移必须先发一次**真实请求**看实际形状（同上面
   * PRIVATE_MESSAGE_LEGACY_BARE 的处境），不能靠类比群侧推出来。
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
    //
    // 这个端点**不传** legacyBare，尽管它也在 `/api/messages` 下：它的文档
    // （`消息同步.md:117-120`）给的响应样例就是 `{"code":0,"message":"success","data":{…}}`，
    // 明确带信封。好友侧那两个端点的模糊来自 `好友消息.md` 一个信封样例都没有，
    // 这里没有那种模糊，加容忍是自造的。
    const result = await readEnvelope<SyncMessagesResponse>(response, {
      endpoint: 'POST /api/messages/sync',
      fallbackMessage: '同步消息失败',
      parse: syncMessagesResponse,
    })
    console.log('✅ 消息同步完成')
    return result
  },
}
