import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'framer-motion'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
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

/** t 用真实 zh-CN 字典查（带参数替换）：下面「访客加入」的用例按中文文案找元素 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return value.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? `{${k}}`))
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

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
  useAuthStore.setState({ user: null })
  vi.restoreAllMocks()
})

describe('VideoMeeting 加入房间时发出的 avatar_url', () => {
  it('发的是相对路径，不是 store 里那个绝对地址', async () => {
    // store 里的绝对地址永远是同源的（基址是硬编码空串，`toAbsoluteApiUrl` 落到
    // location.origin，见其 JSDoc）——这里手写同一个形状，而不是调用
    // getApiBaseUrl()：Task 12 之后它是空串，`${getApiBaseUrl()}/avatars/...`
    // 只会拼出一个根相对路径，不再是"绝对地址"，会让本条用例测不出它声称的东西。
    useAuthStore.setState({
      user: { user_id: 'alice', avatar_url: `${location.origin}/avatars/alice.png?t=1706000000` },
    })

    renderMeeting()

    await waitFor(() => expect(joinRoom).toHaveBeenCalled())
    expect(joinRoom).toHaveBeenCalledWith(
      ROOM_ID,
      expect.objectContaining({ avatar_url: 'avatars/alice.png?t=1706000000' }),
    )
  })

  it('落盘地址来自另一个 origin，join payload 仍然被削成相对路径', async () => {
    // 落盘的绝对地址不一定是用当前 origin 拼出来的——旧版本、旧部署、开发者
    // 当年把基址指到过本地反代，都会把这种形状的值写进 localStorage（Task 12
    // 评审 I2）。这条钉的正是 `toApiRelativePath` JSDoc 说的核心风险：拿当前
    // origin 做前缀匹配的实现会把它原样发给信令服务器，再由后端转给房间里
    // 每一个人。手写字面量而不是走 toAbsoluteApiUrl：后者现在只会产出同源地址
    // （基址已归零），测不出"异源"这一档。
    useAuthStore.setState({
      user: { user_id: 'alice', avatar_url: 'http://127.0.0.1:8787/avatars/alice.png?t=1' },
    })

    renderMeeting()

    await waitFor(() => expect(joinRoom).toHaveBeenCalled())
    const payload = joinRoom.mock.calls[0]?.[1] as { avatar_url?: string }
    expect(payload.avatar_url).toBe('avatars/alice.png?t=1')
    // 负对照：不是同源地址被削短了斜杠，是另一个 origin 被整段砍掉。
    expect(payload.avatar_url).not.toContain('127.0.0.1')
  })

  it('已部署用户落盘的相对路径原样发出（迁移跑之前的那一批）', async () => {
    // `auth-storage` 的 migrate 是本分支才加的，已部署用户的落盘值仍是相对路径。
    //
    // 这条断言钉的是「相对分支不改字节」：`avatars/alice.png?t=1706000000` 里
    // 全是 `URL` 不会重写的字符，所以它和上面那条（绝对分支）恰好给出同一个串。
    // ⚠️ 别把这条读成「两种落盘形状发出去永远逐字相同」——那句话是**错的**，
    // `toApiRelativePath` 的 JSDoc 里写着它不是逐字的逆运算：
    // `avatars/a b.png` 走绝对分支会变成 `avatars/a%20b.png`。这条用例用的路径
    // 结构上碰不到那个差异，所以它**没有能力**证伪那句话。真正把差异钉住的是
    // `lib/__tests__/apiConfig.test.ts` 的「往返**不是逐字**的」那一条。
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

describe('VideoMeeting 访客（没登录）拿着会议链接进来', () => {
  const renderLink = () =>
    render(
      <RouterProvider
        router={createMemoryRouter([{ path: '/app/video-meeting', element: <VideoMeeting /> }], {
          initialEntries: ['/app/video-meeting?room=R8K2QF&pwd=246810'],
        })}
      />,
    )

  it('先填显示名称，填好才加入，display_name 用填的名字（原来直接以「访客」进房，谁也认不出是谁）', async () => {
    useAuthStore.setState({ user: null })
    renderLink()

    const input = await screen.findByLabelText('你的名字')
    expect(joinRoom).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '  路人甲 ' } })
    fireEvent.click(screen.getByRole('button', { name: '加入会议' }))

    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith('R8K2QF', expect.objectContaining({ password: '246810', display_name: '路人甲' })))
  })

  it('正对照：已登录用户不经过这一步，直接用昵称加入', async () => {
    useAuthStore.setState({ user: { user_id: 'alice', nickname: '爱丽丝' } })
    renderLink()

    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith('R8K2QF', expect.objectContaining({ display_name: '爱丽丝' })))
    expect(screen.queryByLabelText('你的名字')).toBeNull()
  })

  it('「有账号？登录后加入」带着原会议链接去登录页', async () => {
    useAuthStore.setState({ user: null })
    renderLink()

    const link = await screen.findByRole('link', { name: /登录后加入/ })
    expect(link).toHaveAttribute('href', `/app/login?next=${encodeURIComponent('/app/video-meeting?room=R8K2QF&pwd=246810')}`)
  })
})

describe('VideoMeeting 邀请链接', () => {
  it('复制出去的是能打开的 /app/video-meeting 链接（原来少了 /app 前缀，别人点开是 404）', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const socket = fakeSocket()
    vi.spyOn(webrtcApi, 'createSignalingConnection').mockReturnValue(socket)
    useAuthStore.setState({ user: { user_id: 'alice', nickname: '爱丽丝' } })
    render(
      <RouterProvider
        router={createMemoryRouter([{ path: '/app/video-meeting', element: <VideoMeeting /> }], {
          initialEntries: ['/app/video-meeting?room=R8K2QF&pwd=246810'],
        })}
      />,
    )

    await waitFor(() => expect(typeof socket.onopen).toBe('function'))
    act(() => { (socket.onopen as () => void)() })
    fireEvent.click(await screen.findByRole('button', { name: '复制邀请链接' }))

    expect(writeText).toHaveBeenCalledWith(`${location.origin}/app/video-meeting?room=R8K2QF&pwd=246810`)
  })
})
