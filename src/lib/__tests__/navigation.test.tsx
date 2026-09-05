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

  it('replace 会覆盖当前历史记录，back 不会回到被替换前的路径', async () => {
    function Probe() {
      const router = useRouter()
      return (
        <>
          <span data-testid="p">{usePathname()}</span>
          <button onClick={() => router.push('/app/friends')}>push</button>
          <button onClick={() => router.replace('/app/groups')}>replace</button>
          <button onClick={() => router.back()}>back</button>
        </>
      )
    }
    renderAt('/app/chat', <Probe />)
    // push 产生一条新历史记录：/app/chat -> /app/friends
    await userEvent.click(screen.getByText('push'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/friends')
    // replace 覆盖当前记录，而不是新增一条：栈变为 /app/chat -> /app/groups
    await userEvent.click(screen.getByText('replace'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/groups')
    // 如果 replace 误写成 push（丢了 { replace: true }），栈会是
    // /app/chat -> /app/friends -> /app/groups，back 会先回到 /app/friends 而非 /app/chat。
    await userEvent.click(screen.getByText('back'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/chat')
  })

  it('back 会回到上一个路径（对应 not-found.tsx 的返回按钮）', async () => {
    function Probe() {
      const router = useRouter()
      return (
        <>
          <span data-testid="p">{usePathname()}</span>
          <button onClick={() => router.push('/app/friends')}>go</button>
          <button onClick={() => router.back()}>back</button>
        </>
      )
    }
    renderAt('/app/chat', <Probe />)
    await userEvent.click(screen.getByText('go'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/friends')
    await userEvent.click(screen.getByText('back'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/chat')
  })

  it('forward 会前进到被 back 离开的路径', async () => {
    function Probe() {
      const router = useRouter()
      return (
        <>
          <span data-testid="p">{usePathname()}</span>
          <button onClick={() => router.push('/app/friends')}>go</button>
          <button onClick={() => router.back()}>back</button>
          <button onClick={() => router.forward()}>forward</button>
        </>
      )
    }
    renderAt('/app/chat', <Probe />)
    await userEvent.click(screen.getByText('go'))
    await userEvent.click(screen.getByText('back'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/chat')
    await userEvent.click(screen.getByText('forward'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/friends')
  })

  it('暴露 refresh / prefetch（仓库内无调用点，仅验证签名完整性）', () => {
    function Probe() {
      const r = useRouter()
      const ok = ['refresh', 'prefetch']
        .every((k) => typeof (r as Record<string, unknown>)[k] === 'function')
      return <span data-testid="ok">{String(ok)}</span>
    }
    renderAt('/app/chat', <Probe />)
    expect(screen.getByTestId('ok')).toHaveTextContent('true')
  })
})
