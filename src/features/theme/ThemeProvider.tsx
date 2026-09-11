import { useEffect } from 'react'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { applyThemeVariables, clearThemeVariables } from './applyTheme'
import { THEME_STORAGE_KEY, isThemeConfig, useThemeStore } from './store'

/**
 * 把 themeStore 的快照写成 :root 的内联变量（spec §4.3）。
 * - default 预设：清掉本模块写过的键，页面回到 globals.css 的静态值（首屏零内联变量）；
 * - custom：按 settingsStore.theme（+ 系统偏好）挑 light / dark 那份逐键 setProperty；
 * - 明暗切换必须重写另一份快照，否则深色下留着浅色变量（spec §12）；
 * - 跨标签页：storage 事件 key === 'huanvae.theme' → setConfig（本地重算快照）。
 * 只做赋值不做计算；计算都在 store 里发生过了。
 */
export function ThemeProvider() {
  const preset = useThemeStore((s) => s.config.preset)
  const snapshot = useThemeStore((s) => s.snapshot)
  const themeMode = useSettingsStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const isDark = themeMode === 'dark' || (themeMode === 'auto' && media.matches)
      if (preset === 'custom' && snapshot) applyThemeVariables(root, isDark ? snapshot.dark : snapshot.light)
      else clearThemeVariables(root)
    }
    apply()
    if (themeMode !== 'auto') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preset, snapshot, themeMode])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !event.newValue) return
      try {
        const parsed = JSON.parse(event.newValue) as { state?: { config?: unknown } }
        if (isThemeConfig(parsed.state?.config)) useThemeStore.getState().setConfig(parsed.state.config)
      } catch {
        // 另一个标签页写了读不懂的东西：不动本页
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return null
}
