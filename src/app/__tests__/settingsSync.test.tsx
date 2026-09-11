import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { SettingsSync } from '../root'

/**
 * 终审 M6：`settingsStore` → `SoundManager` 这座桥的完成判定断点。
 *
 * `SettingsSync` 里 `setNotificationSound(notificationSound)` 那个 effect
 * （`root.tsx` 现在的 :131-133 附近）是 settingsStore 与 SoundManager 之间唯一的
 * 接线：用户在设置里选的提示音、开关、音量，全靠这三个 effect 才会真的传到播放层。
 * 终审把 `setNotificationSound` 那个 effect 整个掏空后，全量测试依旧全绿——说明
 * "选中的提示音真的会响"这条完成判定中间断了一环，没有任何用例钉住这座桥。
 *
 * `setSoundEnabled` / `setSoundVolume` 两条同一个形状、同样零覆盖（不是本期新引入的
 * 缺口，但既然要补就一起补），三条写成 it.each。
 */

const { setSoundEnabled, setSoundVolume, setNotificationSound } = vi.hoisted(() => ({
  setSoundEnabled: vi.fn(),
  setSoundVolume: vi.fn(),
  setNotificationSound: vi.fn(),
}))

vi.mock('@/hooks/useSound', () => ({ setSoundEnabled, setSoundVolume, setNotificationSound }))

interface Case {
  name: string
  apply: () => void
  assert: () => void
}

const cases: Case[] = [
  {
    name: 'notificationSound',
    apply: () => useSettingsStore.setState({ notificationSound: 'gentle-bell' }),
    assert: () => expect(setNotificationSound).toHaveBeenCalledWith('gentle-bell'),
  },
  {
    name: 'soundEnabled',
    apply: () => useSettingsStore.setState({ soundEnabled: false }),
    assert: () => expect(setSoundEnabled).toHaveBeenCalledWith(false),
  },
  {
    name: 'soundVolume',
    apply: () => useSettingsStore.setState({ soundVolume: 0.9 }),
    assert: () => expect(setSoundVolume).toHaveBeenCalledWith(0.9),
  },
]

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().resetSettings()
  vi.clearAllMocks()
})

describe('SettingsSync —— settingsStore 变化必须传到 SoundManager', () => {
  it.each(cases)('settingsStore.$name 变化后，对应的 useSound setter 被以新值调用', ({ apply, assert }) => {
    render(<SettingsSync />)
    act(apply)
    assert()
  })

  it('挂载时也会用当前值同步一次（不是只在变化之后才接线）', () => {
    useSettingsStore.setState({ notificationSound: 'chime', soundEnabled: false, soundVolume: 0.3 })
    render(<SettingsSync />)
    expect(setNotificationSound).toHaveBeenCalledWith('chime')
    expect(setSoundEnabled).toHaveBeenCalledWith(false)
    expect(setSoundVolume).toHaveBeenCalledWith(0.3)
  })
})
