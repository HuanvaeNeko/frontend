'use client'

import dynamic from 'next/dynamic'

const AiChatPage = dynamic(() => import('@/features/ai/components/AiChatPage'), { ssr: false })

export default function AiChat() {
  return <AiChatPage />
}
