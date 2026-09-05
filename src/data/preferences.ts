import { useSettingsStore } from '@/features/settings/store/settingsStore'

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: ReturnType<typeof useSettingsStore.getState>['language']
}

/**
 * 用户偏好的数据访问入口。
 *
 * 阶段 1：读本地 zustand store（背后是 localStorage 持久化）。
 * 阶段 2：改为服务端 loader 读 Postgres，实现跨设备同步。
 */
export function getPreferences(): UserPreferences {
  const { theme, language } = useSettingsStore.getState()
  return { theme, language }
}
