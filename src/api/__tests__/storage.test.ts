import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isUploadSessionExpired, storageApi } from '@/api/storage'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { clearApiBaseUrl, getApiBaseUrl, setApiBaseUrl } from '@/lib/apiConfig'

/**
 * storage 模块的信封解包 + 相对路径补基址。
 *
 * 旧代码 `const data = await response.json()` 把**信封**当成了 data，于是
 * `data.chunk_size` / `data.instant_upload` / `data.files` 恒为 undefined，
 * 再被下游的 `|| 30MB`、`|| Math.ceil(...)`、`!` 非空断言逐一兜住——
 * 一次失败的解包被伪装成一次正常的上传，错误延后到分片 PUT 或 confirm 才炸。
 *
 * 因此每条正例都必须断言**具体字段值**：只断言"没抛错"或"返回了对象"的话，
 * 坏代码返回的那个信封对象同样满足，等于没测。
 *
 * 相对路径同理：断言必须是完整绝对 URL 逐字相等，不能只断言"非 undefined"——
 * 相对路径本身也是非 undefined。
 */

// 用 getApiBaseUrl() 而不是字面量：Vitest 会加载 .env，宿主由本机反代决定，
// 断言必须跟着同一个基址走，不能钉死某个域名（否则一换 .env 就假红）。
const STORAGE_BASE = `${getApiBaseUrl()}/api/storage`

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const envelope = (data: unknown, status = 200) => ok({ success: true, code: 200, data }, status)

/** 分片上传档的 upload/request 响应（文档 文件存储管理.md:167-182）。 */
const MULTIPART_DATA = {
  mode: 'multipart',
  preview_support: 'inline_preview',
  multipart_upload_id: 'upload-id-xxx',
  expires_in: 3600,
  chunk_size: 31457280,
  total_chunks: 2,
  file_key: 'u1/images/1700000000_hash_a.jpg',
  max_file_size: 107374182400,
  instant_upload: false,
  existing_file_url: null,
}

/** 秒传档（文档 :187-205）：三个分片字段恒为 null，existing_file_url 必有值。 */
const INSTANT_DATA = {
  mode: 'multipart',
  preview_support: 'inline_preview',
  multipart_upload_id: null,
  expires_in: null,
  chunk_size: null,
  total_chunks: null,
  file_key: 'u1/images/xxx',
  max_file_size: 0,
  instant_upload: true,
  existing_file_url: 'api/storage/file/f5f23929-1689-4b04-98e7-0073fac1eea4',
}

const CONFIRM_DATA = {
  file_url: 'api/storage/file/f5f23929-1689-4b04-98e7-0073fac1eea4',
  file_key: 'u1/images/xxx',
  file_size: 6400000,
  content_type: 'image/jpeg',
  preview_support: 'inline_preview',
}

const PRESIGNED_DATA = {
  presigned_url: 'user-file/alice/images/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=sig',
  expires_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
  file_uuid: 'cb31fb54-770d-4198-84d6-18ce9c6d290f',
  file_size: 1048576,
  content_type: 'image/jpeg',
  warning: null,
}

const FILE_ITEM = {
  file_uuid: 'f5f23929-1689-4b04-98e7-0073fac1eea4',
  filename: 'example.jpg',
  file_size: 1048576,
  content_type: 'image/jpeg',
  preview_support: 'inline_preview',
  created_at: '2025-11-30T10:00:00Z',
  file_url: 'api/storage/file/f5f23929-1689-4b04-98e7-0073fac1eea4',
  file_hash: 'a1b2c3d4e5f6',
}

const FILE_LIST_DATA = {
  files: [FILE_ITEM],
  total: 45,
  page: 1,
  page_size: 20,
  total_pages: 3,
  has_more: true,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({
    accessToken: 'AT',
    refreshToken: 'RT',
    isAuthenticated: true,
    user: { user_id: 'me' },
    // 远期过期时间：否则 fetchWithAuth 会先打一次 /refresh，
    // 把 mockResolvedValueOnce 的顺序和 fetchMock.mock.calls 的下标整体错开。
    tokenExpiry: Date.now() + 3600_000,
  })
  setApiShapeErrorReporter(() => {})
  // 预签名 URL 缓存是模块级单例，不清会在用例之间串味。
  storageApi.clearPresignedUrlCache()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('storageApi.requestUpload', () => {
  it('从信封里取出真实的分片会话字段', async () => {
    fetchMock.mockResolvedValueOnce(envelope(MULTIPART_DATA))

    const info = await storageApi.requestUpload({
      file_type: 'user_image',
      storage_location: 'user_files',
      filename: 'a.jpg',
      file_size: 40 * 1024 * 1024,
      content_type: 'image/jpeg',
    })

    expect(info.instant_upload).toBe(false)
    expect(info.chunk_size).toBe(31457280)
    expect(info.total_chunks).toBe(2)
    expect(info.multipart_upload_id).toBe('upload-id-xxx')
    expect(info.file_key).toBe('u1/images/1700000000_hash_a.jpg')
    expect(fetchMock.mock.calls[0][0]).toBe(`${STORAGE_BASE}/upload/request`)
  })

  it('秒传响应的 existing_file_url 在 api 出口就被补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(envelope(INSTANT_DATA))

    const info = await storageApi.requestUpload({
      file_type: 'user_image',
      storage_location: 'user_files',
      filename: 'a.jpg',
      file_size: 1,
      content_type: 'image/jpeg',
    })

    expect(info.instant_upload).toBe(true)
    expect(info.existing_file_url).toBe(
      `${STORAGE_BASE}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
    )
    // 误用带 /api/storage 后缀的 STORAGE_BASE_URL 拼接会拼出双份前缀
    expect(info.existing_file_url).not.toContain('/api/storage/api/storage/')
  })

  it('裸响应（没有 data 包裹）抛错，而不是把信封当 data 用', async () => {
    fetchMock.mockResolvedValueOnce(ok(MULTIPART_DATA))

    await expect(
      storageApi.requestUpload({
        file_type: 'user_image',
        storage_location: 'user_files',
        filename: 'a.jpg',
        file_size: 1,
        content_type: 'image/jpeg',
      }),
    ).rejects.toThrow(/data/)
  })

  it('instant_upload:false 却缺 chunk_size 时抛错，绝不兜底成 30MB', async () => {
    // 这正是旧代码 `uploadInfo.chunk_size || (30 * 1024 * 1024)` 吞掉的形状：
    // 后端少给字段时不报错，而是自己编一个分片方案接着跑。
    fetchMock.mockResolvedValueOnce(envelope({ ...MULTIPART_DATA, chunk_size: null }))

    await expect(
      storageApi.requestUpload({
        file_type: 'user_image',
        storage_location: 'user_files',
        filename: 'a.jpg',
        file_size: 1,
        content_type: 'image/jpeg',
      }),
    ).rejects.toThrow(/chunk_size/)
  })

  it('instant_upload:false 却缺 multipart_upload_id 时抛错，绝不用 ! 强推', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ...MULTIPART_DATA, multipart_upload_id: null }))

    await expect(
      storageApi.requestUpload({
        file_type: 'user_image',
        storage_location: 'user_files',
        filename: 'a.jpg',
        file_size: 1,
        content_type: 'image/jpeg',
      }),
    ).rejects.toThrow(/multipart_upload_id/)
  })

  it('秒传却缺 existing_file_url 时抛错，而不是返回 undefined 的 fileUrl', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ...INSTANT_DATA, existing_file_url: null }))

    await expect(
      storageApi.requestUpload({
        file_type: 'user_image',
        storage_location: 'user_files',
        filename: 'a.jpg',
        file_size: 1,
        content_type: 'image/jpeg',
      }),
    ).rejects.toThrow(/existing_file_url/)
  })

  it('HTTP 200 但 success:false 也算失败，并透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 400, message: '文件类型不支持' }))

    await expect(
      storageApi.requestUpload({
        file_type: 'user_image',
        storage_location: 'user_files',
        filename: 'a.jpg',
        file_size: 1,
        content_type: 'image/jpeg',
      }),
    ).rejects.toThrow('文件类型不支持')
  })
})

describe('storageApi.getPartUrl', () => {
  it('从信封里取出真实的 part_url / part_number（基址是正式域名时地址原样保留）', async () => {
    // 显式钉住基址：vitest 会加载开发者本机的 .env，VITE_API_URL 指向反代时 origin 会被改写。
    setApiBaseUrl('https://api.huanvae.cn')
    try {
      fetchMock.mockResolvedValueOnce(
        envelope({
          part_url: 'https://api.huanvae.cn/user-file/x?uploadId=u&partNumber=1&X-Amz-Signature=s',
          part_number: 1,
          expires_in: 3600,
        }),
      )

      const part = await storageApi.getPartUrl('k', 'up', 1)

      expect(part.part_number).toBe(1)
      expect(part.expires_in).toBe(3600)
      expect(part.part_url).toBe(
        'https://api.huanvae.cn/user-file/x?uploadId=u&partNumber=1&X-Amz-Signature=s',
      )
    } finally {
      clearApiBaseUrl()
    }
  })

  it('part_url 是浏览器 PUT 分片的目标：基址指向反代时只换 origin，路径与签名参数逐字保留', async () => {
    // part_url 本就是绝对地址（文档 :611-620），此前刻意不过 toAbsoluteApiUrl 以免被再拼一次基址。
    // 现在出口对正式域名只替换 origin、不拼路径：基址指向本地去 SNI 反代（~/.config/huanvae-edge）
    // 时分片才 PUT 得出去，签名参数一个字节不动（反代转发时带 Host: api.huanvae.cn，SigV4 仍成立）。
    setApiBaseUrl('http://127.0.0.1:8787')
    try {
      fetchMock.mockResolvedValueOnce(
        envelope({
          part_url: 'https://api.huanvae.cn/user-file/x?uploadId=u&partNumber=1&X-Amz-Signature=s',
          part_number: 1,
          expires_in: 3600,
        }),
      )

      const { part_url } = await storageApi.getPartUrl('k', 'up', 1)

      expect(part_url).toBe(
        'http://127.0.0.1:8787/user-file/x?uploadId=u&partNumber=1&X-Amz-Signature=s',
      )
      // 仍然是"只换 origin"，不是"再拼一次基址"
      expect(part_url).not.toContain('https://')
    } finally {
      clearApiBaseUrl()
    }
  })

  it('409 是可分诊的：保留 status，isUploadSessionExpired 认得出来', async () => {
    // 文档 :625-645：409 = 上传会话已死，必须回第 1 步 upload/request 重来，
    // 重发同一条永远不会成功。旧代码 `throw new Error(error.error || '获取分片URL失败')`
    // 把状态码整个丢掉，409 和 400 在调用点无法区分。
    fetchMock.mockResolvedValueOnce(
      ok(
        {
          success: false,
          code: 409,
          message: '该上传会话已被同一目标的新请求接管，请重新发起上传',
        },
        409,
      ),
    )

    const error = await storageApi.getPartUrl('k', 'up', 1).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect(isUploadSessionExpired(error)).toBe(true)
    expect((error as ApiError).message).toBe('该上传会话已被同一目标的新请求接管，请重新发起上传')
  })

  it('400 不会被误判成"会话已死"（分诊按状态码，不做文案匹配）', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 400, message: '上传会话不存在，请重新发起上传' }, 400),
    )

    const error = await storageApi.getPartUrl('k', 'up', 1).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect(isUploadSessionExpired(error)).toBe(false)
  })
})

describe('storageApi.confirmUpload', () => {
  it('从信封里取出真实字段，file_url 补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(envelope(CONFIRM_DATA))

    const result = await storageApi.confirmUpload('u1/images/xxx')

    expect(result.file_key).toBe('u1/images/xxx')
    expect(result.file_size).toBe(6400000)
    expect(result.content_type).toBe('image/jpeg')
    expect(result.file_url).toBe(
      `${STORAGE_BASE}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
    )
    expect(result.file_url).not.toContain('/api/storage/api/storage/')
  })

  it('好友文件的 message_uuid 也从信封里取出来', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({
        ...CONFIRM_DATA,
        message_uuid: 'e29469f7-0bcd-4331-aacf-26c71d15e737',
        message_send_time: '2025-12-03T06:00:00+00:00',
      }),
    )

    const result = await storageApi.confirmUpload('k')

    expect(result.message_uuid).toBe('e29469f7-0bcd-4331-aacf-26c71d15e737')
    expect(result.message_send_time).toBe('2025-12-03T06:00:00+00:00')
  })

  it('失败原因写在 message 字段时，原文能到达调用点', async () => {
    // 文档 :535「逐档明细（文案为服务端原文，`message` 字段）」。
    // 旧代码只读 error.error，于是这句变成了一句什么也没说的"确认上传失败"，
    // 用户换头像超 10MB 时完全不知道是文件太大。
    fetchMock.mockResolvedValueOnce(
      ok(
        {
          success: false,
          code: 400,
          message: '文件大小超过限制: 最大 10 MB（实际 12345678 字节）',
        },
        400,
      ),
    )

    const error = await storageApi.confirmUpload('k').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('文件大小超过限制: 最大 10 MB（实际 12345678 字节）')
    expect((error as Error).message).not.toBe('确认上传失败')
  })

  it('失败原因写在 error 字段时同样能到达调用点（两种字段名都收）', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, code: 400, error: '尚未上传任何分片，请先上传分片再确认' }, 400),
    )

    await expect(storageApi.confirmUpload('k')).rejects.toThrow(
      '尚未上传任何分片，请先上传分片再确认',
    )
  })

  it('409 是可分诊的，并带着服务端原文', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        {
          success: false,
          code: 409,
          message: '该上传会话已完成（文件已上传成功），无需重复确认',
        },
        409,
      ),
    )

    const error = await storageApi.confirmUpload('k').catch((e: unknown) => e)

    expect(isUploadSessionExpired(error)).toBe(true)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).message).toBe('该上传会话已完成（文件已上传成功），无需重复确认')
  })

  it('缺 file_url 时抛错，而不是返回 undefined', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ...CONFIRM_DATA, file_url: undefined }))

    await expect(storageApi.confirmUpload('k')).rejects.toThrow(/file_url/)
  })
})

describe('storageApi.getPresignedUrl', () => {
  it('相对 presigned_url 被补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(envelope(PRESIGNED_DATA))

    const url = await storageApi.getPresignedUrl('u1')

    expect(url).toBe(
      `${getApiBaseUrl()}/user-file/alice/images/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=sig`,
    )
  })

  it('绝不会拼出双份 /api/storage 前缀', async () => {
    // 这一条专门抓"误用本文件顶部的 STORAGE_BASE_URL 拼接"——
    // 它已经带了 /api/storage 后缀，拼出来的地址比不拼还难查。
    fetchMock.mockResolvedValueOnce(envelope(PRESIGNED_DATA))

    const url = await storageApi.getPresignedUrl('u1')

    expect(url).not.toContain('/api/storage/user-file')
  })

  it('基址是正式域名时，已经是绝对地址的预签名 URL 原样返回（幂等，签名不会被破坏）', async () => {
    // 显式钉住基址：vitest 会加载开发者本机的 .env，VITE_API_URL 指向反代时这条会变成"改写"用例。
    setApiBaseUrl('https://api.huanvae.cn')
    try {
      const absolute = 'https://api.huanvae.cn/user-file/x?X-Amz-Signature=s'
      fetchMock.mockResolvedValueOnce(envelope({ ...PRESIGNED_DATA, presigned_url: absolute }))

      expect(await storageApi.getPresignedUrl('u1')).toBe(absolute)
    } finally {
      clearApiBaseUrl()
    }
  })

  it('基址指向反代时，正式域名的预签名 URL 只换 origin，签名参数逐字保留', async () => {
    setApiBaseUrl('http://127.0.0.1:8787')
    try {
      fetchMock.mockResolvedValueOnce(
        envelope({
          ...PRESIGNED_DATA,
          presigned_url: 'https://api.huanvae.cn/user-file/x?X-Amz-Credential=k%2Faws4_request&X-Amz-Signature=s',
        }),
      )

      expect(await storageApi.getPresignedUrl('u1')).toBe(
        'http://127.0.0.1:8787/user-file/x?X-Amz-Credential=k%2Faws4_request&X-Amz-Signature=s',
      )
    } finally {
      clearApiBaseUrl()
    }
  })

  it('带前导斜杠的相对路径不会拼出 //user-file', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ ...PRESIGNED_DATA, presigned_url: '/user-file/x?X-Amz-Signature=s' }),
    )

    const url = await storageApi.getPresignedUrl('u1')

    expect(url).toBe(`${getApiBaseUrl()}/user-file/x?X-Amz-Signature=s`)
    expect(url).not.toContain('//user-file')
  })

  it('缓存命中路径返回的也是绝对地址（只拼返回值不拼缓存是半吊子修法）', async () => {
    fetchMock.mockResolvedValueOnce(envelope(PRESIGNED_DATA))

    const first = await storageApi.getPresignedUrl('u1')
    const second = await storageApi.getPresignedUrl('u1')

    expect(second).toBe(first)
    expect(second).toBe(
      `${getApiBaseUrl()}/user-file/alice/images/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=sig`,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('缺 presigned_url 时抛错，而不是返回 undefined', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ...PRESIGNED_DATA, presigned_url: undefined }))

    await expect(storageApi.getPresignedUrl('u1')).rejects.toThrow(/presigned_url/)
  })

  it('403 的 error 文案到达调用点', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 403, error: '无权访问此文件' }, 403))

    await expect(storageApi.getPresignedUrl('u1')).rejects.toThrow('无权访问此文件')
  })
})

describe('另外三条预签名端点', () => {
  it('getExtendedPresignedUrl 解包 + 补基址', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({
        ...PRESIGNED_DATA,
        presigned_url: 'user-file/big.mp4?X-Amz-Signature=s',
        warning: '此链接将在24小时后过期',
      }),
    )

    const url = await storageApi.getExtendedPresignedUrl('u1', 86400)

    expect(url).toBe(`${getApiBaseUrl()}/user-file/big.mp4?X-Amz-Signature=s`)
    expect(fetchMock.mock.calls[0][0]).toBe(`${STORAGE_BASE}/file/u1/presigned_url/extended`)
  })

  it('getFriendFilePresignedUrl 解包 + 补基址，缓存里也是绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ ...PRESIGNED_DATA, presigned_url: 'friends-file/conv-a-b/x.jpg?X-Amz-Signature=s' }),
    )

    const first = await storageApi.getFriendFilePresignedUrl('u1')
    const second = await storageApi.getFriendFilePresignedUrl('u1')

    expect(first).toBe(`${getApiBaseUrl()}/friends-file/conv-a-b/x.jpg?X-Amz-Signature=s`)
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${STORAGE_BASE}/friends_file/u1/presigned_url`)
  })

  it('getFriendFileExtendedPresignedUrl 解包 + 补基址', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ ...PRESIGNED_DATA, presigned_url: 'friends-file/big.mp4?X-Amz-Signature=s' }),
    )

    const url = await storageApi.getFriendFileExtendedPresignedUrl('u1', 86400)

    expect(url).toBe(`${getApiBaseUrl()}/friends-file/big.mp4?X-Amz-Signature=s`)
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${STORAGE_BASE}/friends_file/u1/presigned_url/extended`,
    )
  })
})

describe('storageApi.getFileList', () => {
  it('从信封里取出真实的文件行和分页字段', async () => {
    fetchMock.mockResolvedValueOnce(envelope(FILE_LIST_DATA))

    const result = await storageApi.getFileList()

    expect(result.files).toHaveLength(1)
    expect(result.files[0].filename).toBe('example.jpg')
    expect(result.files[0].file_uuid).toBe('f5f23929-1689-4b04-98e7-0073fac1eea4')
    expect(result.total).toBe(45)
    expect(result.has_more).toBe(true)
  })

  it('每一行的 file_url 都被补成绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(envelope(FILE_LIST_DATA))

    const result = await storageApi.getFileList()

    expect(result.files[0].file_url).toBe(
      `${STORAGE_BASE}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
    )
    expect(result.files[0].file_url).not.toContain('/api/storage/api/storage/')
  })

  it('真的空列表仍是合法成功响应（空 ≠ 解析失败）', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ files: [], total: 0, page: 1, page_size: 20, total_pages: 0, has_more: false }),
    )

    const result = await storageApi.getFileList()

    expect(result.files).toEqual([])
    expect(result.total).toBe(0)
    expect(result.has_more).toBe(false)
  })

  it('files 为 null 时抛错，而不是安静地渲染成"暂无文件"', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ...FILE_LIST_DATA, files: null }))

    await expect(storageApi.getFileList()).rejects.toThrow(/files/)
  })

  it('裸响应（没有 data 包裹）抛错', async () => {
    fetchMock.mockResolvedValueOnce(ok(FILE_LIST_DATA))

    await expect(storageApi.getFileList()).rejects.toThrow(/data/)
  })

  it('行内字段类型不对时抛错并指出是第几行', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ ...FILE_LIST_DATA, files: [FILE_ITEM, { ...FILE_ITEM, file_size: '1048576' }] }),
    )

    await expect(storageApi.getFileList()).rejects.toThrow(/files\[1\]\.file_size/)
  })
})

describe('storageApi.uploadFile（整条链路）', () => {
  const file = () => new File(['hello'], 'a.jpg', { type: 'image/jpeg' })

  beforeEach(() => {
    // calculateFileHash 走 crypto.subtle，与本次迁移无关，固定掉以免依赖运行环境。
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
  })

  it('秒传分支返回绝对 URL，而不是 undefined', async () => {
    fetchMock.mockResolvedValueOnce(envelope(INSTANT_DATA))

    const result = await storageApi.uploadFile(file(), 'user_image', 'user_files')

    expect(result.isInstant).toBe(true)
    expect(result.fileUrl).toBe(
      `${STORAGE_BASE}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
    )
  })

  it('分片分支用后端给的 upload_id，绝不发出 upload_id=undefined', async () => {
    // 旧代码 `uploadInfo.multipart_upload_id!` 在字段为 null 时会把字面量
    // 字符串 "undefined" 塞进 URLSearchParams 发给后端。
    const uploadChunk = vi.spyOn(storageApi, 'uploadChunk').mockResolvedValue(undefined)
    fetchMock
      .mockResolvedValueOnce(envelope({ ...MULTIPART_DATA, total_chunks: 1 }))
      .mockResolvedValueOnce(
        envelope({
          part_url: 'https://api.huanvae.cn/user-file/x?partNumber=1&X-Amz-Signature=s',
          part_number: 1,
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(envelope(CONFIRM_DATA))

    const result = await storageApi.uploadFile(file(), 'user_image', 'user_files')

    const partUrlRequest = String(fetchMock.mock.calls[1][0])
    expect(partUrlRequest).toContain('upload_id=upload-id-xxx')
    expect(partUrlRequest).not.toContain('undefined')
    expect(uploadChunk).toHaveBeenCalledTimes(1)
    expect(result.isInstant).toBe(false)
    expect(result.fileUrl).toBe(
      `${STORAGE_BASE}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
    )
  })

  it('分片阶段的 409 一路传到调用点，仍然可分诊，且不会被静默重试', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope({ ...MULTIPART_DATA, total_chunks: 1 }))
      .mockResolvedValueOnce(
        ok({ success: false, code: 409, message: '上传会话已过期，请重新发起上传' }, 409),
      )

    const error = await storageApi
      .uploadFile(file(), 'user_image', 'user_files')
      .catch((e: unknown) => e)

    expect(isUploadSessionExpired(error)).toBe(true)
    expect((error as ApiError).message).toBe('上传会话已过期，请重新发起上传')
    // 没有静默重试：request + part_url 各一次，就地停下
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
