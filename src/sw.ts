import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

// 预缓存所有构建资产
precacheAndRoute(self.__WB_MANIFEST)

// API 请求使用 Network First 策略
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
  })
)

// 图片使用 Cache First 策略
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-cache',
  })
)

