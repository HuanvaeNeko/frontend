'use client'

import { useEffect, useCallback } from 'react'
import { warmupSound, setSoundEnabled, setSoundVolume } from '@/hooks/useSound'
import { useSettingsStore } from '@/store/settingsStore'

/**
 * 全局音效提供者
 * 负责初始化音效系统并同步设置
 */
export default function SoundProvider({ children }: { children: React.ReactNode }) {
  const soundEnabled = useSettingsStore((state) => state.soundEnabled)
  const soundVolume = useSettingsStore((state) => state.soundVolume)

  // 同步设置到音效管理器
  useEffect(() => {
    setSoundEnabled(soundEnabled)
  }, [soundEnabled])

  useEffect(() => {
    setSoundVolume(soundVolume)
  }, [soundVolume])

  // 用户首次交互时预热音频上下文
  const handleFirstInteraction = useCallback(() => {
    warmupSound()
    // 移除事件监听器，只需要触发一次
    document.removeEventListener('click', handleFirstInteraction)
    document.removeEventListener('touchstart', handleFirstInteraction)
    document.removeEventListener('keydown', handleFirstInteraction)
  }, [])

  useEffect(() => {
    document.addEventListener('click', handleFirstInteraction, { once: true })
    document.addEventListener('touchstart', handleFirstInteraction, { once: true })
    document.addEventListener('keydown', handleFirstInteraction, { once: true })

    return () => {
      document.removeEventListener('click', handleFirstInteraction)
      document.removeEventListener('touchstart', handleFirstInteraction)
      document.removeEventListener('keydown', handleFirstInteraction)
    }
  }, [handleFirstInteraction])

  return <>{children}</>
}
