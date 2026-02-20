'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Paperclip, Loader2, MoreVertical, Image as ImageIcon, FileText, Video, Trash2, RotateCcw, Download, X, Settings, MessageCircle, Copy, Upload } from 'lucide-react'
import { EmojiPicker } from './EmojiPicker'
import { MessageImage } from './MessageImage'
import { MessageVideo } from './MessageVideo'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { useChatStore } from '../../store/chatStore'
import { messagesApi, type Message, type MessageType } from '../../api/messages'
import { groupMessagesApi, type GroupMessage } from '../../api/groupMessages'
import { storageApi, type FileType, type StorageLocation } from '../../api/storage'
import { FilePreview, type PreviewFile } from '@/components/ui/file-preview'
import GroupManagement from './GroupManagement'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../hooks/use-toast'
import { useRealtimeMessages } from '../../hooks/useRealtimeMessages'
import MarkdownEditor, { type MarkdownEditorRef } from './MarkdownEditor'
import { Markdown } from '@/components/ui/markdown'
import { useI18n } from '@/i18n/I18nProvider'

interface ChatWindowProps {
  hideMobileHeader?: boolean
}

export default function ChatWindow({ hideMobileHeader = false }: ChatWindowProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const { user } = useAuthStore()
  const { setActiveChat } = useRealtimeMessages()
  const {
    selectedConversation,
    messages,
    setMessages,
    addMessage,
    prependMessages,
    getTypingUsers,
    typingUsers,
  } = useChatStore()
  
  void typingUsers

  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showGroupManagement, setShowGroupManagement] = useState(false)
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
  const [editorHasContent, setEditorHasContent] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<MarkdownEditorRef>(null)

  // 设置活跃聊天 + 加载消息
  useEffect(() => {
    if (!selectedConversation) {
      setMessages([])
      setActiveChat(null, null)
      return
    }
    setActiveChat(selectedConversation.type, selectedConversation.id)
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation])

  useEffect(() => { scrollToBottom() }, [messages])

  const loadMessages = async () => {
    if (!selectedConversation || loading) return
    setLoading(true)
    try {
      if (selectedConversation.type === 'friend') {
        const response = await messagesApi.getMessages(selectedConversation.id, undefined, 50)
        setMessages(response.messages); setHasMore(response.has_more)
      } else if (selectedConversation.type === 'group') {
        const response = await groupMessagesApi.getMessages(selectedConversation.id, undefined, 50)
        setMessages(response.messages as unknown as Message[]); setHasMore(response.has_more)
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
      toast({ title: t('chat.window.error'), description: t('chat.window.loadFailed'), variant: 'destructive' })
    } finally { setLoading(false) }
  }

  const loadMoreMessages = async () => {
    if (!selectedConversation || loading || !hasMore || messages.length === 0) return
    setLoading(true)
    try {
      const oldestTime = messages[0].send_time
      if (selectedConversation.type === 'friend') {
        const response = await messagesApi.getMessages(selectedConversation.id, oldestTime, 50)
        prependMessages(response.messages); setHasMore(response.has_more)
      } else if (selectedConversation.type === 'group') {
        const response = await groupMessagesApi.getMessages(selectedConversation.id, oldestTime, 50)
        prependMessages(response.messages as unknown as Message[]); setHasMore(response.has_more)
      }
    } catch (error) { console.error('Failed to load more messages:', error) }
    finally { setLoading(false) }
  }

  const handleScroll = () => {
    const container = messagesContainerRef.current
    if (container && container.scrollTop === 0 && hasMore && !loading) loadMoreMessages()
  }

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (container) container.scrollTop = container.scrollHeight
    })
  }

  const handleSendMessage = useCallback(async () => {
    const markdownContent = editorRef.current?.getValue() || ''
    if (!selectedConversation || !markdownContent.trim() || sending) return
    const content = markdownContent.trim()
    editorRef.current?.clear()
    setSending(true)
    try {
      if (selectedConversation.type === 'friend') {
        const response = await messagesApi.sendMessage({ receiver_id: selectedConversation.id, message_content: content, message_type: 'text' })
        addMessage({ message_uuid: response.message_uuid, sender_id: user?.user_id || '', receiver_id: selectedConversation.id, message_content: content, message_type: 'text', file_uuid: null, file_url: null, file_size: null, file_hash: null, filename: null, content_type: null, image_width: null, image_height: null, seq: response.seq, send_time: response.send_time })
      } else if (selectedConversation.type === 'group') {
        const response = await groupMessagesApi.sendMessage({ group_id: selectedConversation.id, message_content: content, message_type: 'text' })
        addMessage({ message_uuid: response.message_uuid, sender_id: user?.user_id || '', receiver_id: selectedConversation.id, message_content: content, message_type: 'text', file_uuid: null, file_url: null, file_size: null, file_hash: null, filename: null, content_type: null, image_width: null, image_height: null, seq: response.seq, send_time: response.send_time })
      }
      // 更新消息预览
      useChatStore.getState().updateLastMessage(selectedConversation.type, selectedConversation.id, content, 'text', new Date().toISOString())
    } catch (error) {
      console.error('Failed to send message:', error)
      toast({ title: t('chat.window.sendFailedTitle'), description: error instanceof Error ? error.message : t('chat.window.sendFailedDesc'), variant: 'destructive' })
    } finally { setSending(false) }
  }, [selectedConversation, sending, user, addMessage, toast, t])

  // =============================================
  // 文件处理
  // =============================================

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFileForUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const processFileForUpload = (file: File) => {
    if (file.size > 100 * 1024 * 1024 * 1024) {
      toast({ title: t('chat.window.fileTooLargeTitle'), description: t('chat.window.fileTooLargeDesc'), variant: 'destructive' })
      return
    }
    setSelectedFile(file)
  }

  const handleCancelFile = () => { setSelectedFile(null); setUploadProgress(null) }

  const getFileType = (file: File): { type: FileType; messageType: MessageType } => {
    const mimeType = file.type
    if (mimeType.startsWith('image/')) return { type: selectedConversation?.type === 'friend' ? 'friend_image' : 'group_image', messageType: 'image' as MessageType }
    if (mimeType.startsWith('video/')) return { type: selectedConversation?.type === 'friend' ? 'friend_video' : 'group_video', messageType: 'video' as MessageType }
    return { type: selectedConversation?.type === 'friend' ? 'friend_document' : 'group_document', messageType: 'file' as MessageType }
  }

  const handleSendFile = async () => {
    if (!selectedConversation || !selectedFile || sending) return
    const file = selectedFile
    setSelectedFile(null); setSending(true); setUploadProgress(0)
    try {
      const { type, messageType } = getFileType(file)
      const storageLocation: StorageLocation = selectedConversation.type === 'friend' ? 'friend_messages' : 'group_files'
      const uploadResult = await storageApi.uploadFile(file, type, storageLocation, selectedConversation.id, (progress) => setUploadProgress(progress.percent))
      if (uploadResult.messageUuid) {
        await loadMessages()
        toast({ title: t('chat.window.sendSuccessTitle'), description: uploadResult.isInstant ? t('chat.window.fileInstantSuccess') : t('chat.window.fileSendSuccess') })
      } else {
        const fileUuid = uploadResult.fileUrl.split('/').pop() || ''
        if (selectedConversation.type === 'friend') {
          const response = await messagesApi.sendMessage({ receiver_id: selectedConversation.id, message_content: file.name, message_type: messageType, file_uuid: fileUuid, file_size: file.size })
          addMessage({ message_uuid: response.message_uuid, sender_id: user?.user_id || '', receiver_id: selectedConversation.id, message_content: file.name, message_type: messageType, file_uuid: fileUuid, file_url: uploadResult.fileUrl, file_size: file.size, file_hash: null, filename: file.name, content_type: file.type, image_width: null, image_height: null, seq: response.seq, send_time: response.send_time })
        } else if (selectedConversation.type === 'group') {
          const response = await groupMessagesApi.sendMessage({ group_id: selectedConversation.id, message_content: file.name, message_type: messageType, file_uuid: fileUuid, file_size: file.size })
          addMessage({ message_uuid: response.message_uuid, sender_id: user?.user_id || '', receiver_id: selectedConversation.id, message_content: file.name, message_type: messageType, file_uuid: fileUuid, file_url: uploadResult.fileUrl, file_size: file.size, file_hash: null, filename: file.name, content_type: file.type, image_width: null, image_height: null, seq: response.seq, send_time: response.send_time })
        }
        toast({ title: t('chat.window.sendSuccessTitle'), description: t('chat.window.fileSendSuccess') })
      }
    } catch (error) {
      console.error('Failed to send file:', error)
      toast({ title: t('chat.window.sendFailedTitle'), description: error instanceof Error ? error.message : t('chat.window.fileSendFailed'), variant: 'destructive' })
    } finally { setSending(false); setUploadProgress(null) }
  }

  // =============================================
  // 拖拽上传
  // =============================================

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)
    if (sending) return
    const files = e.dataTransfer.files
    if (files.length > 0) processFileForUpload(files[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending])

  // =============================================
  // 粘贴图片
  // =============================================

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (sending) return
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (file) {
          const namedFile = new File([file], `clipboard-${Date.now()}.png`, { type: file.type })
          processFileForUpload(namedFile)
        }
        return
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending])

  // =============================================
  // 消息操作
  // =============================================

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      toast({ title: t('chat.window.copiedTitle'), description: t('chat.window.copiedDesc') })
    } catch {
      toast({ title: t('chat.window.copyFailedTitle'), description: t('chat.window.copyFailedDesc'), variant: 'destructive' })
    }
  }

  const handleDeleteMessage = async (messageUuid: string) => {
    try {
      if (selectedConversation?.type === 'friend') await messagesApi.deleteMessage(messageUuid)
      else if (selectedConversation?.type === 'group') await groupMessagesApi.deleteMessage(messageUuid)
      setMessages(messages.filter(m => m.message_uuid !== messageUuid))
      toast({ title: t('chat.window.successTitle'), description: t('chat.window.messageDeleted') })
    } catch (error) {
      toast({ title: t('chat.window.deleteFailedTitle'), description: error instanceof Error ? error.message : t('chat.window.deleteFailedDesc'), variant: 'destructive' })
    }
  }

  const handleRecallMessage = async (messageUuid: string) => {
    try {
      if (selectedConversation?.type === 'friend') await messagesApi.recallMessage(messageUuid)
      else if (selectedConversation?.type === 'group') await groupMessagesApi.recallMessage(messageUuid)
      // 标记为已撤回而不是删除
      setMessages(messages.map(m =>
        m.message_uuid === messageUuid
          ? { ...m, message_content: t('chat.window.youRecalled'), message_type: 'text' as const }
          : m
      ))
      toast({ title: t('chat.window.successTitle'), description: t('chat.window.messageRecalled') })
    } catch (error) {
      toast({ title: t('chat.window.recallFailedTitle'), description: error instanceof Error ? error.message : t('chat.window.recallFailedDesc'), variant: 'destructive' })
    }
  }

  const canRecallMessage = (sendTime: string) => (Date.now() - new Date(sendTime).getTime()) <= 2 * 60 * 1000

  const handleFilePreview = async (message: Message) => {
    try {
      let url = message.file_url
      if (message.file_uuid) {
        url = selectedConversation?.type === 'friend'
          ? await storageApi.getFriendFilePresignedUrl(message.file_uuid, 'preview')
          : await storageApi.getPresignedUrl(message.file_uuid, 'preview')
      }
      if (url) {
        const name = message.message_type === 'image' ? t('chat.window.image') : message.message_type === 'video' ? t('chat.window.video') : message.message_type === 'file' ? t('chat.window.file') : t('chat.window.unnamedFile')
        const mimeType = message.message_type === 'image' ? 'image/*' : message.message_type === 'video' ? 'video/*' : 'application/octet-stream'
        setPreviewFile({ url, name, type: mimeType, size: message.file_size ?? undefined })
      }
    } catch (error) {
      toast({ title: t('chat.window.previewFailedTitle'), description: error instanceof Error ? error.message : t('chat.window.previewFailedDesc'), variant: 'destructive' })
    }
  }

  const handleFileDownload = async (message: Message) => {
    try {
      let downloadUrl: string
      if (message.file_uuid) {
        downloadUrl = selectedConversation?.type === 'friend'
          ? await storageApi.getFriendFilePresignedUrl(message.file_uuid, 'download')
          : await storageApi.getPresignedUrl(message.file_uuid, 'download')
      } else if (message.file_url) { downloadUrl = message.file_url }
      else { throw new Error(t('chat.window.fileUnavailable')) }
      const a = document.createElement('a'); a.href = downloadUrl; a.download = message.message_content || t('chat.window.downloadDefault')
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch (error) {
      toast({ title: t('chat.window.downloadFailedTitle'), description: error instanceof Error ? error.message : t('chat.window.downloadFailedDesc'), variant: 'destructive' })
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  }

  const renderMessageContent = (message: Message, isOwn: boolean) => {
    switch (message.message_type) {
      case 'text':
        return <Markdown className="text-sm chat-message-markdown">{message.message_content}</Markdown>
      case 'image':
        return (message.file_url || message.file_uuid) ? (
          <MessageImage fileUrl={message.file_url} fileUuid={message.file_uuid} isFriendMessage={selectedConversation?.type === 'friend'} onClick={() => handleFilePreview(message)} />
        ) : (
          <div className="flex items-center gap-2 text-sm"><ImageIcon className="h-4 w-4" /><span>[{t('chat.window.image')}]</span></div>
        )
      case 'video':
        return (message.file_url || message.file_uuid) ? (
          <MessageVideo fileUrl={message.file_url} fileUuid={message.file_uuid} isFriendMessage={selectedConversation?.type === 'friend'} className="max-w-[240px] rounded-xl" />
        ) : (
          <div className="flex items-center gap-2 text-sm"><Video className="h-4 w-4" /><span>[{t('chat.window.video')}]</span></div>
        )
      case 'file':
        return (
          <div className={`flex items-center gap-3 p-3 rounded-xl min-w-[200px] ${isOwn ? 'bg-primary/20' : 'bg-primary/10'}`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isOwn ? 'bg-primary/30' : 'bg-primary/20'}`}>
              <FileText className={`h-5 w-5 ${isOwn ? 'text-primary-foreground' : 'text-primary'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isOwn ? 'text-primary-foreground' : 'text-foreground'}`}>{message.message_content || t('chat.window.file')}</p>
              {message.file_size && <p className={`text-xs ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatFileSize(message.file_size)}</p>}
            </div>
            {(message.file_url || message.file_uuid) && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleFileDownload(message)}>
                <Download className={`h-4 w-4 ${isOwn ? 'text-primary-foreground' : 'text-primary'}`} />
              </Button>
            )}
          </div>
        )
      default:
        return <p className="text-sm">[{t('chat.window.unsupportedMessageType')}]</p>
    }
  }

  if (!selectedConversation) {
    return (
      <div className="h-full min-h-0 flex items-center justify-center overflow-hidden">
        <motion.div className="text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center bg-primary/10">
            <MessageCircle className="w-12 h-12 text-primary/50" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-2">Huanvae Chat</h3>
          <p className="text-muted-foreground">{t('chat.window.selectConversation')}</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col min-h-0 overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖拽覆盖层 */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10"
          >
            <div className="text-center">
              <Upload className="h-12 w-12 text-primary mx-auto mb-3" />
              <p className="text-lg font-medium text-primary">{t('chat.window.dragUploadTitle')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('chat.window.dragUploadDesc')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 聊天头部 */}
      <header className={`px-6 py-4 min-h-[81px] shrink-0 border-b border-border bg-card flex items-center justify-between ${hideMobileHeader ? 'hidden' : ''}`}>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={selectedConversation.avatar} />
            <AvatarFallback className="bg-primary text-primary-foreground">{selectedConversation.name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">{selectedConversation.name}</h2>
            <span className="text-xs text-muted-foreground">{selectedConversation.type === 'friend' ? t('chat.window.friend') : t('chat.window.group')}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {selectedConversation.type === 'group' && (
            <Button variant="ghost" size="icon" onClick={() => setShowGroupManagement(true)} title={t('chat.window.groupManage')}>
              <Settings className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5" /></Button>
        </div>
      </header>

      {/* 消息列表 */}
      <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4" onScroll={handleScroll}>
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full"><p className="text-sm text-muted-foreground">{t('chat.window.noMessage')}</p></div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center">
                <Button variant="outline" size="sm" onClick={loadMoreMessages} disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('chat.window.loading')}</> : t('chat.window.loadMore')}
                </Button>
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map((message) => {
                const isOwn = message.sender_id === user?.user_id
                const groupMessage = selectedConversation.type === 'group' ? (message as unknown as GroupMessage) : null
                const canRecall = isOwn && canRecallMessage(message.send_time)
                const isRecalled = (message as Message & { is_recalled?: boolean }).is_recalled
                return (
                  <motion.div key={message.message_uuid} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'} group`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                    <Avatar className="h-10 w-10 shrink-0">
                      {groupMessage && <AvatarImage src={groupMessage.sender_avatar_url} />}
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {groupMessage ? (groupMessage.sender_nickname?.[0] || 'U').toUpperCase() : isOwn ? user?.nickname?.[0]?.toUpperCase() || 'U' : selectedConversation.name?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`flex flex-col gap-1 max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                      {groupMessage && !isOwn && <span className="text-xs text-muted-foreground px-2">{groupMessage.sender_nickname}</span>}

                      {isRecalled ? (
                        /* 已撤回的消息 */
                        <div className="px-4 py-2 text-xs text-muted-foreground italic">
                          {isOwn ? t('chat.window.youRecalled') : t('chat.window.someoneRecalled', { name: groupMessage?.sender_nickname || t('chat.window.otherSide') })}
                        </div>
                      ) : (
                        /* 右键菜单包裹的消息气泡 */
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div className={`rounded-2xl px-4 py-2.5 cursor-pointer ${isOwn ? 'message-own bg-primary text-primary-foreground shadow-md' : 'bg-card border border-border text-foreground'}`}>
                              {renderMessageContent(message, isOwn)}
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            {message.message_type === 'text' && (
                              <ContextMenuItem onClick={() => handleCopyMessage(message.message_content)}>
                                <Copy className="h-4 w-4 mr-2" />{t('chat.window.copy')}
                              </ContextMenuItem>
                            )}
                            {(message.file_url || message.file_uuid) && (
                              <ContextMenuItem onClick={() => handleFileDownload(message)}>
                                <Download className="h-4 w-4 mr-2" />{t('chat.window.download')}
                              </ContextMenuItem>
                            )}
                            {(message.message_type === 'image' || message.message_type === 'video') && (message.file_url || message.file_uuid) && (
                              <ContextMenuItem onClick={() => handleFilePreview(message)}>
                                <ImageIcon className="h-4 w-4 mr-2" />{t('chat.window.preview')}
                              </ContextMenuItem>
                            )}
                            {canRecall && (
                              <>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => handleRecallMessage(message.message_uuid)}>
                                  <RotateCcw className="h-4 w-4 mr-2" />{t('chat.window.recall')}
                                </ContextMenuItem>
                              </>
                            )}
                            <ContextMenuSeparator />
                            <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteMessage(message.message_uuid)}>
                              <Trash2 className="h-4 w-4 mr-2" />{t('chat.window.delete')}
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      )}
                      <span className="text-xs text-muted-foreground px-2">{new Date(message.send_time).toLocaleTimeString()}</span>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
            <div ref={messagesEndRef} />
            {selectedConversation && (() => {
              const typingList = getTypingUsers(selectedConversation.id)
              if (typingList.length === 0) return null
              return (
                <motion.div className="px-4 py-2 flex items-center gap-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex space-x-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span key={i} className="w-2 h-2 bg-primary rounded-full" animate={{ y: [-3, 0, -3] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {selectedConversation.type === 'friend'
                      ? t('chat.window.friendTyping')
                      : typingList.length === 1
                        ? t('chat.window.someoneTyping')
                        : t('chat.window.peopleTyping', { count: typingList.length })}
                  </span>
                </motion.div>
              )
            })()}
          </>
        )}
      </div>

      {/* 输入区域 */}
      <div className="p-3 sm:p-4 shrink-0 border-t border-border bg-card/50 pb-[max(1rem,env(safe-area-inset-bottom))]" onPaste={handlePaste}>
        <AnimatePresence>
          {selectedFile && (
            <motion.div className="mb-3 p-3 rounded-xl flex items-center gap-3 bg-muted border border-border" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                {selectedFile.type.startsWith('image/') ? <ImageIcon className="h-5 w-5 text-primary" /> : selectedFile.type.startsWith('video/') ? <Video className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={handleCancelFile} disabled={sending}>
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {uploadProgress !== null && (
            <motion.div className="mb-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{t('chat.window.uploading')}</span>
                <span>{uploadProgress.toFixed(1)}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar" />
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => fileInputRef.current?.click()} disabled={sending}>
            <Paperclip className="h-5 w-5" />
          </Button>
          <EmojiPicker onSelect={(emoji) => editorRef.current?.insertText(emoji)} disabled={sending} />
          <MarkdownEditor ref={editorRef} placeholder={t('chat.window.inputPlaceholder')} onSubmit={handleSendMessage} onChange={() => setEditorHasContent(!(editorRef.current?.isEmpty() ?? true))} disabled={sending} className="flex-1" minHeight="42px" maxHeight="150px" />
          <Button size="icon" className="h-10 w-10 shrink-0" onClick={selectedFile ? handleSendFile : handleSendMessage} disabled={(!editorHasContent && !selectedFile) || sending}>
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* 群管理 Dialog */}
      <Dialog open={showGroupManagement && selectedConversation?.type === 'group'} onOpenChange={setShowGroupManagement}>
        <DialogContent className="max-w-2xl h-[80vh] max-h-[700px] flex flex-col p-0">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('chat.window.groupManage')}</DialogTitle>
            <DialogDescription className="sr-only">{t('chat.window.groupManageDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <GroupManagement groupId={selectedConversation?.id || ''} onClose={() => setShowGroupManagement(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {previewFile && <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  )
}
