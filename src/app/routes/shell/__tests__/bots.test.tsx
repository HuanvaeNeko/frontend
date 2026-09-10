import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { botsApi } from '@/features/bots/api/bots'
import BotsRoute from '../bots'

// `EmptyContent` 不是本文件要测的东西（它在弹窗路由下恒渲染在内容区背后，与机器人
// 列表/对话框的断言无关），换成探针避免动画噪音：它内部的 framer-motion `motion.div`
// 带 `initial`/`animate` 淡入，happy-dom 的 WAAPI polyfill 在这个淡入动画还没播完时
// 就被 RTL `cleanup()` 卸载打断，`Animation.cancel()` 会抛一个没人接的 `AbortError`，
// 表现为 vitest 的 Unhandled Rejection（与本文件的断言无关，纯粹是测试环境噪音）。
vi.mock('@/components/shell/EmptyContent', () => ({
  EmptyContent: () => null,
}))

/**
 * 不 mock `@/i18n/I18nProvider` 的话，`useI18n()` 在没有 `<I18nProvider>` 包裹时
 * 落到 context 默认值 `t: (key) => key`——恒等 mock 会让下面断言字面中文
 * （运行中 / 还没有机器人 / 重试）的用例落空。对真实 zhCN 字典做路径查找，
 * 与 UnifiedList.test.tsx 同一个写法。
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

const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/app/bots', element: <BotsRoute /> }], { initialEntries: ['/app/bots'] })} />)

describe('/app/bots 模态框', () => {
  afterEach(() => vi.restoreAllMocks())

  it('列出机器人：昵称、@username、运行状态', async () => {
    vi.spyOn(botsApi, 'listMyBots').mockResolvedValue([{ bot_user_id: 'b1', username: 'helper', nickname: '小助手', description: '帮忙', is_active: true, created_at: '2026-09-01T00:00:00Z' }])
    mount()
    expect(await screen.findByText('小助手')).toBeInTheDocument()
    expect(screen.getByText('@helper')).toBeInTheDocument()
    expect(screen.getByText('运行中')).toBeInTheDocument()
  })

  // 分两次 mount：第一次只看空态；第二次（全新实例）让首次请求就失败，看错误态 +
  // 点「重试」后 listMyBots 真的被再次调用（mockClear 之后从 0 数起，恰好数到"第二次"）。
  it('空列表给空态；失败给可重试的错误', async () => {
    const spy = vi.spyOn(botsApi, 'listMyBots').mockResolvedValueOnce([])
    mount()
    expect(await screen.findByText('还没有机器人')).toBeInTheDocument()

    spy.mockClear()
    spy.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([])
    mount()
    expect(await screen.findByText(/加载失败/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
