import { create } from 'zustand'

interface UIState {
  // 模态框状态
  profileModalOpen: boolean
  settingsModalOpen: boolean

  // Actions
  openProfileModal: () => void
  closeProfileModal: () => void
  openSettingsModal: () => void
  closeSettingsModal: () => void
}

export const useUIStore = create<UIState>()((set) => ({
  // 模态框状态
  profileModalOpen: false,
  settingsModalOpen: false,

  // Actions
  openProfileModal: () => set({ profileModalOpen: true }),
  closeProfileModal: () => set({ profileModalOpen: false }),
  openSettingsModal: () => set({ settingsModalOpen: true }),
  closeSettingsModal: () => set({ settingsModalOpen: false }),
}))
