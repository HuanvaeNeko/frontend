import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AiSection } from '../AiSection'

/**
 * 同 AppearanceSection.test.tsx：对真实 zhCN 字典做路径查找，而不是用
 * `t: (key) => key` 的恒等 mock——否则断言不到字面中文副标题文案。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

describe('AiSection', () => {
  it('渲染原 SettingsPage 卡片的 aiConfigDesc 副标题', () => {
    render(<AiSection />)
    // 字面量取自 src/i18n/messages.ts 的 messages['zh-CN'].settings.aiConfigDesc，
    // 不经过变量间接引用，防止实现和断言共用同一处笔误。
    expect(screen.getByText('AI 助手与接口设置')).toBeInTheDocument()
  })
})
