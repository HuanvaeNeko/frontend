import { beforeEach, describe, expect, it, vi } from 'vitest'
import { themeInitScript } from '../themeInitScript'

const run = () => new Function(themeInitScript)()
const root = () => document.documentElement

beforeEach(() => {
  localStorage.clear()
  root().removeAttribute('style')
  root().classList.remove('dark')
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

describe('themeInitScript', () => {
  it('custom + dark：写深色快照，且仍切 .dark', () => {
    localStorage.setItem('app-settings', JSON.stringify({ state: { theme: 'dark' } }))
    localStorage.setItem('huanvae.theme', JSON.stringify({ state: { config: { preset: 'custom', customColors: { primary: '#e11d48' } }, snapshot: { light: { '--primary': '#bc002c' }, dark: { '--primary': '#ff5577', '--white-alpha-90': 'rgba(20, 23, 28, 0.9)' } } } }))
    run()
    expect(root().classList.contains('dark')).toBe(true)
    expect(root().style.getPropertyValue('--primary')).toBe('#ff5577')
    expect(root().style.getPropertyValue('--white-alpha-90')).toBe('rgba(20, 23, 28, 0.9)')
  })
  it('custom + light：写浅色那份', () => {
    localStorage.setItem('huanvae.theme', JSON.stringify({ state: { config: { preset: 'custom', customColors: { primary: '#e11d48' } }, snapshot: { light: { '--primary': '#bc002c' }, dark: { '--primary': '#ff5577' } } } }))
    run()
    expect(root().style.getPropertyValue('--primary')).toBe('#bc002c')
  })
  it('default 预设：即使落盘里残留快照也一个变量都不写（正对照上面两条）', () => {
    localStorage.setItem('huanvae.theme', JSON.stringify({ state: { config: { preset: 'default', customColors: { primary: '#e11d48' } }, snapshot: { light: { '--primary': '#bc002c' }, dark: {} } } }))
    run()
    expect(root().style.getPropertyValue('--primary')).toBe('')
  })
  it('不是 -- 开头或不是字符串的键被跳过；坏 JSON 不抛', () => {
    localStorage.setItem('huanvae.theme', JSON.stringify({ state: { config: { preset: 'custom', customColors: { primary: '#000000' } }, snapshot: { light: { color: 'red', '--x': 1, '--primary': '#000000' }, dark: {} } } }))
    run()
    expect(root().style.getPropertyValue('--primary')).toBe('#000000')
    expect(root().style.getPropertyValue('color')).toBe('')
    expect(root().style.getPropertyValue('--x')).toBe('')
    localStorage.setItem('huanvae.theme', '{oops')
    expect(() => run()).not.toThrow()
  })
})
