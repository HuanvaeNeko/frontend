import { getApiBaseUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { isBusiness401Request } from '@/api/apiClient'
import { storageApi, type AvatarUploadProgress, type AvatarUploadResult } from '@/api/storage'
import { useAuthStore } from '@/features/auth/store/authStore'
import { assertEnvelopeOk, readEnvelope, type Parser } from '@/lib/apiEnvelope'
import { asRecord, bool, describe as describeValue, str } from '@/lib/apiParse'
import { ROUTES } from '@/lib/routes'

const PROFILE_BASE_URL = `${getApiBaseUrl()}/api/profile`

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
  
  // 检查 Token 是否即将过期，如果是则刷新
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

  // 如果 Token 过期，尝试刷新后重试一次。
  //
  // ⚠️ **业务 401 的端点不进这个分支**：`PUT /api/profile/password` 的「旧密码错误」
  // 也是 401（backend-docs/profile/个人资料管理.md:329-333，:345 复述），它不是会话
  // 失效。当成会话失效处理的后果，正是这一层要消灭的形态：轮换掉一对 token +
  // 把同一个错误密码原样重发一遍（可能撞上后端的失败计数）+ 刷新失败时
  // `clearAuth()` + 跳登录页，而用户只是打错了一次当前密码。
  //
  // 判定表在 `apiClient.ts` 的 `BUSINESS_401_ENDPOINTS`，这里**只调不抄**
  // （`isBusiness401Request`）——全仓库现在有十处 `fetchWithAuth` 定义（九份模块
  // 副本 + apiClient 导出的那份），合并之后接手的那份照样调这一个函数即可。
  //
  // 代价写明：这类端点上**真的**会话失效不再自动刷新重试，用户会看到一条可见的
  // 失败提示、重试一次即可（进门处的临期预刷新仍然有效，覆盖了绝大多数过期）。
  // 可见的错误可恢复，无解释的登出不可恢复。
  if (response.status === 401 && authStore.refreshToken && !isBusiness401Request(options.method, url)) {
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

/** `friend_request_policy` / `group_invite_policy` 的三档取值（doc:146-147、:156）。 */
export const PROFILE_POLICIES = ['manual', 'auto_accept', 'auto_reject'] as const
export type ProfilePolicy = (typeof PROFILE_POLICIES)[number]

/** `gender` 的三档取值（doc:148、:157，非法值后端 400）。 */
export const PROFILE_GENDERS = ['male', 'female', 'other'] as const
export type ProfileGender = (typeof PROFILE_GENDERS)[number]

/**
 * `GET /api/profile` 的 `data`——字段表逐条对应 `个人资料管理.md:92-109`。
 *
 * 本批之前这里只声明了 8 个字段，字段表里有 16 个。缺的那 8 个不是装饰：
 * 其中四个（`allow_search` / `search_visible_by_id` / `friend_request_policy` /
 * `group_invite_policy`）是用户**唯一**能表达"不想被搜到 / 不想被随便加"的手段，
 * 而在本批之前，前端既读不到也写不了它们。
 *
 * ## `admin` 是字符串 `"true"` / `"false"`，不是布尔
 *
 * 字段表 doc:103 逐字写着「是否管理员 ("true"/"false")」。
 * ⚠️ **不要写 `if (profile.admin)`**：`"false"` 是非空字符串，恒为真，
 * 每一个普通用户都会被当成管理员。两个渲染点用的都是
 * `profile.admin === 'true'`（`ProfilePage` 的「账户类型」行、`ProfileModal`
 * 的 `AccountSettings`），除此之外全仓没有别的消费点——`grep isAdmin` 命中的
 * 是群成员角色逻辑，与本字段无关。
 */
export interface UserProfile {
  user_id: string
  user_nickname: string
  user_email: string | null
  user_signature: string | null
  /** 相对路径，已在 {@link absoluteAvatar} 补基址（doc:98）。 */
  user_avatar_url: string | null
  /** 资料背景图，相对路径，同样已补基址；`null` = 默认封面（doc:99）。P5 消费。 */
  background_url: string | null
  /** `male` / `female` / `other`，`null` = 未设置（doc:100）。见下方宽松解析的理由。 */
  gender: string | null
  /** ISO 日期 `YYYY-MM-DD`，`null` = 未设置（doc:101）。 */
  birthday: string | null
  /** 地区自由文本，`null` = 未设置（doc:102）。 */
  region: string | null
  /** `"true"` / `"false"`，**不是布尔**——见本接口的 JSDoc。 */
  admin: string
  /** 搜索总开关：`false` = 完全不可被搜索/添加（doc:104）。 */
  allow_search: boolean
  /** 是否允许通过用户 ID/用户名被搜索添加（doc:105）。 */
  search_visible_by_id: boolean
  /** 好友申请默认处理策略（doc:106）。 */
  friend_request_policy: ProfilePolicy
  /** 群邀请默认处理策略（doc:107）。 */
  group_invite_policy: ProfilePolicy
  created_at: string
  updated_at: string
}

/**
 * `PUT /api/profile` 的请求体（doc:123-134 的 TS 声明 + doc:139-150 的字段表）。
 *
 * 十个字段**全部可选**，而且这是**部分更新**：doc:162-200 的四个请求示例分别只带
 * 一个 / 三个字段，缺席的字段保持原值。本批之前这里只声明了三个，另外七个被
 * `updateProfile` 的 if 链默默丢掉——用户在设置面板里改什么都发不出去。
 */
export interface UpdateProfileRequest {
  nickname?: string
  email?: string
  signature?: string
  allow_search?: boolean
  search_visible_by_id?: boolean
  friend_request_policy?: ProfilePolicy
  group_invite_policy?: ProfilePolicy
  gender?: ProfileGender
  birthday?: string
  region?: string
}

export interface ChangePasswordRequest {
  old_password: string
  new_password: string
}

/**
 * 头像相对路径 → 绝对地址，只在 api 模块出口做一次。与 `groups.ts` / `friends.ts` /
 * `discovery.ts` 里同名的 `absoluteAvatar` 逐字同型，按那三处的理由各自定义一份。
 *
 * **这是必需的，不是防御性的。** `user_avatar_url` 后端给的是**相对路径**
 * （`个人资料管理.md:98`「头像相对路径（需拼接 `STORAGE_BASE_URL`）」，:74 的样例
 * 是 `"avatars/testuser001.jpg?t=1706000000"`）。原样交给
 * `<AvatarImage src="avatars/….png?t=1">`，Radix 会按相对 URL 的规则以**当前页面地址**
 * 为基准解析，把请求打到前端自己的源上并 404。整个 profile 模块此前一处都没补基址
 * （`git grep toAbsoluteApiUrl b873fef -- src/features/profile/` 为空）。
 *
 * `null` 与空串一并归一为 `null`（= 没有头像）：`toAbsoluteApiUrl` 对 null / 空串
 * 返回 `undefined`，这里 `?? null` 只是把它换回本 DTO 声明的 `null`，不是兜底掩盖缺失。
 */
const absoluteAvatar = (path: string | null): string | null => toAbsoluteApiUrl(path) ?? null

// ============================================
// 响应解析
// ============================================

/**
 * `GET /api/profile` 的「可能仍是裸响应」豁免。照搬 `authStore` 的
 * `AUTH_TOKEN_LEGACY_BARE`（同样的 `{until, reason}` 形状、同样的理由结构）。
 *
 * ## 为什么这一处不能像别的端点那样直接上严格 `readEnvelope`
 *
 * **形状在这台机器上没法实测**：`api.huanvae.cn` 被 ICP 拦截，无 SNI 那条路要
 * 客户端证书，没有人能对它 curl 一次。而文档在**这个端点上**自相矛盾：
 * - §1「获取个人信息」的响应样例（`个人资料管理.md:68-87`）只有一个 `data` 键，
 *   既没有 `success` 也没有 `code`；
 * - §3「获取他人公开资料」的响应样例（同文件 :240-254）是完整的
 *   `{"success": true, "code": 200, "data": {...}}`。
 *
 * 三种候选形状（裸 DTO / 只有 data / 完整信封）里，被替掉的 `data.data || data`
 * 三种都能歪打正着，而严格 `readEnvelope` 只对后两种成立。所以这里显式承认
 * 裸响应也可能出现——但走 `legacyBare` 而不是 `?? body`：命中裸分支时
 * **每次都打 `console.warn`**，`grep legacyBare` 就能把全部欠账列出来，
 * 而 `{success:true, data:null}` 仍然照抛不误。
 *
 * ⚠️ 理由写的是「后端不可达、无法实测」，**不是**「文档说它是裸的」——
 * 文档没这么说，它只是两节各写了一种。写清楚这一点，是因为清理动作取决于
 * 到底哪种情况：能连上后端的人跑一次
 *   curl -s https://api.huanvae.cn/api/profile -H 'Authorization: Bearer <AT>' | jq 'keys'
 * 输出 `["code","data","success"]` 即确认信封，删掉本常量的使用点即可。
 */
const PROFILE_LEGACY_BARE = {
  until: '2026-12-31',
  reason:
    '后端在本机不可达（api.huanvae.cn 被 ICP 拦截、无 SNI 路径需客户端证书），形状无法实测；' +
    '文档 :68-87（§1，只有 data 键）与 :240-254（§3，完整 success/code/data）本身也不一致',
} as const

/**
 * 文档写明 `string | null`、但空串同样是后端存得下的合法值的字段。
 *
 * 不能直接用 `apiParse` 的 `nullableStr`：它把 `''` 判成"缺失"并抛错。而写侧对
 * 空串是放行的——文档自己的参考实现把三个输入框的 `.value` 原样发出去
 * （`个人资料管理.md:609`、:610、:615），空输入框就是 `""`，文档也从没说空串会被
 * 拒。于是「用户清空了签名」这种完全正常的账号，会在读侧把整个资料页炸掉。
 * `''` 与 `null` 一并归一成 `null`（= 未设置），其余非字符串照抛。
 *
 * 同族做法见 `groups.ts` 的 `emptyableStr`（那里 `''` 直接出现在文档样例里）。
 */
function emptyableStr(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new Error(`${key} 应为字符串或 null，实际是 ${describeValue(value)}`)
  }
  return value === '' ? null : value
}

/**
 * **本批还没有消费者**的可空字符串字段：`background_url` / `gender` / `birthday`
 * / `region`。缺席或类型不对时 `console.warn` 一次并按 `null` 处理，**不抛**。
 *
 * ## 为什么这四个不走严格档
 *
 * groups 那一批已经踩过：一个**被严格解析、却没有任何消费者**的字段，在后端某天
 * 改名/下线时会把整个请求打成形状错误——付出的代价是所有人都打不开资料页，
 * 换来的收益是零（没人读它）。reviewer 把那个当成真缺陷提了，那一批定下的规矩是
 * **「谁消费哪一段，谁校验哪一段」**。
 *
 * 所以本文件里两档并存，界线就是"本批有没有接上消费者"：
 * - `allow_search` / `search_visible_by_id` / 两个 `*_policy` → **严格**
 *   （`bool()` / {@link policyOf} 会抛）。本批把它们接进了设置页的隐私区，
 *   少一个字段就意味着面板上有个开关被渲染成它实际不是的状态——那比抛错难查得多，
 *   而且错的方向恰好是"看起来不可被搜索、实际可以"。
 * - 这四个 → **宽松**。`background_url` 由 P5 消费，届时它变成"被消费的一段"，
 *   应当跟着升到严格档并补测试。
 *
 * 宽松 ≠ 静默：**每一次**命中都打一条带端点名和字段名的 warn，所以漂移是可见的、
 * 可归因的，只是不再有能力让所有人打不开资料页。
 */
function unconsumedNullableStr(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (typeof value === 'string') return value === '' ? null : value
  if (value !== null) {
    console.warn(
      `[profile] GET /api/profile: ${key} ${
        value === undefined ? '缺失' : `不是字符串或 null（实际是 ${describeValue(value)}）`
      }，本批无消费方，按 null 处理；P5 接入 background_url 时应升为严格校验`,
    )
  }
  return null
}

/** 三档策略枚举，取值不对就抛（doc:156「否则返回 400（service 层校验）」）。 */
function policyOf(payload: Record<string, unknown>, key: string): ProfilePolicy {
  const value = str(payload, key)
  if (!(PROFILE_POLICIES as readonly string[]).includes(value)) {
    throw new Error(`${key} 取值 "${value}" 不在 ${PROFILE_POLICIES.join(' / ')} 之内`)
  }
  return value as ProfilePolicy
}

/**
 * `GET /api/profile` 的 `data` → {@link UserProfile}（字段表 doc:92-109）。
 *
 * 用 `parse` 而不是 `require`：`require` 的判定是"键存在且不为 undefined"，
 * **`null` 算存在**（`apiEnvelope.ts` 的 `EnvelopeOptions.require` 有说明），
 * 而 `allow_search: null` 放行之后，`Switch checked={null}` 渲染出来的是"关"——
 * 一个真正开着的搜索开关在面板上显示成关着的，正是本层要消灭的形态。
 */
const profileResponse: Parser<UserProfile> = {
  parse(input: unknown): UserProfile {
    const payload = asRecord(input, 'GET /api/profile 的 data')
    return {
      user_id: str(payload, 'user_id'),
      user_nickname: str(payload, 'user_nickname'),
      user_email: emptyableStr(payload, 'user_email'),
      user_signature: emptyableStr(payload, 'user_signature'),
      user_avatar_url: absoluteAvatar(emptyableStr(payload, 'user_avatar_url')),
      // 与头像同一列数据、同一句「需拼接 STORAGE_BASE_URL」（doc:99）。P5 只负责
      // 上传/删除那两个端点；补基址属于"读这个字段"的一部分，留到 P5 等于先埋一遍
      // P2 已经修过的 404。
      background_url: absoluteAvatar(unconsumedNullableStr(payload, 'background_url')),
      gender: unconsumedNullableStr(payload, 'gender'),
      birthday: unconsumedNullableStr(payload, 'birthday'),
      region: unconsumedNullableStr(payload, 'region'),
      admin: str(payload, 'admin'),
      allow_search: bool(payload, 'allow_search'),
      search_visible_by_id: bool(payload, 'search_visible_by_id'),
      friend_request_policy: policyOf(payload, 'friend_request_policy'),
      group_invite_policy: policyOf(payload, 'group_invite_policy'),
      created_at: str(payload, 'created_at'),
      updated_at: str(payload, 'updated_at'),
    }
  },
}

// ============================================
// 写侧的规则（两个 UI 共用同一份，不各写一份）
// ============================================

/** `PUT /api/profile` 认的十个字段，顺序与 doc:139-150 的字段表一致。 */
const UPDATABLE_PROFILE_FIELDS = [
  'nickname',
  'email',
  'signature',
  'allow_search',
  'search_visible_by_id',
  'friend_request_policy',
  'group_invite_policy',
  'gender',
  'birthday',
  'region',
] as const

/** doc:305-306：`old_password` ≥ 6，`new_password` 6-100。 */
export const PASSWORD_LIMITS = { oldMin: 6, newMin: 6, newMax: 100 } as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 请求体的本地校验，doc:152-160 的「验证规则」逐条。
 *
 * 与 `uploadAvatar` 的大小/格式检查同一性质：真正的闸在后端，这里只省一次注定
 * 失败的往返，并且把提示写成中文（后端返回的是
 * `Validation error: nickname: ...` 这种英文串）。
 *
 * 唯独 `email` 的格式不在这里判——「有效邮箱格式」没有可照抄的判据，自己写一个
 * 正则只会出现"前端说不合法、后端其实收"或反过来的第三种口径。输入框是
 * `type="email"`，格式由后端定论，400 文案原样透出。
 */
function assertValidUpdate(body: Record<string, unknown>): void {
  const nickname = body.nickname
  if (typeof nickname === 'string' && (nickname.length < 1 || nickname.length > 50)) {
    throw new Error('昵称长度需为 1-50 个字符')
  }
  const signature = body.signature
  if (typeof signature === 'string' && signature.length > 200) {
    throw new Error('个性签名最长 200 个字符')
  }
  const region = body.region
  if (typeof region === 'string' && region.length > 100) {
    throw new Error('地区最长 100 个字符')
  }
  const gender = body.gender
  if (gender !== undefined && !(PROFILE_GENDERS as readonly unknown[]).includes(gender)) {
    throw new Error(`性别取值须为 ${PROFILE_GENDERS.join(' / ')}`)
  }
  for (const key of ['friend_request_policy', 'group_invite_policy'] as const) {
    const value = body[key]
    if (value !== undefined && !(PROFILE_POLICIES as readonly unknown[]).includes(value)) {
      throw new Error(`${key} 取值须为 ${PROFILE_POLICIES.join(' / ')}`)
    }
  }
  const birthday = body.birthday
  if (typeof birthday === 'string' && birthday !== '' && !ISO_DATE.test(birthday)) {
    throw new Error('生日须为 ISO 日期格式 YYYY-MM-DD')
  }
}

/**
 * 把表单当前值与已加载的资料对照，只挑出**真的被改过**的字段。
 *
 * 两个 UI 此前都是无条件发 `{email, signature}`：一次"只改签名"的保存会把邮箱
 * 一起重写一遍，而 `profile.user_email || ''` 会让没有邮箱的账号发出
 * `email: ""`。部分更新的语义是"缺席 = 保持原值"（doc:162-200 的四个示例），
 * 所以正确的做法是**不发没碰过的字段**，而不是去猜后端收不收空串。
 *
 * ⚠️ 用户**主动清空**某一格时，这里照样会把 `""` 发出去，这是对的：
 * reviewer 已经确认文档没有任何一处说空串被拒，文档自己的参考实现
 * （:592、:609、:615）做的正是"读输入框原值直接发"。清空是一个意图，
 * 与"没碰过"必须能分开——这正是本函数在做的事。
 *
 * `current` 为 `null`（资料还没加载出来）时返回空对象：没有对照物就谈不上"改过"，
 * 凭空把整张表单发出去等于用一份可能是空的表单覆盖真实资料。
 */
export function pickProfileEdits(
  current: UserProfile | null,
  form: { nickname: string; email: string; signature: string },
): UpdateProfileRequest {
  if (!current) return {}
  const edits: UpdateProfileRequest = {}
  if (form.nickname !== current.user_nickname) edits.nickname = form.nickname
  if (form.email !== (current.user_email ?? '')) edits.email = form.email
  if (form.signature !== (current.user_signature ?? '')) edits.signature = form.signature
  return edits
}

// ============================================
// API 方法
// ============================================

/**
 * ## 本模块的失败为什么抛 `ApiError` 而不是裸 `Error`
 *
 * 本批只做一件事：**把真实 HTTP 状态码带上**。
 *
 * `apiClient.isAuthError` 原来是靠关键词子串匹配 message 来决定要不要静默
 * 跳登录页的，于是 `PUT /api/profile` 的校验文案
 * `"Validation error: email: Invalid email format"`
 * （`backend-docs/profile/个人资料管理.md:213`，逐字）因为含 `invalid`
 * 被判成会话失效。收窄那个分类器的前提，是它能拿到状态码去判——
 * 本模块是仅剩的、抛裸 `Error` 的调用方，所以这三处必须一起改，
 * 否则收窄之后 profile 的**真 401 会一起漏判**（那才是回归）。
 *
 * **本批把响应体的读法一并迁完了**：`data.data || data` 换成 {@link readEnvelope}
 * + {@link PROFILE_LEGACY_BARE}，两个 PUT 换成 {@link assertEnvelopeOk}。
 * 错误文案的取法（`message → error → details → HTTP 片段`）由解包层统一，
 * 三处手写的 `error.message || error.error` 一并删除。
 *
 * 状态码与端点串一个都没变：解包层抛的同样是带 `status` / `endpoint` 的
 * `ApiError`，`isAuthError` 的状态码档与 `BUSINESS_401_ENDPOINTS` 的
 * `PUT /api/profile/password` 那一条继续成立（有用例逐条盯着）。
 *
 * `ApiError extends Error`，所以 `error instanceof Error`、`error.message`
 * 的既有调用点行为不变。
 */
export const profileApi = {
  /**
   * 获取个人信息
   * GET /api/profile
   *
   * 16 个字段逐个走 {@link profileResponse} 校验（严格/宽松两档的界线见
   * {@link unconsumedNullableStr}）。`legacyBare` 的理由见
   * {@link PROFILE_LEGACY_BARE}——它是本批唯一一处**承认自己不确定**的地方，
   * 命中即 warn，不会烂在代码里。
   */
  getProfile: async (): Promise<UserProfile> => {
    console.log('👤 获取个人资料')
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}`, {
      method: 'GET',
    })

    return readEnvelope<UserProfile>(response, {
      endpoint: 'GET /api/profile',
      fallbackMessage: '获取个人资料失败',
      parse: profileResponse,
      legacyBare: PROFILE_LEGACY_BARE,
    })
  },

  /**
   * 更新个人信息
   * PUT /api/profile
   * 请求体：十个字段任选，缺席 = 保持原值（doc:123-134、:162-200）
   *
   * ## 为什么是 `assertEnvelopeOk` 而不是 `readEnvelope` + `legacyBare`
   *
   * 这个端点**没有 `data` 可解**：成功响应逐字是 `{"message": "Profile updated
   * successfully"}`（doc:203-208），整个响应体只有一句文案。信封化与否在这里
   * 是**观察不到的差别**（`{message}` 与 `{success,code,data:null,message}`
   * 对"成功了没有"这个唯一的问题给出同一个答案），所以这里既不需要
   * `legacyBare`，也不该假装需要——`legacyBare` 记的是**真实的**欠账，
   * 挂一条永远不可能被清掉的在上面，只会让 `grep legacyBare` 的结果贬值。
   *
   * ## 那句 `message` 为什么不往上传
   *
   * 它是英文（`"Profile updated successfully"`），而两个调用点弹的是中文 toast。
   * 把后端原文透出去，用户会在中文界面里看到一句英文——这与"失败时透出后端原文"
   * 不同：失败文案带的是**这次为什么失败**的信息（`Validation error: email: ...`），
   * 无可替代；成功文案不带任何信息，替换成中文没有损失。所以返回值定为 `void`：
   * 留一个没人读的 `{message}` 才是"看起来像忘了接"的形态。
   */
  updateProfile: async (updates: UpdateProfileRequest): Promise<void> => {
    console.log('✏️ 更新个人资料:', updates)

    const body: Record<string, unknown> = {}
    for (const key of UPDATABLE_PROFILE_FIELDS) {
      const value = updates[key]
      if (value !== undefined) body[key] = value
    }

    // doc:160「至少提供一个字段」。空体的后端答复是一句和字段校验失败长得一样的
    // 400，用户看到"更新失败"却不知道自己什么都没改——就地拦下，说人话。
    if (Object.keys(body).length === 0) {
      throw new Error('没有需要保存的修改')
    }
    assertValidUpdate(body)

    const response = await fetchWithAuth(`${PROFILE_BASE_URL}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })

    // 400 校验失败走这里，文案例如
    // `Validation error: email: Invalid email format`（文档 :213）。
    // 带上 400 之后，`isAuthError` 在状态码档就地判假，不会再去看这句话里
    // 有没有 `invalid`。
    await assertEnvelopeOk(response, {
      endpoint: 'PUT /api/profile',
      fallbackMessage: '更新个人资料失败',
    })
    console.log('✅ 个人资料更新成功')
  },

  /**
   * 修改密码
   * PUT /api/profile/password
   * 请求体: { old_password, new_password }
   *
   * 长度在发请求**之前**判一次（doc:305-306：`old_password` ≥ 6、
   * `new_password` 6-100）。此前只有两个组件各自判了一次
   * `newPassword.length < 6`，**上限一处都没有**——粘一个 100 位以上的密码，
   * 要等一次往返回来才知道不行。用 `assertEnvelopeOk` 而不是
   * `readEnvelope` 的理由与 `updateProfile` 逐条相同（成功响应
   * doc:320-325 同样只有一句 `message`）。
   */
  changePassword: async (passwordData: ChangePasswordRequest): Promise<void> => {
    console.log('🔐 修改密码')

    if (passwordData.old_password.length < PASSWORD_LIMITS.oldMin) {
      throw new Error(`当前密码长度至少 ${PASSWORD_LIMITS.oldMin} 位`)
    }
    if (passwordData.new_password.length < PASSWORD_LIMITS.newMin) {
      throw new Error(`新密码长度至少 ${PASSWORD_LIMITS.newMin} 位`)
    }
    if (passwordData.new_password.length > PASSWORD_LIMITS.newMax) {
      throw new Error(`新密码长度最多 ${PASSWORD_LIMITS.newMax} 位`)
    }

    const response = await fetchWithAuth(`${PROFILE_BASE_URL}/password`, {
      method: 'PUT',
      body: JSON.stringify(passwordData),
    })

    // ⚠️ 这个端点的 **401 是业务失败**："旧密码错误"就返回 401，body 为
    // `{"error": "Old password is incorrect"}`（文档 :329-333，:345 复述）。
    //
    // 挡住"打错一次当前密码就被登出"的是**上面 `fetchWithAuth` 的 401 分支**
    // （`!isBusiness401Request(...)`），不是这里的 `endpoint` 字段：401 响应
    // 走到这一行时，刷新与重发已经被跳过了。
    // 这个 `endpoint` 串仍然要与 `apiClient.ts` 的 `BUSINESS_401_ENDPOINTS`
    // 逐字一致——它是 `isAuthError` 那一档的入参，今天没有活的消费者
    // （见该常量注释的「谁真的会读这张表」），但两端不一致会让将来接进
    // store / `safeApiCall` 的人踩回同一个坑。
    await assertEnvelopeOk(response, {
      endpoint: 'PUT /api/profile/password',
      fallbackMessage: '修改密码失败',
    })
    console.log('✅ 密码修改成功')
  },

  /**
   * 上传用户头像 —— 已不再是本模块的一个端点
   *
   * 🔴 `POST /api/profile/avatar`（`multipart/form-data`）于 2026-08-28
   * **删除、无兼容层**，与 `POST /api/profile/background`、
   * `POST /api/groups/{id}/avatar` 同一批（`个人资料管理.md:352-355`）。
   * 本方法此前仍在打它，**每一次头像上传都是 404**。
   *
   * 现在走 storage 的四步预签名分片直传链路（doc:362-369），实现在
   * {@link storageApi.uploadAvatar}——群头像已经在用同一支。留一个本模块的入口，
   * 是因为「用户头像的 `avatar_target` 该填什么」是 profile 模块的知识
   * （同 `groups.ts` 的 `uploadGroupAvatar` 的理由）。
   *
   * ## 与群头像那一档的两处差异（doc:389-390）
   *
   * 1. `avatar_target: 'user_avatar'`；
   * 2. **不传 `related_id`**——`user_avatar` / `user_background` 携带它就是 400，
   *    doc:440 写明「不静默忽略」。`AvatarUploadTarget` 联合的另一支上根本没有
   *    这个键，`buildAvatarUploadPayload` 也不会写出它。键的**有无**由两组
   *    `Object.hasOwn` 断言钉住：`storage.test.ts` 直接调构造函数的那组，
   *    以及本模块 `profile.test.ts` 里截住 `requestAvatarUpload` 入参的那条。
   *    都不能改成读 `JSON.parse(init.body)`——`JSON.stringify` 会丢掉 undefined
   *    值，wire-level 断言对这条约束**恒真**（已实测：把 `related_id: undefined`
   *    加回去，只有这两组变红）。
   *
   * ## 三件跟着变的事
   *
   * - **返回字段改名**：旧响应是 `avatar_url`，现在是 confirm 的 `file_url`
   *   （doc:396-409，形态「逐字相同」：相对路径 + `?t=` 缓存戳，出口已补基址）。
   * - **不要回写**：后端已在 confirm 里把它写进 `users."user-avatar-url"`，
   *   doc:411 明写客户端「**无需**再调 `PUT /api/profile` 回写」。多打那一次
   *   既是无用写入，又会把一次上传的失败面扩大到 profile 的更新端点上。
   * - **10 MB / 格式 / 扩展名检查、单飞、四步顺序、`file_url` 补基址**全在
   *   `storageApi.uploadAvatar` 里，这里不复制。客户端那道大小检查只是省一次
   *   注定失败的往返：真正的闸在后端，且 confirm 会在**合并分片之前**按真实字节
   *   再量一次（doc:444），拒绝时**不碰用户现有的那张头像**。
   *
   * @param onProgress 上传进度，**按字节**报（`percent` 来自 `xhr.upload.onprogress`，
   *   不是"第几片传完了"）。头像档**永远只有 1 片**：分片大小固定 30 MB
   *   （`文件存储管理.md:185`）而头像上限 10 MB（doc:393），doc:668 自己也写着
   *   「头像很小，通常只有 1 片」。所以按分片报进度等于只有 100% 这一个取值，
   *   而且要等字节全部传完才出现——这里刻意不那么做。
   *   不传就是没有进度，链路不受影响。
   * @throws {Error} 超 10 MB / MIME 不在白名单 / 扩展名不在白名单（客户端便利检查）
   * @throws {Error} 同一落点已有上传在飞（单飞拒绝，doc:445 要求客户端防抖/单飞）
   * @throws {ApiError} 后端失败，文案是**后端原文**：`user_id` 以 `group-` 开头的
   *   存量账号是**永久** 400（doc:454，那是群头像 object key 的保留命名空间，
   *   这个账号的头像上传永远不会成功）；409 是会话被接管/已过期
   *   （doc:445、:447-450），用 `isUploadSessionExpired` 分诊，**不要自动重试**。
   */
  uploadAvatar: async (
    file: File,
    onProgress?: (progress: AvatarUploadProgress) => void,
  ): Promise<AvatarUploadResult> => {
    console.log('📸 上传头像:', file.name)

    const result = await storageApi.uploadAvatar(file, { avatar_target: 'user_avatar' }, onProgress)

    console.log('✅ 头像上传成功:', result.file_url)
    return result
  },
}
