import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { storageApi } from '@/api/storage'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { useProfileStore } from '../../store/profileStore'
import ProfilePage from '../ProfilePage'

/**
 * 消费端的诚实性：**被后端拒绝的编辑，屏幕上不能出现「成功」。**
 *
 * 这条链路修复前是这样断的：
 * `PUT /api/profile` 返回 400，文案 `Validation error: email: Invalid email format`
 * → 旧 `isAuthError` 靠子串匹配命中 `invalid` → `updateProfile` 走认证分支
 * `return`（不是 throw）→ promise resolve → `handleSubmit` 里
 * `await updateProfile(...)` 后面那句 `toast({title:'成功'})` 照弹，
 * 同一刻 `clearAuth()` + 跳登录页已经发生。
 *
 * 所以只 stub 全局 fetch，**不 mock store、不 mock profileApi**：要验的正是
 * 「400 响应 → 屏幕上出现失败提示、且不出现成功提示」这条完整链路。
 * use-toast 被 mock 只是为了观察，它不在链路上。
 */

// vi.mock 会被提升到文件顶部，工厂里不能引用模块级变量——用 vi.hoisted 显式提升。
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

/**
 * 只替掉 `AvatarImage` 这一个展示件（`GroupManagement.test.tsx` 里同样的办法，
 * 同样的理由）：Radix 的 `AvatarImage` 要等图片真的 `load` 完、
 * `loadingStatus === 'loaded'` 才把 `<img>` 挂上去，而 happy-dom 根本不发请求——
 * 保留原件的话渲染出来的**恒是 fallback**，「到底哪个 URL 进了 DOM」永远断言不出来。
 *
 * 不替的代价是具体的：把 `src` 换成 `"avatars/BROKEN-RELATIVE.png"`，
 * 本文件与 `ProfileModal.test.tsx` 全绿——这一整批渲染点此前没有任何 DOM 级约束，
 * 只有一条读 store 的断言在替它们说话。Root / Fallback 仍是真件。
 */
vi.mock('@/components/ui/avatar', async () => {
  const actual = await vi.importActual<typeof import('@/components/ui/avatar')>('@/components/ui/avatar')
  const { createElement } = await import('react')
  return {
    ...actual,
    AvatarImage: (props: { src?: string }) =>
      createElement('img', { 'data-testid': 'avatar-image', ...props }),
  }
})

/** 渲染到 DOM 上的那个 `src`（`null` = 组件没给 src，Radix 会走 fallback）。 */
const renderedAvatarSrc = () =>
  document.querySelector('[data-testid="avatar-image"]')?.getAttribute('src') ?? null

const PROFILE_BASE = `${getApiBaseUrl()}/api/profile`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

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

let fetchMock: ReturnType<typeof vi.fn>

const renderPage = () =>
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '*', element: <ProfilePage /> }], {
        initialEntries: ['/app/profile'],
      })}
    />,
  )

beforeEach(() => {
  localStorage.clear()
  toastMock.mockClear()
  useAuthStore.setState({
    accessToken: 'AT',
    // refreshToken 置空：本文件不测刷新流程，留着会在 401 分支多打一次 /refresh。
    refreshToken: null,
    isAuthenticated: true,
    tokenExpiry: Date.now() + 3600_000,
  })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProfilePage 保存个人资料', () => {
  it('后端 400 校验失败时只弹失败提示，绝不弹「成功」', async () => {
    fetchMock
      // 挂载时的 loadProfile
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))
      // 提交：文档 :213 的错误响应，逐字。
      .mockResolvedValueOnce(json({ error: 'Validation error: email: Invalid email format' }, 400))

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: '更新失败',
        description: 'Validation error: email: Invalid email format',
        variant: 'destructive',
      }),
    )
    // 这一行是本条用例的正身：把成功 toast 挪出 try（变成无条件）→ 立刻红。
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
  })

  it('后端 401 会话失效时同样不弹「成功」', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))
      .mockResolvedValueOnce(json({ error: '未认证或 Token 无效' }, 401))

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    // 认证分支跳登录页之后**依然 reject**；把 profileStore 的 `throw error`
    // 改回 `return` → promise resolve → 弹的是「成功」，本条两行断言都红。
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })),
    )
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
  })

  it('后端接受时才弹「成功」', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))
      // PUT 成功
      .mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))
      // updateProfile 成功后会重新拉一次完整资料
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '个人资料已更新' }),
    )
    expect(fetchMock.mock.calls[1][0]).toBe(PROFILE_BASE)
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
  })
})

/**
 * 头像上传的消费端。
 *
 * `POST /api/profile/avatar` 于 2026-08-28 删除、无兼容层
 * （`个人资料管理.md:352-355`），改走 storage 的四步预签名链路（doc:362-369）。
 * 这里同样**不 mock store、不 mock profileApi**，只 stub 全局 fetch 与那两处
 * 非 fetch 的边界（SHA-256 与分片 PUT 用的 XHR），验的是整条链路在屏幕上的结果。
 */
describe('ProfilePage 上传头像', () => {
  const STORAGE_BASE = `${getApiBaseUrl()}/api/storage`

  const envelope = (data: unknown) => json({ success: true, code: 200, data })

  const SESSION = {
    mode: 'multipart',
    preview_support: 'inline_preview',
    multipart_upload_id: 'upload-id-avatar',
    expires_in: 3600,
    // ⚠️ **合成形状，后端产不出来**：分片固定 30 MB（`文件存储管理.md:185`）而头像
    // 上限 10 MB（`个人资料管理.md:393`）⇒ 真实的头像上传**永远只有 1 片**
    // （doc:668 自己也这么写）。这里手搓 2 片是为了在没有真 XHR 的环境里驱动
    // `onProgress` 走一遍中间值（4 字节切 2 片，第一片传完 = 50%）。
    // 生产环境里那个百分比来自 `xhr.upload.onprogress` 的字节进度，不是分片计数。
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

  beforeEach(() => {
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
    vi.spyOn(storageApi, 'uploadChunk').mockResolvedValue(undefined)
  })

  it('accept 来自共享白名单：含后端收而客户端此前拒的 image/jpg，也含扩展名', async () => {
    // 这张表此前在 profile.ts、storage.ts、两个组件的 accept 里各有一份（共 4 份）。
    // 断言写成字面量而不是 `toBe(AVATAR_FILE_ACCEPT)`：后者只测"接上了"，
    // 测不出表本身被改坏（例如又把 image/jpg 删掉）。
    fetchMock.mockResolvedValue(json({ success: true, code: 200, data: PROFILE_DTO }))
    renderPage()
    await screen.findByDisplayValue('old@example.com')

    expect(fileInput().getAttribute('accept')).toBe(
      'image/jpeg,image/jpg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp',
    )
  })

  it('上传中显示真实分片进度，完成后弹成功', async () => {
    // 第二片的 part_url 挂住，让链路停在"第一片已传完"这一刻。
    let releaseSecondPart: () => void = () => {}
    const secondPart = new Promise<void>((resolve) => { releaseSecondPart = () => resolve() })
    let partUrlCalls = 0

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        return json({ success: true, code: 200, data: PROFILE_DTO })
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

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(fileInput(), avatarFile())

    try {
      // 4 字节的文件切成 2 片，第一片传完 = 50%。把这个值写死成任何常数
      // （或退回原来那个不确定态的转圈）→ 本行红。
      expect(await screen.findByText('50%')).toBeTruthy()
    } finally {
      // 无论上一行成不成立都要放行：`storageApi` 的单飞锁是**模块级**状态，
      // 卡住一次上传会让同文件后面的用例全部收到「该头像正在上传中」，
      // 一条失败伪装成一片失败。
      releaseSecondPart()
    }

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '头像上传成功' }),
    )
    // 进度指示在收尾时清掉，不会挂在那儿。
    await waitFor(() => expect(screen.queryByText('100%')).toBeNull())
  })

  it('后端 400（group- 保留命名空间）：屏幕上是后端原文，且绝不弹「成功」', async () => {
    // doc:454：`user_id` 以 `group-` 开头的存量账号永远传不上头像。套一句自造的
    // 「请稍后重试」会把一条**永久**失败说成瞬时故障。
    const backendText = '用户 ID 以 group- 开头，该命名空间保留给群头像，无法上传用户头像'
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        return json({ success: true, code: 200, data: PROFILE_DTO })
      }
      if (url === `${STORAGE_BASE}/upload/request`) {
        return json({ success: false, code: 400, message: backendText }, 400)
      }
      throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
    })

    renderPage()
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

  it('整条链路里没有一个请求打到已删除的 POST /api/profile/avatar，也没有回写 PUT', async () => {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        return json({ success: true, code: 200, data: PROFILE_DTO })
      }
      if (url === `${STORAGE_BASE}/upload/request`) return envelope({ ...SESSION, total_chunks: 1, chunk_size: 4 })
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

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(fileInput(), avatarFile())
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '头像上传成功' }),
    )

    const log = fetchMock.mock.calls.map(
      (call: unknown[]) => `${(call[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(call[0])}`,
    )
    // 正对照：链路确实跑完了（否则下面两条"没有 X"是恒真的空话）。
    expect(log).toContain(`POST ${STORAGE_BASE}/upload/confirm`)
    expect(log.some((line) => line.includes('/api/profile/avatar'))).toBe(false)
    // doc:411：后端已在 confirm 写回 `users."user-avatar-url"`，客户端无需回写。
    expect(log.filter((line) => line.startsWith('PUT '))).toEqual([])
  })

  it('上传成功后渲染到 DOM 上的是**绝对**头像地址（confirm 给的是相对路径）', async () => {
    // 上传后 loadProfile() 重新拉一次资料；后端此时返回的 `user_avatar_url`
    // 是相对路径（doc:74、:98），补基址在 `profileApi.getProfile` 出口。
    // 少了那一步，`<AvatarImage>` 会以当前页面路径为基准发请求并 404。
    //
    // 本条断言落在 **DOM 的 `src` 属性**上，不是 store 上：用例名说的是"渲染"，
    // 只读 `useProfileStore.getState()` 的话，把 `<AvatarImage src>` 换成任何常数
    // （实测 `src="avatars/BROKEN-RELATIVE.png"`）都不会红。
    let profileGets = 0
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        profileGets += 1
        return json({
          success: true,
          code: 200,
          data: profileGets === 1
            ? PROFILE_DTO
            : { ...PROFILE_DTO, user_avatar_url: 'avatars/u1.png?t=1706000000' },
        })
      }
      if (url === `${STORAGE_BASE}/upload/request`) return envelope({ ...SESSION, total_chunks: 1, chunk_size: 4 })
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

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(fileInput(), avatarFile())
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '头像上传成功' }),
    )

    const absolute = `${getApiBaseUrl()}/avatars/u1.png?t=1706000000`
    expect(useProfileStore.getState().profile?.user_avatar_url).toBe(absolute)
    // 本条的正身：这个值真的到了 `<img src>` 上。
    await waitFor(() => expect(renderedAvatarSrc()).toBe(absolute))
  })

  /**
   * confirm 已经 200 之后，紧接着那次 `GET /api/profile` 失败。
   *
   * 后端在 confirm 里就把 `file_url` 写进了 `users."user-avatar-url"`
   * （`个人资料管理.md:411`）——上传**已经完成**。这两条钉住的就是这一点：
   * 那次 GET 只负责把 `updated_at` 之类拉齐，它失败不能反过来把一次成功的上传
   * 说成失败，更不能触发一句"请稍后重试"（doc:450 管这类建议叫「错误建议——
   * 文件就在那儿，重传只会白传一次」）。
   *
   * 把 `setAvatarUrl` + 成功 toast 挪回 `await loadProfile()` **之后**（即还原成
   * 两步共用一个 try 的旧写法）→ 两条全红。
   */
  const uploadThenProfileGetFails = (status: number, body: unknown) => {
    // 计数器归这个工厂自己所有，每次调用重置——不用第二个 beforeEach。
    let profileGets = 0
    const handler = async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        // 第一次（挂载时的 loadProfile）成功，第二次（上传后的刷新）失败。
        profileGets += 1
        return profileGets === 1
          ? json({ success: true, code: 200, data: PROFILE_DTO })
          : json(body, status)
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
    }
    return { handler, profileGetCount: () => profileGets }
  }

  it('confirm 成功后那次资料刷新 500：仍然弹成功，头像照样落到 DOM 上', async () => {
    const backend = uploadThenProfileGetFails(500, { error: '服务器开小差了' })
    fetchMock.mockImplementation(backend.handler)

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(fileInput(), avatarFile())

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '头像上传成功' }),
    )
    // 正对照：链路真的跑到了 confirm，那次刷新也真的发出去并失败了
    // （否则下面那条"没有失败提示"是句空话）。
    const log = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]))
    expect(log).toContain(`${STORAGE_BASE}/upload/confirm`)
    expect(backend.profileGetCount()).toBe(2)

    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '上传失败' }))

    // confirm 返回的 file_url 就是结果，不依赖那次失败的 GET。
    const absolute = `${getApiBaseUrl()}/avatars/u1.png?t=1706000000`
    expect(useProfileStore.getState().profile?.user_avatar_url).toBe(absolute)
    await waitFor(() => expect(renderedAvatarSrc()).toBe(absolute))
  })

  it('confirm 成功后那次资料刷新 401：仍然弹成功，且没有一句「上传失败」', async () => {
    const backend = uploadThenProfileGetFails(401, { error: '未认证或 Token 无效' })
    fetchMock.mockImplementation(backend.handler)

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(fileInput(), avatarFile())

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '头像上传成功' }),
    )
    const log = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]))
    expect(log).toContain(`${STORAGE_BASE}/upload/confirm`)
    expect(backend.profileGetCount()).toBe(2)

    // 旧写法在这里弹的是「上传失败」——一次已经落库的上传，用户收到的是失败提示，
    // 紧接着还被 `profileStore.settleError` 静默送去登录页。
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '上传失败' }))

    expect(useProfileStore.getState().profile?.user_avatar_url).toBe(
      `${getApiBaseUrl()}/avatars/u1.png?t=1706000000`,
    )
    // ⚠️ 跳登录页**依然会发生**，而且是对的：`GET /api/profile` 的 401 就是会话真的
    // 失效了，那是 profileStore 对所有 action 的统一口径。本批修的不是这个跳转，
    // 是"跳转之前先告诉用户他刚做的事失败了"这句谎话。
    expect(window.location.replace).toHaveBeenCalledWith('/app/login')
  })
})
