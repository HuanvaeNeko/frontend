import { defineConfig, devices } from '@playwright/test'

// tests/migration-regression.spec.ts 断言的响应头和尾斜杠 301 只存在于
// server/index.ts（生产服务），dev server（Vite）完全没有这两样东西——
// 那套逻辑是这个 task 专门为生产部署重实现的（原先在 public/_headers 里，
// Cloudflare Pages 专有格式，Docker 下失效）。
//
// 但 testDir 是整个 tests/ 目录：一旦这个文件放进去，会被下面默认的
// chromium/mobile 项目一起捞走，而它们的 webServer 打的是 dev server ——
// 断言必然全部落空。所以这里用独立的 `production` project + `testMatch`
// 把它单独隔离出来，只在这一个 project 下跑；chromium/mobile 反过来用
// `testIgnore` 排除它，避免同一份用例在错误的服务器上重复运行、产生误报。
//
// dev（3000）和生产（同样默认 3000，见 server/index.ts 的 PORT 常量）不能
// 共用端口同时跑，所以生产服务专门用 PORT=3100 起，production project 的
// baseURL 跟着指过去。webServer 一旦用数组形式，Playwright 不会再从任何一条
// 的 port/url 自动推导全局 baseURL（见官方文档），顶层 use.baseURL 保留给
// chromium/mobile 用，production project 自己覆盖一份。
const PRODUCTION_PORT = 3100
const PRODUCTION_BASE_URL = `http://localhost:${PRODUCTION_PORT}`
const MIGRATION_REGRESSION_SPEC = /migration-regression\.spec\.ts$/

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: MIGRATION_REGRESSION_SPEC },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: MIGRATION_REGRESSION_SPEC },
    {
      name: 'production',
      use: { ...devices['Desktop Chrome'], baseURL: PRODUCTION_BASE_URL },
      testMatch: MIGRATION_REGRESSION_SPEC,
      // 默认 30s 对这个 project 偏紧：它的用例会和 chromium/mobile 的整个设备
      // 矩阵一起并发跑，本机 8 核下这套用例本身多数几十毫秒到几秒内完成，但
      // 留够余量应对并发争抢。翻倍到 60s，CI 下 workers 强制为 1 没有这个
      // 争抢，实际不会跑满。（这个 project 里的"认证守卫"用例目前会稳定
      // 超时失败——那是一个已定位、待修的 src/ bug，不是这里的余量不够，
      // 详见该用例内的注释。）
      timeout: 60_000,
    },
  ],
  webServer: [
    {
      command: 'bun run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // 全量 bun run build（Vite 生产构建 + SSR bundle）很慢，timeout 必须给够，
      // 否则本地首次跑或 CI 冷启动会在构建完成前就被判定超时失败。
      command: 'bun run build && bun run start',
      url: PRODUCTION_BASE_URL,
      env: { PORT: String(PRODUCTION_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
    },
  ],
})
