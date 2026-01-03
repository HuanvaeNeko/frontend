'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import LoadingAnimation from '@/components/LoadingAnimation'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/chat')
  }, [router])

  // 显示加载动画，直到重定向完成
  return <LoadingAnimation />
}
