import { useI18n } from '@/i18n/I18nProvider'

export default function SimpleLoading() {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
      <div className="text-center">
        <div className="mb-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
        <p className="text-muted-foreground text-sm">{t('shell.list.loading')}</p>
      </div>
    </div>
  )
}

