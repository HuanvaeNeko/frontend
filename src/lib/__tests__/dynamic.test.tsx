import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { dynamic } from '../dynamic'

function Hello() { return <span data-testid="hello">hello</span> }

describe('dynamic', () => {
  it('最终渲染出被懒加载的组件', async () => {
    const Lazy = dynamic(() => Promise.resolve({ default: Hello }))
    render(<Lazy />)
    await waitFor(() => expect(screen.getByTestId('hello')).toBeInTheDocument())
  })

  it('支持 loading 占位（与 next/dynamic 的 loading 选项等价）', async () => {
    const Lazy = dynamic(
      () => new Promise<{ default: typeof Hello }>((r) => setTimeout(() => r({ default: Hello }), 50)),
      { loading: () => <span data-testid="loading">loading</span> },
    )
    render(<Lazy />)
    await waitFor(() => expect(screen.getByTestId('hello')).toBeInTheDocument())
  })

  it('把 props 透传给目标组件', async () => {
    function Greet({ name }: { name: string }) { return <span data-testid="g">{name}</span> }
    const Lazy = dynamic<{ name: string }>(() => Promise.resolve({ default: Greet }))
    render(<Lazy name="huanvae" />)
    await waitFor(() => expect(screen.getByTestId('g')).toHaveTextContent('huanvae'))
  })
})
