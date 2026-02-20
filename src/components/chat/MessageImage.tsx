'use client'

import { useState, useEffect } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { storageApi } from '../../api/storage'

interface MessageImageProps {
  fileUrl: string | null
  fileUuid: string | null
  alt?: string
  className?: string
  onClick?: () => void
  isFriendMessage?: boolean
}

/**
 * 从 file_url 中提取 UUID
 * file_url 格式: https://api.huanvae.cn/api/storage/file/{uuid} 或
 *               https://api.huanvae.cn/api/storage/friends_file/{uuid}
 */
function extractUuidFromUrl(url: string): string | null {
  // 匹配 /file/{uuid} 或 /friends_file/{uuid}
  const match = url.match(/\/(?:file|friends_file)\/([a-f0-9-]{36})(?:\/|$|\?)/i)
  return match ? match[1] : null
}

/**
 * 判断 URL 是否为 MinIO 预签名 URL（可直接访问）
 */
function isPresignedUrl(url: string): boolean {
  // 预签名 URL 包含 X-Amz-Signature 参数
  return url.includes('X-Amz-Signature=') || url.includes('x-amz-signature=')
}

export function MessageImage({ 
  fileUrl, 
  fileUuid, 
  alt = '图片',
  className = 'max-w-[240px] rounded-xl',
  onClick,
  isFriendMessage = false
}: MessageImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadImage = async () => {
      setLoading(true)
      setError(false)

      try {
        // 1. 如果 file_url 是预签名 URL，直接使用
        if (fileUrl && isPresignedUrl(fileUrl)) {
          setImageSrc(fileUrl)
          setLoading(false)
          return
        }

        // 2. 优先使用 file_uuid 获取预签名 URL
        let uuid = fileUuid

        // 3. 如果没有 file_uuid，尝试从 file_url 中提取
        if (!uuid && fileUrl) {
          uuid = extractUuidFromUrl(fileUrl)
        }

        // 4. 使用 UUID 获取预签名 URL
        if (uuid) {
          const presignedUrl = isFriendMessage
            ? await storageApi.getFriendFilePresignedUrl(uuid, 'preview')
            : await storageApi.getPresignedUrl(uuid, 'preview')
          
          if (!cancelled) {
            setImageSrc(presignedUrl)
          }
        } else {
          // 没有有效的 UUID
          console.warn('无法获取图片 URL: 缺少 file_uuid 且无法从 file_url 提取')
          setError(true)
        }
      } catch (err) {
        console.error('获取图片 URL 失败:', err)
        if (!cancelled) {
          setError(true)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadImage()

    return () => {
      cancelled = true
    }
  }, [fileUrl, fileUuid, isFriendMessage])

  if (loading) {
    return (
      <div className={`${className} bg-muted flex items-center justify-center min-h-[100px]`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !imageSrc) {
    return (
      <div className={`${className} bg-muted flex flex-col items-center justify-center min-h-[100px] gap-2 p-4`}>
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">图片加载失败</span>
      </div>
    )
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={`${className} cursor-pointer hover:opacity-90 transition-opacity`}
      onClick={onClick}
      loading="lazy"
      onError={() => setError(true)}
    />
  )
}

