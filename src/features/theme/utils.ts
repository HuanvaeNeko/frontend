import { formatHex, oklch, parse } from 'culori'
import type { ColorScale } from './types'

/** 浅色模式 12 级亮度(APP theme/utils.ts LIGHT_MODE_LIGHTNESS,逐值相同) */
const LIGHT_MODE_LIGHTNESS = [0.985, 0.965, 0.925, 0.885, 0.825, 0.745, 0.645, 0.565, 0.485, 0.425, 0.365, 0.255]
/** 深色模式 12 级亮度(APP DARK_MODE_LIGHTNESS) */
const DARK_MODE_LIGHTNESS = [0.135, 0.165, 0.205, 0.255, 0.315, 0.385, 0.465, 0.545, 0.625, 0.705, 0.795, 0.895]

const FALLBACK_PRIMARY = '#3b82f6'

/** 从单一主色生成 12 级色阶:保持 OKLCH 的色相与饱和度,只换亮度。解析失败回退默认蓝。 */
export function generateColorScale(baseColor: string, isDark = false): ColorScale {
  const parsed = parse(baseColor)
  const base = parsed ? oklch(parsed) : undefined
  if (!base) return generateColorScale(FALLBACK_PRIMARY, isDark)
  const lightnesses = isDark ? DARK_MODE_LIGHTNESS : LIGHT_MODE_LIGHTNESS
  const scale: Partial<ColorScale> = {}
  for (const [i, l] of lightnesses.entries()) {
    const step = (i + 1) as keyof ColorScale
    scale[step] = formatHex({ ...base, l }) || baseColor
  }
  return scale as ColorScale
}

/** 中性色阶:取主色色相、chroma 0.01(几乎纯灰) */
export function generateNeutralScale(primaryColor: string, isDark = false): ColorScale {
  const parsed = parse(primaryColor)
  const base = parsed ? oklch(parsed) : undefined
  const hue = base?.h ?? 220
  const lightnesses = isDark ? DARK_MODE_LIGHTNESS : LIGHT_MODE_LIGHTNESS
  const scale: Partial<ColorScale> = {}
  for (const [i, l] of lightnesses.entries()) {
    const step = (i + 1) as keyof ColorScale
    scale[step] = formatHex({ mode: 'oklch', l, c: 0.01, h: hue }) || '#808080'
  }
  return scale as ColorScale
}

/** `#rrggbb` → `"r, g, b"`;非法输入回退白色 */
export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '255, 255, 255'
  return `${Number.parseInt(result[1], 16)}, ${Number.parseInt(result[2], 16)}, ${Number.parseInt(result[3], 16)}`
}

export function withAlpha(hex: string, alpha: number): string {
  return `rgba(${hexToRgb(hex)}, ${alpha})`
}

export function generateShadows(primaryColor: string): { sm: string; md: string; lg: string; glow: string; focus: string } {
  return {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    glow: `0 0 20px ${withAlpha(primaryColor, 0.25)}, 0 0 40px ${withAlpha(primaryColor, 0.15)}`,
    focus: `0 0 0 3px ${withAlpha(primaryColor, 0.15)}`,
  }
}
