import { getApiBaseUrl, toAbsoluteApiUrl } from '@/lib/apiConfig'
import { ApiError, type Parser, readEnvelope } from '@/lib/apiEnvelope'
import {
  asRecord,
  bool,
  nullableNum,
  nullableStr,
  num,
  optionalStr,
  str,
} from '@/lib/apiParse'
import { fetchWithAuth } from './authedFetch'

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

// ============================================
// 类型定义
// ============================================

/**
 * `'avatar'` 是 2026-08-28 并进来的第 10 档：用户头像 / 资料背景图 / 群头像三条旧
 * `multipart/form-data` 端点（`POST /api/profile/avatar`、`POST /api/profile/background`、
 * `POST /api/groups/{id}/avatar`）整套删除后，三者共用这一条预签名分片链路
 * （`backend-docs/storage/文件存储管理.md:116`「头像类固定填 `avatar`」、
 * :946-955 的类型与上限表）。
 *
 * 🔴 它与 `storage_location: 'avatars'` 是**双向绑定**，任一侧单独出现都是 400
 * （同文档 :136-139）。而这条绑定是 **10 MB 上限的承重件**——上限按 `file_type` 取，
 * 不绑就等于没上限。所以这两个字段只允许由 {@link buildAvatarUploadPayload}
 * 成对写出，调用点不要自己拼。
 */
export type FileType =
  | 'user_image' | 'user_video' | 'user_document'
  | 'friend_image' | 'friend_video' | 'friend_document'
  | 'group_image' | 'group_video' | 'group_document'
  | 'avatar'

export type StorageLocation = 'user_files' | 'friend_messages' | 'group_files' | 'avatars'

/**
 * 头像三档落点（文档 :118「三档取值」）。取值非法 → 400（后端手工解析 `Option<String>`，
 * **不是** 422）。
 */
export type AvatarTarget = 'user_avatar' | 'user_background' | 'group_avatar'

/**
 * 落点 + `related_id` 的合法组合，只有这两种。
 *
 * 文档 :119：`group_avatar` **必填且必须是群 UUID**；`user_avatar` / `user_background`
 * **携带它就是 400**——注意是"携带"，不是"值不对"。所以 `related_id: undefined`
 * **不是**安全写法：那一样是把这个键写进了对象，只是碰巧被 `JSON.stringify` 丢掉；
 * 换一种编码（FormData、msgpack、手拼 query）它就原样发出去了。唯一安全的构造是
 * **根本不写这个键**，`buildAvatarUploadPayload` 就是这么写的。
 *
 * ⚠️ 这个联合是给调用点用的便利与文档，**不是**保证：`as` 一下就能绕过去
 * （本仓已经实测过一次"可辨识联合让坏写法写不出来"这个说法是假的，
 * 见 {@link storageApi.uploadWithMultipart} 里的注释）。真正钉住三条约束的是
 * `buildAvatarUploadPayload` 的构造方式，加上三组**各自不同**的测试：
 *
 * - `file_type` ⟺ `storage_location` 双向绑定：这两个键值写死在 `base` 里，由
 *   storage.test.ts 里直接调 `buildAvatarUploadPayload` 的那条 `toEqual`、加上
 *   groups.test.ts「第 1 步的请求体逐字段与 doc:270-284 一致」的 wire-level `toEqual`
 *   一起钉住——任一侧被改成单独出现都会当场变红；
 * - `related_id` 这个键的**有无**：只有 storage.test.ts 里直接调 `buildAvatarUploadPayload`
 *   的那组 `Object.hasOwn` 断言测得出来。线上 body 要过 `JSON.stringify`，而
 *   `related_id: undefined` 与"根本没这个键"序列化后逐字相同，所以任何基于
 *   `JSON.parse(init.body)` 的断言（包括本仓那条 `'related_id' in body`）对这条约束
 *   **恒真**——它钉的是序列化结果，不是构造方式；
 * - 群 UUID 原样透传：storage.test.ts 里那条「大小写变体逐字进 payload，只有单飞键
 *   小写化」的断言。
 */
export type AvatarUploadTarget =
  | { avatar_target: 'group_avatar'; related_id: string }
  | { avatar_target: 'user_avatar' | 'user_background' }

export interface UploadRequestPayload {
  file_type: FileType
  storage_location: StorageLocation
  /**
   * 条件必填：`storage_location=avatars` 时必填，其余落点**携带即 400**
   * （文档 :118）。
   */
  avatar_target?: AvatarTarget
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

/** {@link buildAvatarUploadPayload} 的产物：第 1 步请求体，逐字对齐 groups 文档 :270-284。 */
export type AvatarUploadRequestPayload = UploadRequestPayload & {
  file_type: 'avatar'
  storage_location: 'avatars'
  avatar_target: AvatarTarget
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
 * 把它和 {@link InstantUploadResponse} 拆成可辨识联合，是**便利与文档**，不是强制。
 * 别把它当防线：本仓实测过把 `uploadInfo.multipart_upload_id!` 原样还原，
 * `tsc --noEmit` 照样通过（TS 允许在非空类型上写冗余 `!`），见
 * {@link storageApi.uploadWithMultipart} 里那段实测记录。
 *
 * 真正拦住旧写法的是 `uploadRequestResponse` 那个**运行时 parser**：这三个字段缺任何
 * 一个直接抛 ApiShapeError，`!` 根本等不到 null 值可推。旧代码正是用 `!` 强推，字段
 * 真为 null 时会把字面量 `upload_id=undefined` 发给后端，错误延后到分片 PUT 才炸，
 * 日志指向错误的环节。
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
   * 这一个**本来就是绝对地址**（文档 :611-620 的示例是
   * `https://api.huanvae.cn/user-file/xxx?...`），文档 :45-49 的相对路径表里没有它，
   * 所以出口不会给它拼基址。但它是浏览器 PUT 分片的目标地址：基址指向本地去 SNI 反代时，
   * 正式域名的 origin 必须换成反代（`toAbsoluteApiUrl` 只替换 origin、逐字保留路径与签名参数，
   * 见 `apiConfig.ts` 的 `rewriteCanonicalApiOrigin`），否则每一片都 PUT 不出去。
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

/**
 * 这些函数原本就地定义在本文件里。messages / groupMessages 成为第三、第四个
 * 需要它们的模块后提到了 `@/lib/apiParse`——同一个 `str()` 复制三份必然漂移，
 * 本仓两份 GroupMessage 定义已经分叉过一次，不再重演。行为逐字未变。
 */

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

/**
 * 头像档专用的 `upload/request` 校验器：在通用校验之上，再把「秒传」判成形状错误。
 *
 * 文档 :140-141：头像三档**一律不走秒传**，`instant_upload` 由服务端强制恒为 `false`，
 * 也不建 UUID 映射。所以真收到 `instant_upload: true` 只有两种可能——请求被路由到了
 * 别的落点（`file_type`/`storage_location` 那条双向绑定被写坏），或后端行为变了。
 * 两种都必须响亮地失败，不能顺着秒传分支返回一个 `existing_file_url` 当头像用：
 * 那个 URL 是 `api/storage/file/{uuid}` 形态，写进 `group_avatar_url` 会得到一张
 * 永远加载不出来的头像，而且后端根本没写 `groups."group-avatar-url"`。
 *
 * ⚠️ **防线是这个 parser，不是返回类型**。{@link storageApi.requestAvatarUpload} 的
 * 返回类型收窄成 {@link MultipartUploadSession} 只是让调用点不必再判别一次；
 * 类型不会在运行时拦住任何东西（同 `uploadWithMultipart` 里那条实测结论）。
 * 放在解包处是为了拿得到 Response——失败时 `readEnvelope` 抛的是带 endpoint +
 * payload 的 `ApiShapeError` 并会走上报，放在下游只能抛一个没有出处的裸 Error。
 */
const avatarUploadRequestResponse: Parser<MultipartUploadSession> = {
  parse(input: unknown): MultipartUploadSession {
    const session = uploadRequestResponse.parse(input)
    if (session.instant_upload) {
      throw new Error(
        '头像档不应返回秒传响应（instant_upload=true），服务端对 avatars 落点强制 false（文档 :140-141）',
      )
    }
    return session
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

/**
 * `GET /api/storage/multipart/part_url`（文档 :611-620）。`part_url` 本就是绝对地址，
 * 过 `toAbsoluteApiUrl` 只为在基址指向反代时把正式域名的 origin 换掉（见接口 JSDoc）。
 */
const partUrlResponse: Parser<PartUrlResponse> = {
  parse(input: unknown): PartUrlResponse {
    const payload = asRecord(input, 'multipart/part_url 的 data')
    return {
      part_url: toAbsoluteApiUrl(str(payload, 'part_url')),
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
// 头像上传（三档共用的四步链路）
// ============================================

/**
 * 头像档上限，由后端**量两次**（文档 :142-145）：`upload/request` 校自报的 `file_size`，
 * `upload/confirm` 在合并分片**之前**再量一次真实字节。
 *
 * 所以下面这道客户端检查是**便利，不是执行**——它省掉一次注定失败的往返，
 * 并给用户一句当场能看懂的话；真正的闸在服务端，绕过前端也照样超不了限
 * （而且 confirm 那一档拒绝时**不会碰现有的那张头像**）。
 */
export const AVATAR_MAX_SIZE = 10 * 1024 * 1024

/**
 * 允许的图片格式（群聊文档 :375「扩展名不在 jpg/jpeg/png/gif/webp → 400」）。
 * 这里按 MIME 判，`image/jpeg` 同时覆盖 jpg 与 jpeg 两个扩展名。
 */
export const AVATAR_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

function validateAvatarFile(file: File): void {
  if (file.size > AVATAR_MAX_SIZE) {
    throw new Error(`文件太大，最大 10MB，当前: ${(file.size / 1024 / 1024).toFixed(2)} MB`)
  }
  if (!(AVATAR_ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('不支持的文件格式，支持: jpg, jpeg, png, gif, webp')
  }
}

/**
 * 拼第 1 步的请求体。三条约束全部由**构造方式**保证，而不是由类型保证：
 *
 * - `file_type: 'avatar'` 与 `storage_location: 'avatars'` 成对写死（文档 :136-139 双向绑定，
 *   任一侧单独出现都是 400，而这条绑定是 10 MB 上限的承重件）；
 * - `related_id` 只在 `group_avatar` 档**出现这个键**——另两档"携带即 400"，
 *   所以不能写成 `related_id: target.related_id ?? undefined`：
 *   `JSON.stringify` 虽然会丢掉 undefined 值，但那是靠序列化的副作用兜住一条协议约束，
 *   下一个人把 body 换成别的编码就会静默破掉（文档 :119）；
 * - 群 UUID 原样透传：服务端自 2026-08-29 起归一成规范小写再拼 object key
 *   （群聊文档 :308-312），客户端**不必**自己归一，但也不能指望用大小写变体拿到不同对象。
 */
export function buildAvatarUploadPayload(
  file: File,
  target: AvatarUploadTarget,
  fileHash: string,
): AvatarUploadRequestPayload {
  const base = {
    file_type: 'avatar',
    storage_location: 'avatars',
    avatar_target: target.avatar_target,
    filename: file.name,
    file_size: file.size,
    content_type: file.type,
    file_hash: fileHash,
  } as const

  return target.avatar_target === 'group_avatar'
    ? { ...base, related_id: target.related_id }
    : { ...base }
}

/**
 * 单飞键。头像的 object key 是**确定性**的（`{user_id}.{ext}` / `group-{group_id}.{ext}`），
 * 同一个落点在服务端只有一行上传会话：并发或重复发起 `upload/request` 会让先手方之后的
 * 每一次 `part_url` / `confirm` 都变成 409（文档 :643-646、群聊文档 :369）。
 *
 * ⚠️ 这个 Map 只活在**当前这张标签页**里，能挡的因此只有本页自己的重复发起：连点、
 * 组件重挂、以及同一页里两个调用点同时发。文档那条「群主与任一管理员互相接管」是
 * **跨客户端**的危险，per-tab 的 Map 在结构上就防不住，也不该假装防得住——跨端 409
 * 的处理方式是**如实透出**（`isUploadSessionExpired` 分诊 + 调用点把后端原文和"重选
 * 文件重来"讲清楚），不是预防。
 *
 * 眼下 GroupManagement 那一侧其实还锁不到东西：触发按钮 `disabled={uploadingAvatar}`，
 * 隐藏 input 只能由它打开，同一页发不出第二次。保留这一层是给下一个调用点
 * （profile.ts 复用同一支）的纵深防御；冲突时**直接拒**而不是让后手方共享先手的
 * in-flight promise，也是有意的：两次点击很可能选的是不同的文件，共享会把先手的
 * `file_url` 当成后手的结果返回。
 *
 * 群 ID 在键里小写化，是因为服务端会把 UUID 归一成规范小写再拼 key —— 大小写不同的
 * 两个字符串落在**同一个对象**上，键不小写化就等于给同一个落点开了两条并发通道。
 */
function avatarSingleFlightKey(target: AvatarUploadTarget): string {
  return target.avatar_target === 'group_avatar'
    ? `group_avatar:${target.related_id.toLowerCase()}`
    : target.avatar_target
}

const avatarUploadsInFlight = new Map<string, Promise<AvatarUploadResult>>()

export interface AvatarUploadResult {
  /**
   * 后端返回的是**相对路径**（`avatars/group-{id}.{ext}?t=…`，群聊文档 :288-306），
   * 这里已在 api 出口过 {@link toAbsoluteApiUrl}。组件里不要再拼基址。
   *
   * 🔴 字段名是 `file_url`，不是旧端点的 `avatar_url`——旧的那个字段随
   * `POST /api/groups/{id}/avatar` 一起在 2026-08-28 删掉了，形态逐字相同、名字变了。
   */
  file_url: string
  file_key: string
}

export interface AvatarUploadProgress {
  percent: number
  loaded: number
  total: number
  currentChunk: number
  totalChunks: number
}

async function runAvatarUpload(
  file: File,
  target: AvatarUploadTarget,
  onProgress?: (progress: AvatarUploadProgress) => void,
): Promise<AvatarUploadResult> {
  const fileHash = await calculateFileHash(file)

  // 第 1 步。权限判定就在这里：非群主/管理员拿到的是 **403**（群聊文档 :285-287），
  // 预签名 URL 根本签不出来。readEnvelope 会把后端原文（`message` 字段）原样带出去。
  const session = await storageApi.requestAvatarUpload(
    buildAvatarUploadPayload(file, target, fileHash),
  )

  // 第 2+3 步：逐片换 URL 并 PUT 字节（头像通常只有 1 片）。
  await storageApi.uploadWithMultipart(file, session, onProgress)

  // 第 4 步：后端在这里写 `groups."group-avatar-url"` 并下发 group_avatar_updated。
  const confirmed = await storageApi.confirmUpload(session.file_key)
  return { file_url: confirmed.file_url, file_key: confirmed.file_key }
}

// ============================================
// API 方法
// ============================================

/**
 * `POST /api/storage/upload/request` 的公共发送段，通用档与头像档只差一个校验器。
 *
 * 旧代码 `const data = await response.json()` 直接把**信封**当成了 data
 * （文档 :163-205 的响应示例里，真实字段全在 `data` 下一层），于是
 * `data.instant_upload` 恒为 undefined、`data.chunk_size` 恒为 undefined，
 * 再被下游的 `|| 30MB` / `!` 兜住，整条上传拿着一堆 undefined 往下跑。
 */
async function postUploadRequest<T>(
  payload: UploadRequestPayload,
  parse: Parser<T>,
): Promise<T> {
  const response = await fetchWithAuth(`${STORAGE_BASE_URL}/upload/request`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return readEnvelope<T>(response, {
    endpoint: 'POST /api/storage/upload/request',
    fallbackMessage: '请求上传失败',
    parse,
  })
}

export const storageApi = {
  /**
   * 请求文件上传
   * POST /api/storage/upload/request
   */
  requestUpload: async (payload: UploadRequestPayload): Promise<UploadRequestResponse> => {
    console.log('📤 请求上传:', payload.filename)
    const data = await postUploadRequest(payload, uploadRequestResponse)

    if (data.instant_upload) {
      console.log('⚡ 秒传成功!')
    }

    return data
  },

  /**
   * 请求头像上传（三档落点共用）
   * POST /api/storage/upload/request
   *
   * 与 {@link storageApi.requestUpload} 是同一个端点，只有校验器不同：头像档一律不走秒传
   * （文档 :140-141），所以返回类型收窄成 {@link MultipartUploadSession}，调用点不必再判别。
   * **收窄由 {@link avatarUploadRequestResponse} 在运行时保证，不是由类型保证。**
   *
   * 🔴 403 在这一步就会抛出（群聊文档 :285-287：非群主/管理员在签发预签名 URL 之前
   * 就被拒）。它是一次**常规的权限失败**，不是登录态问题——`fetchWithAuth` 只对 401
   * 做刷新/登出，403 原样带着后端文案往上抛，调用点直接透出即可。
   */
  requestAvatarUpload: async (
    payload: AvatarUploadRequestPayload,
  ): Promise<MultipartUploadSession> => {
    console.log('📤 请求头像上传:', payload.avatar_target, payload.filename)
    return postUploadRequest(payload, avatarUploadRequestResponse)
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
   * 头像上传的完整四步链路（用户头像 / 资料背景图 / 群头像三档共用）。
   *
   * ```
   * 1) POST /api/storage/upload/request     ← file_type=avatar + storage_location=avatars
   *                                            + avatar_target（+ group_avatar 档的 related_id）
   * 2) GET  /api/storage/multipart/part_url
   * 3) PUT  <预签名 URL>                     ← 字节直传对象存储
   * 4) POST /api/storage/upload/confirm     ← 返回 file_url，后端顺带下发 WS 通知
   * ```
   *
   * 三条旧 `multipart/form-data` 端点（`POST /api/profile/avatar`、
   * `POST /api/profile/background`、`POST /api/groups/{id}/avatar`）已于 2026-08-28
   * **整套删除、无兼容层**（群聊文档 :250-252、storage 文档 :959-962）。
   *
   * ## 单飞（不是自动重试）
   *
   * 同一个落点同时只允许一次上传在飞。头像 object key 是确定性的，同一个群的群主与
   * 任一管理员会落在**同一行**上传会话上：后发的 `upload/request` 会接管这一行，
   * 先手方之后每一次 `part_url` / `confirm` 都变 409（文档 :643-646、群聊文档 :369）。
   * 文档给客户端的处方是**防抖 / 单飞**，所以这里直接拒绝第二次调用，而不是：
   * - 自动重发（文档 :526-534 写明 409 语义是"重发同一条永远不会成功"，
   *   而重走整条链路又会去接管别人的会话，两边互相打架）；
   * - 复用第一次的 promise（用户第二次选的可能是**另一张图**，把第一张的 URL
   *   还给他就是把"我传的不是这张"变成一次静默的错误结果）。
   *
   * @throws {Error} 文件超 10 MB 或格式不在白名单（客户端便利检查，见 {@link AVATAR_MAX_SIZE}）
   * @throws {Error} 同一落点已有上传在飞
   * @throws {ApiError} 第 1 步 403（无权限）、任意步骤 409（会话已死，用
   *   {@link isUploadSessionExpired} 分诊）等后端失败，文案是后端原文
   */
  uploadAvatar: async (
    file: File,
    target: AvatarUploadTarget,
    onProgress?: (progress: AvatarUploadProgress) => void,
  ): Promise<AvatarUploadResult> => {
    validateAvatarFile(file)

    const key = avatarSingleFlightKey(target)
    if (avatarUploadsInFlight.has(key)) {
      throw new Error('该头像正在上传中，请等待当前上传完成后再试')
    }

    // 「查表 → 落表」之间没有任何 await：await 之前的代码是同步执行的，
    // 所以这一段不可能被另一次调用插进来。
    const task = runAvatarUpload(file, target, onProgress).finally(() => {
      avatarUploadsInFlight.delete(key)
    })
    avatarUploadsInFlight.set(key, task)

    return task
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
