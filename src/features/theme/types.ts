/**
 * 主题系统类型(移植 APP `theme/types.ts`,字段名不改;去掉 `mode`——明暗留在
 * `settingsStore.theme`,见 spec §2)。
 */
export interface ColorScale {
  1: string; 2: string; 3: string; 4: string; 5: string; 6: string
  7: string; 8: string; 9: string; 10: string; 11: string; 12: string
}

export type ThemePreset = 'default' | 'custom'

/** 各 UI 层级透明度,0–100(百分比)。分组见 presets.ts 的 OPACITY_GROUPS。 */
export interface OpacityLevels {
  level97: number; level95: number; level90: number; level85: number; level80: number; level75: number
  level70: number; level60: number; level50: number; level45: number; level40: number; level35: number
  level30: number; level25: number; level20: number; level15: number; level10: number
}

export interface GlassConfig {
  /** 底色(HEX);深色模式下 '#ffffff' 视为「跟随模式」,见 generator.ts */
  baseColor: string
  /** APP 的历史字段,生成器不读它;保留是为了与 APP 的持久化形状一致 */
  opacity: number
  /** 模糊度 4–40 px */
  blur: number
  /** 饱和度 100–250 % */
  saturation: number
  /** 边框透明度 0.1–0.8(Web 默认 0.6,见 spec §4.1) */
  borderOpacity: number
  opacityLevels?: OpacityLevels
}

export interface CustomColors {
  primary: string
  accent?: string
  glass?: GlassConfig
}

export interface ThemeConfig {
  preset: ThemePreset
  /** preset === 'custom' 时生效;default 时忽略(但保留,切回 custom 时复用) */
  customColors: CustomColors
}

export interface SemanticTokens {
  bg: { primary: string; secondary: string; tertiary: string; surface: string; surfaceHover: string; muted: string; inverse: string }
  text: { primary: string; secondary: string; muted: string; light: string; inverse: string; link: string }
  border: { default: string; subtle: string; strong: string; focus: string }
  primary: { default: string; hover: string; active: string; subtle: string; text: string }
  accent: { default: string; hover: string; active: string; subtle: string; text: string }
  status: { success: string; successSubtle: string; warning: string; warningSubtle: string; error: string; errorSubtle: string; info: string; infoSubtle: string }
  shadow: { sm: string; md: string; lg: string; glow: string; focus: string }
}

export interface ThemeData {
  primaryScale: ColorScale
  accentScale: ColorScale
  neutralScale: ColorScale
  semantic: SemanticTokens
}

/** `--name → value`,直接喂 `style.setProperty` */
export type CssVariables = Record<string, string>

/** 两种模式各一份,切明暗不重算(spec §4.3) */
export interface ThemeSnapshot {
  light: CssVariables
  dark: CssVariables
}
