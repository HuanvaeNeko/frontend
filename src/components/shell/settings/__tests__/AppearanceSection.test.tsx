import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { AppearanceSection } from '../AppearanceSection'

/**
 * 不 mock `@/i18n/I18nProvider` 的话，`useI18n()` 在没有 `<I18nProvider>` 包裹时
 * 落到 context 的默认值 `t: (key) => key`——本质就是一个恒等 mock，会让下面
 * 断言字面中文（深色 / 跟随系统 / 界面动画 / 粒子背景）的用例落空。与
 * `UnifiedList.test.tsx` / `Sidebar.test.tsx` 同一个理由、同一个写法：对真实
 * `zhCN` 字典做路径查找。
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

describe('AppearanceSection', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'light', animationsEnabled: true, particleBackground: false }))

  it('主题三选一写回 settingsStore.theme', () => {
    render(<AppearanceSection />)
    fireEvent.click(screen.getByRole('radio', { name: '深色' }))
    expect(useSettingsStore.getState().theme).toBe('dark')
    fireEvent.click(screen.getByRole('radio', { name: '跟随系统' }))
    expect(useSettingsStore.getState().theme).toBe('auto')
  })

  it('动画与粒子背景开关写回对应字段', () => {
    render(<AppearanceSection />)
    fireEvent.click(screen.getByRole('switch', { name: '界面动画' }))
    expect(useSettingsStore.getState().animationsEnabled).toBe(false)
    fireEvent.click(screen.getByRole('switch', { name: '粒子背景' }))
    expect(useSettingsStore.getState().particleBackground).toBe(true)
  })
})
