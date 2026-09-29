import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test'

/**
 * 有状态假后端（tests/fixtures/fake-backend.ts）上的端到端走查：以 alice 登录，走遍壳里的每一个路由，
 * 任何一处出现下面四类信号就判失败——
 *
 * 1. 控制台出现 `[api-shape]` / `ApiShapeError`（前端解析器与响应形状对不上，`src/lib/apiEnvelope.ts`）；
 * 2. 同源 `/api/*` 响应 ≥ 400（含假后端的 404「假后端未实现」——说明前端打了一个假后端还没实现的端点）；
 * 3. 同源 `/api/*` 请求网络层失败；
 * 4. 页面未捕获异常。
 *
 * 并断言种子内容真的渲染出来了（不是空壳）。另有两条实时链路用例：两个浏览器上下文互发、
 * 以及 `/__test/send` 模拟对方发消息——都要求**不刷新**就经 WS 看到。
 *
 * 浏览器是 en-US（navigator.language），界面文案是英文，所以 UI 文案断言一律中英双写；
 * 种子数据本身是中文，直接断言。只在桌面 chromium 项目跑（移动端是折叠布局，断言另当别论）。
 */

const FAKE = process.env.FAKE_BACKEND_URL ?? 'http://127.0.0.1:39473'

/** 与 tests/fixtures/fake-backend/world.ts 的 GROUP_IDS 一致（那边是真值，这里只是引用） */
const G = {
  hiking: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e01',
  frontend: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e02',
} as const

interface Watcher {
  problems: string[]
  settle: () => Promise<void>
}

function watch(page: Page, origin: string): Watcher {
  const problems: string[] = []
  const pending: Promise<unknown>[] = []
  const sameOriginApi = (raw: string): URL | null => {
    const url = new URL(raw)
    return url.origin === origin && url.pathname.startsWith('/api/') ? url : null
  }
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('[api-shape]') || text.includes('ApiShapeError')) problems.push(`console.${msg.type()}: ${text.slice(0, 400)}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    const url = sameOriginApi(request.url())
    if (url) problems.push(`requestfailed: ${request.method()} ${url.pathname} (${request.failure()?.errorText})`)
  })
  page.on('response', (response) => {
    const url = sameOriginApi(response.url())
    if (!url || response.status() < 400) return
    const line = `http ${response.status()}: ${response.request().method()} ${url.pathname}${url.search}`
    problems.push(line)
    pending.push(
      response.text().then(
        (body) => {
          const i = problems.indexOf(line)
          const tag = body.includes('假后端未实现') ? ' [假后端未实现]' : ''
          if (i >= 0) problems[i] = `${line}${tag} ${body.slice(0, 200)}`
        },
        () => undefined,
      ),
    )
  })
  return { problems, settle: async () => void (await Promise.allSettled(pending)) }
}

async function login(page: Page, userId: string): Promise<void> {
  const res = await page.request.post('/api/auth/login', { data: { user_id: userId, password: 'correct-horse' } })
  expect(res.ok(), `${userId} 登录失败：${res.status()}`).toBeTruthy()
}

/** 等某个用户在假后端上至少挂着一条聊天 WS——实时用例必须在这之后才发消息。 */
async function waitForSocket(request: APIRequestContext, userId: string): Promise<void> {
  await expect
    .poll(async () => {
      const state = (await (await request.get(`${FAKE}/__test/state`)).json()) as { online: Record<string, number> }
      return state.online[userId] ?? 0
    }, { message: `${userId} 的聊天 WS 没连上假后端`, timeout: 15_000 })
    .toBeGreaterThan(0)
}

async function newUserPage(browser: Browser, baseURL: string, userId: string): Promise<Page> {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await login(page, userId)
  return page
}

/** 收集这张页面收到的所有 WS 文本帧（含 Vite HMR 的，按内容过滤即可）。必须在 goto 之前挂上。 */
function wsFrames(page: Page): string[] {
  const frames: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      frames.push(typeof payload === 'string' ? payload : payload.toString('utf8'))
    })
  })
  return frames
}

/** 内容栏里是否至少有一张消息图片真的解码出来了（404 的 HTML 解不出尺寸，naturalWidth 恒为 0） */
const anyImageDecoded = (page: Page) =>
  page
    .getByTestId('content-column')
    .locator('img[alt="图片"]')
    .evaluateAll((imgs) => imgs.some((img) => (img as HTMLImageElement).naturalWidth > 0))

test.beforeEach(async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '只在桌面 chromium 项目跑')
  const res = await request.post(`${FAKE}/__test/reset`)
  expect(res.ok(), '假后端 /__test/reset 失败——是不是没用新的 tests/fixtures/fake-backend.ts 起服务？').toBeTruthy()
})

type Check = (page: Page) => Promise<void>

const content = (page: Page) => page.getByTestId('content-column')
const list = (page: Page) => page.getByTestId('list-column')

const ROUTES: Array<[path: string, check: Check]> = [
  ['/app/chat', async (page) => {
    await expect(list(page).getByTestId('conversation-f-bob')).toContainText('鲍勃')
    // 备注优先于昵称
    await expect(list(page).getByTestId('conversation-f-carol')).toContainText('卡卡（大学室友）')
    const fe = list(page).getByTestId(`conversation-g-${G.frontend}`)
    await expect(fe).toContainText('前端技术交流群')
    await expect(fe).toContainText('今晚 8 点线上分享')
    // 未读角标：整段文本恰好是「12」（toContainText 会被「12:40」这种时间误满足）
    await expect(fe.getByText('12', { exact: true })).toBeVisible()
  }],
  ['/app/chat/f-bob', async (page) => {
    await expect(content(page).getByText('鲍勃').first()).toBeVisible()
    await expect(content(page).getByText('晚上一起吃饭吗？🍜')).toBeVisible()
  }],
  [`/app/chat/g-${G.frontend}`, async (page) => {
    await expect(content(page).getByText('前端技术交流群').first()).toBeVisible()
    await expect(content(page).getByText(/今晚 8 点线上分享/)).toBeVisible()
  }],
  ['/app/contacts', async (page) => {
    await expect(list(page).getByTestId('contact-f-carol')).toContainText('卡卡（大学室友）')
    await expect(list(page).getByTestId('contact-f-erin')).toContainText('艾琳')
    await expect(list(page).getByTestId('contact-f-heidi')).toContainText('@heidi')
  }],
  ['/app/contacts/friends/bob', async (page) => {
    await expect(content(page).getByRole('heading', { name: '鲍勃' })).toBeVisible()
    await expect(content(page).getByText('代码写累了就去跑步 🏃')).toBeVisible()
  }],
  [`/app/contacts/groups/${G.hiking}`, async (page) => {
    await expect(content(page).getByText('周末徒步小分队 🥾').first()).toBeVisible()
    await expect(content(page).getByText('每周六早上 8 点集合，路线见群公告～ 小雨照常，大雨改期')).toBeVisible()
  }],
  ['/app/files', async (page) => {
    const dialog = page.getByRole('dialog', { name: /我的文件|My files/ })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('会议纪要-0926.txt')).toBeVisible()
    await expect(dialog.getByText('西湖夜跑.mp4')).toBeVisible()
  }],
  ['/app/profile', async (page) => {
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('爱丽丝').first()).toBeVisible()
    await expect(dialog.getByText('今天也要元气满满 ☀️')).toBeVisible()
  }],
  ['/app/settings/appearance', async (page) => {
    await expect(content(page).getByText(/主题配色|Color scheme/).first()).toBeVisible()
  }],
  ['/app/settings/notifications', async (page) => {
    await expect(content(page).getByText(/提示音|Sounds/).first()).toBeVisible()
  }],
  ['/app/settings/account', async (page) => {
    await expect(content(page).getByText(/黑名单|Blocked users/).first()).toBeVisible()
    await expect(content(page).getByText('艾琳')).toBeVisible()
    await expect(content(page).getByText(/iPhone 15 Pro/)).toBeVisible()
  }],
  ['/app/settings/apps', async (page) => {
    await expect(content(page).getByText(/已授权应用|Authorized apps/).first()).toBeVisible()
    await expect(content(page).getByText('胶片日记 Web')).toBeVisible()
  }],
  ['/app/settings/ai', async (page) => {
    await expect(content(page).getByText(/AI 配置|AI Config/).first()).toBeVisible()
  }],
  ['/app/settings/about', async (page) => {
    await expect(content(page).getByText(/版本|Version/).first()).toBeVisible()
  }],
  ['/app/bots', async (page) => {
    const dialog = page.getByRole('dialog', { name: /机器人|Bots/ })
    await expect(dialog.getByText('天气小助手')).toBeVisible()
    await expect(dialog.getByText('@weather_helper')).toBeVisible()
  }],
  ['/app/miniapps', async (page) => {
    const dialog = page.getByRole('dialog', { name: /小程序|Mini apps/ })
    await expect(dialog.getByText('记账本')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /打开|Open/ }).first()).toBeVisible()
  }],
  ['/app/meeting', async (page) => {
    await expect(page.getByText(/创建房间|Create room/).first()).toBeVisible()
  }],
  ['/app/ai-chat', async (page) => {
    // 这一页整页没接 i18n（报告里记为前端缺陷），英文界面下也是中文；英文分支留给以后翻译
    await expect(page.getByText(/AI 聊天助手|AI (chat )?assistant/i).first()).toBeVisible()
    await expect(page.getByPlaceholder(/输入你的问题|Ask a question/i)).toBeVisible()
  }],
]

test.describe('假后端世界：alice 走遍每个壳路由', () => {
  for (const [path, check] of ROUTES) {
    test(`${path}：种子内容可见，无形状错误 / 未实现端点 / 失败请求 / 页面异常`, async ({ page, baseURL }) => {
      const watcher = watch(page, new URL(baseURL as string).origin)
      await login(page, 'alice')
      await page.goto(path)
      await check(page)
      await page.waitForLoadState('networkidle')
      await watcher.settle()
      expect(watcher.problems, watcher.problems.join('\n')).toEqual([])
    })
  }

  test('私聊图片经 /friends-file/ 透传真能解码（下面群图片那条 test.fail 的对照组）', async ({ page }) => {
    await login(page, 'alice')
    const imageRequest = page.waitForRequest((r) => new URL(r.url()).pathname.startsWith('/friends-file/'))
    await page.goto('/app/chat/f-dave')
    await imageRequest
    await expect.poll(() => anyImageDecoded(page), { message: 'dave 发来的照片没解码出来', timeout: 8_000 }).toBe(true)
  })

  test('处理好友申请：同意 frank → 联系人里出现弗兰克，申请列表清空', async ({ page, baseURL }) => {
    const watcher = watch(page, new URL(baseURL as string).origin)
    await login(page, 'alice')
    await page.goto('/app/contacts?tab=requests')
    await expect(list(page).getByText('你好，我是弗兰克，我们在读书会见过～', { exact: false })).toBeVisible()
    await list(page).getByRole('button', { name: /同意|Approve/ }).first().click()
    await expect(list(page).getByText('你好，我是弗兰克，我们在读书会见过～', { exact: false })).toHaveCount(0)
    await list(page).getByRole('button', { name: /^好友$|^Friends$/ }).click()
    await expect(list(page).getByTestId('contact-f-frank')).toContainText('弗兰克')
    await page.waitForLoadState('networkidle')
    await watcher.settle()
    expect(watcher.problems, watcher.problems.join('\n')).toEqual([])
  })
})

test.describe('实时链路（WebSocket）', () => {
  test('两个浏览器上下文：bob 在 UI 里发消息，alice 不刷新就实时看到', async ({ browser, baseURL, request }) => {
    test.setTimeout(90_000)
    const origin = new URL(baseURL as string).origin
    const alice = await newUserPage(browser, baseURL as string, 'alice')
    const bob = await newUserPage(browser, baseURL as string, 'bob')
    const aliceWatch = watch(alice, origin)
    const bobWatch = watch(bob, origin)

    await alice.goto('/app/chat/f-bob')
    await bob.goto('/app/chat/f-alice')
    await expect(content(alice).getByText('晚上一起吃饭吗？🍜')).toBeVisible()
    await expect(content(bob).getByText('晚上一起吃饭吗？🍜')).toBeVisible()
    await waitForSocket(request, 'alice')
    await waitForSocket(request, 'bob')
    // 标记这张页面：若后面是靠刷新才看到消息，标记会丢
    await alice.evaluate(() => {
      ;(window as unknown as { __noReload?: boolean }).__noReload = true
    })

    const text = `bob 从浏览器发来的实时消息 ${Date.now()}`
    const editor = content(bob).getByPlaceholder(/输入消息|Type message/)
    await editor.fill(text)
    // 用 Enter 发送（输入框占位符写明的操作）。不点发送按钮：一次性填入整段文字后按钮仍是 disabled——
    // ChatInput 用 editorRef.isEmpty() 读的是上一次渲染的值（报告里记为前端缺陷），且按钮的
    // 可访问名是未翻译的 i18n key「chat.window.send」。
    await editor.press('Enter')
    await expect(content(bob).getByText(text)).toBeVisible()
    await expect(content(alice).getByText(text)).toBeVisible({ timeout: 10_000 })
    expect(await alice.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)

    for (const w of [aliceWatch, bobWatch]) {
      await w.settle()
      expect(w.problems, w.problems.join('\n')).toEqual([])
    }
    await alice.context().close()
    await bob.context().close()
  })

  test('/__test/send：模拟 bob 发来私聊与群消息，alice 实时看到，列表预览跟着变', async ({ page, baseURL, request }) => {
    const watcher = watch(page, new URL(baseURL as string).origin)
    await login(page, 'alice')
    await page.goto('/app/chat/f-bob')
    await expect(content(page).getByText('晚上一起吃饭吗？🍜')).toBeVisible()
    await waitForSocket(request, 'alice')

    const dm = `控制端点模拟的私聊 ${Date.now()}`
    const sent = await request.post(`${FAKE}/__test/send`, { data: { from: 'bob', to: 'alice', text: dm } })
    expect(sent.ok()).toBeTruthy()
    await expect(content(page).getByText(dm)).toBeVisible()
    await expect(list(page).getByTestId('conversation-f-bob')).toContainText(dm)

    // 客户端路由切到群聊（点列表卡片，不是 goto）：WS 连接保持不断
    await list(page).getByTestId(`conversation-g-${G.hiking}`).click()
    await expect(page).toHaveURL(new RegExp(`/app/chat/g-${G.hiking}$`))
    await expect(content(page).getByText('明天见！记得带伞 ☂️')).toBeVisible()
    const gm = `控制端点模拟的群消息 ${Date.now()}`
    const gsent = await request.post(`${FAKE}/__test/send`, { data: { from: 'bob', group: G.hiking, text: gm } })
    expect(gsent.ok()).toBeTruthy()
    await expect(content(page).getByText(gm)).toBeVisible()

    await page.waitForLoadState('networkidle')
    await watcher.settle()
    expect(watcher.problems, watcher.problems.join('\n')).toEqual([])
  })
})

/**
 * 已知前端缺陷：用 `test.fail()` 钉住「现在确实是坏的」。哪天修好了，这几条会以「意外通过」变红，
 * 提醒把 `test.fail()` 拿掉、改成正常用例。
 *
 * `test.fail()` 故意放在测试体中途：它只把**调用之后**的失败算作预期。前面的前置条件（登录、种子、
 * WS 帧确实到了浏览器、预签名确实拿到了、图片确实被请求了）都是普通断言，坏了就以真失败变红——
 * 否则任何原因的失败都会被当成「缺陷还在」吞掉，修好了也永远不会「意外通过」。
 */
test.describe('已知前端缺陷（test.fail 记录，修好后会以意外通过变红）', () => {
  test('直接打开会话列表时，好友卡片应显示最后一条消息与未读数（connected 帧没人接）', async ({ page }) => {
    // src/features/chat/hooks/useRealtimeMessages.ts 只由 ChatWindow 挂载（ChatWindow.tsx:34），
    // 停在 /app/chat 时没有任何 connected 处理器，未读摘要被 wsStore 丢弃（wsStore.ts:462-463）。
    const frames = wsFrames(page)
    await login(page, 'alice')
    await page.goto('/app/chat')
    await expect(list(page).getByTestId('conversation-f-bob')).toContainText('鲍勃')
    // 前置条件：带 bob 最后一条消息的 connected 帧确实到了浏览器——之后卡片还是空的，就只能是前端没接
    await expect
      .poll(() => frames.some((f) => f.includes('"type":"connected"') && f.includes('晚上一起吃饭吗？🍜')), {
        message: 'connected 帧（含 bob 的预览）没到浏览器',
        timeout: 15_000,
      })
      .toBe(true)
    test.fail()
    await expect(list(page).getByTestId('conversation-f-bob')).toContainText('晚上一起吃饭吗？🍜', { timeout: 8_000 })
  })

  test('群聊里的图片应能加载（/group-file/ 不在 BFF 透传前缀里）', async ({ page }) => {
    // server/index.ts:81、src/lib/bffPrefixes.ts:11、src/app/routes.ts:15-18 的透传前缀都只有
    // avatars / user-file / friends-file / apps，群文件桶的预签名地址 group-file/… 落到 RR 应用 404。
    await login(page, 'alice')
    const presign = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /^\/api\/storage\/file\/[^/]+\/presigned_url$/.test(new URL(r.url()).pathname),
    )
    const imageRequest = page.waitForRequest((r) => new URL(r.url()).pathname.startsWith('/group-file/'))
    await page.goto(`/app/chat/g-${G.hiking}`)
    // 前置条件：后端给了 group-file/ 的预签名，浏览器也确实去取了这张图（不是被懒加载推迟了）
    const res = await presign
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('group-file/')
    await imageRequest
    test.fail()
    await expect.poll(() => anyImageDecoded(page), { timeout: 8_000 }).toBe(true)
  })

  test('聊天窗口开着时收到好友申请，联系人角标应从 1 变 2（system_notification 被错误解包）', async ({ page, request }) => {
    // 停在聊天窗口里，WS 处理器是挂着的（ChatWindow 挂载 useRealtimeMessages）——排除「没人接」那条原因。
    // wsStore.ts:470-471 对带 data 键的帧只把 message.data 交给处理器，
    // useRealtimeMessages.ts:143-145 却读 data.notification_type —— 恒为 undefined，走 default 分支，
    // loadPendingRequests 从不被调用。
    const frames = wsFrames(page)
    await login(page, 'alice')
    await page.goto('/app/chat/f-bob')
    await expect(content(page).getByText('晚上一起吃饭吗？🍜')).toBeVisible()
    await waitForSocket(request, 'alice')
    await expect(page.getByTestId('badge-contacts')).toHaveText('1')
    const res = await request.post(`${FAKE}/__test/friend-request`, { data: { from: 'judy', to: 'alice', message: '我是朱迪，前端群里见过' } })
    expect(res.ok()).toBeTruthy()
    // 前置条件：friend_request 通知帧确实到了浏览器
    await expect
      .poll(() => frames.some((f) => f.includes('"notification_type":"friend_request"')), {
        message: 'friend_request 通知帧没到浏览器',
        timeout: 10_000,
      })
      .toBe(true)
    test.fail()
    await expect(page.getByTestId('badge-contacts')).toHaveText('2', { timeout: 8_000 })
  })
})
