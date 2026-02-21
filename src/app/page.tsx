import type { Metadata } from 'next'
import LandingPage from '@/features/landing/components/LandingPage'

const APP_URL = 'https://huanvae.cn'
const TITLE = 'Huanvae Chat - AI聊天、群聊与视频会议'
const DESCRIPTION = 'Huanvae Chat 是一个面向团队与个人的智能通讯平台，提供 AI 聊天、群组协作、实时消息、文件共享与视频会议。'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: APP_URL,
    type: 'website',
    locale: 'zh_CN',
    siteName: 'Huanvae Chat',
    images: [
      {
        url: `${APP_URL}/logo.svg`,
        width: 512,
        height: 512,
        alt: 'Huanvae Chat',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${APP_URL}/logo.svg`],
  },
}

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Huanvae Chat',
  url: APP_URL,
  description: DESCRIPTION,
  inLanguage: 'zh-CN',
  potentialAction: {
    '@type': 'SearchAction',
    target: `${APP_URL}/?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
}

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Huanvae Chat',
  applicationCategory: 'CommunicationApplication',
  operatingSystem: 'Web',
  url: APP_URL,
  description: DESCRIPTION,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'CNY',
  },
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <LandingPage />
    </>
  )
}
