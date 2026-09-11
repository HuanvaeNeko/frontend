import { useCallback, useEffect, useState } from 'react'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { type OAuthGrant, oauthApi, scopeLabelKey } from '@/features/oauth/api/oauth'
import { useI18n } from '@/i18n/I18nProvider'
import { SettingsSection } from './SettingsSection'

/** 「x 天前授权」：<1h 刚刚，<24h 小时，其余天 */
export function grantedAgoKey(createdAt: string, now = Date.now()): { key: string; n: number } {
  const diff = Math.max(0, now - new Date(createdAt).getTime())
  if (diff < 3_600_000) return { key: 'shell.oauth.grantedJustNow', n: 0 }
  if (diff < 86_400_000) return { key: 'shell.oauth.grantedHoursAgo', n: Math.floor(diff / 3_600_000) }
  return { key: 'shell.oauth.grantedDaysAgo', n: Math.floor(diff / 86_400_000) }
}

function GrantCard({ grant, onRevoke, revoking }: { grant: OAuthGrant; onRevoke: () => Promise<void>; revoking: boolean }) {
  const { t } = useI18n()
  const [confirm, setConfirm] = useState(false)
  const ago = grantedAgoKey(grant.created_at)
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[var(--bg-tertiary)] text-[14px] font-semibold text-muted-foreground">
        {grant.app_logo_url ? <img src={grant.app_logo_url} alt="" className="h-full w-full object-cover" /> : grant.app_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-foreground">{grant.app_name}</div>
        <div className="truncate text-[12px] text-muted-foreground">{grant.scope.split(/\s+/).filter(Boolean).map((s) => t(scopeLabelKey(s))).join(t('shell.oauth.listSeparator'))}</div>
        <div className="text-[11px] text-app-light">{t(ago.key, { n: ago.n })}</div>
      </div>
      {confirm ? (
        <span className="flex gap-1">
          <button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" disabled={revoking} onClick={() => { setConfirm(false); void onRevoke() }}>{t('shell.oauth.confirm')}</button>
          <button type="button" className="subtle-btn" disabled={revoking} onClick={() => setConfirm(false)}>{t('shell.oauth.cancel')}</button>
        </span>
      ) : (
        <button type="button" className="subtle-btn" disabled={revoking} onClick={() => setConfirm(true)}>{t('shell.oauth.revoke')}</button>
      )}
    </li>
  )
}

/** /app/settings/apps：已授权的第三方应用（spec §6.2）。组件内存态，按需拉取（spec §9）。 */
export function AppsSection() {
  const { t } = useI18n()
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    setGrants(null)
    oauthApi.listGrants().then(setGrants).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])
  const revoke = async (id: string) => {
    setRevoking(id)
    setRevokeError(null)
    try {
      await oauthApi.revokeGrant(id)
      setGrants((prev) => prev?.filter((g) => g.id !== id) ?? prev)
    } catch (e: unknown) {
      setRevokeError(e instanceof Error ? e.message : String(e))
    } finally {
      setRevoking(null)
    }
  }
  return (
    <SettingsSection title={t('shell.oauth.grantsTitle')} description={t('shell.oauth.grantsHint')}>
      {error ? <ListError error={error} onRetry={load} /> : grants === null ? <ListLoading /> : grants.length === 0 ? <ListEmpty message={t('shell.oauth.grantsEmpty')} /> : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {grants.map((g) => <GrantCard key={g.id} grant={g} revoking={revoking === g.id} onRevoke={() => revoke(g.id)} />)}
        </ul>
      )}
      {revokeError && <p className="px-3 pb-3 text-[13px] text-destructive" role="alert">{t('shell.oauth.revokeFailed')}: {revokeError}</p>}
    </SettingsSection>
  )
}
