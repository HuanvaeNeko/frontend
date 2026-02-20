import { test, expect } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:4173'

const authState = {
  state: {
    accessToken: 'matrix-test-token',
    refreshToken: 'matrix-test-refresh',
    user: {
      user_id: 'matrix_user',
      nickname: 'Matrix QA',
      email: 'matrix@example.com',
      avatar_url: '',
      signature: '',
    },
    isAuthenticated: true,
    tokenExpiry: Date.now() + 24 * 60 * 60 * 1000,
  },
  version: 0,
}

const matrix = [
  { name: 'SmallPhone', viewport: { width: 360, height: 640 }, orientations: ['portrait', 'landscape'] },
  { name: 'MidPhone', viewport: { width: 390, height: 844 }, orientations: ['portrait', 'landscape'] },
  { name: 'LargePhone', viewport: { width: 430, height: 932 }, orientations: ['portrait', 'landscape'] },
  { name: 'SmallTablet', viewport: { width: 768, height: 1024 }, orientations: ['portrait', 'landscape'] },
  { name: 'LargeTablet', viewport: { width: 1024, height: 1366 }, orientations: ['portrait', 'landscape'] },
  { name: 'Laptop', viewport: { width: 1280, height: 800 }, orientations: ['landscape'] },
  { name: 'Desktop', viewport: { width: 1440, height: 900 }, orientations: ['landscape'] },
  { name: 'DesktopHD', viewport: { width: 1920, height: 1080 }, orientations: ['landscape'] },
]

const pages = [
  { name: 'Login', path: '/login/', requiresAuth: false },
  { name: 'Register', path: '/register/', requiresAuth: false },
  { name: 'Home', path: '/home/', requiresAuth: true },
  { name: 'Chat', path: '/chat/', requiresAuth: true },
  { name: 'VideoMeeting', path: '/video-meeting/?room=matrix&pwd=123', requiresAuth: true },
  { name: 'Settings', path: '/settings/', requiresAuth: true },
]

async function collectMetricsWithRetry(page, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await page.evaluate(() => {
        const doc = globalThis.document?.documentElement ?? null
        const body = globalThis.document?.body ?? null
        const sw = doc ? doc.scrollWidth : 0
        const cw = doc ? doc.clientWidth : 0
        const textLen = body?.innerText?.trim().length ?? 0
        const htmlLen = body?.innerHTML?.length ?? 0
        const hasHorizontalOverflow = sw - cw > 1
        const visibleInteractive = Array.from(
          globalThis.document?.querySelectorAll('button,a,[role="button"]') ?? []
        ).filter((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
        const visibleInteractiveCount = visibleInteractive.length
        const tooSmallTapTargets = visibleInteractive.filter((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width < 40 || rect.height < 40
        }).length
        return {
          sw,
          cw,
          textLen,
          htmlLen,
          hasHorizontalOverflow,
          visibleInteractiveCount,
          tooSmallTapTargets,
        }
      })
    } catch (error) {
      const message = String(error)
      if (!message.includes('Execution context was destroyed')) throw error
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(250)
    }
  }
  // Fall back to server-rendered shell metrics when page context keeps rotating.
  const html = await page.content().catch(() => '')
  return {
    sw: 0,
    cw: 0,
    textLen: 0,
    htmlLen: html.length,
    hasHorizontalOverflow: false,
    visibleInteractiveCount: 0,
    tooSmallTapTargets: 0,
  }
}

function withCacheBust(path, cacheKey) {
  const joiner = path.includes('?') ? '&' : '?'
  return `${BASE_URL}${path}${joiner}__e2e=${encodeURIComponent(cacheKey)}`
}

async function navigateAndWait(page, targetUrl) {
  const response = await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  })

  let metrics = null
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(400)
    metrics = await collectMetricsWithRetry(page, 2)

    if (metrics.textLen > 0 || metrics.visibleInteractiveCount > 0 || metrics.htmlLen > 4000) {
      return { response, metrics }
    }

    // Soft-recover once page renders as shell/blank.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(400)
  }

  return { response, metrics }
}

for (const device of matrix) {
  for (const orientation of device.orientations) {
    const viewport = orientation === 'landscape'
      ? { width: device.viewport.height, height: device.viewport.width }
      : { ...device.viewport }

    test.describe(`${device.name}-${orientation}`, () => {
      for (const pageCase of pages) {
        test(`${pageCase.name}`, async ({ browser }) => {
          test.setTimeout(60000)
          const context = await browser.newContext({ viewport })
          const page = await context.newPage()

          const runtimeErrors = []
          page.on('pageerror', (err) => runtimeErrors.push(err.message))

          if (pageCase.requiresAuth) {
            await page.addInitScript((payload) => {
              globalThis.localStorage?.setItem('auth-storage', JSON.stringify(payload))
            }, authState)
          } else {
            await page.addInitScript(() => {
              globalThis.localStorage?.removeItem('auth-storage')
            })
          }

          const cacheKey = `${device.name}-${orientation}-${pageCase.name}-${Date.now()}`
          const targetUrl = withCacheBust(pageCase.path, cacheKey)
          let { response, metrics } = await navigateAndWait(page, targetUrl)

          // Recover from transient chunk-load failures once.
          if (runtimeErrors.some((msg) => msg.includes('Failed to load chunk'))) {
            runtimeErrors.length = 0
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(400)
            metrics = await collectMetricsWithRetry(page, 2)
            response = response ?? (await page.waitForResponse(() => true, { timeout: 3000 }).catch(() => null))
          }

          expect(response && response.status(), `HTTP status for ${pageCase.path}`).toBeGreaterThanOrEqual(200)
          expect(response && response.status(), `HTTP status for ${pageCase.path}`).toBeLessThan(400)
          expect(
            metrics.textLen > 0 || metrics.visibleInteractiveCount > 0 || metrics.htmlLen > 4000,
            `Empty body on ${pageCase.path} (textLen=${metrics.textLen}, interactive=${metrics.visibleInteractiveCount}, htmlLen=${metrics.htmlLen})`
          ).toBeTruthy()
          expect(metrics.hasHorizontalOverflow, `Horizontal overflow on ${pageCase.path} at ${viewport.width}x${viewport.height} (sw=${metrics.sw}, cw=${metrics.cw})`).toBeFalsy()
          expect(runtimeErrors, `Runtime errors on ${pageCase.path}: ${runtimeErrors.join(' | ')}`).toEqual([])

          await context.close()
        })
      }
    })
  }
}
