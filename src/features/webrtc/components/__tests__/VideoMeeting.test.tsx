import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'framer-motion'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl, setApiBaseUrl, clearApiBaseUrl } from '@/lib/apiConfig'
import { webrtcApi } from '../../api/webrtc'
import VideoMeeting from '../VideoMeeting'

/**
 * 加入房间时发给后端的 `avatar_url` 的**形状**。
 *
 * 契约在 `backend-docs/webrtc/WebRTC房间.md:154`（`POST /api/webrtc/rooms/{room_id}/join`
 * 的请求体），逐字是
 *   `"avatar_url": "avatars/guest.png?t=1706000000"  // 可选，头像相对路径`
 * 创建房间的 :72 同样写「可选，创建者头像相对路径」。后端把这个值原样转发给房间里
 * 的每一个人（join 响应 `user_info` :181、`joined` 名单 :265、`peer_joined` :302
 * 三处样例都是相对路径），所以形状发错，坏的是**别人**屏幕上的图，而且在服务端留了痕。
 *
 * 而 store 里存的是**绝对地址**（`authStore` 登录时补基址，与 friends / groups /
 * discovery / profile 四个 api 出口同一条约定）。这条用例钉的就是这两者之间那一次转换：
 * 把 `toApiRelativePath(...)` 改回 `user?.avatar_url || undefined`，本条红。
 */

const ROOM_ID = 'ABC123'

// 本组件用 framer-motion 的 WAAPI 动画，卸载时 `Animation.cancel()` 在 happy-dom 里
// 会抛一个**异步**的 AbortError，被 vitest 记成 unhandled rejection（进程退出码非 0，
// 但没有任何一条用例红）。跳过动画本身，与被测行为无关。
MotionGlobalConfig.skipAnimations = true

const renderMeeting = () =>
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '/app/webrtc/:roomId', element: <VideoMeeting /> }], {
        initialEntries: [`/app/webrtc/${ROOM_ID}?pwd=123456&name=alice`],
      })}
    />,
  )

const fakeSocket = () =>
  ({
    close: vi.fn(),
    send: vi.fn(),
    readyState: 1,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  }) as unknown as WebSocket

let joinRoom: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(webrtcApi, 'createSignalingConnection').mockReturnValue(fakeSocket())
  joinRoom = vi.spyOn(webrtcApi, 'joinRoom').mockResolvedValue({
    participant_id: 'p_1',
    ws_token: 'WS',
    ice_servers: [{ urls: ['stun:stun.l.google.com:19302'] }],
    token_expires_at: '2026-12-06T12:10:00Z',
    user_info: { user_id: 'alice', nickname: 'alice', avatar_url: null, is_authenticated: true },
  })
})

afterEach(() => {
  clearApiBaseUrl()
  useAuthStore.setState({ user: null })
  vi.restoreAllMocks()
})

describe('VideoMeeting 加入房间时发出的 avatar_url', () => {
  it('发的是相对路径，不是 store 里那个绝对地址', async () => {
    useAuthStore.setState({
      user: { user_id: 'alice', avatar_url: `${getApiBaseUrl()}/avatars/alice.png?t=1706000000` },
    })

    renderMeeting()

    await waitFor(() => expect(joinRoom).toHaveBeenCalled())
    expect(joinRoom).toHaveBeenCalledWith(
      ROOM_ID,
      expect.objectContaining({ avatar_url: 'avatars/alice.png?t=1706000000' }),
    )
  })

  it('基址被指到本地反代时，发出去的仍然是相对路径 —— 别人连不上 127.0.0.1', async () => {
    // 本项目会**故意**改基址（api.huanvae.cn 被备案拦截时走本地无 SNI 反代），
    // 这正是 `huanvae.api-base-url` 被判成设备级键的原因。原来那份实现会把
    // `http://127.0.0.1:8787/avatars/alice.png` 发给信令服务器，再由后端转给房间里
    // 每一个人当头像地址。
    setApiBaseUrl('http://127.0.0.1:8787')
    useAuthStore.setState({
      user: { user_id: 'alice', avatar_url: 'http://127.0.0.1:8787/avatars/alice.png?t=1' },
    })

    renderMeeting()

    await waitFor(() => expect(joinRoom).toHaveBeenCalled())
    const payload = joinRoom.mock.calls[0]?.[1] as { avatar_url?: string }
    expect(payload.avatar_url).toBe('avatars/alice.png?t=1')
    expect(payload.avatar_url).not.toContain('127.0.0.1')
  })

  it('已部署用户落盘的相对路径原样发出（迁移跑之前的那一批）', async () => {
    // `auth-storage` 的 migrate 是本分支才加的，已部署用户的落盘值仍是相对路径。
    // 两种落盘形状发出去必须逐字相同，否则这条转换本身成了新的漂移源。
    useAuthStore.setState({
      user: { user_id: 'alice', avatar_url: 'avatars/alice.png?t=1706000000' },
    })

    renderMeeting()

    await waitFor(() => expect(joinRoom).toHaveBeenCalled())
    expect(joinRoom).toHaveBeenCalledWith(
      ROOM_ID,
      expect.objectContaining({ avatar_url: 'avatars/alice.png?t=1706000000' }),
    )
  })

  it('没有头像时不带这个字段（文档写的是可选）', async () => {
    useAuthStore.setState({ user: { user_id: 'alice' } })

    renderMeeting()

    await waitFor(() => expect(joinRoom).toHaveBeenCalled())
    const payload = joinRoom.mock.calls[0]?.[1] as { avatar_url?: string }
    expect(payload.avatar_url).toBeUndefined()
  })
})
