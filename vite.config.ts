import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 如果你的仓库名是 username.github.io，请设置 base: '/'
  // 如果是其他仓库名（如 frontend），请取消注释下面这行并修改为 '/frontend/'
  // base: '/frontend/',
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
