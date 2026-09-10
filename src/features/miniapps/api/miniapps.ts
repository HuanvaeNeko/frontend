import { fetchWithAuth } from '@/api/authedFetch'
import { readEnvelopeList } from '@/lib/apiEnvelope'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'

/** `GET /api/miniapps/my` 一条 */
export interface MiniAppSummary {
  miniapp_id: string
  name: string
  display_name: string
  description: string
  icon_url: string | null
  access_url: string
  status: string
}

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`GET /api/miniapps/my: ${field} 缺失或不是字符串`)
  return v
}

export function parseMiniAppSummary(input: unknown): MiniAppSummary {
  const r = (input ?? {}) as Record<string, unknown>
  return {
    miniapp_id: str(r.miniapp_id, 'miniapp_id'),
    name: str(r.name, 'name'),
    display_name: str(r.display_name, 'display_name'),
    description: typeof r.description === 'string' ? r.description : '',
    icon_url: typeof r.icon_url === 'string' && r.icon_url !== '' ? (toAbsoluteApiUrl(r.icon_url) ?? null) : null,
    access_url: str(r.access_url, 'access_url'),
    status: str(r.status, 'status'),
  }
}

export const miniappsApi = {
  listMy: async (): Promise<MiniAppSummary[]> => {
    const response = await fetchWithAuth('/api/miniapps/my')
    const items = await readEnvelopeList<unknown>(response, { endpoint: 'GET /api/miniapps/my', fallbackMessage: '加载小程序失败' })
    return items.map(parseMiniAppSummary)
  },
}
