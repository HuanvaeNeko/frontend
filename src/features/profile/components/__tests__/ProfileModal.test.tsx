import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { storageApi } from '@/api/storage'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { useProfileStore } from '../../store/profileStore'
import ProfileModal from '../ProfileModal'

/**
 * `ProfileModal` 是头像上传的**第二个**调用点，与 `ProfilePage` 逐条同构。
 *
 * 单独给它建一份用例，是因为本仓已经吃过"同一条规则只钉住 7 个站点里的 2 个"
 * 的亏：两个组件各写一份 `handleAvatarChange`、各写一份 `accept`，只测其中一个
 * 等于给另一个发了一张永不到期的通行证。这里只测**这一侧独有的风险**——
 * 接线是否真的接上了（accept、进度、四步链路、错误透传），
 * 链路本身的语义由 `profile.test.ts` 负责。
 */

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

/** 替掉 `AvatarImage` 的理由与 `ProfilePage.test.tsx` 逐字相同（happy-dom 不发请求，
 *  Radix 原件永远停在 fallback，`src` 断言不出来）。Root / Fallback 仍是真件。 */
vi.mock('@/components/ui/avatar', async () => {
  const actual = await vi.importActual<typeof import('@/components/ui/avatar')>('@/components/ui/avatar')
  const { createElement } = await import('react')
  return {
    ...actual,
    AvatarImage: (props: { src?: string }) =>
      createElement('img', { 'data-testid': 'avatar-image', ...props }),
  }
})

const renderedAvatarSrc = () =>
  document.querySelector('[data-testid="avatar-image"]')?.getAttribute('src') ?? null

const PROFILE_BASE = `${getApiBaseUrl()}/api/profile`
const STORAGE_BASE = `${getApiBaseUrl()}/api/storage`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const envelope = (data: unknown) => json({ success: true, code: 200, data })

const PROFILE_DTO = {
  user_id: 'u1',
  user_nickname: '测试用户',
  user_email: 'old@example.com',
  user_signature: '签名',
  user_avatar_url: null,
  admin: 'false',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

const SESSION = {
  mode: 'multipart',
  preview_support: 'inline_preview',
  multipart_upload_id: 'upload-id-avatar',
  expires_in: 3600,
  // 两片：第一片传完 = 50%。
  chunk_size: 2,
  total_chunks: 2,
  file_key: 'u1.png',
  max_file_size: 10485760,
  instant_upload: false,
  existing_file_url: null,
}

const CONFIRM = {
  file_url: 'avatars/u1.png?t=1706000000',
  file_key: 'u1.png',
  file_size: 4,
  content_type: 'image/png',
  preview_support: 'inline_preview',
}

const avatarFile = () => new File(['abcd'], 'me.png', { type: 'image/png' })

const fileInput = (): HTMLInputElement => {
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('找不到头像 input')
  return input
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  toastMock.mockClear()
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: null,
    isAuthenticated: true,
    tokenExpiry: Date.now() + 3600_000,
  })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
  vi.spyOn(storageApi, 'uploadChunk').mockResolvedValue(undefined)
  vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProfileModal 上传头像', () => {
  it('accept 与 ProfilePage 是同一张表（含 image/jpg 与扩展名）', async () => {
    fetchMock.mockResolvedValue(json({ success: true, code: 200, data: PROFILE_DTO }))

    render(<ProfileModal isOpen onClose={() => {}} />)
    await screen.findByDisplayValue('old@example.com')

    expect(fileInput().getAttribute('accept')).toBe(
      'image/jpeg,image/jpg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp',
    )
  })

  it('走的是四步预签名链路，上传中显示真实进度，完成后弹成功', async () => {
    let releaseSecondPart: () => void = () => {}
    const secondPart = new Promise<void>((resolve) => { releaseSecondPart = () => resolve() })
    let partUrlCalls = 0
    let profileGets = 0

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        // 上传后的那次刷新带回新头像，且是后端原样给的**相对**路径（doc:74、:98）。
        profileGets += 1
        return json({
          success: true,
          code: 200,
          data: profileGets === 1
            ? PROFILE_DTO
            : { ...PROFILE_DTO, user_avatar_url: 'avatars/u1.png?t=1706000000' },
        })
      }
      if (url === `${STORAGE_BASE}/upload/request`) return envelope(SESSION)
      if (url.startsWith(`${STORAGE_BASE}/multipart/part_url`)) {
        partUrlCalls += 1
        if (partUrlCalls === 2) await secondPart
        return envelope({
          part_url: `https://api.huanvae.cn/avatars/u1.png?partNumber=${partUrlCalls}&X-Amz-Signature=s`,
          part_number: partUrlCalls,
          expires_in: 3600,
        })
      }
      if (url === `${STORAGE_BASE}/upload/confirm`) return envelope(CONFIRM)
      throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
    })

    render(<ProfileModal isOpen onClose={() => {}} />)
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(fileInput(), avatarFile())

    try {
      // 4 字节切 2 片，第一片传完 = 50%。写死成常数或退回不确定态转圈 → 本行红。
      expect(await screen.findByText('50%')).toBeTruthy()
    } finally {
      // 见 ProfilePage 同一处：单飞锁是模块级的，卡住会让后面的用例连坐。
      releaseSecondPart()
    }

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '头像上传成功' }),
    )

    const log = fetchMock.mock.calls.map(
      (call: unknown[]) => `${(call[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(call[0])}`,
    )
    // 正对照 + 两条本批要消灭的形态（已删除的旧端点、doc:411 说不必打的回写）。
    expect(log).toContain(`POST ${STORAGE_BASE}/upload/confirm`)
    expect(log.some((line) => line.includes('/api/profile/avatar'))).toBe(false)
    expect(log.filter((line) => line.startsWith('PUT '))).toEqual([])

    // confirm 给的是相对路径（doc:408-409），补基址在 api 出口——
    // 断言落在 **DOM 的 `src`** 上：换成任何常数（实测
    // `src="avatars/BROKEN-RELATIVE.png"`）都要红。
    await waitFor(() =>
      expect(renderedAvatarSrc()).toBe(`${getApiBaseUrl()}/avatars/u1.png?t=1706000000`),
    )
  })

  it('confirm 成功后那次资料刷新 500：仍然弹成功，头像照样落到 DOM 上', async () => {
    // 与 `ProfilePage` 同一条规则的第二个站点。成功的判定点是 confirm 返回
    // （后端此刻已写回 `users."user-avatar-url"`，doc:411），不是随后那次 GET。
    // 把 `setAvatarUrl` + 成功 toast 挪回 `await loadProfile()` 之后 → 本条红。
    let profileGets = 0
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        profileGets += 1
        return profileGets === 1
          ? json({ success: true, code: 200, data: PROFILE_DTO })
          : json({ error: '服务器开小差了' }, 500)
      }
      if (url === `${STORAGE_BASE}/upload/request`) {
        return envelope({ ...SESSION, total_chunks: 1, chunk_size: 4 })
      }
      if (url.startsWith(`${STORAGE_BASE}/multipart/part_url`)) {
        return envelope({
          part_url: 'https://api.huanvae.cn/avatars/u1.png?partNumber=1&X-Amz-Signature=s',
          part_number: 1,
          expires_in: 3600,
        })
      }
      if (url === `${STORAGE_BASE}/upload/confirm`) return envelope(CONFIRM)
      throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
    })

    render(<ProfileModal isOpen onClose={() => {}} />)
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(fileInput(), avatarFile())

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '头像上传成功' }),
    )
    // 正对照：确实跑到了 confirm，那次 GET 也确实失败过（否则下面是句空话）。
    expect(fetchMock.mock.calls.map((c: unknown[]) => String(c[0]))).toContain(
      `${STORAGE_BASE}/upload/confirm`,
    )
    expect(profileGets).toBe(2)

    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '上传失败' }))
    await waitFor(() =>
      expect(renderedAvatarSrc()).toBe(`${getApiBaseUrl()}/avatars/u1.png?t=1706000000`),
    )
  })

  it('后端失败透出原文，绝不弹「成功」', async () => {
    // doc:444：真实字节超限是在 confirm **合并分片之前**被拒的，文案带真实字节数，
    // 而且「你现有的那张头像一个字节都不会被碰」。这句话对用户有用，不能被吞掉。
    const backendText = '文件大小超过限制: 最大 10 MB（实际 12582912 字节）'
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        return json({ success: true, code: 200, data: PROFILE_DTO })
      }
      if (url === `${STORAGE_BASE}/upload/request`) {
        return envelope({ ...SESSION, total_chunks: 1, chunk_size: 4 })
      }
      if (url.startsWith(`${STORAGE_BASE}/multipart/part_url`)) {
        return envelope({
          part_url: 'https://api.huanvae.cn/avatars/u1.png?partNumber=1&X-Amz-Signature=s',
          part_number: 1,
          expires_in: 3600,
        })
      }
      if (url === `${STORAGE_BASE}/upload/confirm`) {
        return json({ success: false, code: 400, message: backendText }, 400)
      }
      throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
    })

    render(<ProfileModal isOpen onClose={() => {}} />)
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(fileInput(), avatarFile())

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: '上传失败',
        description: backendText,
        variant: 'destructive',
      }),
    )
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
  })
})
