import { test, expect } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

const authState = {
  state: {
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    user: {
      user_id: 'test_user',
      nickname: 'Test User',
      email: 'test@example.com',
      avatar_url: '',
      signature: 'Hello World',
    },
    isAuthenticated: true,
    tokenExpiry: Date.now() + 24 * 60 * 60 * 1000,
  },
  version: 0,
}

test.describe('Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Set up auth state
    await page.addInitScript((payload) => {
      window.localStorage.setItem('auth-storage', JSON.stringify(payload))
    }, authState)
    
    // Default mocks for profile to avoid auth redirect
    await page.route('**/api/profile', async (route) => {
      await route.fulfill({ 
        status: 200, 
        body: JSON.stringify({ 
          data: {
            user_id: 'test_user', 
            user_nickname: 'Test User',
            user_email: 'test@example.com',
            user_avatar_url: '',
            user_signature: 'Hello World',
            admin: 'false',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          } 
        }) 
      })
    })
  })

  test('should load chat page and display friends list', async ({ page }, testInfo) => {
    // Mock friends API.
    // Envelope shape per backend-docs/friends/好友添加删除.md:57 & :99-118:
    // `{success, code, data}` where `data` IS the FriendDto[] array (no `friends`
    // wrapper key). Field names are `friend_id`/`friend_nickname`/`friend_avatar_url`
    // — the old `user_id`/`nickname`/`avatar_url`/`signature` shape has zero overlap
    // with the real DTO and throws ApiShapeError against the migrated client
    // (src/features/chat/api/friends.ts). The display name resolves via
    // `friend_remark ?? friend_nickname ?? friend_id` (FriendList.tsx:66), so with
    // `friend_remark: null` here, "Alice"/"Bob" render from `friend_nickname` —
    // genuinely proving the row renders from the field the app actually reads.
    await page.route('**/api/friends', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          code: 200,
          data: [
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
          ],
        }),
      })
    })

    // Mock other chat APIs to avoid errors.
    // Same envelope as /api/friends (backend-docs/friends/好友添加删除.md:79-85, :59-65):
    // `data` is PendingRequestDto[] / SentRequestDto[] directly, no `requests` wrapper.
    await page.route('**/api/friends/requests/pending', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) })
    })
    await page.route('**/api/friends/requests/sent', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) })
    })
    // Groups module has not migrated to the envelope client yet (groups.ts still
    // reads `result.data?.groups || result.data || result.groups || result || []`),
    // but the real backend already returns the envelope here too
    // (backend-docs/groups/群聊管理.md:113-129: `{success, code, data: MyGroup[]}`).
    // This shape satisfies both the current fallback chain (via `result.data`) and
    // whatever the client looks like once groups.ts migrates.
    await page.route('**/api/groups/my', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) })
    })

    // Navigate to chat page and wait for friends API
    const friendsPromise = page.waitForResponse(resp => resp.url().includes('/api/friends') && resp.status() === 200);
    await page.goto(`${BASE_URL}/app/chat`)
    await friendsPromise;

    // Debug: check local storage and URL
    const url = page.url()
    const storage = await page.evaluate(() => localStorage.getItem('auth-storage'))
    console.log('Current URL:', url)
    console.log('Auth Storage:', storage)

    // Verify we are on the chat page
    await expect(page).toHaveURL(/\/app\/chat/)

    // Verify "Friends" tab is active by default or clickable.
    // NOTE: the compact in-page tab switcher (data-testid="tab-friends") is rendered
    // with Tailwind's `md:hidden` in ChatPage.tsx (src/features/chat/components/ChatPage.tsx),
    // so it only exists in the mobile (<768px) layout — desktop uses the icon-rail nav
    // (links to /app/friends, /app/groups, ...) instead. Only assert it on "mobile".
    if (testInfo.project.name === 'mobile') {
      const friendsTab = page.getByTestId('tab-friends')
      // Depending on your UI, checking visibility might be enough
      await expect(friendsTab).toBeVisible()
    }

    // Verify header title is "好友" or "Friends"
    await expect(page.locator('h1')).toHaveText(/好友|Friends/)

    // Verify friend list items are rendered
    await expect(page.getByText('Alice')).toBeVisible()
    await expect(page.getByText('Bob')).toBeVisible()

    // NOTE: the "select a conversation" placeholder lives in ChatPage.tsx's desktop
    // detail pane, which carries `hidden md:flex` unconditionally — so on mobile it
    // never renders at all (a selected conversation opens as a full-screen overlay
    // instead). Only assert the placeholder on the desktop ("chromium") project.
    if (testInfo.project.name !== 'mobile') {
      // Verify "Select a conversation" placeholder is shown
      // Text might vary based on locale, check for key part or icon
      await expect(page.getByText(/选择一个会话|Select a conversation/)).toBeVisible()
    }

    // Click on Alice
    await page.getByText('Alice').click()

    if (testInfo.project.name !== 'mobile') {
      // Verify chat window opens (Placeholder should disappear, Alice's name should appear in header)
      await expect(page.getByText(/选择一个会话|Select a conversation/)).not.toBeVisible()
    }

    // Check for chat header with Alice's name.
    // NOTE: "Alice" also appears in DOM nodes that are CSS-hidden at this viewport
    // (the sidebar list item on mobile once isDetailView hides it, and duplicate
    // desktop/mobile header markup ChatPage.tsx renders for both breakpoints at
    // once). Filter to the visible match instead of assuming DOM order/`.first()`
    // lands on it, since which copy is visible flips between the two projects.
    await expect(page.getByText('Alice').locator('visible=true').first()).toBeVisible()
  })

  test('should handle empty friends list', async ({ page }) => {
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

    await page.route('**/api/friends', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, code: 200, data: [] }),
      })
    })

    // Mock other APIs
    await page.route('**/api/friends/requests/pending', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) })
    })
    await page.route('**/api/friends/requests/sent', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) })
    })
    await page.route('**/api/groups/my', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) })
    })

    const friendsPromise = page.waitForResponse(resp => resp.url().includes('/api/friends') && resp.status() === 200);
    await page.goto(`${BASE_URL}/app/chat`)
    await friendsPromise;

    // Verify empty state message
    await expect(page.getByText(/暂无好友|No friends/)).toBeVisible()

    // Verify it is empty because the backend said so, not because parsing failed
    // and the UI can't tell the difference.
    expect(shapeErrors).toEqual([])
  })

  test('should switch between tabs', async ({ page }, testInfo) => {
    // The in-page tab switcher this test drives (data-testid="tab-groups"/"tab-files")
    // is rendered with Tailwind's `md:hidden` in ChatPage.tsx (src/features/chat/components/ChatPage.tsx),
    // so it only exists in the mobile (<768px) layout — desktop switches sections by
    // navigating to /app/groups, /app/files via the icon-rail nav instead, which is a
    // different interaction this test does not exercise. Scope to "mobile" only.
    test.skip(testInfo.project.name !== 'mobile', 'in-page tab switcher (data-testid=tab-*) is md:hidden in ChatPage.tsx — mobile-only UI')

    // Mock APIs. Envelope shape per backend-docs/friends/好友添加删除.md:57
    // (friends/pending/sent) and backend-docs/groups/群聊管理.md:113-129 (groups/my).
    await page.route('**/api/friends', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) })
    })
    await page.route('**/api/friends/requests/pending', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) })
    })
    await page.route('**/api/friends/requests/sent', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) })
    })
    await page.route('**/api/groups/my', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          code: 200,
          data: [
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
        })
      })
    })
    await page.route('**/api/groups/invites/my', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ invites: [] }) })
    })

    const friendsPromise = page.waitForResponse(resp => resp.url().includes('/api/friends') && resp.status() === 200);
    const groupsPromise = page.waitForResponse(resp => resp.url().includes('/api/groups/my') && resp.status() === 200);
    await page.goto(`${BASE_URL}/app/chat`)
    await Promise.all([friendsPromise, groupsPromise]);

    // Click on Groups tab
    await page.getByTestId('tab-groups').click()
    
    // Wait for groups to load (if triggered on click or if already loaded)
    // Since we mocked it and ChatPage loads it on mount, it should be there.
    
    // Verify Groups list is loaded (mocked group 'Test Group')
    await expect(page.getByText('Test Group')).toBeVisible()
    
    // Click on Files tab
    await page.getByTestId('tab-files').click()
    
    // Verify Files view (check for text "暂无文件" or "My Files" header)
    // The sub-tab header says "My Files" or "我的文件"
    await expect(page.getByText(/我的文件|My Files/)).toBeVisible()
  })
})
