import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LanguagePreference } from '@/i18n/messages'
import { DEVICE_SCOPED_SETTING_FIELDS, registerSessionReset } from '@/lib/sessionScope'

interface SettingsState {
  // AI 配置
  aiEnabled: boolean
  aiModel: string
  
  // 语言和地区
  language: LanguagePreference
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
  soundVolume: number
  
  // 3D 效果
  particleBackground: boolean
  
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
  language: 'auto',
  use24HourFormat: true,
  showOnlineStatus: true,
  messageEncryption: true,
  theme: 'light',
  animationsEnabled: true,
  notificationsEnabled: true,
  soundEnabled: true,
  soundVolume: 0.5,
  particleBackground: true,
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

/**
 * `app-settings` 里**不**属于这台设备的字段，会话结束时恢复默认值。
 *
 * 名单是从 `defaultSettings` 里**减去** `DEVICE_SCOPED_SETTING_FIELDS` 算出来的，
 * 不是另抄一份：往这个 store 新增一个设置，只要没有人把它显式登记成设备级，
 * 它就自动进入这份账号级名单，登出时跟着账号一起归零。落盘那一半用的是同一个
 * `DEVICE_SCOPED_SETTING_FIELDS`（`endSession` 会把 `app-settings` 的 `state`
 * 裁到只剩它），两边不可能各说各话。
 */
const ACCOUNT_SCOPED_DEFAULTS = Object.fromEntries(
  Object.entries(defaultSettings).filter(
    ([key]) => !(DEVICE_SCOPED_SETTING_FIELDS as readonly string[]).includes(key),
  ),
) as Partial<SettingsState>

registerSessionReset(() => {
  useSettingsStore.setState(ACCOUNT_SCOPED_DEFAULTS)
})
