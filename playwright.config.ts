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
// 3100 太"大众"了：实测被本机另一个无关项目（~/Code/th 的 react-router-serve）
// 占用过。配合下面 webServer 的 reuseExistingServer，Playwright 会直接复用那个
// 陌生服务器，于是 29 条生产回归用例全部打到别人的应用上——响应头断言自然全挂，
// 而失败信息看上去像是我们的代码坏了。换一个不容易撞的端口。
const PRODUCTION_PORT = 39471
const PRODUCTION_BASE_URL = `http://localhost:${PRODUCTION_PORT}`
const MIGRATION_REGRESSION_SPEC = /migration-regression\.spec\.ts$/

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 本地和 CI 都用 1。chat.spec.ts 里两个用例用 page.route() 拦截 +
  // waitForResponse 打 dev server，而 Vite dev 的按需转译在并发下会被饿死：
  // 页面 JS chunk 还没加载完，那个 fetch 就不会发出，30s 超时耗尽。
  // 先试过 workers: 2 作为"并发验证价值 vs 稳定性"的折中，实测仍会见红
  // （隔离单跑同样两个用例只需 3.2s / 1.3s，证明是争抢不是用例本身慢）。
  // 这套 e2e 是整个迁移的安全网，它必须可信：本地绿和 CI 绿含义相同，
  // 比省几分钟墙钟更重要。一个刚 clone 的干净检出跑出红色，
  // 会教会下一个人不信任这套测试。
  workers: 1,
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
      // 争抢，实际不会跑满。（这个 project 里的"认证守卫"用例曾经会稳定
      // 超时失败——根因是 src/lib/navigation.ts 的 useRouter() 每次渲染返回
      // 新对象，已在 commit be14018 修复，详见该用例内的注释。60s 这个数字
      // 从修复前就定下了，纯粹是并发争抢的余量，不是为了兜住那个 bug——bug
      // 修复后这条用例正常几秒内通过。）
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
      // 这一条永远自起，不复用。webServer.url 只检查能否拿到 200，无法辨认
      // 对面是不是我们的服务器——一旦复用到陌生进程，这个 project 的用例
      // （安全响应头、尾斜杠 301）会静默地在错误的应用上求值。上面 dev 那条
      // 保留 reuse 是有真实便利（本地常年开着 bun run dev），而"生产构建常驻"
      // 不是任何人的工作习惯，所以这里关掉零成本。端口被占时 Playwright 会
      // 直接报错退出，是响亮的失败，好过悄悄测错东西。
      reuseExistingServer: false,
      timeout: 600_000,
    },
  ],
})
