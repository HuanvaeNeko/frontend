import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/store/authStore'
import { setActiveLocale } from '@/i18n/translate'
import { profileApi } from '../profile'

/**
 * 英文界面下，资料 / 存储 API 抛给界面的话必须是英文：它们不在 React 树里，走的是
 * `translate()`（跟随 I18nProvider 同步过来的生效语言），而且必须在**调用时**取文案——
 * 写在模块顶层的话，语言切过去之后照样吐中文。所以每条都在同一个用例里先英后中各调一次：
 * 模块加载时就把文案求值定死的实现，两种语言里总有一种会红。
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  setActiveLocale('zh-CN')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('profileApi 的本地校验跟随界面语言', () => {
  it('资料校验：英文 / 中文各一遍，数字来自规则常量', async () => {
    setActiveLocale('en-US')
    await expect(profileApi.updateProfile({})).rejects.toThrow('No changes to save')
    await expect(profileApi.updateProfile({ nickname: '' })).rejects.toThrow('Nickname must be 1–50 characters')
    await expect(profileApi.updateProfile({ signature: 'x'.repeat(201) })).rejects.toThrow(
      'Signature must be at most 200 characters',
    )

    setActiveLocale('zh-CN')
    await expect(profileApi.updateProfile({})).rejects.toThrow('没有需要保存的修改')
    await expect(profileApi.updateProfile({ nickname: '' })).rejects.toThrow('昵称长度需为 1-50 个字符')

    // 本地校验挡住的请求一个都不该发出去
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('改密码的长度规则：英文 / 中文各一遍', async () => {
    setActiveLocale('en-US')
    await expect(
      profileApi.changePassword({ old_password: '12345', new_password: 'abcdef' }),
    ).rejects.toThrow('Current password must be at least 6 characters')
    await expect(
      profileApi.changePassword({ old_password: '123456', new_password: 'x'.repeat(101) }),
    ).rejects.toThrow('New password must be at most 100 characters')

    setActiveLocale('zh-CN')
    await expect(
      profileApi.changePassword({ old_password: '12345', new_password: 'abcdef' }),
    ).rejects.toThrow('旧密码至少 6 个字符')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('头像 / 背景图的客户端闸（api/storage.ts）同样是英文，列表分隔符不沿用中文顿号', async () => {
    setActiveLocale('en-US')
    await expect(
      profileApi.uploadAvatar(new File(['x'], 'me.png', { type: 'image/bmp' })),
    ).rejects.toThrow('Unsupported file format. Supported: jpg, jpeg, png, gif, webp')
    await expect(
      profileApi.uploadBackground(new File(['x'], 'cover.bmp', { type: 'image/png' })),
    ).rejects.toThrow('Unsupported file extension. Use .jpg / .jpeg / .png / .gif / .webp')

    const tooBig = new File(['x'], 'cover.png', { type: 'image/png' })
    Object.defineProperty(tooBig, 'size', { value: 10 * 1024 * 1024 + 1 })
    await expect(profileApi.uploadBackground(tooBig)).rejects.toThrow(
      'File is too large: max 10 MB, got 10485761 bytes (about 10.00 MB)',
    )

    setActiveLocale('zh-CN')
    await expect(
      profileApi.uploadAvatar(new File(['x'], 'me.png', { type: 'image/bmp' })),
    ).rejects.toThrow('不支持的文件格式，仅支持 jpg、jpeg、png、gif、webp')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('后端没给文案时的兜底也跟随界面语言', () => {
  it('PUT /api/profile 500 空响应体：英文兜底 + 状态码', async () => {
    setActiveLocale('en-US')
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }))

    await expect(profileApi.updateProfile({ signature: 'hi' })).rejects.toThrow(
      'Failed to update profile (HTTP 500)',
    )

    // 正对照：同一条路径在中文下是中文兜底——不是碰巧两种语言都吐了同一句
    setActiveLocale('zh-CN')
    fetchMock.mockResolvedValueOnce(json({}, 500))
    await expect(profileApi.updateProfile({ signature: 'hi' })).rejects.toThrow('更新个人资料失败')
  })
})
