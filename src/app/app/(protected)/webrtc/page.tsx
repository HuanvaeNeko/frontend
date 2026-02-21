'use client'

import dynamic from 'next/dynamic'

const ChatPage = dynamic(() => import('@/features/chat/components/ChatPage'), { ssr: false })

export default function WebRTCPage() {
  return <ChatPage />
}
