import { useCallback, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRouter } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * 带 URL 的模态框共用的关闭规则(RouteDialog 与 /app/profile 都用)：有来路
 * （useLocation().key !== 'default'）则 router.back()，直接打开（没有站内来路）
 * 则 router.replace(ROUTES.app.chat)。RR 给直接打开的第一个 location 的 key
 * 是 'default'，站内导航过来的不是——用它区分来路。
 */
export function useRouteDialogClose(): () => void {
  const router = useRouter()
  const location = useLocation()
  return useCallback(() => {
    if (location.key === 'default') router.replace(ROUTES.app.chat)
    else router.back()
  }, [router, location.key])
}

/**
 * 带 URL 的模态框（spec §3/§9）：路由挂着它就打开；关闭规则见 useRouteDialogClose。
 */
export function RouteDialog({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const close = useRouteDialogClose()
  return (
    <Dialog open onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent className={cn('glass-card max-h-[85vh] overflow-hidden rounded-3xl border-[var(--glass-border)] p-0', className)}>
        <DialogHeader className="border-b border-[var(--border-subtle)] px-6 pt-5 pb-3"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="app-scrollbar max-h-[calc(85vh-64px)] overflow-y-auto px-6 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
