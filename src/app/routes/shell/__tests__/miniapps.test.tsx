import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { miniappsApi } from '@/features/miniapps/api/miniapps'
import { oauthApi } from '@/features/oauth/api/oauth'
import MiniappsRoute from '../miniapps'

// `EmptyContent` 不是本文件要测的东西，原因同 bots.test.tsx：换成探针避免 framer-motion
// 淡入动画在 RTL cleanup() 卸载时抛出没人接的 AbortError（vitest Unhandled Rejection 噪音）。
vi.mock('@/components/shell/EmptyContent', () => ({
  EmptyContent: () => null,
}))

/**
 * 不 mock `@/i18n/I18nProvider` 的话，`useI18n()` 在没有 `<I18nProvider>` 包裹时
 * 落到 context 默认值 `t: (key) => key`——恒等 mock 会让下面断言字面中文落空。
 * 对真实 zhCN 字典做路径查找，与 bots.test.tsx 同一个写法。
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

const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/app/miniapps', element: <MiniappsRoute /> }], { initialEntries: ['/app/miniapps'] })} />)

describe('/app/miniapps 模态框的两个 tab', () => {
  afterEach(() => vi.restoreAllMocks())
  it('默认显示我的小程序；切到「OAuth 客户端」才拉客户端列表', async () => {
    vi.spyOn(miniappsApi, 'listMy').mockResolvedValue([])
    const clients = vi.spyOn(oauthApi, 'listClients').mockResolvedValue([])
    mount()
    expect(await screen.findByText('还没有小程序')).toBeInTheDocument()
    expect(clients).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'OAuth 客户端' }))
    expect(await screen.findByText('还没有 OAuth 客户端')).toBeInTheDocument()
    expect(clients).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('tab', { name: 'OAuth 客户端' })).toHaveAttribute('aria-selected', 'true')
  })
})
