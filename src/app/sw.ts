/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { enable as enableNavigationPreload } from 'workbox-navigation-preload'
import { precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { registerRoute, setCatchHandler } from 'workbox-routing'
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

// 过滤掉不该被 precache 的 URL。
// 机制沿用自迁移前的 Serwist 实现：对 self.__WB_MANIFEST 做一次白名单式过滤。
// 列表内容已重新调研（不是照抄迁移前的 6 项）——见迁移记录：
// - `_buildManifest.js` / `_ssgManifest.js` / `_clientMiddlewareManifest.json` /
//   `/_global-error`：Next.js 构建产物 / App Router 保留路由名，RR8 + Vite
//   构建不会生成任何同名文件，已删除。
// - `/_headers`：Cloudflare Pages 的 headers 声明文件约定。仓库里从未出现过
//   这个文件（`public/` 下没有，`build/client/` 构建产物里也没有），且
//   server/index.ts 已经改为在 Bun 里手写安全响应头（见该文件顶部注释），
//   不再有任何路径会产出或依赖 `_headers`，已删除。
// - `version.json`：不是 404 风险，是"必须绕过缓存"——src/lib/version.ts
//   用 `fetch('/version.json', { cache: 'no-store' })` 读取实时构建版本号；
//   若被 SW precache 命中，会让这次请求永远拿到安装当时的旧版本号。保留。
// - `manifest.json`：与 version.json 同理，本次重新调研新增。
//   UpdatePrompt.tsx 两处 `fetch('/manifest.json', { cache: 'no-store' })`
//   同样是用它做"是否有新版本"的实时判断，必须绕开 precache。
//
// 注 1：当前 vite-plugin-pwa 的 injectManifest.globPatterns 用的是官方默认值
// `**/*.{js,wasm,css,html}`（未在 vite.config.ts 里覆盖，与 spike 验证过的
// 配置一致），本身就不会把 .json 纳入 self.__WB_MANIFEST——这两条目前不会
// 命中任何真实 precache 条目（已用真实构建验证：108 个 precache 条目清一色
// 是 assets/*.js 与 assets/*.css）。保留它们是防止将来 globPatterns 改宽之后
// 这两个"必须实时"的文件被静默 precache 而不易察觉，而不是应付当前已知的
// 404 风险。
//
// 注 2：这里不写成 `/version.json`（带前导斜杠）—— 已实测确认 workbox-build
// 产出的 manifest URL 是相对 globDirectory 的裸路径，不带前导斜杠（例如
// `"assets/x-303XsefI.js"`、顶层文件是 `"version.json"`），带斜杠的写法在
// `path.includes(p)` 下永远不会命中顶层文件，是从 Next.js 时代（Serwist 产出
// 的是带前导斜杠的绝对路径）照抄过来会踩的坑。已临时把 globPatterns 加宽到
// 含 json 重新构建、肉眼确认过实际字符串格式，而非假设。
const PRECACHE_SKIP_PATTERNS = ['version.json', 'manifest.json']

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

// 关键改动：self.__SW_MANIFEST（Serwist 专有全局变量）→ self.__WB_MANIFEST
// （vite-plugin-pwa / Workbox injectManifest 注入的全局变量）。
// 漏改这一步不会有任何构建错误或运行时报错——self.__WB_MANIFEST 会被
// 静默替换成空数组，SW 正常安装/激活，但生产环境 precache 会是 0 个文件。
const precacheEntries = (self.__WB_MANIFEST ?? []).filter((e) => !shouldSkipPrecache(e))

precacheAndRoute(precacheEntries)

// ============================================
// 运行时缓存：字体 / 图片 / 未进 precache 的脚本与样式
// ============================================
// 迁移前 Serwist 用 `new Serwist({ ..., runtimeCaching: defaultCache, ... })`。
// `defaultCache`（`@serwist/next/worker` 导出）是一套多规则运行时缓存集合，
// 覆盖图片、字体、音视频、未命中 precache 的脚本/样式等。这次迁移到
// vite-plugin-pwa 时只搬了 precache 和离线兜底，`runtimeCaching` 这部分被
// 漏迁移——workbox 没有现成的"默认缓存集合"可以直接替换，必须手写等价规则，
// 这一段就是补上的部分（review 发现的具体回归点）。
//
// 已用真实构建核实需要覆盖什么：`build/client/assets/` 下 167 个文件，
// 108 个（106 js + 2 css）已被上面的 precache 覆盖，剩下 59 个是字体
// （20 ttf + 20 woff + 19 woff2，`katex` 依赖的数学公式渲染字体，经 Vite
// 处理后带 hash 落在 assets/ 下）——这 59 个文件不在 precache 的 glob
// （`**/*.{js,wasm,css,html}` 不含字体扩展名）里，也没有任何运行时路由兜底，
// 离线时会用回退字体渲染。这是本次要修的具体问题。
//
// 音频/视频：`build/client/` 和 `public/` 下都没有任何音频/视频文件。
// 全仓库搜索过 `<video>`/`<audio>` 用法：WebRTC 通话（`VideoMeeting.tsx`）
// 全部是 `el.srcObject = someMediaStream`，从不发起 fetch，Service Worker
// 的 fetch 事件根本看不到这类请求；聊天视频消息（`MessageVideo.tsx`）和
// 文件预览（`file-preview.tsx`）的 `src` 都是后端返回的 `file_url`/预签名
// URL，指向 `api.huanvae.cn`，属于下面必须排除的 API 源。两种情况都没有
// "本应用自己的同源静态音视频文件"这个场景，所以没有加媒体路由——不是漏做，
// 是确认过这个场景不存在。
//
// 硬性护栏：下面每条规则都显式加了 `isSameOrigin` 同源检查。本项目 REST
// （`https://api.huanvae.cn`）和 WebSocket（`wss://api.huanvae.cn`）都在
// 独立的 API 域名下（见 `src/lib/apiConfig.ts`），与本应用自己的部署域名
// 不同源。用户头像、群头像、聊天文件等一律是后端直接返回的跨源 URL
// （`avatar_url` / `group_avatar_url` / `sender_avatar_url` / `file_url`，
// 见 `src/features/*/api/*.ts` 与 `src/types/models.ts`），天然不会被下面
// 任何一条同源规则命中；不依赖"猜测某个 destination 不会用于 API 请求"这个
// 假设——即使以后某条规则的匹配条件被放宽，同源检查也会先短路掉跨源请求。
// WebSocket 握手请求本身不经过 Service Worker 的 fetch 事件，规范层面就
// 不可能被 `registerRoute` 匹配到，不需要额外处理。
function isSameOrigin(url: URL): boolean {
  return url.origin === self.location.origin
}

// 字体：本次修复的具体目标。CacheFirst + 一年过期——文件名都带内容 hash，
// 换新版本会是全新 URL，不存在"缓存住旧内容"的新鲜度风险，可以放心长缓存。
registerRoute(
  ({ request, url }) => isSameOrigin(url) && request.destination === 'font',
  new CacheFirst({
    cacheName: 'static-font-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
)

// 图片：覆盖 /logo.svg、/favicon.ico 等应用自带的同源图片。不含任何用户
// 头像/群头像/聊天图片——那些都来自 api.huanvae.cn，会被同源检查排除。
// StaleWhileRevalidate：先返回旧缓存、后台悄悄刷新，图片更新不敏感，不需要
// CacheFirst 那种"命中后绝不重新请求直到过期"的强语义。
registerRoute(
  ({ request, url }) => isSameOrigin(url) && request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'static-image-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

// 脚本/样式：当前 106+2=108 就是这次构建全部的 js/css，precache 已经
// 100% 覆盖，这条规则现阶段不会有实际命中——保留作为版本切换瞬间（旧 SW
// 的 precache 清单里还没有新部署刚产出的某个 chunk）之类边缘场景的兜底网。
// 同样必须限定同源 + 加过期，避免变成一个悄悄增长的无界缓存。
registerRoute(
  ({ request, url }) =>
    isSameOrigin(url) && (request.destination === 'script' || request.destination === 'style'),
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
)

// ============================================
// 离线兜底页
// ============================================
// Serwist 的 `fallbacks.entries` 在这套技术栈里没有直接等价物：它假设兜底页
// 是构建期产出的静态文件，可以直接进 precache manifest。但 RR8 这里
// `ssr: true`（见 react-router.config.ts），/~offline 和其余路由一样是
// 服务端按请求动态渲染的，build/client/ 下不存在任何 .html 产物可供
// precache（已用真实构建验证：构建产物里没有一个 *.html 文件）。
//
// 改用 Workbox 标准的"离线兜底"写法：SW install 时主动把 /~offline 当前
// 的服务端渲染结果拉一份放进独立的 Cache Storage 分区；导航请求失败时
// （即离线时 NetworkOnly 抛错）从这个分区兜底返回。install 每次 SW 更新都
// 会重新执行一次，所以这份兜底页内容会随每次部署自动刷新，不会永久卡在
// 第一次安装时的旧文案。
const OFFLINE_URL = '/~offline'
const OFFLINE_CACHE = 'offline-fallback'

// .catch(() => {}) 是故意的，不是疏漏。precacheAndRoute() 在本文件顶部已经
// 注册了它自己的 install 监听器，而 SW 规范里 install 事件只有在"每一个"
// 监听器传给 waitUntil 的 promise 都 resolve 时才算成功——任何一个 reject，
// 整个 SW 安装失败。这里的 cache.add(OFFLINE_URL) 不是读本地文件，是对
// /~offline 发一次真实网络请求（该路由是 ssr: true 下动态渲染的，见下方
// "离线兜底页"一节），一旦这次请求失败（网络瞬时抖动，或那条路由自己 SSR
// 报错），会连累上面 precacheAndRoute() 的 install 一起判定失败：不是"没有
// 离线兜底页"这么轻，而是 109 条 precache 全部落空、字体/图片/脚本运行时
// 缓存规则也全部不会注册，SW 直接没装上。迁移前的 Serwist 实现能避开这个
// 坑是因为离线页当时是构建期产出的静态文件、走的是 precache 白名单机制（见
// 上面 PRECACHE_SKIP_PATTERNS 的注释）；现在它是运行时抓取，不能照搬同一套
// 假设。吞掉这里的失败：`没有离线兜底页` 严格好于 `完全没有 Service Worker`。
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => {})
  )
})

// navigationPreload：和迁移前的 `navigationPreload: true` 等价，
// Workbox 各 Strategy 内部会自动使用 event.preloadResponse（如果可用）。
if (self.registration) {
  enableNavigationPreload()
}

// 必须显式给导航请求注册一个 route，setCatchHandler 才有机会被触发——
// Workbox 的 Router 只在"命中的 route 的 handler 抛错"时才调用
// catchHandler；如果一个请求完全没有匹配到任何 route，Router 会直接
// 放行给浏览器自己处理网络请求，此时 catchHandler 根本不会被调用，离线
// 时会看到浏览器自带的网络错误页而不是 /~offline（已确认这是 Workbox
// Router 的既定行为，不是本项目特有问题）。
registerRoute(({ request }) => request.mode === 'navigate', new NetworkOnly())

// 沿用迁移前 fallbacks.entries 里同样的匹配条件：request.destination === 'document'。
// 注意：workbox-routing 的 RouteHandlerCallbackOptions 把 `request` 作为跟
// `event` 平级的字段（{ event: ExtendableEvent, request: Request, url }），
// `event` 本身的类型是纯 ExtendableEvent，不带 `.request`——写成
// `event.request` 类型检查会报 `Property 'request' does not exist on type
// 'ExtendableEvent'`（已用隔离的 tsc 检查实测复现），运行时也会在离线兜底
// 真正触发的那一刻直接抛 TypeError，等于兜底逻辑本身先崩溃。必须解构顶层的
// `request`，而不是 `event.request`。
setCatchHandler(async ({ request }) => {
  if (request.destination !== 'document') return Response.error()

  const path = new URL(request.url).pathname

  // 关键：不能对着「原始请求的 URL」直接把 /~offline 缓存的 HTML 当响应体
  // 返回。本项目是 RR8 SSR + 客户端 hydration：如果地址栏/`location.pathname`
  // 停在原始路径（比如 /app/chat），而响应体却是 /~offline 路由的服务端渲染
  // 结果，客户端 hydrate 时会发现两者对不上，React Router 会按当前 URL
  // 重新做一次客户端路由决议（并为此发一次 manifest patch 请求，离线时同样
  // 会失败），结果整页被客户端重渲成应用自己的 404 页，离线提示页只闪现
  // 一帧就被盖掉——已用一个真实离线场景实测复现（断网后访问未预缓存的路径，
  // 首帧是离线页，随即被 404 页覆盖）。
  // 用一次 302 重定向到 /~offline，让浏览器发起对 /~offline 本身的新导航——
  // 那次请求同样会被本 catch handler 处理，但 request.url 这时才真的是
  // /~offline，会落进下面 `path === OFFLINE_URL` 分支直接返回缓存内容，
  // 此时 location.pathname 与渲染内容一致，hydration 不会再判定不匹配。
  // 只有已经在 /~offline 本身失败时才直接兜底，避免重定向死循环。
  if (path !== OFFLINE_URL) {
    return Response.redirect(OFFLINE_URL, 302)
  }

  const cache = await caches.open(OFFLINE_CACHE)
  return (await cache.match(OFFLINE_URL)) ?? Response.error()
})

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
    case 'SKIP_WAITING':
      self.skipWaiting()
      break

    case 'GET_VERSION':
      event.ports[0]?.postMessage({
        version: 'workbox',
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

console.log('[SW] Service Worker 已加载')
