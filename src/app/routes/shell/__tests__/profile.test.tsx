import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import ProfileRoute from '../profile'

// ProfileModal 本身（资料查看/编辑）不是本文件要测的东西——这里只测 /app/profile
// 路由的关闭规则是否正确复用了 RouteDialog.useRouteDialogClose。换成探针，
// isOpen 时渲染一个可点击的关闭按钮，把 onClose 原样转发出去。
vi.mock('@/features/profile/components/ProfileModal', () => ({
  default: (props: { isOpen: boolean; onClose: () => void }) =>
    props.isOpen ? (
      <button type="button" onClick={props.onClose}>
        close-probe
      </button>
    ) : null,
}))

/**
 * `EmptyContent` 本身按今天的实现继续在弹窗后面真实渲染（ProfileRoute 没有改
 * 这一点）；换成直通 mock 的是 framer-motion 这一层，不是 EmptyContent——同
 * `GroupList.test.tsx` 的理由与写法：`EmptyContent` 内部的 `motion.div` 带
 * `initial`/`animate` 淡入，真实动画在断言完成、测试清理卸载组件时通常还没
 * 播完，happy-dom 的 `Animation.cancel()` 会抛一个不会被任何人 catch 的
 * `AbortError`（已实测复现：不加这层 mock，`bun run test` 对本文件报
 * "Vitest caught 2 unhandled errors"，退出码非 0，即便两条用例本身都通过）。
 * 与本文件要验证的关闭规则无关，纯粹是 happy-dom 对 Web Animations API 的
 * 实现细节。直通渲染成普通标签，不影响 EmptyContent 的文案/结构。
 */
vi.mock('framer-motion', async () => {
  const react = await import('react')
  type MotionProps = Record<string, unknown> & { children?: unknown }
  const stripMotionProps = ({
    initial: _initial,
    animate: _animate,
    exit: _exit,
    variants: _variants,
    transition: _transition,
    custom: _custom,
    layout: _layout,
    layoutId: _layoutId,
    children,
    ...rest
  }: MotionProps) => ({ rest, children })
  const passthrough = (tag: string) =>
    function MockMotionComponent(props: MotionProps) {
      const { rest, children } = stripMotionProps(props)
      return react.createElement(tag, rest, children as React.ReactNode)
    }
  return {
    motion: new Proxy({} as Record<string, unknown>, {
      get: (_target, tag: string) => passthrough(tag),
    }),
    AnimatePresence: ({ children }: MotionProps) => children,
  }
})

function mount(entries: string[]) {
  const router = createMemoryRouter(
    [
      { path: '/app/chat', element: <div>chat-home</div> },
      { path: '/app/profile', element: <ProfileRoute /> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('/app/profile 的关闭规则（复用 RouteDialog 的 useRouteDialogClose，不再自己复制一份）', () => {
  it('从站内进入：关闭 = 后退一步', async () => {
    const router = mount(['/app/chat', '/app/profile'])
    fireEvent.click(await screen.findByText('close-probe'))
    expect(router.state.location.pathname).toBe('/app/chat')
    expect(router.state.historyAction).toBe('POP')
  })

  it('直接打开（没有来路）：关闭 = replace 到 /app/chat（正对照：historyAction 是 REPLACE 不是上面那条的 POP）', async () => {
    const router = mount(['/app/profile'])
    fireEvent.click(await screen.findByText('close-probe'))
    expect(router.state.location.pathname).toBe('/app/chat')
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
