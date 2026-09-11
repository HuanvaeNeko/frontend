import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPACITY_LEVELS } from '../presets'
import { DEFAULT_THEME_CONFIG, THEME_STORAGE_KEY, isThemeConfig, useThemeStore } from '../store'

beforeEach(() => {
  localStorage.clear()
  useThemeStore.getState().reset()
})

describe('themeStore：快照只在 custom 时存在', () => {
  it('初始：default 预设、snapshot 为 null、落盘键是 huanvae.theme', () => {
    expect(useThemeStore.getState().config).toEqual(DEFAULT_THEME_CONFIG)
    expect(useThemeStore.getState().snapshot).toBeNull()
    expect(THEME_STORAGE_KEY).toBe('huanvae.theme')
    const persisted = JSON.parse(localStorage.getItem('huanvae.theme') ?? 'null')
    expect(persisted.state.config.preset).toBe('default')
    expect(persisted.state.snapshot).toBeNull()
  })
  it('setPrimaryColor 自动切到 custom，两份快照都算出来并落盘', () => {
    useThemeStore.getState().setPrimaryColor('#e11d48')
    const { config, snapshot } = useThemeStore.getState()
    expect(config.preset).toBe('custom')
    expect(config.customColors.primary).toBe('#e11d48')
    expect(snapshot?.light['--primary']).toBe('#bc002c')
    expect(snapshot?.dark['--primary']).not.toBe('#bc002c')
    expect(Object.keys(snapshot?.light ?? {})).toHaveLength(115)
    const persisted = JSON.parse(localStorage.getItem('huanvae.theme') ?? 'null')
    expect(persisted.state.snapshot.light['--primary']).toBe('#bc002c')
  })
  it('setPreset(default) 清快照但保留 customColors；setPreset(custom) 恢复快照', () => {
    useThemeStore.getState().setPrimaryColor('#e11d48')
    useThemeStore.getState().setOpacityLevel('level70', 40)
    useThemeStore.getState().setPreset('default')
    expect(useThemeStore.getState().snapshot).toBeNull()
    expect(useThemeStore.getState().config.customColors.primary).toBe('#e11d48')
    expect(useThemeStore.getState().config.customColors.glass?.opacityLevels?.level70).toBe(40)
    useThemeStore.getState().setPreset('custom')
    expect(useThemeStore.getState().snapshot?.light['--white-alpha-70']).toBe('rgba(255, 255, 255, 0.4)')
  })
  it('setGlassConfig 合并局部字段；setOpacityLevel 夹在 0–100', () => {
    useThemeStore.getState().setGlassConfig({ blur: 24 })
    expect(useThemeStore.getState().config.customColors.glass?.blur).toBe(24)
    expect(useThemeStore.getState().config.customColors.glass?.saturation).toBe(180)
    useThemeStore.getState().setOpacityLevel('level10', 250)
    expect(useThemeStore.getState().config.customColors.glass?.opacityLevels?.level10).toBe(100)
    useThemeStore.getState().setOpacityLevel('level10', -5)
    expect(useThemeStore.getState().config.customColors.glass?.opacityLevels?.level10).toBe(0)
  })
  it('reset 回到默认配置与 null 快照', () => {
    useThemeStore.getState().setAccentColor('#059669')
    useThemeStore.getState().reset()
    expect(useThemeStore.getState().config).toEqual(DEFAULT_THEME_CONFIG)
    expect(useThemeStore.getState().config.customColors.glass?.opacityLevels).toEqual(DEFAULT_OPACITY_LEVELS)
    expect(useThemeStore.getState().snapshot).toBeNull()
  })
  it('setConfig（跨标签页）用本地生成器重算快照，不信任传入的快照', () => {
    useThemeStore.getState().setConfig({ preset: 'custom', customColors: { primary: '#e11d48' } })
    expect(useThemeStore.getState().snapshot?.light['--primary']).toBe('#bc002c')
  })
})

describe('isThemeConfig', () => {
  it('认合法配置，拒绝坏形状', () => {
    expect(isThemeConfig({ preset: 'custom', customColors: { primary: '#000000' } })).toBe(true)
    expect(isThemeConfig({ preset: 'rainbow', customColors: { primary: '#000000' } })).toBe(false)
    expect(isThemeConfig({ preset: 'custom' })).toBe(false)
    expect(isThemeConfig(null)).toBe(false)
  })
})

/**
 * `merge()` 的水合路径：钉住「恢复时只信 config，快照本地重算，不信任落盘里的 snapshot」。
 *
 * 必须真正触发 `persist` 的同步水合（zustand 5 在 `create()` 内部就同步调一次 `hydrate()`，
 * 见 `sessionScope.ts` 顶部注释），而不能复用本文件顶部已经 hydrate 过的单例——那个单例
 * 早在文件加载时就 `create()` 过了，此后再 `setItem` 不会让它重新水合。所以这里用
 * `vi.resetModules()` 清空模块缓存，在动态 `import('../store')` *之前* 把构造好的落盘内容
 * 写进 `localStorage`，让新的模块实例在它自己的 `create()` 里读到这份数据。
 * 顶层 `beforeEach` 已经 `localStorage.clear()` 过一次，这里不用再清。
 */
describe('themeStore：merge() 的水合路径', () => {
  it('落盘 config 是 default 但 snapshot 残留：水合后必须清成 null，不信任残留快照', async () => {
    localStorage.setItem(
      'huanvae.theme',
      JSON.stringify({
        state: {
          config: { preset: 'default', customColors: { primary: '#3b82f6' } },
          snapshot: { light: { '--primary': '#deadbe' }, dark: { '--primary': '#deadbe' } },
        },
        version: 0,
      }),
    )
    vi.resetModules()
    const fresh = await import('../store')
    expect(fresh.useThemeStore.getState().snapshot).toBeNull()
    expect(fresh.useThemeStore.getState().config.preset).toBe('default')
  })

  it('落盘 config 是 custom：水合后快照用本地生成器重算，不是落盘里的值（正对照）', async () => {
    localStorage.setItem(
      'huanvae.theme',
      JSON.stringify({
        state: {
          config: { preset: 'custom', customColors: { primary: '#e11d48' } },
          snapshot: { light: { '--primary': '#deadbe' }, dark: {} },
        },
        version: 0,
      }),
    )
    vi.resetModules()
    const fresh = await import('../store')
    expect(fresh.useThemeStore.getState().snapshot?.light['--primary']).toBe('#bc002c')
    expect(fresh.useThemeStore.getState().snapshot?.light['--primary']).not.toBe('#deadbe')
  })

  it('落盘 config 形状损坏：水合后回落默认配置与 null 快照', async () => {
    localStorage.setItem('huanvae.theme', JSON.stringify({ state: { config: { preset: 'rainbow' } }, version: 0 }))
    vi.resetModules()
    const fresh = await import('../store')
    expect(fresh.useThemeStore.getState().config).toEqual(fresh.DEFAULT_THEME_CONFIG)
    expect(fresh.useThemeStore.getState().snapshot).toBeNull()
  })
})
