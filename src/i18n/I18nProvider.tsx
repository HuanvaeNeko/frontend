'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { DEFAULT_LOCALE, type AppLocale, normalizeLocale } from './messages'
import { setActiveLocale, translateIn } from './translate'

interface I18nContextValue {
  locale: AppLocale
  t: (key: string, params?: Record<string, string | number>) => string
}

// 不在 Provider 里（测试里单独渲染组件）时按默认语言查字典，而不是把 key 原样吐出来
const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  t: (key, params) => translateIn(DEFAULT_LOCALE, key, params),
})

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

  // 组件外的 translate() 跟着同一个生效语言走
  useEffect(() => {
    setActiveLocale(locale)
  }, [locale])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: (key: string, params?: Record<string, string | number>) => translateIn(locale, key, params),
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
