'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import SimpleLoading from '@/components/SimpleLoading'
import ProfileModal from '@/components/ProfileModal'
import { useUIStore } from '@/store/uiStore'

const ProtectedRoute = dynamic(() => import('@/components/ProtectedRoute'), { ssr: false })

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profileModalOpen, closeProfileModal } = useUIStore()

  return (
    <ProtectedRoute>
      <Suspense fallback={<SimpleLoading />}>
        <div className="h-full overflow-hidden">
          {children}
        </div>
      </Suspense>
      
      {/* 全局个人资料模态框 */}
      <ProfileModal isOpen={profileModalOpen} onClose={closeProfileModal} />
    </ProtectedRoute>
  )
}
