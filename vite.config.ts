import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { type UserConfig, defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { SESSION_COOKIE_NAME } from './server/session/cookie'
import { SESSION_SELECT_BY_ID_SQL } from './server/session/sql'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')) as {
  version: string
}

export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  // Next 以前靠 next.config.js 自动把 npm_package_version 注入 process.env，
  // src/lib/version.ts 读 import.meta.env.VITE_APP_VERSION 时其实吃的是这个值。
  // 迁移后没有等价物：没有 .env 文件时 VITE_APP_VERSION 是 undefined，version.ts
  // 会静默回退到硬编码的 '1.0.0'——UpdatePrompt.tsx 的版本徽标和 Sentry release
  // 名都跟着失真（已实测复现：删掉 .env 后生产构建产物里 grep 不到真实版本号）。
  //
  // 用 loadEnv 而不是直接读 process.env.VITE_APP_VERSION，是因为要让写在
  // .env / .env.production 里的显式 VITE_APP_VERSION 也能生效——这是 Vite 官方
  // 加载 env 文件的方式，和 Vite 自己给 import.meta.env.VITE_* 做自动注入用的是
  // 同一套 loadEnv 逻辑；直接读 process.env 只能感知 shell 导出的变量，会漏掉
  // .env 文件里写的值。
  //
  // 下面这个 define 会整体覆盖 Vite 对同名 key 的自动注入（Vite 内部
  // definePlugin 按 {...自动注入的 importMetaKeys, ...用户 define} 顺序合并，
  // 后者覆盖前者——见 node_modules/vite/dist/node/chunks/node.js
  // definePlugin/generatePattern），所以"显式环境变量优先，否则回退到
  // package.json"这个优先级必须在这一行自己算清楚，不能指望"不设置就还是走
  // Vite 默认值"。
  const env = loadEnv(mode, process.cwd(), '')

  // Vite 的 loadEnv 只喂 import.meta.env，不喂 process.env；但 BFF 资源路由
  // （src/app/routes/api.*.ts）跑在 react-router dev 里，读的是 process.env
  // （server/upstream.ts、server/session/index.ts、server/session/cookie.ts）。
  // 不做这一步，开发者写在 .env / .env.development.local 里的值永远到不了
  // 它们，BFF 直接抛「缺少环境变量」。
  //
  // 不能用 ??=：它的短路只看左值，右值是 undefined 时照样赋值——而 Node 的
  // process.env setter 会把 undefined 强制转成字符串 "undefined"，反而骗过
  // server/upstream.ts、server/session/index.ts 的「缺少环境变量」守卫（字符串
  // "undefined" 是真值），dev 会在仓库根目录静默开一个名叫 undefined 的 SQLite
  // 会话库（已实测复现）。所以右值也要判一次，只在 env[key] 是非空字符串时才
  // 赋值；左值非 undefined（shell / CI 已显式导出）时不覆盖，方向不变。
  for (const key of ['BFF_UPSTREAM_HTTP', 'BFF_UPSTREAM_WS', 'SESSION_DB_PATH', 'SESSION_COOKIE_SECURE'] as const) {
    if (process.env[key] === undefined && env[key]) process.env[key] = env[key]
  }

  // node:sqlite 只有 dev（下面 /ws 代理的同步钩子）才需要，而且**只能在这里动态加载**：
  // Docker 的 build 阶段没有 Node，`react-router build` 由 Bun 执行，Bun 1.3 没有
  // node:sqlite —— 顶层静态 import 会让整份配置在 Bun 下加载失败（2026-09-10 上线时
  // 镜像构建就是这样挂的；本机能过只是因为 react-router 的 shebang 让它跑在 Node 上）。
  // 变量说明符 + @vite-ignore 与 server/session/db.ts 同一手法：任何打包器都无法静态
  // 解析它，build 模式下这一行根本不会执行。
  type SqliteModule = typeof import('node:sqlite')
  const sqliteSpecifier = 'node:sqlite'
  const sqlite: SqliteModule | null =
    command === 'serve' ? ((await import(/* @vite-ignore */ sqliteSpecifier)) as SqliteModule) : null

  return {
    // 不要再加 @vitejs/plugin-react：reactRouter() 内部已经装好了 React Fast Refresh，
    // 两者叠加会让 HMR 预导入脚本重复注入，浏览器直接报
    // "Identifier 'RefreshRuntime' has already been declared"（已实测复现）。
    // vitest.config.ts 里仍然需要 plugin-react，那是另一套构建管线。
    plugins: [
      tailwindcss(),
      reactRouter(),
      // PWA Service Worker：@serwist/vite 在 Vite 8 + RR8 下不可用（它只认 Vite
      // 单一顶层 build.outDir，RR8 用 Environment API 分别配置 client/ssr 的
      // outDir，顶层 outDir 保持 Vite 默认值 "dist"，产物会错误地落到项目根的
      // dist/ 而不是 build/client/ —— 已通过读源码 + 实测复现确认，详见
      // docs/superpowers/specs/2026-09-04-spike-findings.md §2）。
      // 改用 vite-plugin-pwa 的 injectManifest 模式：outDir 是它自己文档化的公开
      // 配置项，不依赖任何未公开行为，已在 spike 中验证跑通。
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src/app',
        filename: 'sw.ts',
        outDir: 'build/client',
        // 项目在 UpdatePrompt.tsx 里手写了自己的注册逻辑
        // （navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })），
        // 不需要插件生成注册脚本。
        injectRegister: false,
        // manifest.json 已由 public/manifest.json 静态提供，不用插件生成/接管。
        manifest: false,
        injectManifest: {
          globDirectory: 'build/client',
        },
        // 不设置 devOptions.enabled（默认 false）：dev 模式下插件不生成/不注册
        // SW，只有生产构建才产出 build/client/sw.js —— 见 Task 8 verification。
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      // 显式环境变量（.env / shell）优先，否则回退到 package.json 的真实版本号；
      // 绝不再回退到硬编码字符串——那正是本次要修的问题。
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(env.VITE_APP_VERSION || pkg.version),
    },
    ssr: {
      // 仅在 build 时内联 react-dom，dev 下必须保持外部化（Vite SSR 默认行为）。
      //
      // 为什么 build 需要内联：src/app/entry.server.tsx 用的是 react-dom/server 的
      // renderToPipeableStream（Node Stream 版）。react-dom 的 package.json
      // exports 对 "./server" 按条件分流：Bun 运行时会命中它自己的 "bun" 条件，
      // 解析到 server.bun.js —— 那个文件只有 renderToReadableStream 一族的
      // Web Stream API，没有 renderToPipeableStream，外部化的话服务端一启动、
      // 一收到请求就会抛 SyntaxError 直接崩溃（已实测复现）。
      // noExternal 让 Rolldown 在构建期用 Vite 自己的解析逻辑把 react-dom 静态打进
      // build/server/index.js，不再依赖 Bun 运行时对裸模块说明符的条件解析，
      // 从根子上绕开这个冲突。entry.server.tsx 属于 src/，本任务不允许改，
      // 所以只能在这一层（构建配置）修。
      //
      // 为什么 dev 下不能内联（已实测复现，100% 复现，不是偶发）：dev 走的是
      // Vite 的 SSR 模块运行器（module runner），它对 noExternal 命中的模块是
      // 请求时现场内联执行，不经过 Rolldown 静态打包，也不提供 CJS 的 require
      // shim。react-dom/server 的 CJS 产物（server.node.js）里有裸 require 调用，
      // 现场内联执行会直接抛 "require is not defined"，导致每个 SSR 路由都
      // 500。dev 模式的默认（外部化）解析本来就没有上面那个 Bun 条件导出问题——
      // 那是只有"构建期静态打包"这条路径才会触发的坑，dev 走的是另一条路径，
      // 不需要也不能套用同一个 workaround。
      //
      // 影响范围提醒：noExternal 是按 npm 包名整体匹配的（Vite 内部
      // shouldExternalize/createIsConfiguredAsExternal 用 pkgName 做过滤，见
      // node_modules/vite/dist/node/chunks/node.js），无法只精确到
      // "react-dom/server" 这一个子路径。所以 build 模式下这行也会连带把
      // react-dom 的根导出（"."）一起内联——GroupList.tsx、FriendList.tsx、
      // file-preview.tsx 里 `import { createPortal } from 'react-dom'` 走的
      // 就是这个根导出。这是无害的：react-dom 的 "." 导出没有 Bun 专属条件，
      // 内联和外部化加载到的是同一份文件，行为不变，但这里如实记录，不用
      // "只影响 server 子路径"这种过窄的说法。
      noExternal: command === 'build' ? ['react-dom'] : [],
    },
    build: {
      sourcemap: false,
      // 生产剥离 console.log，保留 error / warn（原 next.config.js 的 compiler.removeConsole）
      // 用 Vite 8 原生 oxc 路径，不引入 terser —— 见 spike 结论 §4.1
      minify: 'oxc',
      rolldownOptions: {
        output: {
          minify: {
            compress: {
              // 显式关闭"全量删除 console.*"，防止未来默认值变化导致行为回退
              dropConsole: false,
              treeshake: {
                // 只把 console.log 标记为可安全消除的纯函数调用
                manualPureFunctions: ['console.log'],
              },
            },
          },
        },
      },
    },
    server: {
      port: 3000,
      proxy: {
        // 开发环境的 WS 代理。
        //
        // 为什么不能和生产共用一段代码：生产是 Bun.serve 的原生 websocket 处理器，
        // 开发是 `react-router dev` 起的 Vite server —— 帧的收发两边都由平台做，
        // 我们只共享「cookie → token」这一段。这是诚实的不对称，不是隐藏的分叉。
        //
        // ⚠️ 两个键都必须是精确匹配（`^…$` / `^…`，Vite 按 RegExp 解析以 `^`
        // 开头的键），不能沿用 Vite 默认的前缀匹配：旧版本这里只有一条前缀键
        // `'/ws'`，`/ws/webrtc/rooms/x`（WebRTC 信令，见 server/index.ts 的
        // 第二条升级分支）会被它一起接住，下面 proxyReqWs 钩子再把 proxyReq.path
        // 整个改写成 `/ws?token=<聊天会话的 access_token>`——信令 socket 静默
        // 连到了聊天端点，还带错一套 token（Task 12 评审 C1）。
        //
        // ⚠️ proxyReqWs 是**同步**回调，读不了异步打开的 session store，
        // 所以这里自己用 node:sqlite 同步查一次。语句从 server/session/sql.ts 取，
        // 与 store 共用同一份字符串，避免两处各写一遍 SELECT 然后分叉。
        //
        // 同步也意味着**这里不能刷新 token**：连接时若 access token 已过期，
        // 上游会在握手时回 401，客户端现有的重连退避接管；而 ChatPage 挂载时的
        // loadProfile() 总会先经 /api/* 把它刷新。开发环境可以接受这个限制。
        '^/ws$': {
          target: env.BFF_UPSTREAM_WS || 'ws://127.0.0.1:8787',
          ws: true,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReqWs', (proxyReq, req) => {
              const cookie = req.headers.cookie ?? ''
              // cookie 名从 SESSION_COOKIE_NAME 取，不手抄字符串：那样改一次 cookie
              // 名，这里会悄悄漏改，开发环境 WS 鉴权跟着静默失效且没有任何报错
              const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`).exec(cookie)
              if (!match) return

              const dbPath = env.SESSION_DB_PATH
              if (!dbPath || !sqlite) return

              let db: InstanceType<SqliteModule['DatabaseSync']> | undefined
              try {
                db = new sqlite.DatabaseSync(dbPath)
                const row = db.prepare(SESSION_SELECT_BY_ID_SQL).get(match[1]) as { access_token?: string } | undefined
                if (row?.access_token) {
                  proxyReq.path = `/ws?token=${encodeURIComponent(row.access_token)}`
                }
              } catch {
                // 读不到就让上游按「没有 token」处理（HTTP 400），不静默伪造一个；
                // 只打路径，绝不打 token / cookie
                console.warn(`[ws-proxy] 读会话库失败：${dbPath}`)
              } finally {
                db?.close()
              }
            })
          },
        },
        // WebRTC 信令透传（server/index.ts 的第二条升级分支，spec §4.6）：不查
        // 会话、不注入 token，path+query 原样接上游，所以**不设 configure**——
        // 加一个钩子就多一次「顺手改写 path」的诱惑，这条路径的正确行为恰恰是
        // 什么都不做。
        '^/ws/webrtc/': {
          target: env.BFF_UPSTREAM_WS || 'ws://127.0.0.1:8787',
          ws: true,
          changeOrigin: true,
        },
      },
    },
  }
})
