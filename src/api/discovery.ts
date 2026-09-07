import { getApiBaseUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { type Parser, readEnvelope } from '@/lib/apiEnvelope'
import { arr, asRecord, bool, num, str } from '@/lib/apiParse'
import { fetchWithAuth } from './authedFetch'

/**
 * 统一发现搜索 `GET /api/discovery/search`（`backend-docs/discovery/发现搜索.md`）。
 *
 * ## 为什么单独成模块，而不是留在 groups.ts 里
 *
 * 这一个端点一次返回 `people` / `groups` / `bots` **三段**（doc:58-72 的响应样例）：它属于
 * discovery 模块，不属于群模块——`groups/群聊管理.md:609-611` 自己写着
 * 「🔍 搜索群聊不在本文档：群搜索统一走 `GET /api/discovery/search`」。
 * 今天只有「输入群名/群 ID 找群」一个消费点（`groupsApi.searchGroups`），
 * 但「按昵称找人加好友」「找 bot」用的是同一次请求、同一个信封、同一套
 * `limit` 钳制规则。传输层放在这里，将来那两个消费点各自写一个 rowParser
 * 就能复用，不必把 friends / bots 反向依赖到 chat 的群模块上。
 *
 * 与批 5 把三档头像的公共链路落在 `storageApi.uploadAvatar` 是同一个判断：
 * **端点属于谁，链路就放在谁那里**，消费方只负责把自己那一段解析成自己的 DTO。
 *
 * ## 刻意不建 people / bots 的 DTO
 *
 * 本批没有找人 / 找 bot 的界面，凭文档先写两个 Card 类型就是无人验证的猜测，
 * 等真接的时候还得对着当天的文档重核一遍。{@link searchDiscovery} 的 `section`
 * 参数已经把入口留好了，需要时补一个 rowParser 即可。
 */

const DISCOVERY_BASE_URL = `${getApiBaseUrl()}/api/discovery`

/**
 * 头像相对路径 → 绝对地址，只在 api 模块出口做一次。与 `groups.ts`、`friends.ts`
 * 里同名的 `absoluteAvatar` 逐字同型，同样按那两处的理由独立定义一份。
 *
 * `null` 与空串统一归一为 `null`（无头像），不兜底成空串：空串会被
 * `<AvatarImage src="">` 当成一次真实的图片请求。
 *
 * ---
 * 📌 **本仓约定：跨文件引用锚在符号名上，不写行号。** 这两处原本写的是
 * `groups.ts:312` 和 `friends.ts:136`——批 7 往 `groups.ts` 里插了约 110 行，
 * `absoluteAvatar` 跟着往下漂，那个 `:312` 就静静地指向了别的代码。行号引用在本仓
 * 是一次插入就失效的**哑引用**：没有编译器、没有 lint、没有测试会告诉你它坏了，
 * 而读的人会照着它去看一段不相干的代码（本次迁移已经被这样误导过不止一次）。
 * 符号名跟着符号走，改名有编译器和全文搜索兜底。
 * （例外：`doc:` / `*.md:` 开头的后端文档行号照旧——那些文件在本仓之外独立版本化，
 * 是双方约定的坐标；同文件内的行号引用也照旧。）
 */
const absoluteAvatar = (path: string | null): string | null => toAbsoluteApiUrl(path) ?? null

/**
 * 头像路径字段：`null` 与 `''` 一并归一成 `null`（= 没有头像），其余非字符串抛错。
 *
 * 本端点的字段表（doc:104）与样例都写 `null`，但同一列数据在群模块的两份样例里
 * 给的是 `""`（`groups.ts` 的 `emptyableStr` 上方记着这件事）。用 `apiParse` 的
 * `nullableStr` 会把 `''` 判成"缺失"并抛错，于是一个纯装饰性的字段能把整次
 * 群搜索打挂。放行 `''`、并保留"不是字符串就抛"这条真正的形状防线，是本函数
 * 全部的职责。
 *
 * ⚠️ 这里的 `'' → null` 是**贴身冗余**，不是防 `<AvatarImage src="">` 的那道防线。
 * 唯一调用点是 `absoluteAvatar(emptyableAvatarPath(...))`，而 `absoluteAvatar` 走的
 * `toAbsoluteApiUrl` 对空串（含纯空白）已经返回 `undefined`（`apiConfig.ts` 的
 * `toAbsoluteApiUrl`，trim 后为空串就 `return undefined`），
 * 再 `?? null` 成 `null` —— 把本行改成 `return value` 全套测试照样绿。留着它，是为了
 * 让函数名（`emptyableAvatarPath`）对自己的返回值说真话、不依赖调用方兜底；
 * "空串不能进 `<AvatarImage>`"这条理由记在 {@link absoluteAvatar} 上，别在这里重复
 * 一遍——两处都写就成了两份会互相漂移的说法（`groups.ts` 的 `GroupBase` 文档注释
 * 把同一条正确地归给了 `absoluteAvatar`）。
 */
function emptyableAvatarPath(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new Error(`${key} 缺失或不是字符串`)
  }
  return value === '' ? null : value
}

/** 三段结果的段名（`DiscoverySearchResponse` 字段表 doc:83-85）。 */
export type DiscoverySection = 'people' | 'groups' | 'bots'

/**
 * `data.groups` 的一行（`GroupCard`，字段表 doc:100-107）。
 *
 * 🔴 **这不是本仓 `groups.ts` 的 `GroupBase`**，两者字段名和字段集都不同：
 * 头像叫 `avatar_url`（**不是** `group_avatar_url`），并且**没有**
 * `group_description` / `creator_id` / `created_at` / `status`；反过来
 * `GroupBase` 没有 `join_approval_required` / `is_member`。
 * 迁移前 `searchGroups` 声明返回 `GroupBase[]`，那是对到货内容的一句谎话；
 * 修法是引入这个类型，**不是**把 `GroupBase` 放宽到能同时装下两种形状。
 *
 * `join_approval_required` 是「要不要审核」的**唯一**判据：五档 `join_mode`
 * 连同 `groups."join-mode"` 列随 migration 043 于 2026-08-17 整套删除
 * （doc:109-112），读它恒为 `undefined`。
 *
 * `search_scope` **有意不在这里**（doc:114-116）：那是群主的设置项，搜索方
 * 不需要知道「这个群为什么搜得到」。
 */
export interface DiscoveryGroupCard {
  group_id: string
  group_name: string
  /** 相对路径，已在 api 出口过 {@link absoluteAvatar}；无头像为 `null`（doc:104）。 */
  avatar_url: string | null
  member_count: number
  join_approval_required: boolean
  is_member: boolean
}

/** `limit` 的默认值与钳制区间（doc:48）。 */
export const DISCOVERY_LIMIT_DEFAULT = 20
export const DISCOVERY_LIMIT_MIN = 1
export const DISCOVERY_LIMIT_MAX = 50

/**
 * 把 `limit` 钳到 `1..=50`，非有限数字回落到默认值 20。
 *
 * 服务端**自己也会钳**且不报错（doc:48、doc:167）。这里再钳一次不是防御性
 * 冗余，而是让 URL 说真话：传 `limit=500` 而实际只会回 50 条，是一次"请求与
 * 结果对不上、又没有任何信号"的静默偏差——正是本轮迁移在消灭的那一类。
 *
 * ⚠️ 它是**每一段各自**的条数上限，不是三段合计（doc:48）。
 */
export function clampDiscoveryLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return DISCOVERY_LIMIT_DEFAULT
  return Math.min(DISCOVERY_LIMIT_MAX, Math.max(DISCOVERY_LIMIT_MIN, Math.trunc(limit)))
}

/**
 * 只校验「被点名的那一段是数组」，然后逐行喂给调用方的 `row`。
 *
 * **另外两段有意不校验，这条口径出自本函数、不出自文档**。doc:87 只写了
 * 「三类结果均可为空数组」，并**没有**写三段互相独立；doc:83-85 的字段表反过来
 * 把 `people` / `groups` / `bots` 三段全部标成非空的数组。理由是消费方式：
 * 谁消费哪一段，谁才校验哪一段。若把 `people` 也一并强校验，后端哪天动了
 * `PersonCard` 就会连带把"找群"打挂——那是凭空造出来的耦合。
 *
 * 代价说明白：`bots: null` 这类**有文档记录的漂移**（字段表说它是数组）本函数
 * 就是发现不了。这是有意的——本次请求没有 bot 消费方，发现了也无从处置，
 * 只会把一次成功的群搜索变成一次失败。等接"找 bot"时，那个消费点自己会校验它。
 *
 * 真正的形状漂移（`data` 不是对象、点名的那段不见了或不是数组、行里字段名变了）
 * 在这里全都会抛，且因为挂在 `readEnvelope` 的 `parse` 档上，抛出的是可被上报的
 * `ApiShapeError`。
 *
 * 于是「真的没搜到」（`groups: []` ⇒ 返回 `[]`）与「形状漂了」（抛错）是两件
 * 可区分的事，而不是旧 `result.data || []` 下同一句"没有找到匹配的群聊"。
 */
function sectionRows<T>(section: DiscoverySection, row: (input: unknown) => T): Parser<T[]> {
  return {
    parse(input: unknown) {
      const payload = asRecord(input, 'GET /api/discovery/search 的 data')
      return arr(payload, section).map((entry) => row(entry))
    },
  }
}

/**
 * 发一次统一发现搜索，只取出 `section` 那一段。
 *
 * `keyword` **原样发出，不做空串前置拦截**：trim 后为空是后端定义的 `400`
 * （doc:47、doc:166），由它给出文案，前端再造一句只会和后端两份说法。
 *
 * @param section 取哪一段；将来接"找人 / 找 bot"时改这个参数并配一个 `row`。
 * @param row 单行解析器，由消费方提供——每一段是自己的 DTO。
 */
export async function searchDiscovery<T>(options: {
  keyword: string
  limit?: number
  section: DiscoverySection
  row: (input: unknown) => T
}): Promise<T[]> {
  const params = new URLSearchParams({
    keyword: options.keyword,
    limit: String(clampDiscoveryLimit(options.limit)),
  })

  const response = await fetchWithAuth(`${DISCOVERY_BASE_URL}/search?${params}`, {
    method: 'GET',
  })

  return readEnvelope<T[]>(response, {
    endpoint: 'GET /api/discovery/search',
    fallbackMessage: '搜索失败',
    parse: sectionRows(options.section, options.row),
  })
}

/**
 * `data.groups` 的一行 → {@link DiscoveryGroupCard}。
 *
 * 六个字段全部实打实校验：`member_count` 用 `num()`、两个布尔用 `bool()`。
 * 布尔尤其不能放过 `undefined`／`null`——`if (card.join_approval_required)`
 * 会把它读成"免审核"，`!card.join_approval_required` 会把它读成"需审核"，
 * 两种写法都会把「后端没给这个字段」伪装成一个确定的业务结论。
 *
 * `avatar_url` 走 {@link emptyableAvatarPath}：doc:104 明写可为 `null`。
 */
export function parseDiscoveryGroupCard(input: unknown): DiscoveryGroupCard {
  const payload = asRecord(input, 'discovery search 的 groups[]')
  return {
    group_id: str(payload, 'group_id'),
    group_name: str(payload, 'group_name'),
    avatar_url: absoluteAvatar(emptyableAvatarPath(payload, 'avatar_url')),
    member_count: num(payload, 'member_count'),
    join_approval_required: bool(payload, 'join_approval_required'),
    is_member: bool(payload, 'is_member'),
  }
}
