import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Upload, 
  File, 
  FileImage, 
  FileVideo, 
  FileText, 
  Loader2, 
  Download, 
  RefreshCw,
  Eye,
  FolderOpen
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { storageApi, FileItem, formatFileSize, FileType, StorageLocation } from '../../api/storage'

// 文件项动画
const fileItemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1],
    },
  }),
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
}

// 上传区域动画
const uploadAreaVariants = {
  idle: { scale: 1, borderColor: 'rgba(0,0,0,0.1)' },
  hover: { scale: 1.02, borderColor: 'rgba(59, 130, 246, 0.5)' },
}

// 进度条动画
const progressVariants = {
  initial: { width: 0 },
  animate: (progress: number) => ({
    width: `${progress}%`,
    transition: { duration: 0.3 },
  }),
}

interface FileManagerProps {
  subTab: 'main' | 'upload'
}

export default function FileManager({ subTab }: FileManagerProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedStorage, setSelectedStorage] = useState<'personal' | 'friend' | 'group'>('personal')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // 加载文件列表
  const loadFiles = async (refresh = false) => {
    if (loading) return
    
    setLoading(true)
    try {
      const currentPage = refresh ? 1 : page
      const response = await storageApi.getFileList(currentPage, 20, 'created_at', 'desc')
      
      if (refresh) {
        setFiles(response.files)
        setPage(1)
      } else {
        setFiles(prev => [...prev, ...response.files])
      }
      
      setHasMore(response.has_more)
      if (!refresh && response.has_more) {
        setPage(p => p + 1)
      }
    } catch (error) {
      toast({
        title: '加载失败',
        description: error instanceof Error ? error.message : '获取文件列表失败',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (subTab === 'main') {
      loadFiles(true)
    }
  }, [subTab])

  // 获取文件类型
  const getFileType = (contentType: string): FileType => {
    if (contentType.startsWith('image/')) return 'user_image'
    if (contentType.startsWith('video/')) return 'user_video'
    return 'user_document'
  }

  // 获取存储位置
  const getStorageLocation = (): StorageLocation => {
    switch (selectedStorage) {
      case 'friend':
        return 'friend_messages'
      case 'group':
        return 'group_files'
      default:
        return 'user_files'
    }
  }

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件大小（500MB）
    const maxSize = 500 * 1024 * 1024
    if (file.size > maxSize) {
      toast({
        title: '文件过大',
        description: `文件大小不能超过 ${formatFileSize(maxSize)}`,
        variant: 'destructive',
      })
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      const fileType = getFileType(file.type)
      const storageLocation = getStorageLocation()

      const result = await storageApi.uploadFile(
        file,
        fileType,
        storageLocation,
        undefined,
        (progress) => {
          setUploadProgress(Math.round(progress.percent))
        }
      )

      toast({
        title: result.isInstant ? '秒传成功' : '上传成功',
        description: `${file.name} 已上传`,
      })

      // 刷新文件列表
      loadFiles(true)
    } catch (error) {
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '上传文件失败',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 下载文件
  const handleDownload = async (file: FileItem) => {
    try {
      const url = await storageApi.getPresignedUrl(file.file_uuid, 'download')
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      toast({
        title: '下载失败',
        description: error instanceof Error ? error.message : '获取下载链接失败',
        variant: 'destructive',
      })
    }
  }

  // 预览文件
  const handlePreview = async (file: FileItem) => {
    try {
      const url = await storageApi.getPresignedUrl(file.file_uuid, 'preview')
      window.open(url, '_blank')
    } catch (error) {
      toast({
        title: '预览失败',
        description: error instanceof Error ? error.message : '获取预览链接失败',
        variant: 'destructive',
      })
    }
  }

  // 获取文件图标
  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) return FileImage
    if (contentType.startsWith('video/')) return FileVideo
    return FileText
  }

  // 格式化时间
  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 我的文件
  if (subTab === 'main') {
    return (
      <div className="flex flex-col h-full">
        {/* 工具栏 */}
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            共 {files.length} 个文件
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadFiles(true)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* 文件列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading && files.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <File className="h-12 w-12 mb-4" />
              <p className="text-sm">暂无文件</p>
              <p className="text-xs mt-1">上传文件后将在这里显示</p>
            </div>
          ) : (
            <div className="divide-y">
              {files.map((file) => {
                const FileIcon = getFileIcon(file.content_type)
                return (
                  <div
                    key={file.file_uuid}
                    className="p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <FileIcon className="h-5 w-5 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.file_size)} · {formatTime(file.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {file.preview_support === 'inline_preview' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handlePreview(file)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDownload(file)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
              
              {/* 加载更多 */}
              {hasMore && (
                <div className="p-4 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadFiles()}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    加载更多
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // 上传文件
  if (subTab === 'upload') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">上传文件</h3>
            <p className="text-sm text-muted-foreground mb-4">
              点击或拖拽文件到此处上传
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              支持图片、视频、文档，最大 500MB
            </p>

            {/* 上传进度 */}
            {uploading && (
              <div className="mb-6">
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  上传中 {uploadProgress}%
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
            />
            
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  选择文件
                </>
              )}
            </Button>

            <div className="mt-8 space-y-2">
              <h4 className="text-sm font-medium">存储位置</h4>
              <div className="flex gap-2 justify-center">
                <Button
                  variant={selectedStorage === 'personal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStorage('personal')}
                >
                  个人文件
                </Button>
                <Button
                  variant={selectedStorage === 'friend' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStorage('friend')}
                >
                  发送给好友
                </Button>
                <Button
                  variant={selectedStorage === 'group' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStorage('group')}
                >
                  发送到群聊
                </Button>
              </div>
            </div>
          </div>

          {/* 上传提示 */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-sm mb-2">上传说明</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• 相同文件支持秒传，无需重复上传</li>
              <li>• 大文件自动分片上传，支持断点续传</li>
              <li>• 上传的文件将保存在您的个人空间</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return null
}
