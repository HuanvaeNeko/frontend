import { render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/features/chat/api/messages'
import { useAuthStore } from '@/features/auth/store/authStore'
import { MessageList } from '../MessageList'

/**
 * 消息区：跨天插入日期分隔条；好友消息的头像是好友本人（图 / 首字母），不是一律「U」。
 */
vi.mock('@/i18n/I18nProvider', () => ({ useI18n: () => ({ locale: 'zh-CN', t: (key: string) => key }) }))
vi.mock('framer-motion', async () => {
  const react = await import('react')
  const strip = ({ initial: _i, animate: _a, exit: _e, transition: _t, layout: _l, ...rest }: Record<string, unknown>) => rest
  const passthrough = (tag: string) =>
    react.forwardRef(function MockMotion(props: Record<string, unknown>, ref: React.Ref<unknown>) {
      const { children, ...rest } = strip(props)
      return react.createElement(tag, { ...rest, ref }, children as React.ReactNode)
    })
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  }
})

function msg(uuid: string, from: string, to: string, content: string, when: Date): Message {
  return {
    message_uuid: uuid, sender_id: from, receiver_id: to, message_content: content, message_type: 'text',
    file_uuid: null, file_url: null, file_size: null, file_hash: null, filename: null, content_type: null,
    image_width: null, image_height: null, seq: 1, send_time: when.toISOString(),
  }
}

const now = new Date()
const today = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0)
const yesterday = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, h, 0)

function renderList(messages: Message[]) {
  const noop = () => {}
  return render(
    <MessageList
      messages={messages}
      conversation={{ id: 'bob', type: 'friend', name: '鲍勃', unreadCount: 0 }}
      user={{ user_id: 'alice', nickname: '爱丽丝' } as never}
      loading={false}
      hasMore={false}
      onLoadMore={noop}
      onScroll={noop}
      onCopy={noop}
      onDelete={noop}
      onRecall={noop}
      onDownload={noop}
      onPreview={noop}
      canRecallMessage={() => false}
      messagesContainerRef={createRef<HTMLDivElement>()}
      messagesEndRef={createRef<HTMLDivElement>()}
    />,
  )
}

beforeEach(() => {
  useAuthStore.setState({ user: { user_id: 'alice', nickname: '爱丽丝' } } as never)
})

describe('MessageList 日期分隔条', () => {
  it('每一天的第一条消息前各有一条分隔条，同一天内不重复', () => {
    renderList([
      msg('m1', 'bob', 'alice', '昨天的第一条', yesterday(9)),
      msg('m2', 'alice', 'bob', '昨天的第二条', yesterday(10)),
      msg('m3', 'bob', 'alice', '今天的第一条', today(8)),
      msg('m4', 'alice', 'bob', '今天的第二条', today(9)),
    ])
    const dividers = screen.getAllByRole('separator').map((el) => el.textContent)
    expect(dividers).toEqual(['昨天', '今天'])
  })
})

describe('MessageList 头像', () => {
  it('好友发来的消息显示好友首字母，不是「U」', () => {
    renderList([msg('m1', 'bob', 'alice', '你好', today(8))])
    const row = screen.getByText('你好').closest('[data-message-uuid]') as HTMLElement
    expect(within(row).getByText('鲍')).toBeInTheDocument()
    expect(within(row).queryByText('U')).toBeNull()
  })
})
