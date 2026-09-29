'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react'
import { ArrowDown } from 'lucide-react'
import { useChatStore } from '@/features/chat/store/chatStore'
import { messagesApi, type Message, type MessageType } from '@/features/chat/api/messages'
import { groupMessagesApi } from '@/features/chat/api/groupMessages'
import { storageApi, type FileType, type StorageLocation } from '@/api/storage'
import { FilePreview, type PreviewFile } from '@/components/ui/file-preview'
import GroupManagement from './sidebar/GroupManagement'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useToast } from '@/hooks/use-toast'
import { setActiveChat } from '@/features/chat/hooks/useRealtimeMessages'
import type { MarkdownEditorRef } from './window/MarkdownEditor'
import { useI18n } from '@/i18n/I18nProvider'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { differenceInMinutes } from 'date-fns'
import { useDropzone } from 'react-dropzone'

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
  // 待确认删除的消息：删除不可撤销，右键「删除」先弹确认（原来即刻删除）
  const [pendingDeleteUuid, setPendingDeleteUuid] = useState<string | null>(null)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<MarkdownEditorRef>(null)
  // 每次（重新）加载会话历史都换一个号，切会话也会换号。响应回来时号已不是最新
  // ——期间切过会话——就整页丢弃：线上 TTFB 1–2 s，快速点两个会话，前一个的历史
  // 晚到会写进后一个的窗口（标题是 B、消息是 A）。
  const loadSeqRef = useRef(0)
  const convKey = selectedConversation ? `${selectedConversation.type}:${selectedConversation.id}` : null
  // 用户是否停在消息区底部（滚动时更新）；「加载更早」前记下的滚动高度，用来还原视口
  const stickToBottomRef = useRef(true)
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null)
  const [unseenCount, setUnseenCount] = useState(0)

  // =============================================
  // Effects
  // =============================================

  // Load messages when conversation changes
  useEffect(() => {
    // 先清掉上一个会话的消息：新会话加载期间显示加载态，而不是挂着别人的聊天记录
    setMessages([])
    if (!selectedConversation) {
      loadSeqRef.current++
      setActiveChat(null, null)
      return
    }
    setActiveChat(selectedConversation.type, selectedConversation.id)
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convKey])

  // 图片/视频在首屏滚到底之后才加载完，内容变高、最后几条被推到视口下面（线上慢网很明显）。
  // 用户本来停在底部就补滚一次。load 不冒泡，所以在 document 捕获阶段听、再按容器过滤——
  // 容器会随消息从无到有重新挂载，挂在容器上的监听器会丢。
  useEffect(() => {
    const onMediaLoaded = (event: Event) => {
      const container = messagesContainerRef.current
      if (!container || !(event.target instanceof Node) || !container.contains(event.target)) return
      if (stickToBottomRef.current) container.scrollTop = container.scrollHeight
    }
    document.addEventListener('load', onMediaLoaded, true)
    document.addEventListener('loadedmetadata', onMediaLoaded, true)
    return () => {
      document.removeEventListener('load', onMediaLoaded, true)
      document.removeEventListener('loadedmetadata', onMediaLoaded, true)
    }
  }, [])

  // 消息区滚动：原来只要 messages.length 变就拽到底——上翻「加载更早」会被拽回
  // 最底部，看历史时来一条新消息也被拽走。现在按变化的种类处理：
  // - 换了会话 / 首屏：到底
  // - 头部拼进更早的一页：按加载前记下的高度差还原视口，读到哪还在哪
  // - 尾部来了新消息：本来就在底部、或是自己发的，才跟到底；否则计入「N 条新消息」
  const prevEdgesRef = useRef<{ key: string | null; last?: string }>({ key: null })
  useLayoutEffect(() => {
    const container = messagesContainerRef.current
    const prev = prevEdgesRef.current
    const lastMessage = messages[messages.length - 1]
    prevEdgesRef.current = { key: convKey, last: lastMessage?.message_uuid }
    if (!container || !lastMessage) return

    const anchor = prependAnchorRef.current
    if (anchor) {
      prependAnchorRef.current = null
      container.scrollTop = container.scrollHeight - anchor.height + anchor.top
      return
    }
    if (prev.key !== convKey || prev.last === undefined) {
      container.scrollTop = container.scrollHeight
      stickToBottomRef.current = true
      setUnseenCount(0)
      return
    }
    if (lastMessage.message_uuid !== prev.last) {
      if (stickToBottomRef.current || lastMessage.sender_id === user?.user_id) {
        container.scrollTop = container.scrollHeight
        setUnseenCount(0)
      } else {
        setUnseenCount((n) => n + 1)
      }
    }
  }, [messages, convKey, user?.user_id])

  // =============================================
  // Message Loading Logic
  // =============================================

  const loadMessages = async () => {
    if (!selectedConversation) return
    // 不再用 `loading` 早退：它可能是**上一个会话**还在途的那次加载，挡掉的是当前会话
    const seq = ++loadSeqRef.current
    setLoading(true)
    try {
      const response = selectedConversation.type === 'friend'
        ? await messagesApi.getMessages(selectedConversation.id, undefined, 50)
        : await groupMessagesApi.getMessages(selectedConversation.id, undefined, 50)
      if (seq !== loadSeqRef.current) return
      setMessages(response.messages as unknown as Message[])
      setHasMore(response.has_more)
    } catch (error) {
      if (seq !== loadSeqRef.current) return
      console.error('Failed to load messages:', error)
      toast({ title: t('chat.window.error'), description: t('chat.window.loadFailed'), variant: 'destructive' })
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }

  const loadMoreMessages = useCallback(async () => {
    if (!selectedConversation || loading || !hasMore || messages.length === 0) return
    // 翻页不换号：期间若切了会话，号会被新会话的加载换掉，这一页随之作废
    const seq = loadSeqRef.current
    setLoading(true)
    try {
      const oldestTime = messages[0].send_time
      const response = selectedConversation.type === 'friend'
        ? await messagesApi.getMessages(selectedConversation.id, oldestTime, 50)
        : await groupMessagesApi.getMessages(selectedConversation.id, oldestTime, 50)
      if (seq !== loadSeqRef.current) return
      const container = messagesContainerRef.current
      prependAnchorRef.current = container ? { height: container.scrollHeight, top: container.scrollTop } : null
      prependMessages(response.messages as unknown as Message[])
      setHasMore(response.has_more)
    } catch (error) {
      console.error('Failed to load more messages:', error)
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [selectedConversation, loading, hasMore, messages, prependMessages])

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120
    stickToBottomRef.current = atBottom
    if (atBottom) setUnseenCount(0)
    if (container.scrollTop === 0 && hasMore && !loading) {
      loadMoreMessages()
    }
  }, [hasMore, loading, loadMoreMessages])

  const jumpToLatest = useCallback(() => {
    const container = messagesContainerRef.current
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    setUnseenCount(0)
  }, [])

  // =============================================
  // Message Sending Logic
  // =============================================

  const handleSendMessage = useCallback(async () => {
    const markdownContent = editorRef.current?.getValue() || ''
    if (!selectedConversation || !markdownContent.trim() || sending) return
    
    const content = markdownContent.trim()
    editorRef.current?.clear()
    // 点发送按钮时焦点在按钮上：还给输入框，接着打下一条
    editorRef.current?.focus()
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
      // 发送前已清空输入框：失败了把原文放回去，别让用户重打。
      // 若这期间用户已经开始打下一条，就不覆盖他正在打的内容。
      if (editorRef.current?.isEmpty()) editorRef.current.insertText(content)
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
        // 秒传/后端代插消息这条路径同样要更新会话预览（下面显式发送那条也是）
        useChatStore.getState().updateLastMessage(selectedConversation.type, selectedConversation.id, file.name, messageType, new Date().toISOString())
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
        // 原来只有文本消息更新会话预览：发完图片，列表里还是上一条文字、时间停在几天前
        useChatStore.getState().updateLastMessage(selectedConversation.type, selectedConversation.id, file.name, messageType, response.send_time)
        
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (sending || acceptedFiles.length === 0) return
    processFileForUpload(acceptedFiles[0])
  }, [sending, processFileForUpload])

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    multiple: false,
    disabled: sending
  })

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
      // 与接收方（WS message_recalled）、与刷新后的历史一致：标 is_recalled，由 MessageItem 渲染
      // 撤回胶囊。原来只把正文改成「你撤回了一条消息」，显示成一个普通蓝色气泡
      const recalled = messages.find(m => m.message_uuid === messageUuid)
      const wasLast = messages[messages.length - 1]?.message_uuid === messageUuid
      setMessages(messages.map(m =>
        m.message_uuid === messageUuid ? ({ ...m, is_recalled: true } as Message) : m
      ))
      // 被撤回的是最后一条：会话预览不能还挂着原文
      if (wasLast && recalled && selectedConversation) {
        useChatStore.getState().updateLastMessage(selectedConversation.type, selectedConversation.id, t('chat.window.youRecalled'), 'text', recalled.send_time)
      }
      toast({ title: t('chat.window.successTitle'), description: t('chat.window.messageRecalled') })
    } catch (error) {
      toast({ title: t('chat.window.recallFailedTitle'), description: error instanceof Error ? error.message : t('chat.window.recallFailedDesc'), variant: 'destructive' })
    }
  }, [selectedConversation, messages, setMessages, t, toast])

  const canRecallMessage = useCallback((sendTime: string) => 
    differenceInMinutes(Date.now(), new Date(sendTime)) <= 2, 
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
      {...getRootProps()}
      className="h-full flex flex-col min-h-0 overflow-hidden relative"
    >
      <FileDropOverlay isDragging={isDragActive} />

      <ChatHeader 
        conversation={selectedConversation}
        hideMobileHeader={hideMobileHeader}
        onGroupManage={() => setShowGroupManagement(true)}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
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
        onDelete={setPendingDeleteUuid}
        onRecall={handleRecallMessage}
        onDownload={handleFileDownload}
        onPreview={handleFilePreview}
        canRecallMessage={canRecallMessage}
        messagesContainerRef={messagesContainerRef}
        messagesEndRef={messagesEndRef}
      />
      {unseenCount > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {t('chat.window.newMessagesBelow', { n: unseenCount })}
        </button>
      )}
      </div>

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

      <AlertDialog open={pendingDeleteUuid !== null} onOpenChange={(open) => { if (!open) setPendingDeleteUuid(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.window.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('chat.window.confirmDeleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('chat.window.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const uuid = pendingDeleteUuid
                setPendingDeleteUuid(null)
                if (uuid) void handleDeleteMessage(uuid)
              }}
            >
              {t('chat.window.confirmDeleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewFile && <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  )
})

ChatWindow.displayName = 'ChatWindow'

export default ChatWindow
