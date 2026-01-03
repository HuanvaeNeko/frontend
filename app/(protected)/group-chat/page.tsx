'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GroupChatRedirect() {
  const router = useRouter()
  
  useEffect(() => {
    router.replace('/chat/groups')
  }, [router])
  
  return null
}
