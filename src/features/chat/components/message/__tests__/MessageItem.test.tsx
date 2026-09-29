import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupsApi } from '@/features/chat/api/groups'
import type { Message } from '@/features/chat/api/messages'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { MessageItem } from '../MessageItem'

/**
 * 后端文档里的消息类型不能渲染成「[不支持的消息类型]」：system（系统提示）、meeting_invite
 * （会议邀请，content 是 {room_id,password,room_name,creator_name} JSON）、group_card（群名片，
 * content 是 {group_id}，展示信息由客户端现拉 /public）、card（可交互卡片）。
 * backend-docs group_messages/群消息.md 类型表、messages/好友消息.md「群卡片消息」。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return value.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? `{${k}}`))
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
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

function msg(type: string, content: string, from = 'bob'): Message {
  return {
    message_uuid: `m-${type}`, sender_id: from, receiver_id: 'alice', message_content: content, message_type: type as Message['message_type'],
    file_uuid: null, file_url: null, file_size: null, file_hash: null, filename: null, content_type: null,
    image_width: null, image_height: null, seq: 1, send_time: '2026-09-29T02:00:00Z',
  }
}

const noop = () => {}
function renderItem(message: Message, conversationType: 'friend' | 'group' = 'friend') {
  return render(
    <MemoryRouter>
      <MessageItem message={message} selectedConversationType={conversationType} peerName="鲍勃"
        onCopy={noop} onDelete={noop} onRecall={noop} onDownload={noop} onPreview={noop} canRecall={false} />
    </MemoryRouter>,
  )
}

const PUBLIC = {
  group_id: 'g-photo', group_name: '胶片摄影同好会', group_avatar_url: null, group_description: '一起拍胶片', creator_id: 'dave',
  created_at: '2025-01-01T00:00:00Z', join_approval_required: true, admin_can_approve: true, allow_join_via_qr: true,
  allow_join_via_search: false, allow_join_via_referral: true, status: 'active', member_count: 4,
}

beforeEach(() => {
  useAuthStore.setState({ user: { user_id: 'alice', nickname: '爱丽丝' } } as never)
  useGroupStore.setState({ myGroups: [] } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MessageItem：文档里的其它消息类型', () => {
  it('system：渲染成居中的系统提示，不是气泡，也不是「不支持」', () => {
    renderItem(msg('system', '卡萝尔 加入了群聊'), 'group')
    expect(screen.getByRole('note')).toHaveTextContent('卡萝尔 加入了群聊')
    expect(screen.queryByText(/不支持/)).toBeNull()
  })

  it('meeting_invite：显示发起人与会议名，「加入会议」带着房间号与密码', () => {
    renderItem(msg('meeting_invite', JSON.stringify({ room_id: 'R8K2QF', password: '246810', room_name: '周会', creator_name: '鲍勃', creator_avatar: 'avatars/bob.png' })))
    expect(screen.getByText(/鲍勃 邀请你加入视频会议/)).toBeInTheDocument()
    expect(screen.getByText(/周会/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '加入会议' })).toHaveAttribute('href', '/app/video-meeting?room=R8K2QF&pwd=246810')
    expect(screen.queryByText(/不支持/)).toBeNull()
  })

  it('meeting_invite 内容不是合法 JSON：退回可读的「[会议邀请]」，不崩', () => {
    renderItem(msg('meeting_invite', 'not-json'))
    expect(screen.getByText('[会议邀请]')).toBeInTheDocument()
  })

  it('group_card：拉 /public 显示群名与人数；不是成员时可以按「好友推荐」申请加入', async () => {
    vi.spyOn(groupsApi, 'getPublicGroupInfo').mockResolvedValue(PUBLIC)
    const apply = vi.spyOn(groupsApi, 'applyToJoin').mockResolvedValue({ status: 'pending', message: '已提交' })

    renderItem(msg('group_card', JSON.stringify({ group_id: 'g-photo' })))

    expect(await screen.findByText('胶片摄影同好会')).toBeInTheDocument()
    expect(screen.getByText(/4 人/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '申请加入' }))
    await waitFor(() => expect(apply).toHaveBeenCalledWith('g-photo', 'referral'))
  })

  it('group_card：已经是成员时给「进入群聊」', async () => {
    vi.spyOn(groupsApi, 'getPublicGroupInfo').mockResolvedValue(PUBLIC)
    useGroupStore.setState({ myGroups: [{ group_id: 'g-photo', group_name: '胶片摄影同好会', group_avatar_url: null, role: 'member', unread_count: 0, last_message_content: null, last_message_time: null }] } as never)

    renderItem(msg('group_card', JSON.stringify({ group_id: 'g-photo' })))

    expect(await screen.findByRole('link', { name: '进入群聊' })).toHaveAttribute('href', '/app/chat/g-g-photo')
  })

  it('card：真的把卡片渲染出来（标题 + 节点），不是一句「卡片消息」占位', () => {
    renderItem(msg('card', JSON.stringify({ version: 1, nodes: [{ type: 'heading', text: '今日天气' }, { type: 'stat', label: '杭州', value: '26°C' }] })))
    expect(screen.getByRole('heading', { name: '今日天气' })).toBeInTheDocument()
    expect(screen.getByText('26°C')).toBeInTheDocument()
    expect(screen.queryByText(/卡片消息|不支持/)).toBeNull()
  })
})
