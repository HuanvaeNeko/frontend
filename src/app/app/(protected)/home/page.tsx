'use client'

import dynamic from 'next/dynamic'

const HomePage = dynamic(() => import('@/views/Home'), { ssr: false })

export default function Home() {
  return <HomePage />
}
