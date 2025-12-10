import { useState, useEffect, useRef } from 'react'
import { Send, Paperclip, Smile, Loader2, MoreVertical, Image as ImageIcon, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useChatStore } from '../../store/chatStore'
import { messagesApi, type Message } from '../../api/messages'
import { groupMessagesApi, type GroupMessage } from '../../api/groupMessages'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '@/hooks/use-toast'

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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

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
        const message = await messagesApi.sendMessage({
          receiver_id: selectedConversation.id,
          message_content: content,
          message_type: 'text',
        })
        addMessage(message)
      } else if (selectedConversation.type === 'group') {
        const message = await groupMessagesApi.sendMessage(selectedConversation.id, {
          message_content: content,
          message_type: 'text',
        })
        addMessage(message as unknown as Message)
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

              return (
                <div
                  key={message.message_uuid}
                  className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
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

                    <div
                      className={`rounded-2xl px-4 py-2 ${
                        isOwn
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      {message.message_type === 'text' ? (
                        <p className="whitespace-pre-wrap break-words">
                          {message.message_content}
                        </p>
                      ) : message.message_type === 'image' ? (
                        <div className="space-y-2">
                          <ImageIcon className="h-4 w-4" />
                          <p className="text-sm">[图片消息]</p>
                          {message.file_url && (
                            <img
                              src={message.file_url}
                              alt="图片"
                              className="max-w-xs rounded-lg"
                            />
                          )}
                        </div>
                      ) : message.message_type === 'file' ? (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">[文件消息]</span>
                        </div>
                      ) : (
                        <p className="text-sm">[不支持的消息类型]</p>
                      )}
                    </div>

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
        <div className="flex items-end gap-2">
          <Button variant="ghost" size="icon" className="shrink-0">
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
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || sending}
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
