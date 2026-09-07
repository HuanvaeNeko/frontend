/**
 * 后端统一响应信封 `{ success, code, data }` 的解包层。
 *
 * ## 为什么需要这一层
 *
 * 2026-03-08 后端把所有响应统一成信封格式，前端多处仍在裸解析
 * （`const data = await response.json(); data.friends`）。信封化之后
 * `data.friends` 恒为 `undefined`，而调用点普遍写着 `|| []` / `|| false`
 * 之类的兜底，于是**没有任何一次报错**：好友列表恒为空、在线状态恒为离线、
 * 设备列表恒为空，全部表现为"功能正常但没有数据"。这个 bug 类活了半年，
 * 不是因为难修，而是因为没人知道它存在。
 *
 * 所以这一层的设计目标不是"安全地拿到数据"，而是**让形状不匹配无法被忽略**。
 *
 * ## 三条不可协商的规则
 *
 * 1. **形状不对就抛错，绝不返回兜底值。** 本模块不提供任何默认值参数。
 *    需要降级的地方，由调用点自己 `catch` 并写明降级成什么——降级是一个
 *    决策，必须留在代码里被 review，不能藏在公共工具的 `|| []` 里。
 *    并且降级值必须能和真实数据区分开：presence 拿不到要降级成 `null`（未知），
 *    不能降级成 `false`（离线）——把失败伪装成数据正是这批 bug 的成因。
 * 2. **不默认兼容裸响应。** 不写 `json.data ?? json`。判定用 `'data' in json`，
 *    这样 `{success:true, data:null}` 和「根本没有 data 字段」是两种不同的错误，
 *    前者是后端返回空，后者是前端解析错了地方。确有未迁移的端点，必须显式传
 *    {@link EnvelopeOptions.legacyBare} 并写明原因和清理期限——每次命中都会打
 *    警告，`grep legacyBare` 就能列出全部欠账，让它烂不掉。
 * 3. **body 只读一次。** 所有入口内部统一走 {@link readBody}（`response.text()`
 *    读一次再 `JSON.parse`），失败分支和成功分支共用那一次读取。历史代码里
 *    `if (!response.ok)` 分支和成功分支各调一次 `response.json()`，第二次必然抛
 *    `TypeError: body stream already read`——这里从结构上杜绝：入口只收
 *    `Response`，调用点不再自己碰 `.json()`，这个 bug 就写不出来。
 *
 * ## 类型安全
 *
 * 三档强度，按端点重要性选：
 * - `parse`：传入任何带 `.parse(unknown): T` 的对象（zod schema 直接可用，
 *   本模块不 import zod，保持零依赖）。`T` 由 `parse` 反推，调用点无需断言。
 *   `data` 是标量（字符串/布尔/数字）的端点也走这一档显式声明。
 * - `require`：列出必须存在的字段名。类型是 `keyof T & string`，
 *   **写错字段名是编译错误**——例如给 `GetDevicesResponse` 写
 *   `require: ['devices', 'total']` 而接口里没有 `total`，`bun run typecheck`
 *   当场报 `error TS2322: Type '"total"' is not assignable to type '"devices"'.`
 *   （已实测）。这正是本次审计第 1 条 bug 的形态：改了返回值忘了改接口，
 *   在 typecheck 阶段就死掉，不用等运行时。
 * - 都不传：仍然校验信封本身 + `data` 是非 null 的对象或数组。这是下限，
 *   不是默认姿势。
 */

/** 后端统一信封。`message`/`error` 是失败时的文案字段，两个都兼容。 */
export interface ApiEnvelope<T = unknown> {
  success?: boolean
  code?: number | string
  data?: T
  message?: string
  error?: string
  details?: unknown
}

/** 任何带 `.parse(unknown): T` 的校验器；zod 的 `ZodType<T>` 结构上满足它。 */
export interface Parser<T> {
  parse(input: unknown): T
}

/**
 * 后端明确表达的失败：HTTP 非 2xx，或 HTTP 200 但 `success === false`。
 *
 * `status` 保留原始状态码，供调用点做分诊——例如 storage 的 `upload/confirm`
 * 与 `multipart/part_url` 在 409 时表示"上传会话已死，必须回到 upload/request
 * 重来"，调用点写 `if (e instanceof ApiError && e.status === 409)` 即可。
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: number | string | null
  readonly endpoint: string
  /** 原始响应体（已解析的 JSON，或解析失败时的文本片段），排查用。 */
  readonly payload: unknown

  constructor(
    message: string,
    init: {
      status: number
      code?: number | string | null
      endpoint: string
      payload?: unknown
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code ?? null
    this.endpoint = init.endpoint
    this.payload = init.payload
  }
}

/**
 * HTTP 成功、后端也说 success，但响应形状和前端的类型定义对不上。
 *
 * 这是本次 16+15 条 bug 的统一形态。它单独成类，是为了能被独立上报——
 * 见 {@link setApiShapeErrorReporter}：即使调用点 catch 掉了，
 * 形状漂移也必须在监控里留下一条记录，否则下一个半年还会重演。
 */
export class ApiShapeError extends ApiError {
  constructor(message: string, init: { status: number; endpoint: string; payload?: unknown }) {
    super(message, init)
    this.name = 'ApiShapeError'
  }
}

type ShapeErrorReporter = (error: ApiShapeError) => void

let reportShapeError: ShapeErrorReporter = (error) => {
  console.error(`[api-shape] ${error.endpoint}: ${error.message}`, error.payload)
}

/**
 * 注册形状错误上报器（在 `src/app/entry.client.tsx` 里接到 Sentry）。
 *
 * 刻意做成注入而不是在本模块里直接 `import * as Sentry`：本模块会被 server 端
 * （`server/index.ts` 走 Bun 运行时）间接引用，而 `src/config/sentry.ts`
 * 里的 `import.meta.env.PROD` 判断在 Bun 下恒为 falsy——直接 import 会让
 * 上报静默失效，正是本仓 `src/config/filterSensitiveData.ts` 顶部注释
 * 记录过的那个坑（"看起来能调、实际静默 no-op"）。
 *
 * 未注册时默认打 `console.error`，不会静默。
 */
export function setApiShapeErrorReporter(reporter: ShapeErrorReporter): void {
  reportShapeError = reporter
}

/**
 * 抛出并同时上报形状错误。
 *
 * 上报**必须**被 try/catch 包住：这是所有形状错误的唯一咽喉，一旦注入的上报器
 * 自己抛（Sentry 未初始化、hook 里访问了 undefined、上报队列满），调用点收到的
 * 就是上报器的错误而不是 `ApiShapeError`——message / `endpoint` / `payload` 全丢，
 * 下游 `instanceof ApiError`、`status === 409` 的分诊也全部失效。
 * 「记录错误的动作把错误本身替换掉」是本层最不能犯的错。
 *
 * 这是整个解包路径上**唯一**一处 `catch {}`，它保护的是错误本身，不是任何数据。
 */
function throwShape(
  message: string,
  init: { status: number; endpoint: string; payload?: unknown },
): never {
  const error = new ApiShapeError(message, init)
  try {
    reportShapeError(error)
  } catch {
    // 上报失败不能替换掉被上报的错误。这里刻意不再上报「上报失败」，
    // 否则同一个坏上报器会立刻二次抛出。
  }
  throw error
}

export interface EnvelopeOptions<T> {
  /** 形如 `'GET /api/friends'`。会出现在每一条错误信息里，排查时不用猜是哪个请求。 */
  endpoint: string
  /** 后端没给任何文案时的兜底中文提示。 */
  fallbackMessage?: string
  /** 强校验：任何带 `.parse(unknown): T` 的对象，zod schema 直接可用。 */
  parse?: Parser<T>
  /**
   * 弱校验：`data` 上必须存在（且不为 `undefined`）的字段。写错字段名 = 编译错误。
   *
   * 两条使用限制，写在这里免得迁移时踩：
   *
   * 1. **编译期检查是「选进来的」，不是默认开启的。** `keyof T & string` 只有在
   *    `T` 被真正定下来时才约束得住。既不写类型参数、上下文也推不出返回类型时，
   *    `T` 塌成 `unknown`，`keyof unknown & string` 是 `never`… 但空数组字面量
   *    仍可赋值，于是 `readEnvelope(res, { require: ['made', 'up'] })` **能编译通过**。
   *    所以：**永远显式写 `readEnvelope<T>(...)`**，别指望推断。
   * 2. **`null` 算「存在」。** 判定是 `payload[key] === undefined`，
   *    所以 `require: ['devices']` 对上 `{devices: null}` 会放行，把 `TypeError`
   *    推迟到调用点的 `.map()`——又变回「失败伪装成数据」。
   *    **数组字段一律走 {@link readEnvelopeList}**，它会实打实地 `Array.isArray` 一次；
   *    非数组字段要求非空就用 `parse`。
   */
  require?: readonly (keyof T & string)[]
  /**
   * 显式承认某个端点仍返回裸响应（没有 `data` 包裹）。
   * 必须写明原因和清理期限，命中时每次都打 `console.warn`。
   * 默认不开——`json.data ?? json` 式的静默兼容会把"端点没迁移"变成不可见状态。
   */
  legacyBare?: { until: string; reason: string }
}

/** body 只读一次：`text()` 之后再 `JSON.parse`，避免二次消费 body stream。 */
async function readBody(
  response: Response,
  endpoint: string,
): Promise<{ text: string; json: unknown; parsed: boolean }> {
  let text: string
  try {
    text = await response.text()
  } catch (cause) {
    throw new ApiError(`${endpoint}: 读取响应失败`, {
      status: response.status,
      endpoint,
      payload: cause,
    })
  }

  if (text.trim() === '') {
    return { text, json: undefined, parsed: false }
  }

  try {
    return { text, json: JSON.parse(text) as unknown, parsed: true }
  } catch {
    return { text, json: undefined, parsed: false }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * 从失败响应里取错误文案。取值顺序：
 * **`message` → `error` → `details` → `HTTP ${status}: 响应体前 200 字符`**。
 *
 * 本仓库三个模块各读各的（auth 读 `error.message ?? error.error`，
 * storage 只读 `error.error`），而文档明确 `upload/confirm` 的失败原因在
 * `message`——于是 storage 那 8 处 `error.error || '通用文案'` 把**所有**
 * 真实失败原因替换成了通用文案。这里一次性统一。
 *
 * 两个细节：
 * - 错误对象**不在** `data` 里，`message` 是信封的顶层字段。
 * - 非 JSON 的错误体（nginx 502 的 HTML 页、网关超时页）不再被抹平成
 *   一句通用文案，而是带上前 200 字符，让"后端挂了"和"业务失败"能分开。
 */
function extractErrorMessage(
  json: unknown,
  text: string,
  status: number,
  fallback: string,
): string {
  if (isRecord(json)) {
    const envelope = json as ApiEnvelope
    const primary = [envelope.message, envelope.error].find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim() !== '',
    )
    const details =
      envelope.details === undefined || envelope.details === null
        ? undefined
        : JSON.stringify(envelope.details)

    if (primary !== undefined) {
      return details === undefined ? primary : `${primary}: ${details}`
    }
    // message / error 都没有，但有 details——它是最后一个结构化线索，
    // 不能跳过它直接落到"响应体前 200 字符"。
    if (details !== undefined) {
      return `${fallback}: ${details}`
    }
  }

  const snippet = text.trim().slice(0, 200)
  return snippet === '' ? `${fallback} (HTTP ${status})` : `${fallback} (HTTP ${status}): ${snippet}`
}

/** HTTP 非 2xx 或 `success === false` 时抛 {@link ApiError}；两个分支共用同一次 body 读取。 */
function assertOk(
  response: Response,
  body: { text: string; json: unknown },
  endpoint: string,
  fallbackMessage: string,
): void {
  const envelope = isRecord(body.json) ? (body.json as ApiEnvelope) : null

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessage(body.json, body.text, response.status, fallbackMessage),
      {
        status: response.status,
        code: envelope?.code,
        endpoint,
        payload: body.json ?? body.text,
      },
    )
  }

  // HTTP 200 但后端说失败——信封化之后这是合法的失败表达方式，必须认。
  // 历史代码只看 `!response.ok`，会把它当成功，然后从缺失的 data 里读出 undefined。
  if (envelope?.success === false) {
    throw new ApiError(
      extractErrorMessage(body.json, body.text, response.status, fallbackMessage),
      {
        status: response.status,
        code: envelope.code,
        endpoint,
        payload: body.json,
      },
    )
  }
}

/**
 * 从信封里取出 `data`。**不写 `?? json` 兜底**——兜底会让"端点没迁移"和
 * "端点迁移了但返回空"变成同一种表现，正是这批 bug 半年没被发现的机制。
 */
function unwrapData(
  envelope: ApiEnvelope,
  options: { endpoint: string; legacyBare?: { until: string; reason: string } },
  status: number,
): unknown {
  const { endpoint } = options

  if ('data' in envelope) {
    const payload = envelope.data
    if (payload === null || payload === undefined) {
      // 和"没有 data 键"必须是两条不同的信息：这条说的是后端返回了空，
      // 那条说的是前端解析错了地方。
      //
      // 文案里点名 assertEnvelopeOk，因为 `data: null` 对一部分端点是**文档规定的
      // 合法成功响应**——`DELETE /api/storage/file/{uuid}` 成功时就是
      // `{"success":true,"code":200,"data":null}`。迁移的人若在那里顺手用了
      // readEnvelope，拿到的是一句语焉不详的报错外加一条误报的 Sentry 形状告警；
      // 把正确入口写进错误信息里，这个来回就不会发生。
      return throwShape(
        `${endpoint}: data 为空（后端返回 data: null）。若该端点本就无返回值（如 DELETE 类），请改用 assertEnvelopeOk`,
        { status, endpoint, payload: envelope },
      )
    }
    return payload
  }

  if (options.legacyBare) {
    console.warn(
      `[api-envelope] ${endpoint} 仍是裸响应（${options.legacyBare.reason}），` +
        `按 legacyBare 处理，清理期限 ${options.legacyBare.until}`,
    )
    return envelope
  }

  return throwShape(
    `${endpoint}: 响应缺少 data 字段（收到的键：${Object.keys(envelope).join(', ')}）`,
    { status, endpoint, payload: envelope },
  )
}

/** `parse` / `require` / 下限三档校验，{@link readEnvelope} 与 {@link unwrapEnvelope} 共用。 */
function validatePayload<T>(payload: unknown, options: EnvelopeOptions<T>, status: number): T {
  const { endpoint } = options

  if (options.parse) {
    try {
      return options.parse.parse(payload)
    } catch (cause) {
      return throwShape(
        `${endpoint}: data 校验失败 - ${cause instanceof Error ? cause.message : String(cause)}`,
        { status, endpoint, payload },
      )
    }
  }

  if (options.require && options.require.length > 0) {
    if (!isRecord(payload)) {
      return throwShape(`${endpoint}: data 应为对象，实际是 ${describe(payload)}`, {
        status,
        endpoint,
        payload,
      })
    }
    const missing = options.require.filter((key) => payload[key] === undefined)
    if (missing.length > 0) {
      return throwShape(
        `${endpoint}: data 缺少字段 ${missing.join(', ')}（收到的键：${Object.keys(payload).join(', ')}）`,
        { status, endpoint, payload },
      )
    }
    return payload as T
  }

  // 下限：不校验字段，但 data 至少得是对象或数组。标量 data 是合法的后端设计，
  // 只是必须用 `parse` 显式声明，不能靠"碰巧没报错"蒙混过去。
  if (typeof payload !== 'object') {
    return throwShape(
      `${endpoint}: data 应为对象或数组，实际是 ${describe(payload)}（标量 data 请用 parse 显式声明）`,
      { status, endpoint, payload },
    )
  }

  return payload as T
}

/**
 * 校验信封并返回 `data`，失败一律抛错，**不返回任何兜底值**。
 *
 * **永远显式写类型参数：`readEnvelope<T>(res, ...)`。** 省掉它时 `T` 塌成 `unknown`，
 * `require` 的编译期字段名检查会整档失效（详见 {@link EnvelopeOptions.require}）。
 *
 * 选错入口的两个常见情形：
 * - `data` 里的数组字段 → 用 {@link readEnvelopeList}，`require` 认 `null` 为「存在」。
 * - 文档明确返回 `data: null` 的端点（如 `DELETE /api/storage/file/{uuid}`）
 *   → 用 {@link assertEnvelopeOk}，这里会判成形状错误并上报。
 *
 * @throws {ApiError} HTTP 非 2xx，或 `success === false`
 * @throws {ApiShapeError} HTTP 成功但缺 `data` / `data` 为空 / 缺必需字段 / `parse` 不通过
 */
export async function readEnvelope<T>(
  response: Response,
  options: EnvelopeOptions<T>,
): Promise<T> {
  const { endpoint, fallbackMessage = '请求失败' } = options
  const body = await readBody(response, endpoint)

  assertOk(response, body, endpoint, fallbackMessage)

  if (!body.parsed || !isRecord(body.json)) {
    return throwShape(`${endpoint}: 响应不是 JSON 对象`, {
      status: response.status,
      endpoint,
      payload: body.text.slice(0, 200),
    })
  }

  const payload = unwrapData(body.json as ApiEnvelope, options, response.status)
  return validatePayload(payload, options, response.status)
}

/**
 * 列表端点专用：解包信封后再从 `data` 上取出数组字段。
 *
 * 拿不到数组就抛错——历史写法 `data.friends || data || []` 在信封化之后
 * 会稳定返回 `[]`，UI 显示"暂无好友"，没有任何人会去报 bug。
 *
 * ## 各端点该传什么 `field`（逐条对过后端文档，**不要照抄设计稿**）
 *
 * **`data` 本身就是数组 ⇒ 不传 `field`：**
 * - `GET /api/friends` —— `resp.data: FriendDto[]`
 *   （`friends/好友添加删除.md`；README 更新日志 2026-03-08：从裸 `{"items":[...]}`
 *   改为 `{"success":true,"code":200,"data":[...]}`）
 * - `GET /api/friends/requests/sent` —— `resp.data: SentRequestDto[]`（同上）
 * - `GET /api/friends/requests/pending` —— `resp.data: PendingRequestDto[]`（同上）
 * - `GET /api/friends/presence` —— `resp.data: PresenceEntry[]`
 * - `GET /api/ai/voice_profiles` —— 2026-03-08 起 `data` 为数组
 *
 * **`data` 是对象、数组在其字段上 ⇒ 传 `field`：**
 * - `GET /api/auth/devices` —— `field: 'devices'`
 *   （`data` 为 `{"devices":[...],"total":N}`，README 更新日志 2026-03-08）
 *
 * ⚠️ 设计稿 §「friends（第二批）」写的 `field: 'friends'` / `field: 'requests'`
 * 与后端不符：那是**信封化之前**的裸响应形状。按设计稿写会让每一次好友列表请求
 * 抛 `data.friends 应为数组`。迁移时以后端文档为准，逐个端点核对。
 *
 * @param options.field `data` 上承载数组的字段名；不传则要求 `data` 本身就是数组。
 */
export async function readEnvelopeList<T>(
  response: Response,
  options: Omit<EnvelopeOptions<unknown>, 'parse' | 'require'> & { field?: string },
): Promise<T[]> {
  const { endpoint, field } = options
  const payload = await readEnvelope<unknown>(response, {
    endpoint,
    fallbackMessage: options.fallbackMessage,
    legacyBare: options.legacyBare,
  })

  const list = field === undefined ? payload : isRecord(payload) ? payload[field] : undefined

  if (!Array.isArray(list)) {
    return throwShape(
      field === undefined
        ? `${endpoint}: data 应为数组，实际是 ${describe(payload)}`
        : `${endpoint}: data.${field} 应为数组（收到的键：${
            isRecord(payload) ? Object.keys(payload).join(', ') : describe(payload)
          }）`,
      { status: response.status, endpoint, payload },
    )
  }

  return list as T[]
}

/**
 * 无返回值端点（同意/拒绝好友、删除好友、撤销设备、软删除文件…）专用。
 *
 * 只校验成功与否，不要求有 `data`。允许 204 和空 body。
 * 用它替换掉每个方法里手写的
 * `if (!response.ok) { const error = await response.json().catch(...) ... }` 五行样板。
 *
 * @throws {ApiError} HTTP 非 2xx 或 `success === false`
 */
export async function assertEnvelopeOk(
  response: Response,
  options: { endpoint: string; fallbackMessage?: string },
): Promise<void> {
  const { endpoint, fallbackMessage = '请求失败' } = options
  const body = await readBody(response, endpoint)
  assertOk(response, body, endpoint, fallbackMessage)
}

/**
 * 已经拿到解析后 JSON 时的解包（FormData 上传、WebSocket 推送等）。
 * 语义与 {@link readEnvelope} 完全一致——共用 {@link unwrapData} 与
 * {@link validatePayload}，只是没有 HTTP 状态码可依据，统一记 200。
 */
export function unwrapEnvelope<T>(
  json: unknown,
  options: Omit<EnvelopeOptions<T>, 'fallbackMessage'> & { fallbackMessage?: string },
): T {
  const { endpoint, fallbackMessage = '请求失败' } = options

  if (!isRecord(json)) {
    return throwShape(`${endpoint}: 响应不是 JSON 对象`, { status: 200, endpoint, payload: json })
  }

  const envelope = json as ApiEnvelope
  if (envelope.success === false) {
    throw new ApiError(extractErrorMessage(json, '', 200, fallbackMessage), {
      status: 200,
      code: envelope.code,
      endpoint,
      payload: json,
    })
  }

  const payload = unwrapData(envelope, options, 200)
  return validatePayload(payload, options, 200)
}

/**
 * 是否是 **401** 认证类失败。**只认 401，不认 403。**
 *
 * 供 `src/api/apiClient.ts` 的 `isAuthError` 复用：那里原本靠中英文关键词
 * 模糊匹配 message 来决定要不要静默跳登录，而解包层抛出的 `ApiError` 带的是
 * 真实后端文案，可能一个关键词都不含——不加这一条，401 会不再触发重定向。
 * （关键词兜底档已于本批删除：它把 `PUT /api/profile` 的校验文案
 * `"Validation error: email: Invalid email format"` 判成了会话失效。
 * 现在 `isAuthError` 见到 `ApiError` 就只看状态码。）
 *
 * ## 为什么把 403 排除在外（对设计 §4(e) 的刻意修正）
 *
 * 设计里的代码注释写的是「401/403 走状态码」，但正文只论证了 401 那一半。
 * 本后端的 403 是**普通的权限不足**，不是 token 失效：
 * - `storage/文件存储管理.md`：文件预签名的 403 「`error` 恒为 `权限不足`」，
 *   触发条件是「不是会话参与者」「双方已不是好友」「不是该群活跃成员」；
 * - `groups/群聊管理.md`：全模块统一口径「群存在但调用者无权 ⇒ `403`」；
 * - `profile/个人资料管理.md`：`group_avatar` 且调用者不是群主/管理员 ⇒ `403`。
 *
 * `isAuthError` 判真的后果：`profileStore.settleError`（三个 action 共用）与
 * `friendsStore.handleApiError`（七个 action 共用）会 `silentRedirectToLogin()`
 * （`clearAuth()` + `location.replace('/login')`，不弹任何提示），
 * `chatStore.syncMessages` 则把 `console.error` 降级成 `console.warn`。
 * 若 403 落进来，用户点开一个已失去权限的文件，得到的是
 * **无任何解释的登出**——正是这一层要消灭的失败形态。
 *
 * 403 排除之后，`isAuthError` 见到非 401 的 `ApiError` 就地判假，
 * 因此会正确地作为可见错误向上抛。
 *
 * ⚠️ 反过来也不成立：**401 也不必然是会话失效**。`PUT /api/profile/password`
 * 的"旧密码错误"就是 401（`backend-docs/profile/个人资料管理.md:329-333`）。
 * 这类端点在 `apiClient.ts` 的 `BUSINESS_401_ENDPOINTS` 里逐条排除，
 * 本函数保持"纯状态码判断"的语义不变。真正**在运行时**用到那张表的是各份
 * `fetchWithAuth` 的 401 分支（`isBusiness401Request`，避免"打错密码 →
 * 刷新 token 并重发"），不是本函数下游的分类。
 */
export function isAuthApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401
}
