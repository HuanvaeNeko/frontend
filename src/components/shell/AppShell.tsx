import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  activeTab: 'chat' | 'contacts' | 'settings'
  list: ReactNode
  children: ReactNode
}

/** APP Main.tsx 的三栏：Sidebar 60 ｜ 列表 320 ｜ 内容 */
export function AppShell({ activeTab, list, children }: AppShellProps) {
  return (
    <div className="grid h-[100dvh] w-screen grid-cols-[60px_320px_1fr] overflow-hidden bg-[var(--gradient-bg-page)] text-foreground">
      <Sidebar activeTab={activeTab} />
      <section data-testid="list-column" className="glass-surface flex min-h-0 flex-col border-r border-[var(--glass-border)]">{list}</section>
      <main data-testid="content-column" className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
