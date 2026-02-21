'use client'

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
  Eye,
  CheckCircle2,
  FolderOpen,
  MessageCircle,
  Users,
  Search,
  MoreVertical,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { storageApi, FileItem, formatFileSize, FileType, StorageLocation } from '@/api/storage'
import { FilePreview, type PreviewFile } from '@/components/ui/file-preview'
import { useI18n } from '@/i18n/I18nProvider'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
  const [searchQuery, setSearchQuery] = useState('')

  const storageOptions = [
    {
      key: 'personal',
      label: t('chat.fileManager.storagePersonal'),
      description: t('chat.fileManager.storagePersonalDesc'),
      icon: FolderOpen,
    },
    {
      key: 'friend',
      label: t('chat.fileManager.storageFriend'),
      description: t('chat.fileManager.storageFriendDesc'),
      icon: MessageCircle,
    },
    {
      key: 'group',
      label: t('chat.fileManager.storageGroup'),
      description: t('chat.fileManager.storageGroupDesc'),
      icon: Users,
    },
  ] as const

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
      case 'friend': return 'friend_messages'
      case 'group': return 'group_files'
      default: return 'user_files'
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

      await storageApi.uploadFile(
        file,
        fileType,
        storageLocation,
        undefined,
        (progress) => {
          setUploadProgress(Math.round(progress.percent))
        }
      )

      toast({
        title: t('chat.fileManager.uploadSuccess'),
        description: t('chat.fileManager.fileUploaded', { name: file.name }),
      })

      // 刷新文件列表
      if (subTab === 'main') loadFiles(true)
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

  const filteredFiles = files.filter(f => f.filename.toLowerCase().includes(searchQuery.toLowerCase()))

  // 渲染内容
  const renderContent = () => {
    // 我的文件
    if (subTab === 'main') {
      return (
        <div className="flex flex-col h-full">
          {/* 工具栏 */}
          <div className="px-4 py-3 flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('chat.fileManager.searchPlaceholder') || "Search files..."}
                className="pl-9 h-10 bg-muted/50 border-transparent focus:bg-background focus:border-input rounded-xl"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl hover:bg-muted"
              onClick={() => loadFiles(true)}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>

          {/* 文件列表 */}
          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {loading && files.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                   <File className="h-8 w-8 opacity-50" />
                </div>
                <p className="text-sm font-medium">{t('chat.fileManager.noFiles')}</p>
                <p className="text-xs mt-1 max-w-[200px] text-center">{t('chat.fileManager.noFilesHint')}</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredFiles.map((file, index) => {
                  const FileIcon = getFileIcon(file.content_type)
                  return (
                    <motion.div
                      key={file.file_uuid}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-accent/50 border border-transparent hover:border-border/50"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileIcon className="h-5 w-5" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{file.filename}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{formatFileSize(file.file_size)}</span>
                          <span>·</span>
                          <span>{formatTime(file.created_at)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {file.preview_support === 'inline_preview' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => handlePreview(file)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => handleDownload(file)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                               <MoreVertical className="h-4 w-4" />
                             </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                             <DropdownMenuItem className="text-destructive focus:text-destructive gap-2 cursor-pointer">
                                <Trash2 className="h-4 w-4" />
                                {t('common.delete')}
                             </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
            
            {/* 加载更多 */}
            {hasMore && files.length > 0 && (
              <div className="p-4 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadFiles()}
                  disabled={loading}
                  className="text-muted-foreground hover:text-primary"
                >
                  {loading && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                  {t('chat.fileManager.loadMore')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )
    }

    // 上传文件
    if (subTab === 'upload') {
      return (
        <div className="flex flex-col h-full p-4 space-y-4 overflow-y-auto">
          <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-6 text-center transition-all hover:border-primary/30 hover:shadow-sm group">
             <div className="w-16 h-16 rounded-full bg-primary/5 group-hover:bg-primary/10 flex items-center justify-center mx-auto mb-4 transition-colors">
               <Upload className="h-8 w-8 text-primary/60 group-hover:text-primary transition-colors" />
             </div>
             
             <h3 className="text-lg font-semibold mb-2">{t('chat.fileManager.uploadFile')}</h3>
             <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">{t('chat.fileManager.clickOrDrag')}</p>
             
             {uploading && (
                <div className="max-w-xs mx-auto mb-6 space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-primary" 
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                    />
                  </div>
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
                size="lg"
                className="rounded-xl px-8 shadow-lg shadow-primary/20"
              >
                {uploading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('chat.fileManager.uploading')}</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" /> {t('chat.fileManager.selectFile')}</>
                )}
              </Button>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium px-1 text-muted-foreground">{t('chat.fileManager.storageLocation')}</h4>
            <div className="grid gap-3">
              {storageOptions.map((option) => {
                const isActive = selectedStorage === option.key
                const Icon = option.icon
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSelectedStorage(option.key)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                      isActive
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                        : "border-border bg-card hover:border-primary/30 hover:bg-accent/50"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                       <div className="flex items-center justify-between mb-1">
                          <span className={cn("font-medium", isActive && "text-primary")}>{option.label}</span>
                          {isActive && <CheckCircle2 className="h-4 w-4 text-primary" />}
                       </div>
                       <p className="text-xs text-muted-foreground line-clamp-1">{option.description}</p>
                    </div>
                  </button>
                )
              })}
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