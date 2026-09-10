import { useLocation } from 'react-router'
import { EmptyContent } from '@/components/shell/EmptyContent'
import ProfileModal from '@/features/profile/components/ProfileModal'
import { useRouter } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'

export default function ProfileRoute() {
  const router = useRouter()
  const location = useLocation()
  const close = () => (location.key === 'default' ? router.replace(ROUTES.app.chat) : router.back())
  return (
    <>
      <EmptyContent hint="chat" />
      <ProfileModal isOpen onClose={close} />
    </>
  )
}
