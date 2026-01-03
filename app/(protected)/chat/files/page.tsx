'use client'

import dynamic from 'next/dynamic'

const ChatPage = dynamic(() => import('@/views/ChatPage'), { ssr: false })

export default function ChatFiles() {
  return <ChatPage />
}
