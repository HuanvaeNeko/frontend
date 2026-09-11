import { test, expect } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

// 新壳（spec §3/§5）：/app/chat 的列表栏是统一会话列表，一个好友一张卡片；点击 → /app/chat/f-<id>。
// 桌面（chromium）三栏；mobile 项目（Pixel 7，412px）是底部条 + 二选一（spec §3 折叠）。
const mockListEndpoints = async (page: import('@playwright/test').Page, friends: unknown[], groups: unknown[]) => {
  await page.route('**/api/friends', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 200, data: friends }) }))
  await page.route('**/api/friends/requests/pending', (route) => route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) }))
  await page.route('**/api/friends/requests/sent', (route) => route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) }))
  await page.route('**/api/groups/my', (route) => route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: groups }) }))
  await page.route('**/api/groups/invites/my', (route) => route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) }))
}

const ALICE_BOB = [
  {
    friend_id: 'friend_1',
    friend_nickname: 'Alice',
    friend_avatar_url: null,
    add_time: new Date().toISOString(),
    approve_reason: null,
    friend_remark: null,
    is_blacklisted: false,
    is_special_care: false,
  },
  {
    friend_id: 'friend_2',
    friend_nickname: 'Bob',
    friend_avatar_url: null,
    add_time: new Date().toISOString(),
    approve_reason: null,
    friend_remark: null,
    is_blacklisted: false,
    is_special_care: false,
  },
]
const TEST_GROUP = [
  {
    group_id: 'g1',
    group_name: 'Test Group',
    group_description: 'desc',
    creator_id: 'u1',
    role: 'owner',
    unread_count: 0,
    last_message_content: 'hello',
    last_message_time: new Date().toISOString()
  }
]

test.describe('Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // 会话现在是 httpOnly cookie，不是 localStorage 里的假 token（BFF 会话层）。
    // page.request 与这个测试的 page 共享同一个浏览器 context 的 cookie jar，
    // 真实登录一次之后，page 后续的导航会带上 hv_session —— 这个 dev webServer
    // 现在也接了真实的假后端（见 playwright.config.ts 的 BFF_UPSTREAM_*），所以
    // 这是一次真实的 cookie 换 session 而不是伪造。/api/session、/api/profile
    // 都不拦截：前者让 ProtectedRoute 真的问一遍 BFF，后者假后端本来就回一份
    // 形状完整、能通过 src/features/profile/api/profile.ts 解析器的资料（E2E
    // 用户）——不再需要浏览器侧另外 mock 一份。下面 /api/friends|groups/... 的
    // page.route 拦截仍然保留，目的是控制这几个用例断言的具体数据形状
    // （Alice/Bob 等），与鉴权机制无关。
    const login = await page.request.post('/api/auth/login', { data: { user_id: 'e2e', password: 'correct-horse' } })
    // 登录失败时下面 waitForResponse 的 30s 超时和 playwright.config.ts 文档化的
    // 那条 Vite dev 并发 flake 完全同形（页面停在「加载中...」）——这一句把两种
    // 原因永久分开，成本一行。
    expect(login.ok(), 'e2e 登录失败').toBeTruthy()
  })

  test('统一会话列表：好友成卡片，点击进入 /app/chat/f-<id>', async ({ page }, testInfo) => {
    await mockListEndpoints(page, ALICE_BOB, [])
    const friendsPromise = page.waitForResponse((r) => r.url().includes('/api/friends') && r.status() === 200)
    await page.goto(`${BASE_URL}/app/chat`)
    await friendsPromise
    await expect(page).toHaveURL(/\/app\/chat$/)

    const list = page.getByTestId('list-column')
    await expect(list.getByText('Alice')).toBeVisible()
    await expect(list.getByText('Bob')).toBeVisible()

    const isMobile = testInfo.project.name === 'mobile'
    // 这个 webServer 的浏览器 context 没有固定 locale（playwright.config.ts 没设 use.locale），
    // I18nProvider 的 language='auto' 落到 navigator.language——实测这个沙箱里就是 en-US，
    // 界面渲染的是英文文案。跟原 chat.spec.ts 同一个理由、同一个写法：中英文都认。
    if (!isMobile) await expect(page.getByText(/选择一个会话开始聊天|Pick a conversation to start chatting/)).toBeVisible()

    await list.getByText('Alice').click()
    await expect(page).toHaveURL(/\/app\/chat\/f-friend_1$/)

    if (isMobile) {
      // 折叠：列表让位给内容，顶部返回条带会话名，返回回到列表
      await expect(page.getByTestId('list-column')).toHaveCount(0)
      await expect(page.getByTestId('fold-back-bar')).toContainText('Alice')
      await page.getByRole('link', { name: /返回列表|Back to list/ }).click()
      await expect(page).toHaveURL(/\/app\/chat$/)
      await expect(page.getByTestId('list-column').getByText('Alice')).toBeVisible()
    } else {
      await expect(page.getByText(/选择一个会话开始聊天|Pick a conversation to start chatting/)).not.toBeVisible()
      // 聊天窗口头部出现 Alice（列表卡片里也有一个，取可见的第二处：内容区）
      await expect(page.getByTestId('content-column').getByText('Alice').first()).toBeVisible()
    }
  })

  test('空列表：后端真的回了空数组，界面给空态而不是解析失败', async ({ page }) => {
    // Genuine empty-list success response — `{success:true, code:200, data:[]}`
    // (backend-docs/friends/好友添加删除.md:57,99-105) — NOT a throwing mock that
    // happens to leave the store's initial `[]` on screen. Those are indistinguishable
    // in FriendList.tsx's rendering (it branches on `filteredFriends.length === 0`,
    // not on the store's `error`), which is exactly the conflation
    // (`data.friends || data || []` silently returning `[]` forever) that let the
    // production bug survive six months (see
    // src/features/chat/api/__tests__/friends.test.ts header comment). A bare
    // `{friends:[]}` throws ApiShapeError in getFriendsList
    // (src/features/chat/api/friends.ts) and ChatPage.tsx swallows it via
    // `loadFriends().catch(console.error)` — invisible in the DOM. So this test
    // additionally asserts on the one signal that *does* survive the swallow:
    // apiEnvelope.ts's shape-error reporter guarantees a `[api-shape]` console.error
    // "even if the caller catches it" (its own doc comment). Watch the console
    // before navigating so a reverted/throwing fixture fails this test instead of
    // passing for the wrong reason.
    const shapeErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('[api-shape]') && msg.text().includes('/api/friends')) {
        shapeErrors.push(msg.text())
      }
    })
    await mockListEndpoints(page, [], [])
    const friendsPromise = page.waitForResponse((r) => r.url().includes('/api/friends') && r.status() === 200)
    await page.goto(`${BASE_URL}/app/chat`)
    await friendsPromise
    await expect(page.getByText(/还没有会话|No conversations yet/)).toBeVisible()
    expect(shapeErrors).toEqual([])
  })

  test('联系人栏的群 tab 与「更多」里的我的文件模态框', async ({ page }, testInfo) => {
    await mockListEndpoints(page, [], TEST_GROUP)
    const groupsPromise = page.waitForResponse((r) => r.url().includes('/api/groups/my') && r.status() === 200)
    await page.goto(`${BASE_URL}/app/chat`)
    await groupsPromise

    const isMobile = testInfo.project.name === 'mobile'
    const nav = page.getByTestId(isMobile ? 'mobile-tab-bar' : 'sidebar')
    await nav.getByRole('link', { name: /联系人|Contacts/ }).click()
    await expect(page).toHaveURL(/\/app\/contacts$/)
    await page.getByRole('button', { name: /^群$|^Groups$/ }).click()
    await expect(page.getByTestId('list-column').getByText('Test Group')).toBeVisible()

    await nav.getByRole('button', { name: /更多功能|More/ }).click()
    await page.getByRole('link', { name: /我的文件|My files/ }).click()
    await expect(page).toHaveURL(/\/app\/files$/)
    // 按可访问名取：桌面上侧栏「更多」面板也是 role=dialog（aria-label 更多功能），退场动画期间会短暂并存
    await expect(page.getByRole('dialog', { name: /我的文件|My files/ })).toBeVisible()
  })

  test('设置六个分区可达；授权页缺参数显示错误页而不跳转', async ({ page }, testInfo) => {
    await mockListEndpoints(page, [], [])
    await page.route('**/api/oauth/grants', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 200, data: [] }) }))
    await page.route('**/api/friends/blacklist', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 200, data: [] }) }))
    await page.goto(`${BASE_URL}/app/settings/appearance`)
    await expect(page).toHaveURL(/\/app\/settings\/appearance$/)
    const isMobile = testInfo.project.name === 'mobile'
    // 折叠视口下分区列表在 /app/settings 索引页；桌面在列表栏。逐个分区点过去，内容区出现分区标题。
    // 内容文案核对自 src/i18n/messages.ts：notifications 的英文侧 `sounds.title`
    // ('Notification sound') 在组件树里实际没有任何调用点渲染（只有 `hint`/`water`/
    // `classic` 等子键被消费），真正渲染在屏幕上的是 `shell.settings.sound`
    // （单数，通知开关那一行的标题）—— zh '提示音' / en 'Sounds'；ai 分区标题取自
    // `AiSection.tsx` 用的 `settings.aiConfig`（不是 `shell.settings.ai`，那个 key
    // 只是侧栏链接名）—— zh 'AI 配置' / en 'AI Config'。
    const sections: Array<[string, RegExp, RegExp]> = [
      ['appearance', /^外观$|^Appearance$/, /主题配色|Color scheme/],
      ['notifications', /通知与提醒|Notifications/, /提示音|Sounds/],
      ['account', /账户与安全|Account & security/, /黑名单|Blocked users/],
      ['apps', /授权与应用|Apps & access/, /已授权应用|Authorized apps/],
      ['ai', /^AI 配置$|^AI$/, /AI 配置|AI Config/],
      ['about', /^关于$|^About$/, /版本|Version/],
    ]
    for (const [key, linkName, contentText] of sections) {
      if (isMobile) await page.goto(`${BASE_URL}/app/settings`)
      await page.getByRole('link', { name: linkName }).first().click()
      await expect(page).toHaveURL(new RegExp(`/app/settings/${key}$`))
      await expect(page.getByTestId('content-column').getByText(contentText).first()).toBeVisible()
    }
    await page.goto(`${BASE_URL}/app/oauth/authorize?redirect_uri=%2Fapps%2Fx%2Fcb`)
    await expect(page.getByText(/无效的授权请求|Invalid authorization request/)).toBeVisible()
    await expect(page).toHaveURL(/\/app\/oauth\/authorize\?redirect_uri=/)
  })
})
