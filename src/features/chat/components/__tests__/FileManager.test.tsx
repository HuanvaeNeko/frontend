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
