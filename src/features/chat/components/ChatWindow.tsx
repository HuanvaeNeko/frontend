'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useChatStore } from '@/store/chatStore'
import { messagesApi, type Message, type MessageType } from '@/api/messages'
import { groupMessagesApi } from '@/api/groupMessages'
import { storageApi, type FileType, type StorageLocation } from '@/api/storage'
import { FilePreview, type PreviewFile } from '@/components/ui/file-preview'
import { GroupManagement } from './sidebar/GroupManagement'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/use-toast'
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages'
import type { MarkdownEditorRef } from './window/MarkdownEditor'
import { useI18n } from '@/i18n/I18nProvider'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Sub-components
import { EmptyState } from './window/EmptyState'
import { ChatHeader } from './window/ChatHeader'
import { MessageList } from './window/MessageList'
import { ChatInput } from './window/ChatInput'
import { FileDropOverlay } from './window/FileDropOverlay'

interface ChatWindowProps {
  hideMobileHeader?: boolean
}

const ChatWindow = memo(({ hideMobileHeader = false }: ChatWindowProps) => {
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
  
  // Trigger typingUsers subscription/update if needed by accessing it
  void typingUsers

  // State
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showGroupManagement, setShowGroupManagement] = useState(false)
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
  const [editorHasContent, setEditorHasContent] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Refs
  const dragCounterRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<MarkdownEditorRef>(null)

  // =============================================
  // Effects
  // =============================================

  // Load messages when conversation changes
  useEffect(() => {
    if (!selectedConversation) {
      setMessages([])
      setActiveChat(null, null)
      return
    }
    setActiveChat(selectedConversation.type, selectedConversation.id)
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id]) // Optimized dependency

  // Scroll to bottom on new messages
  useEffect(() => { 
    scrollToBottom() 
  }, [messages.length, selectedConversation?.id]) // Scroll only when message count changes or conversation changes

  // =============================================
  // Message Loading Logic
  // =============================================

  const loadMessages = async () => {
    if (!selectedConversation || loading) return
    setLoading(true)
    try {
      if (selectedConversation.type === 'friend') {
        const response = await messagesApi.getMessages(selectedConversation.id, undefined, 50)
        setMessages(response.messages)
        setHasMore(response.has_more)
      } else if (selectedConversation.type === 'group') {
        const response = await groupMessagesApi.getMessages(selectedConversation.id, undefined, 50)
        setMessages(response.messages as unknown as Message[])
        setHasMore(response.has_more)
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
      toast({ title: t('chat.window.error'), description: t('chat.window.loadFailed'), variant: 'destructive' })
    } finally { 
      setLoading(false) 
    }
  }

  const loadMoreMessages = async () => {
    if (!selectedConversation || loading || !hasMore || messages.length === 0) return
    setLoading(true)
    try {
      const oldestTime = messages[0].send_time
      if (selectedConversation.type === 'friend') {
        const response = await messagesApi.getMessages(selectedConversation.id, oldestTime, 50)
        prependMessages(response.messages)
        setHasMore(response.has_more)
      } else if (selectedConversation.type === 'group') {
        const response = await groupMessagesApi.getMessages(selectedConversation.id, oldestTime, 50)
        prependMessages(response.messages as unknown as Message[])
        setHasMore(response.has_more)
      }
    } catch (error) { 
      console.error('Failed to load more messages:', error) 
    } finally { 
      setLoading(false) 
    }
  }

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (container && container.scrollTop === 0 && hasMore && !loading) {
      loadMoreMessages()
    }
  }, [hasMore, loading])

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (container) container.scrollTop = container.scrollHeight
    })
  }

  // =============================================
  // Message Sending Logic
  // =============================================

  const handleSendMessage = useCallback(async () => {
    const markdownContent = editorRef.current?.getValue() || ''
    if (!selectedConversation || !markdownContent.trim() || sending) return
    
    const content = markdownContent.trim()
    editorRef.current?.clear()
    setSending(true)
    
    try {
      if (selectedConversation.type === 'friend') {
        const response = await messagesApi.sendMessage({ 
          receiver_id: selectedConversation.id, 
          message_content: content, 
          message_type: 'text' 
        })
        addMessage({ 
          message_uuid: response.message_uuid, 
          sender_id: user?.user_id || '', 
          receiver_id: selectedConversation.id, 
          message_content: content, 
          message_type: 'text', 
          file_uuid: null, 
          file_url: null, 
          file_size: null, 
          file_hash: null, 
          filename: null, 
          content_type: null, 
          image_width: null, 
          image_height: null, 
          seq: response.seq, 
          send_time: response.send_time 
        })
      } else if (selectedConversation.type === 'group') {
        const response = await groupMessagesApi.sendMessage({ 
          group_id: selectedConversation.id, 
          message_content: content, 
          message_type: 'text' 
        })
        addMessage({ 
          message_uuid: response.message_uuid, 
          sender_id: user?.user_id || '', 
          receiver_id: selectedConversation.id, 
          message_content: content, 
          message_type: 'text', 
          file_uuid: null, 
          file_url: null, 
          file_size: null, 
          file_hash: null, 
          filename: null, 
          content_type: null, 
          image_width: null, 
          image_height: null, 
          seq: response.seq, 
          send_time: response.send_time 
        })
      }
      
      useChatStore.getState().updateLastMessage(
        selectedConversation.type, 
        selectedConversation.id, 
        content, 
        'text', 
        new Date().toISOString()
      )
    } catch (error) {
      console.error('Failed to send message:', error)
      toast({ 
        title: t('chat.window.sendFailedTitle'), 
        description: error instanceof Error ? error.message : t('chat.window.sendFailedDesc'), 
        variant: 'destructive' 
      })
    } finally { 
      setSending(false) 
    }
  }, [selectedConversation, sending, user, addMessage, toast, t])

  // =============================================
  // File Handling
  // =============================================

  const processFileForUpload = useCallback((file: File) => {
    if (file.size > 100 * 1024 * 1024 * 1024) { // 100GB limit? Seems high but ok
      toast({ 
        title: t('chat.window.fileTooLargeTitle'), 
        description: t('chat.window.fileTooLargeDesc'), 
        variant: 'destructive' 
      })
      return
    }
    setSelectedFile(file)
  }, [t, toast])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFileForUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [processFileForUpload])

  const handleCancelFile = useCallback(() => { 
    setSelectedFile(null)
    setUploadProgress(null) 
  }, [])

  const getFileType = (file: File): { type: FileType; messageType: MessageType } => {
    const mimeType = file.type
    if (mimeType.startsWith('image/')) return { type: selectedConversation?.type === 'friend' ? 'friend_image' : 'group_image', messageType: 'image' as MessageType }
    if (mimeType.startsWith('video/')) return { type: selectedConversation?.type === 'friend' ? 'friend_video' : 'group_video', messageType: 'video' as MessageType }
    return { type: selectedConversation?.type === 'friend' ? 'friend_document' : 'group_document', messageType: 'file' as MessageType }
  }

  const handleSendFile = useCallback(async () => {
    if (!selectedConversation || !selectedFile || sending) return
    
    const file = selectedFile
    setSelectedFile(null)
    setSending(true)
    setUploadProgress(0)
    
    try {
      const { type, messageType } = getFileType(file)
      const storageLocation: StorageLocation = selectedConversation.type === 'friend' ? 'friend_messages' : 'group_files'
      
      const uploadResult = await storageApi.uploadFile(
        file, 
        type, 
        storageLocation, 
        selectedConversation.id, 
        (progress) => setUploadProgress(progress.percent)
      )
      
      if (uploadResult.messageUuid) {
        await loadMessages()
        toast({ 
          title: t('chat.window.sendSuccessTitle'), 
          description: uploadResult.isInstant ? t('chat.window.fileInstantSuccess') : t('chat.window.fileSendSuccess') 
        })
      } else {
        const fileUuid = uploadResult.fileUrl.split('/').pop() || ''
        const messageData = {
          message_content: file.name,
          message_type: messageType,
          file_uuid: fileUuid,
          file_size: file.size
        }
        
        let response
        if (selectedConversation.type === 'friend') {
          response = await messagesApi.sendMessage({ 
            receiver_id: selectedConversation.id, 
            ...messageData 
          })
        } else {
          response = await groupMessagesApi.sendMessage({ 
            group_id: selectedConversation.id, 
            ...messageData 
          })
        }

        addMessage({ 
          message_uuid: response.message_uuid, 
          sender_id: user?.user_id || '', 
          receiver_id: selectedConversation.id, 
          ...messageData,
          file_url: uploadResult.fileUrl, 
          file_hash: null, 
          filename: file.name, 
          content_type: file.type, 
          image_width: null, 
          image_height: null, 
          seq: response.seq, 
          send_time: response.send_time 
        })
        
        toast({ 
          title: t('chat.window.sendSuccessTitle'), 
          description: t('chat.window.fileSendSuccess') 
        })
      }
    } catch (error) {
      console.error('Failed to send file:', error)
      toast({ 
        title: t('chat.window.sendFailedTitle'), 
        description: error instanceof Error ? error.message : t('chat.window.fileSendFailed'), 
        variant: 'destructive' 
      })
    } finally { 
      setSending(false)
      setUploadProgress(null) 
    }
  }, [selectedConversation, selectedFile, sending, user, addMessage, t, toast]) // eslint-disable-line react-hooks/exhaustive-deps

  // =============================================
  // Drag & Drop
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
  }, [sending, processFileForUpload])

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
  }, [sending, processFileForUpload])

  // =============================================
  // Message Actions
  // =============================================

  const handleCopyMessage = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      toast({ title: t('chat.window.copiedTitle'), description: t('chat.window.copiedDesc') })
    } catch {
      toast({ title: t('chat.window.copyFailedTitle'), description: t('chat.window.copyFailedDesc'), variant: 'destructive' })
    }
  }, [t, toast])

  const handleDeleteMessage = useCallback(async (messageUuid: string) => {
    try {
      if (selectedConversation?.type === 'friend') await messagesApi.deleteMessage(messageUuid)
      else if (selectedConversation?.type === 'group') await groupMessagesApi.deleteMessage(messageUuid)
      setMessages(messages.filter(m => m.message_uuid !== messageUuid))
      toast({ title: t('chat.window.successTitle'), description: t('chat.window.messageDeleted') })
    } catch (error) {
      toast({ title: t('chat.window.deleteFailedTitle'), description: error instanceof Error ? error.message : t('chat.window.deleteFailedDesc'), variant: 'destructive' })
    }
  }, [selectedConversation, messages, setMessages, t, toast])

  const handleRecallMessage = useCallback(async (messageUuid: string) => {
    try {
      if (selectedConversation?.type === 'friend') await messagesApi.recallMessage(messageUuid)
      else if (selectedConversation?.type === 'group') await groupMessagesApi.recallMessage(messageUuid)
      setMessages(messages.map(m =>
        m.message_uuid === messageUuid
          ? { ...m, message_content: t('chat.window.youRecalled'), message_type: 'text' as const }
          : m
      ))
      toast({ title: t('chat.window.successTitle'), description: t('chat.window.messageRecalled') })
    } catch (error) {
      toast({ title: t('chat.window.recallFailedTitle'), description: error instanceof Error ? error.message : t('chat.window.recallFailedDesc'), variant: 'destructive' })
    }
  }, [selectedConversation, messages, setMessages, t, toast])

  const canRecallMessage = useCallback((sendTime: string) => 
    (Date.now() - new Date(sendTime).getTime()) <= 2 * 60 * 1000, 
  [])

  const handleFilePreview = useCallback(async (message: Message) => {
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
  }, [selectedConversation, t, toast])

  const handleFileDownload = useCallback(async (message: Message) => {
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
  }, [selectedConversation, t, toast])

  if (!selectedConversation) {
    return <EmptyState />
  }

  return (
    <div
      className="h-full flex flex-col min-h-0 overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FileDropOverlay isDragging={isDragging} />

      <ChatHeader 
        conversation={selectedConversation}
        hideMobileHeader={hideMobileHeader}
        onGroupManage={() => setShowGroupManagement(true)}
      />

      <MessageList
        messages={messages}
        conversation={selectedConversation}
        user={user}
        loading={loading}
        hasMore={hasMore}
        typingUsers={getTypingUsers(selectedConversation.id)}
        onLoadMore={loadMoreMessages}
        onScroll={handleScroll}
        onCopy={handleCopyMessage}
        onDelete={handleDeleteMessage}
        onRecall={handleRecallMessage}
        onDownload={handleFileDownload}
        onPreview={handleFilePreview}
        canRecallMessage={canRecallMessage}
        messagesContainerRef={messagesContainerRef}
        messagesEndRef={messagesEndRef}
      />

      <ChatInput
        sending={sending}
        selectedFile={selectedFile}
        uploadProgress={uploadProgress}
        editorHasContent={editorHasContent}
        fileInputRef={fileInputRef}
        editorRef={editorRef}
        onSendMessage={handleSendMessage}
        onSendFile={handleSendFile}
        onFileSelect={handleFileSelect}
        onCancelFile={handleCancelFile}
        onPaste={handlePaste}
        setEditorHasContent={setEditorHasContent}
      />

      {/* Group Management Dialog */}
      <Dialog 
        open={showGroupManagement && selectedConversation.type === 'group'} 
        onOpenChange={setShowGroupManagement}
      >
        <DialogContent className="max-w-2xl h-[80vh] max-h-[700px] flex flex-col p-0">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t('chat.window.groupManage')}</DialogTitle>
            <DialogDescription className="sr-only">{t('chat.window.groupManageDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <GroupManagement groupId={selectedConversation.id} onClose={() => setShowGroupManagement(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {previewFile && <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  )
})

ChatWindow.displayName = 'ChatWindow'

export default ChatWindow
