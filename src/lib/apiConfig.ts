/**
 * API 配置工具
 * 根据环境自动判断 API 基础地址
 */

/**
 * 获取 API 基础地址
 * 开发环境: http://192.168.9.11:8080
 * 生产环境: https://api.huanvae.cn
 */
export const getApiBaseUrl = (): string => {
  // 如果设置了环境变量，优先使用
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }

  // 在服务端渲染时，使用默认值
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV === 'production' 
      ? 'https://api.huanvae.cn' 
      : 'http://192.168.9.11'
  }

  // 根据当前域名判断环境
  const hostname = window.location.hostname
  
  // 生产环境判断
  if (hostname === 'api.huanvae.cn' || hostname.includes('huanvae.cn')) {
    return 'https://api.huanvae.cn'
  }

  // 开发环境默认地址
  return 'http://192.168.9.11'
}

/**
 * 获取认证 API 地址
 */
export const getAuthApiUrl = (): string => {
  return `${getApiBaseUrl()}/api/auth`
}

/**
 * 获取 WebSocket 地址
 * 开发环境: ws://192.168.9.11:3001
 * 生产环境: wss://api.huanvae.cn (使用默认端口)
 */
export const getWsUrl = (): string => {
  // 如果设置了环境变量，优先使用
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL
  }

  const apiBaseUrl = getApiBaseUrl()
  const url = new URL(apiBaseUrl)
  
  // 更换协议
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  
  // 生产环境使用默认端口（通常通过反向代理）
  if (url.hostname.includes('huanvae.cn')) {
    return url.origin
  }
  
  // 开发环境添加 WebSocket 端口
  url.port = '3001'
  return url.origin
}

