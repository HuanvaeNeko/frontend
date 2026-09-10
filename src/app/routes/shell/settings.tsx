import { Navigate, useOutlet } from 'react-router'
import { useShellFold } from '@/components/shell/useShellFold'
import { settingsPath } from '@/lib/routes'

/** 桌面：没有分区就跳 appearance；折叠：停在索引，让列表栏显示分区列表（跳了会把「返回列表」变成死循环） */
export default function SettingsIndex() {
  const outlet = useOutlet()
  const fold = useShellFold()
  if (outlet) return outlet
  return fold === 'desktop' ? <Navigate to={settingsPath('appearance')} replace /> : null
}
