'use client'

import dynamic from 'next/dynamic'

const FriendsPage = dynamic(() => import('@/views/Friends'), { ssr: false })

export default function Friends() {
  return <FriendsPage />
}
