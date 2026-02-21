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
  })

  test('should load chat page and display friends list', async ({ page }) => {
    // Mock friends API
    await page.route('**/api/friends', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          friends: [
            {
              user_id: 'friend_1',
              nickname: 'Alice',
              avatar_url: '',
              signature: 'Hi there!',
            },
            {
              user_id: 'friend_2',
              nickname: 'Bob',
              avatar_url: '',
              signature: 'Busy',
            },
          ],
        }),
      })
    })

    // Mock other chat APIs to avoid errors
    await page.route('**/api/friends/requests/pending', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ requests: [] }) })
    })
    await page.route('**/api/friends/requests/sent', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ requests: [] }) })
    })
    await page.route('**/api/groups/my', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ groups: [] }) })
    })

    // Navigate to chat page
    await page.goto(`${BASE_URL}/app/chat`)

    // Verify we are on the chat page
    await expect(page).toHaveURL(/\/app\/chat/)

    // Verify "Friends" tab is active by default or clickable
    const friendsTab = page.locator('button', { hasText: '好友' }).first()
    // Depending on your UI, checking visibility might be enough
    await expect(friendsTab).toBeVisible()

    // Verify friend list items are rendered
    await expect(page.getByText('Alice')).toBeVisible()
    await expect(page.getByText('Bob')).toBeVisible()

    // Verify "Select a conversation" placeholder is shown
    await expect(page.getByText('选择一个会话开始聊天')).toBeVisible()

    // Click on Alice
    await page.getByText('Alice').click()

    // Verify chat window opens (Placeholder should disappear, Alice's name should appear in header)
    await expect(page.getByText('选择一个会话开始聊天')).not.toBeVisible()
    
    // Check for chat header with Alice's name
    // Assuming ChatWindow has a header with the name
    await expect(page.locator('header').getByText('Alice')).toBeVisible()
  })

  test('should handle empty friends list', async ({ page }) => {
    // Mock empty friends list
    await page.route('**/api/friends', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ friends: [] }),
      })
    })

    // Mock other APIs
    await page.route('**/api/friends/requests/pending', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ requests: [] }) })
    })
    await page.route('**/api/friends/requests/sent', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ requests: [] }) })
    })
    await page.route('**/api/groups/my', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ groups: [] }) })
    })

    await page.goto(`${BASE_URL}/app/chat`)

    // Verify empty state message
    await expect(page.getByText('暂无好友')).toBeVisible()
    // Or whatever the empty state text is: "添加好友开始聊天吧！"
  })

  test('should switch between tabs', async ({ page }) => {
    // Mock APIs
    await page.route('**/api/friends', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ friends: [] }) })
    })
    await page.route('**/api/friends/requests/pending', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ requests: [] }) })
    })
    await page.route('**/api/friends/requests/sent', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ requests: [] }) })
    })
    await page.route('**/api/groups/my', async (route) => {
      await route.fulfill({ 
        status: 200, 
        body: JSON.stringify({ 
          groups: [
            { id: 'g1', name: 'Test Group', description: 'desc', owner_id: 'u1' }
          ] 
        }) 
      })
    })
    await page.route('**/api/groups/invites/my', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ invites: [] }) })
    })

    await page.goto(`${BASE_URL}/app/chat`)

    // Click on Groups tab
    await page.getByTestId('tab-groups').click()
    
    // Verify Groups list is loaded (mocked group 'Test Group')
    await expect(page.getByText('Test Group')).toBeVisible()
    
    // Click on Files tab
    await page.getByTestId('tab-files').click()
    
    // Verify Files view (check for text "暂无文件" or "My Files" header)
    // The sub-tab header says "My Files" or "我的文件"
    await expect(page.getByText('我的文件')).toBeVisible()
  })
})
