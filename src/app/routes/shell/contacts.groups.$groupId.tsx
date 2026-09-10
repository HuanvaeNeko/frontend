import { useParams } from 'react-router'
import GroupManagement from '@/features/chat/components/sidebar/GroupManagement'
import { useRouter } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'

export default function ContactGroup() {
  const { groupId } = useParams()
  const router = useRouter()
  if (!groupId) return null
  return (
    <div className="app-scrollbar h-full overflow-y-auto p-4">
      <GroupManagement groupId={groupId} onClose={() => router.replace(ROUTES.app.contacts)} />
    </div>
  )
}
