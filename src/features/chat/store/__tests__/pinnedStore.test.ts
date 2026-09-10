import { beforeEach, describe, expect, it } from 'vitest'
import { beginSession, endSession } from '@/lib/sessionScope'
import { usePinnedStore } from '../pinnedStore'

describe('pinnedStore：账号级置顶', () => {
  beforeEach(() => {
    localStorage.clear()
    usePinnedStore.getState().reset()
    beginSession()
  })

  it('toggle 置顶/取消置顶并落盘到 huanvae.pinned-conversations', () => {
    usePinnedStore.getState().toggle('f-alice')
    expect(usePinnedStore.getState().isPinned('f-alice')).toBe(true)
    expect(localStorage.getItem('huanvae.pinned-conversations')).toContain('f-alice')
    usePinnedStore.getState().toggle('f-alice')
    expect(usePinnedStore.getState().isPinned('f-alice')).toBe(false)
  })

  it('登出（endSession）清空——置顶是账号的，不是设备的', () => {
    usePinnedStore.getState().toggle('g-1')
    expect(usePinnedStore.getState().pinned).toEqual(['g-1'])   // 正对照：清之前确实有
    endSession()
    expect(usePinnedStore.getState().pinned).toEqual([])
    expect(localStorage.getItem('huanvae.pinned-conversations') ?? '').not.toContain('g-1')
  })
})
