import { dynamic } from '@/lib/dynamic'

const ProfilePage = dynamic(() => import('@/features/profile/components/ProfilePage'))

export default function Profile() {
  return <ProfilePage />
}
