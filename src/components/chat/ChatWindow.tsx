'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Paperclip, Loader2, MoreVertical, Image as ImageIcon, FileText, Video, Trash2, RotateCcw, Download, X, Settings, MessageCircle } from 'lucide-react'
import { EmojiPicker } from './EmojiPicker'
import { MessageImage } from './MessageImage'
import { MessageVideo } from './MessageVideo'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useChatStore } from '../../store/chatStore'
import { messagesApi, type Message, type MessageType } from '../../api/messages'
import { groupMessagesApi, type GroupMessage } from '../../api/groupMessages'
import { storageApi, type FileType, type StorageLocation } from '../../api/storage'
import { FilePreview, type PreviewFile } from '@/components/ui/file-preview'
import GroupManagement from './GroupManagement'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../hooks/use-toast'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import MarkdownEditor, { type MarkdownEditorRef } from './MarkdownEditor'
import { Markdown } from '@/components/ui/markdown'

interface ChatWindowProps {
  hideMobileHeader?: boolean
}

export default function ChatWindow({ hideMobileHeader = false }: ChatWindowProps) {
  const { toast } = useToast()
  const { user } = useAuthStore()
  const {
    selectedConversation,
    messages,
    setMessages,
    addMessage,
    prependMessages,
    messageInput: _messageInput,
    setMessageInput: _setMessageInput,
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<MarkdownEditorRef>(null)

  useEffect(() => {
    if (!selectedConversation) {
      setMessages([])
      return
    }
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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
      console.error('加载消息失败:', error)
      toast({
        title: '错误',
        description: '加载消息失败',
        variant: 'destructive',
      })
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
        const response = await messagesApi.getMessages(
          selectedConversation.id,
          oldestTime,
          50
        )
        prependMessages(response.messages)
        setHasMore(response.has_more)
      } else if (selectedConversation.type === 'group') {
        const response = await groupMessagesApi.getMessages(
          selectedConversation.id,
          oldestTime,
          50
        )
        prependMessages(response.messages as unknown as Message[])
        setHasMore(response.has_more)
      }
    } catch (error) {
      console.error('加载更多消息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleScroll = () => {
    const container = messagesContainerRef.current
    if (container && container.scrollTop === 0 && hasMore && !loading) {
      loadMoreMessages()
    }
  }

  const scrollToBottom = () => {
    // 使用 requestAnimationFrame 确保在 DOM 完全更新后滚动
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  }

  const handleSendMessage = useCallback(async () => {
    // 从编辑器获取 Markdown 内容
    const markdownContent = editorRef.current?.getValue() || ''
    
    if (!selectedConversation || !markdownContent.trim() || sending) return

    // 发送 Markdown 格式内容
    const content = markdownContent.trim()
    editorRef.current?.clear()
    setSending(true)

    try {
      if (selectedConversation.type === 'friend') {
        const response = await messagesApi.sendMessage({
          receiver_id: selectedConversation.id,
          message_content: content,
          message_type: 'text',
        })
        const message: Message = {
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
          send_time: response.send_time,
        }
        addMessage(message)
      } else if (selectedConversation.type === 'group') {
        const response = await groupMessagesApi.sendMessage({
          group_id: selectedConversation.id,
          message_content: content,
          message_type: 'text',
        })
        const message: Message = {
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
          send_time: response.send_time,
        }
        addMessage(message)
      }
    } catch (error) {
      console.error('发送消息失败:', error)
      toast({
        title: '发送失败',
        description: error instanceof Error ? error.message : '发送消息失败',
        variant: 'destructive',
      })
      // 发送失败不恢复内容，用户可以重新输入
    } finally {
      setSending(false)
    }
  }, [selectedConversation, sending, user, addMessage, toast])

  const _handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 100 * 1024 * 1024 * 1024) {
        toast({
          title: '文件太大',
          description: '文件大小不能超过 100GB',
          variant: 'destructive',
        })
        return
      }
      setSelectedFile(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCancelFile = () => {
    setSelectedFile(null)
    setUploadProgress(null)
  }

  const getFileType = (file: File): { type: FileType; messageType: MessageType } => {
    const mimeType = file.type
    if (mimeType.startsWith('image/')) {
      return {
        type: selectedConversation?.type === 'friend' ? 'friend_image' : 'group_image',
        messageType: 'image' as MessageType,
      }
    }
    if (mimeType.startsWith('video/')) {
      return {
        type: selectedConversation?.type === 'friend' ? 'friend_video' : 'group_video',
        messageType: 'video' as MessageType,
      }
    }
    return {
      type: selectedConversation?.type === 'friend' ? 'friend_document' : 'group_document',
      messageType: 'file' as MessageType,
    }
  }

  const handleSendFile = async () => {
    if (!selectedConversation || !selectedFile || sending) return

    const file = selectedFile
    setSelectedFile(null)
    setSending(true)
    setUploadProgress(0)

    try {
      const { type, messageType } = getFileType(file)
      const storageLocation: StorageLocation = selectedConversation.type === 'friend'
        ? 'friend_messages'
        : 'group_files'

      const uploadResult = await storageApi.uploadFile(
        file,
        type,
        storageLocation,
        selectedConversation.id,
        (progress) => {
          setUploadProgress(progress.percent)
        }
      )

      if (uploadResult.messageUuid) {
        await loadMessages()
        toast({
          title: '发送成功',
          description: uploadResult.isInstant ? '文件秒传成功' : '文件发送成功',
        })
      } else {
        const fileUuid = uploadResult.fileUrl.split('/').pop() || ''
        
        if (selectedConversation.type === 'friend') {
          const response = await messagesApi.sendMessage({
            receiver_id: selectedConversation.id,
            message_content: file.name,
            message_type: messageType,
            file_uuid: fileUuid,
            file_size: file.size,
          })
          const message: Message = {
            message_uuid: response.message_uuid,
            sender_id: user?.user_id || '',
            receiver_id: selectedConversation.id,
            message_content: file.name,
            message_type: messageType,
            file_uuid: fileUuid,
            file_url: uploadResult.fileUrl,
            file_size: file.size,
            file_hash: null,
            filename: file.name,
            content_type: file.type,
            image_width: null,
            image_height: null,
            seq: response.seq,
            send_time: response.send_time,
          }
          addMessage(message)
        } else if (selectedConversation.type === 'group') {
          const response = await groupMessagesApi.sendMessage({
            group_id: selectedConversation.id,
            message_content: file.name,
            message_type: messageType,
            file_uuid: fileUuid,
            file_size: file.size,
          })
          const message: Message = {
            message_uuid: response.message_uuid,
            sender_id: user?.user_id || '',
            receiver_id: selectedConversation.id,
            message_content: file.name,
            message_type: messageType,
            file_uuid: fileUuid,
            file_url: uploadResult.fileUrl,
            file_size: file.size,
            file_hash: null,
            filename: file.name,
            content_type: file.type,
            image_width: null,
            image_height: null,
            seq: response.seq,
            send_time: response.send_time,
          }
          addMessage(message)
        }
        toast({
          title: '发送成功',
          description: '文件发送成功',
        })
      }
    } catch (error) {
      console.error('发送文件失败:', error)
      toast({
        title: '发送失败',
        description: error instanceof Error ? error.message : '文件发送失败',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
      setUploadProgress(null)
    }
  }

  const handleDeleteMessage = async (messageUuid: string) => {
    try {
      if (selectedConversation?.type === 'friend') {
        await messagesApi.deleteMessage(messageUuid)
      } else if (selectedConversation?.type === 'group') {
        await groupMessagesApi.deleteMessage(messageUuid)
      }
      setMessages(messages.filter(m => m.message_uuid !== messageUuid))
      toast({
        title: '成功',
        description: '消息已删除',
      })
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除消息失败',
        variant: 'destructive',
      })
    }
  }

  const handleRecallMessage = async (messageUuid: string) => {
    try {
      if (selectedConversation?.type === 'friend') {
        await messagesApi.recallMessage(messageUuid)
      } else if (selectedConversation?.type === 'group') {
        await groupMessagesApi.recallMessage(messageUuid)
      }
      setMessages(messages.filter(m => m.message_uuid !== messageUuid))
      toast({
        title: '成功',
        description: '消息已撤回',
      })
    } catch (error) {
      toast({
        title: '撤回失败',
        description: error instanceof Error ? error.message : '撤回消息失败（可能超过2分钟）',
        variant: 'destructive',
      })
    }
  }

  const canRecallMessage = (sendTime: string) => {
    const messageTime = new Date(sendTime).getTime()
    const now = Date.now()
    return (now - messageTime) <= 2 * 60 * 1000
  }

  const handleFilePreview = async (message: Message) => {
    try {
      let url = message.file_url
      if (message.file_uuid) {
        url = selectedConversation?.type === 'friend'
          ? await storageApi.getFriendFilePresignedUrl(message.file_uuid, 'preview')
          : await storageApi.getPresignedUrl(message.file_uuid, 'preview')
      }
      
      if (url) {
        // Message 类型没有 filename 和 content_type，根据 message_type 推断
        const name = message.message_type === 'image' ? '图片' 
          : message.message_type === 'video' ? '视频'
          : message.message_type === 'file' ? '文件'
          : '未命名文件'
        const mimeType = message.message_type === 'image' ? 'image/*'
          : message.message_type === 'video' ? 'video/*'
          : 'application/octet-stream'
        
        setPreviewFile({
          url,
          name,
          type: mimeType,
          size: message.file_size ?? undefined,
        })
      }
    } catch (error) {
      toast({
        title: '预览失败',
        description: error instanceof Error ? error.message : '无法预览文件',
        variant: 'destructive',
      })
    }
  }

  const handleFileDownload = async (message: Message) => {
    try {
      let downloadUrl: string
      
      if (message.file_uuid) {
        downloadUrl = selectedConversation?.type === 'friend'
          ? await storageApi.getFriendFilePresignedUrl(message.file_uuid, 'download')
          : await storageApi.getPresignedUrl(message.file_uuid, 'download')
      } else if (message.file_url) {
        downloadUrl = message.file_url
      } else {
        throw new Error('文件不可用')
      }
      
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = message.message_content || 'download'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (error) {
      toast({
        title: '下载失败',
        description: error instanceof Error ? error.message : '无法下载文件',
        variant: 'destructive',
      })
    }
  }

  const renderMessageContent = (message: Message, isOwn: boolean) => {
    switch (message.message_type) {
      case 'text':
        return (
          <Markdown className="text-sm chat-message-markdown">
            {message.message_content}
          </Markdown>
        )
      case 'image':
        return (
          <div>
            {(message.file_url || message.file_uuid) ? (
              <MessageImage
                fileUrl={message.file_url}
                fileUuid={message.file_uuid}
                isFriendMessage={selectedConversation?.type === 'friend'}
                onClick={() => handleFilePreview(message)}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <ImageIcon className="h-4 w-4" />
                <span>[图片]</span>
              </div>
            )}
          </div>
        )
      case 'video':
        return (
          <div>
            {(message.file_url || message.file_uuid) ? (
              <MessageVideo
                fileUrl={message.file_url}
                fileUuid={message.file_uuid}
                isFriendMessage={selectedConversation?.type === 'friend'}
                className="max-w-[240px] rounded-xl"
              />
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Video className="h-4 w-4" />
                <span>[视频]</span>
              </div>
            )}
          </div>
        )
      case 'file':
        return (
          <div 
            className="flex items-center gap-3 p-3 rounded-xl min-w-[200px]"
            style={{
              background: isOwn ? 'rgba(255, 255, 255, 0.2)' : 'rgba(147, 197, 253, 0.15)',
            }}
          >
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: isOwn ? 'rgba(255, 255, 255, 0.3)' : 'rgba(59, 130, 246, 0.2)' }}
            >
              <FileText className={`h-5 w-5 ${isOwn ? 'text-white' : 'text-blue-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isOwn ? 'text-white' : 'text-slate-700'}`}>
                {message.message_content || '文件'}
              </p>
              {message.file_size && (
                <p className={`text-xs ${isOwn ? 'text-white/70' : 'text-slate-500'}`}>
                  {formatFileSize(message.file_size)}
                </p>
              )}
            </div>
            {(message.file_url || message.file_uuid) && (
              <motion.button
                className={`p-2 rounded-lg ${isOwn ? 'hover:bg-white/20' : 'hover:bg-blue-100'}`}
                onClick={() => handleFileDownload(message)}
                whileTap={{ scale: 0.95 }}
              >
                <Download className={`h-4 w-4 ${isOwn ? 'text-white' : 'text-blue-500'}`} />
              </motion.button>
            )}
          </div>
        )
      default:
        return <p className="text-sm">[不支持的消息类型]</p>
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  }

  // 未选择会话
  if (!selectedConversation) {
    return (
      <div className="h-full min-h-0 flex items-center justify-center overflow-hidden">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div 
            className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(147, 197, 253, 0.2)' }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <MessageCircle className="w-12 h-12 text-blue-400" />
          </motion.div>
          <h3 
            className="text-2xl font-bold mb-2"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #0ea5e9)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Huanvae Chat
          </h3>
          <p className="text-slate-500">选择一个会话开始聊天</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* 聊天头部 - 移动端由父组件处理 */}
      <header className={`px-6 py-4 min-h-[81px] shrink-0 border-b border-blue-200/15 bg-white/30 flex items-center justify-between ${hideMobileHeader ? 'hidden' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-white/80 to-white/50 border-[1.5px] border-white/80 flex items-center justify-center shrink-0">
            <Avatar className="h-full w-full">
              <AvatarImage src={selectedConversation.avatar} />
              <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-500 text-white">
                {selectedConversation.name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h2 className="text-base font-semibold text-slate-700">{selectedConversation.name}</h2>
            <span className="text-xs text-slate-500">
              {selectedConversation.type === 'friend' ? '好友' : '群聊'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {selectedConversation.type === 'group' && (
            <motion.button
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-blue-100/30 transition-colors"
              onClick={() => setShowGroupManagement(true)}
              title="群管理"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Settings className="h-5 w-5" />
            </motion.button>
          )}
          <motion.button 
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-blue-100/30 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <MoreVertical className="h-5 w-5" />
          </motion.button>
        </div>
      </header>

      {/* 消息列表 */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4"
        onScroll={handleScroll}
      >
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : messages.length === 0 ? (
          <motion.div 
            className="flex items-center justify-center h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-sm text-slate-400">暂无消息，开始聊天吧！</p>
          </motion.div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center">
                <motion.button
                  className="px-4 py-2 rounded-xl text-sm text-slate-500"
                  style={{
                    background: 'rgba(255, 255, 255, 0.5)',
                    border: '1px solid rgba(147, 197, 253, 0.2)',
                  }}
                  onClick={loadMoreMessages}
                  disabled={loading}
                  whileHover={{ background: 'rgba(147, 197, 253, 0.2)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />
                      加载中...
                    </>
                  ) : (
                    '加载更多'
                  )}
                </motion.button>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((message, _index) => {
                const isOwn = message.sender_id === user?.user_id
                const groupMessage = selectedConversation.type === 'group' ? (message as unknown as GroupMessage) : null
                const canRecall = isOwn && canRecallMessage(message.send_time)

                return (
                  <motion.div
                    key={message.message_uuid}
                    className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'} group`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="shrink-0">
                      <div className="w-10 h-10 rounded-xl overflow-hidden" style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.5) 100%)',
                        border: '1.5px solid rgba(255, 255, 255, 0.8)',
                      }}>
                        <Avatar className="h-full w-full">
                          {groupMessage && (
                            <AvatarImage src={groupMessage.sender_avatar_url} />
                          )}
                          <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-500 text-white text-sm">
                            {groupMessage
                              ? (groupMessage.sender_nickname?.[0] || 'U').toUpperCase()
                              : isOwn
                              ? user?.nickname?.[0]?.toUpperCase() || 'U'
                              : selectedConversation.name?.[0]?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </div>

                    <div className={`flex flex-col gap-1 max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                      {groupMessage && !isOwn && (
                        <span className="text-xs text-slate-500 px-2">
                          {groupMessage.sender_nickname}
                        </span>
                      )}

                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <motion.div
                            className={`rounded-2xl px-4 py-2.5 cursor-pointer ${isOwn ? 'message-own' : ''}`}
                            style={{
                              background: isOwn
                                ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                                : 'rgba(255, 255, 255, 0.7)',
                              color: isOwn ? 'white' : '#1e3a5f',
                              border: isOwn ? 'none' : '1px solid rgba(147, 197, 253, 0.3)',
                              boxShadow: isOwn 
                                ? '0 4px 15px rgba(59, 130, 246, 0.3)'
                                : '0 2px 8px rgba(0, 0, 0, 0.05)',
                            }}
                            whileHover={{ 
                              scale: 1.01,
                              boxShadow: isOwn 
                                ? '0 6px 20px rgba(59, 130, 246, 0.4)'
                                : '0 4px 12px rgba(0, 0, 0, 0.1)',
                            }}
                            whileTap={{ scale: 0.99 }}
                          >
                            {renderMessageContent(message, isOwn)}
                          </motion.div>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content 
                            className="min-w-[120px] rounded-xl shadow-xl p-1 z-50"
                            style={{
                              background: 'rgba(255, 255, 255, 0.95)',
                              backdropFilter: 'blur(20px)',
                              border: '1px solid rgba(147, 197, 253, 0.3)',
                            }}
                            sideOffset={5}
                          >
                            {canRecall && (
                              <DropdownMenu.Item 
                                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg outline-none text-slate-600 hover:bg-blue-50"
                                onSelect={() => handleRecallMessage(message.message_uuid)}
                              >
                                <RotateCcw size={14} />
                                撤回
                              </DropdownMenu.Item>
                            )}
                            <DropdownMenu.Item 
                              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg outline-none text-red-500 hover:bg-red-50"
                              onSelect={() => handleDeleteMessage(message.message_uuid)}
                            >
                              <Trash2 size={14} />
                              删除
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>

                      <span className="text-xs text-slate-400 px-2">
                        {new Date(message.send_time).toLocaleTimeString()}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
            
            <div ref={messagesEndRef} />
            
            {/* 正在输入状态显示 */}
            {selectedConversation && (() => {
              const typingList = getTypingUsers(selectedConversation.id)
              if (typingList.length === 0) return null
              
              return (
                <motion.div 
                  className="px-4 py-2 flex items-center gap-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex space-x-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span 
                        key={i}
                        className="w-2 h-2 bg-blue-400 rounded-full"
                        animate={{ y: [-3, 0, -3] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-slate-500">
                    {selectedConversation.type === 'friend' 
                      ? '对方正在输入...'
                      : typingList.length === 1 
                        ? '有人正在输入...'
                        : `${typingList.length} 人正在输入...`
                    }
                  </span>
                </motion.div>
              )
            })()}
          </>
        )}
      </div>

      {/* 输入框 */}
      <div 
        className="p-4 shrink-0"
        style={{
          borderTop: '1px solid rgba(147, 197, 253, 0.15)',
          background: 'rgba(255, 255, 255, 0.3)',
        }}
      >
        {/* 选中文件预览 */}
        <AnimatePresence>
          {selectedFile && (
            <motion.div 
              className="mb-3 p-3 rounded-xl flex items-center gap-3"
              style={{
                background: 'rgba(147, 197, 253, 0.15)',
                border: '1px solid rgba(147, 197, 253, 0.3)',
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(59, 130, 246, 0.2)' }}
              >
                {selectedFile.type.startsWith('image/') ? (
                  <ImageIcon className="h-5 w-5 text-blue-500" />
                ) : selectedFile.type.startsWith('video/') ? (
                  <Video className="h-5 w-5 text-purple-500" />
                ) : (
                  <FileText className="h-5 w-5 text-slate-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <motion.button
                className="p-2 rounded-lg hover:bg-red-50"
                onClick={handleCancelFile}
                disabled={sending}
                whileTap={{ scale: 0.95 }}
              >
                <X className="h-4 w-4 text-red-500" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 上传进度 */}
        <AnimatePresence>
          {uploadProgress !== null && (
            <motion.div 
              className="mb-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>上传中...</span>
                <span>{uploadProgress.toFixed(1)}%</span>
              </div>
              <div 
                className="h-2 rounded-full overflow-hidden"
                style={{ background: 'rgba(147, 197, 253, 0.2)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #3b82f6, #0ea5e9)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
          />
          <motion.button
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500"
            style={{
              background: 'rgba(255, 255, 255, 0.6)',
              border: '1px solid rgba(147, 197, 253, 0.3)',
            }}
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            whileHover={{ background: 'rgba(147, 197, 253, 0.2)' }}
            whileTap={{ scale: 0.95 }}
          >
            <Paperclip className="h-5 w-5" />
          </motion.button>
          <EmojiPicker 
            onSelect={(emoji) => editorRef.current?.insertText(emoji)}
            disabled={sending}
          />
          <MarkdownEditor
            ref={editorRef}
            placeholder="输入消息... (支持 Markdown，Enter 发送)"
            onSubmit={handleSendMessage}
            onChange={() => setEditorHasContent(!(editorRef.current?.isEmpty() ?? true))}
            disabled={sending}
            className="flex-1"
            minHeight="42px"
            maxHeight="150px"
          />
          <motion.button
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white self-end"
            style={{
              background: (!editorHasContent && !selectedFile) || sending
                ? 'rgba(147, 197, 253, 0.5)'
                : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: (!editorHasContent && !selectedFile) || sending
                ? 'none'
                : '0 4px 15px rgba(59, 130, 246, 0.3)',
            }}
            onClick={selectedFile ? handleSendFile : handleSendMessage}
            disabled={(!editorHasContent && !selectedFile) || sending}
            whileHover={(!editorHasContent && !selectedFile) || sending ? {} : { 
              scale: 1.05,
              boxShadow: '0 6px 20px rgba(59, 130, 246, 0.4)',
            }}
            whileTap={(!editorHasContent && !selectedFile) || sending ? {} : { scale: 0.95 }}
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </motion.button>
        </div>
      </div>

      {/* 群管理弹窗 - 使用 Portal 渲染到 body */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showGroupManagement && selectedConversation?.type === 'group' && (
            <>
              <motion.div
                className="fixed inset-0 z-[9998]"
                style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowGroupManagement(false)}
              />
              <motion.div 
                className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
              <motion.div 
                className="w-[90vw] max-w-2xl h-[80vh] max-h-[700px] shadow-xl flex flex-col pointer-events-auto"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  borderRadius: '24px',
                  border: '1px solid rgba(147, 197, 253, 0.3)',
                }}
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
              >
                <div 
                  className="flex items-center justify-between p-4"
                  style={{ borderBottom: '1px solid rgba(147, 197, 253, 0.2)' }}
                >
                  <h2 className="text-lg font-semibold text-slate-700">群管理</h2>
                  <motion.button
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500"
                    style={{ background: 'rgba(147, 197, 253, 0.15)' }}
                    onClick={() => setShowGroupManagement(false)}
                    whileHover={{ background: 'rgba(147, 197, 253, 0.3)' }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <X className="h-5 w-5" />
                  </motion.button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <GroupManagement
                    groupId={selectedConversation.id}
                    onClose={() => setShowGroupManagement(false)}
                  />
                </div>
              </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* 文件预览 */}
      {previewFile && (
        <FilePreview
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  )
}
