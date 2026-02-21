'use client'

import dynamic from 'next/dynamic'

const SettingsPage = dynamic(() => import('@/features/settings/components/SettingsPage'), { ssr: false })

export default function Settings() {
  return <SettingsPage />
}
