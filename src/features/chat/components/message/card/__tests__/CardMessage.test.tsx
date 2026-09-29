import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messagesApi } from '@/features/chat/api/messages'
import { CardMessage } from '../CardMessage'

/**
 * 可交互卡片（message_type: 'card'）。结构 `{ version, nodes }` 与节点白名单见 backend-docs
 * messages/好友消息.md:92-112；节点内部字段「由渲染端约定」(:111)，这里按 APP 的
 * src/types/card.ts + CardRenderer.tsx 的约定渲染。原来网页端只给一句「卡片消息」占位。
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

const card = (nodes: unknown[]) => JSON.stringify({ version: 1, nodes })
const renderCard = (content: string) => render(<CardMessage messageUuid="m-card" content={content} />)

afterEach(() => vi.restoreAllMocks())

describe('CardMessage 渲染', () => {
  it('第一个顶层 heading 进卡片头；row/stat/progress/text/table 都渲染出来', () => {
    renderCard(card([
      { type: 'heading', text: '服务器状态', level: 2 },
      { type: 'row', children: [{ type: 'stat', label: 'CPU', value: '37%' }, { type: 'stat', label: '内存', value: '2.1 GB' }] },
      { type: 'progress', label: '磁盘', value: 42, max: 100 },
      { type: 'text', text: '一切正常' },
      { type: 'table', columns: ['主机', '状态'], rows: [['web-1', 'OK'], ['web-2', '重启中']] },
    ]))

    expect(screen.getByRole('heading', { name: '服务器状态' })).toBeInTheDocument()
    expect(screen.getByText('37%')).toBeInTheDocument()
    expect(screen.getByText('2.1 GB')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '磁盘' })).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('一切正常')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('重启中')
  })

  it('不认识的节点、超过 32 层的嵌套：该处显示「[不支持的组件]」，卡片其余部分照常', () => {
    let deep: Record<string, unknown> = { type: 'text', text: '最深处' }
    for (let i = 0; i < 40; i++) deep = { type: 'container', children: [deep] }
    renderCard(card([{ type: 'iframe', url: 'https://evil.example' }, { type: 'text', text: '照常显示' }, deep]))

    expect(screen.getAllByText('[不支持的组件]')).toHaveLength(2)
    expect(screen.getByText('照常显示')).toBeInTheDocument()
    expect(screen.queryByText('最深处')).toBeNull()
  })

  it('内容不是合法卡片（坏 JSON / 没有 nodes）：「[无法解析的卡片]」', () => {
    const first = renderCard('not-json')
    expect(screen.getByText('[无法解析的卡片]')).toBeInTheDocument()
    first.unmount()
    renderCard(JSON.stringify({ version: 1 }))
    expect(screen.getByText('[无法解析的卡片]')).toBeInTheDocument()
  })

  it('图片只接受 http(s) 或站内相对路径；javascript: 之类的地址不渲染', () => {
    renderCard(card([{ type: 'image', url: 'avatars/chart.png', alt: '走势' }, { type: 'image', url: 'javascript:alert(1)', alt: '坏图' }]))
    expect(screen.getByRole('img', { name: '走势' }).getAttribute('src')).toMatch(/\/avatars\/chart\.png$/)
    expect(screen.queryByRole('img', { name: '坏图' })).toBeNull()
  })

  it('图表没有有效数据：「[图表: 暂无数据]」', () => {
    renderCard(card([{ type: 'chart', title: 'BTC', chart_type: 'area', data: [] }]))
    expect(screen.getByText('[图表: 暂无数据]')).toBeInTheDocument()
  })
})

describe('CardMessage 交互（POST /api/messages/interact）', () => {
  it('按钮带上 message_uuid / action_id / value{value, form} / nonce；表单的下拉与输入一起带上；成功显示「已执行」', async () => {
    const interact = vi.spyOn(messagesApi, 'interact').mockResolvedValue({ delivered: true })
    renderCard(card([
      { type: 'select', action_id: 'city', options: [{ label: '杭州', value: 'hz' }, { label: '上海', value: 'sh' }] },
      { type: 'input', action_id: 'note', label: '附言' },
      { type: 'button', action_id: 'submit', text: '提交', value: 'go', style: 'primary' },
    ]))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sh' } })
    fireEvent.change(screen.getByLabelText('附言'), { target: { value: '尽快' } })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => expect(interact).toHaveBeenCalledWith({
      message_uuid: 'm-card', action_id: 'submit', value: { value: 'go', form: { city: 'sh', note: '尽快' } }, nonce: expect.any(String),
    }))
    expect(await screen.findByRole('button', { name: /已执行/ })).toBeInTheDocument()
  })

  it('confirm 按钮：第一次点只是要求确认，第二次才真的发', async () => {
    const interact = vi.spyOn(messagesApi, 'interact').mockResolvedValue({ delivered: true })
    renderCard(card([{ type: 'button', action_id: 'reboot', text: '重启', confirm: true, style: 'danger' }]))

    fireEvent.click(screen.getByRole('button', { name: '重启' }))
    expect(interact).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /确认重启/ }))

    await waitFor(() => expect(interact).toHaveBeenCalledWith(expect.objectContaining({ action_id: 'reboot', value: null })))
  })

  it('交互失败：卡片上显示「操作失败」', async () => {
    vi.spyOn(messagesApi, 'interact').mockRejectedValue(new Error('404'))
    renderCard(card([{ type: 'button', action_id: 'refresh', text: '刷新' }]))

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('操作失败')
  })
})
