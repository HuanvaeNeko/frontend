import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, messages } from '@/i18n/messages'

/**
 * 源码里每一个 `t('字面量 key')` 都必须在每种语言里有对应的**字符串**。
 *
 * 缺 key 时 `t` 原样返回 key，界面上就露出 `chat.fileManager.searchPlaceholder` 这种
 * 原文；而 `t(key) || '兜底'` 的写法因为 key 本身是真值，兜底永远不会生效——
 * 这正是文件管理搜索框、聊天发送按钮 title 曾经出现原始 key 的原因。
 *
 * 组件测试普遍把 `t` mock 成 `(key) => key`，看不见这一层；这里直接扫源码。
 * 只认字面量 key（`t(`${x}`)` 这类动态拼接不在此列）。
 */

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/__tests__/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

function usedKeys(): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>()
  for (const [file, text] of Object.entries(sources)) {
    for (const match of text.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"]/g)) {
      const files = used.get(match[1]) ?? new Set<string>()
      files.add(file)
      used.set(match[1], files)
    }
  }
  return used
}

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    if (!node || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[segment]
  }, tree)
}

describe('i18n：源码用到的字面量 key 在每种语言里都有文案', () => {
  const used = usedKeys()

  it('前置：确实扫到了源码里的 key（防止 glob 落空后整条用例空转为绿）', () => {
    expect(used.size).toBeGreaterThan(200)
    expect(used.has('shell.settings.logout')).toBe(true)
  })

  it.each(SUPPORTED_LOCALES)('%s 没有缺失的 key', (locale) => {
    const missing = [...used]
      .filter(([key]) => typeof lookup(messages[locale], key) !== 'string')
      .map(([key, files]) => `${key}  ← ${[...files].join(', ')}`)
    expect(missing).toEqual([])
  })
})
