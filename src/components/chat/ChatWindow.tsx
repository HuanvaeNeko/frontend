import { useState, useEffect, useRef } from 'react'
import { Send, Paperclip, Smile, Loader2, MoreVertical, Image as ImageIcon, FileText, Video, Trash2, RotateCcw, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useChatStore } from '../../store/chatStore'
import { messagesApi, type Message, type MessageType } from '../../api/messages'
import { groupMessagesApi, type GroupMessage } from '../../api/groupMessages'
import { storageApi, type FileType, type StorageLocation } from '../../api/storage'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../hooks/use-toast'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

export default function ChatWindow() {
  const { toast } = useToast()
  const { user } = useAuthStore()
  const {
    selectedConversation,
    messages,
    setMessages,
    addMessage,
    prependMessages,
    messageInput,
    setMessageInput,
  } = useChatStore()

  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 加载消息
  useEffect(() => {
    if (!selectedConversation) {
      setMessages([])
      return
    }

    loadMessages()
  }, [selectedConversation])

  // 自动滚动到底部
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = async () => {
    if (!selectedConversation || !messageInput.trim() || sending) return

    const content = messageInput.trim()
    setMessageInput('')
    setSending(true)

    try {
      if (selectedConversation.type === 'friend') {
        const response = await messagesApi.sendMessage({
          receiver_id: selectedConversation.id,
          message_content: content,
          message_type: 'text',
        })
        // 构造完整的 Message 对象
        const message: Message = {
          message_uuid: response.message_uuid,
          sender_id: user?.user_id || '',
          receiver_id: selectedConversation.id,
          message_content: content,
          message_type: 'text',
          file_uuid: null,
          file_url: null,
          file_size: null,
          send_time: response.send_time,
        }
        addMessage(message)
      } else if (selectedConversation.type === 'group') {
        const response = await groupMessagesApi.sendMessage({
          group_id: selectedConversation.id,
          message_content: content,
          message_type: 'text',
        })
        // 构造完整的 GroupMessage 对象
        const message: Message = {
          message_uuid: response.message_uuid,
          sender_id: user?.user_id || '',
          receiver_id: selectedConversation.id,
          message_content: content,
          message_type: 'text',
          file_uuid: null,
          file_url: null,
          file_size: null,
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
      // 恢复输入框内容
      setMessageInput(content)
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 检查文件大小（最大 100GB）
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
    // 重置 input，允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 取消选择文件
  const handleCancelFile = () => {
    setSelectedFile(null)
    setUploadProgress(null)
  }

  // 获取文件类型
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

  // 发送文件消息
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

      // 上传文件
      const uploadResult = await storageApi.uploadFile(
        file,
        type,
        storageLocation,
        selectedConversation.id,
        (progress) => {
          setUploadProgress(progress.percent)
        }
      )

      // 如果是秒传，消息已经由后端自动发送
      if (uploadResult.isInstant && uploadResult.messageUuid) {
        // 重新加载消息以获取新消息
        await loadMessages()
        toast({
          title: '发送成功',
          description: '文件秒传成功',
        })
      } else {
        // 发送文件消息
        if (selectedConversation.type === 'friend') {
          const response = await messagesApi.sendMessage({
            receiver_id: selectedConversation.id,
            message_content: file.name,
            message_type: messageType,
            file_url: uploadResult.fileUrl,
            file_size: file.size,
          })
          // 添加到本地消息列表
          const message: Message = {
            message_uuid: response.message_uuid,
            sender_id: user?.user_id || '',
            receiver_id: selectedConversation.id,
            message_content: file.name,
            message_type: messageType,
            file_uuid: null,
            file_url: uploadResult.fileUrl,
            file_size: file.size,
            send_time: response.send_time,
          }
          addMessage(message)
        } else if (selectedConversation.type === 'group') {
          const response = await groupMessagesApi.sendMessage({
            group_id: selectedConversation.id,
            message_content: file.name,
            message_type: messageType,
            file_url: uploadResult.fileUrl,
            file_size: file.size,
          })
          // 添加到本地消息列表
          const message: Message = {
            message_uuid: response.message_uuid,
            sender_id: user?.user_id || '',
            receiver_id: selectedConversation.id,
            message_content: file.name,
            message_type: messageType,
            file_uuid: null,
            file_url: uploadResult.fileUrl,
            file_size: file.size,
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

  // 删除消息
  const handleDeleteMessage = async (messageUuid: string) => {
    try {
      if (selectedConversation?.type === 'friend') {
        await messagesApi.deleteMessage(messageUuid)
      } else if (selectedConversation?.type === 'group') {
        await groupMessagesApi.deleteMessage(messageUuid)
      }
      // 从本地消息列表中移除
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

  // 撤回消息
  const handleRecallMessage = async (messageUuid: string) => {
    try {
      if (selectedConversation?.type === 'friend') {
        await messagesApi.recallMessage(messageUuid)
      } else if (selectedConversation?.type === 'group') {
        await groupMessagesApi.recallMessage(messageUuid)
      }
      // 从本地消息列表中移除
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

  // 判断消息是否可以撤回（2分钟内）
  const canRecallMessage = (sendTime: string) => {
    const messageTime = new Date(sendTime).getTime()
    const now = Date.now()
    return (now - messageTime) <= 2 * 60 * 1000
  }

  // 渲染消息内容
  const renderMessageContent = (message: Message) => {
    switch (message.message_type) {
      case 'text':
        return (
          <p className="whitespace-pre-wrap break-words">
            {message.message_content}
          </p>
        )
      case 'image':
        return (
          <div className="space-y-2">
            {message.file_url ? (
              <img
                src={message.file_url}
                alt="图片"
                className="max-w-xs rounded-lg cursor-pointer hover:opacity-90"
                onClick={() => window.open(message.file_url!, '_blank')}
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
          <div className="space-y-2">
            {message.file_url ? (
              <video
                src={message.file_url}
                controls
                className="max-w-xs rounded-lg"
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
          <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg">
            <FileText className="h-8 w-8 text-blue-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {message.message_content || '文件'}
              </p>
              {message.file_size && (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(message.file_size)}
                </p>
              )}
            </div>
            {message.file_url && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => window.open(message.file_url!, '_blank')}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        )
      default:
        return <p className="text-sm">[不支持的消息类型]</p>
    }
  }

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  }

  // 未选择会话
  if (!selectedConversation) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-6xl mb-4">💬</div>
          <h3 className="text-lg font-semibold mb-2">HuanVae Chat</h3>
          <p className="text-sm">选择一个会话开始聊天</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 聊天头部 */}
      <header className="h-16 border-b bg-card flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={selectedConversation.avatar} />
            <AvatarFallback>
              {selectedConversation.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold">{selectedConversation.name}</div>
            <div className="text-xs text-muted-foreground">
              {selectedConversation.type === 'friend' ? '好友' : '群聊'}
            </div>
          </div>
        </div>

        <Button variant="ghost" size="icon">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </header>

      {/* 消息列表 */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-4"
        onScroll={handleScroll}
      >
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">暂无消息，开始聊天吧！</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMoreMessages}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      加载中...
                    </>
                  ) : (
                    '加载更多'
                  )}
                </Button>
              </div>
            )}

            {messages.map((message) => {
              const isOwn = message.sender_id === user?.user_id
              const groupMessage = selectedConversation.type === 'group' ? (message as unknown as GroupMessage) : null
              const canRecall = isOwn && canRecallMessage(message.send_time)

              return (
                <div
                  key={message.message_uuid}
                  className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'} group`}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    {groupMessage && (
                      <AvatarImage src={groupMessage.sender_avatar_url} />
                    )}
                    <AvatarFallback>
                      {groupMessage
                        ? groupMessage.sender_nickname[0]?.toUpperCase()
                        : isOwn
                        ? user?.nickname?.[0]?.toUpperCase() || 'U'
                        : selectedConversation.name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className={`flex flex-col gap-1 max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                    {groupMessage && !isOwn && (
                      <span className="text-xs text-muted-foreground px-2">
                        {groupMessage.sender_nickname}
                      </span>
                    )}

                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <div
                          className={`rounded-2xl px-4 py-2 cursor-pointer hover:shadow-md transition-shadow ${
                            isOwn
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          {renderMessageContent(message)}
                        </div>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content 
                          className="min-w-[120px] bg-white rounded-lg shadow-xl border p-1 z-50"
                          sideOffset={5}
                        >
                          {canRecall && (
                            <DropdownMenu.Item 
                              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded outline-none"
                              onSelect={() => handleRecallMessage(message.message_uuid)}
                            >
                              <RotateCcw size={14} />
                              撤回
                            </DropdownMenu.Item>
                          )}
                          <DropdownMenu.Item 
                            className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded outline-none text-red-600"
                            onSelect={() => handleDeleteMessage(message.message_uuid)}
                          >
                            <Trash2 size={14} />
                            删除
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>

                    <span className="text-xs text-muted-foreground px-2">
                      {new Date(message.send_time).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 输入框 */}
      <div className="border-t bg-card p-4 shrink-0">
        {/* 选中文件预览 */}
        {selectedFile && (
          <div className="mb-3 p-3 bg-muted rounded-lg flex items-center gap-3">
            {selectedFile.type.startsWith('image/') ? (
              <ImageIcon className="h-8 w-8 text-blue-500" />
            ) : selectedFile.type.startsWith('video/') ? (
              <Video className="h-8 w-8 text-purple-500" />
            ) : (
              <FileText className="h-8 w-8 text-gray-500" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancelFile}
              disabled={sending}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* 上传进度 */}
        {uploadProgress !== null && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>上传中...</span>
              <span>{uploadProgress.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="shrink-0">
            <Smile className="h-5 w-5" />
          </Button>
          <Input
            placeholder="输入消息..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={sending}
          />
          <Button
            onClick={selectedFile ? handleSendFile : handleSendMessage}
            disabled={(!messageInput.trim() && !selectedFile) || sending}
            className="shrink-0"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
