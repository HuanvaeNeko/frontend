/**
 * 根据环境自动判断 API 基础地址
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
