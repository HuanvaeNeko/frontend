import { useState, useEffect, useRef } from 'react'
import { 
  Upload, 
  File, 
  FileImage, 
  FileVideo, 
  FileText, 
  Loader2, 
  Download, 
  RefreshCw,
  Eye
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { storageApi, FileItem, formatFileSize, FileType, StorageLocation } from '../../api/storage'
import { FilePreview, type PreviewFile } from '@/components/ui/file-preview'
import { useI18n } from '@/i18n/I18nProvider'

interface FileManagerProps {
  subTab: 'main' | 'upload'
}

export default function FileManager({ subTab }: FileManagerProps) {
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedStorage, setSelectedStorage] = useState<'personal' | 'friend' | 'group'>('personal')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)

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
        title: t('chat.fileManager.loadFailedTitle'),
        description: error instanceof Error ? error.message : t('chat.fileManager.loadFailedDesc'),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        title: t('chat.fileManager.fileTooLargeTitle'),
        description: t('chat.fileManager.fileTooLargeDesc', { size: formatFileSize(maxSize) }),
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
        title: result.isInstant ? t('chat.fileManager.instantSuccess') : t('chat.fileManager.uploadSuccess'),
        description: t('chat.fileManager.fileUploaded', { name: file.name }),
      })

      // 刷新文件列表
      loadFiles(true)
    } catch (error) {
      toast({
        title: t('chat.fileManager.uploadFailedTitle'),
        description: error instanceof Error ? error.message : t('chat.fileManager.uploadFailedDesc'),
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
        title: t('chat.fileManager.downloadFailedTitle'),
        description: error instanceof Error ? error.message : t('chat.fileManager.downloadFailedDesc'),
        variant: 'destructive',
      })
    }
  }

  // 预览文件
  const handlePreview = async (file: FileItem) => {
    try {
      const url = await storageApi.getPresignedUrl(file.file_uuid, 'preview')
      setPreviewFile({
        url,
        name: file.filename,
        type: file.content_type,
        size: file.file_size,
      })
    } catch (error) {
      toast({
        title: t('chat.fileManager.previewFailedTitle'),
        description: error instanceof Error ? error.message : t('chat.fileManager.previewFailedDesc'),
        variant: 'destructive',
      })
    }
  }

  // 下载预览中的文件
  const handleDownloadPreview = async (previewFile: PreviewFile) => {
    const a = document.createElement('a')
    a.href = previewFile.url
    a.download = previewFile.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
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
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 渲染内容
  const renderContent = () => {
    // 我的文件
    if (subTab === 'main') {
      return (
        <div className="flex flex-col h-full">
        {/* 工具栏 */}
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('chat.fileManager.totalFiles', { count: files.length })}
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
              <p className="text-sm">{t('chat.fileManager.noFiles')}</p>
              <p className="text-xs mt-1">{t('chat.fileManager.noFilesHint')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {files.map((file) => {
                const FileIcon = getFileIcon(file.content_type)
                return (
                  <div
                    key={file.file_uuid}
                    className="p-3 transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <FileIcon className="h-5 w-5 text-primary" />
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
                    {t('chat.fileManager.loadMore')}
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
            <h3 className="font-semibold mb-2">{t('chat.fileManager.uploadFile')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('chat.fileManager.clickOrDrag')}
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              {t('chat.fileManager.supportedTypes')}
            </p>

            {/* 上传进度 */}
            {uploading && (
              <div className="mb-6">
                <div className="mb-2 h-2 w-full rounded-full bg-muted">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('chat.fileManager.uploadingPercent', { progress: uploadProgress })}
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
                  {t('chat.fileManager.uploading')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('chat.fileManager.selectFile')}
                </>
              )}
            </Button>

            <div className="mt-8 space-y-2">
              <h4 className="text-sm font-medium">{t('chat.fileManager.storageLocation')}</h4>
              <div className="flex gap-2 justify-center">
                <Button
                  variant={selectedStorage === 'personal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStorage('personal')}
                >
                  {t('chat.fileManager.storagePersonal')}
                </Button>
                <Button
                  variant={selectedStorage === 'friend' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStorage('friend')}
                >
                  {t('chat.fileManager.storageFriend')}
                </Button>
                <Button
                  variant={selectedStorage === 'group' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStorage('group')}
                >
                  {t('chat.fileManager.storageGroup')}
                </Button>
              </div>
            </div>
          </div>

          {/* 上传提示 */}
          <div className="mt-6 rounded-lg bg-muted p-4">
            <h4 className="font-medium text-sm mb-2">{t('chat.fileManager.uploadTips')}</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>{t('chat.fileManager.tip1')}</li>
              <li>{t('chat.fileManager.tip2')}</li>
              <li>{t('chat.fileManager.tip3')}</li>
            </ul>
          </div>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <>
      {renderContent()}
      
      {/* 文件预览 */}
      {previewFile && (
        <FilePreview
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownloadPreview}
        />
      )}
    </>
  )
}
