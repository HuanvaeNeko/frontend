import { ROUTES } from '@/lib/routes'
import type { ShellTab } from './shellTab'

/** 折叠时内容区是否该显示：URL 里有选中项（会话 / 联系人 / 设置分区）或整栏工具页 */
export function isDetailPath(pathname: string): boolean {
  if (pathname.startsWith(`${ROUTES.app.chat}/`)) return true
  if (pathname.startsWith(`${ROUTES.app.contacts}/`)) return true
  if (pathname.startsWith(`${ROUTES.app.settings}/`)) return true
  return pathname === ROUTES.app.aiChat
}

/** 折叠时「返回列表」的目标 */
export function backTargetOf(pathname: string, rememberedTab: ShellTab): string {
  if (pathname.startsWith(ROUTES.app.contacts)) return ROUTES.app.contacts
  if (pathname.startsWith(ROUTES.app.settings)) return ROUTES.app.settings
  if (pathname.startsWith(ROUTES.app.chat)) return ROUTES.app.chat
  return rememberedTab === 'contacts' ? ROUTES.app.contacts : ROUTES.app.chat
}
