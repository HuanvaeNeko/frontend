/**
 * 「业务 401」：后端用 401 表达一个**业务**结果，而不是「你的会话失效了」。
 *
 * 目前只有一条：`PUT /api/profile/password` 的旧密码错误。文档
 * `backend-docs/profile/个人资料管理.md` §4 明写「旧密码验证失败返回 401 状态码」。
 *
 * 这张表有**两个**消费方，所以必须住在 src/lib 而不是某一侧：
 * - 客户端 `api/authedFetch.ts`：401 时决定要不要 clearAuth + 跳登录页；
 * - 服务端 `app/routes/api.$.ts`（BFF）：401 时决定要不要删会话。
 *
 * 漏掉服务端那一侧的后果：用户打错一次当前密码 → BFF 删会话 → 被踢下线。
 *
 * ⚠️ 往这张表里加一行**不会**自动全仓生效：只有真正查询它的那两处会读到。
 * 新增消费方要自己接上。
 */
export const BUSINESS_401_ENDPOINTS: ReadonlySet<string> = new Set(['PUT /api/profile/password'])

/** `ApiError.endpoint` 形态（`METHOD /path`）的查询 */
export const isBusiness401Endpoint = (endpoint: string): boolean => BUSINESS_401_ENDPOINTS.has(endpoint)

/**
 * 方法 + pathname 形态的查询。query / hash 不参与。
 *
 * method 缺失时判**假**：判假 = 维持原来的会话失效处理，不会凭空多出一条
 * 「某个 401 被当成业务结果而放过」的静默路径。
 */
export const isBusiness401Path = (method: string | undefined, pathname: string): boolean => {
  if (method === undefined) return false
  return BUSINESS_401_ENDPOINTS.has(`${method.toUpperCase()} ${pathname}`)
}
