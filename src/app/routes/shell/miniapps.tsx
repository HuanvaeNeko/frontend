import { useCallback, useEffect, useState } from 'react'
import { EmptyContent } from '@/components/shell/EmptyContent'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { RouteDialog } from '@/components/shell/RouteDialog'
import { miniappsApi, resolveSameOriginUrl, type MiniAppSummary } from '@/features/miniapps/api/miniapps'
import { OAuthClientsPanel } from '@/features/oauth/components/OAuthClientsPanel'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'

function MiniAppList() {
  const { t } = useI18n()
  const [apps, setApps] = useState<MiniAppSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    setApps(null)
    miniappsApi.listMy().then(setApps).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])
  return error ? <ListError error={error} onRetry={load} /> : apps === null ? <ListLoading /> : apps.length === 0 ? <ListEmpty message={t('shell.modals.miniappsEmpty')} /> : (
    <ul className="divide-y divide-[var(--border-subtle)]">
      {apps.map((app) => {
        // access_url 未经校验时可以是任意 scheme/站外地址（后端数据驱动的
        // window.open 目标）：只有同源 http(s) 才渲染「打开」按钮（终审 finding #6）。
        const href = resolveSameOriginUrl(app.access_url)
        return (
          <li key={app.miniapp_id} className="flex items-center gap-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--bg-tertiary)] text-[13px] font-semibold text-muted-foreground">
              {app.icon_url ? <img src={app.icon_url} alt="" className="h-full w-full object-cover" /> : app.display_name[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-foreground">{app.display_name}</div>
              <div className="truncate text-[12px] text-muted-foreground">{app.description}</div>
            </div>
            {href && (
              <button type="button" className="subtle-btn" onClick={() => window.open(href, '_blank', 'noopener')}>
                {t('shell.modals.open')}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const TABS = ['miniapps', 'oauth'] as const
type Tab = (typeof TABS)[number]

export default function MiniappsRoute() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('miniapps')
  return (
    <>
      <EmptyContent hint="chat" />
      <RouteDialog title={t('shell.modals.miniapps')}>
        <div role="tablist" aria-label={t('shell.modals.miniapps')} className="mb-3 flex gap-1 rounded-md bg-[var(--bg-tertiary)] p-1">
          {TABS.map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={cn('flex-1 rounded-sm px-3 py-1.5 text-[13px]', tab === key ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-muted-foreground')}>
              {key === 'miniapps' ? t('shell.modals.miniappsTab') : t('shell.modals.oauthClientsTab')}
            </button>
          ))}
        </div>
        {tab === 'miniapps' ? <MiniAppList /> : <OAuthClientsPanel />}
      </RouteDialog>
    </>
  )
}
