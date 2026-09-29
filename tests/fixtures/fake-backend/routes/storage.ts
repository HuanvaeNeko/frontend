import { sendFriendMessage, sendGroupMessage } from '../actions'
import { badRequest, bytesBody, forbidden, HttpError, json, notFound, ok, type Route, readJson, requireString, route } from '../http'
import { autoMessageContent, avatarPath, blobKey, convIdOf, messageTypeForContentType, typeFolder } from '../model'
import { randHex, uuid } from '../random'
import { activeGroup, areFriends, isAdminOrOwner, W } from '../state'
import { iso } from '../time'
import type { Bucket, FileRef, StorageLocation, StoredFileRec, UploadRec } from '../types'
import { pushToUser, pushToUsers, systemNotification } from '../ws'

/**
 * 存储：四步上传（request → part_url → PUT 分片 → confirm）、预签名下载、文件列表，
 * 以及对象存储本身（`/avatars/*`、`/user-file/*`、`/friends-file/*`、`/group-file/*`）。
 *
 * 预签名 URL 是**真签名**：签名覆盖方法、桶、未编码的 object key、时间与有效期（PUT 另含
 * uploadId/partNumber）。前端或 BFF 只要把 URL 改动一个字节（例如二次编码），对象存储就回
 * 403 SignatureDoesNotMatch——与 MinIO 的行为同形，这正是「预签名 URL 千万别重新编码」要防的。
 *
 * 桶与 URL 前缀一一对应（`文件存储管理.md:976-978`）：群文件落在 `group-file/`。
 */

const CHUNK_SIZE = 31_457_280
const AVATAR_MAX = 10 * 1024 * 1024
const GENERIC_MAX = 16_106_127_360
const SIGNING_SECRET = 'huanvae-fake-minio-secret'
const PRESIGN_TTL = 10_800
const AVATAR_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp']
const AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/tiff']
const FILE_TYPES = ['user_image', 'user_video', 'user_document', 'friend_image', 'friend_video', 'friend_document', 'group_image', 'group_video', 'group_document', 'avatar']

const bucketFor = (location: StorageLocation): Bucket =>
  location === 'avatars' ? 'avatars' : location === 'friend_messages' ? 'friends-file' : location === 'group_files' ? 'group-file' : 'user-file'

const previewSupport = (contentType: string): string =>
  contentType.startsWith('image/') || contentType.startsWith('video/') || contentType === 'application/pdf' || contentType.startsWith('text/') ? 'inline_preview' : 'download_only'

const encodeKey = (key: string): string => key.split('/').map(encodeURIComponent).join('/')

const amzDate = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function signature(method: string, bucket: string, key: string, date: string, expires: string, extra: string): string {
  return new Bun.CryptoHasher('sha256').update(`${SIGNING_SECRET}\n${method}\n${bucket}/${key}\n${date}\n${expires}\n${extra}`).digest('hex')
}

/** 相对路径形态的预签名 URL（`user-file/xxx?X-Amz-…`），与文档一致；`absolute` 时补正式域名（part_url 的形态）。 */
function presign(bucket: Bucket, key: string, opts: { method: 'GET' | 'PUT'; ttl: number; params?: Record<string, string>; absolute?: boolean }): { url: string; expiresAt: string } {
  const now = Date.now()
  const date = amzDate(now)
  const expires = String(opts.ttl)
  const params = new URLSearchParams(opts.params)
  const extra = [...params.entries()].map(([k, v]) => `${k}=${v}`).join('&')
  params.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
  params.set('X-Amz-Credential', `huanvae/${date.slice(0, 8)}/cn-east-1/s3/aws4_request`)
  params.set('X-Amz-Date', date)
  params.set('X-Amz-Expires', expires)
  params.set('X-Amz-SignedHeaders', 'host')
  params.set('X-Amz-Signature', signature(opts.method, bucket, key, date, expires, extra))
  const path = `${bucket}/${encodeKey(key)}?${params.toString()}`
  return { url: opts.absolute ? `https://api.huanvae.cn/${path}` : path, expiresAt: iso(now + opts.ttl * 1000) }
}

function s3Error(status: number, code: string, message: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>${message}</Message></Error>`, {
    status,
    headers: { 'content-type': 'application/xml' },
  })
}

// ── 权限 ─────────────────────────────────────────────────

function canAccess(userId: string, file: StoredFileRec): boolean {
  if (file.deleted) return false
  if (file.owner_id === userId) return true
  if (file.storage_location === 'friend_messages') {
    return file.related_id === userId && areFriends(file.owner_id, userId)
  }
  if (file.storage_location === 'group_files') {
    const group = W().groups.get(file.related_id ?? '')
    return group?.status === 'active' && group.members.has(userId)
  }
  return false
}

function fileOr404(fileUuid: string): StoredFileRec {
  const file = W().files.get(fileUuid)
  if (!file || file.deleted) notFound('文件不存在')
  return file
}

const fileRefOf = (f: StoredFileRec): FileRef => ({ file_uuid: f.file_uuid, filename: f.filename, content_type: f.content_type, file_size: f.file_size, width: f.width, height: f.height })

function presignedDto(file: StoredFileRec, operation: string, ttl = PRESIGN_TTL) {
  const params: Record<string, string> = {}
  if (operation === 'download') params['response-content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`
  const { url, expiresAt } = presign(file.bucket, file.key, { method: 'GET', ttl, params })
  return { presigned_url: url, expires_at: expiresAt, file_uuid: file.file_uuid, file_size: file.file_size, content_type: file.content_type, warning: null }
}

// ── 上传完成后的副作用：落库 + 自动消息 ─────────────────────

function finishChatFile(ownerId: string, location: StorageLocation, relatedId: string | null, file: StoredFileRec, caption: string | null): { message_uuid?: string; message_send_time?: string } {
  if (location !== 'friend_messages' && location !== 'group_files') return {}
  const type = messageTypeForContentType(file.content_type)
  const input = { content: caption ?? autoMessageContent(type, file.filename), type, file: fileRefOf(file) }
  const sent = location === 'friend_messages' ? sendFriendMessage(ownerId, relatedId ?? '', input) : sendGroupMessage(ownerId, relatedId ?? '', input)
  pushToUser(ownerId, {
    type: 'file_uploaded',
    data: {
      file_uuid: file.file_uuid,
      file_url: `api/storage/file/${file.file_uuid}`,
      conversation_type: location === 'friend_messages' ? 'private' : 'group',
      conversation_id: relatedId,
      message_uuid: sent.message.message_uuid,
      message_send_time: sent.message.send_time,
    },
  })
  return { message_uuid: sent.message.message_uuid, message_send_time: sent.message.send_time }
}

function uploadOr400(fileKey: string, userId: string): UploadRec {
  const upload = W().uploads.get(fileKey)
  // 拿别人的 file_key 与"根本没有这一行"逐字同形（不泄露存在性，`文件存储管理.md:540`）
  if (!upload || upload.owner_id !== userId) badRequest('上传会话不存在，请重新发起上传')
  return upload
}

function assertLive(upload: UploadRec): void {
  if (upload.status === 'completed') throw new HttpError(409, '该上传会话已完成（文件已上传成功），无需重复确认')
  if (upload.status === 'aborted') throw new HttpError(409, '上传会话已失效（分片已被清理或已合并），请重新发起上传')
  if (Date.now() > upload.expires_at_ms) throw new HttpError(409, '上传会话已过期，请重新发起上传')
}

export const storageRoutes: Route[] = [
  route('POST', '/api/storage/upload/request', (ctx) => {
    const body = readJson(ctx)
    const me = ctx.me.user_id
    const location = body.storage_location as StorageLocation
    if (!['user_files', 'friend_messages', 'group_files', 'avatars'].includes(location)) badRequest('storage_location 取值必须是 user_files / friend_messages / group_files / avatars')
    const fileType = String(body.file_type)
    if (!FILE_TYPES.includes(fileType)) badRequest(`不支持的 file_type: ${fileType}`)
    if (location === 'avatars' && fileType !== 'avatar') badRequest(`storage_location=avatars 时 file_type 必须是 avatar（收到 ${fileType}）`)
    if (fileType === 'avatar' && location !== 'avatars') badRequest('file_type=avatar 只能配 storage_location=avatars')
    if (location !== 'avatars' && body.avatar_target !== undefined) badRequest('非 avatars 落点不能携带 avatar_target')
    const filename = requireString(body, 'filename')
    // 浏览器对不认识的扩展名给 `File.type === ''`，前端原样发出；按对象存储的默认值兜成 octet-stream
    const contentType = typeof body.content_type === 'string' && body.content_type !== '' ? body.content_type : 'application/octet-stream'
    const size = Number(body.file_size)
    if (!Number.isFinite(size) || size <= 0) badRequest('file_size 必须是正数')
    const relatedRaw = typeof body.related_id === 'string' && body.related_id !== '' ? body.related_id : null
    const fileHash = typeof body.file_hash === 'string' ? body.file_hash : null
    const width = typeof body.image_width === 'number' ? body.image_width : null
    const height = typeof body.image_height === 'number' ? body.image_height : null

    let avatarTarget: UploadRec['avatar_target'] = null
    let objectKey: string
    let fileKey: string
    let relatedId: string | null = null

    if (location === 'avatars') {
      const target = body.avatar_target
      if (target !== 'user_avatar' && target !== 'user_background' && target !== 'group_avatar') badRequest('avatar_target 取值必须是 user_avatar / user_background / group_avatar')
      avatarTarget = target
      const ext = filename.includes('.') ? (filename.split('.').pop() as string).toLowerCase() : ''
      if (!AVATAR_EXTS.includes(ext)) badRequest('文件扩展名必须是 jpg / jpeg / png / gif / webp')
      if (!AVATAR_TYPES.includes(contentType)) badRequest('不支持的图片格式')
      if (size > AVATAR_MAX) badRequest(`文件大小超过限制: 最大 10 MB（实际 ${size} 字节）`)
      if (target === 'group_avatar') {
        if (!relatedRaw) badRequest('group_avatar 必须携带 related_id（群 UUID）')
        const group = activeGroup(relatedRaw.toLowerCase())
        if (!isAdminOrOwner(group, me)) forbidden('权限不足')
        relatedId = group.group_id
        objectKey = `group-${group.group_id}.${ext}`
      } else {
        if (body.related_id !== undefined) badRequest(`${target} 不能携带 related_id`)
        if (me.startsWith('group-')) badRequest('group- 是群头像的保留命名空间，该账号无法上传头像')
        objectKey = target === 'user_avatar' ? `${me}.${ext}` : `background/${me}.${ext}`
      }
      fileKey = objectKey
      // 同一目标的新请求接管旧会话：先手方之后的 part_url / confirm 一律 409
      const previous = W().uploads.get(fileKey)
      if (previous && previous.status === 'pending') previous.status = 'aborted'
    } else {
      if (location === 'friend_messages') {
        if (!relatedRaw) badRequest('好友文件必须携带 related_id（好友的 user_id）')
        if (!areFriends(me, relatedRaw)) badRequest('不是好友关系')
        relatedId = relatedRaw
      } else if (location === 'group_files') {
        if (!relatedRaw) badRequest('群文件必须携带 related_id（群 ID）')
        const group = activeGroup(relatedRaw)
        if (!group.members.has(me)) forbidden('你不是该群成员')
        relatedId = group.group_id
      }
      const prefix = location === 'friend_messages' ? convIdOf(me, relatedId ?? '') : location === 'group_files' ? (relatedId ?? '') : me
      objectKey = `${prefix}/${typeFolder(contentType)}/${Date.now()}_${(fileHash ?? randHex(8)).slice(0, 8)}_${filename}`
      fileKey = objectKey

      // 秒传：哈希命中一份仍在的文件 ⇒ 不用传字节，直接建一条新的文件记录指向同一份对象
      const hit = !body.force_upload && fileHash ? [...W().files.values()].find((f) => !f.deleted && f.file_hash === fileHash && f.bucket !== 'avatars') : undefined
      if (hit) {
        const file: StoredFileRec = { ...hit, file_uuid: uuid(), owner_id: me, filename, created_at: iso(Date.now()), storage_location: location, related_id: relatedId }
        W().files.set(file.file_uuid, file)
        const messageInfo = finishChatFile(me, location, relatedId, file, null)
        return ok({
          mode: 'multipart', preview_support: previewSupport(contentType), multipart_upload_id: null, expires_in: null, chunk_size: null, total_chunks: null,
          file_key: hit.key, max_file_size: 0, instant_upload: true, existing_file_url: `api/storage/file/${file.file_uuid}`, ...messageInfo,
        })
      }
    }

    const upload: UploadRec = {
      file_key: fileKey, owner_id: me, bucket: bucketFor(location), object_key: objectKey, upload_id: `upload-${randHex(24)}`, storage_location: location,
      related_id: relatedId, avatar_target: avatarTarget, filename, content_type: contentType, declared_size: size, file_hash: fileHash,
      width, height, parts: new Map(), status: 'pending', expires_at_ms: Date.now() + 3600_000,
    }
    W().uploads.set(fileKey, upload)
    return ok({
      mode: 'multipart', preview_support: previewSupport(contentType), multipart_upload_id: upload.upload_id, expires_in: 3600, chunk_size: CHUNK_SIZE,
      total_chunks: Math.max(1, Math.ceil(size / CHUNK_SIZE)), file_key: fileKey, max_file_size: location === 'avatars' ? AVATAR_MAX : GENERIC_MAX,
      instant_upload: false, existing_file_url: null,
    })
  }),

  route('GET', '/api/storage/multipart/part_url', (ctx) => {
    const upload = uploadOr400(ctx.query.get('file_key') ?? '', ctx.me.user_id)
    if (upload.upload_id !== ctx.query.get('upload_id')) throw new HttpError(409, '该 upload_id 不是当前上传会话（同一目标的新请求已接管，或该标识无效），请重新发起上传')
    if (upload.status === 'completed') throw new HttpError(409, '上传会话已失效（分片已被清理或已合并），请重新发起上传')
    assertLive(upload)
    const partNumber = Number(ctx.query.get('part_number'))
    const total = Math.max(1, Math.ceil(upload.declared_size / CHUNK_SIZE))
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > total) badRequest(`part_number 必须在 1-${total} 之间`)
    const { url } = presign(upload.bucket, upload.object_key, {
      method: 'PUT', ttl: 3600, params: { uploadId: upload.upload_id, partNumber: String(partNumber) }, absolute: true,
    })
    return ok({ part_url: url, part_number: partNumber, expires_in: 3600 })
  }),

  route('POST', '/api/storage/upload/confirm', (ctx) => {
    const body = readJson(ctx)
    const me = ctx.me.user_id
    const upload = uploadOr400(requireString(body, 'file_key'), me)
    assertLive(upload)
    if (upload.parts.size === 0) badRequest('尚未上传任何分片，请先上传分片再确认')
    const ordered = [...upload.parts.entries()].sort((a, b) => a[0] - b[0]).map(([, bytes]) => bytes)
    const bytes = new Uint8Array(ordered.reduce((n, p) => n + p.length, 0))
    let offset = 0
    for (const part of ordered) {
      bytes.set(part, offset)
      offset += part.length
    }
    if (upload.avatar_target && bytes.length > AVATAR_MAX) {
      upload.status = 'aborted'
      badRequest(`文件大小超过限制: 最大 10 MB（实际 ${bytes.length} 字节）`)
    }
    upload.status = 'completed'
    W().blobs.set(blobKey(upload.bucket, upload.object_key), { bytes, content_type: upload.content_type })
    const base = { file_key: upload.file_key, file_size: bytes.length, content_type: upload.content_type, preview_support: previewSupport(upload.content_type) }

    if (upload.avatar_target) {
      const url = avatarPath(upload.object_key, Date.now())
      if (upload.avatar_target === 'user_avatar') ctx.me.avatar = url
      else if (upload.avatar_target === 'user_background') ctx.me.background = url
      else {
        const group = activeGroup(upload.related_id ?? '')
        group.avatar = url
        pushToUsers(group.members.keys(), systemNotification('group_avatar_updated', {
          group_id: group.group_id, group_name: group.name, new_avatar_url: url, operator_id: me, operator_nickname: ctx.me.nickname, updated_at: iso(Date.now()),
        }))
      }
      ctx.me.updated_at = iso(Date.now())
      return ok({ file_url: url, ...base })
    }

    const file: StoredFileRec = {
      file_uuid: uuid(), owner_id: me, filename: upload.filename, content_type: upload.content_type, file_size: bytes.length,
      file_hash: upload.file_hash ?? new Bun.CryptoHasher('sha256').update(`|size:${bytes.length}|`).update(bytes).digest('hex'),
      bucket: upload.bucket, key: upload.object_key, created_at: iso(Date.now()), storage_location: upload.storage_location, related_id: upload.related_id,
      width: upload.width, height: upload.height, deleted: false,
    }
    W().files.set(file.file_uuid, file)
    const caption = typeof body.caption === 'string' && body.caption.trim() !== '' ? body.caption : null
    const messageInfo = finishChatFile(me, upload.storage_location, upload.related_id, file, caption)
    return ok({ file_url: `api/storage/file/${file.file_uuid}`, ...base, ...messageInfo })
  }),

  // ── 预签名下载 ──

  route('POST', '/api/storage/file/:uuid/presigned_url', (ctx) => {
    const file = fileOr404(ctx.params.uuid)
    if (!canAccess(ctx.me.user_id, file)) forbidden('无权访问此文件')
    const body = readJson(ctx)
    const ttl = Math.min(PRESIGN_TTL, Math.max(60, Number(body.expires_in) || PRESIGN_TTL))
    return ok(presignedDto(file, String(body.operation ?? 'download'), ttl))
  }),

  route('POST', '/api/storage/file/:uuid/presigned_url/extended', (ctx) => {
    const file = fileOr404(ctx.params.uuid)
    if (!canAccess(ctx.me.user_id, file)) forbidden('无权访问此文件')
    const body = readJson(ctx)
    const ttl = Math.min(7 * 86_400, Math.max(PRESIGN_TTL, Math.ceil((Number(body.estimated_download_time) || 0) * 1.5)))
    return ok(presignedDto(file, 'download', ttl))
  }),

  route('POST', '/api/storage/friends_file/:uuid/presigned_url', (ctx) => {
    const file = fileOr404(ctx.params.uuid)
    if (file.storage_location !== 'friend_messages' || !canAccess(ctx.me.user_id, file)) forbidden('权限不足')
    return ok(presignedDto(file, String(readJson(ctx).operation ?? 'preview')))
  }),

  route('POST', '/api/storage/friends_file/:uuid/presigned_url/extended', (ctx) => {
    const file = fileOr404(ctx.params.uuid)
    if (file.storage_location !== 'friend_messages' || !canAccess(ctx.me.user_id, file)) forbidden('权限不足')
    return ok(presignedDto(file, 'download', 7 * 86_400))
  }),

  route('POST', '/api/storage/group_file/:uuid/presigned_url', (ctx) => {
    const file = fileOr404(ctx.params.uuid)
    if (file.storage_location !== 'group_files' || !canAccess(ctx.me.user_id, file)) forbidden('权限不足')
    return ok(presignedDto(file, String(readJson(ctx).operation ?? 'preview')))
  }),

  route('POST', '/api/storage/group_file/:uuid/presigned_url/extended', (ctx) => {
    const file = fileOr404(ctx.params.uuid)
    if (file.storage_location !== 'group_files' || !canAccess(ctx.me.user_id, file)) forbidden('权限不足')
    return ok(presignedDto(file, 'download', 7 * 86_400))
  }),

  route('GET', '/api/storage/files', (ctx) => {
    const pageNo = Math.max(1, Math.floor(Number(ctx.query.get('page')) || 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(ctx.query.get('limit')) || 20)))
    const bySize = ctx.query.get('sort_by') === 'file_size'
    const asc = ctx.query.get('sort_order') === 'asc'
    const all = [...W().files.values()].filter((f) => f.bucket !== 'avatars' && canAccess(ctx.me.user_id, f))
    all.sort((a, b) => {
      const diff = bySize ? a.file_size - b.file_size : a.created_at.localeCompare(b.created_at)
      return asc ? diff : -diff
    })
    const rows = all.slice((pageNo - 1) * pageSize, pageNo * pageSize)
    const totalPages = Math.ceil(all.length / pageSize)
    return ok({
      files: rows.map((f) => ({
        file_uuid: f.file_uuid, filename: f.filename, file_size: f.file_size, content_type: f.content_type, preview_support: previewSupport(f.content_type),
        created_at: f.created_at, file_url: `api/storage/file/${f.file_uuid}`, file_hash: f.file_hash,
      })),
      total: all.length,
      page: pageNo,
      page_size: pageSize,
      total_pages: totalPages,
      has_more: pageNo < totalPages,
    })
  }),

  // 成功时 `data: null`（`文件存储管理.md`：DELETE 类端点的文档化形状，前端用 assertEnvelopeOk）
  route('DELETE', '/api/storage/file/:uuid', (ctx) => {
    const file = fileOr404(ctx.params.uuid)
    if (file.owner_id !== ctx.me.user_id) forbidden('只能删除自己上传的文件')
    file.deleted = true
    return json({ success: true, code: 200, data: null })
  }),

  // 通过 UUID 直接取文件流（带鉴权）
  route('GET', '/api/storage/file/:uuid', (ctx) => {
    const file = fileOr404(ctx.params.uuid)
    if (!canAccess(ctx.me.user_id, file)) forbidden('无权访问此文件')
    const blob = W().blobs.get(blobKey(file.bucket, file.key))
    if (!blob) notFound('文件不存在')
    return serveBytes(ctx.request, blob.bytes, blob.content_type, { 'cache-control': 'private, max-age=3600' })
  }),
]

// ── 对象存储：/avatars/* /user-file/* /friends-file/* /group-file/* ──

export const OBJECT_BUCKETS: readonly Bucket[] = ['avatars', 'user-file', 'friends-file', 'group-file']

/** 支持 `Range: bytes=a-b`（`<video>` 拖动靠它）。 */
function serveBytes(request: Request, bytes: Uint8Array, contentType: string, extra: Record<string, string> = {}): Response {
  const headers: Record<string, string> = { 'content-type': contentType, 'accept-ranges': 'bytes', ...extra }
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (range && (range[1] !== '' || range[2] !== '')) {
    const size = bytes.length
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1])
    let end = range[1] === '' || range[2] === '' ? size - 1 : Number(range[2])
    start = Math.max(0, start)
    end = Math.min(size - 1, end)
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    return new Response(request.method === 'HEAD' ? null : bytesBody(bytes.slice(start, end + 1)), {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}` },
    })
  }
  return new Response(request.method === 'HEAD' ? null : bytesBody(bytes), { status: 200, headers })
}

export function handleObjectRequest(request: Request, url: URL, body: Uint8Array): Response | null {
  const segments = url.pathname.split('/').filter(Boolean)
  const bucket = segments[0] as Bucket
  if (!OBJECT_BUCKETS.includes(bucket) || segments.length < 2) return null
  let key: string
  try {
    key = segments.slice(1).map(decodeURIComponent).join('/')
  } catch {
    return s3Error(400, 'InvalidURI', 'Could not parse the specified URI.')
  }
  const q = url.searchParams
  const method = request.method === 'HEAD' ? 'GET' : request.method
  if (method !== 'GET' && method !== 'PUT') return s3Error(405, 'MethodNotAllowed', 'The specified method is not allowed against this resource.')

  // 头像桶的 GET 是匿名公读（`?t=` 是缓存戳不是签名）；其余一律验签
  const publicRead = bucket === 'avatars' && method === 'GET'
  if (!publicRead) {
    const date = q.get('X-Amz-Date') ?? ''
    const expires = q.get('X-Amz-Expires') ?? ''
    const given = q.get('X-Amz-Signature') ?? ''
    if (!date || !expires || !given) return s3Error(403, 'AccessDenied', 'Request is missing a presigned signature.')
    const extraParams = method === 'PUT' ? { uploadId: q.get('uploadId') ?? '', partNumber: q.get('partNumber') ?? '' } : q.has('response-content-disposition') ? { 'response-content-disposition': q.get('response-content-disposition') ?? '' } : {}
    const extra = Object.entries(extraParams).map(([k, v]) => `${k}=${v}`).join('&')
    if (signature(method, bucket, key, date, expires, extra) !== given) {
      return s3Error(403, 'SignatureDoesNotMatch', 'The request signature we calculated does not match the signature you provided.')
    }
    const issued = Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`)
    if (Date.now() > issued + Number(expires) * 1000) return s3Error(403, 'AccessDenied', 'Request has expired')
  }

  if (method === 'PUT') {
    const upload = [...W().uploads.values()].find((u) => u.bucket === bucket && u.object_key === key && u.upload_id === q.get('uploadId'))
    if (upload?.status !== 'pending') return s3Error(404, 'NoSuchUpload', 'The specified multipart upload does not exist.')
    upload.parts.set(Number(q.get('partNumber')), body)
    const etag = new Bun.CryptoHasher('md5').update(body).digest('hex')
    return new Response(null, { status: 200, headers: { etag: `"${etag}"` } })
  }

  const blob = W().blobs.get(blobKey(bucket, key))
  if (!blob) return s3Error(404, 'NoSuchKey', 'The specified key does not exist.')
  const extra: Record<string, string> = { 'cache-control': publicRead ? 'public, max-age=86400' : 'private, max-age=10800' }
  const disposition = q.get('response-content-disposition')
  if (disposition) extra['content-disposition'] = disposition
  return serveBytes(request, blob.bytes, blob.content_type, extra)
}
