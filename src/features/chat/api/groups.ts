import { getApiBaseUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'
import { type Parser, assertEnvelopeOk, readEnvelope, readEnvelopeList } from '@/lib/apiEnvelope'
import { arr, asRecord, bool, num, str } from '@/lib/apiParse'

const GROUPS_BASE_URL = `${getApiBaseUrl()}/api/groups`

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

export type MemberRole = 'owner' | 'admin' | 'member'

/**
 * 「看得到 / 拿得到」的三档范围：`card_share_scope` / `qr_show_scope`（doc:208-209）。
 */
export type ShareScope = 'all_members' | 'admins' | 'owner_only'

/**
 * 「搜不搜得到本群」的三档范围（doc:210）。
 *
 * 🔴 最松档叫 `everyone`（任何登录用户），**不是** {@link ShareScope} 的
 * `all_members`（本群全体成员）——doc:210 写明两者「语义方向相反，故有意不同名」，
 * 给 `search_scope` 传 `all_members` 会被 `400` 拒。两个类型分开写就是为了让
 * 写错的一方在 tsc 里就死掉，不用等后端 `400`。
 */
export type SearchScope = 'everyone' | 'admins' | 'owner_only'

/**
 * 入群策略八字段（doc:195-215 字段表、doc:473-560 `PUT /{group_id}/join-policy`）。
 *
 * 它们合起来取代了 2026-08-17 连同 `groups."join-mode"` 列（migration 043 DROP）
 * 一起删掉的五档 `join_mode`（doc:442-468）。旧五档里只有两档有去处：
 * `open` ⇒ `join_approval_required=false`、`approval_required` ⇒ `true`；
 * `closed` 只有「不让别人搜到」半边落到 `search_scope='owner_only'`，
 * `invite_only` / `admin_invite_only` **无替代**。
 *
 * 🔴 三档 scope 与三个 `allow_join_via_*` 是两组正交的东西（doc:498-507）：
 * scope 管「谁能把码/卡片拿出去、谁搜得到」，开关管「拿到了能不能进」。
 * 关掉 `allow_join_via_search` **不会**让群从搜索结果里消失，反之亦然。
 */
export interface JoinPolicy {
  /** `true` ⇒ `POST /{group_id}/apply` 落待审；`false` ⇒ 直接入群（doc:542）。 */
  join_approval_required: boolean
  /** `false` ⇒ **仅群主**能列/批/拒入群申请，管理员一律 `403`（doc:543）。 */
  admin_can_approve: boolean
  card_share_scope: ShareScope
  qr_show_scope: ShareScope
  search_scope: SearchScope
  allow_join_via_qr: boolean
  allow_join_via_search: boolean
  allow_join_via_referral: boolean
}

/**
 * `Group` / `MyGroup` / `searchGroups` 三处共有的那部分。
 *
 * 入群策略八字段**不在这里**：doc:195-196 写明 `GroupInfo` 字段表
 * 「**只有** `GET /{group_id}` 用它」，`GET /my`（doc:131-140 字段表共 7 个字段）
 * 与已删除的 `/search` 都不返回它们——把八字段放进基类会让类型声称
 * 它们存在而运行时没有，正是本次迁移要消灭的形态。
 *
 * `group_avatar_url` 是 `string | null`：字段表（doc:202）写的就是 `string | null`，
 * 而两份响应样例（doc:177、doc:121）给的是 `""`。api 出口统一把 `''`
 * 与绝对化交给 `absoluteAvatar`，空串会被 `<AvatarImage src="">` 当成一次
 * 真实的图片请求。
 */
export interface GroupBase {
  group_id: string
  group_name: string
  group_avatar_url: string | null
  group_description?: string | null
  creator_id?: string
  created_at?: string
  status?: string
  member_count?: number
}

/**
 * `GET /api/groups/{group_id}` 的 `GroupInfo`（字段表 doc:195-215）：
 * 基础字段 + 入群策略八字段。
 *
 * 八字段写成**必需**：字段表里它们无条件列出，且 {@link groupDetailResponse}
 * 会在运行时逐个校验。写成可选就会把调用点逐个逼出 `?? true` 之类的
 * 兜底，而兜底正是本次迁移要删的东西。
 */
export interface Group extends GroupBase, JoinPolicy {}

/**
 * `GET /api/groups/my` 的一条记录。字段表 + 样例：
 * backend-docs/groups/群聊管理.md:113-140。
 *
 * 继承 {@link GroupBase} 而不是 `Group`：`/my` 的字段表只有 7 个字段，
 * **不含**入群策略八字段——批 3 之前这里写的是 `Omit<Group, 'group_avatar_url'>`，
 * 那时 `Group` 上没有必需字段所以无害；`Group` 补上八个必需字段之后再继承它，
 * 就等于声称 `/my` 的每一行都带策略，而运行时一个都没有。
 * 空串头像归一为 `null` 的理由见 {@link GroupBase}。
 */
export interface MyGroup extends GroupBase {
  role: MemberRole
  unread_count: number | null
  last_message_content: string | null
  last_message_time: string | null
}

/**
 * `GET /api/groups/{group_id}/members` 的一条成员记录（doc:696-706 的样例）。
 *
 * `user_nickname` 从 `string` 改成 `string | null`：本端点自己**没有**独立的字段表，
 * 只有一份样例，所以这是**同文档同族推断**，不是直证——`InvitationInfo.inviter_nickname`
 * （:1182）、`GroupBlockedMemberDto.user_nickname`（:1563）都在字段表里明写
 * 「users JOIN；未设为 `null`」。`GroupManagement.tsx` 原有的
 * `member.user_nickname[0]?.toUpperCase()` 在 JOIN 缺失时会直接 TypeError，
 * 风险高于误加一个 `null`。`user_avatar_url` 同 `MyGroup.group_avatar_url`
 * 的理由改可空（样例同样是 `""`）。
 */
export interface GroupMember {
  user_id: string
  user_nickname: string | null
  user_avatar_url: string | null
  role: MemberRole
  group_nickname: string | null
  joined_at: string
  join_method: string
  muted_until: string | null
}

export interface GroupNotice {
  id: string
  title: string
  content: string
  publisher_id: string
  publisher_nickname: string
  published_at: string
  is_pinned: boolean
  updated_at: string
}

/**
 * `GET /api/groups/invitations` 的一条记录（`InvitationInfo`，字段表 doc:1173-1186）。
 *
 * 三处改动，均直接对着字段表：
 * - 补 `inviter_avatar_url`——文档明确存在（:1183），旧接口漏了这个字段；
 * - `group_avatar_url` / `inviter_nickname` / `inviter_avatar_url` / `expires_at`
 *   四个字段改成 `string | null`——字段表逐条写着 `string | null`，
 *   后两个还注明「users JOIN；未设为 `null`」。
 */
export interface GroupInvitation {
  request_id: string
  group_id: string
  group_name: string
  group_avatar_url: string | null
  inviter_id: string
  inviter_nickname: string | null
  inviter_avatar_url: string | null
  message: string | null
  created_at: string
  expires_at: string | null
}

/**
 * 待审申请行的四类来源（doc:1258-1260 的 📌 + doc:1280-1288 approve 的四类表）。
 *
 * 2026-08-17 起 `join_approval_required=true` 的群里，**所有**邀请（群主 /
 * 管理员 / 普通成员发出的）都会落进 `GET /{group_id}/requests` 这一个列表，
 * 与用户自己发起的 `search_apply` 混在一起（doc:2301-2302 注意事项 7 ③）。
 * 四类现在都能批（doc:1276-1288 记录了 2026-08-17 之前 owner_invite /
 * admin_invite 点同意恒 400 的那个 bug 已修），所以 UI 不能给邀请行禁用按钮。
 */
export type JoinRequestType = 'search_apply' | 'owner_invite' | 'admin_invite' | 'member_invite'

/**
 * `GET /api/groups/{group_id}/requests` 的一行。
 *
 * ⚠️ **证据强度分两档，代码里的严格程度也跟着分两档**（见
 * {@link joinRequestsResponse} 的注释）：
 * - 行内字段：`request_type` / `user_accepted` 由 doc:1258-1260 的正文**直接
 *   点名**是"列表项"的属性，`message`（申请附言）来自 apply 请求体
 *   （doc:1049-1054）与发出方 DTO（doc:1360-1369）——两处都叫 `message`，
 *   文档全篇没有任何响应字段叫 `reason`（`reason` 只是 `POST …/reject` 的
 *   **请求体**字段，doc:1308-1312）。所以行内逐字段严格校验。
 * - 容器形状：本端点是全模块**唯一没有响应样例**的列表端点（doc:1251-1266
 *   只有权限说明与那条 📌），同文档三个先例互相矛盾（`/my` 是裸数组
 *   doc:113-129、`/invitations` 是 `data.invitations` doc:1150-1170、
 *   `/requests/sent` 是 `data.requests` doc:1338-1357），类推不出结论。
 */
export interface JoinRequest {
  request_id: string
  user_id: string
  /** users JOIN；未设为 `null`（同族推断，见 {@link GroupMember.user_nickname}）。 */
  user_nickname: string | null
  /** 相对路径，已在 api 出口过 {@link absoluteAvatar}。 */
  user_avatar_url: string | null
  /** 申请附言。后端字段名是 `message`，**不是** `reason`。 */
  message: string | null
  request_type: JoinRequestType
  /** 被邀请人是否已经同意（`auto_accept` 的人上架即为 `true`，doc:1260）。 */
  user_accepted: boolean
  created_at: string
}

/**
 * `POST /api/groups/{group_id}/invite` 的逐条结果（doc:782-796 响应样例）。
 *
 * 🔴 这里的 `success` 是**逐个被邀请人**的成败，是本模块唯一一处
 * "HTTP 200 里表达业务失败"（doc:733-741 行为矩阵、doc:743-752 的 2026-08-21
 * 前置行）。其余端点的失败一律是状态码。`message` 是后端为这一档专门写的
 * 文案（如 `该群未开放好友推荐加群` / `对方已设置自动拒绝群邀请`），
 * doc:2299-2300 要求前端**照抄**它，不要按"我是不是管理员"自己预测结果。
 */
export interface InviteResult {
  user_id: string
  success: boolean
  message: string
}

/** `POST /api/groups/{group_id}/apply` 的三条来源（doc:1049-1062）。 */
export type JoinSource = 'qr' | 'search' | 'referral'

/**
 * `POST /api/groups/{group_id}/apply` 的 `data`（`ApplyJoinResponse`，
 * 字段表 doc:1128-1132、样例 doc:1108-1126）。
 *
 * `status` 是**唯一**的两态判据；doc:1131 明写「不要靠解析 `message` 文案」。
 * doc:1134-1136 记录了契约变更：`data` 从 `SuccessResponse{success,message}`
 * 换成了这个形状，**`success` 已从 `data` 里移除**。
 */
export interface ApplyJoinResult {
  status: 'joined' | 'pending'
  message: string
}

/**
 * `POST /api/groups/invitations/{request_id}/accept` 的 `data`（doc:1213-1231）。
 *
 * ⚠️ 这个 `success` 在 `data` **里面**，和信封顶层的 `success` 是两个字段——
 * 它对两种结局恒为 `true`，不是判据。两种结局（真入群 / 落待审）HTTP 全是
 * 200、信封 `success` 全是 true，唯一区别在 `message`，而 doc:1202-1203 明写
 * **不要解析文案**：accept 之后重新拉 `GET /api/groups/my` 确认。
 */
export interface AcceptInvitationResult {
  success: boolean
  message: string
}

/**
 * 头像相对路径 → 绝对地址，只在 api 模块出口做一次。与 `friends.ts:136` 的
 * 同名函数逐字同型——独立定义一份而不是跨 feature 导入，是因为两边调用点
 * 分属不同的领域对象，没必要为一个三行函数建跨模块依赖。
 *
 * `null` 与空串统一归一为 `null`（未知/无头像），不兜底成空串：空串会被
 * `<AvatarImage src="">` 当成一次真实的图片请求。
 */
const absoluteAvatar = (path: string | null): string | null => toAbsoluteApiUrl(path) ?? null

// ============================================
// 信封 `data` 的运行时校验（parse 档）
// ============================================

/**
 * `GET /api/groups/{group_id}/members` 的 `data`：对象（不是数组），
 * 数组挂在 `members` 字段上，`total` 与它同级（doc:691-711）。
 *
 * 不能用 `readEnvelopeList`——那个只取一个数组字段，取不到同级的 `total`。
 * 也不能用 `require: ['members', 'total']`——`require` 认 `null` 为「存在」，
 * `data.members: null` 会被放行，把 `TypeError` 推迟到调用点的 `.map()`；
 * `arr()` 会对 `members` 做一次真正的 `Array.isArray` 校验。
 */
const groupMembersResponse: Parser<{ members: GroupMember[]; total: number }> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'GET /{group_id}/members 的 data')
    return {
      members: arr(payload, 'members') as GroupMember[],
      total: num(payload, 'total'),
    }
  },
}

/** `POST /api/groups/{group_id}/notices` 的 `data`（doc:1404-1411）。 */
const createNoticeResponse: Parser<{ id: string; published_at: string }> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'POST /{group_id}/notices 的 data')
    return {
      id: str(payload, 'id'),
      published_at: str(payload, 'published_at'),
    }
  },
}

/**
 * `POST /api/groups/{group_id}/mute` 的 `data`：本模块 10 个 `SuccessResponse{success,
 * message}` 之一，但额外带 `muted_until`（doc:1000-1008）。
 *
 * ⚠️ 内层 `data.success` **不是**信封的 `success`——信封的 `success` 已经在
 * `readEnvelope` 内部由 `assertOk` 校验过；这里只取调用点真正要用的 `muted_until`，
 * 不要顺手把 `data.success` 读出来当判据。
 */
const muteMemberResponse: Parser<{ muted_until: string }> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'POST /{group_id}/mute 的 data')
    return { muted_until: str(payload, 'muted_until') }
  },
}

const SHARE_SCOPES: readonly ShareScope[] = ['all_members', 'admins', 'owner_only']
const SEARCH_SCOPES: readonly SearchScope[] = ['everyone', 'admins', 'owner_only']

/**
 * 闭集枚举字段：先过 `str()`（拒空串），再核对取值在给定的档位表里。
 *
 * 为什么不只用 `str()`：`card_share_scope`/`qr_show_scope` 与 `search_scope`
 * 的取值表**不同名**（doc:210、doc:552-554），后端对越档取值返回 `400`。
 * 只校验「是非空字符串」会让一个 `search_scope: "all_members"` 一路进到 UI，
 * 渲染成一个选不中任何选项的下拉框——又是一次「坏形状伪装成数据」。
 *
 * 批 4 起同样用于两个非 scope 的闭集：`ApplyJoinResult.status`
 * （`joined`/`pending`，doc:1131 明写它是唯一判据）与 `JoinRequest.request_type`
 * （四类，doc:1280-1288）。落到闭集外说明后端又改了取值表，那正是要炸的场景。
 */
function scopeOf<T extends string>(
  payload: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = str(payload, key)
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${key} 取值 ${value} 不在 ${allowed.join(' / ')} 之内`)
  }
  return value as T
}

/**
 * 入群策略八字段的逐字段校验（doc:538-549 响应字段表）。
 *
 * 八个全部走 `bool()` / `scopeOf()` 实打实校验一次，一个都不给默认值：
 * 这份 `data` 的用途就是**直接回填设置面板**（doc:538），少一个字段就意味着
 * 面板上有一个开关会被渲染成它实际不是的状态——这比抛错难查得多。
 */
function joinPolicyOf(payload: Record<string, unknown>): JoinPolicy {
  return {
    join_approval_required: bool(payload, 'join_approval_required'),
    admin_can_approve: bool(payload, 'admin_can_approve'),
    card_share_scope: scopeOf(payload, 'card_share_scope', SHARE_SCOPES),
    qr_show_scope: scopeOf(payload, 'qr_show_scope', SHARE_SCOPES),
    search_scope: scopeOf(payload, 'search_scope', SEARCH_SCOPES),
    allow_join_via_qr: bool(payload, 'allow_join_via_qr'),
    allow_join_via_search: bool(payload, 'allow_join_via_search'),
    allow_join_via_referral: bool(payload, 'allow_join_via_referral'),
  }
}

/**
 * `PUT /api/groups/{group_id}/join-policy` 的 `data`：更新**之后**的完整八值
 * （doc:521-535 样例 + doc:538-549 字段表）。
 */
const joinPolicyResponse: Parser<JoinPolicy> = {
  parse(input: unknown) {
    return joinPolicyOf(asRecord(input, 'PUT /{group_id}/join-policy 的 data'))
  },
}

/**
 * 文档写明 `string | null`、但响应样例里实际给 `""` 的字段——
 * `GroupInfo.group_avatar_url`（字段表 doc:202，样例 doc:177 是 `""`）与
 * `group_description`（字段表 doc:203）。`''` 与 `null` 一并归一成 `null`
 * （= 未设置），其余非字符串抛错。
 *
 * 不能直接用 `apiParse` 的 `nullableStr`：它把 `''` 判成"缺失"并抛错（在别的
 * 端点上这个判断是对的），而这里 `''` 是文档自己给出的合法值——照抄文档样例
 * 的一次请求就会让整个群详情加载失败。
 */
function emptyableStr(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new Error(`${key} 缺失或不是字符串`)
  }
  return value === '' ? null : value
}

/**
 * `GET /api/groups/{group_id}` 的 `data`（`GroupInfo`，字段表 doc:195-215、
 * 样例 doc:165-193）。
 *
 * `member_count` / `status` / `creator_id` / `created_at` 走 `num`/`str`
 * 必需档：字段表里它们和 `group_id` 一样无条件列出，样例里也都有值。
 * `group_description` 与 `group_avatar_url` 走 {@link emptyableStr}——字段表
 * 明写 `string | null`，且样例里头像就是 `""`。
 *
 * ⚠️ `group_avatar_url` 在出口过 `absoluteAvatar`。这一条是**同族推断，不是直证**：
 * 本字段表只写「群头像」，没写相对路径；直证只在 `GET /my` 的字段表上
 * （doc:136「群头像相对路径（需拼接 `STORAGE_BASE_URL`）」）。两处是同一列数据，
 * 不补基址会出现「群列表里头像正常、群设置面板里头像裂开」。
 */
const groupDetailResponse: Parser<Group> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'GET /{group_id} 的 data')
    return {
      group_id: str(payload, 'group_id'),
      group_name: str(payload, 'group_name'),
      group_avatar_url: absoluteAvatar(emptyableStr(payload, 'group_avatar_url')),
      group_description: emptyableStr(payload, 'group_description'),
      creator_id: str(payload, 'creator_id'),
      created_at: str(payload, 'created_at'),
      status: str(payload, 'status'),
      member_count: num(payload, 'member_count'),
      ...joinPolicyOf(payload),
    }
  },
}

/**
 * `POST /api/groups/{group_id}/invite` 的 `data`（doc:782-796）：
 * `{ results: [{ user_id, success, message }] }`。
 *
 * 三个字段都实打实校验：`success` 用 `bool()` 而不是真值判断——`undefined`
 * 会被 `if (r.success)` 判成失败、被 `!r.success` 判成失败，两种写法都会
 * 把「后端没给这个字段」伪装成一个确定的业务结论。`message` 用 `str()`：
 * 它是要**逐字展示给用户**的后端文案（doc:2299-2300），空串意味着 UI 上
 * 出现一行没有原因的失败。
 */
const inviteResultsResponse: Parser<{ results: InviteResult[] }> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'POST /{group_id}/invite 的 data')
    return {
      results: arr(payload, 'results').map((row) => {
        const item = asRecord(row, 'results[] 的元素')
        return {
          user_id: str(item, 'user_id'),
          success: bool(item, 'success'),
          message: str(item, 'message'),
        }
      }),
    }
  },
}

const APPLY_JOIN_STATUSES: readonly ApplyJoinResult['status'][] = ['joined', 'pending']

/**
 * `POST /api/groups/{group_id}/apply` 的 `data`（doc:1108-1132）。
 *
 * `status` 走闭集校验而不是 `str()`：它是「我到底进群了没有」的唯一判据
 * （doc:1131），落到 `joined`/`pending` 之外说明后端换了取值表——那时宁可
 * 报错，也不能挑一个默认值继续往下走（选 `pending` 会把已入群说成等审批，
 * 选 `joined` 会把等审批说成已入群，两个方向都在骗用户）。
 */
const applyJoinResponse: Parser<ApplyJoinResult> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'POST /{group_id}/apply 的 data')
    return {
      status: scopeOf(payload, 'status', APPLY_JOIN_STATUSES),
      message: str(payload, 'message'),
    }
  },
}

/**
 * `POST /api/groups/invitations/{request_id}/accept` 的 `data`（doc:1213-1231）。
 *
 * 读出内层 `success` 只是为了**校验形状**（doc 的两份样例里它都在），
 * 调用点绝不能拿它当「我进群了没有」的判据：两种结局它恒为 `true`。
 * 真正的判据在 accept 之后重新拉的 `GET /api/groups/my`（doc:1202-1203）。
 */
const acceptInvitationResponse: Parser<AcceptInvitationResult> = {
  parse(input: unknown) {
    const payload = asRecord(input, 'POST /invitations/{request_id}/accept 的 data')
    return {
      success: bool(payload, 'success'),
      message: str(payload, 'message'),
    }
  },
}

const JOIN_REQUEST_TYPES: readonly JoinRequestType[] = [
  'search_apply',
  'owner_invite',
  'admin_invite',
  'member_invite',
]

/**
 * `GET /api/groups/{group_id}/requests` 的 `data` → {@link JoinRequest} 数组。
 *
 * ## 为什么这一个 parser 里容器和行内的严格程度不一样
 *
 * **行内逐字段严格**：`request_type` / `user_accepted` 由 doc:1258-1260 的
 * 正文直接点名为"列表项"的属性，`message` 由 apply 请求体（doc:1051）与
 * `SentJoinRequestInfo` 字段表（doc:1367）两处互证。有直证就按直证校验。
 *
 * **容器两种形状都收，但收不到就抛**：本端点是全模块唯一没有响应样例的
 * 列表端点（doc:1251-1266 只有权限说明和一行 `await api(...)`），而同一份
 * 文档里三个先例互相矛盾——`/my` 是裸数组（doc:113-129）、`/invitations` 是
 * `data.invitations`（doc:1150-1170）、`/requests/sent` 是 `data.requests`
 * （doc:1338-1357）。两条路都走不通：
 * - 猜 `field: 'requests'`：若真实形状是裸数组，就把一个**今天正常工作的**
 *   页面改成每次都报错（旧代码 `result.data || []` 在裸数组下是对的）。
 * - 猜裸数组：若真实形状是 `{requests:[…]}`，同样每次都报错。
 *
 * 所以这里两种都认，**其余一律抛**——`data:{}`、`data:{requests:null}`、
 * `data:{items:[…]}` 全部炸出 `ApiShapeError` 并进 Sentry（tag
 * `endpoint:GET /api/groups/{group_id}/requests`）。这和被删掉的
 * `result.data || []` 不是一回事：那句对**任何**真值都返回真值，包括
 * `{}` 和 `{requests:null}`，也包括 HTTP 200 + `success:false`。
 *
 * ⚠️ **这是一条带期限的猜测链，不是终局**：
 * - until: 2026-12-31
 * - 待办：打一次带 token 的真实请求（`GET /api/groups/{group_id}/requests`）
 *   把形状钉死，然后删掉其中一条分支、把注释换成直证。
 * - 已知：后端文档缺本端点的响应样例，需要向后端补。
 * 半年后看到这段的人不必重新考据：上面三条把"这是猜的、怎么收尾"写全了。
 */
const joinRequestsResponse: Parser<JoinRequest[]> = {
  parse(input: unknown) {
    const rows = Array.isArray(input)
      ? input
      : arr(asRecord(input, 'GET /{group_id}/requests 的 data'), 'requests')

    return rows.map((row) => {
      const item = asRecord(row, '待审申请行')
      return {
        request_id: str(item, 'request_id'),
        user_id: str(item, 'user_id'),
        // 三个可空字段走 emptyableStr（`null` 与 `''` 都归一成 null），
        // 但**键必须存在**：整键缺席说明形状变了，要炸。
        user_nickname: emptyableStr(item, 'user_nickname'),
        user_avatar_url: absoluteAvatar(emptyableStr(item, 'user_avatar_url')),
        message: emptyableStr(item, 'message'),
        request_type: scopeOf(item, 'request_type', JOIN_REQUEST_TYPES),
        user_accepted: bool(item, 'user_accepted'),
        created_at: str(item, 'created_at'),
      }
    })
  },
}

// ============================================
// API 方法
// ============================================

export const groupsApi = {
  // ==========================================
  // 群聊基础操作
  // ==========================================

  /**
   * 创建群聊
   * POST /api/groups
   *
   * 请求体第三个字段从 `join_mode?: string`（五档）换成
   * `join_approval_required?: boolean`（doc:55-62 请求体、doc:64-75 破坏性变更表）。
   *
   * 🔴 继续传 `join_mode` **不会报错**——doc:74-75 写明「服务端忽略未知字段，
   * 会被静默丢弃 ⇒ 群按默认『需审核』建出来」。所以这里没有任何编译期或
   * 运行期信号能提醒漏改，只能靠把旧字段从类型里删干净 + 测试断言
   * 请求体里**没有** `join_mode`。
   *
   * 不传该字段时后端默认 `true`（需审核，doc:60）。
   */
  createGroup: async (data: {
    group_name: string
    group_description?: string
    join_approval_required?: boolean
  }): Promise<{ group_id: string; group_name: string; created_at: string }> => {
    console.log('➕ 创建群聊:', data.group_name)
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '创建群聊失败' }))
      throw new Error(error.error || '创建群聊失败')
    }

    const result = await response.json()
    console.log('✅ 群聊创建成功:', result.data.group_id)
    return result.data
  },

  /**
   * 获取我的群聊列表
   * GET /api/groups/my
   *
   * doc:113-129 给了完整信封样例：`{"success":true,"code":200,"data":[...]}`，
   * `data` **本身**就是数组，没有 `groups` 包装。旧代码的
   * `result.data?.groups || result.data || result.groups || result || []`
   * 五路猜测链第一路（`.groups`）今天恒为 `undefined`，从未匹配过任何一版
   * 后端格式，短路到 `result.data` 才蒙对——留着只会让"后端真的换成
   * `data.groups`"和"没换"变成同一种表现。不传 `field`、不传 `legacyBare`：
   * 变更日志与样例都点名了这个端点是信封，没有"可能还是裸响应"的余地。
   */
  getMyGroups: async (): Promise<MyGroup[]> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/my`, {
      method: 'GET',
    })

    const rows = await readEnvelopeList<MyGroup>(response, {
      endpoint: 'GET /api/groups/my',
      fallbackMessage: '获取群聊列表失败',
    })

    return rows.map((group) => ({
      ...group,
      group_avatar_url: absoluteAvatar(group.group_avatar_url),
    }))
  },

  /**
   * 搜索群聊
   * GET /api/groups/search?query=xxx
   *
   * ⚠️ 该端点已于 2026-08-17 整套删除，替代端点在 discovery 模块（批 6），
   * 本批不动——这里改的是解包方式，不是"搜索群聊"这个功能本身还能不能用。
   *
   * 返回类型由 `Group[]` 收窄成 `GroupBase[]`：批 3 给 `Group` 补上了八个
   * **必需**的策略字段，而这个（已删的）端点从来不返回它们。这是删字段带来的
   * 类型连带修正，不是对本端点的迁移——它的解包方式仍留给批 6。
   */
  searchGroups: async (query: string): Promise<GroupBase[]> => {
    console.log('🔍 搜索群聊:', query)
    const params = new URLSearchParams({ query })

    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/search?${params}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '搜索群聊失败' }))
      throw new Error(error.error || '搜索群聊失败')
    }

    const result = await response.json()
    return result.data || []
  },

  /**
   * 获取群聊详情
   * GET /api/groups/{group_id}
   *
   * doc:165-193 给了完整信封样例，`data` 是 `GroupInfo` 对象。走 `parse` 而不是
   * `require`：`require` 认 `null` 为「存在」，而这里最要命的正是
   * `join_approval_required: null` 这类值——面板上的开关会被渲染成 `false`
   * （「无需审核」），和后端真实状态相反且没有任何报错。
   *
   * 错误分诊按 doc:152-163 的全模块统一口径：群不存在 ⇒ `404`，
   * 群存在但不是活跃成员 ⇒ `403`。两者都由 `readEnvelope` 抛成带 `status`
   * 的 `ApiError`，文案取后端原文。
   */
  getGroupDetail: async (groupId: string): Promise<Group> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}`, {
      method: 'GET',
    })

    return readEnvelope<Group>(response, {
      endpoint: 'GET /api/groups/{group_id}',
      fallbackMessage: '获取群聊详情失败',
      parse: groupDetailResponse,
    })
  },

  /**
   * 更新群聊信息
   * PUT /api/groups/{group_id}
   *
   * doc:219-245 连响应样例都没有——正因为 `assertEnvelopeOk` 不要求 `data`，
   * 没样例在这里不是障碍：它只在 `!response.ok` 或外层 `success===false` 时抛。
   */
  updateGroup: async (groupId: string, data: {
    group_name?: string
    group_description?: string
    group_avatar_url?: string
  }): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'PUT /api/groups/{group_id}',
      fallbackMessage: '更新群聊信息失败',
    })
  },

  /**
   * 上传群头像
   * POST /api/groups/{group_id}/avatar
   *
   * ⚠️ 该端点已于 2026-08-28 删除，群头像改走 storage 统一预签名分片直传链路
   * （批 5，需要同时改 `storage.ts` 的 `FileType`/`avatar_target`），本批不动。
   */
  uploadGroupAvatar: async (groupId: string, file: File): Promise<{ avatar_url: string }> => {
    console.log('📸 上传群头像:', groupId, file.name)

    // 验证文件大小
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      throw new Error(`文件太大，最大 10MB，当前: ${(file.size / 1024 / 1024).toFixed(2)} MB`)
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      throw new Error('不支持的文件格式，支持: jpg, jpeg, png, gif, webp')
    }

    const formData = new FormData()
    formData.append('avatar', file)

    const authStore = useAuthStore.getState()
    const accessToken = authStore.accessToken

    const response = await fetch(`${GROUPS_BASE_URL}/${groupId}/avatar`, {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '上传群头像失败' }))
      throw new Error(error.error || '上传群头像失败')
    }

    const result = await response.json()
    console.log('✅ 群头像上传成功:', result.data.avatar_url)
    return result.data
  },

  /**
   * 修改我的群内昵称
   * PUT /api/groups/{group_id}/nickname
   *
   * doc:404-411：`data` 是 `SuccessResponse{success,message}`，内层 `success` 不是
   * 信封 `success`，`assertEnvelopeOk` 不读它，不需要 `data` 就够。
   */
  updateGroupNickname: async (groupId: string, nickname: string | null): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/nickname`, {
      method: 'PUT',
      body: JSON.stringify({ nickname }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'PUT /api/groups/{group_id}/nickname',
      fallbackMessage: '修改群内昵称失败',
    })
  },

  /**
   * 修改入群策略
   * PUT /api/groups/{group_id}/join-policy
   *
   * 🔴 URL 是**连字符** `join-policy`，不是下划线。被它取代的
   * `PUT /{group_id}/join_mode` 已于 2026-08-17 整套删除、**无兼容层**
   * （doc:442-446），今天调用它只会拿到 404。这条 404 过去被
   * `GroupManagement` 吞成一句固定的「更新失败」，是本批要修的原始症状。
   *
   * **权限：仅群主**（doc:477「管理员也不行」）。因此 `403` 是这个端点的
   * 常规失败，不是登录态失效——本文件的 `fetchWithAuth`（:19-61）只在
   * `response.status === 401` 时才会尝试刷新令牌/静默登出，403 原样穿透，
   * 交给 `readEnvelope` 抛成带后端原文的 `ApiError`。（`apiEnvelope.ts` 的
   * `isAuthApiError` 同样把 403 排除在外，但那是 `src/api/apiClient.ts`
   * 另一个客户端专用的判据——本文件从不调用它，只是恰好得到同一个结论；
   * 真正兜住这条路径的是上面这个 401-only 分支，不是 `isAuthApiError`。）
   *
   * 八个字段全部可选，**只发请求体里真正出现的那些**，未出现的保持原值
   * （doc:479-480）。所以这里直接把调用点给的 `patch` 原样序列化，不做
   * 「补齐成八个」的规范化——补齐会把用户没动的开关也一并写回，
   * 中间隔着一次别人的修改就会被静默覆盖。
   *
   * 返回值是更新**之后**的完整八值（doc:538「可直接回填设置面板」），
   * 调用点应当用它覆盖本地状态，而不是自己乐观地拼一个。
   */
  updateJoinPolicy: async (groupId: string, patch: Partial<JoinPolicy>): Promise<JoinPolicy> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/join-policy`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    })

    return readEnvelope<JoinPolicy>(response, {
      endpoint: 'PUT /api/groups/{group_id}/join-policy',
      fallbackMessage: '更新入群策略失败',
      parse: joinPolicyResponse,
    })
  },

  /**
   * 解散群聊
   * DELETE /api/groups/{group_id}
   * doc:583-599：`data` 是 `SuccessResponse{success,message}`。
   */
  disbandGroup: async (groupId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}',
      fallbackMessage: '解散群聊失败',
    })
  },

  // ==========================================
  // 成员管理
  // ==========================================

  /**
   * 获取成员列表
   * GET /api/groups/{group_id}/members
   *
   * 旧代码 `result.data || result || {}` + `data.members || []` +
   * `data.total || members.length || 0` 是本文件五路猜测链之一：
   * `total: 0`（合法值）会被 `||` 换成 `members.length`——真 bug，不是风格问题。
   * `groupMembersResponse` 用 `arr`/`num` 各校验一次，拿不到就抛，不再猜。
   */
  getMembers: async (groupId: string): Promise<{ members: GroupMember[]; total: number }> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/members`, {
      method: 'GET',
    })

    const data = await readEnvelope<{ members: GroupMember[]; total: number }>(response, {
      endpoint: 'GET /api/groups/{group_id}/members',
      fallbackMessage: '获取成员列表失败',
      parse: groupMembersResponse,
    })

    return {
      members: data.members.map((member) => ({
        ...member,
        user_avatar_url: absoluteAvatar(member.user_avatar_url),
      })),
      total: data.total,
    }
  },

  /**
   * 邀请成员入群
   * POST /api/groups/{group_id}/invite
   *
   * 🔴 **本模块唯一一处「HTTP 200 里表达失败」**：整批请求成功（200 + 信封
   * `success:true`）的同时，每个被邀请人的成败各自躺在 `data.results[].success`
   * 里（doc:733-741 行为矩阵、doc:743-752 的 2026-08-21 前置行、doc:782-796
   * 响应样例）。所以 `assertEnvelopeOk` 不够——它按定义只看整批。
   *
   * 旧代码 `return result.data` 之后调用点整个丢弃返回值、无条件弹「邀请已发送」：
   * 邀请 10 个人 8 个被群设置挡掉，和 10 个全发出去，屏幕上一模一样。
   * 这里把逐条结果原样交给调用点，由它按 `results[].message` 显示后端文案
   * （doc:2299-2300 要求照抄，不要按"我是不是管理员"预测结果——2026-08-17
   * 之后三类邀请行为完全一致，那个预测本来就不成立了）。
   */
  inviteMembers: async (
    groupId: string,
    userIds: string[],
    message?: string,
  ): Promise<{ results: InviteResult[] }> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds, message }),
    })

    return readEnvelope<{ results: InviteResult[] }>(response, {
      endpoint: 'POST /api/groups/{group_id}/invite',
      fallbackMessage: '邀请成员失败',
      parse: inviteResultsResponse,
    })
  },

  /**
   * 退出群聊
   * POST /api/groups/{group_id}/leave
   * doc:813-832：`data` 是 `SuccessResponse{success,message}`。
   */
  leaveGroup: async (groupId: string, reason?: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/leave`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/leave',
      fallbackMessage: '退出群聊失败',
    })
  },

  /**
   * 移除成员
   * DELETE /api/groups/{group_id}/members/{user_id}
   * doc:844-861：`data` 是 `SuccessResponse{success,message}`。
   */
  removeMember: async (groupId: string, userId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/members/${userId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}/members/{user_id}',
      fallbackMessage: '移除成员失败',
    })
  },

  // ==========================================
  // 角色管理
  // ==========================================

  /**
   * 转让群主
   * POST /api/groups/{group_id}/transfer
   * doc:884-903：`data` 是 `SuccessResponse{success,message}`。
   */
  transferOwner: async (groupId: string, newOwnerId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/transfer',
      fallbackMessage: '转让群主失败',
    })
  },

  /**
   * 设置管理员
   * POST /api/groups/{group_id}/admins
   * doc:920-939：`data` 是 `SuccessResponse{success,message}`。
   */
  setAdmin: async (groupId: string, userId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/admins`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/admins',
      fallbackMessage: '设置管理员失败',
    })
  },

  /**
   * 取消管理员
   * DELETE /api/groups/{group_id}/admins/{user_id}
   * doc:949-966：`data` 是 `SuccessResponse{success,message}`。
   */
  removeAdmin: async (groupId: string, userId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/admins/${userId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}/admins/{user_id}',
      fallbackMessage: '取消管理员失败',
    })
  },

  // ==========================================
  // 禁言管理
  // ==========================================

  /**
   * 禁言成员
   * POST /api/groups/{group_id}/mute
   *
   * 与其它「档 A」端点不同：doc:1000-1008 的 `data` 除 `SuccessResponse` 外还带
   * `muted_until`，类型声明必有这个字段、目前零消费方——降级成 void 需要连类型
   * 一起改，成本高于一行 parse，所以保留返回值并校验它。
   */
  muteMember: async (groupId: string, userId: string, durationMinutes: number): Promise<{
    muted_until: string
  }> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/mute`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, duration_minutes: durationMinutes }),
    })

    return readEnvelope<{ muted_until: string }>(response, {
      endpoint: 'POST /api/groups/{group_id}/mute',
      fallbackMessage: '禁言失败',
      parse: muteMemberResponse,
    })
  },

  /**
   * 解除禁言
   * DELETE /api/groups/{group_id}/mute/{user_id}
   * doc:1019-1036：`data` 是 `SuccessResponse{success,message}`。
   */
  unmuteMember: async (groupId: string, userId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/mute/${userId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}/mute/{user_id}',
      fallbackMessage: '解除禁言失败',
    })
  },

  // ==========================================
  // 入群申请
  // ==========================================

  /**
   * 申请入群（扫码 / 搜索 / 好友推荐三条来源共用本端点）
   * POST /api/groups/{group_id}/apply
   *
   * 🔴 `source` 是**必填形参**，不是可选项：服务端【有意不给默认值】，
   * 缺失与非法取值一律 `400`（doc:1049-1062）。理由在文档里写死了——三个
   * `allow_join_via_*` 开关的全部意义就是按来源分流，给任何默认值都等于开了
   * 一条绕过开关的路。放在第二个形参位（而不是可选的第三个）就是为了让
   * 漏传变成编译错误：旧签名 `(groupId, message?)` 一个字都不发 `source`，
   * 而 `JSON.stringify` 收 any，typecheck 阶段毫无信号。
   *
   * `message` 为空时**不发这个键**：`JSON.stringify({message: undefined})`
   * 得到的是 `{}`，看着没问题，但把"用户没写附言"和"发了一个空附言"混成
   * 一件事；显式不发更贴近文档里 `message?` 的可选语义。
   *
   * 返回 `{status, message}`：`status` 是「本次到底进群了没有」的唯一判据
   * （doc:1131），调用点必须按它分支。403 的响应体只有通用文案「权限不足」
   * （doc:1093-1099），所以"这条路被群主关了"**只能靠状态码 + 本次传的
   * `source`** 判定，不要 match 消息体字符串——那部分是调用点的事。
   */
  applyToJoin: async (
    groupId: string,
    source: JoinSource,
    message?: string,
  ): Promise<ApplyJoinResult> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/apply`, {
      method: 'POST',
      body: JSON.stringify(message ? { source, message } : { source }),
    })

    return readEnvelope<ApplyJoinResult>(response, {
      endpoint: 'POST /api/groups/{group_id}/apply',
      fallbackMessage: '申请入群失败',
      parse: applyJoinResponse,
    })
  },

  /**
   * 获取收到的邀请
   * GET /api/groups/invitations
   *
   * doc:1146-1170：`data` 是对象，数组挂在 `invitations` 字段上（与 `getMyGroups`
   * 「`data` 本身就是数组」不同形——同一模块两种形状并存，不能"统一处理"）。
   */
  getInvitations: async (): Promise<GroupInvitation[]> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/invitations`, {
      method: 'GET',
    })

    const rows = await readEnvelopeList<GroupInvitation>(response, {
      endpoint: 'GET /api/groups/invitations',
      field: 'invitations',
      fallbackMessage: '获取邀请失败',
    })

    return rows.map((invitation) => ({
      ...invitation,
      group_avatar_url: absoluteAvatar(invitation.group_avatar_url),
      inviter_avatar_url: absoluteAvatar(invitation.inviter_avatar_url),
    }))
  },

  /**
   * 接受邀请
   * POST /api/groups/invitations/{request_id}/accept
   *
   * 🔴 accept 成功**不等于**入群：结局由被邀请群的 `join_approval_required`
   * 决定（doc:1194-1203）——关着就直接进群，开着就只是把 `user_accepted`
   * 置真、继续在待审队列里等审批人。两种结局 HTTP 全是 200、信封 `success`
   * 全是 `true`、内层 `data.success` 也全是 `true`，**唯一区别在 `data.message`**，
   * 而 doc:1202-1203 明写不要解析文案，要重新拉 `GET /api/groups/my` 确认。
   *
   * 旧代码声明 `Promise<void>` 且只看 `!response.ok`，调用点于是无条件弹
   * 「已加入群聊」——在开了审核的群里这句话与事实相反。这里返回整个
   * `data`（形状校验过）让"读到了什么"可被断言，但**判据仍在调用点的复核**：
   * 见 `GroupList.handleAcceptInvite`。
   *
   * 另有一条 403：存量 `member_invite` 邀请在群主关掉 `allow_join_via_referral`
   * 之后不可 accept（doc:749-751 的 ⚠️、doc:1097-1099）。它由 `readEnvelope`
   * 抛成带 `status` 的 `ApiError`，本文件的 `fetchWithAuth` 只对 401 做刷新/
   * 登出，403 原样穿透，不会把"这条邀请失效了"变成一次静默登出。
   */
  acceptInvitation: async (requestId: string): Promise<AcceptInvitationResult> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/invitations/${requestId}/accept`, {
      method: 'POST',
    })

    return readEnvelope<AcceptInvitationResult>(response, {
      endpoint: 'POST /api/groups/invitations/{request_id}/accept',
      fallbackMessage: '接受邀请失败',
      parse: acceptInvitationResponse,
    })
  },

  /**
   * 拒绝邀请
   * POST /api/groups/invitations/{request_id}/decline
   * doc:1236-1247：连响应样例都没有，`assertEnvelopeOk` 不要求 `data`，够用。
   */
  declineInvitation: async (requestId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/invitations/${requestId}/decline`, {
      method: 'POST',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/invitations/{request_id}/decline',
      fallbackMessage: '拒绝邀请失败',
    })
  },

  /**
   * 获取待处理申请（有审批权者：群主恒可，管理员看 `admin_can_approve`）
   * GET /api/groups/{group_id}/requests
   *
   * 删掉的是 `result.data || []`：它对「`data` 是数组」「`data` 是
   * `{requests:[…]}`」「`data` 是 `{}`」三种形状**都**返回真值，形状漂移会
   * 变成一句「暂无加入申请」；同时 HTTP 200 + 信封 `success:false` 也会被
   * 当成空列表。现在两种真实形状之外一律抛 `ApiShapeError`（容器与行内的
   * 严格程度为何不同，见 {@link joinRequestsResponse}）。
   *
   * 403（`admin_can_approve=false` 时的管理员，doc:1255-1256、doc:1871）
   * 现在抛带 `status` 的 `ApiError` 而不是变成空列表——调用点
   * `GroupManagement.loadJoinRequests` 已经把它渲染成失败态（批 3），
   * 「群里没人申请」和「你没有审批权」在屏幕上不再是同一句话。
   */
  getJoinRequests: async (groupId: string): Promise<JoinRequest[]> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/requests`, {
      method: 'GET',
    })

    return readEnvelope<JoinRequest[]>(response, {
      endpoint: 'GET /api/groups/{group_id}/requests',
      fallbackMessage: '获取申请失败',
      parse: joinRequestsResponse,
    })
  },

  /**
   * 同意申请
   * POST /api/groups/{group_id}/requests/{request_id}/approve
   *
   * doc:1290-1298：连响应样例都没有。403（`admin_can_approve=false` 时管理员
   * 无权批准）的文案是通用「权限不足」，调用点只能按状态码分诊，不能 match 文案
   * ——那部分是 `GroupManagement.tsx` 的改动，这里只负责把信封拆对。
   */
  approveJoinRequest: async (groupId: string, requestId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/requests/${requestId}/approve`, {
      method: 'POST',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/requests/{request_id}/approve',
      fallbackMessage: '同意申请失败',
    })
  },

  /**
   * 拒绝申请
   * POST /api/groups/{group_id}/requests/{request_id}/reject
   * doc:1302-1326：连响应样例都没有，同上 403 分诊逻辑在调用点处理。
   */
  rejectJoinRequest: async (groupId: string, requestId: string, reason?: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'POST /api/groups/{group_id}/requests/{request_id}/reject',
      fallbackMessage: '拒绝申请失败',
    })
  },

  // ==========================================
  // 群公告
  // ==========================================

  /**
   * 发布公告
   * POST /api/groups/{group_id}/notices
   *
   * 旧代码 `return result.data` 在 body 没有 `data` 时会 resolve 成 `undefined`
   * 而不是抛错——`createNoticeResponse` 逐字段校验，拿不到 `id`/`published_at`
   * 就抛。不用 `require`：它认 `null` 为「存在」。
   */
  createNotice: async (groupId: string, data: {
    title: string
    content: string
    is_pinned?: boolean
  }): Promise<{ id: string; published_at: string }> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

    return readEnvelope<{ id: string; published_at: string }>(response, {
      endpoint: 'POST /api/groups/{group_id}/notices',
      fallbackMessage: '发布公告失败',
      parse: createNoticeResponse,
    })
  },

  /**
   * 获取公告列表
   * GET /api/groups/{group_id}/notices
   *
   * doc:1416-1444：`data` 是对象，数组挂在 `notices` 字段上——与 `getMyGroups`
   * 「`data` 本身就是数组」是同一模块内两种并存的形状，不能统一处理。
   */
  getNotices: async (groupId: string): Promise<GroupNotice[]> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices`, {
      method: 'GET',
    })

    return readEnvelopeList<GroupNotice>(response, {
      endpoint: 'GET /api/groups/{group_id}/notices',
      field: 'notices',
      fallbackMessage: '获取公告失败',
    })
  },

  /**
   * 更新公告
   * PUT /api/groups/{group_id}/notices/{notice_id}
   * doc:1448-1475：连响应样例都没有，`assertEnvelopeOk` 不要求 `data`。
   */
  updateNotice: async (groupId: string, noticeId: string, data: {
    title?: string
    content?: string
    is_pinned?: boolean
  }): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices/${noticeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

    await assertEnvelopeOk(response, {
      endpoint: 'PUT /api/groups/{group_id}/notices/{notice_id}',
      fallbackMessage: '更新公告失败',
    })
  },

  /**
   * 删除公告
   * DELETE /api/groups/{group_id}/notices/{notice_id}
   * doc:1479-1493：连响应样例都没有，`assertEnvelopeOk` 不要求 `data`。
   */
  deleteNotice: async (groupId: string, noticeId: string): Promise<void> => {
    const response = await fetchWithAuth(`${GROUPS_BASE_URL}/${groupId}/notices/${noticeId}`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/groups/{group_id}/notices/{notice_id}',
      fallbackMessage: '删除公告失败',
    })
  },
}
