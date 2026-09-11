import type { CustomColors, GlassConfig, OpacityLevels, ThemePreset } from './types'

export const DEFAULT_OPACITY_LEVELS: OpacityLevels = {
  level97: 97, level95: 95, level90: 90, level85: 85, level80: 80, level75: 75,
  level70: 70, level60: 60, level50: 50, level45: 45, level40: 40, level35: 35,
  level30: 30, level25: 25, level20: 20, level15: 15, level10: 10,
}

/** 有序:编辑器与生成器都按这个顺序遍历 */
export const OPACITY_LEVEL_KEYS = [
  'level97', 'level95', 'level90', 'level85', 'level80', 'level75', 'level70', 'level60', 'level50',
  'level45', 'level40', 'level35', 'level30', 'level25', 'level20', 'level15', 'level10',
] as const satisfies ReadonlyArray<keyof OpacityLevels>

/** 高级透明度的 6 组(组名 i18n key 后缀与 APP 组名一致:弹窗层 / 主背景层 / 卡片层 / 面板层 / 辅助层 / 遮罩层) */
export const OPACITY_GROUPS: ReadonlyArray<{ key: string; levels: ReadonlyArray<keyof OpacityLevels> }> = [
  { key: 'dialog', levels: ['level97', 'level95'] },
  { key: 'background', levels: ['level90', 'level85'] },
  { key: 'card', levels: ['level80', 'level75'] },
  { key: 'panel', levels: ['level70', 'level60'] },
  { key: 'auxiliary', levels: ['level50', 'level45', 'level40', 'level35'] },
  { key: 'overlay', levels: ['level30', 'level25', 'level20', 'level15', 'level10'] },
]

/** Web 默认:borderOpacity 0.6(APP 0.3)——理由见 spec §4.1 与本任务标题下的差异说明 */
export const DEFAULT_GLASS_CONFIG: GlassConfig = {
  baseColor: '#ffffff',
  opacity: 0.8,
  blur: 16,
  saturation: 180,
  borderOpacity: 0.6,
  opacityLevels: DEFAULT_OPACITY_LEVELS,
}

export const DEFAULT_CUSTOM_COLORS: CustomColors = {
  primary: '#3b82f6',
  accent: '#8b5cf6',
  glass: DEFAULT_GLASS_CONFIG,
}

export const GLASS_RANGES = {
  blur: { min: 4, max: 40, step: 1 },
  saturation: { min: 100, max: 250, step: 5 },
  borderOpacity: { min: 0.1, max: 0.8, step: 0.05 },
} as const

export interface PresetConfig {
  /** i18n key 后缀:shell.settings.theme.preset.<nameKey> */
  nameKey: string
  colors: CustomColors
  previewColors: readonly [string, string, string]
}

export const THEME_PRESETS: Record<ThemePreset, PresetConfig> = {
  default: { nameKey: 'default', colors: DEFAULT_CUSTOM_COLORS, previewColors: ['#3b82f6', '#60a5fa', '#93c5fd'] },
  custom: { nameKey: 'custom', colors: DEFAULT_CUSTOM_COLORS, previewColors: ['#3b82f6', '#60a5fa', '#93c5fd'] },
}

export function getPresetConfig(preset: ThemePreset): PresetConfig {
  return THEME_PRESETS[preset]
}
