'use client'

import dynamic from 'next/dynamic'
import SoundProvider from '@/components/SoundProvider'

const Toaster = dynamic(
  () => import('@/components/ui/toaster').then(mod => ({ default: mod.Toaster })),
  { ssr: false }
)

const UpdatePrompt = dynamic(
  () => import('@/components/UpdatePrompt').then(mod => ({ default: mod.UpdatePrompt })),
  { ssr: false }
)

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SoundProvider>
      {children}
      <Toaster />
      <UpdatePrompt autoUpdateDelay={3000} />
    </SoundProvider>
  )
}

