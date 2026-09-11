import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeStore } from '@/features/theme/store'
import { ThemeEditor } from '../ThemeEditor'

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

beforeEach(() => {
  localStorage.clear()
  useThemeStore.getState().reset()
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers() })

describe('ThemeEditor', () => {
  it('默认预设：只显示预设卡片与毛玻璃，不显示自定义颜色；点「自定义」卡片切预设并展开取色器', () => {
    render(<ThemeEditor />)
    expect(screen.getByRole('radio', { name: /默认/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText('自定义颜色')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /自定义/ }))
    expect(useThemeStore.getState().config.preset).toBe('custom')
    expect(screen.getByText('自定义颜色')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /主色/ })).toHaveTextContent('#3B82F6')
  })
  it('滑块 50ms 防抖写 store：拖动后立刻不写，50ms 后写；预设自动变 custom', () => {
    render(<ThemeEditor />)
    fireEvent.change(screen.getByLabelText('模糊度'), { target: { value: '24' } })
    expect(useThemeStore.getState().config.customColors.glass?.blur).toBe(16)
    act(() => { vi.advanceTimersByTime(50) })
    expect(useThemeStore.getState().config.customColors.glass?.blur).toBe(24)
    expect(useThemeStore.getState().config.preset).toBe('custom')
  })
  it('高级透明度默认折叠；展开后 17 个滑块，改一个只动那一层', () => {
    render(<ThemeEditor />)
    expect(screen.queryByLabelText('level70')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /高级透明度设置/ }))
    expect(screen.getAllByRole('slider', { name: /^level\d+$/ })).toHaveLength(17)
    fireEvent.change(screen.getByLabelText('level70'), { target: { value: '40' } })
    act(() => { vi.advanceTimersByTime(50) })
    const levels = useThemeStore.getState().config.customColors.glass?.opacityLevels
    expect(levels?.level70).toBe(40)
    expect(levels?.level60).toBe(60)
  })
  it('主色文本框输入合法 hex 立即写 store；恢复默认按钮回到 default', () => {
    render(<ThemeEditor />)
    fireEvent.click(screen.getByRole('radio', { name: /自定义/ }))
    fireEvent.click(screen.getByRole('button', { name: /主色/ }))
    fireEvent.change(screen.getByLabelText('十六进制颜色'), { target: { value: '#e11d48' } })
    expect(useThemeStore.getState().config.customColors.primary).toBe('#e11d48')
    fireEvent.click(screen.getByRole('button', { name: '恢复默认主题' }))
    expect(useThemeStore.getState().config.preset).toBe('default')
    expect(useThemeStore.getState().config.customColors.primary).toBe('#3b82f6')
  })
})
