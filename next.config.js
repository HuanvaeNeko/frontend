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
  output: 'export', // 静态导出
  trailingSlash: true,
  images: {
    unoptimized: true, // 静态导出需要禁用图片优化
  },
  // 忽略构建时的 ESLint 错误（可选）
  eslint: {
    ignoreDuringBuilds: false,
  },
  // 忽略构建时的 TypeScript 错误（可选）
  typescript: {
    ignoreBuildErrors: false,
  },
}

export default withPWA(nextConfig)

