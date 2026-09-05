import { dynamic } from '@/lib/dynamic'

const SettingsPage = dynamic(() => import('@/features/settings/components/SettingsPage'))

export default function Settings() {
  return <SettingsPage />
}
