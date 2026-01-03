/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // 静态 HTML 导出
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
}

export default nextConfig
