'use client'

import ProfileModal from '@/components/ProfileModal'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useUIStore } from '@/store/uiStore'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profileModalOpen, closeProfileModal } = useUIStore()

  return (
    <ProtectedRoute>
      <div className="h-full overflow-hidden">
        {children}
      </div>
      
      {/* 全局个人资料模态框 */}
      <ProfileModal isOpen={profileModalOpen} onClose={closeProfileModal} />
    </ProtectedRoute>
  )
}
