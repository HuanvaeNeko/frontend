import type { MetaFunction } from 'react-router'
import { Outlet } from 'react-router'
import MainLayout from '@/components/layout/MainLayout'
import ProtectedRoute from '@/features/auth/components/ProtectedRoute'
import ProfileModal from '@/features/profile/components/ProfileModal'
import { mergeMeta } from '@/lib/meta'
import { usePathname } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { useUIStore } from '@/store/uiStore'

export const meta: MetaFunction = ({ matches }) =>
  mergeMeta(matches, [
    { name: 'robots', content: 'noindex, nofollow, noarchive' },
    { name: 'googlebot', content: 'noindex, nofollow, noimageindex' },
  ])

export default function ProtectedLayout() {
  const pathname = usePathname()
  const { profileModalOpen, closeProfileModal } = useUIStore()

  // Only video meeting needs to be standalone/fullscreen
  const isVideoMeeting = !!pathname && pathname.startsWith(ROUTES.app.videoMeeting)

  return (
    <ProtectedRoute>
      {isVideoMeeting ? (
        <Outlet />
      ) : (
        <MainLayout>
          <Outlet />
        </MainLayout>
      )}

      {/* 全局个人资料模态框 */}
      <ProfileModal isOpen={profileModalOpen} onClose={closeProfileModal} />
    </ProtectedRoute>
  )
}
