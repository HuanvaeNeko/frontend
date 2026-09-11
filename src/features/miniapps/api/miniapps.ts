import { fetchWithAuth } from '@/api/authedFetch'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { readEnvelope } from '@/lib/apiEnvelope'
import { arrayOf, asRecord, str } from '@/lib/apiParse'

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

/**
 * 只把「同源、http(s)」的地址放行，否则一律 `null`（终审 finding #6）。
 *
 * `toAbsoluteApiUrl` 对任意带 scheme 的字符串（含 `javascript:`）原样放行——它的职责
 * 是"把相对路径补成绝对地址"，不是"校验这是不是一个安全的可打开地址"。后端返回的
 * `access_url`/`icon_url` 若被污染成 `javascript:` 或站外 `https://evil.example/...`，
 * 未经校验地喂给 `window.open` / `<img src>` 就是一个由后端数据驱动的开放跳转/任意
 * 图片请求。这里用 `URL` 重新解析一遍，只认与当前页面同源的 `http(s)` 地址。
 */
export function resolveSameOriginUrl(raw: string): string | null {
  try {
    const url = new URL(toAbsoluteApiUrl(raw) ?? raw, location.origin)
    if (url.origin !== location.origin) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

export function parseMiniAppSummary(input: unknown): MiniAppSummary {
  const r = asRecord(input, 'GET /api/miniapps/my 的一项')
  return {
    miniapp_id: str(r, 'miniapp_id'),
    name: str(r, 'name'),
    display_name: str(r, 'display_name'),
    description: typeof r.description === 'string' ? r.description : '',
    // icon_url 经同源校验（非同源 → null），access_url 原样保留给 resolveSameOriginUrl
    // 在渲染处再校验一次——两个字段用途不同：前者直接进 <img src>，后者要能在校验失败时
    // 仍然把原始值透出去供排查，校验结果由调用点决定要不要渲染「打开」按钮。
    icon_url: typeof r.icon_url === 'string' && r.icon_url !== '' ? resolveSameOriginUrl(r.icon_url) : null,
    access_url: str(r, 'access_url'),
    status: str(r, 'status'),
  }
}

export const miniappsApi = {
  listMy: async (): Promise<MiniAppSummary[]> => {
    const response = await fetchWithAuth('/api/miniapps/my')
    return readEnvelope<MiniAppSummary[]>(response, {
      endpoint: 'GET /api/miniapps/my',
      fallbackMessage: '加载小程序失败',
      parse: arrayOf(parseMiniAppSummary),
    })
  },
}
