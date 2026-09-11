import { Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/i18n/I18nProvider'
import { type CreateClientRequest, type CreateClientResponse, OAUTH_SCOPES, type OAuthClient, oauthApi, scopeLabelKey } from '../api/oauth'
import { isValidRedirectUri } from '../lib/redirectUri'
import { copyText, SecretDisplay } from './SecretDisplay'

const NS = 'shell.oauth.clients'

/** 回调地址输入行：用 id（而非数组下标）做 key——biome 的 `noArrayIndexKey` 不允许下标 key，且下标在增删行时不稳定。 */
interface UriRow { id: string; value: string }
const emptyRow = (): UriRow => ({ id: crypto.randomUUID(), value: '' })

function CreateClientDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (res: CreateClientResponse) => void }) {
  const { t } = useI18n()
  const [appName, setAppName] = useState('')
  const [description, setDescription] = useState('')
  const [homepage, setHomepage] = useState('')
  const [uris, setUris] = useState<UriRow[]>(() => [emptyRow()])
  const [scopes, setScopes] = useState<string[]>(['profile'])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filled = uris.map((row) => row.value.trim()).filter((v) => v !== '')
  const invalid = filled.some((v) => !isValidRedirectUri(v))
  const canSubmit = appName.trim() !== '' && filled.length > 0 && !invalid && !submitting
  const submit = async () => {
    const req: CreateClientRequest = { app_name: appName.trim(), redirect_uris: filled }
    if (description.trim()) req.app_description = description.trim()
    if (homepage.trim()) req.app_homepage_url = homepage.trim()
    if (scopes.length > 0) req.scopes = OAUTH_SCOPES.filter((s) => scopes.includes(s))
    setSubmitting(true)
    setError(null)
    try {
      onCreated(await oauthApi.createClient(req))
      setAppName(''); setDescription(''); setHomepage(''); setUris([emptyRow()]); setScopes(['profile'])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose() }}>
      <DialogContent className="glass-card max-h-[85vh] overflow-y-auto rounded-3xl border-[var(--glass-border)]">
        <DialogHeader><DialogTitle>{t(`${NS}.formTitle`)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label htmlFor="oauth-client-app-name" className="block text-[13px]"><span className="mb-1 block text-muted-foreground">{t(`${NS}.appName`)}</span><Input id="oauth-client-app-name" aria-label={t(`${NS}.appName`)} value={appName} maxLength={100} placeholder={t(`${NS}.appNamePlaceholder`)} onChange={(e) => setAppName(e.target.value)} /></label>
          <label htmlFor="oauth-client-app-description" className="block text-[13px]"><span className="mb-1 block text-muted-foreground">{t(`${NS}.appDescription`)}</span><Input id="oauth-client-app-description" aria-label={t(`${NS}.appDescription`)} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label htmlFor="oauth-client-app-homepage" className="block text-[13px]"><span className="mb-1 block text-muted-foreground">{t(`${NS}.appHomepage`)}</span><Input id="oauth-client-app-homepage" aria-label={t(`${NS}.appHomepage`)} value={homepage} placeholder="https://example.com" onChange={(e) => setHomepage(e.target.value)} /></label>
          <div className="text-[13px]">
            <span className="mb-1 block text-muted-foreground">{t(`${NS}.redirectUris`)}</span>
            {uris.map((row, i) => (
              <div key={row.id} className="mb-1 flex gap-1">
                <Input aria-label={t(`${NS}.redirectUri`)} value={row.value} placeholder="https://example.com/callback" onChange={(e) => setUris(uris.map((u, j) => (j === i ? { ...u, value: e.target.value } : u)))} />
                {uris.length > 1 && <Button variant="outline" size="sm" aria-label={t(`${NS}.removeRedirectUri`)} onClick={() => setUris(uris.filter((_, j) => j !== i))}>×</Button>}
              </div>
            ))}
            {invalid && <p className="text-[12px] text-destructive">{t(`${NS}.redirectUriInvalid`)}</p>}
            <Button variant="outline" size="sm" onClick={() => setUris([...uris, emptyRow()])}>{t(`${NS}.addRedirectUri`)}</Button>
          </div>
          <div className="text-[13px]">
            <span className="mb-1 block text-muted-foreground">{t(`${NS}.scopesLabel`)}</span>
            <div className="flex flex-wrap gap-3">
              {OAUTH_SCOPES.map((s) => (
                <label key={s} htmlFor={`oauth-client-scope-${s}`} className="flex items-center gap-1"><Checkbox id={`oauth-client-scope-${s}`} aria-label={t(scopeLabelKey(s))} checked={scopes.includes(s)} onCheckedChange={(v) => setScopes(v ? [...scopes, s] : scopes.filter((x) => x !== s))} />{t(scopeLabelKey(s))}</label>
              ))}
            </div>
          </div>
          {error && <p className="text-[13px] text-destructive" role="alert">{t(`${NS}.createFailed`)}: {error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t(`${NS}.cancel`)}</Button>
          <Button onClick={submit} disabled={!canSubmit}>{submitting ? t(`${NS}.submitting`) : t(`${NS}.submit`)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ClientCard({ client, onDelete, onResetSecret, busy }: { client: OAuthClient; onDelete: () => Promise<void>; onResetSecret: () => Promise<void>; busy: boolean }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const external = client.client_type === 'external'
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <span className="truncate text-[14px] font-semibold text-foreground">{client.app_name}</span>
        <span className="rounded-sm bg-[var(--primary-subtle)] px-1.5 text-[11px] text-[var(--primary-text)]">{external ? t(`${NS}.typeExternal`) : t(`${NS}.typeInternal`)}</span>
        {!client.is_active && <span className="rounded-sm bg-[var(--status-error-subtle)] px-1.5 text-[11px] text-destructive">{t(`${NS}.inactive`)}</span>}
      </div>
      {client.app_description && <p className="text-[12px] text-muted-foreground">{client.app_description}</p>}
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">{t(`${NS}.clientId`)}</span>
        <code className="rounded-sm bg-[var(--bg-tertiary)] px-1.5 font-mono text-foreground">{client.client_id}</code>
        <button type="button" className="subtle-btn" onClick={() => void copyText(client.client_id, toast, t)}>{t(`${NS}.copy`)}</button>
      </div>
      <div className="text-[12px] text-muted-foreground">{t(`${NS}.scopes`)}: {client.allowed_scopes.map((s) => t(scopeLabelKey(s))).join('、')}</div>
      <div className="break-all text-[12px] text-muted-foreground">{t(`${NS}.redirectUris`)}: {client.redirect_uris.join('，')}</div>
      {external && (
        <div className="flex flex-wrap gap-1">
          {confirmReset ? (
            <>
              <button type="button" className="subtle-btn" disabled={busy} onClick={() => { setConfirmReset(false); void onResetSecret() }}>{t('shell.oauth.confirm')}</button>
              <button type="button" className="subtle-btn" disabled={busy} onClick={() => setConfirmReset(false)}>{t(`${NS}.cancel`)}</button>
            </>
          ) : (
            <button type="button" className="subtle-btn" disabled={busy} onClick={() => setConfirmReset(true)}>{t(`${NS}.resetSecret`)}</button>
          )}
          {confirmDelete ? (
            <>
              <button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" disabled={busy} onClick={() => { setConfirmDelete(false); void onDelete() }}>{t(`${NS}.confirmDelete`)}</button>
              <button type="button" className="subtle-btn" disabled={busy} onClick={() => setConfirmDelete(false)}>{t(`${NS}.cancel`)}</button>
            </>
          ) : (
            <button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>{t(`${NS}.del`)}</button>
          )}
        </div>
      )}
    </li>
  )
}

/** 小程序模态框第二个 tab（spec §6.3）。列表是组件内存态；create / reset 的密钥进 SecretDisplay，只显示一次。 */
export function OAuthClientsPanel() {
  const { t } = useI18n()
  const [clients, setClients] = useState<OAuthClient[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ title: string; fields: Array<{ label: string; value: string }> } | null>(null)
  const load = useCallback(() => {
    setError(null)
    setClients(null)
    oauthApi.listClients().then(setClients).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])
  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id)
    setOpError(null)
    try { await fn() } catch (e: unknown) { setOpError(e instanceof Error ? e.message : String(e)) } finally { setBusyId(null) }
  }
  const showSecret = (name: string, clientId: string, clientSecret: string) =>
    setSecret({ title: t(`${NS}.secretTitle`, { name }), fields: [{ label: t(`${NS}.clientId`), value: clientId }, { label: t(`${NS}.clientSecret`), value: clientSecret }] })
  return (
    <div>
      <div className="flex justify-end gap-2 py-2">
        <Button variant="outline" size="sm" onClick={load} disabled={clients === null && !error}><RefreshCw className="mr-1 h-4 w-4" />{t(`${NS}.refresh`)}</Button>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />{t(`${NS}.create`)}</Button>
      </div>
      {error ? <ListError error={error} onRetry={load} /> : clients === null ? <ListLoading /> : clients.length === 0 ? (
        <div><ListEmpty message={t(`${NS}.empty`)} /><p className="text-center text-[12px] text-app-light">{t(`${NS}.emptyHint`)}</p></div>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {clients.map((c) => (
            <ClientCard key={c.client_id} client={c} busy={busyId === c.client_id}
              onDelete={() => withBusy(c.client_id, async () => { await oauthApi.deleteClient(c.client_id); setClients((prev) => prev?.filter((x) => x.client_id !== c.client_id) ?? prev) })}
              onResetSecret={() => withBusy(c.client_id, async () => { const { client_secret } = await oauthApi.resetClientSecret(c.client_id); showSecret(c.app_name, c.client_id, client_secret) })} />
          ))}
        </ul>
      )}
      {opError && <p className="py-2 text-[13px] text-destructive" role="alert">{t(`${NS}.opFailed`)}: {opError}</p>}
      <CreateClientDialog open={creating} onClose={() => setCreating(false)} onCreated={(res) => { setCreating(false); showSecret(res.app_name, res.client_id, res.client_secret); load() }} />
      <SecretDisplay open={secret !== null} title={secret?.title ?? ''} fields={secret?.fields ?? []} onClose={() => setSecret(null)} />
    </div>
  )
}
