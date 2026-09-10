import { Bot, FolderOpen, LayoutGrid, Sparkles, Video, type LucideIcon } from 'lucide-react'
import { ROUTES } from '@/lib/routes'

/** 侧栏「更多」面板的工具注册表——第 2/4/5/6 期加条目的唯一入口（spec §13） */
export type SidebarToolKey = 'meeting' | 'files' | 'bots' | 'miniapps' | 'ai'

export interface SidebarTool {
  key: SidebarToolKey
  /** i18n key：shell.nav.<key> */
  labelKey: string
  icon: LucideIcon
  to: string
}

export const SIDEBAR_TOOLS: ReadonlyArray<SidebarTool> = [
  { key: 'meeting', labelKey: 'shell.nav.meeting', icon: Video, to: ROUTES.app.meeting },
  { key: 'files', labelKey: 'shell.nav.files', icon: FolderOpen, to: ROUTES.app.files },
  { key: 'bots', labelKey: 'shell.nav.bots', icon: Bot, to: ROUTES.app.bots },
  { key: 'miniapps', labelKey: 'shell.nav.miniapps', icon: LayoutGrid, to: ROUTES.app.miniapps },
  { key: 'ai', labelKey: 'shell.nav.ai', icon: Sparkles, to: ROUTES.app.aiChat },
]

export const SIDEBAR_TOOLS_BY_KEY = Object.fromEntries(SIDEBAR_TOOLS.map((tool) => [tool.key, tool])) as Record<SidebarToolKey, SidebarTool>
