import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from '../MarkdownEditor'

/**
 * 英文界面下编辑器工具栏是英文：按钮悬浮提示、默认占位、预览空态、链接输入框，
 * 以及没选中文字时插进输入框的示例文字（原来英文界面里点「粗体」插进来的是「**粗体文本**」）。
 *
 * t 直接查 en-US 字典、不回落中文：缺 key 原样吐 key，下面的断言会红。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((node, k) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[k] : undefined), messages['en-US'])
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? `{${k}}`)) : key
  }
  return { useI18n: () => ({ locale: 'en-US', t }) }
})

const CJK = /[一-鿿]/

afterEach(() => {
  vi.restoreAllMocks()
})

function setup() {
  const { container } = render(<MarkdownEditor />)
  const textarea = container.querySelector('textarea')
  if (!textarea) throw new Error('找不到输入框')
  return { textarea }
}

describe('MarkdownEditor 英文界面', () => {
  it('工具栏提示、默认占位、预览空态都是英文，没有一个汉字', () => {
    const { textarea } = setup()

    expect(textarea).toHaveAttribute('placeholder', 'Type a message... (Markdown supported)')
    for (const title of ['Bold **text** (Ctrl+B)', 'Italic *text* (Ctrl+I)', 'Strikethrough ~~text~~', 'Inline code `code`', 'Heading ## heading', 'Numbered list 1. item', 'Link [text](url) (Ctrl+K)']) {
      expect(screen.getByTitle(title)).toBeInTheDocument()
    }
    expect(document.body.innerHTML).not.toMatch(CJK)

    fireEvent.click(screen.getByTitle('Preview'))
    expect(screen.getByText('Nothing to preview')).toBeInTheDocument()
    expect(screen.getByTitle('Edit')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })

  it('没选中文字时插进来的示例文字是英文', () => {
    const { textarea } = setup()

    fireEvent.click(screen.getByTitle('Bold **text** (Ctrl+B)'))
    expect(textarea).toHaveValue('**bold text**')
  })

  it('插入链接：提示框与链接文字是英文', () => {
    // happy-dom 没有 window.prompt，挂一个自有属性、用完删掉
    const prompt = vi.fn(() => 'https://example.com')
    Object.defineProperty(window, 'prompt', { value: prompt, configurable: true, writable: true })
    try {
      const { textarea } = setup()

      fireEvent.click(screen.getByTitle('Link [text](url) (Ctrl+K)'))
      expect(prompt).toHaveBeenCalledWith('Enter the link URL')
      expect(textarea).toHaveValue('[link text](https://example.com)')
    } finally {
      delete (window as { prompt?: unknown }).prompt
    }
  })
})
