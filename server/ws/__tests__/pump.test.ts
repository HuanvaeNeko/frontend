// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpUpstream } from '../proxy'
import { closeSessionSockets, resetSessionSocketRegistry } from '../registry'

/** 假上游：只记录被调用了什么，事件由测试手动触发 */
class FakeUpstream {
  static last: FakeUpstream | null = null
  readonly sent: unknown[] = []
  readonly closed: Array<[number | undefined, string | undefined]> = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly url: string) { FakeUpstream.last = this }
  send(data: unknown): void { this.sent.push(data) }
  close(code?: number, reason?: string): void { this.closed.push([code, reason]) }
}

function fakeClient() {
  const sent: unknown[] = []
  const closed: Array<[number | undefined, string | undefined]> = []
  return {
    sent, closed,
    send(data: string | ArrayBufferLike) { sent.push(data) },
    close(code?: number, reason?: string) { closed.push([code, reason]) },
  }
}

const upstream = () => FakeUpstream.last as FakeUpstream

describe('pumpUpstream', () => {
  beforeEach(() => {
    process.env.BFF_UPSTREAM_WS = 'ws://edge.test:8787'
    resetSessionSocketRegistry()
    FakeUpstream.last = null
    vi.stubGlobal('WebSocket', FakeUpstream)
  })

  it('token 只出现在上游 URL，浏览器侧一个字节都收不到', () => {
    const client = fakeClient()
    pumpUpstream('s1', 'AT-secret', client)
    expect(upstream().url).toBe('ws://edge.test:8787/ws?token=AT-secret')
    upstream().onopen?.()
    upstream().onmessage?.({ data: 'hello' })
    expect(JSON.stringify(client.sent)).not.toContain('AT-secret')
    expect(JSON.stringify(client.closed)).not.toContain('AT-secret')
  })

  it('上游握手完成前浏览器发的帧排队，open 后按序补发（send 在 CONNECTING 会抛）', () => {
    const pump = pumpUpstream('s1', 'AT', fakeClient())
    pump.forward('first'); pump.forward('second')
    expect(upstream().sent).toEqual([])
    upstream().onopen?.()
    expect(upstream().sent).toEqual(['first', 'second'])
    pump.forward('third')
    expect(upstream().sent).toEqual(['first', 'second', 'third'])
  })

  it('上游用可发送的 code 关闭时，如实传给浏览器', () => {
    const client = fakeClient()
    pumpUpstream('s1', 'AT', client)
    upstream().onopen?.()
    upstream().onclose?.({ code: 1011, reason: 'upstream blew up' })
    expect(client.closed).toEqual([[1011, 'upstream blew up']])
  })

  // ↓ 这一条现在红：C1。修好后绿。
  it('上游 1006/1005/1015/1001 不能原样下发：Bun 会静默改写成 1000，而 wsStore 对 1000 不重连', () => {
    for (const code of [1006, 1005, 1015, 1001]) {
      resetSessionSocketRegistry()
      const client = fakeClient()
      pumpUpstream('s1', 'AT', client)
      upstream().onopen?.()
      upstream().onclose?.({ code, reason: 'Connection ended' })
      const [[relayed]] = client.closed
      expect(relayed, `上游 ${code} 不能变成 1000/1001（那会让浏览器永不重连）`).not.toBe(1000)
      expect(relayed).not.toBe(1001)
      expect(relayed).toBe(1011)
    }
  })

  it('上游关闭后从登记表注销：随后的 logout 不会再关一次已关的连接', () => {
    const client = fakeClient()
    pumpUpstream('s1', 'AT', client)
    upstream().onopen?.()
    upstream().onclose?.({ code: 1011, reason: '' })
    const afterUpstreamClose = client.closed.length
    closeSessionSockets('s1')
    expect(client.closed.length).toBe(afterUpstreamClose)
  })

  it('二进制帧原样双向转发（聊天协议是 JSON 文本，但通道不该对二进制挑食）', () => {
    const client = fakeClient()
    const pump = pumpUpstream('s1', 'AT', client)
    upstream().onopen?.()
    const down = new Uint8Array([1, 2, 3])
    upstream().onmessage?.({ data: down })
    expect(client.sent).toEqual([down])
    const up = new Uint8Array([4, 5])
    pump.forward(up as unknown as ArrayBufferLike)
    expect(upstream().sent).toEqual([up])
  })

  it('浏览器先断：pump.close 关上游，不留悬挂连接', () => {
    const pump = pumpUpstream('s1', 'AT', fakeClient())
    pump.close(1000, 'session ended')
    expect(upstream().closed).toEqual([[1000, 'session ended']])
  })

  it('登出关掉浏览器侧连接（登记发生在 pumpUpstream 里）', () => {
    const client = fakeClient()
    pumpUpstream('s1', 'AT', client)
    closeSessionSockets('s1')
    expect(client.closed).toEqual([[1000, 'session ended']])
  })
})
