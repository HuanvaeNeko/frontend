import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    // server/ 下是 BFF 的服务端代码，不在 src/ 里。漏掉这一条的话
    // server/**/__tests__ 会被静默跳过——测试文件存在、也全绿、但一条都没跑。
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'server/**/__tests__/**/*.test.ts'],
    // *.bun.test.ts 由 `bun test` 跑（它们 import bun:sqlite，Node 下必然失败）。
    // 上面的 *.test.ts 会匹配到它们，必须显式排除。
    exclude: ['**/node_modules/**', '**/*.bun.test.ts'],
  },
})
