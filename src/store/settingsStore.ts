import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SettingsState {
  // AI 配置
  aiEnabled: boolean
  aiModel: string
  
  // 语言和地区
  language: string
  use24HourFormat: boolean
  
  // 隐私和安全
  showOnlineStatus: boolean
  messageEncryption: boolean
  
  // 外观
  theme: 'light' | 'dark' | 'auto'
  animationsEnabled: boolean
  
  // 通知
  notificationsEnabled: boolean
  soundEnabled: boolean
  
  // Actions
  setSetting: <K extends keyof Omit<SettingsState, 'setSetting' | 'resetSettings'>>(
    key: K,
    value: SettingsState[K]
  ) => void
  resetSettings: () => void
}

const defaultSettings: Omit<SettingsState, 'setSetting' | 'resetSettings'> = {
  aiEnabled: true,
  aiModel: 'gpt-4',
  language: 'zh-CN',
  use24HourFormat: true,
  showOnlineStatus: true,
  messageEncryption: true,
  theme: 'light',
  animationsEnabled: true,
  notificationsEnabled: true,
  soundEnabled: true,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      
      setSetting: (key, value) => set((state) => ({ ...state, [key]: value })),
      
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'app-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
