import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { MobileTabBar } from '../MobileTabBar'

/** t 用真实 zh-CN 字典查（恒等 mock 会让断言中文的用例全部落空，见 Sidebar.test 的注释） */
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

const realLogout = useAuthStore.getState().logout
afterEach(() => useAuthStore.setState({ logout: realLogout }))

describe('MobileTabBar「更多」', () => {
  it('手机上也能退出登录（同 APP 抽屉底部）：更多 → 退出登录 → 确认；菜单收起后确认框仍在', async () => {
    const logout = vi.fn(async () => {})
    useAuthStore.setState({ logout })
    render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <MobileTabBar activeTab="chat" /> }], { initialEntries: ['/app/chat'] })} />)

    fireEvent.click(screen.getByRole('button', { name: '更多功能' }))
    fireEvent.click(await screen.findByRole('button', { name: '退出登录' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(logout).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '退出登录' }))
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })
})
