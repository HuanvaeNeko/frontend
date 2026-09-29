import { useCallback, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRouter } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * 带 URL 的模态框共用的关闭规则(RouteDialog 与 /app/profile 都用)：有站内来路则
 * router.back()，直接打开（新标签 / 书签 / 地址栏）则 router.replace(ROUTES.app.chat)。
 *
 * 「有没有来路」看 RR 写在 `history.state` 里的 `idx`（本标签页里 app 的第几条记录，
 * 首条为 0）。不能只看 `location.key === 'default'`：`<ScrollRestoration>` 的内联脚本会在
 * 水合前给首条记录补一个随机 key，浏览器里它永远不是 'default'——原实现因此一律 back()，
 * 直接打开的弹窗一关就退出应用（about:blank / 上一个网站）。没有 idx 的环境（memory
 * router）才退回按 key 判断。
 */
function isFirstAppEntry(locationKey: string): boolean {
  const state = typeof window !== 'undefined' ? (window.history.state as { idx?: unknown } | null) : null
  if (typeof state?.idx === 'number') return state.idx === 0
  return locationKey === 'default'
}

export function useRouteDialogClose(): () => void {
  const router = useRouter()
  const location = useLocation()
  return useCallback(() => {
    if (isFirstAppEntry(location.key)) router.replace(ROUTES.app.chat)
    else router.back()
  }, [router, location.key])
}

/**
 * 带 URL 的模态框（spec §3/§9）：路由挂着它就打开；关闭规则见 useRouteDialogClose。
 *
 * 宽度要传 `sm:max-w-*`：DialogContent 自带 `sm:max-w-lg`，只传 `max-w-3xl` 在 ≥640px 时
 * 会被它压住（带断点的类优先），弹窗实际只有 512px——会议、文件弹窗曾因此挤爆。
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
