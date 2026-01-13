/** @type {import('next').NextConfig} */
const nextConfig = {
  // 静态 HTML 导出（用于 Cloudflare Pages 部署）
  output: 'export',

  // 图片配置
  images: {
    unoptimized: true, // 静态导出需要禁用图片优化
  },

  // URL 尾部斜杠
  trailingSlash: true,

  // 编译器优化
  compiler: {
    // 生产环境移除 console.log
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // 启用严格模式
  reactStrictMode: true,

  // 生产环境禁用 source map（减小构建体积）
  productionBrowserSourceMaps: false,

  // 环境变量（客户端可用）
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '1.0.0',
  },
}

export default nextConfig
