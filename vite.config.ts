import { fileURLToPath } from 'node:url'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // 不要再加 @vitejs/plugin-react：reactRouter() 内部已经装好了 React Fast Refresh，
  // 两者叠加会让 HMR 预导入脚本重复注入，浏览器直接报
  // "Identifier 'RefreshRuntime' has already been declared"（已实测复现）。
  // vitest.config.ts 里仍然需要 plugin-react，那是另一套构建管线。
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
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
  server: { port: 3000 },
}))
