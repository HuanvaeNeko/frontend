import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAvatarUploadPayload, isUploadSessionExpired, storageApi } from '@/api/storage'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { getApiBaseUrl } from '@/lib/apiConfig'

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

// STORAGE_BASE 只用来匹配**请求 URL**：真实请求也是从同一个（硬编码的空串）
// 基址拼出来的根相对路径，Task 12 之后 getApiBaseUrl() 不再读任何环境变量。
//
// 响应体里的字段（file_url / existing_file_url / part_url…）经过 toAbsoluteApiUrl
// 之后落在 location.origin 上，不是这个基址——那些断言用 STORAGE_BASE_ABS，
// 两者不能混用，混用的后果是断言永远读到一个"空基址 + 路径"拼出来的半吊子字符串。
const STORAGE_BASE = `${getApiBaseUrl()}/api/storage`
const STORAGE_BASE_ABS = `${location.origin}/api/storage`

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
  // 会话制下 fetchWithAuth 不再读 token——同源 cookie 自动带上。
  useAuthStore.setState({ isAuthenticated: true, user: { user_id: 'me' } })
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
      `${STORAGE_BASE_ABS}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
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
  it('从信封里取出真实的 part_url / part_number（canonical host 落到同源）', async () => {
    // 基址永远是同源空串（Task 12 删除了「切换服务器」），不再有"基址是正式域名，
    // 地址原样保留"这种可配置的场景——api.huanvae.cn 的绝对地址**恒定**落到
    // location.origin，见 apiConfig.ts 的 rewriteCanonicalApiOrigin。
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
      `${location.origin}/user-file/x?uploadId=u&partNumber=1&X-Amz-Signature=s`,
    )
  })

  it('part_url 是浏览器 PUT 分片的目标：canonical host 只换 origin，路径与签名参数逐字保留', async () => {
    // part_url 本就是绝对地址（文档 :611-620），此前刻意不过 toAbsoluteApiUrl 以免被再拼一次基址。
    // 出口对正式域名只替换 origin、不拼路径：api.huanvae.cn 在阿里云被 ICP 备案拦截，
    // 分片必须落到 location.origin 才 PUT 得出去，签名参数一个字节不动
    // （BFF 反代转发时带 Host: api.huanvae.cn，SigV4 仍成立）。
    fetchMock.mockResolvedValueOnce(
      envelope({
        part_url: 'https://api.huanvae.cn/user-file/x?uploadId=u&partNumber=1&X-Amz-Signature=s',
        part_number: 1,
        expires_in: 3600,
      }),
    )

    const { part_url } = await storageApi.getPartUrl('k', 'up', 1)

    expect(part_url).toBe(
      `${location.origin}/user-file/x?uploadId=u&partNumber=1&X-Amz-Signature=s`,
    )
    // 仍然是"只换 origin"，不是"再拼一次基址"
    expect(part_url).not.toContain('https://')
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
      `${STORAGE_BASE_ABS}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
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
      `${location.origin}/user-file/alice/images/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=sig`,
    )
  })

  it('绝不会拼出双份 /api/storage 前缀', async () => {
    // 这一条专门抓"误用本文件顶部的 STORAGE_BASE_URL 拼接"——
    // 它已经带了 /api/storage 后缀，拼出来的地址比不拼还难查。
    fetchMock.mockResolvedValueOnce(envelope(PRESIGNED_DATA))

    const url = await storageApi.getPresignedUrl('u1')

    expect(url).not.toContain('/api/storage/user-file')
  })

  it('canonical host 的绝对地址被换成同源，签名参数不受影响', async () => {
    // 基址永远是同源空串（Task 12 删除了「切换服务器」）：不再有"基址就是正式域名，
    // 原样返回"这种可配置的 no-op 场景——api.huanvae.cn 在阿里云被 ICP 备案拦截，
    // 浏览器任何时候都连不上它，这条改写**恒定**发生。
    const absolute = 'https://api.huanvae.cn/user-file/x?X-Amz-Signature=s'
    fetchMock.mockResolvedValueOnce(envelope({ ...PRESIGNED_DATA, presigned_url: absolute }))

    expect(await storageApi.getPresignedUrl('u1')).toBe(`${location.origin}/user-file/x?X-Amz-Signature=s`)
  })

  it('canonical host 只换 origin，较复杂的签名参数（含百分号编码）逐字保留', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({
        ...PRESIGNED_DATA,
        presigned_url: 'https://api.huanvae.cn/user-file/x?X-Amz-Credential=k%2Faws4_request&X-Amz-Signature=s',
      }),
    )

    expect(await storageApi.getPresignedUrl('u1')).toBe(
      `${location.origin}/user-file/x?X-Amz-Credential=k%2Faws4_request&X-Amz-Signature=s`,
    )
  })

  it('带前导斜杠的相对路径不会拼出 //user-file', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ ...PRESIGNED_DATA, presigned_url: '/user-file/x?X-Amz-Signature=s' }),
    )

    const url = await storageApi.getPresignedUrl('u1')

    expect(url).toBe(`${location.origin}/user-file/x?X-Amz-Signature=s`)
    expect(url).not.toContain('//user-file')
  })

  it('缓存命中路径返回的也是绝对地址（只拼返回值不拼缓存是半吊子修法）', async () => {
    fetchMock.mockResolvedValueOnce(envelope(PRESIGNED_DATA))

    const first = await storageApi.getPresignedUrl('u1')
    const second = await storageApi.getPresignedUrl('u1')

    expect(second).toBe(first)
    expect(second).toBe(
      `${location.origin}/user-file/alice/images/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=sig`,
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

    expect(url).toBe(`${location.origin}/user-file/big.mp4?X-Amz-Signature=s`)
    expect(fetchMock.mock.calls[0][0]).toBe(`${STORAGE_BASE}/file/u1/presigned_url/extended`)
  })

  it('getFriendFilePresignedUrl 解包 + 补基址，缓存里也是绝对地址', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ ...PRESIGNED_DATA, presigned_url: 'friends-file/conv-a-b/x.jpg?X-Amz-Signature=s' }),
    )

    const first = await storageApi.getFriendFilePresignedUrl('u1')
    const second = await storageApi.getFriendFilePresignedUrl('u1')

    expect(first).toBe(`${location.origin}/friends-file/conv-a-b/x.jpg?X-Amz-Signature=s`)
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${STORAGE_BASE}/friends_file/u1/presigned_url`)
  })

  it('getFriendFileExtendedPresignedUrl 解包 + 补基址', async () => {
    fetchMock.mockResolvedValueOnce(
      envelope({ ...PRESIGNED_DATA, presigned_url: 'friends-file/big.mp4?X-Amz-Signature=s' }),
    )

    const url = await storageApi.getFriendFileExtendedPresignedUrl('u1', 86400)

    expect(url).toBe(`${location.origin}/friends-file/big.mp4?X-Amz-Signature=s`)
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
      `${STORAGE_BASE_ABS}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
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
      `${STORAGE_BASE_ABS}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
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
      `${STORAGE_BASE_ABS}/file/f5f23929-1689-4b04-98e7-0073fac1eea4`,
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

/**
 * 批 5：头像三档共用的四步链路。
 *
 * 群头像那一档的端到端断言在 `features/chat/api/__tests__/groups.test.ts` 里
 * （它才是本批真正接线的消费者）。这里只钉两件**共用层**的事：
 * ① 另外两档（profile 那一批要用的）的请求体形状；② 头像档不接受秒传响应。
 */
describe('storageApi.uploadAvatar（三档共用层）', () => {
  const pngFile = () => new File(['x'], 'me.png', { type: 'image/png' })

  const AVATAR_SESSION = {
    mode: 'multipart',
    preview_support: 'inline_preview',
    multipart_upload_id: 'upload-id-avatar',
    expires_in: 3600,
    chunk_size: 31457280,
    total_chunks: 1,
    file_key: 'alice.png',
    max_file_size: 10485760,
    instant_upload: false,
    existing_file_url: null,
  }

  beforeEach(() => {
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
    vi.spyOn(storageApi, 'uploadChunk').mockResolvedValue(undefined)
  })

  it('user_avatar 档不带 related_id——带了就是 400（文档 :119）', async () => {
    // profile 那一批（`POST /api/profile/avatar` 同批删除）要用的正是这一支：
    // 与群头像只差 avatar_target 与"不传 related_id"两处。
    fetchMock
      .mockResolvedValueOnce(envelope(AVATAR_SESSION))
      .mockResolvedValueOnce(
        envelope({ part_url: 'https://api.huanvae.cn/avatars/a?X-Amz-Signature=s', part_number: 1, expires_in: 3600 }),
      )
      .mockResolvedValueOnce(envelope({ ...CONFIRM_DATA, file_url: 'avatars/alice.png?t=1' }))

    const result = await storageApi.uploadAvatar(pngFile(), { avatar_target: 'user_avatar' })

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toEqual({
      file_type: 'avatar',
      storage_location: 'avatars',
      avatar_target: 'user_avatar',
      filename: 'me.png',
      file_size: 1,
      content_type: 'image/png',
      file_hash: '0'.repeat(64),
    })
    // ⚠️ 这一条钉的是**序列化结果**，不是构造方式：`JSON.stringify` 会丢掉值为
    // undefined 的键，所以无论 payload 里写没写 `related_id: undefined`，它都通过。
    // "键在但值是 undefined"这个具体错法由下面 buildAvatarUploadPayload 那组
    // `Object.hasOwn` 断言负责——这里留着是因为"线上真的发出去的 body 长这样"
    // 本身值得钉住。
    expect('related_id' in body).toBe(false)
    expect(result.file_url).toBe(`${location.origin}/avatars/alice.png?t=1`)
  })

  it('头像档收到 instant_upload:true ⇒ 形状错误，不会把秒传 URL 当头像用', async () => {
    // 文档 :140-141：avatars 落点服务端强制 instant_upload=false。真收到 true
    // 只可能是请求被路由去了别的落点（双向绑定被写坏）或后端行为变了；
    // 顺着秒传分支走会把 `api/storage/file/{uuid}` 写进头像字段，
    // 而后端**根本没写** groups."group-avatar-url"。
    fetchMock.mockResolvedValueOnce(envelope(INSTANT_DATA))

    await expect(
      storageApi.uploadAvatar(pngFile(), { avatar_target: 'user_background' }),
    ).rejects.toThrow(/instant_upload/)

    // 没有往下走链路
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('不同落点各占一个单飞位，互不阻塞', async () => {
    // 单飞是按"落点"而不是按"整个客户端"锁的：换头像不该挡住换背景图。
    let releaseAvatar: (value: Response) => void = () => {}
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => { releaseAvatar = resolve }))
      .mockResolvedValueOnce(envelope(AVATAR_SESSION))
      .mockResolvedValueOnce(
        envelope({ part_url: 'https://api.huanvae.cn/avatars/b?X-Amz-Signature=s', part_number: 1, expires_in: 3600 }),
      )
      .mockResolvedValueOnce(envelope({ ...CONFIRM_DATA, file_url: 'avatars/alice-bg.png?t=1' }))

    const avatar = storageApi.uploadAvatar(pngFile(), { avatar_target: 'user_avatar' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await expect(
      storageApi.uploadAvatar(pngFile(), { avatar_target: 'user_background' }),
    ).resolves.toBeTruthy()

    releaseAvatar(ok({ success: false, code: 400, message: '文件大小超过限制' }, 400))
    await expect(avatar).rejects.toThrow('文件大小超过限制')
  })

  it('刚过线的文件不会收到「最大 10MB，当前: 10.00 MB」这种自相矛盾的话', async () => {
    // 10 MiB + 1 字节：`(10485761/1024/1024).toFixed(2)` 就是 `"10.00"`，
    // 只报 MB 值时这句话在字面上说的是"没超"。后端那一档的文案带的是**实际字节数**
    // （`个人资料管理.md:444`），客户端这一道便利检查照抄那个口径。
    const oversized = new File(['x'], 'me.png', { type: 'image/png' })
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 })

    const error = await storageApi
      .uploadAvatar(oversized, { avatar_target: 'user_avatar' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    // 正对照：这一句确实是那道大小闸抛的，而不是别的什么错误碰巧带了字节数。
    expect((error as Error).message).toContain('文件太大')
    expect((error as Error).message).toContain('10485761')
    // 本条的正身：把字节数删回纯 MB 文案 → 立刻红。
    expect((error as Error).message).not.toBe('文件太大，最大 10MB，当前: 10.00 MB')
    // 一个字节都没往外发（客户端这道闸的全部价值就是省掉这次往返）。
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/**
 * `buildAvatarUploadPayload` 的直接单测。
 *
 * 为什么不能只靠上面那些 wire-level 断言：它们全都读
 * `JSON.parse(String(init.body))`，而 `JSON.stringify` 会**丢掉值为 undefined 的键**。
 * 于是 `{ ...base }` 和 `{ ...base, related_id: undefined }` 序列化后逐字相同，
 * `toEqual` 和 `'related_id' in body` 对两者都是绿的——恰恰测不出周围注释警告的那个
 * 错法。文档 :119 的规则是「**携带这个键**就是 400」，判据在对象上，不在 JSON 上。
 *
 * 所以这一组一律断言**返回值这个对象本身**：`Object.hasOwn` / `in` 直接看键在不在。
 */
describe('buildAvatarUploadPayload（返回值这个对象本身，不走 JSON 往返）', () => {
  const pngFile = () => new File(['x'], 'me.png', { type: 'image/png' })
  const HASH = '0'.repeat(64)

  it.each(['user_avatar', 'user_background'] as const)(
    '%s 档：返回的对象上根本没有 related_id 这个键（不是"键在但值是 undefined"）',
    (avatar_target) => {
      const payload = buildAvatarUploadPayload(pngFile(), { avatar_target }, HASH)

      expect(Object.hasOwn(payload, 'related_id')).toBe(false)
      expect('related_id' in payload).toBe(false)
      expect(Object.keys(payload)).not.toContain('related_id')
    },
  )

  it('group_avatar 档：related_id 这个键存在，值就是传进来的群 UUID', () => {
    const groupId = '019ae4ec-0dfe-7ac1-966e-876e9755561c'

    const payload = buildAvatarUploadPayload(pngFile(), {
      avatar_target: 'group_avatar',
      related_id: groupId,
    }, HASH)

    expect(Object.hasOwn(payload, 'related_id')).toBe(true)
    expect(payload.related_id).toBe(groupId)
  })

  it('群 UUID 原样透传：大小写变体逐字进 payload，客户端不做归一', () => {
    // 服务端自 2026-08-29 起把 UUID 归一成规范小写再拼 object key（群聊文档 :308-312），
    // 客户端**不必**自己归一。小写化只发生在单飞键里（同一个对象 = 同一个锁位），
    // 请求体这一侧原样透传。
    const mixedCase = '019AE4EC-0DFE-7AC1-966E-876E9755561C'

    const payload = buildAvatarUploadPayload(pngFile(), {
      avatar_target: 'group_avatar',
      related_id: mixedCase,
    }, HASH)

    expect(payload.related_id).toBe(mixedCase)
    expect(payload.related_id).not.toBe(mixedCase.toLowerCase())
  })

  it('file_type=avatar 与 storage_location=avatars 成对写死（双向绑定，文档 :136-139）', () => {
    // 任一侧单独出现都是 400，而这条绑定是 10 MB 上限的承重件。
    const payload = buildAvatarUploadPayload(pngFile(), { avatar_target: 'user_avatar' }, HASH)

    expect(payload).toEqual({
      file_type: 'avatar',
      storage_location: 'avatars',
      avatar_target: 'user_avatar',
      filename: 'me.png',
      file_size: 1,
      content_type: 'image/png',
      file_hash: HASH,
    })
  })
})
