import { AppWindow, Bell, Info, Palette, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { SettingsSection } from '@/lib/routes'
import { AboutSection } from './AboutSection'
import { AccountSection } from './AccountSection'
import { AiSection } from './AiSection'
import { AppearanceSection } from './AppearanceSection'
import { AppsSection } from './AppsSection'
import { NotificationsSection } from './NotificationsSection'

/** 分区注册表：与 SETTINGS_SECTIONS 同序；第 2 期（主题编辑器 / 黑名单 / OAuth）在这里加条目 */
export const SETTINGS_SECTION_META: ReadonlyArray<{ key: SettingsSection; labelKey: string; icon: LucideIcon }> = [
  { key: 'appearance', labelKey: 'shell.settings.appearance', icon: Palette },
  { key: 'notifications', labelKey: 'shell.settings.notifications', icon: Bell },
  { key: 'account', labelKey: 'shell.settings.account', icon: ShieldCheck },
  { key: 'apps', labelKey: 'shell.settings.apps', icon: AppWindow },
  { key: 'ai', labelKey: 'shell.settings.ai', icon: Sparkles },
  { key: 'about', labelKey: 'shell.settings.about', icon: Info },
]

export const SECTION_COMPONENTS: Record<SettingsSection, ComponentType> = {
  appearance: AppearanceSection,
  notifications: NotificationsSection,
  account: AccountSection,
  apps: AppsSection,
  ai: AiSection,
  about: AboutSection,
}
