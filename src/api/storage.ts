import { getApiBaseUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ApiError, type Parser, readEnvelope } from '@/lib/apiEnvelope'
import { ROUTES } from '@/lib/routes'

/**
 * ⚠️ 这个常量**只能用来拼接端点路径**，不能用来把后端返回的相对路径补成绝对地址。
 *
 * 它已经带了 `/api/storage` 后缀，而 `file_url` 返回的相对路径本身就是
 * `api/storage/file/{uuid}`（`backend-docs/storage/文件存储管理.md:45-49`），
 * 用它去拼会得到 `https://api.huanvae.cn/api/storage/api/storage/file/{uuid}`——
 * 比不拼更难查。补基址一律用 {@link toAbsoluteApiUrl}（它在 `apiConfig.ts` 里，
 * 紧挨着 `getApiBaseUrl()`，正是为了让这个坑在结构上不存在）。
 */
const STORAGE_BASE_URL = `${getApiBaseUrl()}/api/storage`

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

// 带自动重试的 fetch 封装
const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const authStore = useAuthStore.getState()
  
  if (authStore.checkTokenExpiry() && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
    } catch (error) {
      console.error('Failed to refresh token:', error)
    }
  }

  const headers = getAuthHeaders()
  
  let response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  if (response.status === 401 && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
      const newHeaders = getAuthHeaders()
      response = await fetch(url, {
        ...options,
        headers: {
          ...newHeaders,
          ...options.headers,
        },
      })
    } catch (error) {
      console.error('Token refresh failed, redirecting to login')
      authStore.clearAuth()
      window.location.href = ROUTES.auth.login
      throw error
    }
  }

  return response
}

// ============================================
// 类型定义
// ============================================

export type FileType = 
  | 'user_image' | 'user_video' | 'user_document'
  | 'friend_image' | 'friend_video' | 'friend_document'
  | 'group_image' | 'group_video' | 'group_document'

export type StorageLocation = 'user_files' | 'friend_messages' | 'group_files' | 'avatars'

export interface UploadRequestPayload {
  file_type: FileType
  storage_location: StorageLocation
  related_id?: string | null
  filename: string
  file_size: number
  content_type: string
  file_hash?: string
  force_upload?: boolean
  estimated_upload_time?: number
  image_width?: number
  image_height?: number
}

/** `POST /api/storage/upload/request` 两种响应共有的字段。 */
interface UploadRequestBase {
  mode: string
  preview_support: string
  file_key: string
  max_file_size: number
  expires_in: number | null
  /** 好友文件秒传/上传时后端会顺带插入一条消息并回传这两个字段。 */
  message_uuid?: string
  message_send_time?: string
}

/**
 * 秒传（UUID 映射命中）响应：`instant_upload: true`。
 *
 * 文档 `backend-docs/storage/文件存储管理.md:187-205`：这一档
 * `multipart_upload_id` / `chunk_size` / `total_chunks` **恒为 `null`**，
 * 而 `existing_file_url` 必有值。
 */
export interface InstantUploadResponse extends UploadRequestBase {
  instant_upload: true
  /** 已在 api 出口补成绝对地址（后端给的是 `api/storage/file/{uuid}`）。 */
  existing_file_url: string
  multipart_upload_id: null
  chunk_size: null
  total_chunks: null
}

/**
 * 分片上传会话响应：`instant_upload: false`。
 *
 * 文档 :167-182：这一档 `multipart_upload_id` / `chunk_size` / `total_chunks`
 * 三个字段**必有值**，`existing_file_url` 为 `null`。
 *
 * 把它和 {@link InstantUploadResponse} 拆成可辨识联合，是为了让
 * `uploadInfo.multipart_upload_id!` 这种非空断言**写不出来**：
 * 旧代码用 `!` 强推，字段真为 null 时会把字面量 `upload_id=undefined`
 * 发给后端，错误延后到分片 PUT 才炸，日志指向错误的环节。
 */
export interface MultipartUploadSession extends UploadRequestBase {
  instant_upload: false
  existing_file_url: null
  multipart_upload_id: string
  chunk_size: number
  total_chunks: number
}

export type UploadRequestResponse = InstantUploadResponse | MultipartUploadSession

export interface UploadDirectResponse {
  file_url: string
  file_key: string
  file_size: number
  content_type: string
  preview_support: string
  // 好友文件上传时返回
  message_uuid?: string
  message_send_time?: string
}

export interface ConfirmUploadResponse {
  /** 已在 api 出口补成绝对地址（后端给的是 `api/storage/file/{uuid}`）。 */
  file_url: string
  file_key: string
  file_size: number
  content_type: string
  preview_support: string
  // 好友文件上传时返回
  message_uuid?: string
  message_send_time?: string
}

export interface PartUrlResponse {
  /**
   * ⚠️ 这一个**本来就是绝对地址**（文档 :611-620 的示例是
   * `https://api.huanvae.cn/user-file/xxx?...`），是 storage 里唯一不需要补基址的
   * URL 字段。别顺手给它套 `toAbsoluteApiUrl`——文档 :45-49 的相对路径表里没有它。
   */
  part_url: string
  part_number: number
  expires_in: number
}

export interface PresignedUrlResponse {
  /** 已在 api 出口补成绝对地址（后端给的是 `user-file/xxx?X-Amz-Signature=...`）。 */
  presigned_url: string
  expires_at: string
  file_uuid: string
  file_size: number
  content_type: string
  warning: string | null
}

export interface FileItem {
  file_uuid: string
  filename: string
  file_size: number
  content_type: string
  preview_support: string
  created_at: string
  file_url: string
  file_hash: string
}

export interface FileListResponse {
  files: FileItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
  has_more: boolean
}

// ============================================
// 响应校验器（喂给 readEnvelope 的 parse 档）
// ============================================

/**
 * 这一组校验器全部走 {@link readEnvelope} 的 `parse` 档，而不是更省事的 `require`。
 *
 * 原因是 `require` 判定的是"键存在且不为 undefined"，`null` 算存在
 * （见 `apiEnvelope.ts` 里 {@link EnvelopeOptions.require} 的 JSDoc）。
 * 而 storage 这批 bug 的核心恰恰是 `null`：`chunk_size: null` 被 `|| 30MB` 兜掉、
 * `multipart_upload_id: null` 被 `!` 强推成 `upload_id=undefined`。
 * 用 `require` 迁移等于把同一个坑换了个位置继续踩。
 *
 * 校验失败时 `readEnvelope` 会抛 `ApiShapeError` 并上报——**没有任何默认值**。
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function asRecord(input: unknown, what: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(`${what} 应为对象，实际是 ${input === null ? 'null' : Array.isArray(input) ? 'array' : typeof input}`)
  }
  return input
}

/** 非空字符串；空串和纯空白都算缺失（`toAbsoluteApiUrl('')` 会返回 undefined）。 */
function str(payload: Record<string, unknown>, key: string, prefix = ''): string {
  const value = payload[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${prefix}${key} 缺失或不是非空字符串`)
  }
  return value
}

function num(payload: Record<string, unknown>, key: string, prefix = ''): number {
  const value = payload[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${prefix}${key} 缺失或不是有限数字`)
  }
  return value
}

/** 文档写明"存在但可为 null"的数字字段：缺键仍然算错，`null` 才是合法的空。 */
function nullableNum(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key]
  if (value === null) return null
  return num(payload, key)
}

function nullableStr(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (value === null) return null
  return str(payload, key)
}

function bool(payload: Record<string, unknown>, key: string, prefix = ''): boolean {
  const value = payload[key]
  if (typeof value !== 'boolean') {
    throw new Error(`${prefix}${key} 缺失或不是布尔值`)
  }
  return value
}

/** 只在好友/群文件上传时出现，缺席是正常的；出现了就必须是非空字符串。 */
function optionalStr(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  if (value === undefined || value === null) return undefined
  return str(payload, key)
}

/**
 * `POST /api/storage/upload/request`。
 *
 * 除字段类型外还校验**跨字段不变量**——`instant_upload` 是这个响应的判别式：
 * 秒传必有 `existing_file_url`、分片档必有 `multipart_upload_id`/`chunk_size`/
 * `total_chunks`（文档 :167-205 两份响应示例）。把这条校验放在解包处而不是
 * `uploadWithMultipart` 里，是因为这里才拿得到 Response：失败时 `readEnvelope`
 * 抛的是带 endpoint + payload 的 `ApiShapeError` 并会走上报，
 * 而放在下游只能抛一个没有出处的裸 Error。
 */
const uploadRequestResponse: Parser<UploadRequestResponse> = {
  parse(input: unknown): UploadRequestResponse {
    const payload = asRecord(input, 'upload/request 的 data')
    const base: UploadRequestBase = {
      mode: str(payload, 'mode'),
      preview_support: str(payload, 'preview_support'),
      file_key: str(payload, 'file_key'),
      max_file_size: num(payload, 'max_file_size'),
      expires_in: nullableNum(payload, 'expires_in'),
      message_uuid: optionalStr(payload, 'message_uuid'),
      message_send_time: optionalStr(payload, 'message_send_time'),
    }

    if (bool(payload, 'instant_upload')) {
      return {
        ...base,
        instant_upload: true,
        // 相对路径 → 绝对地址，在 api 出口做一次（文档 :46）
        existing_file_url: toAbsoluteApiUrl(str(payload, 'existing_file_url')),
        multipart_upload_id: null,
        chunk_size: null,
        total_chunks: null,
      }
    }

    return {
      ...base,
      instant_upload: false,
      existing_file_url: null,
      multipart_upload_id: str(payload, 'multipart_upload_id'),
      chunk_size: num(payload, 'chunk_size'),
      total_chunks: num(payload, 'total_chunks'),
    }
  },
}

/** `POST /api/storage/upload/confirm`（文档 :484-515）。`file_url` 出口补基址。 */
const confirmUploadResponse: Parser<ConfirmUploadResponse> = {
  parse(input: unknown): ConfirmUploadResponse {
    const payload = asRecord(input, 'upload/confirm 的 data')
    return {
      file_url: toAbsoluteApiUrl(str(payload, 'file_url')),
      file_key: str(payload, 'file_key'),
      file_size: num(payload, 'file_size'),
      content_type: str(payload, 'content_type'),
      preview_support: str(payload, 'preview_support'),
      message_uuid: optionalStr(payload, 'message_uuid'),
      message_send_time: optionalStr(payload, 'message_send_time'),
    }
  },
}

/** `GET /api/storage/multipart/part_url`（文档 :611-620）。`part_url` 本就是绝对地址。 */
const partUrlResponse: Parser<PartUrlResponse> = {
  parse(input: unknown): PartUrlResponse {
    const payload = asRecord(input, 'multipart/part_url 的 data')
    return {
      part_url: str(payload, 'part_url'),
      part_number: num(payload, 'part_number'),
      expires_in: num(payload, 'expires_in'),
    }
  },
}

/** 四条预签名端点共用（文档 :1262-1280、:1823-1838）。`presigned_url` 出口补基址。 */
const presignedUrlResponse: Parser<PresignedUrlResponse> = {
  parse(input: unknown): PresignedUrlResponse {
    const payload = asRecord(input, 'presigned_url 的 data')
    return {
      presigned_url: toAbsoluteApiUrl(str(payload, 'presigned_url')),
      expires_at: str(payload, 'expires_at'),
      file_uuid: str(payload, 'file_uuid'),
      file_size: num(payload, 'file_size'),
      content_type: str(payload, 'content_type'),
      warning: nullableStr(payload, 'warning'),
    }
  },
}

/**
 * `GET /api/storage/files`（文档 :1960-2013、字段表 :2148-2172）。
 *
 * 逐行校验而不是 `require: ['files']`：`{files: null}` 会让 `require` 放行，
 * 把 `TypeError` 推迟到 `FileManager` 的 `setFiles(response.files)` 之后再 `.map`。
 * 每一行的 `file_url` 也在这里补成绝对地址。
 */
const fileListResponse: Parser<FileListResponse> = {
  parse(input: unknown): FileListResponse {
    const payload = asRecord(input, 'storage/files 的 data')
    const rows = payload.files
    if (!Array.isArray(rows)) {
      throw new Error(`files 应为数组，实际是 ${rows === null ? 'null' : typeof rows}`)
    }

    return {
      files: rows.map((row, index) => {
        const item = asRecord(row, `files[${index}]`)
        const prefix = `files[${index}].`
        return {
          file_uuid: str(item, 'file_uuid', prefix),
          filename: str(item, 'filename', prefix),
          file_size: num(item, 'file_size', prefix),
          content_type: str(item, 'content_type', prefix),
          preview_support: str(item, 'preview_support', prefix),
          created_at: str(item, 'created_at', prefix),
          file_url: toAbsoluteApiUrl(str(item, 'file_url', prefix)),
          file_hash: str(item, 'file_hash', prefix),
        }
      }),
      total: num(payload, 'total'),
      page: num(payload, 'page'),
      page_size: num(payload, 'page_size'),
      total_pages: num(payload, 'total_pages'),
      has_more: bool(payload, 'has_more'),
    }
  },
}

/**
 * 上传会话已死（HTTP 409），**必须回到第 1 步 `upload/request` 重来**。
 *
 * 文档 :526-534（confirm）与 :625-645（part_url）：2026-08-29 起这两条端点用
 * 409 表达"这个上传会话已经不是你能继续的那一个了——被接管 / 已过期 / 已失效 /
 * 状态已变更 / 竞态，**重发同一条请求永远不会成功**"；400 才是"改一下参数就可能成功"。
 * 文档同时写明「分诊规则只有一条，请按状态码分支、**不要做文案匹配**」——
 * 旧文案 `文件记录不存在或已过期` 后端已不再产生，任何字符串匹配都是死代码。
 *
 * 旧代码 `throw new Error(error.error || '获取分片URL失败')` 把状态码整个丢掉，
 * 409 和 400 在调用点无法区分，重试按钮只会原地重发一条必然失败的请求。
 * 现在 `readEnvelope` 抛的 `ApiError` 保留了 `status`，用这个谓词分诊即可。
 *
 * ⚠️ 本函数只做**识别**。自动重走整条上传流程（session restart）是单独的功能，
 * 不在这一批里；**不要**在这里偷偷重试——文档 :643-645 明确并发发起
 * `upload/request` 会让先手方的所有 part_url/confirm 变 409，盲目重试会互相打架。
 */
export function isUploadSessionExpired(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409
}

// ============================================
// 工具函数
// ============================================

const SAMPLE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * 计算文件的采样 SHA-256 哈希
 * - 小文件 (< 30MB): 完整哈希
 * - 大文件 (>= 30MB): 采样哈希（元信息 + 开头/中间/结尾各10MB）
 * 
 * 注意: 只包含文件大小和内容,不包含文件名等元信息,确保相同内容产生相同哈希
 */
export async function calculateFileHash(file: File): Promise<string> {
  // 只包含文件大小信息,不包含文件名等元信息
  const sizeBuffer = new TextEncoder().encode(`|size:${file.size}|`)
  
  let dataToHash: Uint8Array
  
  if (file.size <= SAMPLE_SIZE * 3) {
    // 小文件：计算完整哈希
    const fileBuffer = new Uint8Array(await file.arrayBuffer())
    dataToHash = new Uint8Array(sizeBuffer.length + fileBuffer.length)
    dataToHash.set(sizeBuffer, 0)
    dataToHash.set(fileBuffer, sizeBuffer.length)
  } else {
    // 大文件：采样哈希策略
    const chunks: Uint8Array[] = []
    
    // 读取开头10MB
    const startBlob = file.slice(0, SAMPLE_SIZE)
    chunks.push(new Uint8Array(await startBlob.arrayBuffer()))
    
    // 读取中间10MB
    const middleStart = Math.floor((file.size - SAMPLE_SIZE) / 2)
    const middleBlob = file.slice(middleStart, middleStart + SAMPLE_SIZE)
    chunks.push(new Uint8Array(await middleBlob.arrayBuffer()))
    
    // 读取结尾10MB
    const endBlob = file.slice(file.size - SAMPLE_SIZE, file.size)
    chunks.push(new Uint8Array(await endBlob.arrayBuffer()))
    
    // 合并所有数据
    const totalLength = sizeBuffer.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    dataToHash = new Uint8Array(totalLength)
    let offset = 0
    
    dataToHash.set(sizeBuffer, offset)
    offset += sizeBuffer.length
    
    for (const chunk of chunks) {
      dataToHash.set(chunk, offset)
      offset += chunk.length
    }
  }
  
  // 计算 SHA-256 哈希
  const bufferToHash = dataToHash.buffer.slice(
    dataToHash.byteOffset, 
    dataToHash.byteOffset + dataToHash.byteLength
  ) as ArrayBuffer
  const hashBuffer = await crypto.subtle.digest('SHA-256', bufferToHash)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

// ============================================
// 预签名 URL 缓存
// ============================================

interface CachedPresignedUrl {
  url: string
  expiresAt: string
  cachedAt: string
}

const presignedUrlCache: Record<string, CachedPresignedUrl> = {}

// ============================================
// API 方法
// ============================================

export const storageApi = {
  /**
   * 请求文件上传
   * POST /api/storage/upload/request
   */
  requestUpload: async (payload: UploadRequestPayload): Promise<UploadRequestResponse> => {
    console.log('📤 请求上传:', payload.filename)
    const response = await fetchWithAuth(`${STORAGE_BASE_URL}/upload/request`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    // 旧代码 `const data = await response.json()` 直接把**信封**当成了 data
    // （文档 :163-205 的响应示例里，真实字段全在 `data` 下一层），于是
    // `data.instant_upload` 恒为 undefined、`data.chunk_size` 恒为 undefined，
    // 再被下游的 `|| 30MB` / `!` 兜住，整条上传拿着一堆 undefined 往下跑。
    const data = await readEnvelope<UploadRequestResponse>(response, {
      endpoint: 'POST /api/storage/upload/request',
      fallbackMessage: '请求上传失败',
      parse: uploadRequestResponse,
    })

    if (data.instant_upload) {
      console.log('⚡ 秒传成功!')
    }

    return data
  },

  /**
   * 获取分片上传 URL
   * GET /api/storage/multipart/part_url?file_key=xxx&upload_id=xxx&part_number=1
   */
  getPartUrl: async (
    fileKey: string,
    uploadId: string,
    partNumber: number
  ): Promise<PartUrlResponse> => {
    const params = new URLSearchParams({
      file_key: fileKey,
      upload_id: uploadId,
      part_number: partNumber.toString(),
    })

    const response = await fetchWithAuth(`${STORAGE_BASE_URL}/multipart/part_url?${params}`, {
      method: 'GET',
    })

    // 409 会原样带着 status 抛出来，用 isUploadSessionExpired 分诊（文档 :625-645）。
    return readEnvelope<PartUrlResponse>(response, {
      endpoint: 'GET /api/storage/multipart/part_url',
      fallbackMessage: '获取分片URL失败',
      parse: partUrlResponse,
    })
  },

  /**
   * 上传单个分片
   */
  uploadChunk: async (url: string, chunk: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(new Error(`分片上传失败: HTTP ${xhr.status}`))
        }
      }
      
      xhr.onerror = () => reject(new Error('网络错误'))
      
      xhr.open('PUT', url)
      xhr.send(chunk)
    })
  },

  /**
   * 分片上传文件（带进度回调）
   */
  uploadWithMultipart: async (
    file: File,
    uploadInfo: MultipartUploadSession,
    onProgress?: (progress: {
      percent: number
      loaded: number
      total: number
      currentChunk: number
      totalChunks: number
    }) => void
  ): Promise<void> => {
    // 这里曾经是 `uploadInfo.chunk_size || 30MB` 和 `uploadInfo.total_chunks ||
    // Math.ceil(...)`：后端少给字段时不报错，而是自己编一个分片方案接着跑，
    // 于是"信封没解包"这件事被伪装成了一次正常上传，错误延后到分片 PUT 才炸。
    //
    // 现在这三个字段由 uploadRequestResponse 在解包处校验，缺任何一个直接抛
    // ApiShapeError —— **防线是那个运行时 parser，不是类型**。
    //
    // ⚠️ 不要以为可辨识联合让旧写法"写不出来"了：实测把
    // `chunk_size || 30MB` 和 `multipart_upload_id!` 原样还原，
    // `tsc --noEmit` 照样通过（TS 允许在非空类型上写冗余 `!`，也允许在
    // number 上写 `||`）。联合类型的价值是文档和调用点便利，不是强制。
    // 真正钉住这件事的是 storage.test.ts 里那组 parser 校验用例——
    // 删掉校验会让它们变红，删掉联合类型不会。
    const { chunk_size: chunkSize, total_chunks: totalChunks } = uploadInfo

    let totalUploaded = 0

    for (let i = 0; i < totalChunks; i++) {
      // 1. 获取分片预签名URL
      const { part_url } = await storageApi.getPartUrl(
        uploadInfo.file_key,
        uploadInfo.multipart_upload_id,
        i + 1
      )

      // 2. 切割分片
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      
      // 3. 上传分片
      await storageApi.uploadChunk(part_url, chunk)
      
      // 4. 更新进度
      totalUploaded += chunk.size
      if (onProgress) {
        onProgress({
          percent: (totalUploaded / file.size) * 100,
          loaded: totalUploaded,
          total: file.size,
          currentChunk: i + 1,
          totalChunks,
        })
      }
    }
  },

  /**
   * 确认上传完成（预签名上传专用）
   * POST /api/storage/upload/confirm
   */
  confirmUpload: async (fileKey: string): Promise<ConfirmUploadResponse> => {
    console.log('✅ 确认上传完成:', fileKey)
    const response = await fetchWithAuth(`${STORAGE_BASE_URL}/upload/confirm`, {
      method: 'POST',
      body: JSON.stringify({ file_key: fileKey }),
    })

    // 旧代码只读 `error.error`，而本端点的失败文案文档写明在 **`message`** 字段
    // （文档 :535「逐档明细（文案为服务端原文，`message` 字段）」），于是 12 档
    // 真实原因——包括「尚未上传任何分片，请先上传分片再确认」和头像档的
    // 「文件大小超过限制: 最大 10 MB（实际 {n} 字节）」——全被 `|| '确认上传失败'`
    // 替换成了一句什么也没说的通用文案。readEnvelope 的取值顺序
    // （message → error → details → HTTP 片段）一次性覆盖了这两种字段名。
    const data = await readEnvelope<ConfirmUploadResponse>(response, {
      endpoint: 'POST /api/storage/upload/confirm',
      fallbackMessage: '确认上传失败',
      parse: confirmUploadResponse,
    })

    console.log('✅ 上传确认成功')
    return data
  },

  /**
   * 完整的文件上传流程（分片上传 + confirm确认）
   * 包含哈希计算、秒传检测、分片上传、确认
   */
  uploadFile: async (
    file: File,
    fileType: FileType,
    storageLocation: StorageLocation,
    relatedId?: string,
    onProgress?: (progress: {
      percent: number
      loaded: number
      total: number
      currentChunk: number
      totalChunks: number
    }) => void
  ): Promise<{ fileUrl: string; isInstant: boolean; messageUuid?: string }> => {
    console.log('🔄 开始上传流程:', file.name)
    
    // 1. 计算文件哈希
    console.log('🔢 计算文件哈希...')
    const fileHash = await calculateFileHash(file)
    
    // 2. 请求上传
    const uploadInfo = await storageApi.requestUpload({
      file_type: fileType,
      storage_location: storageLocation,
      related_id: relatedId,
      filename: file.name,
      file_size: file.size,
      content_type: file.type,
      file_hash: fileHash,
      force_upload: false,
    })
    
    // 3. 检查秒传
    //
    // 旧写法是 `uploadInfo.existing_file_url!`：秒传分支拿不到 URL 时返回
    // undefined 而不是报错，ChatWindow 那边 `fileUrl.split('/')` 才崩。
    // 现在 instant_upload 是可辨识联合的判别式，这个分支里 existing_file_url
    // 由类型保证是非空字符串（且已在解包处补成绝对地址），`!` 没有存在的余地。
    if (uploadInfo.instant_upload) {
      console.log('⚡ 秒传成功!')
      return {
        fileUrl: uploadInfo.existing_file_url,
        isInstant: true,
        messageUuid: uploadInfo.message_uuid,
      }
    }

    // 4. 分片上传
    console.log(`📤 开始分片上传: ${uploadInfo.total_chunks} 个分片`)
    await storageApi.uploadWithMultipart(file, uploadInfo, onProgress)
    
    // 5. 确认上传完成
    console.log('✅ 确认上传...')
    const confirmResult = await storageApi.confirmUpload(uploadInfo.file_key)
    
    console.log('✅ 上传成功!')
      return {
      fileUrl: confirmResult.file_url,
        isInstant: false,
      messageUuid: confirmResult.message_uuid,
    }
  },

  /**
   * 获取文件预签名 URL（普通文件）
   * POST /api/storage/file/{uuid}/presigned_url
   */
  getPresignedUrl: async (
    uuid: string,
    operation: 'download' | 'preview' = 'download'
  ): Promise<string> => {
    // 检查缓存
    const cached = presignedUrlCache[uuid]
    if (cached && cached.expiresAt) {
      const expiresTime = new Date(cached.expiresAt)
      const now = new Date()
      const remainingMs = expiresTime.getTime() - now.getTime()
      
      // 还有5分钟以上，使用缓存
      if (remainingMs > 5 * 60 * 1000) {
        console.log('✅ 使用缓存的预签名URL')
        return cached.url
      }
    }
    
    console.log('🔗 获取预签名URL:', uuid)
    const response = await fetchWithAuth(`${STORAGE_BASE_URL}/file/${uuid}/presigned_url`, {
      method: 'POST',
      body: JSON.stringify({ operation }),
    })

    const data = await readEnvelope<PresignedUrlResponse>(response, {
      endpoint: 'POST /api/storage/file/{uuid}/presigned_url',
      fallbackMessage: '获取预签名URL失败',
      parse: presignedUrlResponse,
    })

    // 缓存里存的是**绝对地址**（parse 出口已经补过基址）。
    // 只补返回值不补缓存的话，第二次调用命中缓存又会拿到相对路径——
    // 这种"半吊子修法"只测第一次调用是抓不出来的。
    presignedUrlCache[uuid] = {
      url: data.presigned_url,
      expiresAt: data.expires_at,
      cachedAt: new Date().toISOString(),
    }

    if (data.warning) {
      console.warn('⚠️', data.warning)
    }

    return data.presigned_url
  },

  /**
   * 获取扩展预签名 URL（超大文件）
   * POST /api/storage/file/{uuid}/presigned_url/extended
   */
  getExtendedPresignedUrl: async (
    uuid: string,
    estimatedDownloadTimeSeconds: number
  ): Promise<string> => {
    console.log('🔗 获取扩展预签名URL:', uuid)
    const response = await fetchWithAuth(`${STORAGE_BASE_URL}/file/${uuid}/presigned_url/extended`, {
      method: 'POST',
      body: JSON.stringify({
        operation: 'download',
        estimated_download_time: estimatedDownloadTimeSeconds,
      }),
    })

    const data = await readEnvelope<PresignedUrlResponse>(response, {
      endpoint: 'POST /api/storage/file/{uuid}/presigned_url/extended',
      fallbackMessage: '获取扩展预签名URL失败',
      parse: presignedUrlResponse,
    })

    if (data.warning) {
      console.warn('⚠️', data.warning)
    }

    return data.presigned_url
  },

  /**
   * 获取好友文件预签名 URL
   * POST /api/storage/friends_file/{uuid}/presigned_url
   */
  getFriendFilePresignedUrl: async (
    uuid: string,
    operation: 'download' | 'preview' = 'preview'
  ): Promise<string> => {
    // 检查缓存
    const cacheKey = `friend_${uuid}`
    const cached = presignedUrlCache[cacheKey]
    if (cached && cached.expiresAt) {
      const expiresTime = new Date(cached.expiresAt)
      const now = new Date()
      const remainingMs = expiresTime.getTime() - now.getTime()
      
      if (remainingMs > 5 * 60 * 1000) {
        console.log('✅ 使用缓存的好友文件预签名URL')
        return cached.url
      }
    }
    
    console.log('🔗 获取好友文件预签名URL:', uuid)
    const response = await fetchWithAuth(`${STORAGE_BASE_URL}/friends_file/${uuid}/presigned_url`, {
      method: 'POST',
      body: JSON.stringify({ operation }),
    })

    const data = await readEnvelope<PresignedUrlResponse>(response, {
      endpoint: 'POST /api/storage/friends_file/{uuid}/presigned_url',
      fallbackMessage: '获取好友文件预签名URL失败',
      parse: presignedUrlResponse,
    })

    // 同上：缓存里存绝对地址
    presignedUrlCache[cacheKey] = {
      url: data.presigned_url,
      expiresAt: data.expires_at,
      cachedAt: new Date().toISOString(),
    }

    return data.presigned_url
  },

  /**
   * 获取好友文件扩展预签名 URL（超大文件）
   * POST /api/storage/friends_file/{uuid}/presigned_url/extended
   */
  getFriendFileExtendedPresignedUrl: async (
    uuid: string,
    estimatedDownloadTimeSeconds: number
  ): Promise<string> => {
    console.log('🔗 获取好友文件扩展预签名URL:', uuid)
    const response = await fetchWithAuth(`${STORAGE_BASE_URL}/friends_file/${uuid}/presigned_url/extended`, {
      method: 'POST',
      body: JSON.stringify({
        operation: 'download',
        estimated_download_time: estimatedDownloadTimeSeconds,
      }),
    })

    const data = await readEnvelope<PresignedUrlResponse>(response, {
      endpoint: 'POST /api/storage/friends_file/{uuid}/presigned_url/extended',
      fallbackMessage: '获取好友文件扩展预签名URL失败',
      parse: presignedUrlResponse,
    })

    if (data.warning) {
      console.warn('⚠️', data.warning)
    }

    return data.presigned_url
  },

  /**
   * 获取个人文件列表
   * GET /api/storage/files
   */
  getFileList: async (
    page: number = 1,
    limit: number = 20,
    sortBy: 'created_at' | 'file_size' = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<FileListResponse> => {
    console.log('📋 获取文件列表')
    
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sort_by: sortBy,
      sort_order: sortOrder,
    })

    const response = await fetchWithAuth(`${STORAGE_BASE_URL}/files?${params}`, {
      method: 'GET',
    })

    // 每一行的 file_url 都在 parse 里补成了绝对地址（文档 :46）。
    return readEnvelope<FileListResponse>(response, {
      endpoint: 'GET /api/storage/files',
      fallbackMessage: '获取文件列表失败',
      parse: fileListResponse,
    })
  },

  /**
   * 清除预签名URL缓存
   */
  clearPresignedUrlCache: (uuid?: string) => {
    if (uuid) {
      delete presignedUrlCache[uuid]
      delete presignedUrlCache[`friend_${uuid}`]
    } else {
      Object.keys(presignedUrlCache).forEach(key => delete presignedUrlCache[key])
    }
  },
}
