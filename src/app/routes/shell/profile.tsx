import { EmptyContent } from '@/components/shell/EmptyContent'
import { useRouteDialogClose } from '@/components/shell/RouteDialog'
import ProfileModal from '@/features/profile/components/ProfileModal'

export default function ProfileRoute() {
  const close = useRouteDialogClose()
  return (
    <>
      <EmptyContent hint="chat" />
      <ProfileModal isOpen onClose={close} />
    </>
  )
}
