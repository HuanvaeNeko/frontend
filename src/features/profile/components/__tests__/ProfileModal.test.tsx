import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { storageApi } from '@/api/storage'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { makeProfile, makeProfileWire } from '../../api/__tests__/profileFixture'
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

const PROFILE_DTO = makeProfileWire({ user_email: 'old@example.com', user_signature: '签名' })

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

/**
 * 保存资料：`ProfileModal` 是第二个调用点，与 `ProfilePage` 逐条同构。
 *
 * 单独钉它的理由和头像那组一样——本仓吃过"同一条规则只钉住 7 个站点里的 2 个"
 * 的亏，而这两个组件各写了一份 `handleSubmit`、各绑了一份昵称输入框。
 * 只测其中一个，等于给另一个发一张永不到期的通行证。
 */
describe('ProfileModal 保存个人资料', () => {
  /** PUT 成功 + 随后那次完整资料 GET，都用同一个 handler 供。 */
  const mockSaveOk = () => {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        return json({ success: true, code: 200, data: PROFILE_DTO })
      }
      if (url === PROFILE_BASE && init?.method === 'PUT') {
        return json({ message: 'Profile updated successfully' })
      }
      throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
    })
  }

  const putBodies = (): unknown[] =>
    fetchMock.mock.calls
      .filter((call: unknown[]) => (call[1] as RequestInit | undefined)?.method === 'PUT')
      .map((call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)))

  it('只改签名：请求体里没有 email（旧写法无条件带上它）', async () => {
    mockSaveOk()

    render(<ProfileModal isOpen onClose={() => {}} />)
    const signature = await screen.findByDisplayValue('签名')
    await userEvent.clear(signature)
    await userEvent.type(signature, '新签名')

    await userEvent.click(screen.getByRole('button', { name: /保存更改/ }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '个人资料已更新' }),
    )
    // 把 `handleSubmit` 改回 `updateProfile(formData)` → 请求体多出 email / nickname，本行红。
    expect(putBodies()).toEqual([{ signature: '新签名' }])
  })

  it('昵称输入框不再是 disabled，改了能存进去（doc:141「1-50 字符」）', async () => {
    mockSaveOk()

    render(<ProfileModal isOpen onClose={() => {}} />)
    const nickname = await screen.findByDisplayValue('测试用户')
    // 正对照：`disabled` 还在时，这一行直接红（userEvent 也不会往 disabled 里打字）。
    expect((nickname as HTMLInputElement).disabled).toBe(false)
    await userEvent.clear(nickname)
    await userEvent.type(nickname, '新昵称')

    await userEvent.click(screen.getByRole('button', { name: /保存更改/ }))

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '个人资料已更新' }),
    )
    expect(putBodies()).toEqual([{ nickname: '新昵称' }])
  })

  it('一个字段都没改时保存按钮是灰的，一个 PUT 都发不出去', async () => {
    mockSaveOk()

    render(<ProfileModal isOpen onClose={() => {}} />)
    await screen.findByDisplayValue('old@example.com')

    const save = screen.getByRole('button', { name: /保存更改/ })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(save)

    // 正对照：挂载时那次 GET 确实发生过（否则"没有 PUT"是句空话）。
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0)
    expect(putBodies()).toEqual([])
  })
})

/**
 * 「保存更改」在**首屏那一拍**就是灰的。
 *
 * 稳定态测不出这件事：修好之前，回填 `formData` 的那个 effect 跑完之后按钮同样是灰的，
 * 闪的是中间那一拍。所以这里观察的是**每一次 DOM 提交**，用 `MutationObserver` 记
 * `disabled` 属性的变化——一条 `oldValue === null` 的记录就意味着"这个按钮曾经以可点
 * 的状态提交过一次"。
 *
 * 修好之前，`profile` 已经在 store 里（持久化字段，刷新后 rehydrate 就是这个形态）
 * 而 `formData` 初值是空三元组，于是首屏那一拍：按钮可点、输入框却是空的——
 * 点下去发的是 `nickname: ''`，`assertValidUpdate` 在任何 fetch 之前就抛。
 * 实测把这里的派生换回「空初值 + `useEffect` 回填」，本条用例会拿到两条
 * `oldValue === null` 的记录（保存更改与重置各一条）。
 */
describe('ProfileModal 的首屏：保存按钮不闪', () => {
  /**
   * 某个元素上 `disabled` 属性的变化记录。**只数条数，不看方向**：
   * happy-dom 在"加上"与"摘掉"两种方向上都把 `oldValue` 报成 `null`（实测），
   * 所以方向判据在这里是假的。而条数就够用——首屏那段里，按钮要么一直是灰的
   * （零条），要么曾经以可点的状态提交过（≥1 条）。下面正对照 2 证明这个计数
   * 确实会动，不是恒零。
   */
  const disabledChanges = (records: MutationRecord[], target: Element) =>
    records.filter((record) => record.target === target && record.attributeName === 'disabled')

  it('资料已在 store 里时，保存按钮从第一次提交起就是灰的', async () => {
    // 挂载时那次 GET 带回一份**不同**的邮箱：等它出现在屏幕上，就说明首屏的每一次
    // 提交（含 store 回填那一次）都已经发生完了。
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url === PROFILE_BASE && (init?.method ?? 'GET') === 'GET') {
        return json({
          success: true,
          code: 200,
          data: { ...PROFILE_DTO, user_email: 'fresh@example.com' },
        })
      }
      throw new Error(`未预期的请求: ${init?.method ?? 'GET'} ${url}`)
    })
    // 关键前提：资料**在渲染之前**就已经在 store 里（rehydrate 之后的常态）。
    // 昵称与那次 GET 带回来的一致，只有邮箱不同：这样"昵称输入框有值"这句话在
    // 首屏与读回之后都成立，而 `fresh@example.com` 仍然能标出读回已经落地。
    useProfileStore.setState({
      profile: makeProfile({ user_nickname: '测试用户', user_email: 'old@example.com' }),
    })

    const records: MutationRecord[] = []
    const observer = new MutationObserver((batch) => records.push(...batch))
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['disabled'],
    })

    render(<ProfileModal isOpen onClose={() => {}} />)
    await screen.findByDisplayValue('fresh@example.com')
    records.push(...observer.takeRecords())

    const save = screen.getByRole('button', { name: /保存更改/ })
    // 正对照 1：按钮在屏幕上，而且首屏的输入框**有值**——不是"什么都没渲染出来"。
    expect((save as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByDisplayValue('测试用户') as HTMLInputElement).value).toBe('测试用户')

    // 首屏那段里 `disabled` 一次都没动过 = 它从第一次提交起就在。
    expect(disabledChanges(records, save)).toEqual([])

    // 正对照 2（同一个 observer、同一次挂载）：真的改一个字段，`disabled` 会被摘掉，
    // 于是这里**必须**收到记录。没有这一段，上面那句 `toEqual([])` 在
    // "observer 根本没接上"时同样成立。
    const nickname = screen.getByDisplayValue('测试用户')
    await userEvent.type(nickname, '丁')
    records.push(...observer.takeRecords())
    observer.disconnect()

    expect((save as HTMLButtonElement).disabled).toBe(false)
    expect(disabledChanges(records, save).length).toBeGreaterThan(0)
  })
})
