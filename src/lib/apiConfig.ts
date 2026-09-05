/**
 * API 配置工具
 * 统一使用 api.huanvae.cn 作为 API 地址
 */

const API_BASE_URL_STORAGE_KEY = 'huanvae.api-base-url'
const DEFAULT_API_BASE_URL = 'https://api.huanvae.cn'

function canUseStorage(): boolean {
  return typeof window !== 'undefined'
}

function getStoredApiBaseUrl(): string | null {
  if (!canUseStorage()) return null
  try {
    return localStorage.getItem(API_BASE_URL_STORAGE_KEY)
  } catch {
    return null
  }
}

export function normalizeApiBaseUrl(rawValue: string): string {
  const input = rawValue.trim()
  if (!input) throw new Error('服务器地址不能为空')

  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`
  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    throw new Error('服务器地址格式无效')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http 或 https 协议')
  }

  return parsed.origin
}

export function setApiBaseUrl(url: string): void {
  if (!canUseStorage()) return
  const normalized = normalizeApiBaseUrl(url)
  try {
    localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized)
  } catch {
    // ignore
  }
}

export function clearApiBaseUrl(): void {
  if (!canUseStorage()) return
  try {
    localStorage.removeItem(API_BASE_URL_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * 获取 API 基础地址
 * 统一使用: https://api.huanvae.cn
 */
export const getApiBaseUrl = (): string => {
  const stored = getStoredApiBaseUrl()
  if (stored) return stored

  // 如果设置了环境变量，优先使用
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  // 统一使用生产 API 地址
  return DEFAULT_API_BASE_URL
}

/**
 * 获取认证 API 地址
 */
export const getAuthApiUrl = (): string => {
  return `${getApiBaseUrl()}/api/auth`
}

/**
 * 获取 WebSocket 地址
 * 统一使用: wss://api.huanvae.cn
 */
export const getWsUrl = (): string => {
  // 如果设置了环境变量，优先使用
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }

  const apiBaseUrl = getApiBaseUrl()
  const url = new URL(apiBaseUrl)
  
  // 更换协议为 WebSocket
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  
  return url.origin
}
