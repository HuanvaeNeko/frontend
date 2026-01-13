// @ts-check
import { spawnSync } from 'node:child_process'
import { serwist } from '@serwist/next/config'

// 获取 Git commit hash 作为 revision
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() 
  ?? crypto.randomUUID()

export default serwist({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // 额外预缓存的页面（已预渲染的页面会自动检测）
  additionalPrecacheEntries: [
    { url: '/~offline', revision },
  ],
})
