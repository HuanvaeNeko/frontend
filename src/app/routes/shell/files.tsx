import { useState } from 'react'
import { EmptyContent } from '@/components/shell/EmptyContent'
import { RouteDialog } from '@/components/shell/RouteDialog'
import { useI18n } from '@/i18n/I18nProvider'
import { dynamic } from '@/lib/dynamic'
import { cn } from '@/lib/utils'

// `FileManager` 静态引入 `@/components/ui/file-preview`，它在模块顶层 `import { ... }
// from 'react-pdf'`，pdf.js 的 `canvas.js` 在求值时无条件引用浏览器专属的 `DOMMatrix`——
// Node 下不存在。这个路由模块一旦注册进路由表就会被 React Router 的 server 模块图静态
// 引到，不加固的话任何请求都会 500（已用 curl http://127.0.0.1:3012/app/chat 实测复现，
// 不只是 /app/files 本身炸，是整个 dev server 都进不去）。做法与
// `src/app/routes/shell/chat.$conversationId.tsx` 对 `ChatWindow` 的加固完全一样：
// 换成仓库既有的 `dynamic()` 适配层（`ssr:false`），只在客户端水合后挂载。
const FileManager = dynamic<{ subTab: 'main' | 'upload' }>(() => import('@/features/chat/components/FileManager'))

export default function FilesRoute() {
  const { t } = useI18n()
  const [tab, setTab] = useState<'main' | 'upload'>('main')
  return (
    <>
      <EmptyContent hint="chat" />
      <RouteDialog title={t('shell.modals.files')} className="max-w-4xl">
        <div className="mb-3 flex gap-1 rounded-[10px] bg-[var(--bg-tertiary)] p-1">
          {(['main', 'upload'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={cn('flex-1 rounded-sm py-1.5 text-[13px]', tab === k ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-muted-foreground')}>
              {k === 'main' ? t('shell.modals.files') : t('shell.modals.upload')}
            </button>
          ))}
        </div>
        <FileManager subTab={tab} />
      </RouteDialog>
    </>
  )
}
