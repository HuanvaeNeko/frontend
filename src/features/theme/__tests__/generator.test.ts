import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CUSTOM_COLORS, DEFAULT_GLASS_CONFIG, DEFAULT_OPACITY_LEVELS } from '../presets'
import { buildSnapshot, generateThemeData, toCssVariables } from '../generator'
import type { ThemeConfig } from '../types'

/**
 * 期望值来自 `src/styles/globals.css` 的 CSS 文本本身(上期 Task 1 用同一个 APP 生成器
 * 产出的静态 CSS),不是从生成器自己拼——所以这组用例既证明移植正确,也是
 * 「默认预设不写内联变量」(spec §4.3)这个优化的前提:默认输出与静态 CSS 相等,
 * 不写等于写。
 */
// `import.meta.url` 先存变量再传给 `new URL(...)`:如果直接写成字面量形式
// `new URL('...', import.meta.url)`,Vite 会把它当成静态资源导入(assets 文档的
// `new URL(url, import.meta.url)` 用法)整体重写成 dev-server 的 http:// URL,
// `readFileSync` 拿到后会抛 `ERR_INVALID_URL_SCHEME`——这里要的是运行时文件路径,
// 不是资源 URL,所以要绕开这条静态分析规则。
const selfUrl = import.meta.url
const css = readFileSync(new URL('../../../styles/globals.css', selfUrl), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function cssBlock(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  const end = css.indexOf('\n}', start)
  if (start < 0 || end < 0) throw new Error(`globals.css 里找不到 ${selector} 块`)
  const out: Record<string, string> = {}
  for (const m of css.slice(start, end).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}
const ROOT = cssBlock(':root')
const DARK = { ...ROOT, ...cssBlock('.dark') }

const DEFAULT: ThemeConfig = { preset: 'default', customColors: DEFAULT_CUSTOM_COLORS }
const varsOf = (config: ThemeConfig, isDark: boolean) =>
  toCssVariables(generateThemeData({ ...config, isDark }), config.customColors.glass ?? DEFAULT_GLASS_CONFIG, isDark)

describe('生成器对默认预设的输出 = globals.css 的静态值(spec §4.2 对照用例)', () => {
  it('浅色:115 个变量逐键等于 :root', () => {
    const vars = varsOf(DEFAULT, false)
    expect(Object.keys(vars)).toHaveLength(115)
    for (const [key, value] of Object.entries(vars)) expect({ key, value }).toEqual({ key, value: ROOT[key] })
  })
  it('深色:115 个变量逐键等于 .dark(未覆盖的键回落到 :root)', () => {
    const vars = varsOf(DEFAULT, true)
    expect(Object.keys(vars)).toHaveLength(115)
    for (const [key, value] of Object.entries(vars)) expect({ key, value }).toEqual({ key, value: DARK[key] })
  })
  it('字面量抽查(防止上面的循环在 CSS 与生成器同时错的时候一起绿)', () => {
    expect(varsOf(DEFAULT, false)['--primary']).toBe('#0956c6')
    expect(varsOf(DEFAULT, false)['--color-primary-1']).toBe('#acfaff')
    expect(varsOf(DEFAULT, false)['--white-alpha-90']).toBe('rgba(255, 255, 255, 0.9)')
    expect(varsOf(DEFAULT, false)['--glass-border']).toBe('rgba(255, 255, 255, 0.6)')
    expect(varsOf(DEFAULT, false)['--glass-backdrop']).toBe('blur(20px) saturate(180%)')
    expect(varsOf(DEFAULT, true)['--primary']).toBe('#3c83f7')
    expect(varsOf(DEFAULT, true)['--white-alpha-90']).toBe('rgba(20, 23, 28, 0.9)')
    expect(varsOf(DEFAULT, true)['--glass-border']).toBe('rgba(255, 255, 255, 0.12)')
    expect(varsOf(DEFAULT, true)['--bg-surface']).toBe('rgba(12, 14, 19, 0.9)')
  })
})

describe('自定义配置只改自己那一组变量', () => {
  const custom = (over: Partial<ThemeConfig['customColors']>): ThemeConfig => ({ preset: 'custom', customColors: { ...DEFAULT_CUSTOM_COLORS, ...over } })
  const diffKeys = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).filter((k) => a[k] !== b[k]).sort()

  it('改主色:--primary 系与 --color-primary-* 变,--accent 系与 --color-accent-* 一个都不变', () => {
    const base = varsOf(DEFAULT, false)
    const rose = varsOf(custom({ primary: '#e11d48' }), false)
    expect(rose['--primary']).not.toBe('#0956c6')
    expect(rose['--primary']).toBe('#bc002c')
    const changed = diffKeys(base, rose)
    expect(changed).toContain('--primary')
    expect(changed).toContain('--color-primary-9')
    expect(changed.filter((k) => k.startsWith('--accent') || k.startsWith('--color-accent'))).toEqual([])
    // 正对照:同一个 custom 预设、颜色不动时,与默认逐键相等
    expect(diffKeys(base, varsOf(custom({}), false))).toEqual([])
  })
  it('改强调色:只动 --accent 系与 --color-accent-*(含 12 级 + 5 个语义键 = 17 键)', () => {
    const base = varsOf(DEFAULT, false)
    const changed = diffKeys(base, varsOf(custom({ accent: '#059669' }), false))
    expect(changed).toHaveLength(17)
    expect(changed.every((k) => k.startsWith('--accent') || k.startsWith('--color-accent'))).toBe(true)
  })
  it('改单个透明度层级:只动同名的 --white-alpha-N 与 --glass-white-N', () => {
    const base = varsOf(DEFAULT, false)
    const glass = { ...DEFAULT_GLASS_CONFIG, opacityLevels: { ...DEFAULT_OPACITY_LEVELS, level70: 40 } }
    const tuned = varsOf(custom({ glass }), false)
    expect(diffKeys(base, tuned)).toEqual(['--glass-white-70', '--white-alpha-70'])
    expect(tuned['--white-alpha-70']).toBe('rgba(255, 255, 255, 0.4)')
  })
  it('改 level97(没有对应的 --glass-white-97)只动 --white-alpha-97', () => {
    const base = varsOf(DEFAULT, false)
    const glass = { ...DEFAULT_GLASS_CONFIG, opacityLevels: { ...DEFAULT_OPACITY_LEVELS, level97: 50 } }
    expect(diffKeys(base, varsOf(custom({ glass }), false))).toEqual(['--white-alpha-97'])
  })
  it('模糊与饱和度按 Web 比例:blur 24 → 9/15/18/24/36,backdrop 30;saturation 120 → normal 100 / high 120', () => {
    const vars = varsOf(custom({ glass: { ...DEFAULT_GLASS_CONFIG, blur: 24, saturation: 120 } }), false)
    expect([vars['--blur-xs'], vars['--blur-sm'], vars['--blur-md'], vars['--blur-lg'], vars['--blur-xl']]).toEqual(['blur(9px)', 'blur(15px)', 'blur(18px)', 'blur(24px)', 'blur(36px)'])
    expect(vars['--glass-backdrop']).toBe('blur(30px) saturate(120%)')
    expect(vars['--saturate-normal']).toBe('saturate(100%)')
    expect(vars['--saturate-high']).toBe('saturate(120%)')
  })
  it('深色下底色 #ffffff 跟随中性色 3 级;改了底色则两种模式都用它', () => {
    const dark = varsOf(custom({}), true)
    expect(dark['--white-alpha-50']).toBe('rgba(20, 23, 28, 0.5)')
    const tinted = varsOf(custom({ glass: { ...DEFAULT_GLASS_CONFIG, baseColor: '#102030' } }), true)
    expect(tinted['--white-alpha-50']).toBe('rgba(16, 32, 48, 0.5)')
    expect(varsOf(custom({ glass: { ...DEFAULT_GLASS_CONFIG, baseColor: '#102030' } }), false)['--white-alpha-50']).toBe('rgba(16, 32, 48, 0.5)')
  })
  it('borderOpacity 0.35:浅色 0.35,深色 round(0.35/5,2)=0.07;边框恒白不随底色', () => {
    const glass = { ...DEFAULT_GLASS_CONFIG, baseColor: '#102030', borderOpacity: 0.35 }
    expect(varsOf(custom({ glass }), false)['--glass-border']).toBe('rgba(255, 255, 255, 0.35)')
    expect(varsOf(custom({ glass }), true)['--glass-border']).toBe('rgba(255, 255, 255, 0.07)')
  })
  it('非法主色回退默认蓝(与 APP generateColorScale 的回退一致)', () => {
    expect(varsOf(custom({ primary: 'not-a-color' }), false)['--primary']).toBe('#0956c6')
  })
})

describe('buildSnapshot', () => {
  it('两份快照分别等于 toCssVariables 的浅 / 深输出', () => {
    const snap = buildSnapshot(DEFAULT)
    expect(snap.light).toEqual(varsOf(DEFAULT, false))
    expect(snap.dark).toEqual(varsOf(DEFAULT, true))
    expect(snap.light['--primary']).toBe('#0956c6')
    expect(snap.dark['--primary']).toBe('#3c83f7')
  })
})
