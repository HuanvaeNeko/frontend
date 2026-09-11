import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { ThemeProvider } from '../ThemeProvider'
import { useThemeStore } from '../store'

/** prefers-color-scheme 可控桩（happy-dom 没有 matchMedia） */
function stubColorScheme(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  let matches = dark
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return query.includes('dark') ? matches : false },
    media: query, onchange: null,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners.add(cb) },
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners.delete(cb) },
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
  return { flip(next: boolean) { matches = next; for (const cb of listeners) cb({ matches: next }) } }
}

const root = () => document.documentElement
const inline = (name: string) => root().style.getPropertyValue(name)

beforeEach(() => {
  localStorage.clear()
  useThemeStore.getState().reset()
  useSettingsStore.setState({ theme: 'light' })
  root().removeAttribute('style')
})
afterEach(() => { vi.unstubAllGlobals() })

describe('ThemeProvider', () => {
  it('默认预设：一个内联变量都不写（正对照：切到 custom 才写）', () => {
    stubColorScheme(false)
    render(<ThemeProvider />)
    expect(root().style.length).toBe(0)
    act(() => useThemeStore.getState().setPrimaryColor('#e11d48'))
    expect(inline('--primary')).toBe('#bc002c')
    expect(root().style.length).toBe(115)
  })
  it('切回 default 清掉全部主题键，但不动别人写的 --animation-duration', () => {
    stubColorScheme(false)
    root().style.setProperty('--animation-duration', '1')
    render(<ThemeProvider />)
    act(() => useThemeStore.getState().setPrimaryColor('#e11d48'))
    act(() => useThemeStore.getState().setPreset('default'))
    expect(inline('--primary')).toBe('')
    expect(inline('--animation-duration')).toBe('1')
    expect(root().style.length).toBe(1)
  })
  it('settingsStore.theme 切到 dark 时改写为深色快照', () => {
    stubColorScheme(false)
    render(<ThemeProvider />)
    act(() => useThemeStore.getState().setPrimaryColor('#e11d48'))
    const light = inline('--primary')
    act(() => useSettingsStore.setState({ theme: 'dark' }))
    expect(inline('--primary')).toBe(useThemeStore.getState().snapshot?.dark['--primary'])
    expect(inline('--primary')).not.toBe(light)
    expect(inline('--white-alpha-90')).toMatch(/^rgba\(\d+, \d+, \d+, 0\.9\)$/)
  })
  it('auto 模式跟随系统：媒体查询翻转时重应用', () => {
    const scheme = stubColorScheme(false)
    useSettingsStore.setState({ theme: 'auto' })
    render(<ThemeProvider />)
    act(() => useThemeStore.getState().setPrimaryColor('#e11d48'))
    expect(inline('--primary')).toBe('#bc002c')
    act(() => scheme.flip(true))
    expect(inline('--primary')).toBe(useThemeStore.getState().snapshot?.dark['--primary'])
  })
  it('跨标签页：storage 事件里的 huanvae.theme 触发 setConfig 并重应用；坏 JSON 忽略', () => {
    stubColorScheme(false)
    render(<ThemeProvider />)
    const newValue = JSON.stringify({ state: { config: { preset: 'custom', customColors: { primary: '#e11d48' } } }, version: 0 })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'huanvae.theme', newValue })) })
    expect(useThemeStore.getState().config.preset).toBe('custom')
    expect(inline('--primary')).toBe('#bc002c')
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'huanvae.theme', newValue: '{not json' })) })
    expect(inline('--primary')).toBe('#bc002c')
    // 正对照：别的键不触发
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'app-settings', newValue: JSON.stringify({ state: { config: { preset: 'default', customColors: { primary: '#000' } } } }) })) })
    expect(useThemeStore.getState().config.preset).toBe('custom')
  })
})
