import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'framer-motion'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
import { webrtcApi } from '../../api/webrtc'
import VideoMeeting from '../VideoMeeting'

/**
 * 英文界面下会议页是英文：报错页、权限引导、控制栏按钮的可读名称、媒体报错（parseMediaError）。
 *
 * t 直接查 en-US 字典、**不回落中文**（缺 key 原样吐 key，按英文找元素的断言会红）。
 * 每条用例最后再查一遍整页 innerHTML 里没有汉字——title / aria-label 里写死的中文也逃不掉。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((node, k) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[k] : undefined), messages['en-US'])
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? `{${k}}`)) : key
  }
  return { useI18n: () => ({ locale: 'en-US', t }) }
})

// 同 VideoMeeting.test.tsx：卸载时 WAAPI 动画的 cancel() 在 happy-dom 里抛异步 AbortError
MotionGlobalConfig.skipAnimations = true

const CJK = /[一-鿿]/

const fakeSocket = () =>
  ({ close: vi.fn(), send: vi.fn(), readyState: 1, onopen: null, onmessage: null, onclose: null, onerror: null }) as unknown as WebSocket

const renderAt = (path: string, entry: string) =>
  render(<RouterProvider router={createMemoryRouter([{ path, element: <VideoMeeting /> }], { initialEntries: [entry] })} />)

let socket: WebSocket

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  socket = fakeSocket()
  vi.spyOn(webrtcApi, 'createSignalingConnection').mockReturnValue(socket)
  vi.spyOn(webrtcApi, 'joinRoom').mockResolvedValue({
    participant_id: 'p_1',
    ws_token: 'WS',
    ice_servers: [{ urls: ['stun:stun.l.google.com:19302'] }],
    token_expires_at: '2026-12-06T12:10:00Z',
    user_info: { user_id: 'alice', nickname: 'alice', avatar_url: null, is_authenticated: true },
  })
})

afterEach(() => {
  // 用例里给 navigator 挂的 mediaDevices 是自有属性，删掉就回到 happy-dom 原样
  delete (navigator as { mediaDevices?: unknown }).mediaDevices
  useAuthStore.setState({ user: null })
  vi.restoreAllMocks()
})

describe('VideoMeeting 英文界面', () => {
  it('链接里没有房间号：报错页是英文', async () => {
    renderAt('/app/video-meeting', '/app/video-meeting')

    expect(await screen.findByText("Can't join the meeting")).toBeInTheDocument()
    expect(screen.getByText('Room ID is missing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to chat' })).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })

  it('摄像头被拒：权限引导、媒体报错、控制栏按钮名称都是英文', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: async () => [{ kind: 'videoinput' }, { kind: 'audioinput' }],
        getUserMedia: async () => { throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }) },
      },
    })
    renderAt('/app/webrtc/:roomId', '/app/webrtc/ABC123?pwd=123456&name=alice')

    await waitFor(() => expect(typeof socket.onopen).toBe('function'))
    act(() => { (socket.onopen as () => void)() })

    // parseMediaError 的 denied 分支 → 权限引导弹窗
    const dialog = await screen.findByRole('dialog', { name: 'Media permission denied' })
    expect(dialog).toHaveTextContent('Permission to use the camera was denied')
    expect(dialog).toHaveTextContent('Click the lock icon at the left of the address bar')
    // 占位符换成了 <code>，不是把 {file} / {policy} 原样露出来
    expect(screen.getByText('_headers').tagName).toBe('CODE')
    expect(dialog).toHaveTextContent(
      'If the site is deployed on Cloudflare Pages, make sure the Permissions-Policy in _headers includes camera=(self), microphone=(self).',
    )
    expect(document.body.innerHTML).not.toMatch(CJK)

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // 控制栏 3 秒无操作会收起：动一下鼠标让它回来，再找按钮
    fireEvent.mouseMove(window)
    // 拿不到媒体流 → 静音、关摄像头，所以按钮是「打开」
    expect(screen.getByRole('button', { name: 'Turn on microphone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on camera' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share screen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Screen sharing settings' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Leave meeting' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Participants (1)' })).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })

  it('房间被关闭：报错页带上后端给的原因', async () => {
    renderAt('/app/webrtc/:roomId', '/app/webrtc/ABC123?pwd=123456&name=alice')

    await waitFor(() => expect(typeof socket.onmessage).toBe('function'))
    act(() => { (socket.onopen as () => void)() })
    act(() => {
      (socket.onmessage as (e: MessageEvent) => void)(new MessageEvent('message', { data: JSON.stringify({ type: 'room_closed', reason: 'host_left' }) }))
    })

    expect(await screen.findByText('The room was closed: host_left')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })
})
