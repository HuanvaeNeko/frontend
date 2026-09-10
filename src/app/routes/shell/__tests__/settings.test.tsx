import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewport } from '@/components/shell/__tests__/viewportStub'
import SettingsIndex from '../settings'

const mount = () => {
  const router = createMemoryRouter(
    [{ path: '/app/settings', element: <SettingsIndex />, children: [{ path: ':section', element: <div>SECTION</div> }] }],
    { initialEntries: ['/app/settings'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('/app/settings 索引', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('桌面：自动跳到 appearance', async () => {
    stubViewport(1440)
    const router = mount()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/app/settings/appearance'))
  })
  it('折叠：停在 /app/settings（列表栏显示分区列表），不跳', async () => {
    stubViewport(390)
    const router = mount()
    await new Promise((r) => setTimeout(r, 20))
    expect(router.state.location.pathname).toBe('/app/settings')
  })
})
