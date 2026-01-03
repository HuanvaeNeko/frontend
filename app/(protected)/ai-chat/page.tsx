'use client'

import dynamic from 'next/dynamic'

const AiChatPage = dynamic(() => import('@/views/AiChat'), { ssr: false })

export default function AiChat() {
  return <AiChatPage />
}
