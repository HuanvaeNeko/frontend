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
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  /**
   * 文件管理页**只做个人文件上传**，不再提供"发送给好友 / 发送到群聊"两档。
   *
   * 原来那两档是坏的，而且是两种不同的坏法：
   * - 好友档：`storage_location='friend_messages'` 却从不传 `related_id`
   *   （下面 `uploadFile` 的第 4 个实参逐字是 `undefined`），后端直接 400
   *   「好友ID不能为空」（`backend-docs/storage/文件存储管理.md:2510-2515`），
   *   用户只看到一句通用的"上传失败"。
   * - 群档：更隐蔽。文档里没有"群ID不能为空 → 400"这一条，所以上传可能成功，
   *   但落库的 `related_id` 为空，而群文件鉴权要求存在一行
   *   `related-id = 请求的群` 的记录（:3021-3033）——于是这个文件在任何群里
   *   都永远读不出来，静默产生一份不可访问的孤儿文件，比 400 更难查。
   *
   * 修法选**收掉入口**而不是补选择器：好友/群文件本来就有一条正确的路径——
   * `ChatWindow.tsx` 的会话上传（:271 传的是 `selectedConversation.id`，
   * :268 按会话类型选 storage_location，:252-256 也正确返回 friend_ 与 group_ 前缀）。
   * 在文件管理页再造一套好友/群选择器只是把同一件事做第二遍，成本与收益不匹配。
   *
   * 因此 `getFileType` 保持返回 `user_*`：在只剩个人上传之后它就是对的。
   */
  const storageOptions = [
    {
      key: 'personal',
      label: t('chat.fileManager.storagePersonal'),
      description: t('chat.fileManager.storagePersonalDesc'),
      icon: FolderOpen,
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

  // 获取存储位置：恒为个人空间。
  // `user_files` 是**唯一**不需要 related_id 的档位，也正因如此它是这个页面
  // 唯一能正确支持的档位（理由见上面 storageOptions 的注释）。
  const getStorageLocation = (): StorageLocation => 'user_files'

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
              {/*
                只剩一档之后它不再是"选择器"，而是一张说明当前去向的静态卡片：
                渲染成 button 会给出一个点了没有任何反应的控件（同时也是一处
                无障碍噪音——一个永远选中、无法取消选中的单选项）。
              */}
              {storageOptions.map((option) => {
                const Icon = option.icon
                return (
                  <div
                    key={option.key}
                    className="flex items-center gap-4 p-4 rounded-xl border text-left border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-primary text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                       <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-primary">{option.label}</span>
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                       </div>
                       <p className="text-xs text-muted-foreground line-clamp-1">{option.description}</p>
                    </div>
                  </div>
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