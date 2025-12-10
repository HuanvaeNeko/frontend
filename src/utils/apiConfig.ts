/**
 * 根据环境自动判断 API 基础地址
 * 开发环境: http://192.168.9.11:8080
 * 生产环境: https://api.huanvae.cn
 */
export const getApiBaseUrl = (): string => {
  // 如果设置了环境变量，优先使用
  if (import.meta.env.VITE_AUTH_API_URL) {
    return import.meta.env.VITE_AUTH_API_URL
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
