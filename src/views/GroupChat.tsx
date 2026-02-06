'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
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
  Shield,
  MessageCircle
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '../store/authStore'
import { groupMessagesApi, type GroupMessage } from '../api/groupMessages'
import { groupsApi, type GroupMember, type GroupNotice } from '../api/groups'
import { storageApi, type FileType } from '../api/storage'
import { useToast } from '../hooks/use-toast'
import { BackgroundOrbs } from '@/components/ui/glass'
import { MessageImage } from '@/components/chat/MessageImage'
import { MessageVideo } from '@/components/chat/MessageVideo'
import { FilePreview, type PreviewFile } from '@/components/ui/file-preview'

export default function GroupChat() {
  const router = useRouter()
  const { groupId } = useParams<{ groupId?: string }>()
  const { toast } = useToast()
  const { myGroups, loadMyGroups } = useGroupStore()
  const { user } = useAuthStore()

  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [inputMessage, setInputMessage] = useState('')
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [notices, setNotices] = useState<GroupNotice[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'members' | 'notices' | 'settings'>('members')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentGroup = groupId ? myGroups.find(g => g.group_id === groupId) : null
  const myMember = members.find(m => m.user_id === user?.user_id)
  const isAdmin = myMember?.role === 'owner' || myMember?.role === 'admin'

  useEffect(() => {
    loadMyGroups().catch(console.error)
  }, [loadMyGroups])

  useEffect(() => {
    if (groupId && currentGroup) {
      loadMessages()
      loadMembers()
      loadNotices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, currentGroup])

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
      toast({ title: '错误', description: '加载消息失败', variant: 'destructive' })
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
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
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
        filename: null,
        content_type: null,
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 100 * 1024 * 1024 * 1024) {
        toast({ title: '文件太大', description: '文件大小不能超过 100GB', variant: 'destructive' })
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
    if (mimeType.startsWith('image/')) return { type: 'group_image', messageType: 'image' }
    if (mimeType.startsWith('video/')) return { type: 'group_video', messageType: 'video' }
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
      const uploadResult = await storageApi.uploadFile(file, type, 'group_files', groupId, (progress) => {
        setUploadProgress(progress.percent)
      })

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
          filename: file.name,
          content_type: file.type,
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
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  }

  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-rose-400 to-pink-500', 'from-orange-400 to-amber-500', 'from-emerald-400 to-teal-500',
      'from-cyan-400 to-sky-500', 'from-blue-400 to-indigo-500', 'from-violet-400 to-purple-500',
      'from-fuchsia-400 to-pink-500', 'from-lime-400 to-green-500'
    ]
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % gradients.length
    return gradients[index]
  }

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown className="h-3.5 w-3.5 text-yellow-500" />
    if (role === 'admin') return <Shield className="h-3.5 w-3.5 text-blue-500" />
    return null
  }

  const getRoleName = (role: string) => {
    if (role === 'owner') return '群主'
    if (role === 'admin') return '管理员'
    return '成员'
  }

  /**
   * 从 file_url 中提取 UUID
   */
  const extractUuidFromUrl = (url: string): string | null => {
    const match = url.match(/\/(?:file|friends_file)\/([a-f0-9-]{36})(?:\/|$|\?)/i)
    return match ? match[1] : null
  }

  /**
   * 获取文件的预签名 URL
   */
  const getFilePresignedUrl = async (message: GroupMessage, operation: 'preview' | 'download' = 'preview'): Promise<string | null> => {
    const uuid = message.file_uuid || (message.file_url ? extractUuidFromUrl(message.file_url) : null)
    if (!uuid) return null
    
    try {
      return await storageApi.getPresignedUrl(uuid, operation)
    } catch (error) {
      console.error('获取预签名 URL 失败:', error)
      return null
    }
  }

  /**
   * 处理文件预览
   */
  const handleFilePreview = async (message: GroupMessage) => {
    const presignedUrl = await getFilePresignedUrl(message, 'preview')
    if (presignedUrl) {
      // GroupMessage 类型没有 filename 和 content_type，根据 message_type 推断
      const name = message.message_type === 'image' ? '图片' 
        : message.message_type === 'video' ? '视频'
        : message.message_type === 'file' ? '文件'
        : '未命名文件'
      const mimeType = message.message_type === 'image' ? 'image/*'
        : message.message_type === 'video' ? 'video/*'
        : 'application/octet-stream'
      
      setPreviewFile({
        url: presignedUrl,
        name,
        type: mimeType,
        size: message.file_size ?? undefined,
      })
    } else {
      toast({
        title: '预览失败',
        description: '无法获取文件预览链接',
        variant: 'destructive',
      })
    }
  }

  /**
   * 处理文件下载
   */
  const handleFileDownload = async (message: GroupMessage) => {
    const presignedUrl = await getFilePresignedUrl(message, 'download')
    if (presignedUrl) {
      window.open(presignedUrl, '_blank')
    } else {
      toast({
        title: '下载失败',
        description: '无法获取文件下载链接',
        variant: 'destructive',
      })
    }
  }

  const renderMessageContent = (message: GroupMessage) => {
    if (message.is_recalled) {
      return <p className="text-sm italic opacity-60">[消息已撤回]</p>
    }

    switch (message.message_type) {
      case 'text':
        return <p className="whitespace-pre-wrap break-words">{message.message_content}</p>
      case 'image':
        return (message.file_url || message.file_uuid) ? (
          <MessageImage
            fileUrl={message.file_url}
            fileUuid={message.file_uuid}
            isFriendMessage={false}
            className="max-w-xs rounded-xl"
            onClick={() => handleFilePreview(message)}
          />
        ) : (
          <div className="flex items-center gap-2 text-sm opacity-70">
            <ImageIcon className="h-4 w-4" />
            <span>[图片]</span>
          </div>
        )
      case 'video':
        return (message.file_url || message.file_uuid) ? (
          <MessageVideo
            fileUrl={message.file_url}
            fileUuid={message.file_uuid}
            className="max-w-xs rounded-xl"
          />
        ) : (
          <div className="flex items-center gap-2 text-sm opacity-70">
            <Video className="h-4 w-4" />
            <span>[视频]</span>
          </div>
        )
      case 'file':
        return (
          <div className="flex items-center gap-3 p-3 bg-white/30 backdrop-blur rounded-xl">
            <FileText className="h-8 w-8 text-blue-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{message.message_content || '文件'}</p>
              {message.file_size && (
                <p className="text-xs opacity-60">{formatFileSize(message.file_size)}</p>
              )}
            </div>
            {(message.file_url || message.file_uuid) && (
              <button
                className="p-2 rounded-lg hover:bg-white/50 transition-colors"
                onClick={() => handleFileDownload(message)}
              >
                <Download className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      case 'system':
        return <p className="text-sm text-center opacity-70">{message.message_content}</p>
      default:
        return <p className="text-sm">[不支持的消息类型]</p>
    }
  }

  // 空状态渲染
  if (!groupId || (!currentGroup && !loading)) {
    return (
      <div className="h-full flex flex-col relative overflow-hidden bg-gradient-to-br from-blue-100 via-blue-50 via-25% via-white via-50% via-purple-50 via-75% to-purple-100">
        <BackgroundOrbs count={3} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-[1] flex flex-col items-center justify-center text-center p-10 flex-1"
        >
          <div className="w-20 h-20 flex items-center justify-center rounded-3xl bg-gradient-to-br from-blue-200/30 to-blue-400/20 text-blue-500 mb-6">
            <Users size={32} />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">{groupId ? '群聊不存在' : '请选择一个群聊'}</h2>
          <p className="text-sm text-slate-500 mb-6">{groupId ? '该群聊可能已被解散或您已退出' : '从侧边栏选择一个群聊开始对话'}</p>
          <motion.button 
            className="flex items-center gap-2 px-6 py-3 rounded-[14px] bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium cursor-pointer border-none shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:-translate-y-0.5"
            onClick={() => router.push('/chat')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft size={16} />
            返回聊天
          </motion.button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden bg-gradient-to-br from-blue-100 via-blue-50 via-25% via-white via-50% via-purple-50 via-75% to-purple-100">
      <BackgroundOrbs count={3} />

      {/* 顶部导航 */}
      <header className="relative z-10 flex items-center justify-between px-5 py-3 shrink-0 bg-white/70 backdrop-blur-xl border-b border-blue-200/20">
        <div className="flex items-center gap-3">
          <motion.button 
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/50 border border-blue-200/20 text-slate-600 cursor-pointer transition-all hover:bg-white/90 hover:border-blue-500 hover:text-blue-500"
            onClick={() => router.push('/chat')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft size={20} />
          </motion.button>
          <Avatar className="h-10 w-10 ring-2 ring-white/50">
            <AvatarImage src={currentGroup?.group_avatar_url} />
            <AvatarFallback className={`bg-gradient-to-br ${getAvatarGradient(currentGroup?.group_name || 'G')} text-white`}>
              {currentGroup?.group_name?.[0]?.toUpperCase() || 'G'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-base font-semibold text-slate-800">{currentGroup?.group_name || '群聊'}</h1>
            <p className="text-xs text-slate-500">{members.length} 位成员</p>
          </div>
        </div>

        <div className="flex gap-2">
          <motion.button 
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/50 border border-blue-200/20 text-slate-600 cursor-pointer transition-all hover:bg-white/90 hover:border-blue-500 hover:text-blue-500"
            onClick={() => setShowSidebar(!showSidebar)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Users size={20} />
          </motion.button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button 
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/50 border border-blue-200/20 text-slate-600 cursor-pointer transition-all hover:bg-white/90 hover:border-blue-500 hover:text-blue-500"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <MoreVertical size={20} />
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={8}>
              <DropdownMenuItem onSelect={() => { setShowSidebar(true); setSidebarTab('settings') }}>
                <Settings size={16} />群设置
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setShowSidebar(true); setSidebarTab('notices') }}>
                <Bell size={16} />群公告
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={handleLeaveGroup}>
                <LogOut size={16} />退出群聊
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex overflow-hidden relative z-[1]">
        {/* 消息区域 */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4" onScroll={handleScroll}>
            {loading && messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">
                <MessageCircle size={32} className="opacity-40" />
                <p>暂无消息，开始聊天吧！</p>
              </div>
            ) : (
              <>
                {hasMore && (
                  <div className="text-center">
                    <button 
                      onClick={loadMoreMessages} 
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-white/60 border border-blue-200/30 text-slate-600 text-[13px] cursor-pointer transition-all hover:bg-white/90"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      加载更多
                    </button>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {messages.map((message) => {
                    const isOwn = message.sender_id === user?.user_id
                    const gradient = getAvatarGradient(message.sender_nickname)
                    const canRecall = canRecallMessage(message.send_time, message.sender_id)

                    if (message.message_type === 'system') {
                      return (
                        <motion.div
                          key={message.message_uuid}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center text-xs text-slate-500 bg-black/5 py-1.5 px-4 rounded-full self-center"
                        >
                          {message.message_content}
                        </motion.div>
                      )
                    }

                    return (
                      <motion.div
                        key={message.message_uuid}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className={`flex gap-2.5 max-w-[75%] ${isOwn ? 'flex-row-reverse ml-auto' : ''}`}
                      >
                        <Avatar className="w-9 h-9 shrink-0">
                          <AvatarImage src={message.sender_avatar_url} />
                          <AvatarFallback className={`bg-gradient-to-br ${gradient} text-white text-sm`}>
                            {message.sender_nickname[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className={`flex flex-col gap-1 ${isOwn ? 'items-end' : ''}`}>
                          {!isOwn && <span className="text-xs text-slate-500 px-2">{message.sender_nickname}</span>}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <div className={`py-3 px-4 rounded-2xl cursor-pointer transition-all text-sm ${
                                isOwn 
                                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-none shadow-lg shadow-blue-500/30'
                                  : 'bg-white/80 backdrop-blur-lg border border-blue-200/20 shadow-sm text-slate-800 hover:shadow-md hover:shadow-blue-500/10'
                              }`}>
                                {renderMessageContent(message)}
                              </div>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={5}>
                              {canRecall && !message.is_recalled && (
                                <DropdownMenuItem onSelect={() => handleRecallMessage(message.message_uuid)}>
                                  <RotateCcw size={14} />撤回
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={() => handleDeleteMessage(message.message_uuid)}>
                                <Trash2 size={14} />删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <span className="text-[11px] text-slate-400 px-2">{formatTime(message.send_time)}</span>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* 输入区域 */}
          <div className="px-5 py-4 shrink-0 bg-white/70 backdrop-blur-xl border-t border-blue-200/20">
            {selectedFile && (
              <div className="flex items-center gap-3 p-3 mb-3 bg-white/60 rounded-[14px] border border-blue-200/20">
                {selectedFile.type.startsWith('image/') ? <ImageIcon size={24} className="text-blue-500" /> :
                 selectedFile.type.startsWith('video/') ? <Video size={24} className="text-purple-500" /> :
                 <FileText size={24} className="text-gray-500" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button 
                  className="p-1.5 rounded-lg bg-transparent border-none cursor-pointer text-slate-500 hover:bg-black/5"
                  onClick={handleCancelFile} 
                  disabled={sending}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {uploadProgress !== null && (
              <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-blue-500/10 rounded-[10px] text-xs text-blue-500">
                <div className="h-1 bg-blue-500 rounded-sm transition-all" style={{ width: `${uploadProgress}%` }} />
                <span>{uploadProgress.toFixed(0)}%</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
              <motion.button 
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/50 border border-blue-200/20 text-slate-600 cursor-pointer transition-all hover:bg-white/90 hover:border-blue-500 hover:text-blue-500"
                onClick={() => fileInputRef.current?.click()} 
                disabled={sending}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Paperclip size={20} />
              </motion.button>
              <input
                type="text"
                className="flex-1 py-3 px-4 rounded-[14px] border border-blue-200/30 bg-white/60 text-sm text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white/90 placeholder:text-slate-400"
                placeholder="输入消息..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={sending}
              />
              <motion.button
                className="w-11 h-11 flex items-center justify-center rounded-[14px] bg-gradient-to-r from-blue-500 to-blue-600 text-white border-none cursor-pointer shadow-lg shadow-blue-500/30 transition-all hover:enabled:shadow-xl hover:enabled:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={selectedFile ? handleSendFile : sendMessage}
                disabled={(!inputMessage.trim() && !selectedFile) || sending}
                whileHover={{ scale: (!inputMessage.trim() && !selectedFile) || sending ? 1 : 1.02 }}
                whileTap={{ scale: (!inputMessage.trim() && !selectedFile) || sending ? 1 : 0.98 }}
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </motion.button>
            </div>
          </div>
        </div>

        {/* 右侧边栏 */}
        <AnimatePresence>
          {showSidebar && (
            <motion.aside
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              className="w-[300px] shrink-0 h-full overflow-hidden bg-white/70 backdrop-blur-xl border-l border-blue-200/20 flex flex-col max-md:absolute max-md:right-0 max-md:top-0 max-md:bottom-0 max-md:w-[280px] max-md:z-20"
            >
              <div className="flex border-b border-blue-200/20">
                {(['members', 'notices', 'settings'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`flex-1 py-3.5 text-[13px] font-medium bg-transparent border-none border-b-2 border-transparent cursor-pointer transition-all ${
                      sidebarTab === tab 
                        ? 'text-blue-500 border-b-blue-500' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                    onClick={() => setSidebarTab(tab)}
                  >
                    {tab === 'members' ? '成员' : tab === 'notices' ? '公告' : '设置'}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {sidebarTab === 'members' && (
                  <div className="flex flex-col gap-2">
                    {isAdmin && (
                      <button className="flex items-center justify-center gap-2 p-3 mb-3 rounded-xl border border-dashed border-blue-500/40 bg-blue-500/5 text-blue-500 text-sm cursor-pointer transition-all hover:bg-blue-500/10">
                        <UserPlus size={16} />邀请成员
                      </button>
                    )}
                    {loadingMembers ? (
                      <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
                    ) : (
                      members.map((member) => (
                        <div key={member.user_id} className="flex items-center gap-3 p-2.5 rounded-xl transition-all hover:bg-white/60">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={member.user_avatar_url} />
                            <AvatarFallback className={`bg-gradient-to-br ${getAvatarGradient(member.user_nickname)} text-white text-sm`}>
                              {member.user_nickname[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                              {member.group_nickname || member.user_nickname}
                              {getRoleIcon(member.role)}
                            </div>
                            <span className="text-xs text-slate-500">{getRoleName(member.role)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {sidebarTab === 'notices' && (
                  <div className="flex flex-col gap-3">
                    {notices.length === 0 ? (
                      <p className="text-center text-slate-500 py-10">暂无公告</p>
                    ) : (
                      notices.map((notice) => (
                        <div key={notice.id} className={`p-3.5 rounded-[14px] bg-white/50 border ${notice.is_pinned ? 'border-blue-500 bg-blue-500/5' : 'border-blue-200/20'}`}>
                          {notice.is_pinned && <span className="text-xs text-blue-500 font-medium">📌 置顶</span>}
                          <h4 className="text-sm font-semibold text-slate-800 my-1.5">{notice.title}</h4>
                          <p className="text-[13px] text-slate-600 leading-relaxed">{notice.content}</p>
                          <div className="flex gap-1.5 mt-2.5 text-xs text-slate-400">
                            <span>{notice.publisher_nickname}</span>
                            <span>·</span>
                            <span>{new Date(notice.published_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {sidebarTab === 'settings' && (
                  <div className="flex flex-col gap-5">
                    <div>
                      <h4 className="text-[13px] font-semibold text-slate-500 mb-3 uppercase">群信息</h4>
                      <div className="flex justify-between py-2.5 border-b border-blue-200/15 text-sm">
                        <span className="text-slate-500">群名称</span>
                        <span className="text-slate-800 font-medium">{currentGroup?.group_name}</span>
                      </div>
                      <div className="flex justify-between py-2.5 border-b border-blue-200/15 text-sm">
                        <span className="text-slate-500">群ID</span>
                        <span className="text-slate-800 font-medium font-mono text-xs">{currentGroup?.group_id?.slice(0, 8)}...</span>
                      </div>
                      <div className="flex justify-between py-2.5 border-b border-blue-200/15 text-sm">
                        <span className="text-slate-500">我的角色</span>
                        <span className="text-slate-800 font-medium">{getRoleName(myMember?.role || 'member')}</span>
                      </div>
                    </div>
                    <button 
                      className="flex items-center justify-center gap-2 py-3.5 rounded-[14px] bg-red-500/10 text-red-600 text-sm font-medium cursor-pointer border-none mt-auto transition-all hover:bg-red-500/20"
                      onClick={handleLeaveGroup}
                    >
                      <LogOut size={16} />退出群聊
                    </button>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

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
