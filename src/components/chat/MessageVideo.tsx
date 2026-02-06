'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, AlertCircle, Play } from 'lucide-react'
import { storageApi } from '../../api/storage'

interface MessageVideoProps {
  fileUrl: string | null
  fileUuid: string | null
  className?: string
  isFriendMessage?: boolean
}

/**
 * 从 file_url 中提取 UUID
 */
function extractUuidFromUrl(url: string): string | null {
  const match = url.match(/\/(?:file|friends_file)\/([a-f0-9-]{36})(?:\/|$|\?)/i)
  return match ? match[1] : null
}

/**
 * 判断 URL 是否为 MinIO 预签名 URL
 */
function isPresignedUrl(url: string): boolean {
  return url.includes('X-Amz-Signature=') || url.includes('x-amz-signature=')
}

export function MessageVideo({ 
  fileUrl, 
  fileUuid, 
  className = 'max-w-[240px] rounded-xl',
  isFriendMessage = false
}: MessageVideoProps) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showPlayButton, setShowPlayButton] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let cancelled = false

    const loadVideo = async () => {
      setLoading(true)
      setError(false)

      try {
        // 1. 如果 file_url 是预签名 URL，直接使用
        if (fileUrl && isPresignedUrl(fileUrl)) {
          setVideoSrc(fileUrl)
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
            setVideoSrc(presignedUrl)
          }
        } else {
          console.warn('无法获取视频 URL: 缺少 file_uuid 且无法从 file_url 提取')
          setError(true)
        }
      } catch (err) {
        console.error('获取视频 URL 失败:', err)
        if (!cancelled) {
          setError(true)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadVideo()

    return () => {
      cancelled = true
    }
  }, [fileUrl, fileUuid, isFriendMessage])

  const handlePlay = () => {
    setShowPlayButton(false)
    videoRef.current?.play()
  }

  if (loading) {
    return (
      <div className={`${className} bg-slate-100 flex items-center justify-center min-h-[100px]`}>
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !videoSrc) {
    return (
      <div className={`${className} bg-slate-100 flex flex-col items-center justify-center min-h-[100px] gap-2 p-4`}>
        <AlertCircle className="h-6 w-6 text-slate-400" />
        <span className="text-xs text-slate-500">视频加载失败</span>
      </div>
    )
  }

  return (
    <div className={`${className} relative`}>
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full rounded-xl"
        controls
        preload="metadata"
        onError={() => setError(true)}
        onPlay={() => setShowPlayButton(false)}
        onPause={() => setShowPlayButton(true)}
      />
      {showPlayButton && (
        <button
          className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl transition-opacity hover:bg-black/40"
          onClick={handlePlay}
        >
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="h-6 w-6 text-slate-700 ml-1" />
          </div>
        </button>
      )}
    </div>
  )
}

