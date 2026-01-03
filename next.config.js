import withPWAInit from '@ducanh2912/next-pwa'

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 移除静态导出，使用标准 Next.js 构建
  // 部署时可以使用 Vercel、Docker 或其他支持 Next.js 的平台
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  turbopack: {},
}

export default withPWA(nextConfig)
