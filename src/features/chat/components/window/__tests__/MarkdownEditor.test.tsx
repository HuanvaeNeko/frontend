import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from '../MarkdownEditor'

/**
 * 输入法组字中的回车不是「发送」。
 *
 * 中文拼音 / 日文输入法用回车把候选或原始字母上屏：这一下 keydown 的 `key` 仍是
 * 'Enter'，但 `isComposing === true`（Chrome/Firefox），Safari 在 compositionend 之后
 * 才补发、`isComposing` 已是 false，只能靠 `keyCode === 229` 认出来。
 * 不认这两个信号，用户打「nihao」按回车上屏，消息就以半截拼音被发出去了。
 */
function setup() {
  const onSubmit = vi.fn()
  const { container } = render(<MarkdownEditor onSubmit={onSubmit} />)
  const textarea = container.querySelector('textarea')
  if (!textarea) throw new Error('找不到输入框')
  fireEvent.change(textarea, { target: { value: 'nihao' } })
  return { onSubmit, textarea }
}

describe('MarkdownEditor 回车与输入法组字', () => {
  it('普通回车发送（正对照：下面两条的"不发送"不是因为回车根本不触发）', () => {
    const { onSubmit, textarea } = setup()
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', keyCode: 13 })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('组字中的回车（isComposing=true）不发送', () => {
    const { onSubmit, textarea } = setup()
    // keyCode 故意给 13：这条只守 isComposing 分支，229 分支由下一条单独守
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', keyCode: 13, isComposing: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Safari 的上屏回车（isComposing=false 但 keyCode=229）不发送', () => {
    const { onSubmit, textarea } = setup()
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', keyCode: 229 })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Shift+Enter 仍是换行，不发送', () => {
    const { onSubmit, textarea } = setup()
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
