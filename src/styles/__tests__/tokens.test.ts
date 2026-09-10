import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf-8')

/** 取 `selector {` 到下一个顶层 `}` 之间的文本（只用于断言，不解析 CSS） */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`globals.css 里没有 ${selector} 块`)
  const end = css.indexOf('\n}', start)
  return css.slice(start, end)
}

describe('设计 token：APP 的 variables.css 是唯一颜色来源', () => {
  it('shadcn 的语义变量别名到 APP token，而不是自带一套 HSL', () => {
    const theme = block('@theme inline')
    expect(theme).toContain('--color-background: var(--bg-primary)')
    expect(theme).toContain('--color-foreground: var(--text-primary)')
    expect(theme).toContain('--color-card: var(--bg-surface)')
    expect(theme).toContain('--color-primary: var(--primary)')
    expect(theme).toContain('--color-primary-foreground: var(--text-on-color)')
    expect(theme).toContain('--color-muted-foreground: var(--text-muted)')
    expect(theme).toContain('--color-border: var(--border-default)')
    expect(theme).toContain('--color-destructive: var(--status-error)')
    // 正对照：旧的 HSL 三元组写法一处都不能留（它们会让上面的别名指向空值）
    expect(css).not.toMatch(/hsl\(var\(--/)
  })

  it(':root 与 .dark 定义的是同一组 APP token，且值来自 APP 默认主题（生成器输出）', () => {
    const root = block(':root')
    const dark = block('.dark')
    for (const name of ['--primary', '--accent', '--bg-primary', '--bg-secondary', '--text-primary', '--text-muted', '--border-default', '--status-error']) {
      expect(root, `:root 缺 ${name}`).toContain(`${name}:`)
      expect(dark, `.dark 缺 ${name}`).toContain(`${name}:`)
    }
    expect(root).toContain('--primary: #0956c6')
    expect(root).toContain('--bg-primary: #ffffff')
    expect(dark).toContain('--primary: #3c83f7')
    expect(dark).toContain('--bg-primary: #06080c')
    // 正对照：两套值确实不同（否则"暗色"只是复制了一遍浅色）
    expect(root.match(/--bg-primary: (#[0-9a-f]{6})/)?.[1]).not.toBe(dark.match(/--bg-primary: (#[0-9a-f]{6})/)?.[1])
  })

  it('圆角按 APP 的刻度（sm 8 / md 12 / lg 14 / xl 16 / 2xl 22 / 3xl 28）', () => {
    const theme = block('@theme inline')
    expect(theme).toContain('--radius-sm: 8px')
    expect(theme).toContain('--radius-lg: 14px')
    expect(theme).toContain('--radius-3xl: 28px')
  })

  it('全仓源码里不再有 hsl(var(--x)) 写法（换 token 后它们会指向空值，静默失色）', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (entry === '__tests__' || entry === 'node_modules') continue
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(tsx?|css)$/.test(entry) && /hsl\(var\(--/.test(readFileSync(full, 'utf-8'))) offenders.push(full)
      }
    }
    walk(join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
    // 正对照：扫描确实读到了源码（否则空目录也会绿）
    expect(readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf-8').length).toBeGreaterThan(1000)
  })
})
