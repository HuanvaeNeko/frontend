/**
 * API 配置工具
 * 统一使用 api.huanvae.cn 作为 API 地址
 */

/**
 * 获取 API 基础地址
 * 统一使用: https://api.huanvae.cn
 */
export const getApiBaseUrl = (): string => {
  // 如果设置了环境变量，优先使用
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }

  // 统一使用生产 API 地址
  return 'https://api.huanvae.cn'
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
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL
  }

  const apiBaseUrl = getApiBaseUrl()
  const url = new URL(apiBaseUrl)
  
  // 更换协议为 WebSocket
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  
  return url.origin
}

