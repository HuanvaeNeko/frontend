/**
 * Huanvae Chat - Service Worker
 * 
 * @version 1.0.0
 * @description PWA 离线缓存、版本更新、推送通知
 */

// ============================================
// 版本配置
// ============================================
const SW_VERSION = '1.0.1+20260107.0834.5b1297f'
const CACHE_PREFIX = 'huanvae-chat'
const STATIC_CACHE = `${CACHE_PREFIX}-static-v${SW_VERSION}`
const DYNAMIC_CACHE = `${CACHE_PREFIX}-dynamic-v${SW_VERSION}`
const IMAGE_CACHE = `${CACHE_PREFIX}-images-v${SW_VERSION}`

// 当前所有有效的缓存名称
const VALID_CACHES = [STATIC_CACHE, DYNAMIC_CACHE, IMAGE_CACHE]

// ============================================
// 预缓存资源列表
// ============================================
const PRECACHE_ASSETS = [
  '/',
  '/chat/',
  '/login/',
  '/register/',
  '/manifest.json',
  '/logo.svg',
  '/favicon.ico'
]

// 不缓存的路径
const NO_CACHE_PATHS = [
  '/api/',
  '/_next/webpack-hmr',
  '/sw.js'
]

// ============================================
// 安装事件
// ============================================
self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] 安装中...`)
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      
      // 逐个缓存资源，避免单个失败导致全部失败
      const results = await Promise.allSettled(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'no-store' })
            if (response.ok) {
              await cache.put(url, response)
              return { url, success: true }
            }
            return { url, success: false, reason: response.status }
          } catch (error) {
            return { url, success: false, reason: error.message }
          }
        })
      )
      
      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length
      console.log(`[SW ${SW_VERSION}] 预缓存完成: ${succeeded}/${PRECACHE_ASSETS.length}`)
      
      // 立即激活新版本
      await self.skipWaiting()
      console.log(`[SW ${SW_VERSION}] 安装完成，准备激活`)
    })()
  )
})

// ============================================
// 激活事件
// ============================================
self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] 激活中...`)
  
  event.waitUntil(
    (async () => {
      // 清理旧版本缓存
      const cacheNames = await caches.keys()
      const deletions = await Promise.all(
        cacheNames
          .filter(name => name.startsWith(CACHE_PREFIX) && !VALID_CACHES.includes(name))
          .map(async (name) => {
            console.log(`[SW ${SW_VERSION}] 删除旧缓存: ${name}`)
            return caches.delete(name)
          })
      )
      
      if (deletions.length > 0) {
        console.log(`[SW ${SW_VERSION}] 已清理 ${deletions.length} 个旧缓存`)
      }
      
      // 立即接管所有客户端
      await self.clients.claim()
      
      // 通知所有客户端 SW 已更新
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach(client => {
        client.postMessage({
          type: 'SW_ACTIVATED',
          version: SW_VERSION
        })
      })
      
      console.log(`[SW ${SW_VERSION}] 激活完成，已接管 ${clients.length} 个客户端`)
    })()
  )
})

// ============================================
// 请求拦截
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  
  // 跳过非 HTTP(S) 请求
  if (!url.protocol.startsWith('http')) return
  
  // 跳过跨域请求
  if (url.origin !== self.location.origin) return
  
  // 跳过不缓存的路径
  if (NO_CACHE_PATHS.some(path => url.pathname.startsWith(path))) return
  
  // 跳过 WebSocket
  if (request.headers.get('upgrade') === 'websocket') return
  
  // 跳过非 GET 请求（POST、PUT、DELETE 等不能被缓存）
  if (request.method !== 'GET') return
  
  // 根据请求类型选择策略
  if (request.mode === 'navigate') {
    // HTML 页面：网络优先
    event.respondWith(networkFirst(request, DYNAMIC_CACHE))
  } else if (isImageRequest(request)) {
    // 图片：缓存优先，长期缓存
    event.respondWith(cacheFirst(request, IMAGE_CACHE))
  } else if (isStaticAsset(url.pathname)) {
    // JS/CSS 等静态资源：缓存优先
    event.respondWith(cacheFirst(request, STATIC_CACHE))
  } else {
    // 其他请求：Stale-While-Revalidate
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE))
  }
})

// ============================================
// 缓存策略
// ============================================

/**
 * 网络优先策略
 * 适用于需要最新数据的请求（如 HTML 页面）
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request)
    
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    
    return response
  } catch (error) {
    console.log(`[SW] 网络请求失败，尝试缓存: ${request.url}`)
    
    const cached = await caches.match(request)
    if (cached) return cached
    
    // 返回离线页面
    const offlinePage = await caches.match('/')
    if (offlinePage) return offlinePage
    
    return new Response('离线状态 - 请检查网络连接', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
  }
}

/**
 * 缓存优先策略
 * 适用于静态资源
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  
  try {
    const response = await fetch(request)
    
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    
    return response
  } catch (error) {
    return new Response('资源不可用', { status: 503 })
  }
}

/**
 * Stale-While-Revalidate 策略
 * 先返回缓存，同时后台更新
 */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request)
  
  const fetchPromise = (async () => {
    try {
      const response = await fetch(request)
      
      if (response.ok) {
        const cache = await caches.open(cacheName)
        cache.put(request, response.clone())
      }
      
      return response
    } catch (error) {
      return cached || new Response('离线状态', { status: 503 })
    }
  })()
  
  return cached || fetchPromise
}

// ============================================
// 工具函数
// ============================================

function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|eot|otf)$/i.test(pathname)
}

function isImageRequest(request) {
  const accept = request.headers.get('accept') || ''
  if (accept.includes('image/')) return true
  
  const url = new URL(request.url)
  return /\.(png|jpe?g|gif|svg|ico|webp|avif)$/i.test(url.pathname)
}

// ============================================
// 消息处理
// ============================================
self.addEventListener('message', (event) => {
  const { type } = event.data || {}
  
  switch (type) {
    case 'SKIP_WAITING':
      console.log(`[SW ${SW_VERSION}] 收到 SKIP_WAITING，立即激活`)
      self.skipWaiting()
      break
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({
        version: SW_VERSION,
        caches: VALID_CACHES
      })
      break
      
    case 'CLEAR_CACHE':
      caches.keys()
        .then(names => Promise.all(names.map(n => caches.delete(n))))
        .then(() => {
          console.log(`[SW ${SW_VERSION}] 已清除所有缓存`)
          event.ports[0]?.postMessage({ success: true })
        })
        .catch(error => {
          console.error(`[SW ${SW_VERSION}] 清除缓存失败:`, error)
          event.ports[0]?.postMessage({ success: false, error: error.message })
        })
      break
      
    case 'GET_CACHE_SIZE':
      getCacheSize().then(size => {
        event.ports[0]?.postMessage({ size })
      })
      break
      
    default:
      console.log(`[SW ${SW_VERSION}] 未知消息类型:`, type)
  }
})

/**
 * 获取缓存大小
 */
async function getCacheSize() {
  if (!('storage' in navigator && 'estimate' in navigator.storage)) {
    return null
  }
  
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { usage, quota, percent: ((usage / quota) * 100).toFixed(2) }
  } catch {
    return null
  }
}

// ============================================
// 推送通知
// ============================================
self.addEventListener('push', (event) => {
  if (!event.data) return
  
  try {
    const data = event.data.json()
    
    const options = {
      body: data.body || '您有新消息',
      icon: '/logo.svg',
      badge: '/logo.svg',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/chat/',
        ...data.data
      },
      actions: data.actions || [
        { action: 'open', title: '查看' },
        { action: 'dismiss', title: '忽略' }
      ],
      tag: data.tag || 'huanvae-notification',
      renotify: !!data.renotify,
      requireInteraction: !!data.requireInteraction
    }
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Huanvae Chat', options)
    )
  } catch (error) {
    console.error(`[SW ${SW_VERSION}] 推送处理失败:`, error)
  }
})

// 通知点击
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  if (event.action === 'dismiss') return
  
  const url = event.notification.data?.url || '/chat/'
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // 查找已打开的窗口
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        // 打开新窗口
        return self.clients.openWindow?.(url)
      })
  )
})

// 通知关闭
self.addEventListener('notificationclose', (event) => {
  // 可以用于统计通知被忽略的情况
  console.log(`[SW ${SW_VERSION}] 通知被关闭:`, event.notification.tag)
})

// ============================================
// 后台同步
// ============================================
self.addEventListener('sync', (event) => {
  console.log(`[SW ${SW_VERSION}] 后台同步:`, event.tag)
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages())
  }
})

async function syncPendingMessages() {
  // 从 IndexedDB 获取待发送的消息并发送
  // 这里是占位实现，实际需要与应用逻辑集成
  console.log(`[SW ${SW_VERSION}] 同步待发送消息...`)
}

// ============================================
console.log(`[SW ${SW_VERSION}] Service Worker 已加载`)
