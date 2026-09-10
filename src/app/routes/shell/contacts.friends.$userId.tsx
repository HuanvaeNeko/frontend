import { useParams } from 'react-router'
import { ProfileView } from '@/components/shell/ProfileView'

export default function ContactFriend() {
  const { userId } = useParams()
  if (!userId) return null
  return <ProfileView userId={userId} />
}
