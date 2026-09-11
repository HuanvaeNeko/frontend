import { buildSnapshot } from './generator'
import { DEFAULT_THEME_CONFIG } from './store'
import type { CssVariables } from './types'

let themeKeys: Set<string> | null = null
/** 本模块会写的全部键名（= 生成器输出的 115 个）；懒算一次 */
function getThemeKeys(): Set<string> {
  if (!themeKeys) themeKeys = new Set(Object.keys(buildSnapshot({ ...DEFAULT_THEME_CONFIG, preset: 'custom' }).light))
  return themeKeys
}

export function applyThemeVariables(root: HTMLElement, vars: CssVariables): void {
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
}

/** 只清主题键，不碰 SettingsSync 写的 `--animation-duration` 等 */
export function clearThemeVariables(root: HTMLElement): void {
  const keys = getThemeKeys()
  for (let i = root.style.length - 1; i >= 0; i -= 1) {
    const name = root.style.item(i)
    if (keys.has(name)) root.style.removeProperty(name)
  }
}
