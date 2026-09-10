import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miniappsApi } from '../miniapps'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const MINIAPP = { miniapp_id: 'app_1', name: 'todo', display_name: '待办事项', description: '简单的待办清单', icon_url: 'apps/x/icon.png', access_url: '/apps/todo/index.html', status: 'published' }

describe('miniappsApi.listMy', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())

  it('打同源 GET /api/miniapps/my，只保留七个字段', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [{ ...MINIAPP, icon_url: null }] }))
    const apps = await miniappsApi.listMy()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/miniapps/my')
    expect(apps).toEqual([{ miniapp_id: 'app_1', name: 'todo', display_name: '待办事项', description: '简单的待办清单', icon_url: null, access_url: '/apps/todo/index.html', status: 'published' }])
  })

  it('icon_url 相对路径经 toAbsoluteApiUrl 落成同源绝对地址，access_url 原样保留', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [MINIAPP] }))
    const [app] = await miniappsApi.listMy()
    expect(app.icon_url).toBe(`${location.origin}/apps/x/icon.png`)
    expect(app.access_url).toBe('/apps/todo/index.html')
  })

  it('缺必需字段（access_url）抛错，不静默吞成 undefined', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [{ ...MINIAPP, access_url: undefined }] }))
    await expect(miniappsApi.listMy()).rejects.toThrow()
  })

  it('HTTP 200 但 success:false 透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 403, error: '无权限' }))
    await expect(miniappsApi.listMy()).rejects.toThrow(/无权限/)
  })
})
