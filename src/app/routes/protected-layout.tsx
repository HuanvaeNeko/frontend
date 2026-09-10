import type { MetaFunction } from 'react-router'
import { Outlet } from 'react-router'
import ProtectedRoute from '@/features/auth/components/ProtectedRoute'
import ProfileModal from '@/features/profile/components/ProfileModal'
import { mergeMeta } from '@/lib/meta'
import { useUIStore } from '@/store/uiStore'

export const meta: MetaFunction = ({ matches }) =>
  mergeMeta(matches, [
    { name: 'robots', content: 'noindex, nofollow, noarchive' },
    { name: 'googlebot', content: 'noindex, nofollow, noimageindex' },
  ])

export default function ProtectedLayout() {
  const { profileModalOpen, closeProfileModal } = useUIStore()
  return (
    <ProtectedRoute>
      <Outlet />
      <ProfileModal isOpen={profileModalOpen} onClose={closeProfileModal} />
    </ProtectedRoute>
  )
}
