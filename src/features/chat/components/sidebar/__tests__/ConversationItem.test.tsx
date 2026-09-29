import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConversationItem } from '../ConversationItem'

/** 这两句原来写死英文（"No messages yet" / "Typing..."），中文界面也露英文 */
vi.mock('framer-motion', async () => {
  const react = await import('react')
  const passthrough = (tag: string) =>
    react.forwardRef(function MockMotion({ initial: _i, animate: _a, exit: _e, transition: _t, layout: _l, whileHover: _h, whileTap: _w, ...rest }: Record<string, unknown>, ref: React.Ref<unknown>) {
      return react.createElement(tag, { ...rest, ref })
    })
  return { motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }), AnimatePresence: ({ children }: { children?: React.ReactNode }) => children }
})

describe('ConversationItem', () => {
  it('没有消息时的占位走 i18n（默认中文「暂无消息」），不是英文 No messages yet', () => {
    render(<ConversationItem id="u1" type="friend" name="张三" onClick={() => {}} />)
    expect(screen.getByText('暂无消息')).toBeInTheDocument()
    expect(screen.queryByText(/No messages yet/)).toBeNull()
  })

  it('正在输入走 i18n，不是英文 Typing', () => {
    render(<ConversationItem id="u1" type="friend" name="张三" isTyping onClick={() => {}} />)
    expect(screen.getByText(/正在输入/)).toBeInTheDocument()
    expect(screen.queryByText(/Typing/)).toBeNull()
  })
})
