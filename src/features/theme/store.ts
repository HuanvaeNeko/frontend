import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sessionScopedLocalStorage } from '@/lib/sessionScope'
import { buildSnapshot } from './generator'
import { DEFAULT_CUSTOM_COLORS, DEFAULT_GLASS_CONFIG, DEFAULT_OPACITY_LEVELS } from './presets'
import type { GlassConfig, OpacityLevels, ThemeConfig, ThemePreset, ThemeSnapshot } from './types'

/** 与 APP 的 `huanvae-theme` 同义；设备级键，登记在 sessionScope.ts 的 DEVICE_SCOPED_KEYS */
export const THEME_STORAGE_KEY = 'huanvae.theme'

export const DEFAULT_THEME_CONFIG: ThemeConfig = { preset: 'default', customColors: DEFAULT_CUSTOM_COLORS }

export function isThemeConfig(value: unknown): value is ThemeConfig {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.preset !== 'default' && v.preset !== 'custom') return false
  const colors = v.customColors
  return !!colors && typeof colors === 'object' && typeof (colors as Record<string, unknown>).primary === 'string'
}

interface ThemeState {
  config: ThemeConfig
  /** preset === 'custom' 时才有；default 时 null，防闪脚本与 ThemeProvider 都据此决定写不写 */
  snapshot: ThemeSnapshot | null
  setPreset: (preset: ThemePreset) => void
  setPrimaryColor: (hex: string) => void
  setAccentColor: (hex: string) => void
  setGlassConfig: (glass: Partial<GlassConfig>) => void
  setOpacityLevel: (key: keyof OpacityLevels, value: number) => void
  reset: () => void
  /** 跨标签页 storage 事件用：整份替换并重算快照 */
  setConfig: (config: ThemeConfig) => void
}

const withSnapshot = (config: ThemeConfig): Pick<ThemeState, 'config' | 'snapshot'> => ({
  config,
  snapshot: config.preset === 'custom' ? buildSnapshot(config) : null,
})

const currentGlass = (config: ThemeConfig): GlassConfig => config.customColors.glass ?? DEFAULT_GLASS_CONFIG

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      ...withSnapshot(DEFAULT_THEME_CONFIG),

      setPreset: (preset) => set(withSnapshot({ ...get().config, preset })),

      setPrimaryColor: (hex) => {
        const config = get().config
        set(withSnapshot({ preset: 'custom', customColors: { ...config.customColors, primary: hex } }))
      },

      setAccentColor: (hex) => {
        const config = get().config
        set(withSnapshot({ preset: 'custom', customColors: { ...config.customColors, accent: hex } }))
      },

      setGlassConfig: (glass) => {
        const config = get().config
        set(withSnapshot({ preset: 'custom', customColors: { ...config.customColors, glass: { ...currentGlass(config), ...glass } } }))
      },

      setOpacityLevel: (key, value) => {
        const config = get().config
        const glass = currentGlass(config)
        const levels = { ...(glass.opacityLevels ?? DEFAULT_OPACITY_LEVELS), [key]: Math.max(0, Math.min(100, value)) }
        set(withSnapshot({ preset: 'custom', customColors: { ...config.customColors, glass: { ...glass, opacityLevels: levels } } }))
      },

      reset: () => set(withSnapshot(DEFAULT_THEME_CONFIG)),

      setConfig: (config) => set(withSnapshot(config)),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => sessionScopedLocalStorage),
      partialize: (state) => ({ config: state.config, snapshot: state.snapshot }),
      // 恢复时只信 config，快照用本地生成器重算：生成器改版后旧快照自动失效
      merge: (persisted, current) => {
        const raw = persisted as Partial<Pick<ThemeState, 'config'>> | undefined
        const config = raw && isThemeConfig(raw.config) ? raw.config : DEFAULT_THEME_CONFIG
        return { ...current, ...withSnapshot(config) }
      },
    },
  ),
)
