import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { BlacklistPanel } from '../BlacklistPanel'

vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return params ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : value
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const ROW = { user_id: 'u2', user_nickname: '李四', user_avatar_url: null, created_at: '2026-09-01T00:00:00Z' }

beforeEach(() => {
  useFriendsStore.setState({ blacklist: [], blacklistLoaded: false, loadBlacklist: vi.fn(async () => { useFriendsStore.setState({ blacklist: [ROW], blacklistLoaded: true }) }), removeBlacklist: vi.fn(async () => { useFriendsStore.setState({ blacklist: [] }) }) })
})
afterEach(() => vi.restoreAllMocks())

describe('BlacklistPanel', () => {
  it('挂载时拉一次列表；渲染昵称 / @id / 拉黑时间与提示文案', async () => {
    render(<BlacklistPanel />)
    expect(await screen.findByText('李四')).toBeInTheDocument()
    expect(screen.getByText('@u2')).toBeInTheDocument()
    expect(screen.getByText(/拉黑于/)).toBeInTheDocument()
    expect(screen.getByText(/好友关系仍保留/)).toBeInTheDocument()
    expect(useFriendsStore.getState().loadBlacklist).toHaveBeenCalledTimes(1)
  })
  it('已加载过（blacklistLoaded）就不再拉', () => {
    useFriendsStore.setState({ blacklist: [ROW], blacklistLoaded: true })
    render(<BlacklistPanel />)
    expect(useFriendsStore.getState().loadBlacklist).not.toHaveBeenCalled()
    expect(screen.getByText('李四')).toBeInTheDocument()
  })
  it('两步确认：第一次点「取消拉黑」不调 API；「确认」才调；「取消」收回', async () => {
    render(<BlacklistPanel />)
    await screen.findByText('李四')
    fireEvent.click(screen.getByRole('button', { name: '取消拉黑' }))
    expect(useFriendsStore.getState().removeBlacklist).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('button', { name: '确认' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消拉黑' }))
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(useFriendsStore.getState().removeBlacklist).toHaveBeenCalledWith('u2'))
    expect(await screen.findByText('没有拉黑任何人')).toBeInTheDocument()
  })
  it('加载失败：错误行 + 重试再拉一次', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('网络断了')).mockImplementation(async () => { useFriendsStore.setState({ blacklist: [ROW], blacklistLoaded: true }) })
    useFriendsStore.setState({ loadBlacklist: load })
    render(<BlacklistPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent('网络断了')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('李四')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('取消拉黑失败：错误行可见，行还在', async () => {
    useFriendsStore.setState({ blacklist: [ROW], blacklistLoaded: true, removeBlacklist: vi.fn(async () => { throw new Error('boom') }) })
    render(<BlacklistPanel />)
    fireEvent.click(screen.getByRole('button', { name: '取消拉黑' }))
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(await screen.findByText(/取消拉黑失败/)).toHaveTextContent('boom')
    expect(screen.getByText('李四')).toBeInTheDocument()
  })
})
