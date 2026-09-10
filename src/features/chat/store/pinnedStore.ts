import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { registerSessionReset } from '@/lib/sessionScope'

/**
 * 置顶的会话 id（`f-<uid>` / `g-<gid>`）。**账号级**：普通 localStorage 命名空间，
 * `endSession()` 清盘——换账号登录不能继承上一个人的置顶(spec §6)。
 * APP 把它存在本地 SQLite 的 is_pinned 列里；Web 没有本地库，一个数组就够。
 */
interface PinnedState {
  pinned: string[]
  isPinned: (id: string) => boolean
  toggle: (id: string) => void
  reset: () => void
}

export const PINNED_STORAGE_KEY = 'huanvae.pinned-conversations'

export const usePinnedStore = create<PinnedState>()(
  persist(
    (set, get) => ({
      pinned: [],
      isPinned: (id) => get().pinned.includes(id),
      toggle: (id) =>
        set((s) => ({ pinned: s.pinned.includes(id) ? s.pinned.filter((x) => x !== id) : [...s.pinned, id] })),
      reset: () => set({ pinned: [] }),
    }),
    { name: PINNED_STORAGE_KEY, storage: createJSONStorage(() => localStorage), partialize: (s) => ({ pinned: s.pinned }) },
  ),
)

registerSessionReset(() => {
  usePinnedStore.getState().reset()
  // persist 只在 set 时写盘；reset 已经 set 了空数组，盘上跟着变空。
})
