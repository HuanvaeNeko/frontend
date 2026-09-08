import { getApiBaseUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { storageApi, type AvatarUploadProgress, type AvatarUploadResult } from '@/api/storage'
import { ApiError, assertEnvelopeOk, readEnvelope, type Parser } from '@/lib/apiEnvelope'
import { asRecord, bool, describe as describeValue, str } from '@/lib/apiParse'
import { fetchWithAuth } from '@/api/authedFetch'

const PROFILE_BASE_URL = `${getApiBaseUrl()}/api/profile`

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
  /**
   * 资料背景图，相对路径，同样已补基址；`null` = 默认封面（doc:99）。
   *
   * P5 把它接上了消费方（`ProfilePage` 的封面区、{@link profileApi.uploadBackground}、
   * {@link profileApi.resetBackground}），因此它**已经从宽松档升到严格档**——
   * 见 {@link unconsumedNullableStr} 的 JSDoc 里写下的那条约定（「`background_url`
   * 由 P5 消费，届时它变成"被消费的一段"，应当跟着升到严格档并补测试」）。
   * 现在它走 {@link emptyableStr}：缺键抛错，`''` 与 `null` 一并归一成 `null`。
   */
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
 * `GET /api/profile/{user_id}/public` 的 `data`（`PublicProfileResponse`，
 * 字段表 `个人资料管理.md:259-269`、样例 :240-254）。
 *
 * 🔴 **刻意不复用 {@link UserProfile}，也不从它派生**：本端点是一个**窄 DTO**，
 * 与自己那份完整资料**不同构**。doc:271-273 逐条列出它**不返回**的东西——
 * `user_email`、`admin`，以及四个隐私/可见性设置（`allow_search` /
 * `search_visible_by_id` / `friend_request_policy` / `group_invite_policy`）。
 * 拿 {@link profileResponse} 去解一份**完全合规**的 `/public` 响应，
 * `bool(payload,'allow_search')` 会当场抛「allow_search 缺失」——把正常响应
 * 判成形状错误。groups 模块的 {@link import('@/features/chat/api/groups').PublicGroupInfo}
 * 是同一形态、同一结论（那里复用 `Group` 会要求三档已被收掉的 scope 字段）。
 *
 * ## ⚠️ 文档在字段集上自相矛盾，这里赌的是哪一边
 *
 * - **四字段说**：正文 :223 逐字「仅返回公开字段（用户 ID、昵称、签名、头像），
 *   **不含**邮箱与隐私/可见性设置」。
 * - **九字段说**：字段表 :259-269 与响应样例 :243-253 **两个独立来源**都给出九个，
 *   多出 `background_url` / `gender` / `birthday` / `region` / `created_at`；
 *   收尾的注意事项 :271-273 也是按九字段口径写的（它列的"不返回"清单里
 *   **没有**这五个，只有 `user_email` / `admin` / 四个隐私设置）。
 *
 * 后端在这台机器上**打不到**（`api.huanvae.cn` 被 ICP 拦截，无 SNI 那条路要客户端
 * 证书），所以这不是一个可以查证的事实，只能是一次**风险取舍**。这里的下注：
 *
 * - **两种读法都保证的那四个** —— `user_id` / `user_nickname` / `user_signature`
 *   / `user_avatar_url` —— 走**严格**档（缺键即 `ApiShapeError`）。它们是这个端点
 *   存在的理由：四个全没有的话，拿到的对象对任何调用点都没有用，静默返回一个
 *   四个 `null` 只是把"这次请求什么都没拿到"藏起来。而且两种读法都保证它们在，
 *   所以严格档在**任何一种**后端读法下都不会误伤。
 * - **只有九字段说保证的那五个** —— `background_url` / `gender` / `birthday` /
 *   `region` / `created_at` —— 走**宽松**档（{@link unconsumedNullableStr}：
 *   每次命中都 warn 并按 `null` 处理，不抛）。若后端按四字段说实现，这五个键根本
 *   不会来，严格档会让**每一次**调用都失败；宽松档则让调用照常成功，同时在控制台
 *   留下五条点名到字段的 warn，漂移是可归因的而不是一次全盘失败。
 *
 * **赌错了会怎样**：如果后端其实按四字段说实现，`created_at` 之类会恒为 `null`，
 * 将来接"注册时间"那一行的人会看到一个空值 + 一条 warn（可 grep），而不是白屏。
 * 反方向——后端按九字段实现而这里把五个都判严格——才是那种"一个正常响应打不开
 * 整个页面"的失败，代价大得多。所以宁可这一侧偏保守。
 *
 * ⚠️ 因此 `created_at` 声明成 `string | null`，尽管字段表 :269 写的是不可空的
 * `string`。类型必须说的是**这一层真的可能返回什么**，不是文档希望它是什么。
 */
export interface PublicProfileResponse {
  user_id: string
  user_nickname: string
  /** 个性签名（doc:263）。`''` 与 `null` 一并归一成 `null`，同 {@link emptyableStr}。 */
  user_signature: string | null
  /** 相对路径，已在 {@link absoluteAvatar} 补基址（doc:264「需拼接 `STORAGE_BASE_URL`」）。 */
  user_avatar_url: string | null
  /** 相对路径，已补基址（doc:265，同一句「需拼接」；`null` = 默认封面）。宽松档。 */
  background_url: string | null
  /** `male` / `female` / `other`，`null` = 未设置（doc:266）。宽松档。 */
  gender: string | null
  /** ISO 日期 `YYYY-MM-DD`，`null` = 未设置（doc:267）。宽松档。 */
  birthday: string | null
  /** 地区自由文本，`null` = 未设置（doc:268）。宽松档。 */
  region: string | null
  /** 注册时间 ISO 8601（doc:269）。宽松档 ⇒ 可能是 `null`，理由见本接口 JSDoc。 */
  created_at: string | null
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
 * ## 放宽的只有 `''`，**缺键仍然算错**
 *
 * 这里曾经写的是 `if (value === null || value === undefined) return null`——
 * 一个连自己的 JSDoc 都不承认的第三档：`user_email` / `user_signature` /
 * `user_avatar_url` 被后端改名或下线时静默解析成 `null`，不抛、不 warn、
 * 不留任何痕迹，而这三个字段 UI **都在读**（两个资料页的邮箱与签名输入框、
 * 三处头像）。本文件只应该有两档，界线写在 {@link unconsumedNullableStr} 上，
 * 而「宽松」那一档的定义是**每次命中都 warn**（同处：「宽松 ≠ 静默」）。
 *
 * 空串是文档给出的合法取值（上面那三行引用），缺键不是：字段表 doc:96-98 把这
 * 三个和 `user_id` 一样无条件列出。房规同 `apiParse.nullableStr`（`=== null`
 * 之外一律交给 `str()`，缺键照抛）与 `groups.ts` 的同名 `emptyableStr`
 * （`undefined` 落进 `typeof !== 'string'` 那一支抛错）。
 */
function emptyableStr(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new Error(
      `${key} 应为字符串或 null，实际是 ${value === undefined ? '缺失' : describeValue(value)}`,
    )
  }
  return value === '' ? null : value
}

/**
 * 宽松档的**唯一**实现：缺席或类型不对时 `console.warn` 一次并按 `null` 处理，**不抛**。
 *
 * ## 本文件为什么恰好有两档
 *
 * groups 那一批已经踩过：一个**被严格解析、却没有任何消费者**的字段，在后端某天
 * 改名/下线时会把整个请求打成形状错误——付出的代价是所有人都打不开资料页，
 * 换来的收益是零（没人读它）。reviewer 把那个当成真缺陷提了，那一批定下的规矩是
 * **「谁消费哪一段，谁校验哪一段」**。
 *
 * 所以本文件里两档并存，**没有第三档**：曾经存在过的"缺键静默返回 null"那一支
 * 已经被删掉（见 {@link emptyableStr} 的同名段落），因为它连自己的 JSDoc 都不承认。
 * **宽松 ≠ 静默**：每一次命中都打一条带**端点名 + 字段名**的 warn，所以漂移是可见的、
 * 可归因的、可 grep 的，只是不再有能力让所有人打不开一个页面。
 *
 * ## 两个调用点各自的理由不同，所以 `context.reason` 必须由调用点写
 *
 * - `GET /api/profile` 的 `gender` / `birthday` / `region`：**本仓还没有消费方**。
 *   （`background_url` 曾经也在这一档，P5 把它接上了封面区，已按此处约定升到
 *   {@link emptyableStr} 的严格档并补了用例。）
 * - `GET /api/profile/{user_id}/public` 的五个字段：**文档自相矛盾**，
 *   :223 的正文说四字段、:259-269 的字段表与 :243-253 的样例说九字段，
 *   而后端在本机不可达、无从实测。理由与取舍写在 {@link PublicProfileResponse} 上。
 *
 * 严格档在同一文件里的对照是 `bool()` / {@link policyOf} / {@link emptyableStr}：
 * 四个隐私字段少一个就意味着设置面板上有个开关被渲染成它实际不是的状态——
 * 那比抛错难查得多，而且错的方向恰好是"看起来不可被搜索、实际可以"。
 */
function unconsumedNullableStr(
  payload: Record<string, unknown>,
  key: string,
  context: { endpoint: string; reason: string },
): string | null {
  const value = payload[key]
  if (typeof value === 'string') return value === '' ? null : value
  if (value !== null) {
    console.warn(
      `[profile] ${context.endpoint}: ${key} ${
        value === undefined ? '缺失' : `不是字符串或 null（实际是 ${describeValue(value)}）`
      }，${context.reason}，按 null 处理`,
    )
  }
  return null
}

/** `GET /api/profile` 上还没有消费方的那三个字段。 */
const PROFILE_UNCONSUMED = {
  endpoint: 'GET /api/profile',
  reason: '本仓暂无消费方',
} as const

/**
 * `/public` 上「只有九字段说保证」的那五个字段。取舍见 {@link PublicProfileResponse}：
 * 正文 :223 说四个、字段表 :259-269 与样例 :243-253 说九个，后端不可达无法实测。
 */
const PUBLIC_PROFILE_DISPUTED = {
  endpoint: 'GET /api/profile/{user_id}/public',
  reason: '文档 :223（四字段）与 :259-269 字段表/:243-253 样例（九字段）冲突，后端不可达无法实测',
} as const

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
      // 与头像同一列数据、同一句「需拼接 STORAGE_BASE_URL」（doc:99）。
      //
      // 🔴 P5 把它从宽松档**升到了严格档**（`emptyableStr`：缺键抛错、`''` ⇒ `null`）。
      // 判据就是上一批写下的那条界线——它现在有消费方了：`ProfilePage` 的封面区读它，
      // `uploadBackground` / `resetBackground` 写它。少这个键不再是"没人在乎"，
      // 而是"封面区拿不到该渲染什么"，正是严格档存在的场合。
      background_url: absoluteAvatar(emptyableStr(payload, 'background_url')),
      gender: unconsumedNullableStr(payload, 'gender', PROFILE_UNCONSUMED),
      birthday: unconsumedNullableStr(payload, 'birthday', PROFILE_UNCONSUMED),
      region: unconsumedNullableStr(payload, 'region', PROFILE_UNCONSUMED),
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

/**
 * `GET /api/profile/{user_id}/public` 的 `data` → {@link PublicProfileResponse}。
 *
 * 严格四个 + 宽松五个，界线与理由逐条写在 {@link PublicProfileResponse} 上，
 * 这里不复述（两份注释会各自漂移）。一句话：**两种读法都保证的走严格，
 * 只有九字段说保证的走宽松**。
 *
 * 🔴 不要"顺手"改成复用 {@link profileResponse}：那会要求 `user_email` / `admin`
 * / 四个隐私字段，而 doc:271-273 明写本端点**不返回**它们——一份完全合规的响应
 * 会被判成形状错误。反方向同样错：把九个全升成严格档，则一个按 :223 那种四字段
 * 读法实现的后端会让**每一次**调用失败。两个方向都有用例盯着。
 */
const publicProfileResponse: Parser<PublicProfileResponse> = {
  parse(input: unknown): PublicProfileResponse {
    const payload = asRecord(input, 'GET /api/profile/{user_id}/public 的 data')
    return {
      user_id: str(payload, 'user_id'),
      user_nickname: str(payload, 'user_nickname'),
      user_signature: emptyableStr(payload, 'user_signature'),
      user_avatar_url: absoluteAvatar(emptyableStr(payload, 'user_avatar_url')),
      background_url: absoluteAvatar(
        unconsumedNullableStr(payload, 'background_url', PUBLIC_PROFILE_DISPUTED),
      ),
      gender: unconsumedNullableStr(payload, 'gender', PUBLIC_PROFILE_DISPUTED),
      birthday: unconsumedNullableStr(payload, 'birthday', PUBLIC_PROFILE_DISPUTED),
      region: unconsumedNullableStr(payload, 'region', PUBLIC_PROFILE_DISPUTED),
      created_at: unconsumedNullableStr(payload, 'created_at', PUBLIC_PROFILE_DISPUTED),
    }
  },
}

/**
 * 目标用户不存在（HTTP 404，doc:277-284：`{"success": false, "code": 404,
 * "error": "用户不存在"}`）。
 *
 * 与 `groups.ts` 的 `isGroupNotFound` 同型同理由：这**不是**一次故障，而是一个
 * 确定的答案——"这个 user_id 上没有人"。调用点该渲染的是「用户不存在」，
 * 不是一条红色的「加载失败，请重试」外加一颗永远点不出结果的重试按钮。
 * 分诊按**状态码**，不做文案匹配（后端原文是中文，改一个字就会让匹配失效）。
 */
export function isProfileNotFound(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 404
}

/**
 * 资料背景图 → 可以直接放进 `src` 的地址；默认封面时返回 `undefined`。
 *
 * ## 为什么"默认封面"需要一个函数才判得对
 *
 * 同一个状态在这条 API 上有**三种**表示：
 * 1. 数据库列是 `null`（doc:464「后端将 `background_url` 置为 `null`」）；
 * 2. `GET /api/profile` 把它读成 `null`（字段表 doc:99 的 `string|null`）；
 * 3. `DELETE /api/profile/background` 的成功响应把它写成**空串** `""`
 *    （doc:482、:491「恒为空字符串 `""`……**前端不应拼接此值展示图片**」）。
 *
 * 所以 `backgroundUrl ?? undefined` 是**不够**的：`??` 只挡 `null` / `undefined`，
 * `""` 会原样落进 `src`。而 `<img src="">` 不是"不加载"——浏览器会把空 `src`
 * 解析成**当前页面地址**并真的发一次请求，把整张 HTML 当图片下载。
 * （本仓已经记过同一个坑：`Navigation.tsx` 的 `avatarSrc` 那一处注释写着
 * 「真会因空串发请求的是**裸 `<img>`**」。封面区用的正是裸 `<img>`。）
 *
 * ## ⚠️ 它是**三层里的一层**，不是唯一那道闸——说清楚免得高估它
 *
 * 今天有三处各自独立地把 `''` 判成"默认封面"：
 * 1. `profileApi.getProfile` 出口的 {@link emptyableStr}（`''` ⇒ `null`），
 *    所以正常链路上根本走不到 `''`；
 * 2. 本函数；
 * 3. `ProfilePage` 那一侧写的是 `coverSrc ? <img/> : null`——**真值判断**，
 *    `''` 同样是假值。
 *
 * 结果是：单独把本函数换成 `backgroundUrl ?? undefined`，页面上**依然**不会出现
 * `<img src="">`（已实测：`ProfilePage.test.tsx` 那条用例照样绿）。要真渲染出空
 * `src`，得同时改坏其中两处。所以本函数的价值是**把这条规则写成一个有名字、
 * 被单测直接钉住的表达式**（`profile.test.ts` 的 `coverImageSrc` 那一组对
 * `?? undefined` 确实变红），而不是"最后一道防线"——它不是。
 */
export function coverImageSrc(backgroundUrl: string | null | undefined): string | undefined {
  if (backgroundUrl === null || backgroundUrl === undefined) return undefined
  return backgroundUrl.trim() === '' ? undefined : backgroundUrl
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

/** 两个资料表单共用的三格取值。输入框只认字符串，所以 `null` 一律是空串。 */
export interface ProfileFormValues {
  nickname: string
  email: string
  signature: string
}

/**
 * 资料 → 表单初值。{@link pickProfileEdits} 的**左逆**：
 * `pickProfileEdits(p, profileFormValues(p))` 对任何 `p` 都是 `{}`（有用例钉着）。
 *
 * 这条等式就是「保存更改」按钮不会闪的全部理由：表单只要是从**当前这份**资料
 * 种出来的，差分就必然为空，按钮必然是灰的。`ProfileModal` 此前把初值写成空三元组
 * 再靠一个 `useEffect` 回填，于是 `profile` 刚变成非空的那一拍，差分拿"空表单"
 * 对"有值的资料"算出三个键——按钮亮着、输入框却是空的。
 */
export function profileFormValues(profile: UserProfile | null): ProfileFormValues {
  return {
    nickname: profile?.user_nickname ?? '',
    email: profile?.user_email ?? '',
    signature: profile?.user_signature ?? '',
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
  form: ProfileFormValues,
): UpdateProfileRequest {
  if (!current) return {}
  const edits: UpdateProfileRequest = {}
  if (form.nickname !== current.user_nickname) edits.nickname = form.nickname
  if (form.email !== (current.user_email ?? '')) edits.email = form.email
  if (form.signature !== (current.user_signature ?? '')) edits.signature = form.signature
  return edits
}

/** 写侧的 `''` 是"清空"，读侧把它归一成 `null`（见 {@link emptyableStr}）；这里跟同一套。 */
const emptyToNull = (value: string): string | null => (value === '' ? null : value)

/**
 * 每个可写字段落到 `UserProfile` 上的写法。**类型即穷尽性**：
 * `UpdateProfileRequest` 新增一个字段而这里忘了跟，TS 当场报缺键。
 *
 * 三个字段两侧不同名（`nickname`/`email`/`signature` ⇄ `user_*`），
 * 这张表是全仓唯一写下这个对应关系的地方——{@link pickProfileEdits} 是它的反向。
 */
type ProfileEditAppliers = {
  [K in keyof Required<UpdateProfileRequest>]: (
    draft: UserProfile,
    value: NonNullable<UpdateProfileRequest[K]>,
  ) => void
}

const PROFILE_EDIT_APPLIERS: ProfileEditAppliers = {
  nickname: (draft, value) => { draft.user_nickname = value },
  email: (draft, value) => { draft.user_email = emptyToNull(value) },
  signature: (draft, value) => { draft.user_signature = emptyToNull(value) },
  allow_search: (draft, value) => { draft.allow_search = value },
  search_visible_by_id: (draft, value) => { draft.search_visible_by_id = value },
  friend_request_policy: (draft, value) => { draft.friend_request_policy = value },
  group_invite_policy: (draft, value) => { draft.group_invite_policy = value },
  // `gender` 只有三档取值，`assertValidUpdate` 已挡掉 `''`，不需要归一。
  gender: (draft, value) => { draft.gender = value },
  birthday: (draft, value) => { draft.birthday = emptyToNull(value) },
  region: (draft, value) => { draft.region = emptyToNull(value) },
}

/**
 * 把一次**后端已经答应下来**的部分更新落到手上这份 `UserProfile` 上。
 *
 * 调用点只有一个：`profileStore.updateProfile` 在 `PUT /api/profile` 返回 200
 * **之后**。那一刻这次修改已经提交（成功响应 doc:203-208），随后那次 `GET`
 * 只是"把其余字段拉齐"；GET 失败时若什么都不做，屏幕上留下的是**修改前**的值——
 * 用户看到「已保存」，开关却弹回原位，而后端存的是新值。
 *
 * ⚠️ 这**不是**乐观更新：乐观更新是在请求发出去之前就改界面、失败再回滚。
 * 这里一个字节都不动，直到后端说 200 为止，所以也没有回滚可以写错。
 *
 * 与读回的差别只可能出现在后端**归一化了**某个值的场合（例如把邮箱转小写）。
 * 那种差别会在下一次成功的 `loadProfile()` 被纠正，而代价对比是：
 * 显示一个后端刚接受的值 vs 显示一个后端已经不再持有的值。
 */
export function applyProfileEdits(current: UserProfile, edits: UpdateProfileRequest): UserProfile {
  const draft = { ...current }
  for (const key of Object.keys(PROFILE_EDIT_APPLIERS) as (keyof UpdateProfileRequest)[]) {
    const value = edits[key]
    if (value === undefined) continue
    ;(PROFILE_EDIT_APPLIERS[key] as (draft: UserProfile, value: unknown) => void)(draft, value)
  }
  return draft
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

  /**
   * 上传**资料背景图**（封面）—— 与头像同一条四步预签名链路
   *
   * 🔴 `POST /api/profile/background`（`multipart/form-data`）与
   * `POST /api/profile/avatar`、`POST /api/groups/{id}/avatar` 同一批于 2026-08-28
   * **删除、无兼容层**（`个人资料管理.md:352-355` 逐字：「两条
   * `multipart/form-data` 端点**已整套删除**」）。现在走 storage 的
   * `upload/request → part_url → PUT → upload/confirm`（doc:362-369）。
   *
   * ## 与 {@link profileApi.uploadAvatar} 的**唯一**差别就是一个字段
   *
   * `avatar_target: 'user_background'`（doc:389 的三档取值之一）。其余全部相同，
   * 而且是**真的相同**，不是"大概相同"——逐条对过 doc:385-394 与
   * `文件存储管理.md:114-132` 的两张字段表：
   *
   * - **大小上限一样**：10 MB。上限按 `file_type` 取（doc:393
   *   `FileValidator::AVATAR_MAX_BYTES`；storage 文档 :138-139「上限按 `file_type` 取，
   *   不绑就等于没上限」、:950「头像 / 资料背景图 / 群头像 | < 10MB」），
   *   而三档 `avatar_target` 共用 `file_type: 'avatar'`，所以**没有**背景图专属的上限。
   * - **MIME 与扩展名白名单一样**：doc:391 扩展名必须是 jpg/jpeg/png/gif/webp、
   *   doc:392 `content_type` 收 jpeg/png/gif/webp/jpg/tiff——两条都挂在
   *   `storage_location=avatars` 这一档上，字段表里没有任何一行按 `avatar_target` 分叉。
   *   所以复用 `storageApi` 的 `AVATAR_*` 白名单是对的，不是偷懒。
   * - **落点不同的只有 object key 与写回列**（doc:418-422）：
   *   `background/{user_id}.{ext}` → `users."user-background-url"`。这两样都在**服务端**
   *   决定，客户端不传、也不该传。
   *
   * ## `related_id` 必须**根本没有这个键**
   *
   * doc:390：`related_id` **仅** `group_avatar` 需要且必填；`user_avatar` /
   * `user_background` **携带即 400**，doc:440 复述并写明「不静默忽略」。
   * 注意是"携带"，不是"值不对"——所以 `related_id: undefined` **不安全**：
   * 那一样是把键写进了对象，只是碰巧被 `JSON.stringify` 丢掉。
   * `buildAvatarUploadPayload` 用的是"只在 `group_avatar` 档才展开这个键"的构造方式，
   * 由 `profile.test.ts` 里截住 `requestAvatarUpload` 入参的那条 `Object.hasOwn`
   * 断言钉住（背景图与头像**各有一条**）。⚠️ 那条断言**不能**改成读
   * `JSON.parse(init.body)`：序列化会把 `undefined` 值的键和"根本没这个键"抹平成
   * 同一串字节，wire-level 断言对这条约束恒真。
   *
   * ## 成功之后**不要**回写
   *
   * doc:410-411：后端已在 confirm 那一步把 `file_url` 写进
   * `users."user-background-url"`，客户端「**无需**再调 `PUT /api/profile` 回写」。
   * 何况 `PUT /api/profile` 的字段表（doc:139-150）里根本没有 `background_url`
   * 这一格，回写连发都发不出去。
   *
   * @param onProgress 按**字节**报的直传进度（`percent` 来自 `xhr.upload.onprogress`）。
   *   理由与头像那一处逐条相同：分片固定 30 MB（`文件存储管理.md:185`）而上限 10 MB
   *   ⇒ 永远只有 1 片，按分片报等于只有 100% 一个取值，还得等字节全部传完才出现。
   * @throws {Error} 超 10 MB / MIME / 扩展名不在白名单（客户端便利检查，闸在后端）
   * @throws {Error} 同一落点已有上传在飞（单飞键是 `'user_background'`，与头像的
   *   `'user_avatar'` **是两把不同的锁**——换封面和换头像可以并行，doc:445 要防的是
   *   **同一目标**的并发接管）
   * @throws {ApiError} 后端失败，文案是后端原文；409 用 `isUploadSessionExpired`
   *   分诊，**不要自动重试**（会话被接管 doc:445、已过期 :447、已失效/重复确认 :449-450）
   */
  uploadBackground: async (
    file: File,
    onProgress?: (progress: AvatarUploadProgress) => void,
  ): Promise<AvatarUploadResult> => {
    console.log('🖼️ 上传资料背景图:', file.name)

    const result = await storageApi.uploadAvatar(
      file,
      { avatar_target: 'user_background' },
      onProgress,
    )

    console.log('✅ 资料背景图上传成功:', result.file_url)
    return result
  },

  /**
   * 重置资料背景图为默认封面
   * DELETE /api/profile/background（`个人资料管理.md:458-492`，§6）
   *
   * ## 🔴 这个端点的成功响应是**裸的**，而且是**文档说的**
   *
   * doc:479-485 逐字：
   *
   * ```json
   * { "background_url": "", "message": "背景图已重置为默认" }
   * ```
   *
   * 没有 `success`、没有 `code`、没有 `data`。doc:460 也点明它不在 2026-08-28
   * 那次并入的范围内（「本端点**没有变**」）——它是本模块里唯一一条既没被信封化、
   * 也没被改造的端点。
   *
   * 所以这里**没有** `readEnvelope`：那一支会走到 `unwrapData` 的
   * 「响应缺少 data 字段」并抛 `ApiShapeError` + 上报一条误报的形状告警，
   * 把一次**完全正常**的重置判成失败。用的是 {@link assertEnvelopeOk}——本仓
   * 「响应体里没有可消费内容」的那一档，它只判成功与否（HTTP 状态码 +
   * `success === false`），**根本不去碰 `data`**，因此对裸响应和信封响应都成立。
   *
   * ## 为什么这**不是** `legacyBare`
   *
   * `legacyBare` 记的是**欠账**：「这个端点的形状我们没验证过，姑且当裸的，
   * 但每次命中都 warn，让 `grep legacyBare` 能把债列出来」——本文件的
   * {@link PROFILE_LEGACY_BARE} 就是那样一条，它的理由逐字是"后端不可达、无法实测"。
   * 本端点的情形**相反**：文档在 §6 里**正面写出了**这个响应体，它就该是裸的，
   * 没有任何东西要被"清理"。给它挂一条 `legacyBare` 会有两个具体坏处：
   * 每一次成功重置都打一条永远不该被消除的 warn，以及让 `grep legacyBare` 的结果
   * 里混进一笔**永远还不掉**的假债，真正的欠账因此贬值。
   *
   * ## 返回 `void`：响应体里没有一个字段是可用的
   *
   * - `background_url` **恒为 `""`**，而字段表 doc:491 逐字写着
   *   「**前端不应拼接此值展示图片**」。它不是地址，是一个"已重置"的哨兵值——
   *   把它当 URL 用（拼基址、塞进 `src`）正是这一条要禁止的事。所以它连**出这个
   *   函数**都不该，更不会去过 `toAbsoluteApiUrl`。
   *   ⚠️ 同一个"默认封面"状态在这条 API 上有**三种**表示：数据库列 `null`
   *   （doc:464）、`GET /api/profile` 读出来的 `null`、以及这里的 `""`。
   *   渲染侧统一用 {@link coverImageSrc} 判，`??` 是不够的（它挡不住 `""`）。
   * - `message` 是一句成功提示，不带"这次为什么成功"的任何信息。理由与
   *   {@link profileApi.updateProfile} 那一段逐条相同：调用点弹的是自己的中文 toast，
   *   透出后端原文没有收益。（这一条的原文碰巧也是中文，但那是巧合，不是理由。）
   *
   * @throws {ApiError} 后端失败，带真实状态码；401 会被 `isAuthError` 认出来
   */
  resetBackground: async (): Promise<void> => {
    console.log('🧹 重置资料背景图')

    // 请求体：无（doc:468）。
    const response = await fetchWithAuth(`${PROFILE_BASE_URL}/background`, {
      method: 'DELETE',
    })

    await assertEnvelopeOk(response, {
      endpoint: 'DELETE /api/profile/background',
      fallbackMessage: '重置资料背景图失败',
    })
    console.log('✅ 资料背景图已重置为默认')
  },

  /**
   * 获取**他人**的公开资料
   * GET /api/profile/{user_id}/public（`个人资料管理.md:219-284`，§3）
   *
   * 鉴权：任意登录用户均可访问（doc:225）。返回的是窄 DTO
   * {@link PublicProfileResponse}——**不是** {@link UserProfile}，理由与字段集上
   * 那处文档矛盾的取舍全写在该接口的 JSDoc 上。
   *
   * 🔴 **404 = "这个 user_id 上没有人"，是一个答案，不是一次故障**
   * （doc:277-284）。用 {@link isProfileNotFound} 分诊，让调用点渲染「用户不存在」，
   * 而不是一条红色的「加载失败」加一颗永远点不出结果的重试按钮。
   *
   * `user_id` 过 `encodeURIComponent`：它是用户自己取的字符串，含 `/`、`?`、`#`
   * 会把路径整个改掉。⚠️ 说明白——**本后端对已编码路径段的处理没在这台机器上验证过**
   * （`api.huanvae.cn` 不可达）；选它是因为对文档给出的那种 id
   * （doc:236 的 `testuser001`）编码是**恒等**的，所以对真实取值零行为差异，
   * 而对畸形 id 它是唯一不会造出错误 URL 的写法。
   */
  getPublicProfile: async (userId: string): Promise<PublicProfileResponse> => {
    console.log('👥 获取他人公开资料:', userId)

    const response = await fetchWithAuth(
      `${PROFILE_BASE_URL}/${encodeURIComponent(userId)}/public`,
      { method: 'GET' },
    )

    return readEnvelope<PublicProfileResponse>(response, {
      endpoint: 'GET /api/profile/{user_id}/public',
      fallbackMessage: '获取用户公开资料失败',
      parse: publicProfileResponse,
    })
  },
}
