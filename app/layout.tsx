import type { Metadata, Viewport } from 'next'
import '@/styles/globals.css'
import ClientProviders from './providers'
import { SerwistProvider } from './serwist'

const APP_NAME = 'Huanvae Chat'
const APP_DEFAULT_TITLE = 'Huanvae Chat - AI聊天、群聊与视频会议'
const APP_DESCRIPTION = '智能通讯平台 - AI聊天、群组协作、视频会议，支持实时消息、文件共享、视频通话'
const APP_URL = 'https://web.huanvae.cn'

export const metadata: Metadata = {
  // 基础元数据
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: '%s | Huanvae Chat',
  },
  description: APP_DESCRIPTION,
  keywords: ['聊天', 'AI', '即时通讯', '视频会议', '群聊', 'WebRTC', 'PWA'],
  authors: [{ name: 'Huanvae Team' }],
  creator: 'Huanvae',
  publisher: 'Huanvae',

  // PWA
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },

  // Open Graph
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: '%s | Huanvae Chat',
    },
    description: APP_DESCRIPTION,
    url: APP_URL,
    locale: 'zh_CN',
    images: [
      {
        url: `${APP_URL}/logo.svg`,
        width: 512,
        height: 512,
        alt: APP_NAME,
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: {
      default: APP_DEFAULT_TITLE,
      template: '%s | Huanvae Chat',
    },
    description: APP_DESCRIPTION,
    images: [`${APP_URL}/logo.svg`],
  },

  // 机器人指令
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },

  // 其他
  metadataBase: new URL(APP_URL),
  alternates: {
    canonical: '/',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#4285f4',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" data-theme="light" className="h-full">
      <body className="h-full overflow-hidden">
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === 'development'}>
          <ClientProviders>
            <div className="h-full overflow-hidden">
              {children}
            </div>
          </ClientProviders>
        </SerwistProvider>
      </body>
    </html>
  )
}
