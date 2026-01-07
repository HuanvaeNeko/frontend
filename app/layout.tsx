import type { Metadata, Viewport } from 'next'
import '@/styles/globals.css'
import ClientProviders from './providers'

export const metadata: Metadata = {
  title: 'Huanvae Chat - AI聊天、群聊与视频会议',
  description: '智能通讯平台 - AI聊天、群组协作、视频会议',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4285f4',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" data-theme="light" className="h-full">
      <body className="h-full overflow-hidden">
        <ClientProviders>
          <div className="h-full overflow-hidden">
            {children}
          </div>
        </ClientProviders>
      </body>
    </html>
  )
}
