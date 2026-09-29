import { describe, expect, it } from 'vitest'
import { useSettingsStore } from '../settingsStore'

describe('settingsStore 默认值', () => {
  it('主题默认跟随系统（auto），不是写死的浅色', () => {
    useSettingsStore.getState().resetSettings()
    expect(useSettingsStore.getState().theme).toBe('auto')
  })
})
