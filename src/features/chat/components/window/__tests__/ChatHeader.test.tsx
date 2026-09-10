import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatHeader } from '../ChatHeader'

/**
 * i18n mock：同 Sidebar.test.tsx
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

describe('ChatHeader 的 hideMobileHeader 断点', () => {
  const mockConversation = {
    id: 'alice',
    type: 'friend' as const,
    name: 'Alice',
    unreadCount: 0,
    avatar: 'https://example.com/avatar.png',
    online: true,
  }

  it('hideMobileHeader=true 时，根元素有 hidden lg:flex，不含 md:flex', () => {
    const { container } = render(
      <ChatHeader
        conversation={mockConversation}
        hideMobileHeader={true}
        onGroupManage={() => {}}
      />,
    )
    const header = container.firstElementChild as HTMLElement
    expect(header.className).toContain('hidden')
    expect(header.className).toContain('lg:flex')
    expect(header.className).not.toContain('md:flex')
  })

  it('hideMobileHeader=false 时，根元素既无 hidden 也无 lg:flex', () => {
    const { container } = render(
      <ChatHeader
        conversation={mockConversation}
        hideMobileHeader={false}
        onGroupManage={() => {}}
      />,
    )
    const header = container.firstElementChild as HTMLElement
    expect(header.className).not.toContain('hidden')
    expect(header.className).not.toContain('lg:flex')
  })
})
