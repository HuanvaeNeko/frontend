// @ts-check
import { serwist } from '@serwist/next/config'

export default serwist({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // 不预缓存可能在生产环境 404 的 URL（如 /~offline 由 fallback 按需请求即可）
  // 过滤在 app/sw.ts 中通过 precacheEntries 运行时完成
})
