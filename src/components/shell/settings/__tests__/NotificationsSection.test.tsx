import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { NotificationsSection } from '../NotificationsSection'

/**
 * 同 AppearanceSection.test.tsx：不 mock `@/i18n/I18nProvider` 的话 `useI18n()`
 * 在没有 `<I18nProvider>` 包裹时落到 context 默认值 `t: (key) => key`——恒等
 * mock 会让下面断言字面中文（音量 / 桌面通知）的用例落空。对真实 zhCN 字典
 * 做路径查找，同一个写法。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

describe('NotificationsSection', () => {
  beforeEach(() =>
    useSettingsStore.setState({ notificationsEnabled: true, soundEnabled: true, soundVolume: 0.5 }),
  )

  it('音量滑块显示 0-100 刻度，拖动后按 /100 写回 soundVolume（0..1）', () => {
    render(<NotificationsSection />)
    const slider = screen.getByRole('slider', { name: '音量' }) as HTMLInputElement
    expect(slider.value).toBe('50')

    fireEvent.change(slider, { target: { value: '30' } })

    expect(useSettingsStore.getState().soundVolume).toBe(0.3)
  })

  it('桌面通知开关写回 notificationsEnabled', () => {
    render(<NotificationsSection />)
    fireEvent.click(screen.getByRole('switch', { name: '桌面通知' }))
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false)
  })
})
