import { fetchWithAuth } from '@/api/authedFetch'
import { resolveSameOriginUrl } from '@/features/miniapps/api/miniapps'
import { assertEnvelopeOk, readEnvelope } from '@/lib/apiEnvelope'
import { arr, arrayOf, asRecord, bool, str } from '@/lib/apiParse'

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
const stringArray = (r: Record<string, unknown>, key: string, prefix: string): string[] => arr(r, key, prefix).filter((x): x is string => typeof x === 'string')

export function parseOAuthClient(input: unknown): OAuthClient {
  const r = asRecord(input, 'GET /api/oauth/clients 的一项')
  const logo = nullableUrl(r, 'app_logo_url')
  return {
    client_id: str(r, 'client_id'),
    client_type: str(r, 'client_type'),
    app_name: str(r, 'app_name'),
    app_description: looseStr(r, 'app_description'),
    app_homepage_url: nullableUrl(r, 'app_homepage_url'),
    // 与小程序 icon_url 同规则：只认同源 http(s)，站外 → null 不渲染（spec §6.1）
    app_logo_url: logo ? resolveSameOriginUrl(logo) : null,
    redirect_uris: stringArray(r, 'redirect_uris', ''),
    allowed_scopes: stringArray(r, 'allowed_scopes', ''),
    is_active: bool(r, 'is_active'),
    created_at: str(r, 'created_at'),
  }
}

export function parseOAuthGrant(input: unknown): OAuthGrant {
  const r = asRecord(input, 'GET /api/oauth/grants 的一项')
  const logo = nullableUrl(r, 'app_logo_url')
  return {
    id: str(r, 'id'),
    client_id: str(r, 'client_id'),
    app_name: str(r, 'app_name'),
    app_logo_url: logo ? resolveSameOriginUrl(logo) : null,
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
    const logo = nullableUrl(r, 'app_logo_url')
    return { kind: 'consent', app_name: str(r, 'app_name'), app_logo_url: logo ? resolveSameOriginUrl(logo) : null, scopes: stringArray(r, 'scopes', '') }
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
