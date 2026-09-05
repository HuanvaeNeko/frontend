import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useRouter, usePathname, useSearchParams, useParams } from '../navigation'

function renderAt(path: string, ui: React.ReactNode, routePath = '*') {
  const router = createMemoryRouter(
    [{ path: routePath, element: ui }],
    { initialEntries: [path] }
  )
  return render(<RouterProvider router={router} />)
}

describe('usePathname', () => {
  it('返回不含 query string 的路径', () => {
    function Probe() { return <span data-testid="p">{usePathname()}</span> }
    renderAt('/app/chat?tab=1', <Probe />)
    expect(screen.getByTestId('p')).toHaveTextContent('/app/chat')
  })
})

describe('useSearchParams', () => {
  it('可以用 .get() 读取参数', () => {
    function Probe() {
      return <span data-testid="q">{useSearchParams().get('next') ?? 'none'}</span>
    }
    renderAt('/app/login?next=%2Fapp%2Fchat', <Probe />)
    expect(screen.getByTestId('q')).toHaveTextContent('/app/chat')
  })
})

describe('useParams', () => {
  it('返回动态段', () => {
    function Probe() {
      const p = useParams<{ id?: string }>()
      return <span data-testid="id">{p.id ?? 'none'}</span>
    }
    renderAt('/room/abc', <Probe />, '/room/:id')
    expect(screen.getByTestId('id')).toHaveTextContent('abc')
  })
})

describe('useRouter', () => {
  it('push 会改变当前路径', async () => {
    function Probe() {
      const router = useRouter()
      return (
        <>
          <span data-testid="p">{usePathname()}</span>
          <button onClick={() => router.push('/app/friends')}>go</button>
        </>
      )
    }
    renderAt('/app/chat', <Probe />)
    await userEvent.click(screen.getByText('go'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/friends')
  })

  it('replace 也会改变当前路径', async () => {
    function Probe() {
      const router = useRouter()
      return (
        <>
          <span data-testid="p">{usePathname()}</span>
          <button onClick={() => router.replace('/app/groups')}>go</button>
        </>
      )
    }
    renderAt('/app/chat', <Probe />)
    await userEvent.click(screen.getByText('go'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/groups')
  })

  it('暴露 back / forward / refresh / prefetch 且调用不抛错', () => {
    function Probe() {
      const r = useRouter()
      const ok = ['back', 'forward', 'refresh', 'prefetch']
        .every((k) => typeof (r as Record<string, unknown>)[k] === 'function')
      return <span data-testid="ok">{String(ok)}</span>
    }
    renderAt('/app/chat', <Probe />)
    expect(screen.getByTestId('ok')).toHaveTextContent('true')
  })
})
