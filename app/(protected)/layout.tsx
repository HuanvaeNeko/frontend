'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import SimpleLoading from '@/components/SimpleLoading'

const ProtectedRoute = dynamic(() => import('@/components/ProtectedRoute'), { ssr: false })

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<SimpleLoading />}>
        <div className="h-full overflow-hidden">
          {children}
        </div>
      </Suspense>
    </ProtectedRoute>
  )
}
