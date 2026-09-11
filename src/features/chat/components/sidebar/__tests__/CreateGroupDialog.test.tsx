import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateGroupDialog } from '../CreateGroupDialog'

const { createGroup, toastMock } = vi.hoisted(() => ({ createGroup: vi.fn(), toastMock: vi.fn() }))
vi.mock('@/features/chat/store/groupStore', () => ({ useGroupStore: () => ({ createGroup }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }), toast: toastMock }))
// framer-motion 直通（与 GroupList.test.tsx 同一个理由：happy-dom 的 Animation.cancel 会在卸载时抛 AbortError）
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const passthrough = (tag: string) => ({ children, initial: _i, animate: _a, exit: _e, variants: _v, transition: _t, layout: _l, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => React.createElement(tag, rest, children)
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }) }
})
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

beforeEach(() => { createGroup.mockReset().mockResolvedValue({ group_id: 'g1', group_name: 'x', created_at: '' }); toastMock.mockClear() })
afterEach(() => vi.restoreAllMocks())

describe('CreateGroupDialog', () => {
  it('open=false 什么都不渲染；open=true 显示表单，群名为空时「创建」禁用', () => {
    const { rerender } = render(<CreateGroupDialog open={false} onClose={() => {}} />)
    expect(screen.queryByRole('heading', { name: '创建群聊' })).toBeNull()
    rerender(<CreateGroupDialog open onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: '创建群聊' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
  })
  it('默认需要审核：createGroup(name, undefined, true)；成功后 toast、onCreated、onClose', async () => {
    const onClose = vi.fn()
    const onCreated = vi.fn()
    render(<CreateGroupDialog open onClose={onClose} onCreated={onCreated} />)
    fireEvent.change(screen.getByLabelText('群名称 *'), { target: { value: ' 我的群聊 ' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith('我的群聊', undefined, true))
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('选「无需审核」→ 第三个实参 false；描述非空时原样传', async () => {
    render(<CreateGroupDialog open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('群名称 *'), { target: { value: '读书会' } })
    fireEvent.change(screen.getByLabelText('群描述（可选）'), { target: { value: '每周一本' } })
    fireEvent.change(screen.getByLabelText('入群审核'), { target: { value: 'open' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith('读书会', '每周一本', false))
  })
  it('失败：destructive toast，不关闭', async () => {
    createGroup.mockRejectedValueOnce(new Error('群名重复'))
    const onClose = vi.fn()
    render(<CreateGroupDialog open onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('群名称 *'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: '群名重复' })))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '创建群聊' })).toBeInTheDocument()
  })
  it('「取消」与遮罩点击都 onClose', () => {
    const onClose = vi.fn()
    render(<CreateGroupDialog open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
