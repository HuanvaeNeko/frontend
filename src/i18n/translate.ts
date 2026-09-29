import { DEFAULT_LOCALE, type AppLocale, messages } from './messages'

/**
 * 组件外（store、API 模块）的翻译。组件里仍然用 `useI18n().t`——它随语言切换重渲染；这里只是
 * 读 I18nProvider 当前生效的语言，给那些不在 React 树里、却要产出用户可见文字的地方用
 * （会话预览、兜底报错……）。原来这些地方一律写死中文，英文界面里照样冒中文。
 */
let activeLocale: AppLocale = DEFAULT_LOCALE

/** I18nProvider 解析出生效语言后同步过来 */
export function setActiveLocale(locale: AppLocale): void {
  activeLocale = locale
}

function getValueByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[segment]
  }, obj)
}

function formatMessage(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}

/** 按指定语言查：该语言 → 默认语言（中文）→ key 本身 */
export function translateIn(locale: AppLocale, key: string, params?: Record<string, string | number>): string {
  const localized = getValueByPath(messages[locale], key)
  const fallback = getValueByPath(messages[DEFAULT_LOCALE], key)
  const raw = typeof localized === 'string' ? localized : typeof fallback === 'string' ? fallback : key
  return formatMessage(raw, params)
}

/** 按当前生效的语言查 */
export function translate(key: string, params?: Record<string, string | number>): string {
  return translateIn(activeLocale, key, params)
}
