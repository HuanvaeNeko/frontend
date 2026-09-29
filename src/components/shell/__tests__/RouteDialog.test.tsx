import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { RouteDialog } from '../RouteDialog'

function mount(entries: Array<string | { pathname: string; key: string }>) {
  const router = createMemoryRouter(
    [
      { path: '/app/chat', element: <div>chat-home</div> },
      { path: '/app/files', element: <RouteDialog title="我的文件"><div>files-body</div></RouteDialog> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('RouteDialog 的关闭规则', () => {
  afterEach(() => {
    window.history.replaceState(null, '')
  })

  it('从站内进入：关闭 = 后退一步', async () => {
    const router = mount(['/app/chat', '/app/files'])
    expect(await screen.findByText('files-body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close|关闭/i }))
    expect(router.state.location.pathname).toBe('/app/chat')
    // 与 replace 区分开：真的是后退（POP），不是恰好 replace 到了同一个地址
    expect(router.state.historyAction).toBe('POP')
  })

  it('直接打开、但首条记录已被 <ScrollRestoration> 补了随机 key（浏览器里的真实情况）：仍 replace 到 /app/chat，不后退出站', async () => {
    // 浏览器里 RR 在 history.state 记 idx；ScrollRestoration 的内联脚本在水合前给首条记录补 key，
    // 于是 location.key 永远不是 'default'——原实现据此 back()，直接打开的弹窗一关就退到 about:blank
    window.history.replaceState({ key: 'r4nd0m', idx: 0 }, '')
    const router = mount([{ pathname: '/app/files', key: 'r4nd0m' }])
    expect(await screen.findByText('files-body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close|关闭/i }))
    expect(router.state.location.pathname).toBe('/app/chat')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('直接打开（没有来路）：关闭 = replace 到 /app/chat', async () => {
    const router = mount(['/app/files'])
    expect(await screen.findByText('files-body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close|关闭/i }))
    expect(router.state.location.pathname).toBe('/app/chat')
    // 正对照：历史栈没有增长（replace 而不是 push）
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
