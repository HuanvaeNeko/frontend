'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import SoundProvider from '@/components/SoundProvider'
import GlobalThreeBackdrop from '@/components/three/GlobalThreeBackdrop'
import { Toaster } from '@/components/ui/toaster'
import { useSettingsStore } from '@/store/settingsStore'
import { setSoundEnabled, setSoundVolume } from '@/hooks/useSound'
import { I18nProvider } from '@/i18n/I18nProvider'

const UpdatePrompt = dynamic(
  () => import('@/components/UpdatePrompt').then(mod => ({ default: mod.UpdatePrompt })),
  { ssr: false }
)

function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister()
      })
    })

    void caches.keys().then((keys) => {
      keys
        .filter((key) => key.includes('serwist') || key.includes('workbox'))
        .forEach((key) => {
          void caches.delete(key)
        })
    })
  }, [])

  return null
}

// 全局设置同步组件
function SettingsSync() {
  const theme = useSettingsStore((s) => s.theme)
  const language = useSettingsStore((s) => s.language)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled)

  // 同步主题
  useEffect(() => {
    const root = document.documentElement
    const setThemeCookie = (value: 'light' | 'dark') => {
      document.cookie = `app-theme=${value}; Path=/; Max-Age=31536000; SameSite=Lax`
      root.style.colorScheme = value
    }
    
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      root.classList.toggle('dark', mediaQuery.matches)
      setThemeCookie(mediaQuery.matches ? 'dark' : 'light')
      
      // 监听系统主题变化
      const handler = (e: MediaQueryListEvent) => {
        root.classList.toggle('dark', e.matches)
        setThemeCookie(e.matches ? 'dark' : 'light')
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    } else {
      root.classList.toggle('dark', theme === 'dark')
      setThemeCookie(theme === 'dark' ? 'dark' : 'light')
    }
  }, [theme])

  // 同步音效设置
  useEffect(() => {
    setSoundEnabled(soundEnabled)
  }, [soundEnabled])

  useEffect(() => {
    setSoundVolume(soundVolume)
  }, [soundVolume])

  // 同步动画设置
  useEffect(() => {
    const root = document.documentElement
    if (animationsEnabled) {
      root.classList.remove('reduce-motion')
      root.style.setProperty('--animation-duration', '1')
    } else {
      root.classList.add('reduce-motion')
      root.style.setProperty('--animation-duration', '0')
    }
  }, [animationsEnabled])

  useEffect(() => {
    if (!language || language === 'auto') {
      document.documentElement.lang = navigator.language || 'zh-CN'
      return
    }
    document.documentElement.lang = language
  }, [language])

  return null
}

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <I18nProvider>
      <SoundProvider>
        <GlobalThreeBackdrop />
        <DevServiceWorkerCleanup />
        <SettingsSync />
        {children}
        <Toaster />
        <UpdatePrompt autoUpdateDelay={3000} />
      </SoundProvider>
    </I18nProvider>
  )
}
