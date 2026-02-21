import { getApiBaseUrl } from '../lib/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'

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

export interface UploadRequestResponse {
  mode: 'multipart'
  preview_support: 'inline_preview' | 'download_only'
  multipart_upload_id: string | null
  expires_in: number | null
  chunk_size: number | null
  total_chunks: number | null
  file_key: string
  max_file_size: number
  instant_upload: boolean
  existing_file_url: string | null
  // 好友文件秒传时返回
  message_uuid?: string
  message_send_time?: string
}

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
  part_url: string
  part_number: number
  expires_in: number
}

export interface PresignedUrlResponse {
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '请求上传失败' }))
      throw new Error(error.error || '请求上传失败')
    }

    const data = await response.json()
    
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取分片URL失败' }))
      throw new Error(error.error || '获取分片URL失败')
    }

    return await response.json()
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
    uploadInfo: UploadRequestResponse,
    onProgress?: (progress: {
      percent: number
      loaded: number
      total: number
      currentChunk: number
      totalChunks: number
    }) => void
  ): Promise<void> => {
    const chunkSize = uploadInfo.chunk_size || (30 * 1024 * 1024) // 默认30MB
    const totalChunks = uploadInfo.total_chunks || Math.ceil(file.size / chunkSize)
    
    let totalUploaded = 0
    
    for (let i = 0; i < totalChunks; i++) {
      // 1. 获取分片预签名URL
      const { part_url } = await storageApi.getPartUrl(
        uploadInfo.file_key,
        uploadInfo.multipart_upload_id!,
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '确认上传失败' }))
      throw new Error(error.error || '确认上传失败')
    }

    const data = await response.json()
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
    if (uploadInfo.instant_upload) {
      console.log('⚡ 秒传成功!')
      return {
        fileUrl: uploadInfo.existing_file_url!,
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取预签名URL失败' }))
      throw new Error(error.error || '获取预签名URL失败')
    }

    const data: PresignedUrlResponse = await response.json()
    
    // 缓存URL
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取扩展预签名URL失败' }))
      throw new Error(error.error || '获取扩展预签名URL失败')
    }

    const data: PresignedUrlResponse = await response.json()
    
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取好友文件预签名URL失败' }))
      throw new Error(error.error || '获取好友文件预签名URL失败')
    }

    const data: PresignedUrlResponse = await response.json()
    
    // 缓存URL
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取好友文件扩展预签名URL失败' }))
      throw new Error(error.error || '获取好友文件扩展预签名URL失败')
    }

    const data: PresignedUrlResponse = await response.json()
    
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取文件列表失败' }))
      throw new Error(error.error || '获取文件列表失败')
    }

    const data = await response.json()
    return data
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
