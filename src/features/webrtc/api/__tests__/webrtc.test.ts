import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveLocale } from '@/i18n/translate'
import { webrtcApi } from '../webrtc'

/**
 * WebRTC API 的兜底报错跟随界面语言（原来写死中文，英文界面里「加入会议」失败照样弹中文）。
 * 文案在抛错那一刻用 translate() 取——切语言之后同一个请求就换语言，下面每条都中英各跑一次。
 */
const reply = (status: number, body = '') => vi.fn(async () => new Response(body, { status }))

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  setActiveLocale('zh-CN')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('webrtcApi 兜底报错跟随界面语言', () => {
  it.each([
    { status: 401, body: '', en: 'Incorrect password', zh: '密码错误' },
    { status: 404, body: '', en: 'Room not found', zh: '房间不存在' },
    // 400 且 JSON 里没给 error / message 才落到这句（非 JSON 体走的是下面那条通用兜底）
    { status: 400, body: '{}', en: 'The room has expired or is full', zh: '房间已过期或已满' },
    { status: 500, body: '', en: 'Failed to join room', zh: '加入房间失败' },
  ])('joinRoom 遇到 $status', async ({ status, body, en, zh }) => {
    vi.stubGlobal('fetch', reply(status, body))
    const join = () => webrtcApi.joinRoom('ABC123', { password: '1', display_name: 'alice' })

    setActiveLocale('en-US')
    await expect(join()).rejects.toThrow(en)
    setActiveLocale('zh-CN')
    await expect(join()).rejects.toThrow(zh)
  })

  it('createRoom / getIceServers 的兜底', async () => {
    vi.stubGlobal('fetch', reply(500))

    setActiveLocale('en-US')
    await expect(webrtcApi.createRoom()).rejects.toThrow('Failed to create room')
    await expect(webrtcApi.getIceServers()).rejects.toThrow('Failed to get the ICE server configuration')
    setActiveLocale('zh-CN')
    await expect(webrtcApi.createRoom()).rejects.toThrow('创建房间失败')
    await expect(webrtcApi.getIceServers()).rejects.toThrow('获取 ICE 服务器配置失败')
  })
})
