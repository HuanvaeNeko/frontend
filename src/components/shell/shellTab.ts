import { useEffect } from 'react'
import { usePathname } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { useHydrated } from '@/lib/useHydrated'

export type ShellTab = 'chat' | 'contacts'

const STORAGE_KEY = 'huanvae.shell-tab'

/** 列表栏显示哪个 tab：chat / contacts / settings 由路径决定；模态框路由与 AI 助手保持记住的 tab（spec §3） */
export function shellTabOf(pathname: string, remembered: ShellTab): ShellTab | 'settings' {
  if (pathname.startsWith(ROUTES.app.contacts)) return 'contacts'
  if (pathname.startsWith(ROUTES.app.settings)) return 'settings'
  if (pathname.startsWith(ROUTES.app.chat)) return 'chat'
  return remembered
}

export function rememberShellTab(tab: ShellTab): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, tab)
  } catch {
    // 隐私模式等拿不到 sessionStorage：记不住就算了，默认聊天
  }
}

export function recallShellTab(): ShellTab {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'contacts' ? 'contacts' : 'chat'
  } catch {
    return 'chat'
  }
}

/**
 * 壳布局用：按当前路径算 tab，并把 chat / contacts 记进 sessionStorage（账号级，登出随 purge 清掉）。
 * 服务端渲染与水合前的首次客户端渲染都一律按 chat 渲染（`useHydrated()` 门控 `recallShellTab()`）：
 * `typeof window === 'undefined'` 从水合那一帧起就已经是 false，若直接拿它当门控，sessionStorage
 * 记的是 contacts 时，服务端渲染 chat、客户端首帧却渲染 contacts——AppShell 按 tab 渲染结构不同的
 * 列表栏子树（ContactsList vs ChatListColumn），是真正的 hydration mismatch，不只是高亮切换。
 * 水合完成后的下一次渲染才切到记住的 tab。
 */
export function useShellTab(): ShellTab | 'settings' {
  const pathname = usePathname()
  const hydrated = useHydrated()
  const tab = shellTabOf(pathname, hydrated ? recallShellTab() : 'chat')
  useEffect(() => {
    if (tab === 'chat' || tab === 'contacts') rememberShellTab(tab)
  }, [tab])
  return tab
}
