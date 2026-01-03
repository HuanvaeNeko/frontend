import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/toaster'
import { UpdatePrompt } from '@/components/UpdatePrompt'
import '@/styles/globals.css'

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
    <html lang="zh-CN" data-theme="light">
      <body>
        {children}
        <Toaster />
        <UpdatePrompt autoUpdateDelay={3000} />
      </body>
    </html>
  )
}

