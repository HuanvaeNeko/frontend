import type { MetaFunction } from 'react-router'
import LandingPage from '@/features/landing/components/LandingPage'
import { mergeMeta } from '@/lib/meta'

const APP_URL = 'https://huanvae.cn'
const TITLE = 'Huanvae Chat - AI聊天、群聊与视频会议'
const DESCRIPTION =
  'Huanvae Chat 是一个面向团队与个人的智能通讯平台，提供 AI 聊天、群组协作、实时消息、文件共享与视频会议。'

export const meta: MetaFunction = ({ matches }) =>
  mergeMeta(matches, [
    { title: TITLE },
    { name: 'description', content: DESCRIPTION },
    { property: 'og:title', content: TITLE },
    { property: 'og:description', content: DESCRIPTION },
    { property: 'og:url', content: APP_URL },
    { property: 'og:type', content: 'website' },
    { property: 'og:locale', content: 'zh_CN' },
    { property: 'og:site_name', content: 'Huanvae Chat' },
    { property: 'og:image', content: `${APP_URL}/logo.svg` },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: TITLE },
    { name: 'twitter:description', content: DESCRIPTION },
    { name: 'twitter:image', content: `${APP_URL}/logo.svg` },
  ])

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
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
}

export default function Home() {
  return (
    <>
      {/* JSON-LD：内容为本文件内的静态常量序列化结果，不含任何用户输入 */}
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
