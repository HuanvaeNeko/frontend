'use client'

import dynamic from 'next/dynamic'

const GroupChatPage = dynamic(() => import('@/views/GroupChat'), { ssr: false })

export default function GroupChatClient() {
  return <GroupChatPage />
}
