import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SETTINGS_SECTIONS } from '@/lib/routes'
import { SECTION_COMPONENTS, SETTINGS_SECTION_META } from '../sections'
import { SettingsSectionList } from '../SettingsSectionList'

/**
 * 不 mock `@/i18n/I18nProvider` 的话，`useI18n()` 在没有 `<I18nProvider>` 包裹时
 * 落到 context 的默认值 `t: (key) => key`——本质就是一个恒等 mock，会让下面
 * 断言字面中文（外观 / 账户与安全）的用例落空。与 `UnifiedList.test.tsx` /
 * `Sidebar.test.tsx` 同一个理由、同一个写法：对真实 `zhCN` 字典做路径查找。
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

describe('设置分区注册表', () => {
  it('六个分区与 SETTINGS_SECTIONS 同序，每个都有组件', () => {
    expect(SETTINGS_SECTION_META.map((m) => m.key)).toEqual([...SETTINGS_SECTIONS])
    for (const key of SETTINGS_SECTIONS) expect(typeof SECTION_COMPONENTS[key]).toBe('function')
  })

  it('列表栏每个分区一条链接，当前分区 aria-current', () => {
    render(<RouterProvider router={createMemoryRouter([{ path: '/app/settings/:section', element: <SettingsSectionList /> }], { initialEntries: ['/app/settings/account'] })} />)
    expect(screen.getByRole('link', { name: '外观' })).toHaveAttribute('href', '/app/settings/appearance')
    expect(screen.getByRole('link', { name: '账户与安全' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '外观' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '授权与应用' })).toHaveAttribute('href', '/app/settings/apps')
    expect(screen.getAllByRole('link')).toHaveLength(6)
  })
})
