import { test, expect } from '@playwright/test'
import { ROUTES } from '../src/lib/routes'

// 路由清单直接从 src/lib/routes.ts 的 ROUTES 常量派生，而不是在这里另抄一份
// 字符串字面量——迁移正确性锚点是那份常量表本身（该文件不允许被这个 task
// 修改），"URL 与 src/lib/routes.ts 完全一致"这个要求如果靠人工誊抄一份平行
// 列表来满足，两边一旦有一个改了忘了改另一个，测试就会静默失真。直接 import
// 让"字节级一致"这件事在结构上不可能出错。
//
// ROUTES.legacy.groupChat（/app/group-chat）刻意不在下面任何列表里：它从未
// 出现在 src/app/routes.ts 的路由配置里，访问它会命中 root.tsx 的 404
// ErrorBoundary，不是"可达路由"。同理 '~offline' 页面反过来——它在
// src/app/routes.ts 里注册、也确实可达，但从未被收进 ROUTES 常量表（没有任何
// 代码用编程式导航跳去离线页，只有 Service Worker fallback 会触发），所以
// 这一个 URL 没有锚点常量可对齐，只能像 spec 草稿那样直接写字面量。
const OFFLINE_ROUTE = '/~offline'

// 无需登录即可访问的页面。ROUTES.webAppRoot（/app）本身不做鉴权判断——
// 它是 WebAppEntry，只在客户端 useEffect 里 replace 到默认已登录页或恢复
// 的上次路径，SSR 阶段原样吃到 200（见 src/app/routes/app-index.tsx）。
const PUBLIC_ROUTES = [ROUTES.root, ROUTES.downloads, OFFLINE_ROUTE, ROUTES.webAppRoot]

const AUTH_ROUTES = [ROUTES.auth.login, ROUTES.auth.register]

// ROUTES.app.chatFriends 和 ROUTES.app.friends 是同一个字符串 '/app/friends'
// （常量表里的历史重复别名），只收一次，否则会对同一个 URL 重复起两条同名测试。
const PROTECTED_ROUTES = [
  ROUTES.app.chat,
  ROUTES.app.friends,
  ROUTES.app.chatGroups,
  ROUTES.app.chatFiles,
  ROUTES.app.chatWebrtc,
  ROUTES.app.aiChat,
  ROUTES.app.videoMeeting,
  ROUTES.app.devices,
  ROUTES.app.settings,
  ROUTES.app.profile,
]

test.describe('路由可达性', () => {
  for (const path of [...PUBLIC_ROUTES, ...AUTH_ROUTES, ...PROTECTED_ROUTES]) {
    test(`${path} 返回 200`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(200)
    })
  }
})

test.describe('尾斜杠重定向', () => {
  test('/app/chat/ 单次 301 到 /app/chat，Location 为相对路径', async ({ request }) => {
    const res = await request.get('/app/chat/', { maxRedirects: 0 })
    expect(res.status()).toBe(301)

    const location = res.headers().location
    expect(location, 'Location 头缺失').toBeDefined()
    expect(location).toContain('/app/chat')
    expect(location).not.toMatch(/\/$/)

    // Location 必须是相对路径（只有 pathname + search），不能是带 scheme/host 的
    // 绝对 URL。server/index.ts 里这段逻辑曾经用 url.toString() 拼过 Location，
    // 而 new URL(request.url) 会如实相信请求行里到达的 scheme/host——HTTP/1.1
    // 的 absolute-form request-target 能让攻击者构造的请求把任意 host 反射进
    // Location，构成开放重定向（已实测复现并修复，见 server/index.ts 对应注释）。
    // 这里锁定回归：一旦有人把相对路径拼接改回 url.toString() 之类的写法，
    // 这条断言会先炸。
    expect(location).not.toMatch(/^[a-zA-Z][a-zA-Z\d+\-.]*:/) // 不含任何 scheme
    expect(location?.startsWith('/')).toBe(true)
  })

  test('跟随重定向后停在 /app/chat 且不再二次 301（无循环）', async ({ request }) => {
    // 默认行为会跟随重定向；如果 server 端配置错误导致 /app/chat/ ↔ /app/chat
    // 来回跳转，Playwright 会在达到内部重定向上限时抛错，本测试直接失败——
    // 但更明确的做法是断言最终停留的 URL 恰好是不带尾斜杠的 /app/chat，且状态码是
    // 落地页面的 200，而不是又一个 3xx。
    const res = await request.get('/app/chat/')
    expect(res.status()).toBe(200)
    expect(new URL(res.url()).pathname).toBe('/app/chat')
  })
})

test.describe('认证守卫', () => {
  test('未登录访问受保护路由会跳到登录页', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/app/chat')
    // 已知问题（Task 12 编写本测试时发现，未修复——修复需要改 src/，超出本
    // task 范围）：这个断言目前会稳定失败，不是超时预算不够、也不是并发争抢
    // 造成的偶发 flake。用独立脚本（不经 Playwright test runner，纯
    // playwright 库直连 dev :3000 和生产 :3100）反复实测确认：ProtectedRoute
    // 判定未登录后调用 router.replace('/app/login')，但 src/lib/navigation.ts
    // 的 useRouter() 每次渲染都返回一个全新对象；ProtectedRoute 的 useEffect
    // 把这个不稳定对象放进依赖数组，于是每次重渲染都重新触发一次
    // replace()——而 /app/chat → /app/login 跨越 protected-layout /
    // auth-layout 需要现拉一次 RR8 路由 manifest（GET /__manifest?...），这次
    // 导航发起本身又会触发重渲染，形成死循环：实测生产构建下 30 秒内产生约
    // 6.6 万次被中止的 /__manifest 请求（≈2200 次/秒），dev 下约 13 次/秒，
    // 页面永远停在 /app/chat 的空白 shell，不会跳到 /app/login。20s 的超时是
    // 按"bug 修复后、三个 project 并发跑时的合理头寸"设的，而不是暗示这个
    // bug 只是偶尔慢——它现在会稳定超时到底。
    await page.waitForURL(/\/app\/login/, { timeout: 20_000 })
    expect(page.url()).toContain('/app/login')
  })
})

test.describe('无 hydration 警告', () => {
  for (const path of [ROUTES.root, ROUTES.auth.login, ROUTES.app.chat]) {
    test(`${path} 控制台无 hydration 报错`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        const text = msg.text()
        if (/hydrat|did not match|Minified React error #(418|423|425)/i.test(text)) {
          errors.push(text)
        }
      })
      page.on('pageerror', (err) => {
        if (/hydrat|did not match|Minified React error #(418|423|425)/i.test(err.message)) {
          errors.push(err.message)
        }
      })
      await page.goto(path)
      // 不用 waitForLoadState('networkidle')：/app/chat 在沙箱/CI 里连不上真实
      // 后端（wss://api.huanvae.cn 及好友/群聊等接口），组件会持续重试 fetch，
      // 网络永远"不空闲"，networkidle 曾在本机实测里稳定超时（30s）。hydration
      // 相关的报错/警告在 hydration 发生的当下就会同步打到控制台，不需要等到
      // 网络彻底安静——等 load 事件 + 一小段固定余量足够可靠地捕获它们。
      await page.waitForLoadState('load')
      await page.waitForTimeout(1_500)
      expect(errors).toEqual([])
    })
  }
})

test.describe('安全响应头', () => {
  // 六条头全部由 server/index.ts 的 SECURITY_HEADERS 统一附加，原先活在
  // public/_headers 里（Cloudflare Pages 专有格式），迁到 Docker 后必须在
  // 应用层重新实现。Permissions-Policy 漏掉 camera/microphone=(self) 会
  // 静默让浏览器拒绝视频会议的摄像头/麦克风权限请求，且没有任何报错——
  // 这是本套回归里后果最隐蔽的一条。
  const EXPECTED: Record<string, string | RegExp> = {
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-xss-protection': '1; mode=block',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': /camera=\(self\).*microphone=\(self\).*geolocation=\(\)/,
  }

  for (const [header, expected] of Object.entries(EXPECTED)) {
    test(`${header} 存在且正确`, async ({ request }) => {
      const res = await request.get('/')
      const actual = res.headers()[header]
      expect(actual, `${header} 缺失 —— _headers 迁移遗漏`).toBeDefined()
      if (expected instanceof RegExp) expect(actual).toMatch(expected)
      else expect(actual).toBe(expected)
    })
  }

  test('sw.js 不被缓存', async ({ request }) => {
    const res = await request.get('/sw.js')
    expect(res.headers()['cache-control']).toContain('no-store')
  })
})
