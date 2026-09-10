import { useEffect } from 'react'
import { usePathname } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'

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
 * SSR 读不到 sessionStorage，服务端一律按 chat 渲染；直接打开模态框 URL 且记忆是 contacts 时，水合后高亮会切一次。
 */
export function useShellTab(): ShellTab | 'settings' {
  const pathname = usePathname()
  const tab = shellTabOf(pathname, typeof window === 'undefined' ? 'chat' : recallShellTab())
  useEffect(() => {
    if (tab === 'chat' || tab === 'contacts') rememberShellTab(tab)
  }, [tab])
  return tab
}
