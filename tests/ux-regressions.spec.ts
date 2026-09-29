import { type BrowserContext, expect, type Page, test } from '@playwright/test'

/**
 * 2026-09-29 端到端体验审计里修掉的问题，逐条钉成回归用例。跑在有状态假后端上
 * （tests/fixtures/fake-backend.ts：alice 主视角、种子世界、`/__test/*` 控制端点）。
 *
 * 每条用例开头 `POST /__test/reset` 把世界还原到种子；登录走真实 BFF（cookie 换 bearer）。
 * 语言显式设为 zh-CN（Playwright 默认 en-US，界面会渲染英文），断言直接写中文。
 * 只在桌面 chromium 项目跑；手机布局那条自己设视口。
 */

const FAKE = process.env.FAKE_BACKEND_URL ?? 'http://127.0.0.1:39473'
const G = {
  hiking: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e01',
  frontend: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e02',
} as const

test.use({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })

test.beforeEach(async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '桌面 chromium 项目专用（手机布局的用例自己设视口）')
  const res = await request.post(`${FAKE}/__test/reset`)
  expect(res.ok(), '假后端 /__test/reset 失败').toBeTruthy()
})

async function loginAs(context: BrowserContext, userId: string) {
  const res = await context.request.post('/api/auth/login', { data: { user_id: userId, password: 'correct-horse' } })
  expect(res.ok(), `${userId} 登录失败`).toBeTruthy()
}

async function fakeSend(body: Record<string, unknown>) {
  const res = await fetch(`${FAKE}/__test/send`, { method: 'POST', body: JSON.stringify(body) })
  expect(res.ok, '/__test/send 失败').toBeTruthy()
}

const list = (page: Page) => page.getByTestId('list-column')
const content = (page: Page) => page.getByTestId('content-column')
/** 会话卡片（名字所在的那一整张卡）的文字 */
const cardText = (page: Page, name: string | RegExp) =>
  list(page).getByText(name).first().locator('xpath=ancestor::*[self::a or self::button or @role="button"][1]').innerText()
const scroller = (page: Page) => content(page).locator('div.overflow-y-auto').filter({ has: page.locator('[data-message-uuid]') }).first()

test('会话列表页（没打开任何会话）也收得到 WS：连接时的未读摘要与之后的新消息都更新卡片和角标', async ({ page, context }) => {
  await loginAs(context, 'alice')
  await page.goto('/app/chat')

  // 连接时的 unread_summary：鲍勃 3 条未读、最后一条「晚上一起吃饭吗」
  await expect.poll(() => cardText(page, '鲍勃')).toMatch(/晚上一起吃饭吗[\s\S]*3/)
  const badge = page.getByRole('link', { name: '消息' })
  await expect(badge).toContainText(/\d+/)
  const before = Number((await badge.innerText()).match(/\d+/)?.[0])

  await fakeSend({ from: 'carol', to: 'alice', text: '列表页上的新消息' })

  await expect.poll(() => cardText(page, /卡卡/)).toContain('列表页上的新消息')
  await expect.poll(async () => Number((await badge.innerText()).match(/\d+/)?.[0])).toBe(before + 1)
})

test('快速切换会话不串台：上一个会话的历史晚到，也不会写进当前会话的窗口', async ({ page, context }) => {
  await loginAs(context, 'alice')
  // 鲍勃的历史延迟 1.5s（线上 TTFB 1–2s 的量级）
  await page.route('**/api/messages?**friend_id=bob**', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.fallback()
  })
  await page.goto('/app/chat')
  await list(page).getByText('鲍勃').first().click()
  await page.waitForTimeout(200)
  await list(page).getByText(/卡卡/).first().click()

  await expect(page).toHaveURL(/\/app\/chat\/f-carol$/)
  await expect(content(page).getByText('那就这么定了，下周三晚上见！').first()).toBeVisible()
  await page.waitForTimeout(2000) // 等鲍勃那页晚到
  await expect(content(page).getByText('晚上一起吃饭吗？🍜')).toHaveCount(0)
})

test('发完消息焦点留在输入框，可以直接接着打；发送失败把原文放回输入框', async ({ page, context }) => {
  await loginAs(context, 'alice')
  await page.goto('/app/chat/f-carol')
  const input = content(page).locator('textarea').first()
  await input.click()
  await page.keyboard.type('第一条')
  await page.keyboard.press('Enter')
  await expect(content(page).getByText('第一条').first()).toBeVisible()
  await page.keyboard.type('xyz')
  await expect(input).toHaveValue('xyz')

  await page.route('**/api/messages', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, code: 500, error: '服务器开小差了' }) })
      : route.fallback(),
  )
  await input.fill('')
  await input.click()
  await page.keyboard.type('这条会失败')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('这条会失败')
})

test('上翻加载更早的历史不会被拽回底部；读历史时来新消息显示「N 条新消息」而不拽走视口', async ({ page, context }) => {
  await loginAs(context, 'alice')
  await page.goto('/app/chat/f-bob')
  const box = scroller(page)
  await expect(box).toBeVisible()
  const metrics = () => box.evaluate((el) => ({ top: Math.round(el.scrollTop), max: Math.round(el.scrollHeight - el.clientHeight) }))
  await expect.poll(async () => { const m = await metrics(); return m.max - m.top }).toBeLessThan(5)

  const firstUuid = await box.locator('[data-message-uuid]').first().getAttribute('data-message-uuid')
  await box.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })
  // 更早的一页拼进来了（首条变了）……
  await expect.poll(() => box.locator('[data-message-uuid]').first().getAttribute('data-message-uuid')).not.toBe(firstUuid)
  // ……而原来的首条仍在视口附近，没被拽回底部
  const m = await metrics()
  expect(m.max - m.top, '加载更早后被拽回了底部').toBeGreaterThan(200)
  const anchorOffset = await box.evaluate((el, uuid) => {
    const node = el.querySelector(`[data-message-uuid="${uuid}"]`) as HTMLElement
    return node.getBoundingClientRect().top - el.getBoundingClientRect().top
  }, firstUuid)
  expect(Math.abs(anchorOffset)).toBeLessThan(400)

  const before = await metrics()
  await fakeSend({ from: 'bob', to: 'alice', text: '读历史时来的新消息' })
  await expect(page.getByRole('button', { name: /1 条新消息/ })).toBeVisible()
  expect((await metrics()).top, '读历史时被新消息拽走了').toBe(before.top)
  await page.getByRole('button', { name: /1 条新消息/ }).click()
  await expect.poll(async () => { const x = await metrics(); return x.max - x.top }).toBeLessThan(5)
})

test('群聊里的图片能加载（BFF 透传 /group-file/*）', async ({ page, context }) => {
  await loginAs(context, 'alice')
  const statuses: number[] = []
  page.on('response', (r) => { if (r.url().includes('/group-file/')) statuses.push(r.status()) })
  await page.goto(`/app/chat/g-${G.hiking}`)
  await expect.poll(() => statuses.length).toBeGreaterThan(0)
  expect(statuses.every((s) => s >= 200 && s < 300), `群文件请求：${statuses.join(',')}`).toBeTruthy()
  await expect.poll(() => content(page).locator('img').evaluateAll((imgs) =>
    imgs.filter((i) => (i as HTMLImageElement).currentSrc.includes('/group-file/') && (i as HTMLImageElement).naturalWidth > 0).length,
  )).toBeGreaterThan(0)
})

test('直接打开（书签/新标签）的弹窗路由，点关闭仍留在应用内', async ({ page, context }) => {
  await loginAs(context, 'alice')
  for (const path of ['/app/files', '/app/meeting', '/app/profile']) {
    await page.goto(path)
    await page.getByRole('dialog').getByRole('button', { name: '关闭' }).first().click()
    await expect(page).toHaveURL(/\/app\/chat$/)
  }
})

test('会议、文件弹窗是设计宽度，不被压成 512px', async ({ page, context }) => {
  await loginAs(context, 'alice')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/app/meeting')
  expect((await page.getByRole('dialog').boundingBox())?.width).toBeGreaterThanOrEqual(700)
  await page.goto('/app/files')
  expect((await page.getByRole('dialog').boundingBox())?.width).toBeGreaterThanOrEqual(800)
})

test('「+ → 添加好友」能真正发出好友申请，并出现在「申请」里', async ({ page, context }) => {
  await loginAs(context, 'alice')
  await page.goto('/app/contacts')
  await page.getByRole('button', { name: '添加' }).click()
  await page.getByRole('menuitem', { name: '添加好友' }).click()
  await page.getByLabel(/^用户\s*ID$/).fill('judy')
  await page.getByLabel(/验证消息/).fill('前端群里见过～')
  await page.getByRole('button', { name: '发送请求' }).click()
  await expect(page.getByLabel(/^用户\s*ID$/)).toHaveCount(0)
  await page.goto('/app/contacts?tab=requests')
  await expect(list(page).getByText('朱迪').first()).toBeVisible()
})

test('群主打开群管理就能看到待审的入群申请（不必手点刷新）', async ({ page, context }) => {
  await loginAs(context, 'alice')
  await page.goto(`/app/contacts/groups/${G.hiking}`)
  const tab = page.getByRole('button', { name: /^加入申请\s*\d+$/ })
  await expect(tab).toHaveText(/加入申请\s*2/)
  await tab.click()
  await expect(content(page).getByText('弗兰克').first()).toBeVisible()
})

test('发图片后自己的会话预览变成 [图片]；删除消息要二次确认', async ({ page, context }) => {
  await loginAs(context, 'alice')
  await page.goto('/app/chat/f-carol')
  await content(page).locator('input[type=file]').first().setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    // 1×1 透明 PNG
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
  })
  await content(page).locator('button:has(svg.lucide-send)').last().click()
  await expect.poll(() => cardText(page, /卡卡/)).toContain('[图片]')

  const input = content(page).locator('textarea').first()
  await input.click()
  await page.keyboard.type('这条等下删掉')
  await page.keyboard.press('Enter')
  await content(page).getByText('这条等下删掉').last().click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '取消' }).click()
  await expect(content(page).getByText('这条等下删掉').first()).toBeVisible()
})

test('手机上输入区不溢出、不占掉大半屏', async ({ page, context }) => {
  await loginAs(context, 'alice')
  await page.setViewportSize({ width: 390, height: 664 })
  await page.goto('/app/chat/f-bob')
  const r = await page.locator('textarea').first().evaluate((ta) => {
    const editor = ta.closest('.markdown-editor') as HTMLElement
    const er = editor.getBoundingClientRect()
    const overflowing = [...editor.querySelectorAll('button')].filter((b) => {
      const br = b.getBoundingClientRect()
      return br.width > 0 && (br.right > er.right + 1 || br.left < er.left - 1)
    }).length
    const composer = editor.closest('[class*="border-t"]') as HTMLElement
    return { overflowing, height: composer.getBoundingClientRect().height }
  })
  expect(r.overflowing).toBe(0)
  expect(r.height).toBeLessThanOrEqual(120)
})
