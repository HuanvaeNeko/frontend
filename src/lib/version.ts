/**
 * 版本管理工具
 * 用于跟踪应用版本和 Service Worker 版本
 * 
 * 版本号在构建时自动生成，格式：{major}.{minor}.{patch}+{buildId}.{gitHash}
 */

// 从环境变量读取版本号（构建时注入）或使用默认值
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0'

// 构建时间戳
export const BUILD_TIME = import.meta.env.VITE_BUILD_TIME || new Date().toISOString()

/**
 * 完整版本信息接口
 */
export interface VersionInfo {
  version: string
  baseVersion: string
  buildId: string
  gitHash: string | null
  buildTime: string
}

/**
 * 从 version.json 获取完整版本信息
 * 此文件在构建时自动生成
 */
export async function fetchVersionInfo(): Promise<VersionInfo | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' })
    if (response.ok) {
      return await response.json()
    }
    return null
  } catch {
    return null
  }
}

/**
 * 获取基础版本信息（同步）
 */
export function getVersionInfo() {
  return {
    app: APP_VERSION,
    buildTime: BUILD_TIME
  }
}

/**
 * 比较版本号（仅比较基础版本部分）
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  // 移除 build metadata（+后面的部分）
  const normalize = (v: string) => {
    const base = v.replace(/^v/, '').split('+')[0]
    return base.split('.').map(n => parseInt(n, 10) || 0)
  }
  
  const parts1 = normalize(v1)
  const parts2 = normalize(v2)
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

/**
 * 从 Service Worker 获取版本
 */
export async function getSWVersion(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null
  
  try {
    // 检查是否有已激活的 SW，避免在注册前调用
    const registration = await navigator.serviceWorker.getRegistration()
    const activeWorker = registration?.active
    if (!activeWorker) return null
    
    return new Promise((resolve) => {
      let resolved = false
      const messageChannel = new MessageChannel()
      
      // 超时处理
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true
          messageChannel.port1.close()
          resolve(null)
        }
      }, 1000)
      
      messageChannel.port1.onmessage = (event) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeoutId)
          resolve(event.data?.version || null)
        }
      }
      
      activeWorker.postMessage(
        { type: 'GET_VERSION' },
        [messageChannel.port2]
      )
    })
  } catch {
    return null
  }
}

/**
 * 清除所有 SW 缓存
 */
export async function clearSWCache(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const activeWorker = registration?.active
    if (!activeWorker) return false
    
    return new Promise((resolve) => {
      let resolved = false
      const messageChannel = new MessageChannel()
      
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true
          messageChannel.port1.close()
          resolve(false)
        }
      }, 3000)
      
      messageChannel.port1.onmessage = (event) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeoutId)
          resolve(event.data?.success || false)
        }
      }
      
      activeWorker.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      )
    })
  } catch {
    return false
  }
}

/**
 * 强制更新 Service Worker
 */
export async function forceUpdateSW(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (registration) {
      await registration.update()
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
    }
  } catch (error) {
    console.error('强制更新 SW 失败:', error)
  }
}

/**
 * 注销 Service Worker
 */
export async function unregisterSW(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (registration) {
      return await registration.unregister()
    }
    return false
  } catch {
    return false
  }
}
