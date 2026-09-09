import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { storageApi } from '@/api/storage'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { ROUTES } from '@/lib/routes'
import { beginSession } from '@/lib/sessionScope'
import { makeProfile, makeProfileWire } from '../../api/__tests__/profileFixture'
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

const PROFILE_DTO = makeProfileWire({ user_email: 'old@example.com', user_signature: '签名' })

let fetchMock: ReturnType<typeof vi.fn>
let hrefSpy: Mock<(value: string) => void>

const renderPage = () =>
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '*', element: <ProfilePage /> }], {
        initialEntries: ['/app/profile'],
      })}
    />,
  )

beforeEach(() => {
  // 每条用例都从一场**活着的**会话开始。下面的 setState 绕过了 login()，而 login()
  // 才是生产里调 beginSession() 的地方；不补这一句的话，「后端 401」那几条经
  // clearAuth → endSession 把 sessionScope 的模块级状态翻成死窗口（inDeadWindow=true、
  // generation+1）之后，同文件后面的每一条都活在死窗口里：每次落盘都被丢弃并
  // console.warn 一次，只是碰巧没有用例去读它。实测（stderr 打点）：401 那条之后
  // live=false 一直持续到文件结束。重开会话还顺带给了一道闸——上一条用例里已经发出、
  // 还没回来的请求，其 store 写入会被 stillMine() 判成过期而丢弃，不再污染这一条。
  beginSession()
  localStorage.clear()
  toastMock.mockClear()
  // 会话制下 fetchWithAuth 不再读 token——同源 cookie 自动带上。
  useAuthStore.setState({ isAuthenticated: true })
  useProfileStore.setState({ profile: null, isLoading: false, error: null })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window.location, 'replace').mockImplementation(() => {})
  hrefSpy = vi.fn()
  vi.spyOn(window.location, 'href', 'set').mockImplementation(hrefSpy)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * ⚠️ 本组用例现在都要**先改一个字段**再点保存。
 *
 * 这不是测试的仪式感，是被测行为变了：保存提交的是 `pickProfileEdits` 算出来的
 * **差分**，一个字段都没碰时请求根本不会发出去（见本 describe 最后两条）。
 * 旧写法里"什么都不改直接点保存"照样会发一个 `{email, signature}` 的请求——
 * 那正是本批要修的缺陷（把没碰过的字段一起重写）。
 *
 * 改字段一律用 `fireEvent.change` **一次**写入，不用 `userEvent.type` 逐键敲。
 * 不是嫌 user-event 不真实，是实测出来的两笔账（2026-09，8 核机器，4 性能 + 4 能效）：
 *
 * - 本页每个键都让整页重渲染一次（`formData` 是页级 state），15 个字符 ≈ 300 ms
 *   ——空闲时已经如此。这一组因此是全套 919 条里最贵的（540/359/260/248/172 ms），
 *   机器一忙（另一套测试并行、或半数 worker 落在能效核上）就顶到 vitest 5 s 的
 *   用例超时。
 * - 更要命的是超时**之后**：vitest 判了超时却停不掉用例体，剩下的键继续敲进
 *   `document.activeElement`——那时它已经是**下一条**用例刚聚焦的邮箱框。实测两份
 *   `new@example.com` 交错成 `@examnpelwe@.ecxoammple`，`type="email"` 的约束校验
 *   让表单**静默拒绝提交**：没有 PUT、没有 toast，下一条以「toast 调用 0 次」失败。
 *   全套稳定只红这几条、单跑本文件必绿，就是这条链路。
 *
 * 一次 `change` 事件是同步的：没有 15 次重渲染，也没有能漏进下一条用例的尾巴；
 * React 的 onChange 照常触发，差分走的还是 `pickProfileEdits` 同一条路。
 */
describe('ProfilePage 保存个人资料', () => {
  /** 把邮箱改成一个新值——最短的"制造一处差分"。 */
  const editEmail = async (value: string) => {
    fireEvent.change(await screen.findByDisplayValue('old@example.com'), { target: { value } })
  }

  it('后端 400 校验失败时只弹失败提示，绝不弹「成功」', async () => {
    fetchMock
      // 挂载时的 loadProfile
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))
      // 提交：文档 :213 的错误响应，逐字。
      .mockResolvedValueOnce(json({ error: 'Validation error: email: Invalid email format' }, 400))

    renderPage()
    // ⚠️ 这里填的是一个**格式合法**的邮箱，而后端仍然返回 400。
    // 原因是实测出来的：输入框是 `type="email"`，happy-dom 实现了约束校验，
    // 填 `not-an-email` 时表单**根本不会提交**（无 toast、无 PUT）。
    // 所以「邮箱格式错」这一档在本表单里基本到不了后端；这条用例钉的是
    // 更一般也更要紧的那件事——**后端说 400 时屏幕上是失败、不是成功**。
    await editEmail('new@example.com')

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
    await editEmail('new@example.com')

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
    await editEmail('new@example.com')

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '个人资料已更新' }),
    )
    expect(fetchMock.mock.calls[1][0]).toBe(PROFILE_BASE)
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
  })

  it('只改签名：请求体里**没有** email（旧写法会把它一起重写）', async () => {
    // 本批的核心缺陷用例，断言落在 **wire 上**：`pickProfileEdits` 自己的单测在
    // `profile.test.ts`，这一条验的是组件真的接上了它——把 `handleSubmit` 改回
    // `updateProfile(formData)` → 请求体里会多出 email 和 nickname，本条红。
    fetchMock
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))
      .mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    renderPage()
    fireEvent.change(await screen.findByDisplayValue('签名'), { target: { value: '新签名' } })

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '个人资料已更新' }),
    )
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ signature: '新签名' })
  })

  it('昵称可以改了（此前输入框硬 disabled，全站没人能改显示名）', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))
      .mockResolvedValueOnce(json({ message: 'Profile updated successfully' }))
      .mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    renderPage()
    const nickname = await screen.findByLabelText('昵称')
    // 正对照：`disabled` 还在时这一行直接红。这条断言不能删——`fireEvent.change` 对
    // disabled 输入照样派发事件（不像 userEvent 会拒绝），下面那句替不了它把关。
    expect((nickname as HTMLInputElement).disabled).toBe(false)
    fireEvent.change(nickname, { target: { value: '新昵称' } })

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '个人资料已更新' }),
    )
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ nickname: '新昵称' })
  })

  it('一个字段都没改就点保存：不发请求，也不谎称"成功"', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: PROFILE_DTO }))

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ title: '没有需要保存的修改' }))
    // 正对照：挂载时那次 GET 确实发生了（否则"只有 1 次请求"可能是 fetch 没接上）。
    expect(fetchMock.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([PROFILE_BASE])
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
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

  /**
   * ⚠️ 按 `data-testid` 取，**不能**再用 `querySelector('input[type="file"]')`：
   * P5 之后本页有**两个** file input（头像与封面），后者若排在前面，
   * 这一整组头像用例会静默地去驱动封面那条链路——请求序列全对（同一条四步链路），
   * 只有 `avatar_target` 一个字段不同，断言基本发现不了。
   */
  const fileInput = (): HTMLInputElement => {
    const input = document.querySelector('[data-testid="avatar-file-input"]')
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

    const absolute = `${location.origin}/avatars/u1.png?t=1706000000`
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
    const absolute = `${location.origin}/avatars/u1.png?t=1706000000`
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

    // ⚠️ 跳登录页**依然会发生**，而且是对的：`GET /api/profile` 的 401 就是会话真的
    // 失效了。本批修的不是这个跳转，是"跳转之前先告诉用户他刚做的事失败了"这句谎话。
    //
    // 跳转的**发起者**变了：Task 11 之后 `fetchWithAuth` 自己在 401 上就
    // `clearAuth()` + `window.location.href = ...`，早于响应回到 `profileStore`。
    // 于是 `profileStore.settleError` 的 `stillMine()` 闸门——它挡的是"上一场会话的
    // 响应落在当前会话"——看到会话世代号已经变了，判定"不是我的"而直接 rethrow，
    // 不再自己调 `silentRedirectToLogin()`（`.replace`）。跳转本身没有消失，只是
    // 换成了 `fetchWithAuth` 那一次（`.href`），断言跟着换。
    expect(hrefSpy).toHaveBeenCalledWith(ROUTES.auth.login)
    expect(window.location.replace).not.toHaveBeenCalled() // 只跳一次，且是 fetchWithAuth 那一次

    // 会话既然结束了，store 里就不该再留着这个人的资料——`clearAuth` 会走
    // `endSession()`，把 profile 连同 `profile-storage` 一起清掉。
    // 与上一条 500 用例正好构成差分：同一次上传、同一个 `file_url`，
    // 500（会话仍在）时它留在 store 里并渲染出来，401（会话结束）时它跟着账号一起消失。
    expect(useProfileStore.getState().profile).toBeNull()
    expect(localStorage.getItem('profile-storage')).toBeNull()
  })
})

/**
 * 封面（资料背景图）的消费端。
 *
 * 与头像同一条四步预签名链路（`个人资料管理.md:362-369`），只差
 * `avatar_target: 'user_background'`（doc:389）；重置走
 * `DELETE /api/profile/background`（doc:458-492，成功响应是文档写明的**裸**体）。
 *
 * 同样**不 mock store、不 mock profileApi**，只 stub 全局 fetch 与那两处非 fetch
 * 的边界（SHA-256 与分片 PUT 用的 XHR），验的是整条链路在屏幕上的结果。
 */
describe('ProfilePage 资料封面', () => {
  const STORAGE_BASE = `${getApiBaseUrl()}/api/storage`

  const envelope = (data: unknown) => json({ success: true, code: 200, data })

  const BG_SESSION = {
    mode: 'multipart',
    preview_support: 'inline_preview',
    multipart_upload_id: 'upload-id-bg',
    expires_in: 3600,
    // 与头像那组同样是**合成**的 2 片形状，理由逐条相同（见那一组的注释）：
    // 真实封面上传永远只有 1 片，这里切 2 片只为在没有真 XHR 的环境里驱动出
    // 一个 50% 的中间值。
    chunk_size: 2,
    total_chunks: 2,
    file_key: 'background/u1.png',
    max_file_size: 10485760,
    instant_upload: false,
    existing_file_url: null,
  }

  const BG_CONFIRM = {
    file_url: 'avatars/background/u1.png?t=1706000000',
    file_key: 'background/u1.png',
    file_size: 4,
    content_type: 'image/png',
    preview_support: 'inline_preview',
  }

  /** doc:479-485 的成功响应体，逐字（**裸**的：没有 success / code / data）。 */
  const RESET_BARE_BODY = { background_url: '', message: '背景图已重置为默认' }

  const coverFile = () => new File(['abcd'], 'cover.png', { type: 'image/png' })

  const backgroundInput = (): HTMLInputElement => {
    const input = document.querySelector('[data-testid="background-file-input"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('找不到封面 input')
    return input
  }

  /** 渲染到 DOM 上的封面 `src`（`null` = 根本没挂 `<img>`，即默认封面）。 */
  const renderedCoverSrc = () =>
    document.querySelector('[data-testid="profile-cover-image"]')?.getAttribute('src') ?? null

  beforeEach(() => {
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
    vi.spyOn(storageApi, 'uploadChunk').mockResolvedValue(undefined)
  })

  it('默认封面（background_url 为 null）时不挂 <img>，也不渲染「恢复默认」', async () => {
    fetchMock.mockResolvedValue(json({ success: true, code: 200, data: PROFILE_DTO }))

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    expect(renderedCoverSrc()).toBeNull()
    expect(screen.queryByText('恢复默认')).toBeNull()
    // 「更换封面」在任何状态下都在。
    expect(screen.getByText('更换封面')).toBeTruthy()
  })

  it('后端把 background_url 给成空串时，整条链路的结果仍是默认封面', async () => {
    // ⚠️ 这一条**不是**在钉渲染点的判据：`emptyableStr` 在 `profileApi.getProfile`
    // 出口就把 `''` 归一成了 `null`，所以走到组件手里的已经是 `null`。
    // 实测过：把 `coverImageSrc` 换成 `backgroundUrl ?? undefined`，本条照样绿。
    // 渲染点自己那道闸由**下一条**用例钉住。
    fetchMock.mockResolvedValue(
      json({ success: true, code: 200, data: { ...PROFILE_DTO, background_url: '' } }),
    )

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    expect(document.querySelector('[data-testid="profile-cover-image"]')).toBeNull()
    expect(useProfileStore.getState().profile?.background_url).toBeNull()
  })

  it('🔴 store 里直接是空串时，渲染点自己也判成默认封面——DOM 上不能出现 <img src="">', async () => {
    // 空 `src` 不是"不加载"：浏览器会把它解析成**当前页面地址**并真的发一次请求，
    // 把整张 HTML 当图片下载（`Navigation.tsx` 的 `avatarSrc` 注释记的是同一个坑）。
    //
    // ⚠️ 本条钉的是**结果**（DOM 上没有 src 为空串的 img），**不是** `coverImageSrc`
    // 这一个实现。已实测：单独把 `coverImageSrc` 换成 `backgroundUrl ?? undefined`，
    // 本条**照样绿**——因为 JSX 那侧写的是 `coverSrc ? <img/> : null`，`''` 也是假值。
    // 两层独立地挡同一件事，要同时改坏才渲染得出 `src=""`。`coverImageSrc` 自己由
    // `profile.test.ts` 的同名 describe 钉住（那一组对 `?? undefined` 确实变红）。
    //
    // 这个 `''` 从哪来：`DELETE /api/profile/background` 的响应体里
    // `background_url` **恒为** `""`（doc:482、:491「前端不应拼接此值展示图片」）。
    // 本仓今天不会把它写进 store（`resetBackground` 写的是 `null`），所以这一条
    // 必须**绕过 api 层**直接把 `''` 放进 store：上一条那种走 wire 的写法测不到
    // 渲染点，因为 `emptyableStr` 在出口就把它归一掉了。
    //
    // 挂载时那次 `loadProfile()` 让它 500：否则读回会把 store 里这份种子覆盖掉，
    // 用例又退回成"测上游归一"。500 只写 `error`，不动 `profile`。
    useProfileStore.setState({
      profile: makeProfile({ user_email: 'old@example.com', background_url: '' }),
    })
    fetchMock.mockResolvedValue(json({ error: '服务器内部错误' }, 500))

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    // 前提检查：种子确实还在 store 里（否则下面两行在"profile 变 null"时恒真）。
    expect(useProfileStore.getState().profile?.background_url).toBe('')

    expect(document.querySelector('[data-testid="profile-cover-image"]')).toBeNull()
    // 更直接的说法：整页没有任何一个 src 为空串的 img。
    const emptySrcImages = Array.from(document.querySelectorAll('img')).filter(
      (img) => img.getAttribute('src') === '',
    )
    expect(emptySrcImages).toHaveLength(0)
  })

  it('有封面时渲染绝对地址，并出现「恢复默认」', async () => {
    // 后端给的是**相对**路径（doc:265「需拼接 STORAGE_BASE_URL」），
    // 补基址在 `profileApi.getProfile` 出口。把那一处删掉 → 本行红。
    fetchMock.mockResolvedValue(
      json({
        success: true,
        code: 200,
        data: { ...PROFILE_DTO, background_url: 'avatars/background/u1.jpg?t=1706000000' },
      }),
    )

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await waitFor(() =>
      expect(renderedCoverSrc()).toBe(`${location.origin}/avatars/background/u1.jpg?t=1706000000`),
    )
    expect(screen.getByText('恢复默认')).toBeTruthy()
  })

  it('上传封面：四步链路、真实进度、成功后 DOM 上是绝对地址', async () => {
    let releaseSecondPart: () => void = () => {}
    const secondPart = new Promise<void>((resolve) => {
      releaseSecondPart = () => resolve()
    })
    let partUrlCalls = 0
    let profileGetCount = 0

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        profileGetCount += 1
        // 第二次 GET 是上传成功之后那次读回。后端已在 confirm 把这个地址写进
        // `users."user-background-url"`（doc:410-411），所以这里如实返回它——
        // 否则读回会用一份 `background_url: null` 的旧资料把刚上传的封面盖掉，
        // 那是夹具在说谎，不是被测行为。
        return json({
          success: true,
          code: 200,
          data:
            profileGetCount === 1
              ? PROFILE_DTO
              : { ...PROFILE_DTO, background_url: BG_CONFIRM.file_url },
        })
      }
      if (url === `${STORAGE_BASE}/upload/request`) return envelope(BG_SESSION)
      if (url.startsWith(`${STORAGE_BASE}/multipart/part_url`)) {
        partUrlCalls += 1
        if (partUrlCalls === 2) await secondPart
        return envelope({
          part_url: `https://api.huanvae.cn/avatars/background/u1.png?partNumber=${partUrlCalls}&X-Amz-Signature=s`,
          part_number: partUrlCalls,
          expires_in: 3600,
        })
      }
      if (url === `${STORAGE_BASE}/upload/confirm`) return envelope(BG_CONFIRM)
      throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
    })

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(backgroundInput(), coverFile())

    try {
      // 4 字节切 2 片，第一片传完 = 50%。进度回调没接上（`onProgress` 不传）
      // 或退回不确定态的转圈 → 本行红。
      expect(await screen.findByText('50%')).toBeTruthy()
    } finally {
      // 单飞锁是模块级状态，卡住一次上传会污染同文件后面的用例。
      releaseSecondPart()
    }

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '资料背景图已更新' }),
    )

    // 第 1 步请求体里的 avatar_target 必须是 user_background（doc:389）。
    // 少了这一句，本条对"上传的是封面还是头像"是瞎的——两条链路的请求序列一模一样。
    const requestCall = fetchMock.mock.calls.find(
      (call: unknown[]) => String(call[0]) === `${STORAGE_BASE}/upload/request`,
    ) as [string, RequestInit]
    expect(JSON.parse(String(requestCall[1].body)).avatar_target).toBe('user_background')

    // 已删除的旧 multipart 端点一个请求都不该收到（doc:352-355）。
    const log = fetchMock.mock.calls.map(
      (call: unknown[]) =>
        `${(call[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(call[0])}`,
    )
    expect(log.some((line) => line.includes('/api/profile/background'))).toBe(false)
    // doc:410-411：后端已经写回，客户端不再 PUT。
    expect(log.some((line) => line.startsWith(`PUT ${PROFILE_BASE}`))).toBe(false)

    await waitFor(() =>
      expect(renderedCoverSrc()).toBe(
        `${location.origin}/avatars/background/u1.png?t=1706000000`,
      ),
    )
  })

  it('confirm 成功后那次资料刷新 500：仍然弹成功，封面照样落到 DOM 上', async () => {
    // 与头像那条同型：把上传与随后那次 GET 塞回同一个 `try` → 本条红
    // （屏幕上会出现「上传失败」，而后端此刻已经写回 `users."user-background-url"`）。
    let profileGetCount = 0
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        profileGetCount += 1
        return profileGetCount === 1
          ? json({ success: true, code: 200, data: PROFILE_DTO })
          : json({ error: '服务器内部错误' }, 500)
      }
      if (url === `${STORAGE_BASE}/upload/request`) {
        return envelope({ ...BG_SESSION, chunk_size: 4, total_chunks: 1 })
      }
      if (url.startsWith(`${STORAGE_BASE}/multipart/part_url`)) {
        return envelope({
          part_url: 'https://api.huanvae.cn/avatars/background/u1.png?X-Amz-Signature=s',
          part_number: 1,
          expires_in: 3600,
        })
      }
      if (url === `${STORAGE_BASE}/upload/confirm`) return envelope(BG_CONFIRM)
      throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
    })

    renderPage()
    await screen.findByDisplayValue('old@example.com')

    await userEvent.upload(backgroundInput(), coverFile())

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '资料背景图已更新' }),
    )
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '上传失败' }))
    // 读回确实发生过（否则"读回失败不影响成功"这句话没有被验证）。
    await waitFor(() => expect(profileGetCount).toBe(2))

    const absolute = `${location.origin}/avatars/background/u1.png?t=1706000000`
    expect(useProfileStore.getState().profile?.background_url).toBe(absolute)
    await waitFor(() => expect(renderedCoverSrc()).toBe(absolute))
  })

  it('恢复默认：打 DELETE、裸响应照常成功、封面回到默认', async () => {
    let profileGetCount = 0
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url === PROFILE_BASE && method === 'GET') {
        profileGetCount += 1
        return json({
          success: true,
          code: 200,
          data:
            profileGetCount === 1
              ? { ...PROFILE_DTO, background_url: 'avatars/background/u1.jpg?t=1' }
              : { ...PROFILE_DTO, background_url: null },
        })
      }
      // doc:479-485：**裸**响应，没有 success / code / data。
      // 把 `resetBackground` 换成 readEnvelope → 这里会抛「响应缺少 data 字段」，
      // 屏幕上出现「重置失败」，本条红。
      if (url === `${PROFILE_BASE}/background` && method === 'DELETE') {
        return json(RESET_BARE_BODY)
      }
      throw new Error(`未预期的请求: ${method} ${url}`)
    })

    renderPage()
    await screen.findByDisplayValue('old@example.com')
    await waitFor(() => expect(renderedCoverSrc()).not.toBeNull())

    await userEvent.click(screen.getByText('恢复默认'))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '已恢复默认封面' }),
    )
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '重置失败' }))

    const log = fetchMock.mock.calls.map(
      (call: unknown[]) =>
        `${(call[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(call[0])}`,
    )
    expect(log).toContain(`DELETE ${PROFILE_BASE}/background`)

    // store 里写进去的是 `null`，不是响应里那个 `""`（doc:491）。
    expect(useProfileStore.getState().profile?.background_url).toBeNull()
    // 封面区回到默认：`<img>` 整个消失，「恢复默认」也跟着收起来。
    await waitFor(() => expect(renderedCoverSrc()).toBeNull())
    await waitFor(() => expect(screen.queryByText('恢复默认')).toBeNull())
  })

  it('恢复默认失败时透出后端原文，且绝不弹「成功」', async () => {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url === PROFILE_BASE && method === 'GET') {
        return json({
          success: true,
          code: 200,
          data: { ...PROFILE_DTO, background_url: 'avatars/background/u1.jpg?t=1' },
        })
      }
      if (url === `${PROFILE_BASE}/background` && method === 'DELETE') {
        return json({ error: '数据库写入失败' }, 500)
      }
      throw new Error(`未预期的请求: ${method} ${url}`)
    })

    renderPage()
    await screen.findByDisplayValue('old@example.com')
    await waitFor(() => expect(renderedCoverSrc()).not.toBeNull())

    await userEvent.click(screen.getByText('恢复默认'))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: '重置失败',
        description: '数据库写入失败',
        variant: 'destructive',
      }),
    )
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: '已恢复默认封面' }),
    )
    // 失败的重置不动封面。
    expect(renderedCoverSrc()).not.toBeNull()
  })

  it('恢复默认遇到 401：跳登录页，但**依然**弹失败提示、绝不弹「成功」', async () => {
    // 跳转现在由 `fetchWithAuth` 自己发起（401 → `clearAuth()` +
    // `window.location.href = ...`），早于响应回到 `resetBackground`。
    // `resetBackground` 的 `stillMine()` 闸门见到世代号已经变了，判定"不是我的"，
    // 直接 `throw error`（不再经过 `settleError` → `silentRedirectToLogin`）——
    // 那个原始 `ApiError` 的 `.message` 就是后端文案，组件的 catch 拿它弹 toast。
    // 所以跳转与失败提示**同时**发生，这不是遗漏。
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url === PROFILE_BASE && method === 'GET') {
        return json({
          success: true,
          code: 200,
          data: { ...PROFILE_DTO, background_url: 'avatars/background/u1.jpg?t=1' },
        })
      }
      if (url === `${PROFILE_BASE}/background` && method === 'DELETE') {
        return json({ error: '未认证或 Token 无效' }, 401)
      }
      throw new Error(`未预期的请求: ${method} ${url}`)
    })

    renderPage()
    await screen.findByDisplayValue('old@example.com')
    await waitFor(() => expect(renderedCoverSrc()).not.toBeNull())

    await userEvent.click(screen.getByText('恢复默认'))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: '重置失败',
        description: '未认证或 Token 无效',
        variant: 'destructive',
      }),
    )
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
    expect(hrefSpy).toHaveBeenCalledWith(ROUTES.auth.login)
    expect(window.location.replace).not.toHaveBeenCalled() // 只跳一次，且是 fetchWithAuth 那一次
  })
})
