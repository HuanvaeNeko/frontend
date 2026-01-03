'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft,
  Send,
  Users,
  Settings,
  MoreVertical,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  Download,
  Loader2,
  Trash2,
  RotateCcw,
  X,
  Bell,
  UserPlus,
  LogOut,
  Crown,
  Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '../store/authStore'
import { groupMessagesApi, type GroupMessage } from '../api/groupMessages'
import { groupsApi, type GroupMember, type GroupNotice } from '../api/groups'
import { storageApi, type FileType } from '../api/storage'
import { useToast } from '../hooks/use-toast'

export default function GroupChat() {
  const router = useRouter()
  const { groupId } = useParams<{ groupId?: string }>()
  const { toast } = useToast()
  const { myGroups, loadMyGroups } = useGroupStore()
  const { user } = useAuthStore()

  // 消息状态
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [inputMessage, setInputMessage] = useState('')

  // 成员状态
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // 公告状态
  const [notices, setNotices] = useState<GroupNotice[]>([])

  // 文件上传状态
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // UI 状态
  const [showSidebar, setShowSidebar] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'members' | 'notices' | 'settings'>('members')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 获取当前群组信息
  const currentGroup = groupId ? myGroups.find(g => g.group_id === groupId) : null
  const myMember = members.find(m => m.user_id === user?.user_id)
  const isAdmin = myMember?.role === 'owner' || myMember?.role === 'admin'

  // 加载群组数据
  useEffect(() => {
    loadMyGroups().catch(console.error)
  }, [loadMyGroups])

  // 加载消息和成员
  useEffect(() => {
    if (groupId && currentGroup) {
      loadMessages()
      loadMembers()
      loadNotices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, currentGroup])

  // 自动滚动到底部
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadMessages = async () => {
    if (!groupId || loading) return

    setLoading(true)
    try {
      const response = await groupMessagesApi.getMessages(groupId, undefined, 50)
      setMessages(response.messages)
      setHasMore(response.has_more)
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
    if (!groupId || loading || !hasMore || messages.length === 0) return

    setLoading(true)
    try {
      const oldestTime = messages[0].send_time
      const response = await groupMessagesApi.getMessages(groupId, oldestTime, 50)
      setMessages(prev => [...response.messages, ...prev])
      setHasMore(response.has_more)
    } catch (error) {
      console.error('加载更多消息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    if (!groupId) return

    setLoadingMembers(true)
    try {
      const response = await groupsApi.getMembers(groupId)
      setMembers(response.members)
    } catch (error) {
      console.error('加载成员失败:', error)
    } finally {
      setLoadingMembers(false)
    }
  }

  const loadNotices = async () => {
    if (!groupId) return

    try {
      const response = await groupsApi.getNotices(groupId)
      setNotices(response)
    } catch (error) {
      console.error('加载公告失败:', error)
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

  const sendMessage = async () => {
    if (!groupId || !inputMessage.trim() || sending) return

    const content = inputMessage.trim()
    setInputMessage('')
    setSending(true)

    try {
      const response = await groupMessagesApi.sendMessage({
        group_id: groupId,
        message_content: content,
        message_type: 'text',
      })

      // 构造完整的消息对象
      const message: GroupMessage = {
        message_uuid: response.message_uuid,
        group_id: groupId,
        sender_id: user?.user_id || '',
        sender_nickname: user?.nickname || '',
        sender_avatar_url: '',
        message_content: content,
        message_type: 'text',
        file_uuid: null,
        file_url: null,
        file_size: null,
        file_hash: null,
        image_width: null,
        image_height: null,
        seq: response.seq,
        reply_to: null,
        send_time: response.send_time,
        is_recalled: false,
      }
      setMessages(prev => [...prev, message])
    } catch (error) {
      console.error('发送消息失败:', error)
      toast({
        title: '发送失败',
        description: error instanceof Error ? error.message : '发送消息失败',
        variant: 'destructive',
      })
      setInputMessage(content)
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (selectedFile) {
        handleSendFile()
      } else {
        sendMessage()
      }
    }
  }

  // 文件相关处理
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

  const getFileType = (file: File): { type: FileType; messageType: 'image' | 'video' | 'file' } => {
    const mimeType = file.type
    if (mimeType.startsWith('image/')) {
      return { type: 'group_image', messageType: 'image' }
    }
    if (mimeType.startsWith('video/')) {
      return { type: 'group_video', messageType: 'video' }
    }
    return { type: 'group_document', messageType: 'file' }
  }

  const handleSendFile = async () => {
    if (!groupId || !selectedFile || sending) return

    const file = selectedFile
    setSelectedFile(null)
    setSending(true)
    setUploadProgress(0)

    try {
      const { type, messageType } = getFileType(file)

      const uploadResult = await storageApi.uploadFile(
        file,
        type,
        'group_files',
        groupId,
        (progress) => {
          setUploadProgress(progress.percent)
        }
      )

      if (uploadResult.isInstant && uploadResult.messageUuid) {
        await loadMessages()
        toast({ title: '发送成功', description: '文件秒传成功' })
      } else {
        const response = await groupMessagesApi.sendMessage({
          group_id: groupId,
          message_content: file.name,
          message_type: messageType,
          file_url: uploadResult.fileUrl,
          file_size: file.size,
        })

        const message: GroupMessage = {
          message_uuid: response.message_uuid,
          group_id: groupId,
          sender_id: user?.user_id || '',
          sender_nickname: user?.nickname || '',
          sender_avatar_url: '',
          message_content: file.name,
          message_type: messageType,
          file_uuid: null,
          file_url: uploadResult.fileUrl,
          file_size: file.size,
          file_hash: null,
          image_width: null,
          image_height: null,
          seq: response.seq,
          reply_to: null,
          send_time: response.send_time,
          is_recalled: false,
        }
        setMessages(prev => [...prev, message])
        toast({ title: '发送成功', description: '文件发送成功' })
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

  // 消息操作
  const handleDeleteMessage = async (messageUuid: string) => {
    try {
      await groupMessagesApi.deleteMessage(messageUuid)
      setMessages(prev => prev.filter(m => m.message_uuid !== messageUuid))
      toast({ title: '成功', description: '消息已删除' })
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
      await groupMessagesApi.recallMessage(messageUuid)
      setMessages(prev => prev.filter(m => m.message_uuid !== messageUuid))
      toast({ title: '成功', description: '消息已撤回' })
    } catch (error) {
      toast({
        title: '撤回失败',
        description: error instanceof Error ? error.message : '撤回消息失败',
        variant: 'destructive',
      })
    }
  }

  const canRecallMessage = (sendTime: string, senderId: string) => {
    const messageTime = new Date(sendTime).getTime()
    const now = Date.now()
    const isWithinTime = (now - messageTime) <= 2 * 60 * 1000
    const isOwnMessage = senderId === user?.user_id
    return (isOwnMessage && isWithinTime) || isAdmin
  }

  // 群操作
  const handleLeaveGroup = async () => {
    if (!groupId) return
    if (!confirm('确定要退出该群聊吗？')) return

    try {
      await groupsApi.leaveGroup(groupId)
      toast({ title: '成功', description: '已退出群聊' })
      router.push('/chat')
    } catch (error) {
      toast({
        title: '退出失败',
        description: error instanceof Error ? error.message : '退出群聊失败',
        variant: 'destructive',
      })
    }
  }

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
      'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
      'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
      'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500'
    ]
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown className="h-4 w-4 text-yellow-500" />
    if (role === 'admin') return <Shield className="h-4 w-4 text-blue-500" />
    return null
  }

  const getRoleName = (role: string) => {
    if (role === 'owner') return '群主'
    if (role === 'admin') return '管理员'
    return '成员'
  }

  // 渲染消息内容
  const renderMessageContent = (message: GroupMessage) => {
    if (message.is_recalled) {
      return <p className="text-sm italic opacity-60">[消息已撤回]</p>
    }

    switch (message.message_type) {
      case 'text':
        return <p className="whitespace-pre-wrap break-words">{message.message_content}</p>
      case 'image':
        return message.file_url ? (
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
        )
      case 'video':
        return message.file_url ? (
          <video src={message.file_url} controls className="max-w-xs rounded-lg" />
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Video className="h-4 w-4" />
            <span>[视频]</span>
          </div>
        )
      case 'file':
        return (
          <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg">
            <FileText className="h-8 w-8 text-blue-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{message.message_content || '文件'}</p>
              {message.file_size && (
                <p className="text-xs text-muted-foreground">{formatFileSize(message.file_size)}</p>
              )}
            </div>
            {message.file_url && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open(message.file_url!, '_blank')}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        )
      case 'system':
        return <p className="text-sm text-center opacity-70">{message.message_content}</p>
      default:
        return <p className="text-sm">[不支持的消息类型]</p>
    }
  }

  // 没有选择群组
  if (!groupId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">请选择一个群聊</h2>
          <p className="text-muted-foreground mb-4">从侧边栏选择一个群聊开始对话</p>
          <Button onClick={() => router.push('/chat')}>返回聊天</Button>
        </div>
      </div>
    )
  }

  // 群组不存在
  if (!currentGroup && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">群聊不存在</h2>
          <p className="text-muted-foreground mb-4">该群聊可能已被解散或您已退出</p>
          <Button onClick={() => router.push('/chat')}>返回聊天</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <header className="h-16 bg-white border-b flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/chat')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-10 w-10">
            <AvatarImage src={currentGroup?.group_avatar_url} />
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
              {currentGroup?.group_name?.[0]?.toUpperCase() || 'G'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-semibold">{currentGroup?.group_name || '群聊'}</h1>
            <p className="text-xs text-muted-foreground">{members.length} 成员</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setShowSidebar(!showSidebar)}>
            <Users className="h-5 w-5" />
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="min-w-[160px] bg-white rounded-lg shadow-xl border p-1 z-50">
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded outline-none"
                  onSelect={() => setSidebarTab('settings')}
                >
                  <Settings size={16} />
                  群设置
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded outline-none"
                  onSelect={() => setSidebarTab('notices')}
                >
                  <Bell size={16} />
                  群公告
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded outline-none text-red-600"
                  onSelect={handleLeaveGroup}
                >
                  <LogOut size={16} />
                  退出群聊
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 消息区域 */}
        <div className="flex-1 flex flex-col">
          {/* 消息列表 */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
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
                      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      加载更多
                    </Button>
                  </div>
                )}

                {messages.map((message) => {
                  const isOwn = message.sender_id === user?.user_id
                  const avatarColor = getAvatarColor(message.sender_nickname)
                  const canRecall = canRecallMessage(message.send_time, message.sender_id)

                  if (message.message_type === 'system') {
                    return (
                      <div key={message.message_uuid} className="flex justify-center">
                        <span className="text-xs text-muted-foreground bg-gray-200 px-3 py-1 rounded-full">
                          {message.message_content}
                        </span>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={message.message_uuid}
                      className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'} group`}
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={message.sender_avatar_url} />
                        <AvatarFallback className={avatarColor + ' text-white'}>
                          {message.sender_nickname[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className={`flex flex-col gap-1 max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                        {!isOwn && (
                          <span className="text-xs text-muted-foreground px-2">
                            {message.sender_nickname}
                          </span>
                        )}

                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <div
                              className={`rounded-2xl px-4 py-2 cursor-pointer hover:shadow-md transition-shadow ${
                                isOwn ? 'bg-primary text-primary-foreground' : 'bg-white border'
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
                              {canRecall && !message.is_recalled && (
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
                          {formatTime(message.send_time)}
                        </span>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* 输入区域 */}
          <div className="border-t bg-white p-4 shrink-0">
            {/* 选中文件预览 */}
            {selectedFile && (
              <div className="mb-3 p-3 bg-gray-100 rounded-lg flex items-center gap-3">
                {selectedFile.type.startsWith('image/') ? (
                  <ImageIcon className="h-8 w-8 text-blue-500" />
                ) : selectedFile.type.startsWith('video/') ? (
                  <Video className="h-8 w-8 text-purple-500" />
                ) : (
                  <FileText className="h-8 w-8 text-gray-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={handleCancelFile} disabled={sending}>
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
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-end gap-2">
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
              <Input
                placeholder="输入消息..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1"
                disabled={sending}
              />
              <Button
                onClick={selectedFile ? handleSendFile : sendMessage}
                disabled={(!inputMessage.trim() && !selectedFile) || sending}
                className="shrink-0"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* 右侧边栏 */}
        {showSidebar && (
          <aside className="w-80 bg-white border-l overflow-y-auto">
            {/* 标签切换 */}
            <div className="flex border-b">
              <button
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 ${
                  sidebarTab === 'members' ? 'border-primary text-primary' : 'border-transparent'
                }`}
                onClick={() => setSidebarTab('members')}
              >
                成员
              </button>
              <button
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 ${
                  sidebarTab === 'notices' ? 'border-primary text-primary' : 'border-transparent'
                }`}
                onClick={() => setSidebarTab('notices')}
              >
                公告
              </button>
              <button
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 ${
                  sidebarTab === 'settings' ? 'border-primary text-primary' : 'border-transparent'
                }`}
                onClick={() => setSidebarTab('settings')}
              >
                设置
              </button>
            </div>

            <div className="p-4">
              {/* 成员列表 */}
              {sidebarTab === 'members' && (
                <div className="space-y-2">
                  {isAdmin && (
                    <Button variant="outline" className="w-full mb-4 gap-2">
                      <UserPlus className="h-4 w-4" />
                      邀请成员
                    </Button>
                  )}

                  {loadingMembers ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    members.map((member) => (
                      <div
                        key={member.user_id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.user_avatar_url} />
                          <AvatarFallback className={getAvatarColor(member.user_nickname) + ' text-white'}>
                            {member.user_nickname[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {member.group_nickname || member.user_nickname}
                            </span>
                            {getRoleIcon(member.role)}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {getRoleName(member.role)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 公告列表 */}
              {sidebarTab === 'notices' && (
                <div className="space-y-4">
                  {notices.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">暂无公告</p>
                  ) : (
                    notices.map((notice) => (
                      <div
                        key={notice.id}
                        className={`p-4 rounded-lg border ${notice.is_pinned ? 'border-primary bg-primary/5' : 'bg-gray-50'}`}
                      >
                        {notice.is_pinned && (
                          <span className="text-xs text-primary font-medium">📌 置顶</span>
                        )}
                        <h4 className="font-medium mt-1">{notice.title}</h4>
                        <p className="text-sm text-muted-foreground mt-2">{notice.content}</p>
                        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                          <span>{notice.publisher_nickname}</span>
                          <span>·</span>
                          <span>{new Date(notice.published_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 群设置 */}
              {sidebarTab === 'settings' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-2">群信息</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">群名称</span>
                        <span>{currentGroup?.group_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">群ID</span>
                        <span className="text-xs font-mono">{currentGroup?.group_id?.slice(0, 8)}...</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">我的角色</span>
                        <span>{getRoleName(myMember?.role || 'member')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <Button variant="destructive" className="w-full gap-2" onClick={handleLeaveGroup}>
                      <LogOut className="h-4 w-4" />
                      退出群聊
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
