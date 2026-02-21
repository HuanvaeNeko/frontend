/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

// TypeScript 类型声明
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// 过滤掉部署后可能 404 的 URL，避免 bad-precaching-response 导致 SW 安装失败
// （/~offline 有对应页面且需被 fallback 使用，故不排除）
const PRECACHE_SKIP_PATTERNS = [
  '/_global-error',
  '/_headers',
  '/version.json',
  '_clientMiddlewareManifest.json',
  '_buildManifest.js',
  '_ssgManifest.js',
]

function getPath(entry: PrecacheEntry | string): string {
  const url = typeof entry === 'string' ? entry : entry.url
  try {
    return url.startsWith('http') ? new URL(url).pathname : url
  } catch {
    return url
  }
}

function shouldSkipPrecache(entry: PrecacheEntry | string): boolean {
  const path = getPath(entry)
  return PRECACHE_SKIP_PATTERNS.some((p) => path.includes(p))
}

const precacheEntries = (self.__SW_MANIFEST ?? []).filter(
  (e) => !shouldSkipPrecache(e)
)

// 创建 Serwist 实例
const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

// 注册 Serwist 事件监听器
serwist.addEventListeners()

// ============================================
// 自定义功能：推送通知
// ============================================
self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()

    // 使用扩展的通知选项（包含非标准但广泛支持的属性）
    const options = {
      body: data.body || '您有新消息',
      icon: '/logo.svg',
      badge: '/logo.svg',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/app/chat/',
        ...data.data,
      },
      actions: data.actions || [
        { action: 'open', title: '查看' },
        { action: 'dismiss', title: '忽略' },
      ],
      tag: data.tag || 'huanvae-notification',
      renotify: !!data.renotify,
      requireInteraction: !!data.requireInteraction,
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'Huanvae Chat', options)
    )
  } catch (error) {
    console.error('[SW] 推送处理失败:', error)
  }
})

// 通知点击处理
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = (event.notification.data as { url?: string })?.url || '/app/chat/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
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
  console.log('[SW] 通知被关闭:', event.notification.tag)
})

// ============================================
// 自定义功能：后台同步
// ============================================
self.addEventListener('sync', (event) => {
  console.log('[SW] 后台同步:', event.tag)

  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages())
  }
})

async function syncPendingMessages() {
  // 从 IndexedDB 获取待发送的消息并发送
  console.log('[SW] 同步待发送消息...')
}

// ============================================
// 自定义消息处理
// ============================================
self.addEventListener('message', (event) => {
  const { type } = event.data || {}

  switch (type) {
    case 'GET_VERSION':
      event.ports[0]?.postMessage({
        version: 'serwist',
      })
      break

    case 'CLEAR_CACHE':
      caches
        .keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .then(() => {
          console.log('[SW] 已清除所有缓存')
          event.ports[0]?.postMessage({ success: true })
        })
        .catch((error: Error) => {
          console.error('[SW] 清除缓存失败:', error)
          event.ports[0]?.postMessage({ success: false, error: error.message })
        })
      break
  }
})

console.log('[SW] Serwist Service Worker 已加载')
