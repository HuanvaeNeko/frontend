import { Navigate, useOutlet } from 'react-router'
import { settingsPath } from '@/lib/routes'

export default function SettingsIndex() {
  const outlet = useOutlet()
  return outlet ?? <Navigate to={settingsPath('appearance')} replace />
}
