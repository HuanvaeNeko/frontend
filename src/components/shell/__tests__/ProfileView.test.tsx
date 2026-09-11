import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { profileApi } from '@/features/profile/api/profile'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { ProfileView } from '../ProfileView'

/**
 * 不 mock `@/i18n/I18nProvider` 的话，`useI18n()` 在没有 `<I18nProvider>` 包裹时
 * 落到 context 的默认值 `t: (key) => key`——会让下面断言字面中文（发消息 / 删除好友 /
 * 资料加载失败）的用例落空。与 `UnifiedList.test.tsx` / `Sidebar.test.tsx` 同一个
 * 理由、同一个写法：对真实 `zhCN` 字典做路径查找。
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

const PUBLIC = { user_id: 'alice', user_nickname: '爱丽丝', user_signature: '早睡早起', user_avatar_url: 'https://cdn.test/a.png', background_url: null, gender: null, birthday: null, region: '杭州', created_at: null }

let testRouter: ReturnType<typeof createMemoryRouter> | null = null
const renderView = () => {
  testRouter = createMemoryRouter([{ path: '*', element: <ProfileView userId="alice" /> }], { initialEntries: ['/app/contacts/friends/alice'] })
  render(<RouterProvider router={testRouter} />)
}

describe('ProfileView', () => {
  beforeEach(() => {
    // happy-dom（vitest.config.ts 的 test.environment）不实现 window.confirm/alert/prompt
    // （已实测：`new (require('happy-dom').Window)().confirm` 是 undefined，不是函数）。
    // `vi.spyOn(window, 'confirm')` 要求目标本来就是函数，这里先垫一个可覆盖的空实现，
    // 下面「删除好友」用例再各自 `mockReturnValueOnce` 接管返回值。
    window.confirm = vi.fn()
    vi.spyOn(profileApi, 'getPublicProfile').mockResolvedValue(PUBLIC)
    useFriendsStore.setState({ friends: [{ friend_id: 'alice', friend_nickname: '爱丽丝', friend_avatar_url: null, add_time: '2026-01-01T00:00:00Z', approve_reason: null, friend_remark: '小爱', is_blacklisted: false, is_special_care: false }], removeFriend: vi.fn(async () => {}), addBlacklist: vi.fn(async () => {}), removeBlacklist: vi.fn(async () => {}) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('显示备注名、@id、签名、地区；发消息链接到 /app/chat/f-alice', async () => {
    renderView()
    expect(await screen.findByText('早睡早起')).toBeInTheDocument()
    expect(screen.getByText('小爱')).toBeInTheDocument()
    expect(screen.getByText('@alice')).toBeInTheDocument()
    expect(screen.getByText('杭州')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '发消息' })).toHaveAttribute('href', '/app/chat/f-alice')
    expect(profileApi.getPublicProfile).toHaveBeenCalledWith('alice')
  })

  it('删除好友：确认后调 removeFriend(userId)；取消不调', async () => {
    renderView()
    await screen.findByText('早睡早起')
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    screen.getByRole('button', { name: '删除好友' }).click()
    expect(useFriendsStore.getState().removeFriend).not.toHaveBeenCalled()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    screen.getByRole('button', { name: '删除好友' }).click()
    await waitFor(() => expect(useFriendsStore.getState().removeFriend).toHaveBeenCalledWith('alice'))
    expect(testRouter?.state.location.pathname).toBe('/app/contacts')
  })

  it('删除好友失败：显示错误、按钮恢复、不跳转', async () => {
    useFriendsStore.setState({ removeFriend: vi.fn(async () => { throw new Error('boom') }) })
    renderView()
    await screen.findByText('早睡早起')
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    screen.getByRole('button', { name: '删除好友' }).click()
    expect(await screen.findByText(/删除好友失败/)).toBeInTheDocument()
    expect(screen.getByText(/boom/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除好友' })).not.toBeDisabled()
    expect(testRouter?.state.location.pathname).toBe('/app/contacts/friends/alice')
  })

  it('资料接口失败时显示错误，但好友本地信息（名字/发消息）仍在', async () => {
    vi.spyOn(profileApi, 'getPublicProfile').mockRejectedValue(new Error('boom'))
    renderView()
    expect(await screen.findByText(/资料加载失败/)).toBeInTheDocument()
    expect(screen.getByText('小爱')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '发消息' })).toBeInTheDocument()
  })

  it('拉黑：确认后调 addBlacklist(userId)；取消不调', async () => {
    renderView()
    await screen.findByText('早睡早起')
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    screen.getByRole('button', { name: '拉黑' }).click()
    expect(useFriendsStore.getState().addBlacklist).not.toHaveBeenCalled()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    screen.getByRole('button', { name: '拉黑' }).click()
    await waitFor(() => expect(useFriendsStore.getState().addBlacklist).toHaveBeenCalledWith('alice'))
  })
  it('已拉黑的好友显示「取消拉黑」，点击直接调 removeBlacklist（不弹确认）', async () => {
    useFriendsStore.setState({ friends: [{ ...useFriendsStore.getState().friends[0], is_blacklisted: true }] })
    renderView()
    await screen.findByText('早睡早起')
    expect(screen.queryByRole('button', { name: '拉黑' })).toBeNull()
    screen.getByRole('button', { name: '取消拉黑' }).click()
    await waitFor(() => expect(useFriendsStore.getState().removeBlacklist).toHaveBeenCalledWith('alice'))
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('拉黑失败：显示错误行', async () => {
    useFriendsStore.setState({ addBlacklist: vi.fn(async () => { throw new Error('boom') }) })
    renderView()
    await screen.findByText('早睡早起')
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    screen.getByRole('button', { name: '拉黑' }).click()
    expect(await screen.findByText(/操作失败/)).toHaveTextContent('boom')
  })
})
