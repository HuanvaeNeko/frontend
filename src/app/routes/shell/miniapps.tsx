import { useCallback, useEffect, useState } from 'react'
import { EmptyContent } from '@/components/shell/EmptyContent'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { RouteDialog } from '@/components/shell/RouteDialog'
import { miniappsApi, type MiniAppSummary } from '@/features/miniapps/api/miniapps'
import { useI18n } from '@/i18n/I18nProvider'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'

export default function MiniappsRoute() {
  const { t } = useI18n()
  const [apps, setApps] = useState<MiniAppSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    setApps(null)
    miniappsApi.listMy().then(setApps).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])
  return (
    <>
      <EmptyContent hint="chat" />
      <RouteDialog title={t('shell.modals.miniapps')}>
        {error ? <ListError error={error} onRetry={load} /> : apps === null ? <ListLoading /> : apps.length === 0 ? <ListEmpty message={t('shell.modals.miniappsEmpty')} /> : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {apps.map((app) => (
              <li key={app.miniapp_id} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--bg-tertiary)] text-[13px] font-semibold text-muted-foreground">
                  {app.icon_url ? <img src={app.icon_url} alt="" className="h-full w-full object-cover" /> : app.display_name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-foreground">{app.display_name}</div>
                  <div className="truncate text-[12px] text-muted-foreground">{app.description}</div>
                </div>
                <button type="button" className="subtle-btn" onClick={() => window.open(toAbsoluteApiUrl(app.access_url) ?? app.access_url, '_blank', 'noopener')}>
                  {t('shell.modals.open')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </RouteDialog>
    </>
  )
}
