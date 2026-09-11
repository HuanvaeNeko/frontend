import { fetchWithAuth } from '@/api/authedFetch'
import { resolveSameOriginUrl } from '@/features/miniapps/api/miniapps'
import { assertEnvelopeOk, readEnvelope } from '@/lib/apiEnvelope'
import { arr, arrayOf, asRecord, bool, describe, str } from '@/lib/apiParse'

/** backend-docs oauth/OAuth授权服务器API.md（本期只调下面七个端点；token / userinfo / revoke 是第三方与后端之间的接口） */

export interface OAuthClient { client_id: string; client_type: string; app_name: string; app_description: string; app_homepage_url: string | null; app_logo_url: string | null; redirect_uris: string[]; allowed_scopes: string[]; is_active: boolean; created_at: string }
export interface CreateClientRequest { app_name: string; app_description?: string; app_homepage_url?: string; app_logo_url?: string; redirect_uris: string[]; scopes?: string[] }
export interface CreateClientResponse { client_id: string; client_secret: string; app_name: string }
export interface OAuthGrant { id: string; client_id: string; app_name: string; app_logo_url: string | null; scope: string; created_at: string }
export interface AuthorizeRequest { client_id: string; redirect_uri: string; scope?: string; state?: string; code_challenge?: string; code_challenge_method?: 'S256'; consent?: boolean }
export type AuthorizeResult =
  | { kind: 'code'; code: string; state: string | null; redirect_uri: string }
  | { kind: 'consent'; app_name: string; app_logo_url: string | null; scopes: string[] }

export const OAUTH_SCOPES = ['profile', 'email', 'friends', 'groups'] as const

/** 已知 scope → i18n key；未知的原样返回（t() 对不存在的 key 回显 key，屏幕上就是 scope 原文） */
export function scopeLabelKey(scope: string): string {
  return (OAUTH_SCOPES as readonly string[]).includes(scope) ? `shell.oauth.scopes.${scope}` : scope
}

/** 可为空串或 null 的字符串字段：不用 str()（它拒绝空串） */
const looseStr = (r: Record<string, unknown>, key: string): string => (typeof r[key] === 'string' ? (r[key] as string) : '')
const nullableUrl = (r: Record<string, unknown>, key: string): string | null => (typeof r[key] === 'string' && r[key] !== '' ? (r[key] as string) : null)

/**
 * `app_logo_url` 的同源门禁，`parseOAuthClient` / `parseOAuthGrant` / `parseAuthorizeResult`
 * 三个解析器共用——抽成一个函数是为了让"三处同源校验逻辑一致"是编译期事实，不是三份
 * 手写表达式凑巧长得一样的巧合（修复第 2 轮：复审发现原先三行 `logo ? resolveSameOriginUrl(logo)
 * : null` 是各自独立的表达式，`parseAuthorizeResult` 的 consent 分支因此完全没有用例覆盖到）。
 *
 * 同源门禁本身是刻意的隐私取舍，不是照抄小程序 icon_url 规则的副作用（修复第 1 轮 Important #2）：
 * 这份列表和 authorize 同意页都是用户判断"这是不是我以为的那个应用"的地方，`<img src>` 一旦
 * 指向第三方，就是每次打开这个页面都把用户的 IP / UA / 访问时间发给那个第三方——而 logo 是
 * 应用注册者自填的字段，完全可以是一枚跟踪像素。backend-docs `oauth/OAuth授权服务器API.md`
 * 自己的示例就是站外地址（`https://example.com/logo.png`），文档还写明只有「内部小程序」
 * 客户端的 app_logo_url 由审批流自动取小程序同源 icon_url 填充——外部客户端的 logo 按契约
 * 设计本来就是站外地址，所以这里**预期**会有相当比例的已授权应用退化成首字母头像，这不是 bug。
 * APP 端用 `services/secureProxy` 的 `resolveDisplayUrl` 走同源代理显示站外 logo；Web 这一期
 * 没有那层代理，在代理落地之前不加载站外图片是更保守、也更省事的选择。要放行站外 logo，
 * 正确做法是补一层同源图片代理，不是放宽这里的同源校验。
 */
function sameOriginLogo(r: Record<string, unknown>): string | null {
  const logo = nullableUrl(r, 'app_logo_url')
  return logo ? resolveSameOriginUrl(logo) : null
}

/**
 * 字符串数组字段。`arr()` 只保证「是数组」，元素类型必须逐个再查一遍——
 * 本文件其余字段（`client_id` / `is_active` / `created_at`...）都是一错就让整行抛，
 * 这里若用 `filter` 悄悄丢掉类型不对的元素，就成了唯独这一处放行「部分错误」：
 * 和 `arr()` 自己的 JSDoc（"不返回 `[]` 兜底"）互相矛盾，也让"后端数据变脏"
 * 伪装成"数组变短了"，`[api-shape]` 上报链路完全不会触发。所以元素类型不对
 * 必须抛，不静默过滤（修复第 1 轮 Important #1）。
 */
const stringArray = (r: Record<string, unknown>, key: string, prefix: string): string[] =>
  arr(r, key, prefix).map((value, i) => {
    if (typeof value !== 'string') {
      throw new Error(`${prefix}${key}[${i}] 应为字符串，实际是 ${describe(value)}`)
    }
    return value
  })

export function parseOAuthClient(input: unknown): OAuthClient {
  const r = asRecord(input, 'GET /api/oauth/clients 的一项')
  return {
    client_id: str(r, 'client_id'),
    client_type: str(r, 'client_type'),
    app_name: str(r, 'app_name'),
    app_description: looseStr(r, 'app_description'),
    // ⚠️ app_homepage_url 目前只判「非空字符串」，不做协议/同源校验——`javascript:` 能
    // 原样通过。本任务没有把它渲染成 <a href> 或喂给 window.open，先不动；哪个任务要用它
    // 做可点击链接，必须先在那里过一遍协议校验，不能假设这里已经挡过（修复第 1 轮 Important #2）。
    app_homepage_url: nullableUrl(r, 'app_homepage_url'),
    // 同源门禁，理由见 sameOriginLogo 上方注释
    app_logo_url: sameOriginLogo(r),
    redirect_uris: stringArray(r, 'redirect_uris', ''),
    allowed_scopes: stringArray(r, 'allowed_scopes', ''),
    is_active: bool(r, 'is_active'),
    created_at: str(r, 'created_at'),
  }
}

export function parseOAuthGrant(input: unknown): OAuthGrant {
  const r = asRecord(input, 'GET /api/oauth/grants 的一项')
  return {
    id: str(r, 'id'),
    client_id: str(r, 'client_id'),
    app_name: str(r, 'app_name'),
    // 同源门禁，理由见 sameOriginLogo 上方注释
    app_logo_url: sameOriginLogo(r),
    scope: looseStr(r, 'scope'),
    created_at: str(r, 'created_at'),
  }
}

function parseCreateClientResponse(input: unknown): CreateClientResponse {
  const r = asRecord(input, 'POST /api/oauth/clients 的 data')
  return { client_id: str(r, 'client_id'), client_secret: str(r, 'client_secret'), app_name: str(r, 'app_name') }
}

export function parseAuthorizeResult(input: unknown): AuthorizeResult {
  const r = asRecord(input, 'POST /api/oauth/authorize 的 data')
  if (r.consent_required === true) {
    // 同源门禁，理由见 sameOriginLogo 上方注释——同意页正是用户核对"这是不是我以为的那个应用"
    // 的最后一道关口，更不该在这里悄悄放行一枚指向第三方的跟踪像素。
    return { kind: 'consent', app_name: str(r, 'app_name'), app_logo_url: sameOriginLogo(r), scopes: stringArray(r, 'scopes', '') }
  }
  return { kind: 'code', code: str(r, 'code'), state: typeof r.state === 'string' ? r.state : null, redirect_uri: str(r, 'redirect_uri') }
}

const parser = <T>(parse: (input: unknown) => T) => ({ parse })

export const oauthApi = {
  listClients: async (): Promise<OAuthClient[]> => {
    const response = await fetchWithAuth('/api/oauth/clients')
    return readEnvelope<OAuthClient[]>(response, { endpoint: 'GET /api/oauth/clients', fallbackMessage: '加载 OAuth 客户端失败', parse: arrayOf(parseOAuthClient) })
  },
  createClient: async (req: CreateClientRequest): Promise<CreateClientResponse> => {
    const response = await fetchWithAuth('/api/oauth/clients', { method: 'POST', body: JSON.stringify(req) })
    return readEnvelope<CreateClientResponse>(response, { endpoint: 'POST /api/oauth/clients', fallbackMessage: '创建客户端失败', parse: parser(parseCreateClientResponse) })
  },
  deleteClient: async (clientId: string): Promise<void> => {
    const response = await fetchWithAuth(`/api/oauth/clients/${encodeURIComponent(clientId)}`, { method: 'DELETE' })
    await assertEnvelopeOk(response, { endpoint: 'DELETE /api/oauth/clients/{client_id}', fallbackMessage: '删除客户端失败' })
  },
  resetClientSecret: async (clientId: string): Promise<{ client_secret: string }> => {
    const response = await fetchWithAuth(`/api/oauth/clients/${encodeURIComponent(clientId)}/reset-secret`, { method: 'POST', body: '{}' })
    return readEnvelope<{ client_secret: string }>(response, {
      endpoint: 'POST /api/oauth/clients/{client_id}/reset-secret',
      fallbackMessage: '重置密钥失败',
      parse: parser((input) => ({ client_secret: str(asRecord(input, 'reset-secret 的 data'), 'client_secret') })),
    })
  },
  listGrants: async (): Promise<OAuthGrant[]> => {
    const response = await fetchWithAuth('/api/oauth/grants')
    return readEnvelope<OAuthGrant[]>(response, { endpoint: 'GET /api/oauth/grants', fallbackMessage: '加载已授权应用失败', parse: arrayOf(parseOAuthGrant) })
  },
  revokeGrant: async (grantId: string): Promise<void> => {
    const response = await fetchWithAuth(`/api/oauth/grants/${encodeURIComponent(grantId)}`, { method: 'DELETE' })
    await assertEnvelopeOk(response, { endpoint: 'DELETE /api/oauth/grants/{grant_id}', fallbackMessage: '取消授权失败' })
  },
  authorize: async (req: AuthorizeRequest): Promise<AuthorizeResult> => {
    const response = await fetchWithAuth('/api/oauth/authorize', { method: 'POST', body: JSON.stringify(req) })
    return readEnvelope<AuthorizeResult>(response, { endpoint: 'POST /api/oauth/authorize', fallbackMessage: '授权请求失败', parse: parser(parseAuthorizeResult) })
  },
}
