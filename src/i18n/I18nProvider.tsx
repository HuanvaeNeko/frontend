'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { DEFAULT_LOCALE, type AppLocale, messages, normalizeLocale } from './messages'

interface I18nContextValue {
  locale: AppLocale
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  t: (key) => key,
})

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

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const language = useSettingsStore((s) => s.language)
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_LOCALE)

  useEffect(() => {
    const resolveLocale = (): AppLocale => {
      if (language !== 'auto') return normalizeLocale(language)
      return normalizeLocale(typeof navigator === 'undefined' ? DEFAULT_LOCALE : navigator.language)
    }

    setLocale(resolveLocale())

    if (language !== 'auto') return
    const handleLanguageChange = () => {
      setLocale(resolveLocale())
    }
    window.addEventListener('languagechange', handleLanguageChange)
    return () => window.removeEventListener('languagechange', handleLanguageChange)
  }, [language])

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, params?: Record<string, string | number>) => {
      const currentDict = messages[locale]
      const fallbackDict = messages[DEFAULT_LOCALE]

      const localized = getValueByPath(currentDict, key)
      const fallback = getValueByPath(fallbackDict, key)
      const raw = typeof localized === 'string'
        ? localized
        : (typeof fallback === 'string' ? fallback : key)

      return formatMessage(raw, params)
    }
    return { locale, t }
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
