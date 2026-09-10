import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { useShellTab } from '../shellTab'

function renderAt(pathname: string) {
  return renderHook(() => useShellTab(), {
    wrapper: ({ children }: { children: ReactNode }) => {
      const router = createMemoryRouter([{ path: '*', element: children }], { initialEntries: [pathname] })
      return <RouterProvider router={router} />
    },
  })
}

/**
 * 覆盖评审 Finding 1 的修复：`typeof window === 'undefined'` 从水合那一帧起就已经是
 * false（水合本身就是客户端的第一次渲染），sessionStorage 记的是 contacts 时，服务端
 * 渲染 chat、客户端首帧却渲染 contacts —— AppShell 按 tab 渲染结构不同的列表栏子树
 * （ContactsList vs ChatListColumn），是真正的 hydration mismatch。改用 useHydrated()
 * 门控后，测试里 RTL 的 render() 是纯客户端渲染（不是 hydrateRoot），useHydrated() 从
 * 第一次渲染起就是 true，所以这里可以直接断言 render 后的结果，不需要等第二帧。
 */
describe('useShellTab：水合后才读记住的 tab（不再用 typeof window 门控）', () => {
  beforeEach(() => sessionStorage.clear())

  it('/app/files + 记住 contacts：结算成 contacts', () => {
    sessionStorage.setItem('huanvae.shell-tab', 'contacts')
    const { result } = renderAt('/app/files')
    expect(result.current).toBe('contacts')
  })

  it('正对照：/app/chat/f-alice 恒返回 chat，不管记忆是什么（路径判定优先于记忆）', () => {
    sessionStorage.setItem('huanvae.shell-tab', 'contacts')
    const { result } = renderAt('/app/chat/f-alice')
    expect(result.current).toBe('chat')
  })

  it('渲染 /app/contacts 把 contacts 写进 sessionStorage（记住效果）', () => {
    renderAt('/app/contacts')
    expect(sessionStorage.getItem('huanvae.shell-tab')).toBe('contacts')
  })
})
