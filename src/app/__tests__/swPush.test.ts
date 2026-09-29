import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Service Worker 推送的兜底文案（载荷没带 body / actions 时）按浏览器语言挑：zh* 中文，其余英文。
 * SW 不 import 页面那套 i18n 字典（理由见 sw.ts 里 PUSH_FALLBACK_TEXT 的注释），所以这里单独钉。
 *
 * sw.ts 顶层就在注册 workbox 路由，workbox 各模块一律换成桩；happy-dom 里 `self` 就是 window，
 * `push` 监听器挂在 window 上，直接派发一个带 data / waitUntil 的事件即可。
 *
 * 用非字面量路径动态 import：sw.ts 在 tsconfig 里被 exclude（它用的是 webworker lib，与 dom lib
 * 冲突），静态 import 会把它拖进 `tsc --noEmit` 的检查范围。
 */
vi.mock('workbox-cacheable-response', () => ({ CacheableResponsePlugin: class {} }))
vi.mock('workbox-expiration', () => ({ ExpirationPlugin: class {} }))
vi.mock('workbox-navigation-preload', () => ({ enable: vi.fn() }))
vi.mock('workbox-precaching', () => ({ precacheAndRoute: vi.fn() }))
vi.mock('workbox-routing', () => ({ registerRoute: vi.fn(), setCatchHandler: vi.fn() }))
vi.mock('workbox-strategies', () => ({ CacheFirst: class {}, NetworkOnly: class {}, StaleWhileRevalidate: class {} }))

// 故意声明成 string：字面量路径会让 tsc 顺着 import 把 sw.ts 拖进检查范围
const SW_MODULE: string = '../sw'
const showNotification = vi.fn()

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  Object.defineProperty(window, 'registration', { value: { showNotification }, configurable: true })
  await import(/* @vite-ignore */ SW_MODULE)
})

afterAll(() => {
  Reflect.deleteProperty(window, 'registration')
  vi.restoreAllMocks()
})

beforeEach(() => showNotification.mockClear())

function push(payload: Record<string, unknown>) {
  const event = Object.assign(new Event('push'), { data: { json: () => payload }, waitUntil: vi.fn() })
  window.dispatchEvent(event)
  expect(showNotification).toHaveBeenCalledTimes(1)
  const [title, options] = showNotification.mock.calls[0] as [string, { body: string; actions: { action: string; title: string }[] }]
  return { title, body: options.body, actions: options.actions.map((a) => `${a.action}:${a.title}`) }
}

describe('SW 推送兜底文案按浏览器语言', () => {
  it('浏览器是中文：兜底是中文（与改动前一致）', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN')
    expect(push({})).toEqual({ title: 'Huanvae Chat', body: '您有新消息', actions: ['open:查看', 'dismiss:忽略'] })
  })

  it('浏览器不是中文：兜底是英文', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB')
    expect(push({})).toEqual({ title: 'Huanvae Chat', body: 'You have a new message', actions: ['open:View', 'dismiss:Dismiss'] })
  })

  it('载荷自带 title / body / actions 时以载荷为准，兜底不抢', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    const actions = [{ action: 'reply', title: '回复' }]
    expect(push({ title: '张三', body: '在吗', actions })).toEqual({ title: '张三', body: '在吗', actions: ['reply:回复'] })
  })
})
