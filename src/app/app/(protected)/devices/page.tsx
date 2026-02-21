'use client'

import dynamic from 'next/dynamic'

const DevicesPage = dynamic(() => import('@/features/settings/components/DevicesPage'), { ssr: false })

export default function Devices() {
  return <DevicesPage />
}
