'use client'

import ProfileModal from '@/components/ProfileModal'
import ProtectedRoute from '@/components/ProtectedRoute'
import MainLayout from '@/components/layout/MainLayout'
import { ROUTES } from '@/lib/routes'
import { useUIStore } from '@/store/uiStore'
import { usePathname } from 'next/navigation'

export default function ProtectedLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { profileModalOpen, closeProfileModal } = useUIStore()
  
  // Only video meeting needs to be standalone/fullscreen
  const isVideoMeeting = !!pathname && pathname.startsWith(ROUTES.app.videoMeeting)

  return (
    <ProtectedRoute>
      {isVideoMeeting ? children : <MainLayout>{children}</MainLayout>}

      {/* 全局个人资料模态框 */}
      <ProfileModal isOpen={profileModalOpen} onClose={closeProfileModal} />
    </ProtectedRoute>
  )
}
