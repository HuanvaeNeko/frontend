import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { storageApi } from '@/api/storage'
import FileManager from '../FileManager'

/**
 * 文件管理页的上传入口只能产生**合法的参数组合**。
 *
 * 原来这里有三档存储位置选择器（个人 / 好友 / 群），但第 4 个实参
 * `relatedId` 逐字是 `undefined`：
 * - 选"好友"必被后端 400「好友ID不能为空」（backend-docs/storage/文件存储管理.md:2510-2515），
 *   用户只看到一句通用的"上传失败"；
 * - 选"群"更糟——文档里没有对应的 400 条目，文件可能上传成功，但落库的
 *   related_id 为空，而群文件鉴权要求存在一行 `related-id = 请求的群` 的记录
 *   （:3021-3033），于是这份文件在任何群里都永远读不出来。
 *
 * 所以核心断言写成**不变量**而不是写死值：`storage_location` 一旦不是
 * `user_files`，`relatedId` 就必须有值。收掉入口（现状）和将来补上选择器
 * （若产品坚持三入口）都能被同一条用例守住。
 */

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

// 文件行的进出场动画在卸载时被 happy-dom 取消，会抛未处理的 AbortError（同 Sidebar.test.tsx 的说明）
vi.mock('framer-motion', async () => {
  const react = await import('react')
  const strip = ({ initial: _i, animate: _a, exit: _e, transition: _t, variants: _v, layout: _l, whileHover: _h, whileTap: _w, ...rest }: Record<string, unknown>) => rest
  const passthrough = (tag: string) =>
    react.forwardRef(function MockMotion(props: Record<string, unknown>, ref: React.Ref<unknown>) {
      const { children, ...rest } = strip(props)
      return react.createElement(tag, { ...rest, ref }, children as React.ReactNode)
    })
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  }
})

// t 直接回显 key：断言与语言环境无关，"这个文案还在不在"也看得最清楚。
vi.mock('@/i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'zh', t: (key: string) => key }),
}))

let uploadFile: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  toastMock.mockClear()
  uploadFile = vi.spyOn(storageApi, 'uploadFile').mockResolvedValue({
    fileUrl: 'https://api.huanvae.cn/api/storage/file/u1',
    isInstant: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function selectFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('找不到文件选择框')
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
  })
}

describe('FileManager 上传入口', () => {
  it('上传走个人文件档，file_type 与 storage_location 一致', async () => {
    const { container } = render(<FileManager subTab="upload" />)

    selectFile(container)

    await waitFor(() => expect(uploadFile).toHaveBeenCalled())
    const [, fileType, storageLocation] = uploadFile.mock.calls[0]
    expect(storageLocation).toBe('user_files')
    expect(fileType).toBe('user_image')
  })

  it('不变量：storage_location 不是 user_files 时必须带 relatedId', async () => {
    const { container } = render(<FileManager subTab="upload" />)

    selectFile(container)

    await waitFor(() => expect(uploadFile).toHaveBeenCalled())
    const [, , storageLocation, relatedId] = uploadFile.mock.calls[0]
    expect(storageLocation === 'user_files' || Boolean(relatedId)).toBe(true)
  })

  it('好友 / 群两个上传入口已被收掉，页面上只剩一档存储位置', () => {
    const { container, queryByText } = render(<FileManager subTab="upload" />)

    expect(queryByText('chat.fileManager.storageFriend')).toBeNull()
    expect(queryByText('chat.fileManager.storageGroup')).toBeNull()
    expect(queryByText('chat.fileManager.storagePersonal')).not.toBeNull()
    // 只剩一档之后它不再是可点的选择器，而是一张说明去向的静态卡片：
    // 页面上除了"选择文件"按钮之外不应再有别的按钮。
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('上传失败时把后端原文透给用户，而不是一句通用文案', async () => {
    uploadFile.mockRejectedValueOnce(new Error('文件大小超过限制: 最大 10 MB（实际 12345678 字节）'))
    const { container } = render(<FileManager subTab="upload" />)

    selectFile(container)

    await waitFor(() => expect(toastMock).toHaveBeenCalled())
    expect(toastMock.mock.calls[0][0]).toMatchObject({
      description: '文件大小超过限制: 最大 10 MB（实际 12345678 字节）',
    })
  })
})

describe('FileManager 文件列表的三态', () => {
  const file = (name: string) => ({
    file_uuid: `u-${name}`, filename: name, file_size: 1024, content_type: 'application/pdf', preview_support: 'inline',
    created_at: '2026-09-20T08:00:00Z', file_url: `https://x/${name}`, file_hash: 'h',
  })

  it('加载失败：显示错误与重试，而不是「暂无文件」；重试会重新请求', async () => {
    const getFileList = vi.spyOn(storageApi, 'getFileList')
      .mockRejectedValueOnce(new Error('网关超时'))
      .mockResolvedValueOnce({ files: [file('报告.pdf')], total: 1, page: 1, page_size: 20, total_pages: 1, has_more: false })
    const { findByText, queryByText, getByRole } = render(<FileManager subTab="main" />)

    expect(await findByText('chat.fileManager.loadFailedTitle')).toBeInTheDocument()
    expect(queryByText('chat.fileManager.noFiles')).toBeNull()

    getByRole('button', { name: 'shell.list.retry' }).click()

    expect(await findByText('报告.pdf')).toBeInTheDocument()
    expect(getFileList).toHaveBeenCalledTimes(2)
  })

  it('有文件但搜索无匹配：说「没有匹配」，而不是「暂无文件 / 上传后显示」', async () => {
    vi.spyOn(storageApi, 'getFileList').mockResolvedValue({ files: [file('报告.pdf')], total: 1, page: 1, page_size: 20, total_pages: 1, has_more: false })
    const { findByText, getByPlaceholderText, queryByText } = render(<FileManager subTab="main" />)
    await findByText('报告.pdf')

    fireEvent.change(getByPlaceholderText('chat.fileManager.searchPlaceholder'), { target: { value: '不存在的名字' } })

    expect(await findByText('chat.fileManager.noMatch')).toBeInTheDocument()
    expect(queryByText('chat.fileManager.noFilesHint')).toBeNull()
  })
})

describe('FileManager「加载更多」', () => {
  const file = (name: string) => ({
    file_uuid: `u-${name}`, filename: name, file_size: 1024, content_type: 'application/pdf', preview_support: 'inline',
    created_at: '2026-09-20T08:00:00Z', file_url: `https://x/${name}`, file_hash: 'h',
  })

  it('加载的是第 2 页，不是把第 1 页再拼一遍', async () => {
    // 原实现刷新后 page 停在 1、只在非刷新分支推进页码：第一次「加载更多」请求的还是第 1 页，
    // 列表翻倍、全是重复项（React 还会报重复 key）
    const getFileList = vi.spyOn(storageApi, 'getFileList').mockImplementation(async (page = 1) =>
      page === 1
        ? { files: [file('第一页-a.pdf'), file('第一页-b.pdf')], total: 3, page: 1, page_size: 2, total_pages: 2, has_more: true }
        : { files: [file('第二页-c.pdf')], total: 3, page: 2, page_size: 2, total_pages: 2, has_more: false },
    )
    const { findByText, getAllByText, getByRole } = render(<FileManager subTab="main" />)
    await findByText('第一页-a.pdf')

    getByRole('button', { name: 'chat.fileManager.loadMore' }).click()

    expect(await findByText('第二页-c.pdf')).toBeInTheDocument()
    expect(getFileList.mock.calls.map((c) => c[0])).toEqual([1, 2])
    expect(getAllByText('第一页-a.pdf')).toHaveLength(1)
  })
})
