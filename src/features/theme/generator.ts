import { DEFAULT_CUSTOM_COLORS, DEFAULT_GLASS_CONFIG, DEFAULT_OPACITY_LEVELS, OPACITY_LEVEL_KEYS, getPresetConfig } from './presets'
import type { ColorScale, CssVariables, CustomColors, GlassConfig, SemanticTokens, ThemeConfig, ThemeData, ThemeSnapshot } from './types'
import { generateColorScale, generateNeutralScale, generateShadows, hexToRgb, withAlpha } from './utils'

// ---- 语义 token(APP theme/generator.ts 的两个函数,字面量逐个相同) ----

function lightSemanticTokens(primary: ColorScale, accent: ColorScale, neutral: ColorScale, primaryColor: string): SemanticTokens {
  return {
    bg: { primary: '#ffffff', secondary: neutral[1], tertiary: neutral[2], surface: withAlpha('#ffffff', 0.8), surfaceHover: withAlpha('#ffffff', 0.9), muted: neutral[3], inverse: neutral[12] },
    text: { primary: '#1e3a5f', secondary: '#475569', muted: '#64748b', light: '#94a3b8', inverse: '#ffffff', link: primary[9] },
    border: { default: withAlpha(primary[5], 0.3), subtle: withAlpha(primary[5], 0.15), strong: withAlpha(primary[6], 0.5), focus: withAlpha(primary[7], 0.6) },
    primary: { default: primary[9], hover: primary[10], active: primary[11], subtle: withAlpha(primary[4], 0.2), text: primary[11] },
    accent: { default: accent[9], hover: accent[10], active: accent[11], subtle: withAlpha(accent[4], 0.2), text: accent[11] },
    status: {
      success: '#22c55e', successSubtle: withAlpha('#22c55e', 0.15), warning: '#f59e0b', warningSubtle: withAlpha('#f59e0b', 0.15),
      error: '#ef4444', errorSubtle: withAlpha('#ef4444', 0.15), info: '#3b82f6', infoSubtle: withAlpha('#3b82f6', 0.15),
    },
    shadow: generateShadows(primaryColor),
  }
}

function darkSemanticTokens(primary: ColorScale, accent: ColorScale, neutral: ColorScale, primaryColor: string): SemanticTokens {
  return {
    bg: { primary: neutral[1], secondary: neutral[2], tertiary: neutral[3], surface: withAlpha(neutral[2], 0.9), surfaceHover: withAlpha(neutral[3], 0.9), muted: neutral[4], inverse: neutral[12] },
    text: { primary: '#f8fafc', secondary: '#e2e8f0', muted: '#94a3b8', light: '#64748b', inverse: '#1e293b', link: primary[9] },
    border: { default: withAlpha(neutral[6], 0.4), subtle: withAlpha(neutral[5], 0.25), strong: withAlpha(neutral[7], 0.5), focus: withAlpha(primary[7], 0.6) },
    primary: { default: primary[9], hover: primary[8], active: primary[7], subtle: withAlpha(primary[9], 0.2), text: primary[9] },
    accent: { default: accent[9], hover: accent[8], active: accent[7], subtle: withAlpha(accent[9], 0.2), text: accent[9] },
    status: {
      success: '#4ade80', successSubtle: withAlpha('#4ade80', 0.2), warning: '#fbbf24', warningSubtle: withAlpha('#fbbf24', 0.2),
      error: '#f87171', errorSubtle: withAlpha('#f87171', 0.2), info: '#60a5fa', infoSubtle: withAlpha('#60a5fa', 0.2),
    },
    shadow: generateShadows(primaryColor),
  }
}

// ---- 配置解析 ----

/** default 预设忽略 customColors(spec §4.1) */
export function resolveColors(config: ThemeConfig): CustomColors {
  return config.preset === 'custom' ? config.customColors : getPresetConfig('default').colors
}

export function resolveGlass(config: ThemeConfig): GlassConfig {
  const glass = resolveColors(config).glass ?? DEFAULT_GLASS_CONFIG
  return { ...glass, opacityLevels: glass.opacityLevels ?? DEFAULT_OPACITY_LEVELS }
}

export function generateThemeData(input: ThemeConfig & { isDark: boolean }): ThemeData {
  const colors = resolveColors(input)
  const primaryColor = colors.primary
  const accentColor = colors.accent ?? colors.primary
  const primaryScale = generateColorScale(primaryColor, input.isDark)
  const accentScale = generateColorScale(accentColor, input.isDark)
  const neutralScale = generateNeutralScale(primaryColor, input.isDark)
  const semantic = input.isDark
    ? darkSemanticTokens(primaryScale, accentScale, neutralScale, primaryColor)
    : lightSemanticTokens(primaryScale, accentScale, neutralScale, primaryColor)
  return { primaryScale, accentScale, neutralScale, semantic }
}

// ---- CSS 变量输出(键名 = globals.css,恰好 115 个) ----

/** globals.css 里存在的 --glass-white-N 层级(没有 97/95/85/75) */
const GLASS_WHITE_LEVELS = [90, 80, 70, 60, 50, 45, 40, 35, 30, 25, 20, 15, 10] as const

export function toCssVariables(data: ThemeData, glass: GlassConfig, isDark: boolean): CssVariables {
  const vars: CssVariables = {}
  for (const [step, value] of Object.entries(data.primaryScale)) vars[`--color-primary-${step}`] = value
  for (const [step, value] of Object.entries(data.accentScale)) vars[`--color-accent-${step}`] = value
  for (const [step, value] of Object.entries(data.neutralScale)) vars[`--color-neutral-${step}`] = value

  const s = data.semantic
  vars['--primary'] = s.primary.default
  vars['--primary-hover'] = s.primary.hover
  vars['--primary-active'] = s.primary.active
  vars['--primary-subtle'] = s.primary.subtle
  vars['--primary-text'] = s.primary.text
  vars['--accent'] = s.accent.default
  vars['--accent-hover'] = s.accent.hover
  vars['--accent-active'] = s.accent.active
  vars['--accent-subtle'] = s.accent.subtle
  vars['--accent-text'] = s.accent.text
  vars['--bg-primary'] = s.bg.primary
  vars['--bg-secondary'] = s.bg.secondary
  vars['--bg-tertiary'] = s.bg.tertiary
  vars['--bg-surface'] = s.bg.surface
  vars['--bg-surface-hover'] = s.bg.surfaceHover
  vars['--bg-muted'] = s.bg.muted
  vars['--bg-inverse'] = s.bg.inverse
  vars['--text-primary'] = s.text.primary
  vars['--text-secondary'] = s.text.secondary
  vars['--text-muted'] = s.text.muted
  vars['--text-light'] = s.text.light
  vars['--text-inverse'] = s.text.inverse
  vars['--text-link'] = s.text.link
  vars['--border-default'] = s.border.default
  vars['--border-subtle'] = s.border.subtle
  vars['--border-strong'] = s.border.strong
  vars['--border-focus'] = s.border.focus
  vars['--status-success'] = s.status.success
  vars['--status-success-subtle'] = s.status.successSubtle
  vars['--status-warning'] = s.status.warning
  vars['--status-warning-subtle'] = s.status.warningSubtle
  vars['--status-error'] = s.status.error
  vars['--status-error-subtle'] = s.status.errorSubtle
  vars['--status-info'] = s.status.info
  vars['--status-info-subtle'] = s.status.infoSubtle
  vars['--shadow-sm'] = s.shadow.sm
  vars['--shadow-md'] = s.shadow.md
  vars['--shadow-lg'] = s.shadow.lg
  vars['--shadow-glow'] = s.shadow.glow
  vars['--shadow-focus'] = s.shadow.focus

  // 玻璃面:深色 + 默认白底 → 跟随中性色 3 级(.dark 的静态值就是 rgb(20, 23, 28))
  const followsMode = isDark && glass.baseColor.toLowerCase() === '#ffffff'
  const base = hexToRgb(followsMode ? data.neutralScale[3] : glass.baseColor)
  const levels = glass.opacityLevels ?? DEFAULT_OPACITY_LEVELS
  for (const key of OPACITY_LEVEL_KEYS) {
    const n = key.slice('level'.length)
    vars[`--white-alpha-${n}`] = `rgba(${base}, ${levels[key] / 100})`
  }
  for (const n of GLASS_WHITE_LEVELS) vars[`--glass-white-${n}`] = `rgba(${base}, ${levels[`level${n}`] / 100})`

  // 边框恒白(静态 CSS 如此);深色取 1/5
  const borderAlpha = isDark ? Math.round(glass.borderOpacity * 20) / 100 : glass.borderOpacity
  vars['--glass-border'] = `rgba(255, 255, 255, ${borderAlpha})`

  // 模糊 / 饱和:按 Web 静态值的比例(blur 16 → 6/10/12/16/24 与 backdrop 20)
  const b = glass.blur
  vars['--blur-xs'] = `blur(${Math.round(b * 0.375)}px)`
  vars['--blur-sm'] = `blur(${Math.round(b * 0.625)}px)`
  vars['--blur-md'] = `blur(${Math.round(b * 0.75)}px)`
  vars['--blur-lg'] = `blur(${b}px)`
  vars['--blur-xl'] = `blur(${Math.round(b * 1.5)}px)`
  vars['--glass-backdrop'] = `blur(${Math.round(b * 1.25)}px) saturate(${glass.saturation}%)`
  vars['--saturate-normal'] = `saturate(${Math.round((glass.saturation * 5) / 6)}%)`
  vars['--saturate-high'] = `saturate(${glass.saturation}%)`
  return vars
}

export function buildSnapshot(config: ThemeConfig): ThemeSnapshot {
  const glass = resolveGlass(config)
  return {
    light: toCssVariables(generateThemeData({ ...config, isDark: false }), glass, false),
    dark: toCssVariables(generateThemeData({ ...config, isDark: true }), glass, true),
  }
}

export { DEFAULT_CUSTOM_COLORS }
