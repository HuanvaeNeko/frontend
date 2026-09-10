import { Navigate, useParams } from 'react-router'
import { SECTION_COMPONENTS } from '@/components/shell/settings/sections'
import { isSettingsSection, settingsPath } from '@/lib/routes'

export default function SettingsSectionRoute() {
  const { section } = useParams()
  if (!section || !isSettingsSection(section)) return <Navigate to={settingsPath('appearance')} replace />
  const Section = SECTION_COMPONENTS[section]
  return (
    <div className="app-scrollbar h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[720px]"><Section /></div>
    </div>
  )
}
