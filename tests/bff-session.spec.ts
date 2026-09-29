import { expect, test } from '@playwright/test'

/**
 * BFF 会话层的端到端验证，跑在**真实生产构建产物**上（production project）。
 *
 * 这条用例的价值在于它验的东西单测验不了：浏览器只发 cookie，而到上游必须
 * 变成 Authorization；WS 的 token 由 BFF 注入。中间经过真实的 Bun.serve、
 * 真实的 RR 资源路由、真实的构建产物。
 *
 * 表单 label 文案取自 src/features/auth/components/LoginForm.tsx 的实际渲染
 * （经 src/i18n/messages.ts）：用户 ID 字段是「用户 ID」/ "User ID"，密码字段是
 * 「密码」/ "Password"，提交按钮是「登录」/ "Sign in"——不是「用户名」「账号」
 * 那一路英文项目里常见的写法。I18nProvider 默认 language:'auto'，跟 navigator.
 * language 走；这个 e2e 环境里 Chromium 的默认 locale 解析成英文（已用失败截图
 * 实测确认：User ID / Password / Sign in），所以两种语言都要匹配，不能只认
 * 中文——这也是 tests/chat.spec.ts 里 /好友|Friends/ 一类断言的同一个理由。
 *
 * 标签匹配锚定整串（`^…$`）：密码框旁的显隐按钮叫「显示密码 / Show password」、勾选框叫
 * 「记住账号 / Remember my account」，不锚定的 /密码|Password/ 会同时命中两个控件（严格模式报错）。
 */
test.describe('BFF 会话层', () => {
  test('登录 → cookie → 鉴权请求 → WS，浏览器侧从头到尾没有 token', async ({ page, context }) => {
    await page.goto('/app/login')

    await page.getByLabel(/^(用户\s*ID|User\s*ID)$/i).fill('e2e')
    await page.getByLabel(/^(密码|Password)$/i).fill('correct-horse')
    await page.getByRole('button', { name: /登录|Sign in/i }).click()

    // 1. cookie 是 httpOnly，且 JS 读不到
    await expect.poll(async () => {
      const cookies = await context.cookies()
      return cookies.find((c) => c.name === 'hv_session')?.httpOnly
    }).toBe(true)

    const documentCookie = await page.evaluate(() => document.cookie)
    expect(documentCookie).not.toContain('hv_session')

    // 2. localStorage 里没有任何 token
    const storage = await page.evaluate(() => JSON.stringify(localStorage))
    expect(storage).not.toContain('AT-e2e')
    expect(storage).not.toContain('RT-e2e')
    expect(storage).not.toContain('accessToken')

    // 3. 进到聊天页，鉴权请求成功（说明 BFF 真的换成了 Bearer）
    const friendsResponse = page.waitForResponse((r) => r.url().includes('/api/friends') && r.status() === 200)
    await page.goto('/app/chat')
    await friendsResponse

    // 4. 浏览器发出的请求里没有 Authorization 头
    const all: string[] = []
    const withAuth: string[] = []
    page.on('request', (r) => {
      all.push(r.url())
      if (r.headers().authorization) withAuth.push(`${r.url()} → ${r.headers().authorization}`)
    })
    await page.goto('/app/profile')
    await page.waitForLoadState('networkidle')
    // 正对照：监听器确实看见了请求（否则下面那条空数组断言是恒真式）
    expect(all.some((u) => u.includes('/api/'))).toBe(true)
    expect(withAuth).toEqual([])
  })

  test('WS 由 BFF 注入 token：浏览器只发 cookie，上游收到 ?token=', async ({ page, context }) => {
    await page.goto('/app/login')
    await page.getByLabel(/^(用户\s*ID|User\s*ID)$/i).fill('e2e')
    await page.getByLabel(/^(密码|Password)$/i).fill('correct-horse')
    await page.getByRole('button', { name: /登录|Sign in/i }).click()

    // 同 case 1：click() 一返回登录请求可能还在飞，先等 cookie 真的落地，
    // 避免下面的 page.goto('/app/chat') 抢在登录完成前打断这次请求——
    // 否则会话没建立成功，假后端 /ws 因为拿不到有效 token 直接回 400，
    // 握手不会建立，hello 帧永远不会来，下面的等待会一直挂到超时。
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name === 'hv_session' && c.value !== ''))
      .toBe(true)

    // 监听**所有** WS，并在 websocket 事件回调里同步挂 framereceived。原来是
    // waitForEvent('websocket').then(ws => ws.waitForEvent('framereceived'))，约 1/20 超时：
    // 登录成功后 LoginForm 自己会 router.push('/app/chat')，SPA 里的聊天页先建一条 WS，
    // waitForEvent 可能抓到的是这一条；紧接着 page.goto 重载页面把它掐掉，它收不到 hello、
    // 也不一定报 close，于是一直等到超时。在 .then 里才挂帧监听，本身也留着一个窗口。
    const socketUrls: string[] = []
    const firstFrame = new Promise<string>((resolve) => {
      page.on('websocket', (ws) => {
        socketUrls.push(ws.url())
        ws.on('framereceived', (frame) => resolve(String(frame.payload)))
      })
    })
    await page.goto('/app/chat')
    // 假后端 open() 回的 {"type":"hello","from":"fake-backend"} —— 只有握手
    // 带上了 ?token=（否则假后端在 /ws 直接回 400）才可能收到这一帧。这一帧
    // 同时是正对照：收到它就证明上游 server.upgrade 真的发生过。
    expect(await firstFrame).toContain('fake-backend')
    // 浏览器侧的每一条 WS 都是同源 /ws，URL 里从没带过 token
    expect(socketUrls.length).toBeGreaterThan(0)
    for (const url of socketUrls) {
      expect(url).toContain('/ws')
      expect(url).not.toContain('token')
    }
  })

  test('未登录访问受保护页面 → 跳登录页', async ({ page }) => {
    await page.goto('/app/chat')
    await expect(page).toHaveURL(/\/app\/login/)
  })

  test('登出后 cookie 被清、再访问受保护页面跳登录', async ({ page, context }) => {
    await page.goto('/app/login')
    await page.getByLabel(/^(用户\s*ID|User\s*ID)$/i).fill('e2e')
    await page.getByLabel(/^(密码|Password)$/i).fill('correct-horse')
    await page.getByRole('button', { name: /登录|Sign in/i }).click()

    // 正对照：先证明会话真的建起来了，再证明登出把它清掉——否则整条用例
    // 在"从没登录成功"的世界里同样全绿（正则 /app/ 本身就匹配 /app/login）。
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name === 'hv_session' && c.value !== ''))
      .toBe(true)
    await expect(page).not.toHaveURL(/\/app\/login/)

    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }))

    await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'hv_session' && c.value !== '')).toBe(false)

    await page.goto('/app/chat')
    await expect(page).toHaveURL(/\/app\/login/)
  })
})
