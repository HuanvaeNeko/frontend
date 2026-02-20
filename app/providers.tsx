'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import SoundProvider from '@/components/SoundProvider'
import { Toaster } from '@/components/ui/toaster'
import { useSettingsStore } from '@/store/settingsStore'
import { setSoundEnabled, setSoundVolume } from '@/hooks/useSound'

const UpdatePrompt = dynamic(
  () => import('@/components/UpdatePrompt').then(mod => ({ default: mod.UpdatePrompt })),
  { ssr: false }
)
const AppInstallPrompt = dynamic(
  () => import('@/components/AppInstallPrompt'),
  { ssr: false }
)

// 全局设置同步组件
function SettingsSync() {
  const theme = useSettingsStore((s) => s.theme)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled)

  // 同步主题
  useEffect(() => {
    const root = document.documentElement
    
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      root.classList.toggle('dark', mediaQuery.matches)
      
      // 监听系统主题变化
      const handler = (e: MediaQueryListEvent) => {
        root.classList.toggle('dark', e.matches)
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    } else {
      root.classList.toggle('dark', theme === 'dark')
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

  return null
}

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SoundProvider>
      <SettingsSync />
      {children}
      <Toaster />
      <UpdatePrompt autoUpdateDelay={3000} />
      <AppInstallPrompt />
    </SoundProvider>
  )
}
