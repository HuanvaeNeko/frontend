import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ChatInput } from '../ChatInput'
import type { MarkdownEditorRef } from '../MarkdownEditor'

vi.mock('@/i18n/I18nProvider', () => ({ useI18n: () => ({ locale: 'zh-CN', t: (key: string) => key }) }))

/**
 * 发送按钮的可用状态必须跟上**这一次**输入，而不是上一次。
 *
 * 原实现在编辑器的 onChange 里去读 ref 上的 `isEmpty()`，而那一刻 ref 还是上一次
 * 渲染的旧值：只打一个字，按钮仍是灰的；全部删空，按钮反而亮着。
 */
function Harness() {
  const [hasContent, setHasContent] = useState(false)
  const editorRef = useRef<MarkdownEditorRef>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <ChatInput
      sending={false}
      selectedFile={null}
      uploadProgress={null}
      editorHasContent={hasContent}
      fileInputRef={fileInputRef}
      editorRef={editorRef}
      onSendMessage={() => {}}
      onSendFile={() => {}}
      onFileSelect={() => {}}
      onCancelFile={() => {}}
      onPaste={() => {}}
      setEditorHasContent={setHasContent}
    />
  )
}

function sendButton() {
  // 发送按钮是输入区里最后一个按钮（附件、表情在它前面）
  const buttons = screen.getAllByRole('button')
  return buttons[buttons.length - 1]
}

describe('ChatInput 发送按钮状态', () => {
  it('只打一个字，发送按钮就可用', () => {
    const { container } = render(<Harness />)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(sendButton()).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'a' } })

    expect(sendButton()).toBeEnabled()
  })

  it('全部删空，发送按钮立即禁用', () => {
    const { container } = render(<Harness />)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'ab' } })
    expect(sendButton()).toBeEnabled()

    fireEvent.change(textarea, { target: { value: '' } })

    expect(sendButton()).toBeDisabled()
  })
})
