import { fileURLToPath } from 'node:url'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // 不要再加 @vitejs/plugin-react：reactRouter() 内部已经装好了 React Fast Refresh，
  // 两者叠加会让 HMR 预导入脚本重复注入，浏览器直接报
  // "Identifier 'RefreshRuntime' has already been declared"（已实测复现）。
  // vitest.config.ts 里仍然需要 plugin-react，那是另一套构建管线。
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  ssr: {
    // 必须内联 react-dom，不能保持外部化（Vite SSR 默认行为）。
    // 原因：src/app/entry.server.tsx 用的是 react-dom/server 的
    // renderToPipeableStream（Node Stream 版）。react-dom 的 package.json
    // exports 对 "./server" 按条件分流：Bun 运行时会命中它自己的 "bun" 条件，
    // 解析到 server.bun.js —— 那个文件只有 renderToReadableStream 一族的
    // Web Stream API，没有 renderToPipeableStream，外部化的话服务端一启动、
    // 一收到请求就会抛 SyntaxError 直接崩溃（已实测复现）。
    // noExternal 让 Vite 在构建期用它自己的解析逻辑把 react-dom 打进
    // build/server/index.js，不再依赖 Bun 运行时对裸模块说明符的条件解析，
    // 从根子上绕开这个冲突。entry.server.tsx 属于 src/，本任务不允许改，
    // 所以只能在这一层（构建配置）修。
    noExternal: ['react-dom'],
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
})
