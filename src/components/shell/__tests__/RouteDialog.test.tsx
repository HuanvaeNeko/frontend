import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RouteDialog } from '../RouteDialog'

function mount(entries: string[]) {
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
  it('从站内进入：关闭 = 后退一步', async () => {
    const router = mount(['/app/chat', '/app/files'])
    expect(await screen.findByText('files-body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close|关闭/i }))
    expect(router.state.location.pathname).toBe('/app/chat')
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
