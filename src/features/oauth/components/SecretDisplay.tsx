import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/i18n/I18nProvider'

export async function copyText(text: string, toast: ReturnType<typeof useToast>['toast'], t: (key: string) => string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast({ title: t('shell.oauth.clients.copied') })
  } catch {
    toast({ title: t('shell.oauth.clients.copyFailed'), variant: 'destructive' })
  }
}

/**
 * 只显示一次的凭据（spec §6.3）：遮罩点击与 Esc 都不关，只有「我已保存」关——
 * client_secret 关掉就再也拿不到了，误触不能成为丢失它的理由。
 */
export function SecretDisplay({ open, title, fields, onClose }: { open: boolean; title: string; fields: Array<{ label: string; value: string }>; onClose: () => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  return (
    <Dialog open={open} onOpenChange={() => { /* 只认「我已保存」 */ }}>
      <DialogContent className="glass-card rounded-3xl border-[var(--glass-border)]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-app-warning">{t('shell.oauth.clients.secretWarning')}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3">
          {fields.map((f) => (
            <div key={f.label}>
              <dt className="text-[12px] text-muted-foreground">{f.label}</dt>
              <dd className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-sm bg-[var(--bg-tertiary)] px-2 py-1 font-mono text-[12px] text-foreground">{f.value}</code>
                <button type="button" className="subtle-btn" aria-label={`${t('shell.oauth.clients.copy')} ${f.label}`} onClick={() => void copyText(f.value, toast, t)}><Copy className="h-4 w-4" />{t('shell.oauth.clients.copy')}</button>
              </dd>
            </div>
          ))}
        </dl>
        <DialogFooter><Button onClick={onClose}>{t('shell.oauth.clients.saved')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
