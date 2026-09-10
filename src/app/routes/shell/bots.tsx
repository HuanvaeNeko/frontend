import { useCallback, useEffect, useState } from 'react'
import { EmptyContent } from '@/components/shell/EmptyContent'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { RouteDialog } from '@/components/shell/RouteDialog'
import { botsApi, type BotSummary } from '@/features/bots/api/bots'
import { useI18n } from '@/i18n/I18nProvider'

export default function BotsRoute() {
  const { t } = useI18n()
  const [bots, setBots] = useState<BotSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    setBots(null)
    botsApi.listMyBots().then(setBots).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])
  return (
    <>
      <EmptyContent hint="chat" />
      <RouteDialog title={t('shell.modals.bots')}>
        {error ? <ListError error={error} onRetry={load} /> : bots === null ? <ListLoading /> : bots.length === 0 ? <ListEmpty message={t('shell.modals.botsEmpty')} /> : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {bots.map((b) => (
              <li key={b.bot_user_id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-foreground">{b.nickname}</div>
                  {/* @username 包一层 span：RTL 的 getByText 只看单个元素的直接子文本节点拼接结果，
                      不套 span 的话 "@" "username" " · description" 是三个同级文本节点，"@helper"
                      永远拼不成任何一个元素的整段文本，测试断言 screen.getByText('@helper') 找不到。 */}
                  <div className="truncate text-[12px] text-muted-foreground"><span>@{b.username}</span>{b.description ? ` · ${b.description}` : ''}</div>
                </div>
                <span className={b.is_active ? 'text-[12px] text-app-success' : 'text-[12px] text-muted-foreground'}>{b.is_active ? t('shell.modals.active') : t('shell.modals.inactive')}</span>
              </li>
            ))}
          </ul>
        )}
      </RouteDialog>
    </>
  )
}
