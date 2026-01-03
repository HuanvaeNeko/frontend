'use client'

import { Suspense } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import LoadingAnimation from '@/components/LoadingAnimation'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoadingAnimation />}>
        {children}
      </Suspense>
    </ProtectedRoute>
  )
}

