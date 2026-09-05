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
