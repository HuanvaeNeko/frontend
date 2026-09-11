import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AccountSection } from '../AccountSection'

vi.mock('@/features/settings/components/PrivacySettings', () => ({ default: () => <div data-testid="privacy" /> }))
vi.mock('@/features/settings/components/DevicesPage', () => ({ default: () => <div data-testid="devices" /> }))
vi.mock('../BlacklistPanel', () => ({ BlacklistPanel: () => <div data-testid="blacklist" /> }))
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

describe('AccountSection', () => {
  it('四个分区都在：隐私 / 设备 / 黑名单 / 账户；修改密码行链接到 /app/profile', () => {
    render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <AccountSection /> }], { initialEntries: ['/app/settings/account'] })} />)
    expect(screen.getByTestId('privacy')).toBeInTheDocument()
    expect(screen.getByTestId('devices')).toBeInTheDocument()
    expect(screen.getByTestId('blacklist')).toBeInTheDocument()
    expect(screen.getByText('黑名单')).toBeInTheDocument()
    expect(screen.getByText('修改密码')).toBeInTheDocument()
    expect(screen.getByText('在资料对话框中修改')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '前往' })).toHaveAttribute('href', '/app/profile')
    expect(screen.getByRole('button', { name: /退出登录/ })).toBeInTheDocument()
  })
})
