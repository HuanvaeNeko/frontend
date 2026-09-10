import { EmptyContent } from '@/components/shell/EmptyContent'
import { RouteDialog } from '@/components/shell/RouteDialog'
import WebRTCPanel from '@/features/webrtc/components/WebRTCPanel'
import { useI18n } from '@/i18n/I18nProvider'

export default function MeetingRoute() {
  const { t } = useI18n()
  return (
    <>
      <EmptyContent hint="chat" />
      <RouteDialog title={t('shell.modals.meeting')} className="max-w-3xl">
        <WebRTCPanel />
      </RouteDialog>
    </>
  )
}
