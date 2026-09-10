import { Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

const base = 'flex flex-col items-center justify-center gap-2 px-4 py-8 text-[13px] text-app-light'

export function ListLoading({ message }: { message?: string }) {
  const { t } = useI18n()
  return (
    <div className={base} role="status">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{message ?? t('shell.list.loading')}</span>
    </div>
  )
}

export function ListError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <div className={`${base} text-destructive`} role="alert">
      <span>{t('shell.list.loadFailed')}: {error}</span>
      {onRetry && (
        <button type="button" className="subtle-btn" onClick={onRetry}>{t('shell.list.retry')}</button>
      )}
    </div>
  )
}

export function ListEmpty({ message }: { message: string }) {
  return <div className={base}><span>{message}</span></div>
}
