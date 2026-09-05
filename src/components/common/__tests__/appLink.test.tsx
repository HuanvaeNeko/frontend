import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { AppLink } from '../AppLink'

function renderAt(path: string, ui: React.ReactNode, routePath = '*') {
  const router = createMemoryRouter(
    [{ path: routePath, element: ui }],
    { initialEntries: [path] }
  )
  return render(<RouterProvider router={router} />)
}

describe('AppLink', () => {
  it('渲染出 href 生效、且透传 className/children 的 <a>', () => {
    renderAt(
      '/app/chat',
      <AppLink href="/app/friends" className="nav-link">
        去好友
      </AppLink>
    )
    const a = screen.getByRole('link', { name: '去好友' })
    expect(a).toHaveAttribute('href', '/app/friends')
    expect(a).toHaveClass('nav-link')
  })

  it('点击后会跳转到 href 对应的路径', async () => {
    function Probe() {
      return (
        <>
          <span data-testid="p">{useLocation().pathname}</span>
          <AppLink href="/app/friends">去好友</AppLink>
        </>
      )
    }
    renderAt('/app/chat', <Probe />)
    await userEvent.click(screen.getByText('去好友'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/friends')
  })
})
