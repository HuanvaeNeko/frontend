import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiShapeError } from '@/lib/apiEnvelope'
import { botsApi } from '../bots'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const BOT = { bot_user_id: 'bot_1', username: 'helper', nickname: '小助手', description: '帮忙', commands: [], webhook_url: null, can_join_groups: true, is_active: true, message_policy: 'all', message_whitelist: [], is_discoverable: true, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }

describe('botsApi.listMyBots', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())

  it('打同源 GET /api/bots，只保留六个字段', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [BOT] }))
    const bots = await botsApi.listMyBots()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/bots')
    expect(bots).toEqual([{ bot_user_id: 'bot_1', username: 'helper', nickname: '小助手', description: '帮忙', is_active: true, created_at: '2026-09-01T00:00:00Z' }])
  })

  it('缺必需字段（bot_user_id）抛 ApiShapeError，不静默吞成 undefined，也不绕开 [api-shape] 上报（终审 finding #7）', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [{ ...BOT, bot_user_id: undefined }] }))
    await expect(botsApi.listMyBots()).rejects.toBeInstanceOf(ApiShapeError)
  })

  it('HTTP 200 但 success:false 透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 403, error: '无权限' }))
    await expect(botsApi.listMyBots()).rejects.toThrow(/无权限/)
  })
})
