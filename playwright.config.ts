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
// 占用过。下面两条 webServer 现在都是 `reuseExistingServer: false`，所以撞端口
// 不会再静默复用陌生服务器，而是 Playwright 直接报错退出——但那也意味着一个
// 常年占着 3100 的无关进程会让整套生产回归**跑不起来**，且报错指向端口而不是
// 我们的代码。换一个不容易撞的端口，是为了这个「响亮但也很烦」的失败别常发生。
const PRODUCTION_PORT = 39471
const PRODUCTION_BASE_URL = `http://localhost:${PRODUCTION_PORT}`
// 假后端（tests/fixtures/fake-backend.ts）的端口：production 与 dev 两条
// webServer 的 BFF_UPSTREAM_* 都指向它，见下方 webServer 数组。
const FAKE_BACKEND_PORT = 39473
// migration-regression.spec.ts 跑在生产构建产物上（见上面大段注释）；
// bff-session.spec.ts 同理——它验的是真实 Bun.serve + 真实 RR 资源路由 +
// 假后端这条完整链路，套在 chromium/mobile 的 dev server 上没有意义。
const PRODUCTION_SPECS = /(migration-regression|bff-session)\.spec\.ts$/

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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: PRODUCTION_SPECS },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: PRODUCTION_SPECS },
    {
      name: 'production',
      use: { ...devices['Desktop Chrome'], baseURL: PRODUCTION_BASE_URL },
      testMatch: PRODUCTION_SPECS,
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
      // 假后端：BFF 的上游。必须排在最前面——production 与下面 dev 两条的
      // BFF_UPSTREAM_* 都指向它。/api/friends 之类端点未鉴权会回 401，而
      // Playwright 的 url 探活要 2xx/3xx，所以探活用不需要 Bearer 的 /healthz。
      command: 'bun run tests/fixtures/fake-backend.ts',
      url: `http://127.0.0.1:${FAKE_BACKEND_PORT}/healthz`,
      env: { FAKE_BACKEND_PORT: String(FAKE_BACKEND_PORT) },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'bun run dev',
      url: 'http://localhost:3000',
      // dev 现在也要跑真实的 BFF 资源路由：src/app/routes/api.*.ts 是 RR 路由，
      // `react-router dev` 会执行它们，和生产走的是同一份代码，读的是
      // process.env（vite.config.ts 的 loadEnv 只喂 import.meta.env，见那里的
      // 补丁）。不给这三个变量，chat.spec.ts / device-matrix.spec.js 这些跑在
      // chromium/mobile 项目（即这条 dev server）上的用例一调 BFF 路由就会撞见
      // 「缺少环境变量」——它们现在都是真实登录换 cookie，不再是 page.route()
      // 在浏览器侧整个伪造 /api/session。SESSION_DB_PATH 单独用一个文件名，
      // 不与下面 production 那条的 e2e-sessions.sqlite 共用：两条 webServer
      // 并发跑，各自持有自己的会话库更省心，不必关心 SQLite 在两个独立进程间
      // 的并发写入语义。
      env: {
        BFF_UPSTREAM_HTTP: `http://127.0.0.1:${FAKE_BACKEND_PORT}`,
        BFF_UPSTREAM_WS: `ws://127.0.0.1:${FAKE_BACKEND_PORT}`,
        SESSION_DB_PATH: './e2e-dev-sessions.sqlite',
        SESSION_COOKIE_SECURE: 'false',
      },
      // 2026-09-08 撤销这一条原有的 `!process.env.CI` 豁免，理由与下面生产那条
      // 逐字相同：`webServer.url` 只检查能否拿到 200，**辨认不出对面跑的是谁的代码**。
      //
      // 当初写 reuse 时成立的前提是「:3000 上那个 dev server 是我自己开的」。
      // 现在本机除主检出外还挂着六个本仓库的 worktree（`git worktree list` 共 7 条），
      // 别的会话也会在各自的 worktree 里 `bun run dev`——先占住 :3000 的那个赢，
      // 这套 e2e 就整体打到**另一个分支的代码**上。已经踩过两次：一次报告
      // "dev server 跑到一半死了"，一次把失败归给了 HEAD 而在干净检出上复现不出来。
      // 整套 suite 被静默污染，比自起一个 dev server 多花的十几秒贵得多。
      //
      // 关掉之后，端口被别人占着时 Playwright 直接报错退出，是响亮的失败。
      // CI 上本来就是 false，这一行只改变本地行为。
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // 全量 bun run build（Vite 生产构建 + SSR bundle）很慢，timeout 必须给够，
      // 否则本地首次跑或 CI 冷启动会在构建完成前就被判定超时失败。
      command: 'bun run build && bun run start',
      url: PRODUCTION_BASE_URL,
      env: {
        PORT: String(PRODUCTION_PORT),
        BFF_UPSTREAM_HTTP: `http://127.0.0.1:${FAKE_BACKEND_PORT}`,
        BFF_UPSTREAM_WS: `ws://127.0.0.1:${FAKE_BACKEND_PORT}`,
        SESSION_DB_PATH: './e2e-sessions.sqlite',
        SESSION_COOKIE_SECURE: 'false',
      },
      // 这一条永远自起，不复用。webServer.url 只检查能否拿到 200，无法辨认
      // 对面是不是我们的服务器——一旦复用到陌生进程，这个 project 的用例
      // （安全响应头、尾斜杠 301）会静默地在错误的应用上求值。端口被占时
      // Playwright 会直接报错退出，是响亮的失败，好过悄悄测错东西。
      // （上面 dev 那条原先按"本地常年开着自己的 bun run dev"保留了 reuse，
      // 多 worktree 之后这个前提不再成立，已一并关掉，理由见那里。）
      reuseExistingServer: false,
      timeout: 600_000,
    },
  ],
})
