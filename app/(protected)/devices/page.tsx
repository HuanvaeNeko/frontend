'use client'

import dynamic from 'next/dynamic'

const DevicesPage = dynamic(() => import('@/views/Devices'), { ssr: false })

export default function Devices() {
  return <DevicesPage />
}
